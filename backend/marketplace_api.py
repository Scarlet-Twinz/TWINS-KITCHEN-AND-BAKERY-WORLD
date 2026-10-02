import hashlib, hmac, json, os, secrets, shutil, urllib.error, urllib.request, uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request, File, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

def register_marketplace_routes(app, db, settings, require_session, require_admin, inspect_image_bytes):
    router = APIRouter(prefix="/api/marketplace", tags=["marketplace"])

    def _json_env(name):
        raw = str(os.getenv(name, "") or "").strip()
        if not raw:
            return {}
        try:
            value = json.loads(raw)
            return value if isinstance(value, dict) else {}
        except json.JSONDecodeError:
            raise HTTPException(status_code=500, detail=f"{name} is invalid JSON")

    def _plan_codes():
        return {str(k): str(v) for k, v in _json_env("SELLER_PLAN_CODES_JSON").items() if str(v).strip()}

    def _storage_root():
        configured = str(getattr(settings, "marketplace_storage_root", "") or "").strip()
        root = Path(configured) if configured else Path(getattr(settings, "media_storage_root", "../storage/media-intake")).parent / "marketplace"
        root.mkdir(parents=True, exist_ok=True)
        return root.resolve()

    def _public_base():
        return str(getattr(settings, "public_base_url", "") or "").strip().rstrip("/")

    def _paystack_key():
        return str(getattr(settings, "paystack_secret_key", "") or "").strip()

    def _paystack(method, path, payload=None):
        key = _paystack_key()
        if not key:
            raise HTTPException(status_code=503, detail="Paystack is not configured")
        data = json.dumps(payload, separators=(",", ":")).encode() if payload is not None else None
        req = urllib.request.Request("https://api.paystack.co" + path, data=data,
                                     headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                                     method=method)
        try:
            with urllib.request.urlopen(req, timeout=15) as response:
                body = json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            try: detail = json.loads(exc.read().decode("utf-8"))
            except Exception: detail = {"message": str(exc)}
            raise HTTPException(status_code=502, detail=detail.get("message", "Payment provider request failed"))
        except (urllib.error.URLError, TimeoutError) as exc:
            raise HTTPException(status_code=502, detail=f"Payment provider unavailable: {exc}")
        if not body.get("status"):
            raise HTTPException(status_code=502, detail=body.get("message", "Payment provider rejected the request"))
        return body.get("data") or {}

    def _profile(conn, uid):
        return conn.execute("""select id,user_id,display_name,phone,location,verification_status,seller_status,created_at,updated_at
          from seller_profiles where user_id=%s""", (uid,)).fetchone()

    def _ensure_profile(conn, uid):
        row = _profile(conn, uid)
        if row: return row
        sid = uuid.uuid4()
        user = conn.execute("select name,phone from users where id=%s", (uid,)).fetchone()
        conn.execute("""insert into seller_profiles
          (id,user_id,display_name,phone,verification_status,seller_status)
          values (%s,%s,%s,%s,'pending','active')""",
          (sid, uid, (user[0] if user else "Seller"), (user[1] if user else None)))
        return _profile(conn, uid)

    def _listing_media(conn, listing_id):
        rows = conn.execute("""select id,kind,storage_key,alt_text,sort_order,created_at
          from marketplace_listing_media where listing_id=%s order by sort_order,id""", (listing_id,)).fetchall()
        base = _public_base()
        return [{"id":str(r[0]),"kind":r[1],
                 "url":(base+"/api/marketplace/media/"+str(r[0])) if base else "/api/marketplace/media/"+str(r[0]),
                 "alt":r[3] or "","sortOrder":r[4],"createdAt":r[5].isoformat()} for r in rows]

    def _listing_dict(conn, row):
        return {"id":str(row[0]),"title":row[1],"category":row[2],"description":row[3],
                "priceMode":row[4],"price":float(row[5]) if row[5] is not None else None,"currency":row[6],
                "location":row[7],"seller":row[8],"sellerVerification":row[9],"status":row[10],
                "createdAt":row[11].isoformat(),"updatedAt":row[12].isoformat(),"media":_listing_media(conn,row[0])}

    class ListingPayload(BaseModel):
        title: str = Field(min_length=3,max_length=160)
        category: str = Field(min_length=2,max_length=80)
        description: str = Field(min_length=10,max_length=2000)
        priceMode: str = Field(default="on_request")
        price: float | None = Field(default=None,ge=0)
        location: str | None = Field(default=None,max_length=160)

    class ProfilePayload(BaseModel):
        displayName: str = Field(min_length=2,max_length=120)
        phone: str | None = Field(default=None,max_length=40)
        location: str | None = Field(default=None,max_length=160)

    class PlanPayload(BaseModel):
        plan: str = Field(min_length=2,max_length=80)

    class ReportPayload(BaseModel):
        reason: str = Field(min_length=3,max_length=120)
        details: str | None = Field(default=None,max_length=2000)

    @router.get("/plans")
    def plans():
        codes = _plan_codes()
        return {"plans":[
          {"name":"Community Starter","billing":"free","price":0,"currency":"NGN","configured":True,
           "features":["Up to 3 active listings","Moderation review","Seller profile"]},
          {"name":"Verified Seller","billing":"monthly","configured":"Verified Seller" in codes,
           "features":["Higher listing limits","Verified profile badge","Seller analytics"]},
          {"name":"Promoted Seller","billing":"monthly","configured":"Promoted Seller" in codes,
           "features":["Verified seller features","Priority placement","Campaign slots"]}]}

    @router.get("/listings")
    def public_listings(category:str|None=None,limit:int=50):
        limit=max(1,min(limit,100))
        with db() as conn:
            rows=conn.execute("""select ml.id,ml.title,ml.category,ml.description,ml.price_mode,ml.price,ml.currency,
              ml.location,sp.display_name,sp.verification_status,ml.status,ml.created_at,ml.updated_at
              from marketplace_listings ml join seller_profiles sp on sp.id=ml.seller_id
              where ml.status='published' and sp.seller_status='active'
              and (%s is null or ml.category=%s) order by ml.created_at desc limit %s""",(category,category,limit)).fetchall()
            return {"listings":[_listing_dict(conn,r) for r in rows]}

    @router.get("/listings/{listing_id}")
    def public_listing(listing_id:str):
        try: lid=uuid.UUID(listing_id)
        except ValueError: raise HTTPException(status_code=422,detail="Invalid listing ID")
        with db() as conn:
            row=conn.execute("""select ml.id,ml.title,ml.category,ml.description,ml.price_mode,ml.price,ml.currency,
              ml.location,sp.display_name,sp.verification_status,ml.status,ml.created_at,ml.updated_at
              from marketplace_listings ml join seller_profiles sp on sp.id=ml.seller_id
              where ml.id=%s and ml.status='published' and sp.seller_status='active'""",(lid,)).fetchone()
            if not row: raise HTTPException(status_code=404,detail="Listing not found")
            return {"listing":_listing_dict(conn,row)}

    @router.get("/media/{media_id}")
    def listing_media(media_id:str):
        try: mid=uuid.UUID(media_id)
        except ValueError: raise HTTPException(status_code=422,detail="Invalid media ID")
        root=_storage_root()
        with db() as conn:
            row=conn.execute("""select lm.storage_key,lm.kind,lm.mime_type,ml.status,sp.seller_status
              from marketplace_listing_media lm join marketplace_listings ml on ml.id=lm.listing_id
              join seller_profiles sp on sp.id=ml.seller_id where lm.id=%s""",(mid,)).fetchone()
        if not row or row[1]!="image" or row[3]!="published" or row[4]!="active":
            raise HTTPException(status_code=404,detail="Marketplace media not found")
        path=(root/row[0]).resolve()
        try: path.relative_to(root)
        except ValueError: raise HTTPException(status_code=403,detail="Invalid media path")
        if not path.is_file(): raise HTTPException(status_code=404,detail="Stored media is missing")
        return FileResponse(path,media_type=row[2] or "application/octet-stream")

    @router.get("/me")
    def my_listings(request:Request):
        session=require_session(request);uid=uuid.UUID(session["sub"])
        with db() as conn:
            rows=conn.execute("""select ml.id,ml.title,ml.category,ml.description,ml.price_mode,ml.price,ml.currency,
              ml.location,sp.display_name,sp.verification_status,ml.status,ml.created_at,ml.updated_at
              from marketplace_listings ml join seller_profiles sp on sp.id=ml.seller_id
              where sp.user_id=%s order by ml.created_at desc limit 100""",(uid,)).fetchall()
            return {"listings":[_listing_dict(conn,r) for r in rows]}

    @router.get("/seller/profile")
    def seller_profile(request:Request):
        session=require_session(request)
        with db() as conn: row=_profile(conn,uuid.UUID(session["sub"]))
        if not row:return {"profile":None}
        return {"profile":{"id":str(row[0]),"displayName":row[2],"phone":row[3],"location":row[4],
          "verificationStatus":row[5],"sellerStatus":row[6],"createdAt":row[7].isoformat()}}

    @router.post("/seller/profile",status_code=201)
    def save_seller_profile(payload:ProfilePayload,request:Request):
        session=require_session(request);uid=uuid.UUID(session["sub"])
        with db() as conn:
            row=_ensure_profile(conn,uid)
            conn.execute("update seller_profiles set display_name=%s,phone=%s,location=%s,updated_at=now() where id=%s",
                         (payload.displayName,payload.phone,payload.location,row[0]))
            conn.commit();row=_profile(conn,uid)
        return {"profile":{"id":str(row[0]),"displayName":row[2],"phone":row[3],"location":row[4],"verificationStatus":row[5],"sellerStatus":row[6]}}

    @router.post("/listings",status_code=201)
    def create_listing(payload:ListingPayload,request:Request):
        session=require_session(request);uid=uuid.UUID(session["sub"])
        if payload.priceMode not in {"on_request","fixed","negotiable"}: raise HTTPException(status_code=422,detail="Unsupported price mode")
        if payload.priceMode=="fixed" and (payload.price is None or payload.price<=0): raise HTTPException(status_code=422,detail="A fixed-price listing needs a price")
        if payload.priceMode!="fixed": payload.price=None
        lid=uuid.uuid4()
        with db() as conn:
            seller=_ensure_profile(conn,uid)
            if seller[6]!="active": raise HTTPException(status_code=403,detail="Seller account is not active")
            conn.execute("""insert into marketplace_listings
              (id,seller_id,title,category,description,price_mode,price,location,status)
              values (%s,%s,%s,%s,%s,%s,%s,%s,'pending_review')""",
              (lid,seller[0],payload.title.strip(),payload.category.strip(),payload.description.strip(),
               payload.priceMode,payload.price,payload.location.strip() if payload.location else None))
            conn.commit()
        return {"listing":{"id":str(lid),"status":"pending_review","media":[]}}

    @router.patch("/listings/{listing_id}")
    def update_listing(listing_id:str,payload:ListingPayload,request:Request):
        session=require_session(request);uid=uuid.UUID(session["sub"])
        try: lid=uuid.UUID(listing_id)
        except ValueError: raise HTTPException(status_code=422,detail="Invalid listing ID")
        if payload.priceMode not in {"on_request","fixed","negotiable"}: raise HTTPException(status_code=422,detail="Unsupported price mode")
        if payload.priceMode=="fixed" and (payload.price is None or payload.price<=0): raise HTTPException(status_code=422,detail="A fixed-price listing needs a price")
        if payload.priceMode!="fixed": payload.price=None
        with db() as conn:
            row=conn.execute("""select ml.id,ml.status from marketplace_listings ml join seller_profiles sp on sp.id=ml.seller_id
              where ml.id=%s and sp.user_id=%s for update""",(lid,uid)).fetchone()
            if not row: raise HTTPException(status_code=404,detail="Listing not found")
            next_status="pending_review" if row[1]=="published" else row[1]
            if next_status not in {"draft","pending_review","rejected","paused"}: raise HTTPException(status_code=409,detail="This listing cannot be edited in its current state")
            conn.execute("""update marketplace_listings set title=%s,category=%s,description=%s,price_mode=%s,price=%s,
              location=%s,status=%s,updated_at=now(),published_at=null where id=%s""",
              (payload.title.strip(),payload.category.strip(),payload.description.strip(),payload.priceMode,payload.price,
               payload.location.strip() if payload.location else None,next_status,lid))
            conn.commit()
        return {"ok":True,"status":next_status}

    @router.post("/listings/{listing_id}/media",status_code=201)
    async def upload_listing_media(listing_id:str,request:Request,files:list[UploadFile]=File(...)):
        session=require_session(request);uid=uuid.UUID(session["sub"])
        try: lid=uuid.UUID(listing_id)
        except ValueError: raise HTTPException(status_code=422,detail="Invalid listing ID")
        if not files or len(files)>8: raise HTTPException(status_code=422,detail="Upload 1 to 8 images")
        root=_storage_root();max_bytes=int(getattr(settings,"marketplace_max_image_bytes",10*1024*1024))
        with db() as conn:
            listing=conn.execute("""select ml.id,ml.status,sp.id from marketplace_listings ml join seller_profiles sp on sp.id=ml.seller_id
              where ml.id=%s and sp.user_id=%s for update""",(lid,uid)).fetchone()
            if not listing: raise HTTPException(status_code=404,detail="Listing not found")
            existing=int(conn.execute("select count(*) from marketplace_listing_media where listing_id=%s",(lid,)).fetchone()[0])
            if existing+len(files)>8: raise HTTPException(status_code=422,detail="A listing can have at most 8 images")
            saved=[];staged=[]
            try:
                for upload in files:
                    original=Path(upload.filename or "image").name;ext=Path(original).suffix.lower()
                    if ext not in {".jpg",".jpeg",".png",".webp"}: raise HTTPException(status_code=422,detail=f"Unsupported image type: {original}")
                    data=await upload.read()
                    if len(data)==0 or len(data)>max_bytes: raise HTTPException(status_code=422,detail=f"Invalid image size: {original}")
                    inspection=inspect_image_bytes(data,ext)
                    if not inspection.valid or inspection.mime_type not in {"image/jpeg","image/png","image/webp"}: raise HTTPException(status_code=422,detail=f"Invalid image: {original}")
                    digest=hashlib.sha256(data).hexdigest()
                    duplicate=conn.execute("""select lm.id from marketplace_listing_media lm join marketplace_listings other on other.id=lm.listing_id
                      where lm.sha256=%s and other.seller_id=%s""",(digest,listing[2])).fetchone()
                    if duplicate: raise HTTPException(status_code=409,detail="This image is already used by this seller")
                    media_id=uuid.uuid4();relative=Path(str(listing[2]))/str(lid)/(media_id.hex+ext);target=(root/relative).resolve()
                    target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data);staged.append(target)
                    sort_order=existing+len(saved)
                    conn.execute("""insert into marketplace_listing_media
                      (id,listing_id,kind,storage_key,alt_text,sort_order,mime_type,sha256,size_bytes)
                      values (%s,%s,'image',%s,%s,%s,%s,%s,%s)""",
                      (media_id,lid,str(relative).replace("\","/"),original[:240],sort_order,inspection.mime_type,digest,len(data)))
                    saved.append({"id":str(media_id),"filename":original,"url":(_public_base()+"/api/marketplace/media/"+str(media_id)) if _public_base() else "/api/marketplace/media/"+str(media_id)})
                conn.commit()
            except Exception:
                for target in staged: target.unlink(missing_ok=True)
                conn.rollback();raise
        return {"media":saved}

    @router.delete("/listings/{listing_id}/media/{media_id}")
    def delete_listing_media(listing_id:str,media_id:str,request:Request):
        session=require_session(request);uid=uuid.UUID(session["sub"])
        try: lid,mid=uuid.UUID(listing_id),uuid.UUID(media_id)
        except ValueError: raise HTTPException(status_code=422,detail="Invalid listing or media ID")
        root=_storage_root()
        with db() as conn:
            row=conn.execute("""select lm.storage_key from marketplace_listing_media lm join marketplace_listings ml on ml.id=lm.listing_id
              join seller_profiles sp on sp.id=ml.seller_id where lm.id=%s and lm.listing_id=%s and sp.user_id=%s for update""",(mid,lid,uid)).fetchone()
            if not row: raise HTTPException(status_code=404,detail="Listing image not found")
            path=(root/row[0]).resolve()
            try: path.relative_to(root)
            except ValueError: raise HTTPException(status_code=403,detail="Invalid media path")
            conn.execute("delete from marketplace_listing_media where id=%s",(mid,));conn.commit()
        path.unlink(missing_ok=True);return {"ok":True}

    @router.post("/listings/{listing_id}/report",status_code=201)
    def report_listing(listing_id:str,payload:ReportPayload,request:Request):
        try: session=require_session(request)
        except HTTPException: session=None
        try: lid=uuid.UUID(listing_id)
        except ValueError: raise HTTPException(status_code=422,detail="Invalid listing ID")
        rid=uuid.uuid4()
        with db() as conn:
            if not conn.execute("select id from marketplace_listings where id=%s and status='published'",(lid,)).fetchone(): raise HTTPException(status_code=404,detail="Listing not found")
            conn.execute("insert into marketplace_reports (id,listing_id,reporter_user_id,reason,details) values (%s,%s,%s,%s,%s)",
                         (rid,lid,uuid.UUID(session["sub"]) if session else None,payload.reason,payload.details));conn.commit()
        return {"report":{"id":str(rid),"status":"open"}}

    def start_plan(payload:PlanPayload,request:Request):
        session=require_session(request);uid=uuid.UUID(session["sub"])
        if payload.plan not in {"Community Starter","Verified Seller","Promoted Seller"}: raise HTTPException(status_code=422,detail="Unsupported seller plan")
        with db() as conn:
            seller=_ensure_profile(conn,uid)
            active=conn.execute("""select id,plan,status,ends_at from seller_subscriptions where seller_id=%s
              and status in ('pending_payment','active','past_due') order by created_at desc limit 1""",(seller[0],)).fetchone()
            if active and active[1]==payload.plan and active[2]=="active":
                return {"subscription":{"id":str(active[0]),"plan":active[1],"status":active[2],"endsAt":active[3].isoformat() if active[3] else None}}
            sid=uuid.uuid4()
            if payload.plan=="Community Starter":
                now=datetime.now(timezone.utc);ends=now+timedelta(days=3650)
                conn.execute("""insert into seller_subscriptions (id,seller_id,plan,status,starts_at,ends_at)
                  values (%s,%s,%s,'active',%s,%s)""",(sid,seller[0],payload.plan,now,ends));conn.commit()
                return {"subscription":{"id":str(sid),"plan":payload.plan,"status":"active","paymentRequired":False}}
            codes=_plan_codes();plan_code=codes.get(payload.plan)
            if not plan_code: raise HTTPException(status_code=503,detail=f"{payload.plan} is not configured in Paystack")
            user=conn.execute("select name,email from users where id=%s",(uid,)).fetchone()
            if not user: raise HTTPException(status_code=401,detail="Account not found")
            plan=_paystack("GET","/plan/"+plan_code);amount=int(plan.get("amount") or 0);currency=str(plan.get("currency") or "NGN")
            if amount<=0: raise HTTPException(status_code=503,detail="Configured Paystack plan has no valid amount")
            ref="TKSELL-"+secrets.token_hex(10).upper()
            conn.execute("""insert into seller_subscriptions (id,seller_id,plan,status,gateway,gateway_reference,gateway_plan_code)
              values (%s,%s,%s,'pending_payment','paystack',%s,%s)""",(sid,seller[0],payload.plan,ref,plan_code))
            conn.execute("""insert into payment_transactions
              (id,user_id,seller_subscription_id,reference,gateway,purpose,amount,currency,status,metadata)
              values (%s,%s,%s,%s,'paystack','seller_membership',%s,%s,'initiated',%s)""",
              (uuid.uuid4(),uid,sid,ref,amount,currency,json.dumps({"sellerSubscriptionId":str(sid),"plan":payload.plan,"planCode":plan_code})));conn.commit()
        init={"email":str(user[1]),"amount":amount,"currency":currency,"reference":ref,"plan":plan_code,
              "metadata":{"sellerSubscriptionId":str(sid),"plan":payload.plan,"platform":"twins-marketplace"}}
        if _public_base(): init["callback_url"]=_public_base()+"/seller-dashboard.html?payment=1"
        try: checkout=_paystack("POST","/transaction/initialize",init)
        except Exception:
            with db() as conn:
                conn.execute("update seller_subscriptions set status='cancelled',updated_at=now() where id=%s and status='pending_payment'",(sid,))
                conn.execute("update payment_transactions set status='failed',updated_at=now() where reference=%s",(ref,));conn.commit()
            raise
        with db() as conn:
            conn.execute("update payment_transactions set gateway_status=%s,metadata=%s,updated_at=now() where reference=%s",
                         (checkout.get("access_code"),json.dumps({"sellerSubscriptionId":str(sid),"plan":payload.plan,"planCode":plan_code,"authorizationUrl":checkout.get("authorization_url")}),ref));conn.commit()
        return {"subscription":{"id":str(sid),"plan":payload.plan,"status":"pending_payment","reference":ref},
                "payment":{"authorizationUrl":checkout.get("authorization_url"),"accessCode":checkout.get("access_code"),"reference":ref}}

    @router.post("/seller-plan-intent",status_code=201)
    def seller_plan_intent(payload:PlanPayload,request:Request): return start_plan(payload,request)

    @router.post("/seller-plan",status_code=201)
    def seller_plan(payload:PlanPayload,request:Request): return start_plan(payload,request)

    @router.get("/subscriptions/me")
    def my_subscription(request:Request):
        session=require_session(request);uid=uuid.UUID(session["sub"])
        with db() as conn:
            row=conn.execute("""select ss.id,ss.plan,ss.status,ss.gateway,ss.gateway_reference,ss.gateway_plan_code,
              ss.starts_at,ss.ends_at,ss.created_at,ss.updated_at from seller_subscriptions ss join seller_profiles sp on sp.id=ss.seller_id
              where sp.user_id=%s order by ss.created_at desc limit 1""",(uid,)).fetchone()
        if not row:return {"subscription":None}
        return {"subscription":{"id":str(row[0]),"plan":row[1],"status":row[2],"gateway":row[3],"reference":row[4],
          "planCode":row[5],"startsAt":row[6].isoformat() if row[6] else None,"endsAt":row[7].isoformat() if row[7] else None,
          "createdAt":row[8].isoformat(),"updatedAt":row[9].isoformat()}}

    @router.get("/payment-status")
    def payment_status(reference:str,request:Request):
        session=require_session(request);uid=uuid.UUID(session["sub"])
        with db() as conn:
            row=conn.execute("select reference,status,amount,currency,seller_subscription_id from payment_transactions where reference=%s and user_id=%s",
                             (reference,uid)).fetchone()
        if not row: raise HTTPException(status_code=404,detail="Payment not found")
        return {"payment":{"reference":row[0],"status":row[1],"amount":float(row[2]),"currency":row[3],"subscriptionId":str(row[4]) if row[4] else None}}

    @app.post("/api/paystack/webhook",include_in_schema=False)
    async def paystack_webhook(request:Request):
        raw=await request.body();signature=request.headers.get("x-paystack-signature","");secret=_paystack_key()
        if not secret or not signature or not hmac.compare_digest(hmac.new(secret.encode(),raw,hashlib.sha512).hexdigest(),signature):
            raise HTTPException(status_code=401,detail="Invalid webhook signature")
        event=json.loads(raw.decode("utf-8"));event_name=str(event.get("event") or "");data=event.get("data") or {}
        event_key=hashlib.sha256(raw).hexdigest()
        with db() as conn:
            inserted=conn.execute("""insert into marketplace_webhook_events (event_key,event_name,payload)
              values (%s,%s,%s) on conflict (event_key) do nothing""",(event_key,event_name,json.dumps(event))).rowcount
            if inserted==0:return {"ok":True,"duplicate":True}
            reference=str(data.get("reference") or "")
            if event_name=="charge.success" and reference:
                amount=int(data.get("amount") or 0);currency=str(data.get("currency") or "NGN")
                tx=conn.execute("""select id,user_id,seller_subscription_id,amount,currency,status from payment_transactions
                  where reference=%s for update""",(reference,)).fetchone()
                if tx:
                    expected=int(tx[3]);expected_currency=str(tx[4])
                    if str(data.get("status"))!="success" or amount!=expected or currency!=expected_currency:
                        conn.execute("update payment_transactions set status='failed',gateway_status=%s,processed_at=now(),updated_at=now() where id=%s",
                                     (str(data.get("status") or "amount/currency mismatch"),tx[0]))
                    else:
                        conn.execute("""update payment_transactions set status='successful',gateway_status=%s,processed_at=now(),updated_at=now(),
                          metadata=coalesce(metadata,'{}'::jsonb)||%s::jsonb where id=%s""",
                          (str(data.get("gateway_response") or "success"),json.dumps({"paystackTransactionId":data.get("id"),"paidAt":data.get("paid_at")}),tx[0]))
                        if tx[2]:
                            sub=conn.execute("select id from seller_subscriptions where id=%s for update",(tx[2],)).fetchone()
                            if sub:
                                now=datetime.now(timezone.utc)
                                conn.execute("""update seller_subscriptions set status='active',starts_at=coalesce(starts_at,%s),
                                  ends_at=%s,last_payment_at=%s,next_payment_at=%s,updated_at=now() where id=%s""",
                                  (now,now+timedelta(days=31),now,now+timedelta(days=31),sub[0]))
                conn.commit()
            elif event_name=="subscription.create":
                code=str(data.get("subscription_code") or "")
                customer_email=str((data.get("customer") or {}).get("email") or "").lower()
                if code and customer_email:
                    conn.execute("""update seller_subscriptions ss set gateway_subscription_code=%s,status='active',
                      starts_at=coalesce(starts_at,now()),updated_at=now()
                      from seller_profiles sp join users u on u.id=sp.user_id
                      where ss.seller_id=sp.id and lower(u.email)=%s and ss.gateway='paystack' and ss.status='pending_payment'""",(code,customer_email))
                conn.commit()
            elif event_name in {"subscription.disable","subscription.not_renew"}:
                code=str(data.get("subscription_code") or "");status="expired" if event_name=="subscription.disable" else "cancelled"
                conn.execute("update seller_subscriptions set status=%s,updated_at=now() where gateway_subscription_code=%s",(status,code));conn.commit()
            elif event_name=="invoice.payment_failed":
                code=str(data.get("subscription_code") or "")
                conn.execute("update seller_subscriptions set status='past_due',updated_at=now() where gateway_subscription_code=%s",(code,));conn.commit()
            else: conn.commit()
        return {"ok":True}

    app.include_router(router)
