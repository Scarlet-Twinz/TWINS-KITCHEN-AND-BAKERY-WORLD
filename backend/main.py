import base64, hashlib, hmac, json, secrets, uuid
from datetime import datetime, timedelta, timezone
from typing import Any
import bcrypt, psycopg
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    database_url: str=""
    session_secret: str="change-me"
    frontend_origins: str="http://127.0.0.1:5500,http://localhost:5500,http://localhost:3000"
    port: int=8000
    cookie_secure: bool=False
    model_config=SettingsConfigDict(env_file=".env",extra="ignore")
settings=Settings()
app=FastAPI(title="Twins Kitchen & Bakery World API",version="0.2.0")
origins=[x.strip() for x in settings.frontend_origins.split(",") if x.strip()]
app.add_middleware(CORSMiddleware,allow_origins=origins,allow_credentials=True,allow_methods=["GET","POST","PATCH","OPTIONS"],allow_headers=["Content-Type"])

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
    if s.get("role") not in ("admin","staff"):raise HTTPException(status_code=403,detail="Staff access required")
    return s

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
def login(payload:AuthPayload,response:Response):
    with db() as conn:row=conn.execute("select id,name,email,password_hash,role from users where email=%s",(str(payload.email).lower(),)).fetchone()
    if not row or not bcrypt.checkpw(payload.password.encode(),row[3].encode()):raise HTTPException(status_code=401,detail="Invalid email or password")
    response.set_cookie("twins_session",sign_session(str(row[0]),row[4]),httponly=True,secure=settings.cookie_secure,samesite="lax",max_age=604800,path="/")
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


@app.get("/api/marketplace/listings")
def marketplace_listings(category:str|None=None,limit:int=50):
    with db() as conn:
        rows=conn.execute("""select ml.id,ml.title,ml.category,ml.description,ml.price_mode,ml.price,ml.currency,ml.location,sp.display_name,sp.verification_status
        from marketplace_listings ml join seller_profiles sp on sp.id=ml.seller_id
        where ml.status='published' and (%s is null or ml.category=%s)
        order by ml.created_at desc limit %s""",(category,category,limit)).fetchall()
    return {"listings":[{"id":str(r[0]),"title":r[1],"category":r[2],"description":r[3],"priceMode":r[4],"price":r[5],"currency":r[6],"location":r[7],"seller":r[8],"sellerVerification":r[9]} for r in rows]}

@app.post("/api/marketplace/listings",status_code=201)
def create_marketplace_listing(payload:MarketplaceListingPayload,request:Request):
    session=require_session(request)
    uid=uuid.UUID(session["sub"]);lid=uuid.uuid4()
    with db() as conn:
        seller=conn.execute("select id from seller_profiles where user_id=%s",(uid,)).fetchone()
        if not seller:
            seller_id=uuid.uuid4()
            conn.execute("insert into seller_profiles (id,user_id,display_name,phone,verification_status) values (%s,%s,(select name from users where id=%s),(select phone from users where id=%s),'pending')",(seller_id,uid,uid,uid))
        else:seller_id=seller[0]
        conn.execute("insert into marketplace_listings (id,seller_id,title,category,description,price_mode,price,location,status) values (%s,%s,%s,%s,%s,%s,%s,%s,'pending_review')",(lid,seller_id,payload.title,payload.category,payload.description,payload.priceMode,payload.price,payload.location))
        conn.commit()
    return {"listing":{"id":str(lid),"status":"pending_review"}}

@app.get("/api/marketplace/me")
def my_marketplace_listings(request:Request):
    session=require_session(request);uid=uuid.UUID(session["sub"])
    with db() as conn:
        rows=conn.execute("""select ml.id,ml.title,ml.category,ml.description,ml.price_mode,ml.price,ml.currency,ml.location,ml.status,ml.created_at
        from marketplace_listings ml join seller_profiles sp on sp.id=ml.seller_id where sp.user_id=%s order by ml.created_at desc limit 100""",(uid,)).fetchall()
    return {"listings":[{"id":str(r[0]),"title":r[1],"category":r[2],"description":r[3],"priceMode":r[4],"price":r[5],"currency":r[6],"location":r[7],"status":r[8],"createdAt":r[9].isoformat()} for r in rows]}

@app.post("/api/marketplace/seller-plan-intent",status_code=201)
def seller_plan_intent(payload:SellerPlanPayload,request:Request):
    session=require_session(request);uid=uuid.UUID(session["sub"]);sid=uuid.uuid4()
    with db() as conn:
        seller=conn.execute("select id from seller_profiles where user_id=%s",(uid,)).fetchone()
        if not seller:raise HTTPException(status_code=400,detail="Create a seller profile first")
        conn.execute("insert into seller_subscriptions (id,seller_id,plan,status) values (%s,%s,%s,'pending_payment')",(sid,seller[0],payload.plan))
        conn.commit()
    return {"subscription":{"id":str(sid),"plan":payload.plan,"status":"pending_payment"}}

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
