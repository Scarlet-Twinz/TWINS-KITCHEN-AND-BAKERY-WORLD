import base64, hashlib, hmac, json, secrets, uuid, os, shutil, subprocess, zipfile, logging
from datetime import datetime, timedelta, timezone
from typing import Any
import bcrypt, psycopg
from fastapi import FastAPI, HTTPException, Request, Response, File, UploadFile, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, EmailStr, Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path
from media_center import inspect_image_bytes, extract_zip, normalize_metadata, sanitize_filename, SUPPORTED_IMAGE_EXTENSIONS, SUPPORTED_DOCUMENT_EXTENSIONS, MAX_ZIP_BYTES

class Settings(BaseSettings):
    database_url: str=""
    session_secret: str="change-me"
    frontend_origins: str="http://127.0.0.1:5500,http://localhost:5500,http://localhost:3000"
    port: int=8000
    cookie_secure: bool=False
    media_storage_root: str="../storage/media-intake"
    public_base_url: str=""
    paystack_secret_key: str=""
    marketplace_storage_root: str="../storage/marketplace"
    marketplace_max_image_bytes: int=10*1024*1024
    media_node_command: str="node"
    model_config=SettingsConfigDict(env_file=".env",extra="ignore")
settings=Settings()
logger=logging.getLogger("twins.media")
app=FastAPI(title="Twins Kitchen & Bakery World API",version="0.3.0")
origins=[x.strip() for x in settings.frontend_origins.split(",") if x.strip()]
app.add_middleware(CORSMiddleware,allow_origins=origins,allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?$",allow_credentials=True,allow_methods=["GET","POST","PATCH","DELETE","OPTIONS"],allow_headers=["Content-Type"])

def db():
    if not settings.database_url: raise HTTPException(status_code=503,detail="Database is not configured")
    return psycopg.connect(settings.database_url)
def sign_session(user_id:str,role:str)->str:
    payload={"sub":user_id,"role":role,"exp":int((datetime.now(timezone.utc)+timedelta(days=7)).timestamp())}
    raw=base64.urlsafe_b64encode(json.dumps(payload,separators=(",",":")).encode()).decode().rstrip("=")
    sig=hmac.new(settings.session_secret.encode(),raw.encode(),hashlib.sha256).hexdigest()
    return raw+"."+sig
def read_session(request:Request)->dict[str,Any]|None:
    token=request.cookies.get("twins_session")
    if not token or "." not in token:return None
    raw,sig=token.rsplit(".",1)
    if not hmac.compare_digest(sig,hmac.new(settings.session_secret.encode(),raw.encode(),hashlib.sha256).hexdigest()):return None
    try:
        data=json.loads(base64.urlsafe_b64decode((raw+"="*(-len(raw)%4)).encode()))
        return data if int(data.get("exp",0))>=int(datetime.now(timezone.utc).timestamp()) else None
    except Exception:return None
def require_session(request:Request):
    s=read_session(request)
    if not s:raise HTTPException(status_code=401,detail="Authentication required")
    return s

def require_admin(request:Request):
    s=require_session(request)
    if s.get("role") not in ("admin","staff","owner"):raise HTTPException(status_code=403,detail="Staff access required")
    return s

def require_owner(request:Request):
    s=require_session(request)
    if s.get("role") != "owner": raise HTTPException(status_code=403,detail="Owner access required")
    return s

def media_root():
    root=Path(settings.media_storage_root)
    root.mkdir(parents=True,exist_ok=True)
    for name in ("incoming","processed","rejected","duplicates","manifests"):
        (root/name).mkdir(parents=True,exist_ok=True)
    return root
def repository_root():
    root=Path(__file__).resolve().parent
    if (root/"tools"/"media-ingestion"/"index.js").is_file():
        return root
    parent=root.parent
    if (parent/"tools"/"media-ingestion"/"index.js").is_file():
        return parent
    return root


def catalogue_products():
    script="const {loadCatalogue}=require('./tools/media-ingestion/validator'); console.log(JSON.stringify(loadCatalogue().P));"
    try:
        result=subprocess.run([settings.media_node_command,"-e",script],cwd=repository_root(),text=True,capture_output=True,timeout=15,check=True)
        return json.loads(result.stdout.strip() or "[]")
    except Exception:
        raise HTTPException(status_code=503,detail="Catalogue validation service is unavailable")

def _suggestion_tokens(value):
    import re
    stop={"the","and","for","with","from","this","that","image","photo","commercial","machine","equipment"}
    return {x for x in re.findall(r"[a-z0-9]+",str(value or "").lower()) if len(x)>=3 and x not in stop}

def catalogue_suggestions(asset,products,max_results=5):
    evidence=" ".join(str(asset.get(k) or "") for k in ("filename","provenance","sourceUrl","license","attribution","role"))
    evidence_tokens=_suggestion_tokens(evidence)
    if not evidence_tokens:
        return []
    scored=[]
    for product in products:
        if not isinstance(product,dict) or product.get("id") is None or not product.get("n"):
            continue
        fields=[]
        for key,value in product.items():
            if key in {"i","media"}: continue
            if isinstance(value,(str,int,float)): fields.append(str(value))
            elif isinstance(value,list): fields.extend(str(x) for x in value if isinstance(x,(str,int,float)))
        product_tokens=_suggestion_tokens(" ".join(fields))
        overlap=evidence_tokens & product_tokens
        if not overlap: continue
        score=min(0.99,0.45+(0.12*len(overlap))+(0.08 if str(product.get("n","")).lower() in evidence.lower() else 0))
        band="HIGH" if score>=0.78 else "MEDIUM" if score>=0.60 else "LOW"
        category=product.get("category") or product.get("categoryName") or product.get("c") or product.get("tag") or ""
        scored.append((score,{"productId":str(product["id"]),"name":str(product["n"]),"category":str(category) if category else "","confidence":band,"score":round(score,3),"evidence":sorted(overlap)}))
    scored.sort(key=lambda x:(-x[0],x[1]["name"],x[1]["productId"]))
    return [x[1] for x in scored[:max_results]]

def catalogue_product(product_id):
    script="const {loadCatalogue}=require('./tools/media-ingestion/validator'); const p=loadCatalogue().P.find(x=>String(x.id)===String(process.argv[1])); console.log(JSON.stringify(p||null));"
    try:
        result=subprocess.run([settings.media_node_command,"-e",script,str(product_id)],cwd=Path(__file__).resolve().parent,text=True,capture_output=True,timeout=15,check=True)
        return json.loads(result.stdout.strip() or "null")
    except Exception:
        raise HTTPException(status_code=503,detail="Catalogue validation service is unavailable")

def audit_media_action(conn,actor,action,asset_id=None,metadata=None):
    conn.execute("insert into audit_logs (actor_user_id,action,entity_type,entity_id,metadata) values (%s,%s,'media_asset',%s,%s)",
                 (uuid.UUID(actor["sub"]),action,uuid.UUID(asset_id) if asset_id else None,json.dumps(metadata or {})))

def revalidation_report_paths(root:Path,asset_id:str):
    run_id=uuid.uuid4().hex
    return (root/"manifests"/f"{asset_id}.revalidate.{run_id}.json", root/"manifests"/f"{asset_id}.revalidate.{run_id}.report.json")

def run_asset_intake(batch_dir,manifest_path,report_path):
    repo_root=repository_root()
    intake_script=repo_root/"tools"/"media-ingestion"/"index.js"
    if not intake_script.is_file():
        raise HTTPException(status_code=500,detail="Asset-intake service is not installed in the backend image")
    batch_dir=Path(batch_dir).resolve()
    manifest_path=Path(manifest_path).resolve()
    report_path=Path(report_path).resolve()
    if not batch_dir.is_dir():
        raise HTTPException(status_code=422,detail=f"Asset-intake batch directory is missing: {batch_dir}")
    if not manifest_path.is_file():
        raise HTTPException(status_code=422,detail=f"Asset-intake manifest is missing: {manifest_path}")
    report_path.parent.mkdir(parents=True,exist_ok=True)
    command=[settings.media_node_command,str(intake_script),"asset-intake-dry-run","--assets",str(batch_dir),"--asset-manifest",str(manifest_path),"--report",str(report_path)]
    try:
        result=subprocess.run(command,cwd=repo_root,text=True,capture_output=True,timeout=120)
    except subprocess.TimeoutExpired as exc:
        details=(exc.stderr or exc.stdout or "").strip() if isinstance(exc.stderr,str) or isinstance(exc.stdout,str) else ""
        if not details:
            details="asset-intake exceeded the 120-second execution limit"
        raise HTTPException(status_code=422,detail=f"Asset-intake validation failed: {details}")
    except OSError as exc:
        raise HTTPException(status_code=500,detail=f"Unable to start asset-intake service: {exc}")
    if result.returncode != 0:
        details=""
        if report_path.exists():
            try:
                failed_report=json.loads(report_path.read_text(encoding="utf-8"))
                reasons=[str(item.get("reason","")).strip() for item in failed_report.get("results",[]) if item.get("reason")]
                if reasons: details="; ".join(dict.fromkeys(reasons))
            except Exception:
                pass
        if not details:
            details=(result.stderr or result.stdout or "").strip()
        message="Asset-intake validation failed"
        if details: message+=": "+details
        raise HTTPException(status_code=422,detail=message)
    if not report_path.is_file():
        details=(result.stderr or result.stdout or "").strip()
        message="Asset-intake completed without producing a report"
        if details: message+=f": {details}"
        raise HTTPException(status_code=500,detail=message)
    try:
        report=json.loads(report_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=500,detail=f"Asset-intake produced an invalid report: {exc}") from exc
    if not isinstance(report,dict):
        raise HTTPException(status_code=500,detail="Asset-intake produced an invalid report: report root must be an object")
    if not isinstance(report.get("results"),list):
        raise HTTPException(status_code=500,detail="Asset-intake produced an invalid report: report root must contain a results array")
    return report
def _candidate_tokens(value):
    import re
    stop={"the","and","for","with","from","this","that","image","photo","commercial","machine","equipment","new","product","img","dsc","pxl","screenshot","whatsapp"}
    return {x for x in re.findall(r"[a-z0-9]+",str(value or "").lower()) if len(x)>=3 and x not in stop}

def suggest_candidate_name(assets):
    evidence=[]
    meaningful=[]
    for asset in assets:
        filename=str(asset.get("filename","") or "")
        stem=os.path.splitext(os.path.basename(filename))[0]
        if stem and not __import__("re").fullmatch(r"(?:img|dsc|pxl|screenshot)[ _-]?\d{3,8}",stem.strip().lower()):
            meaningful.append(filename)
        evidence.extend([filename,asset.get("provenance",""),asset.get("sourceUrl",""),asset.get("license",""),asset.get("attribution","")])
    if not meaningful and not any(str(asset.get(k,"")).strip() for asset in assets for k in ("provenance","sourceUrl","license","attribution")):
        return "New Product — Review Required", None
    tokens=_candidate_tokens(" ".join(evidence))
    if not tokens:
        return "New Product — Review Required", None
    ordered=[]
    for value in evidence:
        for token in _candidate_tokens(value):
            if token not in ordered: ordered.append(token)
    if not ordered:
        return "New Product — Review Required", None
    # Only promote evidence already present in the supplied metadata/filename; never invent specs.
    words=[x.replace("-"," ").strip() for x in ordered[:6]]
    name=" ".join(words).strip()
    if len(name)<4:
        return "New Product — Review Required", None
    return name[:160], {"tokens":ordered[:6],"basis":"uploaded filename/provenance/license metadata"}

def group_candidate_assets(asset_rows):
    groups=[]
    for row in asset_rows:
        asset={"id":str(row[0]),"filename":row[1],"sha256":row[2],"width":row[3],"height":row[4],"provenance":row[5],"sourceUrl":row[6],"license":row[7],"attribution":row[8],"role":row[9]}
        stem=os.path.splitext(asset["filename"])[0].lower()
        tokens=_candidate_tokens(stem)
        view_tokens={"front","side","back","rear","control","controls","angle","left","right","top","bottom","detail","closeup","close"}
        core_tokens=tokens-view_tokens
        best=None
        for group in groups:
            overlap=core_tokens & group["tokens"]
            numeric_a={x for x in tokens if x.isdigit()}
            numeric_b={x for x in group["tokens"] if x.isdigit()}
            conflicting_numeric=bool(numeric_a and numeric_b and numeric_a.isdisjoint(numeric_b))
            if conflicting_numeric: continue
            same_shape=(asset["width"],asset["height"])==(group["width"],group["height"]) if asset["width"] and asset["height"] and group["width"] and group["height"] else False
            score=(len(overlap)/max(1,len(core_tokens|group["tokens"]))) + (0.25 if same_shape else 0)
            if score>=0.55 and (best is None or score>best[0]): best=(score,group)
        if best:
            score,group=best
            group["assetIds"].append(asset["id"]); group["tokens"] |= core_tokens
            group["confidence"]=min(group["confidence"],round(score,3))
        else:
            groups.append({"assetIds":[asset["id"]],"tokens":set(core_tokens),"width":asset["width"],"height":asset["height"],"confidence":0.55 if core_tokens else 0.30})
    return [{"assetIds":g["assetIds"],"confidence":round(g["confidence"],3),"reviewRequired":g["confidence"]<0.78 or len(g["assetIds"])==1} for g in groups]

def media_metadata_from_row(row):
    return {"id":str(row[0]),"productId":row[1],"filename":row[2],"storagePath":row[3],"sha256":row[4],"mimeType":row[5],"width":row[6],"height":row[7],"sourceType":row[8],"rightsStatus":row[9],"provenance":row[10],"sourceUrl":row[11],"license":row[12],"attribution":row[13],"role":row[14],"status":row[15],"batchId":str(row[16]),"createdAt":row[17].isoformat(),"verifiedAt":row[18].isoformat() if row[18] else None}

class AuthPayload(BaseModel):
    name:str|None=Field(default=None,min_length=2,max_length=120)
    email:EmailStr
    password:str=Field(min_length=8,max_length=128)
class QuoteItem(BaseModel):
    id:int
    name:str|None=None
    quantity:int=Field(ge=1,le=10000)
class MarketplaceListingPayload(BaseModel):
    title:str=Field(min_length=3,max_length=160)
    category:str=Field(min_length=2,max_length=80)
    description:str=Field(min_length=10,max_length=2000)
    priceMode:str=Field(default="on_request")
    price:float|None=Field(default=None,ge=0)
    location:str|None=None

class SellerPlanPayload(BaseModel):
    plan:str=Field(min_length=2,max_length=80)

class ProjectPlanPayload(BaseModel):
    business:str|None=None
    stage:str|None=None
    location:str|None=None
    capacity:str|None=None
    space:str|None=None
    utilities:str|None=None
    owned:str|None=None
    needs:str|None=None

class SellerProfilePayload(BaseModel):
    displayName:str=Field(min_length=2,max_length=120)
    phone:str|None=None
    location:str|None=None

class MarketplaceReportPayload(BaseModel):
    reason:str=Field(min_length=3,max_length=120)
    details:str|None=None

class QuotePayload(BaseModel):
    reference:str|None=None
    name:str=Field(min_length=2,max_length=120)
    email:EmailStr|None=None
    phone:str=Field(min_length=5,max_length=40)
    business:str|None=None
    stage:str|None=None
    location:str|None=None
    capacity:str|None=None
    space:str|None=None
    utilities:str|None=None
    requirements:str|None=None
    packageName:str|None=None
    items:list[QuoteItem]=Field(default_factory=list,max_length=100)
    itemCount:int=Field(default=0,ge=0,le=10000)

@app.post("/api/admin/media/upload",status_code=201)
async def media_upload(request:Request, files:list[UploadFile]|None=File(None), metadata:str=Form("{}"), clientBatchId:str|None=Form(None), chunkIndex:int|None=Form(None), totalChunks:int|None=Form(None)):
    actor=require_owner(request)
    if not files or len(files)>100: raise HTTPException(status_code=422,detail="Upload between 1 and 100 files")
    try: meta=normalize_metadata(json.loads(metadata or "{}"))
    except Exception as exc: raise HTTPException(status_code=422,detail=str(exc))
    batch_id=uuid.uuid4(); root=media_root(); batch=root/"incoming"/str(batch_id); batch.mkdir(parents=True,exist_ok=True)
    manifest=[]; uploaded=[]; duplicates=[]; documents=[]; failed=[]
    with db() as conn:
        for upload in files:
            original=upload.filename or "asset"; ext=Path(original).suffix.lower()
            try: data=await upload.read()
            except Exception as exc:
                failed.append({"filename":original,"reason":"unable to read upload: "+str(exc)}); continue
            if ext==".zip":
                if len(data)>MAX_ZIP_BYTES:
                    failed.append({"filename":original,"reason":"ZIP exceeds 250MB limit"}); continue
                try: extracted=extract_zip(data,batch)
                except Exception as exc:
                    failed.append({"filename":original,"reason":"ZIP extraction failed: "+str(exc)}); continue
                for item in extracted:
                    path=Path(item["path"]); content=path.read_bytes(); item_ext=path.suffix.lower()
                    if item_ext in SUPPORTED_DOCUMENT_EXTENSIONS:
                        doc_id=uuid.uuid4(); rel=str(path.relative_to(Path.cwd())).replace("\\","/")
                        conn.execute("insert into media_supporting_documents (id,batch_id,filename,storage_path,uploaded_by) values (%s,%s,%s,%s,%s)",(doc_id,batch_id,item["filename"],rel,uuid.UUID(actor["sub"])))
                        documents.append({"id":str(doc_id),"filename":item["filename"]}); continue
                    inspection=inspect_image_bytes(content,item_ext)
                    if not inspection.valid:
                        failed.append({"filename":item["filename"],"reason":inspection.reason}); path.unlink(missing_ok=True); continue
                    digest=hashlib.sha256(content).hexdigest()
                    existing=conn.execute("select id from media_assets where sha256=%s",(digest,)).fetchone()
                    if existing:
                        dup=root/"duplicates"/(uuid.uuid4().hex+"-"+sanitize_filename(item["filename"])); shutil.move(str(path),dup)
                        duplicates.append({"filename":item["filename"],"sha256":digest,"existingAssetId":str(existing[0])}); continue
                    asset_id=uuid.uuid4(); rel=str(path.relative_to(Path.cwd())).replace("\\","/")
                    conn.execute("""insert into media_assets
                    (id,product_legacy_id,filename,storage_path,sha256,mime_type,width,height,source_type,rights_status,provenance,source_url,license,attribution,role,status,batch_id,uploaded_by)
                    values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'QUEUED',%s,%s)""",
                    (asset_id,int(meta["productId"]) if meta["productId"] else None,item["filename"],rel,digest,inspection.mime_type,inspection.width,inspection.height,meta["sourceType"],meta["rightsStatus"],meta["provenance"],meta["sourceUrl"],meta["license"],meta["attribution"],meta["role"],batch_id,uuid.UUID(actor["sub"])))
                    manifest.append({"asset":path.name,"productId":meta["productId"],"rights":meta["rightsStatus"],"source":meta["sourceType"],"sourceUrl":meta["sourceUrl"],"license":meta["license"],"attribution":meta["attribution"],"role":meta["role"]}); uploaded.append({"id":str(asset_id),"filename":item["filename"],"asset":path.name,"sha256":digest})
                continue
            if ext in SUPPORTED_DOCUMENT_EXTENSIONS:
                target=root/"incoming"/(uuid.uuid4().hex+"-"+sanitize_filename(original)); target.write_bytes(data)
                doc_id=uuid.uuid4(); rel=str(target.relative_to(Path.cwd())).replace("\\","/")
                conn.execute("insert into media_supporting_documents (id,batch_id,filename,storage_path,uploaded_by) values (%s,%s,%s,%s,%s)",(doc_id,batch_id,original,rel,uuid.UUID(actor["sub"])))
                documents.append({"id":str(doc_id),"filename":original}); continue
            if ext not in SUPPORTED_IMAGE_EXTENSIONS:
                failed.append({"filename":original,"reason":"unsupported file type"}); continue
            inspection=inspect_image_bytes(data,ext)
            if not inspection.valid:
                failed.append({"filename":original,"reason":inspection.reason}); continue
            digest=hashlib.sha256(data).hexdigest()
            existing=conn.execute("select id from media_assets where sha256=%s",(digest,)).fetchone()
            if existing:
                target=root/"duplicates"/(uuid.uuid4().hex+"-"+sanitize_filename(original)); target.write_bytes(data)
                duplicates.append({"filename":original,"sha256":digest,"existingAssetId":str(existing[0])}); continue
            target=batch/(uuid.uuid4().hex+"-"+sanitize_filename(original)); target.write_bytes(data)
            asset_id=uuid.uuid4(); rel=str(target.relative_to(Path.cwd())).replace("\\","/")
            conn.execute("""insert into media_assets
            (id,product_legacy_id,filename,storage_path,sha256,mime_type,width,height,source_type,rights_status,provenance,source_url,license,attribution,role,status,batch_id,uploaded_by)
            values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'QUEUED',%s,%s)""",
            (asset_id,int(meta["productId"]) if meta["productId"] else None,original,rel,digest,inspection.mime_type,inspection.width,inspection.height,meta["sourceType"],meta["rightsStatus"],meta["provenance"],meta["sourceUrl"],meta["license"],meta["attribution"],meta["role"],batch_id,uuid.UUID(actor["sub"])))
            manifest.append({"asset":target.name,"productId":meta["productId"],"rights":meta["rightsStatus"],"source":meta["sourceType"],"sourceUrl":meta["sourceUrl"],"license":meta["license"],"attribution":meta["attribution"],"role":meta["role"]}); uploaded.append({"id":str(asset_id),"filename":original,"asset":target.name,"sha256":digest})
        conn.commit()
    manifest_path=root/"manifests"/f"{batch_id}.json"; report_path=root/"manifests"/f"{batch_id}.report.json"
    manifest_path.write_text(json.dumps({"schemaVersion":1,"assets":manifest},indent=2),encoding="utf-8")
    report=run_asset_intake(batch,manifest_path,report_path) if manifest else {"results":[],"counts":{}}
    with db() as conn:
        for result in report.get("results",[]):
            item=next((x for x in uploaded if x["asset"]==result.get("asset")),None)
            if not item: continue
            status=result.get("state","REVIEW")
            if status=="REJECTED" and "product already has an existing media mapping" in str(result.get("reason","")): status="REVIEW"
            conn.execute("update media_assets set product_legacy_id=%s,status=%s,updated_at=now() where id=%s",(int(result["productId"]) if result.get("productId") else None,status,uuid.UUID(item["id"])))
        conn.commit()
    return {"batchId":str(batch_id),"clientBatchId":clientBatchId,"chunkIndex":chunkIndex,"totalChunks":totalChunks,"uploaded":uploaded,"duplicates":duplicates,"failed":failed,"supportingDocuments":documents,"validation":report.get("counts",{}),"results":report.get("results",[])}

@app.get("/api/admin/media/{asset_id}/file")
def media_file(asset_id:str,request:Request):
    require_owner(request)
    try:
        asset_uuid=uuid.UUID(asset_id)
    except ValueError:
        raise HTTPException(status_code=422,detail="Invalid media asset ID")
    root=media_root().resolve()
    with db() as conn:
        row=conn.execute("select storage_path,mime_type,filename from media_assets where id=%s",(asset_uuid,)).fetchone()
    if not row:
        raise HTTPException(status_code=404,detail="Media asset not found")
    if row[1] not in {"image/jpeg","image/png","image/webp"}:
        raise HTTPException(status_code=404,detail="Media asset is not an image")
    path=Path(row[0])
    if not path.is_absolute():
        path=Path.cwd()/path
    path=path.resolve()
    try:
        path.relative_to(root)
    except ValueError:
        raise HTTPException(status_code=403,detail="Media asset is outside the protected storage root")
    if not path.is_file():
        raise HTTPException(status_code=404,detail="Stored media asset is missing")
    return FileResponse(path,media_type=row[1])

@app.delete("/api/admin/media/queue")
def media_delete_queue(request:Request):
    actor=require_owner(request)
    root=media_root().resolve()
    with db() as conn:
        rows=conn.execute("""select ma.id,ma.storage_path,ma.filename
        from media_assets ma
        where ma.status <> 'APPROVED'
        and not exists (select 1 from media_production_mappings m where m.asset_id=ma.id)
        for update""").fetchall()
        protected_row=conn.execute("""select count(*)
        from media_assets ma
        where (ma.status='APPROVED' or exists (select 1 from media_production_mappings m where m.asset_id=ma.id))""").fetchone()
        protected_count=int(protected_row[0] if protected_row else 0)
        if not rows:
            return {"ok":True,"status":"DELETED","deletedCount":0,"protectedCount":protected_count,"queueRemaining":protected_count}
        staged=[]
        try:
            for asset_id,storage_path,filename in rows:
                path=Path(storage_path)
                if not path.is_absolute():
                    path=Path.cwd()/path
                path=path.resolve()
                try:
                    path.relative_to(root)
                except ValueError:
                    raise HTTPException(status_code=403,detail="Media asset is outside the protected storage root: "+str(filename))
                if not path.is_file():
                    raise HTTPException(status_code=404,detail="Stored media asset is missing: "+str(filename))
                trash=root/"rejected"/(".delete-queue-"+uuid.uuid4().hex+"-"+sanitize_filename(filename))
                trash.parent.mkdir(parents=True,exist_ok=True)
                shutil.move(str(path),str(trash))
                staged.append((asset_id,path,trash,filename))
            ids=[item[0] for item in staged]
            deleted=conn.execute("delete from media_assets where id = any(%s) and status <> 'APPROVED' and not exists (select 1 from media_production_mappings m where m.asset_id=media_assets.id)",(ids,))
            if deleted.rowcount!=len(ids):
                raise HTTPException(status_code=409,detail="Queue changed while Delete All was running; no queued assets were removed.")
            for asset_id,_,_,filename in staged:
                audit_media_action(conn,actor,"MEDIA_DELETED",str(asset_id),{"filename":filename,"status":"QUEUED","bulk":True})
            conn.commit()
        except Exception:
            for _,path,trash,_ in reversed(staged):
                if trash.exists() and not path.exists():
                    shutil.move(str(trash),str(path))
            raise
    for _,_,trash,_ in staged:
        trash.unlink(missing_ok=True)
    return {"ok":True,"status":"DELETED","deletedCount":len(staged),"protectedCount":protected_count,"queueRemaining":protected_count}

@app.delete("/api/admin/media/{asset_id}")
def media_delete(asset_id:str,request:Request):
    actor=require_owner(request)
    try:
        asset_uuid=uuid.UUID(asset_id)
    except ValueError:
        raise HTTPException(status_code=422,detail="Invalid media asset ID")
    root=media_root().resolve()
    with db() as conn:
        row=conn.execute("select id,storage_path,filename,status from media_assets where id=%s",(asset_uuid,)).fetchone()
        if not row:
            raise HTTPException(status_code=404,detail="Media asset not found")
        mapping=conn.execute("select id from media_production_mappings where asset_id=%s",(asset_uuid,)).fetchone()
        if row[3]=="APPROVED" or mapping:
            raise HTTPException(status_code=409,detail="Approved or protected media assets cannot be deleted")
        path=Path(row[1])
        if not path.is_absolute():
            path=Path.cwd()/path
        path=path.resolve()
        try:
            path.relative_to(root)
        except ValueError:
            raise HTTPException(status_code=403,detail="Media asset is outside the protected storage root")
        if not path.is_file():
            raise HTTPException(status_code=404,detail="Stored media asset is missing")
        trash=root/"rejected"/(".delete-"+uuid.uuid4().hex+"-"+sanitize_filename(row[2]))
        trash.parent.mkdir(parents=True,exist_ok=True)
        shutil.move(str(path),str(trash))
        try:
            deleted=conn.execute("delete from media_assets where id=%s",(asset_uuid,))
            if deleted.rowcount!=1:
                raise HTTPException(status_code=404,detail="Media asset not found")
            audit_media_action(conn,actor,"MEDIA_DELETED",asset_id,{"filename":row[2],"status":row[3]})
            conn.commit()
        except Exception:
            if trash.exists() and not path.exists():
                shutil.move(str(trash),str(path))
            raise
    trash.unlink(missing_ok=True)
    return {"ok":True,"status":"DELETED","assetId":asset_id}

@app.get("/api/admin/media/candidates")
def media_candidate_list(request:Request,status:str|None=None):
    require_owner(request)
    with db() as conn:
        rows=conn.execute("""select id,suggested_name,category,source_asset_ids,evidence,status,created_at,updated_at
        from media_product_candidates where (%s::text is null or status=%s) order by created_at desc limit 200""",(status,status)).fetchall()
    return {"candidates":[{"id":str(r[0]),"suggestedName":r[1],"category":r[2],"assetIds":r[3],"evidence":r[4],"status":r[5],"createdAt":r[6].isoformat(),"updatedAt":r[7].isoformat()} for r in rows]}

@app.post("/api/admin/media/candidates",status_code=201)
def media_candidate_create(request:Request,payload:dict):
    actor=require_owner(request)
    asset_ids=payload.get("assetIds") or []
    if not isinstance(asset_ids,list) or not asset_ids:
        raise HTTPException(status_code=422,detail="At least one media asset is required")
    try: asset_uuids=[uuid.UUID(str(x)) for x in asset_ids]
    except ValueError: raise HTTPException(status_code=422,detail="Invalid media asset ID")
    with db() as conn:
        rows=conn.execute("""select id,filename,sha256,width,height,provenance,source_url,license,attribution,role,product_legacy_id,status,smolvlm_result
        from media_assets where id = any(%s) order by created_at""",(asset_uuids,)).fetchall()
        if len(rows)!=len(asset_uuids): raise HTTPException(status_code=404,detail="One or more media assets were not found")
        # A single new-photo signal may represent several views of the same physical product.
        # Expand only when deterministic local metadata gives a sufficiently strong group.
        if len(rows)==1:
            pool=conn.execute("""select id,filename,sha256,width,height,provenance,source_url,license,attribution,role,product_legacy_id,status,smolvlm_result
              from media_assets where product_legacy_id is null and status in ('QUEUED','REVIEW','VERIFIED') order by created_at""").fetchall()
            groups=group_candidate_assets(pool)
            selected=str(asset_uuids[0])
            group=next((g for g in groups if selected in g["assetIds"] and not g["reviewRequired"]),None)
            if group and len(group["assetIds"])>1:
                asset_uuids=[uuid.UUID(x) for x in group["assetIds"]]
                rows=conn.execute("""select id,filename,sha256,width,height,provenance,source_url,license,attribution,role,product_legacy_id,status,smolvlm_result
                  from media_assets where id = any(%s) order by created_at""",(asset_uuids,)).fetchall()
        if any(r[10] is not None for r in rows): raise HTTPException(status_code=409,detail="Candidate assets cannot already be assigned to a canonical product")
        if any(r[11] in ("APPROVED","REJECTED","DUPLICATE") for r in rows): raise HTTPException(status_code=409,detail="Candidate contains an ineligible media asset")
        existing=conn.execute("""select id from media_product_candidates
          where status in ('PENDING_OWNER','CREATED') and source_asset_ids ?| %s limit 1""",([str(x) for x in asset_uuids],)).fetchone()
        if existing: raise HTTPException(status_code=409,detail="One or more assets already belong to an active product candidate")
        assets=[{"filename":r[1],"provenance":r[5],"sourceUrl":r[6],"license":r[7],"attribution":r[8]} for r in rows]
        suggested,evidence=suggest_candidate_name(assets)
        ai_result={}
        for row in rows:
            stored=row[12] if len(row)>12 else None
            if isinstance(stored,dict): ai_result=dict(stored); break
        if not ai_result and isinstance(payload.get("openWorldResult"),dict):
            ai_result=dict(payload.get("openWorldResult"))
        ai_name=str((ai_result.get("ownerCorrection") or {}).get("productName") or ai_result.get("productName") or "").strip()
        ai_category=str(ai_result.get("category") or "").strip()
        if ai_name and ai_name.lower()!="new product — review required": suggested=ai_name
        candidate_id=uuid.uuid4()
        evidence_payload=dict(evidence or {"basis":"insufficient evidence"})
        evidence_payload["assetCount"]=len(rows)
        evidence_payload["grouping"]="owner-review" if len(rows)>1 else "single-asset"
        if ai_result: evidence_payload["aiResult"]=ai_result
        conn.execute("""insert into media_product_candidates
          (id,suggested_name,category,source_asset_ids,evidence,status) values (%s,%s,%s,%s,%s,'PENDING_OWNER')""",
          (candidate_id,suggested,ai_category or None,json.dumps([str(x) for x in asset_uuids]),json.dumps(evidence_payload)))
        audit_media_action(conn,actor,"MEDIA_PRODUCT_CANDIDATE_CREATED",str(candidate_id),{"assetIds":[str(x) for x in asset_uuids],"suggestedName":suggested,"aiResult":ai_result or {}})
        conn.commit()
    return {"candidate":{"id":str(candidate_id),"suggestedName":suggested,"assetIds":[str(x) for x in asset_uuids],"status":"PENDING_OWNER","evidence":evidence_payload}}

@app.patch("/api/admin/media/candidates/{candidate_id}")
def media_candidate_update(candidate_id:str,request:Request,payload:dict):
    actor=require_owner(request)
    name=str(payload.get("name") or "").strip()
    if not name or len(name)>160: raise HTTPException(status_code=422,detail="Candidate name must be 1–160 characters")
    try: cid=uuid.UUID(candidate_id)
    except ValueError: raise HTTPException(status_code=422,detail="Invalid candidate ID")
    with db() as conn:
        row=conn.execute("select id,status from media_product_candidates where id=%s for update",(cid,)).fetchone()
        if not row: raise HTTPException(status_code=404,detail="Product candidate not found")
        if row[1]!="PENDING_OWNER": raise HTTPException(status_code=409,detail="Candidate is no longer editable")
        conn.execute("update media_product_candidates set suggested_name=%s,updated_at=now() where id=%s",(name,cid))
        audit_media_action(conn,actor,"MEDIA_PRODUCT_CANDIDATE_UPDATED",str(cid),{"name":name}); conn.commit()
    return {"ok":True,"status":"PENDING_OWNER","candidateId":candidate_id,"suggestedName":name}

@app.post("/api/admin/media/candidates/{candidate_id}/approve")
def media_candidate_approve(candidate_id:str,request:Request,payload:dict|None=None):
    actor=require_owner(request)
    name=str((payload or {}).get("name") or "").strip()
    try: cid=uuid.UUID(candidate_id)
    except ValueError: raise HTTPException(status_code=422,detail="Invalid candidate ID")
    with db() as conn:
        row=conn.execute("""select id,suggested_name,source_asset_ids,evidence,status from media_product_candidates where id=%s for update""",(cid,)).fetchone()
        if not row: raise HTTPException(status_code=404,detail="Product candidate not found")
        if row[4]!="PENDING_OWNER": raise HTTPException(status_code=409,detail="Candidate is no longer awaiting owner approval")
        final_name=name or str(row[1] or "").strip()
        if not final_name or final_name=="New Product — Review Required":
            raise HTTPException(status_code=422,detail="A product name is required when evidence is insufficient")
        asset_ids=row[2] if isinstance(row[2],list) else []
        try: asset_uuids=[uuid.UUID(str(x)) for x in asset_ids]
        except ValueError: raise HTTPException(status_code=422,detail="Candidate contains invalid asset IDs")
        assets=conn.execute("""select id,sha256,product_legacy_id,status,role,source_type,rights_status from media_assets
          where id = any(%s) for update""",(asset_uuids,)).fetchall()
        if len(assets)!=len(asset_uuids): raise HTTPException(status_code=409,detail="Candidate media is incomplete")
        if any(a[2] is not None for a in assets): raise HTTPException(status_code=409,detail="Candidate now corresponds to an existing product; review required")
        if any(a[3] in ("APPROVED","REJECTED","DUPLICATE") for a in assets): raise HTTPException(status_code=409,detail="Candidate contains media that cannot be approved")
        allowed_rights={"owned","supplier-authorized","licensed","public-domain","cc0"}
        if any(a[5] not in allowed_rights or a[6] not in allowed_rights for a in assets): raise HTTPException(status_code=422,detail="All candidate media must have authorized provenance and rights before approval")
        duplicate=conn.execute("""select p.legacy_catalogue_id,p.name from products p
          where lower(p.name)=lower(%s) and p.active=true limit 1""",(final_name,)).fetchone()
        if duplicate: raise HTTPException(status_code=409,detail=f"Possible duplicate existing product: {duplicate[0]} · {duplicate[1]}")
        max_row=conn.execute("select coalesce(max(legacy_catalogue_id),0) from products").fetchone()
        next_id=max(530,int(max_row[0] or 0))+1
        slug_base="".join(ch.lower() if ch.isalnum() else "-" for ch in final_name).strip("-") or f"product-{next_id}"
        slug=slug_base
        suffix=1
        while conn.execute("select 1 from products where slug=%s",(slug,)).fetchone():
            suffix+=1; slug=f"{slug_base}-{suffix}"
        product_id=uuid.uuid4()
        description=(row[3] or {}).get("description") if isinstance(row[3],dict) else None
        conn.execute("""insert into products
          (id,legacy_catalogue_id,name,slug,description,tag,price_mode,active)
          values (%s,%s,%s,%s,%s,%s,'quote',true)""",(product_id,next_id,final_name,slug,description,None))
        for asset in assets:
            mapping_id=uuid.uuid4()
            conn.execute("""update media_assets set product_legacy_id=%s,status='APPROVED',verified_at=coalesce(verified_at,now()),verified_by=coalesce(verified_by,%s),approved_at=now(),approved_by=%s,updated_at=now()
              where id=%s""",(next_id,uuid.UUID(actor["sub"]),uuid.UUID(actor["sub"]),asset[0]))
            conn.execute("""insert into media_production_mappings (id,asset_id,product_legacy_id,role,published,created_by) values (%s,%s,%s,%s,false,%s)""",(mapping_id,asset[0],next_id,asset[4],uuid.UUID(actor["sub"])))
        conn.execute("update media_product_candidates set suggested_name=%s,status='CREATED',updated_at=now() where id=%s",(final_name,cid))
        audit_media_action(conn,actor,"MEDIA_PRODUCT_CREATED",str(cid),{"productId":next_id,"candidateId":str(cid),"assetIds":[str(x) for x in asset_uuids],"name":final_name})
        conn.commit()
    return {"ok":True,"status":"CREATED","product":{"id":next_id,"name":final_name},"candidateId":candidate_id}

@app.post("/api/admin/media/candidates/{candidate_id}/reject")
def media_candidate_reject(candidate_id:str,request:Request):
    actor=require_owner(request)
    try: cid=uuid.UUID(candidate_id)
    except ValueError: raise HTTPException(status_code=422,detail="Invalid candidate ID")
    with db() as conn:
        row=conn.execute("select id,status from media_product_candidates where id=%s for update",(cid,)).fetchone()
        if not row: raise HTTPException(status_code=404,detail="Product candidate not found")
        if row[1]!="PENDING_OWNER": raise HTTPException(status_code=409,detail="Candidate is no longer pending")
        conn.execute("update media_product_candidates set status='REJECTED',updated_at=now() where id=%s",(cid,))
        audit_media_action(conn,actor,"MEDIA_PRODUCT_CANDIDATE_REJECTED",str(cid)); conn.commit()
    return {"ok":True,"status":"REJECTED","candidateId":candidate_id}

@app.post("/api/admin/media/candidates/{candidate_id}/keep-pending")
def media_candidate_keep_pending(candidate_id:str,request:Request):
    actor=require_owner(request)
    try: cid=uuid.UUID(candidate_id)
    except ValueError: raise HTTPException(status_code=422,detail="Invalid candidate ID")
    with db() as conn:
        row=conn.execute("select id,status from media_product_candidates where id=%s",(cid,)).fetchone()
        if not row: raise HTTPException(status_code=404,detail="Product candidate not found")
        if row[1]!="PENDING_OWNER": raise HTTPException(status_code=409,detail="Candidate is no longer pending")
        audit_media_action(conn,actor,"MEDIA_PRODUCT_CANDIDATE_KEPT_PENDING",str(cid)); conn.commit()
    return {"ok":True,"status":"PENDING_OWNER","candidateId":candidate_id}

@app.get("/api/admin/media")
def media_list(request:Request,status:str|None=None,q:str|None=None):
    require_owner(request)
    with db() as conn:
        rows=conn.execute("""select id,product_legacy_id,filename,storage_path,sha256,mime_type,width,height,source_type,rights_status,provenance,source_url,license,attribution,role,status,batch_id,created_at,verified_at,
        smolvlm_result,smolvlm_result_version,smolvlm_inference_at,smolvlm_inference_ms,smolvlm_owner_override,smolvlm_owner_decision,smolvlm_owner_decided_at,smolvlm_owner_decided_by,
        visual_match_result,visual_match_result_version,visual_match_inference_at
        from media_assets where (nullif(%s,'')::text is null or status=%s) and (nullif(%s,'')::text is null or lower(filename) like lower(%s) or cast(product_legacy_id as text)=%s)
        order by created_at desc limit 500""",(status,status,q,"%"+q+"%" if q else None,q)).fetchall()
    try:
        products=catalogue_products()
    except HTTPException as exc:
        if exc.status_code != 503:
            raise
        products=[]
    assets=[]
    for row in rows:
        item=media_metadata_from_row(row)
        if row[19] is not None:
            smol=dict(row[19]) if isinstance(row[19],dict) else json.loads(row[19])
            owner=dict(row[23]) if isinstance(row[23],dict) else (json.loads(row[23]) if row[23] else None)
            if owner:
                smol["ownerCorrection"]=owner
            smol["ownerDecision"]=row[24]
            smol["ownerDecisionAt"]=row[25].isoformat() if row[25] else None
            smol["ownerDecisionBy"]=str(row[26]) if row[26] else None
            smol["resultVersion"]=row[20]
            smol["inferenceAt"]=row[21].isoformat() if row[21] else None
            smol["inferenceMs"]=row[22]
            item["smolvlmResult"]=smol
        if row[26] is not None:
            visual=dict(row[27]) if isinstance(row[27],dict) else json.loads(row[27])
            visual["resultVersion"]=row[28]
            visual["inferenceAt"]=row[29].isoformat() if row[29] else None
            item["visualMatchResult"]=visual
            item["suggestions"]=visual.get("suggestions",[])
        else:
            item["suggestions"]=[] if item["productId"] else catalogue_suggestions(item,products)
        assets.append(item)
    return {"assets":assets}

@app.post("/api/admin/media/{asset_id}/ai-result")
def media_ai_result_save(asset_id:str,request:Request,payload:dict):
    actor=require_owner(request)
    kind=str(payload.get("kind") or "").strip().lower()
    result=payload.get("result")
    if kind not in {"smolvlm","visual"} or not isinstance(result,dict):
        raise HTTPException(status_code=422,detail="AI result kind and result are required")
    try: asset_uuid=uuid.UUID(asset_id)
    except ValueError: raise HTTPException(status_code=422,detail="Invalid media asset ID")
    version=str(payload.get("resultVersion") or ("smolvlm-v1" if kind=="smolvlm" else "visual-v1"))
    now=datetime.now(timezone.utc)
    with db() as conn:
        if not conn.execute("select id from media_assets where id=%s",(asset_uuid,)).fetchone():
            raise HTTPException(status_code=404,detail="Media asset not found")
        if kind=="smolvlm":
            inference_ms=int(result.get("inferenceMs") or 0)
            conn.execute("""update media_assets set smolvlm_result=%s,smolvlm_result_version=%s,
                smolvlm_inference_at=%s,smolvlm_inference_ms=%s,updated_at=now() where id=%s""",
                (json.dumps(result),version,now,inference_ms,asset_uuid))
        else:
            conn.execute("""update media_assets set visual_match_result=%s,visual_match_result_version=%s,
                visual_match_inference_at=%s,updated_at=now() where id=%s""",
                (json.dumps(result),version,now,asset_uuid))
        audit_media_action(conn,actor,"MEDIA_AI_RESULT_PERSISTED",asset_id,{"kind":kind,"resultVersion":version,"inferenceMs":result.get("inferenceMs")})
        conn.commit()
    return {"ok":True,"kind":kind,"resultVersion":version,"persistedAt":now.isoformat()}

@app.delete("/api/admin/media/{asset_id}/ai-results")
def media_ai_results_clear(asset_id:str,request:Request):
    actor=require_owner(request)
    try: asset_uuid=uuid.UUID(asset_id)
    except ValueError: raise HTTPException(status_code=422,detail="Invalid media asset ID")
    with db() as conn:
        if not conn.execute("select id from media_assets where id=%s",(asset_uuid,)).fetchone():
            raise HTTPException(status_code=404,detail="Media asset not found")
        conn.execute("""update media_assets set smolvlm_result=null,smolvlm_result_version=null,
            smolvlm_inference_at=null,smolvlm_inference_ms=null,smolvlm_owner_override=null,smolvlm_owner_decision=null,
            smolvlm_owner_decided_at=null,smolvlm_owner_decided_by=null,
            visual_match_result=null,visual_match_result_version=null,visual_match_inference_at=null,
            updated_at=now() where id=%s""",(asset_uuid,))
        audit_media_action(conn,actor,"MEDIA_AI_RESULTS_CLEARED",asset_id,{})
        conn.commit()
    return {"ok":True,"assetId":asset_id}

@app.patch("/api/admin/media/{asset_id}/open-world-decision")
def media_open_world_decision(asset_id:str,request:Request,payload:dict):
    actor=require_owner(request)
    decision=str(payload.get("decision") or "").strip().upper()
    allowed={"ACCEPTED_IDENTIFICATION","OWNER_CORRECTED","CREATE_CANDIDATE","KEEP_UNRESOLVED"}
    if decision not in allowed: raise HTTPException(status_code=422,detail="Unsupported open-world owner decision")
    try: asset_uuid=uuid.UUID(asset_id)
    except ValueError: raise HTTPException(status_code=422,detail="Invalid media asset ID")
    with db() as conn:
        row=conn.execute("select id,product_legacy_id,filename from media_assets where id=%s",(asset_uuid,)).fetchone()
        if not row: raise HTTPException(status_code=404,detail="Media asset not found")
        owner_correction=payload.get("ownerCorrection") if isinstance(payload.get("ownerCorrection"),dict) else None
        conn.execute("""update media_assets set smolvlm_owner_override=%s,smolvlm_owner_decided_at=%s,smolvlm_owner_decided_by=%s,updated_at=now() where id=%s""",
                     (json.dumps(owner_correction) if owner_correction else None,decision,datetime.now(timezone.utc),uuid.UUID(actor["sub"]),asset_uuid))
        audit_media_action(conn,actor,"MEDIA_OPEN_WORLD_DECISION",asset_id,{"decision":decision,"aiResult":payload.get("aiResult") or {},"ownerCorrection":owner_correction,"timestamp":datetime.now(timezone.utc).isoformat()})
        conn.commit()
    return {"ok":True,"status":decision,"assetId":asset_id}

@app.patch("/api/admin/media/{asset_id}")
def media_update(asset_id:str,request:Request,payload:dict):
    actor=require_owner(request)
    try: meta=normalize_metadata(payload)
    except Exception as exc: raise HTTPException(status_code=422,detail=str(exc))
    if meta["productId"] and not catalogue_product(meta["productId"]): raise HTTPException(status_code=422,detail="Product ID does not exist in canonical catalogue")
    if meta["role"] not in {"primary","front","side","rear","detail","control-panel","installed","contextual"}: raise HTTPException(status_code=422,detail="Unsupported media role")
    with db() as conn:
        if not conn.execute("select id from media_assets where id=%s",(uuid.UUID(asset_id),)).fetchone(): raise HTTPException(status_code=404,detail="Media asset not found")
        conn.execute("""update media_assets set product_legacy_id=%s,source_type=%s,rights_status=%s,provenance=%s,source_url=%s,license=%s,attribution=%s,role=%s,status='REVIEW',updated_at=now() where id=%s""",
        (int(meta["productId"]) if meta["productId"] else None,meta["sourceType"],meta["rightsStatus"],meta["provenance"],meta["sourceUrl"],meta["license"],meta["attribution"],meta["role"],uuid.UUID(asset_id)))
        audit_media_action(conn,actor,"MEDIA_METADATA_UPDATED",asset_id,payload); conn.commit()
    return {"ok":True,"status":"REVIEW"}

@app.post("/api/admin/media/{asset_id}/revalidate")
def media_revalidate(asset_id:str,request:Request):
    actor=require_owner(request)
    stage="validate asset ID"
    try:
        asset_uuid=uuid.UUID(asset_id)
        stage="load media asset"
        root=media_root()
        (root/"manifests").mkdir(parents=True,exist_ok=True)
        with db() as conn:
            row=conn.execute("""select id,product_legacy_id,filename,storage_path,source_type,rights_status,provenance,source_url,license,attribution,role,batch_id
            from media_assets where id=%s""",(asset_uuid,)).fetchone()
        if not row: raise HTTPException(status_code=404,detail="Media asset not found")

        stage="resolve stored asset"
        asset_path=Path(row[3])
        if not asset_path.is_absolute(): asset_path=Path.cwd()/asset_path
        if not asset_path.exists(): raise HTTPException(status_code=404,detail="Stored asset is missing")

        stage="resolve intake batch"
        batch_id=row[11] if len(row)>11 else None
        batch_dir=root/"incoming"/str(batch_id) if batch_id else asset_path.parent
        if not batch_dir.exists(): batch_dir=asset_path.parent
        if not batch_dir.is_dir(): raise HTTPException(status_code=422,detail=f"Asset-intake batch directory is missing: {batch_dir}")

        stage="write revalidation manifest"
        manifest_path,report_path=revalidation_report_paths(root,asset_id)
        manifest_path.write_text(json.dumps({"schemaVersion":1,"assets":[{"asset":asset_path.name,"productId":row[1],"rights":row[5],"source":row[4],"sourceUrl":row[7],"license":row[8],"attribution":row[9],"role":row[10]}]},indent=2),encoding="utf-8")

        stage="run local asset-intake validator"
        report=run_asset_intake(batch_dir,manifest_path,report_path)
        result=next((x for x in report.get("results",[]) if x.get("asset")==asset_path.name),None)
        if result is None:
            raise HTTPException(status_code=422,detail="Asset-intake completed without a result for the stored asset")
        status=result.get("state","REVIEW")
        if status=="UNRESOLVED": status="REVIEW"
        if status=="REJECTED" and "product already has an existing media mapping" in str(result.get("reason","")): status="REVIEW"

        stage="persist revalidation result"
        with db() as conn:
            conn.execute("update media_assets set product_legacy_id=%s,status=%s,updated_at=now() where id=%s",(int(result["productId"]) if result.get("productId") else row[1],status,asset_uuid))
            audit_media_action(conn,actor,"MEDIA_REVALIDATED",asset_id,{"result":result})
            conn.commit()
        return {"ok":True,"status":status,"result":result}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("MEDIA REVALIDATE FAILED asset_id=%s stage=%s",asset_id,stage)
        raise HTTPException(status_code=500,detail=f"Revalidate failed at {stage}: {type(exc).__name__}: {exc}") from exc

@app.post("/api/admin/media/{asset_id}/approve")
def media_approve(asset_id:str,request:Request):
    actor=require_owner(request)
    with db() as conn:
        row=conn.execute("select id,product_legacy_id,sha256,role,status,source_type,rights_status from media_assets where id=%s",(uuid.UUID(asset_id),)).fetchone()
        if not row: raise HTTPException(status_code=404,detail="Media asset not found")
        if not row[1]: raise HTTPException(status_code=422,detail="Product assignment is required before approval")
        if row[4] not in ("VERIFIED","REVIEW"): raise HTTPException(status_code=422,detail="Asset is not eligible for owner approval")
        if row[5] not in ("owned","supplier-authorized","licensed","public-domain","cc0") or row[6] not in ("owned","supplier-authorized","licensed","public-domain","cc0"): raise HTTPException(status_code=422,detail="Rights must establish authorization before approval")
        conflict=conn.execute("select id from media_production_mappings where product_legacy_id=%s and role=%s and published=true",(row[1],row[3])).fetchone()
        if conflict: raise HTTPException(status_code=409,detail="A published mapping already exists for this product and role")
        mapping_id=uuid.uuid4()
        conn.execute("update media_assets set status='APPROVED',approved_at=now(),approved_by=%s,verified_at=coalesce(verified_at,now()),verified_by=coalesce(verified_by,%s),updated_at=now() where id=%s",(uuid.UUID(actor["sub"]),uuid.UUID(actor["sub"]),uuid.UUID(asset_id)))
        conn.execute("insert into media_production_mappings (id,asset_id,product_legacy_id,role,published,created_by) values (%s,%s,%s,%s,false,%s)",(mapping_id,uuid.UUID(asset_id),row[1],row[3],uuid.UUID(actor["sub"])))
        audit_media_action(conn,actor,"MEDIA_APPROVED",asset_id,{"mappingId":str(mapping_id),"published":False}); conn.commit()
    return {"ok":True,"status":"APPROVED","published":False}

@app.post("/api/admin/media/{asset_id}/reject")
def media_reject(asset_id:str,request:Request):
    actor=require_owner(request)
    with db() as conn:
        if not conn.execute("select id from media_assets where id=%s",(uuid.UUID(asset_id), )).fetchone(): raise HTTPException(status_code=404,detail="Media asset not found")
        conn.execute("update media_assets set status='REJECTED',updated_at=now() where id=%s",(uuid.UUID(asset_id),))
        audit_media_action(conn,actor,"MEDIA_REJECTED",asset_id); conn.commit()
    return {"ok":True,"status":"REJECTED"}

@app.get("/api/health")
def health():
    if not settings.database_url:return {"ok":True,"database":"not-configured","mode":"configuration"}
    try:
        with db() as conn:conn.execute("select 1")
        return {"ok":True,"database":"connected","mode":"production"}
    except Exception:return {"ok":False,"database":"unavailable","mode":"configuration"}

@app.post("/api/auth/signup",status_code=201)
def signup(payload:AuthPayload,response:Response):
    if not payload.name:raise HTTPException(status_code=422,detail="Name is required")
    uid=uuid.uuid4(); ph=bcrypt.hashpw(payload.password.encode(),bcrypt.gensalt()).decode()
    try:
        with db() as conn:
            conn.execute("insert into users (id,name,email,phone,password_hash,role) values (%s,%s,%s,%s,%s,'customer')",(uid,payload.name,str(payload.email).lower(),None,ph));conn.commit()
    except psycopg.errors.UniqueViolation:raise HTTPException(status_code=409,detail="An account with this email already exists")
    response.set_cookie("twins_session",sign_session(str(uid),"customer"),httponly=True,secure=settings.cookie_secure,samesite="lax",max_age=604800,path="/")
    return {"user":{"id":str(uid),"name":payload.name,"email":str(payload.email).lower(),"role":"customer"}}

@app.post("/api/auth/login")
def login(payload:AuthPayload,request:Request,response:Response):
    with db() as conn:row=conn.execute("select id,name,email,password_hash,role from users where email=%s",(str(payload.email).lower(),)).fetchone()
    if not row or not bcrypt.checkpw(payload.password.encode(),row[3].encode()):raise HTTPException(status_code=401,detail="Invalid email or password")
    response.set_cookie("twins_session",sign_session(str(row[0]),row[4]),httponly=True,secure=(settings.cookie_secure and request.url.scheme=="https"),samesite="lax",max_age=604800,path="/")
    return {"user":{"id":str(row[0]),"name":row[1],"email":row[2],"role":row[4]}}

@app.post("/api/auth/logout")
def logout(response:Response):
    response.delete_cookie("twins_session",path="/");return {"ok":True}

@app.get("/api/account/me")
def me(request:Request):
    session=require_session(request)
    with db() as conn:row=conn.execute("select id,name,email,role,created_at from users where id=%s",(session["sub"],)).fetchone()
    if not row:raise HTTPException(status_code=401,detail="Account not found")
    return {"user":{"id":str(row[0]),"name":row[1],"email":row[2],"role":row[3],"createdAt":row[4].isoformat()}}

@app.get("/api/catalogue")
def catalogue():
    with db() as conn:rows=conn.execute("select legacy_catalogue_id,name,description,tag,price_mode,active from products where active=true order by legacy_catalogue_id").fetchall()
    return {"products":[{"id":r[0],"name":r[1],"description":r[2],"tag":r[3],"priceMode":r[4],"active":r[5]} for r in rows]}


@app.get("/api/project-plans/me")
def my_project_plan(request:Request):
    session=require_session(request)
    with db() as conn:
        row=conn.execute("select id,business,stage,location,capacity,space,utilities,owned,needs,created_at,updated_at from project_plans where user_id=%s order by updated_at desc limit 1",(session["sub"],)).fetchone()
    if not row:return {"plan":None}
    return {"plan":{"id":str(row[0]),"business":row[1],"stage":row[2],"location":row[3],"capacity":row[4],"space":row[5],"utilities":row[6],"owned":row[7],"needs":row[8],"createdAt":row[9].isoformat(),"updatedAt":row[10].isoformat()}}

@app.post("/api/project-plans",status_code=201)
def save_project_plan(payload:ProjectPlanPayload,request:Request):
    session=require_session(request);pid=uuid.uuid4()
    with db() as conn:
        conn.execute("delete from project_plans where user_id=%s",(session["sub"],))
        conn.execute("insert into project_plans (id,user_id,business,stage,location,capacity,space,utilities,owned,needs) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",(pid,session["sub"],payload.business,payload.stage,payload.location,payload.capacity,payload.space,payload.utilities,payload.owned,payload.needs));conn.commit()
    return {"plan":{"id":str(pid),"business":payload.business,"stage":payload.stage,"location":payload.location,"capacity":payload.capacity,"space":payload.space,"utilities":payload.utilities,"owned":payload.owned,"needs":payload.needs}}

@app.get("/api/seller/profile")
def seller_profile(request:Request):
    session=require_session(request)
    with db() as conn: row=conn.execute("select id,display_name,phone,location,verification_status,seller_status,created_at from seller_profiles where user_id=%s",(session["sub"],)).fetchone()
    if not row:return {"profile":None}
    return {"profile":{"id":str(row[0]),"displayName":row[1],"phone":row[2],"location":row[3],"verificationStatus":row[4],"sellerStatus":row[5],"createdAt":row[6].isoformat()}}

@app.post("/api/seller/profile",status_code=201)
def create_seller_profile(payload:SellerProfilePayload,request:Request):
    session=require_session(request);uid=uuid.UUID(session["sub"])
    with db() as conn:
        row=conn.execute("select id from seller_profiles where user_id=%s",(uid,)).fetchone()
        if row:
            conn.execute("update seller_profiles set display_name=%s,phone=%s,location=%s,updated_at=now() where id=%s",(payload.displayName,payload.phone,payload.location,row[0]));sid=row[0]
        else:
            sid=uuid.uuid4();conn.execute("insert into seller_profiles (id,user_id,display_name,phone,location) values (%s,%s,%s,%s,%s)",(sid,uid,payload.displayName,payload.phone,payload.location))
        conn.commit()
    return {"profile":{"id":str(sid),"displayName":payload.displayName,"phone":payload.phone,"location":payload.location,"verificationStatus":"pending"}}

@app.post("/api/marketplace/listings/{listing_id}/report",status_code=201)
def report_listing(listing_id:str,payload:MarketplaceReportPayload,request:Request):
    session=read_session(request);rid=uuid.uuid4()
    with db() as conn:
        exists=conn.execute("select id from marketplace_listings where id=%s",(uuid.UUID(listing_id),)).fetchone()
        if not exists:raise HTTPException(status_code=404,detail="Listing not found")
        conn.execute("insert into marketplace_reports (id,listing_id,reporter_user_id,reason,details) values (%s,%s,%s,%s,%s)",(rid,uuid.UUID(listing_id),uuid.UUID(session["sub"]) if session else None,payload.reason,payload.details));conn.commit()
    return {"report":{"id":str(rid),"status":"open"}}

@app.patch("/api/admin/marketplace/listings/{listing_id}")
def moderate_listing(listing_id:str,status:str,request:Request):
    require_admin(request)
    allowed={"published","rejected","paused","sold","archived"}
    if status not in allowed: raise HTTPException(status_code=422,detail="Unsupported moderation status")
    try: lid=uuid.UUID(listing_id)
    except ValueError: raise HTTPException(status_code=422,detail="Invalid listing ID")
    with db() as conn:
        if status=="published":
            row=conn.execute("""select ml.id,sp.verification_status,sp.seller_status,
              (select count(*) from marketplace_listing_media where listing_id=ml.id)
              from marketplace_listings ml join seller_profiles sp on sp.id=ml.seller_id where ml.id=%s for update""",(lid,)).fetchone()
            if not row: raise HTTPException(status_code=404,detail="Listing not found")
            if row[1]!="verified" or row[2]!="active": raise HTTPException(status_code=409,detail="Seller must be verified and active before publication")
            if int(row[3])<1: raise HTTPException(status_code=409,detail="A listing must have at least one image before publication")
            cur=conn.execute("update marketplace_listings set status='published',published_at=now(),updated_at=now() where id=%s",(lid,))
        else:
            cur=conn.execute("update marketplace_listings set status=%s,updated_at=now() where id=%s",(status,lid))
            if cur.rowcount==0: raise HTTPException(status_code=404,detail="Listing not found")
        conn.commit()
    return {"ok":True,"status":status}

@app.post("/api/quotes",status_code=201)
def create_quote(payload:QuotePayload,request:Request):
    session=read_session(request);qid=uuid.uuid4();ref=payload.reference or f"TW-{datetime.now().year}-{secrets.token_hex(3).upper()}";uid=uuid.UUID(session["sub"]) if session else None
    with db() as conn:
        conn.execute("insert into quotes (id,reference,user_id,name,email,phone,business,project_stage,location,capacity,space,utilities,requirements,status,package_name) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'Prepared',%s)",(qid,ref,uid,payload.name,payload.email,payload.phone,payload.business,payload.stage,payload.location,payload.capacity,payload.space,payload.utilities,payload.requirements,payload.packageName))
        for item in payload.items:
            row=conn.execute("select id from products where legacy_catalogue_id=%s",(item.id,)).fetchone();pid=row[0] if row else None
            conn.execute("insert into quote_items (id,quote_id,product_id,quantity) values (%s,%s,%s,%s)",(uuid.uuid4(),qid,pid,item.quantity))
        conn.commit()
    return {"quote":{"id":str(qid),"reference":ref,"status":"Prepared","createdAt":datetime.now(timezone.utc).isoformat()}}

@app.get("/api/quotes/me")
def my_quotes(request:Request):
    session=require_session(request)
    with db() as conn:rows=conn.execute("select reference,name,business,status,created_at from quotes where user_id=%s order by created_at desc limit 50",(session["sub"],)).fetchall()
    return {"quotes":[{"reference":r[0],"name":r[1],"business":r[2],"status":r[3],"createdAt":r[4].isoformat()} for r in rows]}


@app.get("/api/admin/quotes")
def admin_quotes(request:Request):
    require_admin(request)
    with db() as conn:
        rows=conn.execute("""select q.reference,q.name,q.email,q.phone,q.business,q.project_stage,q.location,q.capacity,q.space,q.utilities,q.requirements,q.package_name,q.status,q.created_at,coalesce(sum(qi.quantity),0) from quotes q left join quote_items qi on qi.quote_id=q.id group by q.id order by q.created_at desc limit 100""").fetchall()
    return {"quotes":[{"reference":r[0],"name":r[1],"email":r[2],"phone":r[3],"business":r[4],"stage":r[5],"location":r[6],"capacity":r[7],"space":r[8],"utilities":r[9],"requirements":r[10],"packageName":r[11],"status":r[12],"createdAt":r[13].isoformat(),"itemCount":r[14]} for r in rows]}

@app.patch("/api/admin/marketplace/listings/{listing_id}")
def moderate_listing(listing_id:str,status:str,request:Request):
    require_admin(request)
    allowed={"published","rejected","paused","sold","archived"}
    if status not in allowed: raise HTTPException(status_code=422,detail="Unsupported moderation status")
    with db() as conn:
        try: lid=uuid.UUID(listing_id)
        except ValueError: raise HTTPException(status_code=422,detail="Invalid listing ID")
        if status=="published":
            cur=conn.execute("update marketplace_listings set status=%s,published_at=now(),updated_at=now() where id=%s",(status,lid))
        else:
            cur=conn.execute("update marketplace_listings set status=%s,updated_at=now() where id=%s",(status,lid))
        conn.commit()
        if cur.rowcount==0: raise HTTPException(status_code=404,detail="Listing not found")
    return {"ok":True,"status":status}

@app.post("/api/quotes",status_code=201)
def create_quote(payload:QuotePayload,request:Request):
    session=read_session(request);qid=uuid.uuid4();ref=payload.reference or f"TW-{datetime.now().year}-{secrets.token_hex(3).upper()}";uid=uuid.UUID(session["sub"]) if session else None
    with db() as conn:
        conn.execute("insert into quotes (id,reference,user_id,name,email,phone,business,project_stage,location,capacity,space,utilities,requirements,status,package_name) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'Prepared',%s)",(qid,ref,uid,payload.name,payload.email,payload.phone,payload.business,payload.stage,payload.location,payload.capacity,payload.space,payload.utilities,payload.requirements,payload.packageName))
        for item in payload.items:
            row=conn.execute("select id from products where legacy_catalogue_id=%s",(item.id,)).fetchone();pid=row[0] if row else None
            conn.execute("insert into quote_items (id,quote_id,product_id,quantity) values (%s,%s,%s,%s)",(uuid.uuid4(),qid,pid,item.quantity))
        conn.commit()
    return {"quote":{"id":str(qid),"reference":ref,"status":"Prepared","createdAt":datetime.now(timezone.utc).isoformat()}}

@app.get("/api/quotes/me")
def my_quotes(request:Request):
    session=require_session(request)
    with db() as conn:
        rows=conn.execute("select reference,name,business,status,created_at from quotes where user_id=%s order by created_at desc limit 50",(session["sub"],)).fetchall()
    return {"quotes":[{"reference":r[0],"name":r[1],"business":r[2],"status":r[3],"createdAt":r[4].isoformat()} for r in rows]}

@app.get("/api/admin/quotes")
def admin_quotes(request:Request):
    require_admin(request)
    with db() as conn:
        rows=conn.execute("""select q.reference,q.name,q.email,q.phone,q.business,q.project_stage,q.location,q.capacity,q.space,q.utilities,q.requirements,q.package_name,q.status,q.created_at,coalesce(sum(qi.quantity),0)
          from quotes q left join quote_items qi on qi.quote_id=q.id group by q.id order by q.created_at desc limit 100""").fetchall()
    return {"quotes":[{"reference":r[0],"name":r[1],"email":r[2],"phone":r[3],"business":r[4],"stage":r[5],"location":r[6],"capacity":r[7],"space":r[8],"utilities":r[9],"requirements":r[10],"packageName":r[11],"status":r[12],"createdAt":r[13].isoformat(),"itemCount":r[14]} for r in rows]}

# Production marketplace routes are isolated from the Operations Admin.
from marketplace_api import register_marketplace_routes
register_marketplace_routes(app, db, settings, require_session, require_admin, inspect_image_bytes)
