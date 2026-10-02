import base64, hashlib, hmac, json, os, re, secrets, time, uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
import bcrypt, psycopg, httpx
from fastapi import FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from pydantic import BaseModel, EmailStr, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    database_url: str=""
    session_secret: str=""
    frontend_origins: str="http://127.0.0.1:5500,http://localhost:5500,http://localhost:3000"
    trusted_hosts: str=""
    app_env: str="development"
    port: int=8000
    cookie_secure: bool=False
    auth_rate_limit: int=10
    auth_rate_window_seconds: int=900
    paystack_secret_key: str=""
    paystack_base_url: str="https://api.paystack.co"
    model_config=SettingsConfigDict(env_file=".env",extra="ignore")
settings=Settings()
SESSION_COOKIE="__Host-twins_session" if settings.cookie_secure else "twins_session"
app=FastAPI(title="Twins Kitchen & Bakery World API",version="0.4.0")
INTAKE_ROOT=Path(__file__).resolve().parent.parent/"storage"/"intake"
INTAKE_ROOT.mkdir(parents=True,exist_ok=True)
origins=[x.strip() for x in settings.frontend_origins.split(",") if x.strip()]
trusted_hosts=[x.strip() for x in settings.trusted_hosts.split(",") if x.strip()]
if trusted_hosts:
    app.add_middleware(TrustedHostMiddleware,allowed_hosts=trusted_hosts)
app.add_middleware(CORSMiddleware,allow_origins=origins,allow_credentials=True,allow_methods=["GET","POST","PATCH","DELETE","OPTIONS"],allow_headers=["Content-Type"],max_age=600)

_auth_attempts={}
_AUTH_PATHS={"/api/auth/login","/api/auth/signup"}
_MUTATING_METHODS={"POST","PUT","PATCH","DELETE"}

def _client_key(request:Request)->str:
    return f"{request.client.host if request.client else 'unknown'}:{request.url.path}"

def _rate_limited(request:Request)->bool:
    key=_client_key(request);now=time.monotonic();window=settings.auth_rate_window_seconds
    bucket=[stamp for stamp in _auth_attempts.get(key,[]) if now-stamp<window]
    if len(bucket)>=settings.auth_rate_limit:
        _auth_attempts[key]=bucket
        return True
    bucket.append(now);_auth_attempts[key]=bucket
    if len(_auth_attempts)>2048:
        for old_key,stamps in list(_auth_attempts.items())[:256]:
            if not stamps or now-stamps[-1]>=window: _auth_attempts.pop(old_key,None)
    return False

@app.middleware("http")
async def security_guard(request:Request,call_next):
    origin=request.headers.get("origin")
    if request.method in _MUTATING_METHODS and origin and origin not in origins:
        return JSONResponse(status_code=403,content={"detail":"Origin not allowed"})
    if request.url.path in _AUTH_PATHS and request.method=="POST" and _rate_limited(request):
        return JSONResponse(status_code=429,content={"detail":"Too many authentication attempts. Try again later."},headers={"Retry-After":str(settings.auth_rate_window_seconds)})
    response=await call_next(request)
    response.headers["X-Content-Type-Options"]="nosniff"
    response.headers["X-Frame-Options"]="DENY"
    response.headers["Referrer-Policy"]="strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"]="camera=(), microphone=(), geolocation=()"
    if settings.cookie_secure:
        response.headers["Strict-Transport-Security"]="max-age=31536000; includeSubDomains"
    if request.url.path.startswith("/api/auth/") or request.url.path.startswith("/api/account/") or request.url.path.startswith("/api/admin/"):
        response.headers["Cache-Control"]="no-store"
    return response

@app.on_event("startup")
def validate_production_security():
    if settings.app_env.lower()=="production":
        if len(settings.session_secret)<32:
            raise RuntimeError("SESSION_SECRET must be at least 32 characters in production")
        if not settings.cookie_secure:
            raise RuntimeError("COOKIE_SECURE=true is required in production")
        if not origins:
            raise RuntimeError("FRONTEND_ORIGINS must contain at least one allowed origin in production")

def apply_operations_migration():
    if not settings.database_url: return
    migration_path=Path(__file__).resolve().parent/"migrations"/"001_operations_admin_v1.sql"
    if not migration_path.exists(): return
    statements=[x.strip() for x in migration_path.read_text(encoding="utf-8").split(";") if x.strip()]
    with db() as conn:
        for statement in statements: conn.execute(statement)
        conn.commit()

def db():
    if not settings.database_url: raise HTTPException(status_code=503,detail="Database is not configured")
    return psycopg.connect(settings.database_url)
def create_session(conn,user_id:str)->str:
    token=secrets.token_urlsafe(32)
    token_hash=hashlib.sha256(token.encode()).hexdigest()
    expires_at=datetime.now(timezone.utc)+timedelta(hours=8)
    conn.execute("insert into user_sessions (id,user_id,token_hash,expires_at) values (%s,%s,%s,%s)",(uuid.uuid4(),uuid.UUID(user_id),token_hash,expires_at))
    return token

def read_session(request:Request)->dict[str,Any]|None:
    if not settings.session_secret:
        return None
    token=request.cookies.get(SESSION_COOKIE)
    if not token or len(token)<40:
        return None
    token_hash=hashlib.sha256(token.encode()).hexdigest()
    try:
        with db() as conn:
            row=conn.execute("""select s.user_id,u.role,s.expires_at
                                from user_sessions s
                                join users u on u.id=s.user_id
                                where s.token_hash=%s and s.revoked_at is null and s.expires_at>now()""",(token_hash,)).fetchone()
            if not row:
                return None
            conn.execute("update user_sessions set last_seen_at=now() where token_hash=%s",(token_hash,))
            conn.commit()
        return {"sub":str(row[0]),"role":row[1],"exp":int(row[2].timestamp())}
    except Exception:
        return None

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
class InventoryAdjustmentPayload(BaseModel):
    productId:int
    delta:int
    reason:str=Field(min_length=3,max_length=240)

class OrderCreatePayload(BaseModel):
    quoteReference:str=Field(min_length=4,max_length=80)
    notes:str|None=None

class OrderStatusPayload(BaseModel):
    status:str=Field(min_length=3,max_length=40)

class DeliveryCreatePayload(BaseModel):
    orderId:str
    recipientName:str=Field(min_length=2,max_length=120)
    phone:str=Field(min_length=5,max_length=40)
    address:str=Field(min_length=5,max_length=300)
    city:str|None=None
    state:str|None=None
    country:str="Nigeria"
    notes:str|None=None

class DeliveryStatusPayload(BaseModel):
    status:str=Field(min_length=3,max_length=40)
    trackingReference:str|None=None


@app.on_event("startup")\ndef apply_startup_migrations():\n    try: apply_operations_migration()\n    except Exception as exc: raise RuntimeError(f"Operations migration failed: {exc}")\n\n@app.get("/api/health")
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
            conn.execute("insert into users (id,name,email,phone,password_hash,role) values (%s,%s,%s,%s,%s,'customer')",(uid,payload.name,str(payload.email).lower(),None,ph))
            token=create_session(conn,str(uid))
            conn.commit()
    except psycopg.errors.UniqueViolation:raise HTTPException(status_code=409,detail="An account with this email already exists")
    response.set_cookie(SESSION_COOKIE,token,httponly=True,secure=settings.cookie_secure,samesite="lax",max_age=28800,path="/")
    return {"user":{"id":str(uid),"name":payload.name,"email":str(payload.email).lower(),"role":"customer"}}

@app.post("/api/auth/login")
def login(payload:AuthPayload,response:Response):
    with db() as conn:
        row=conn.execute("select id,name,email,password_hash,role from users where email=%s",(str(payload.email).lower(),)).fetchone()
        if not row or not bcrypt.checkpw(payload.password.encode(),row[3].encode()):
            raise HTTPException(status_code=401,detail="Invalid email or password")
        token=create_session(conn,str(row[0]))
        conn.commit()
    response.set_cookie(SESSION_COOKIE,token,httponly=True,secure=settings.cookie_secure,samesite="lax",max_age=28800,path="/")
    return {"user":{"id":str(row[0]),"name":row[1],"email":row[2],"role":row[4]}}

@app.post("/api/auth/logout")
def logout(request:Request,response:Response):
    token=request.cookies.get(SESSION_COOKIE)
    if token:
        token_hash=hashlib.sha256(token.encode()).hexdigest()
        with db() as conn:
            conn.execute("update user_sessions set revoked_at=now() where token_hash=%s and revoked_at is null",(token_hash,))
            conn.commit()
    response.delete_cookie(SESSION_COOKIE,path="/")
    response.headers["Clear-Site-Data"]="cache, cookies"
    response.headers["Cache-Control"]="no-store"
    return {"ok":True}

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
    if status not in allowed:raise HTTPException(status_code=422,detail="Unsupported moderation status")
    with db() as conn:
        cur=conn.execute("update marketplace_listings set status=%s,updated_at=now() where id=%s",(status,uuid.UUID(listing_id)));conn.commit()
        if cur.rowcount==0:raise HTTPException(status_code=404,detail="Listing not found")
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


@app.get("/api/orders/me")
def my_orders(request:Request):
    session=require_session(request)
    with db() as conn:
        rows=conn.execute("""
            select o.id,o.reference,o.status,o.payment_status,o.currency,o.total_amount,
                   o.customer_name,o.created_at,o.updated_at,
                   coalesce(sum(oi.quantity),0)
            from orders o
            left join order_items oi on oi.order_id=o.id
            where o.user_id=%s
            group by o.id
            order by o.created_at desc
            limit 50
        """,(session["sub"],)).fetchall()
    return {"orders":[
        {"id":str(r[0]),"reference":r[1],"status":r[2],"paymentStatus":r[3],
         "currency":r[4],"totalAmount":float(r[5]),"customerName":r[6],
         "createdAt":r[7].isoformat(),"updatedAt":r[8].isoformat(),
         "itemCount":r[9]}
        for r in rows
    ]}

@app.get("/api/quotes/me")
def my_quotes(request:Request):
    session=require_session(request)
    with db() as conn:rows=conn.execute("select reference,name,business,status,created_at from quotes where user_id=%s order by created_at desc limit 50",(session["sub"],)).fetchall()
    return {"quotes":[{"reference":r[0],"name":r[1],"business":r[2],"status":r[3],"createdAt":r[4].isoformat()} for r in rows]}



@app.patch("/api/admin/quotes/{reference}")
def update_quote_status(reference:str,payload:OrderStatusPayload,request:Request):
    actor=require_admin(request)
    allowed={"Draft","Prepared","Sent to Twins","In review","Quoted","Closed"}
    if payload.status not in allowed:
        raise HTTPException(status_code=422,detail="Unsupported quote status")
    with db() as conn:
        row=conn.execute("select id from quotes where reference=%s",(reference,)).fetchone()
        if not row: raise HTTPException(status_code=404,detail="Quote not found")
        conn.execute("update quotes set status=%s,updated_at=now() where reference=%s",(payload.status,reference))
        write_audit(conn,uuid.UUID(actor["sub"]),"quote.status_changed","quote",row[0],{"reference":reference,"status":payload.status})
        conn.commit()
    return {"ok":True,"reference":reference,"status":payload.status}

@app.get("/api/admin/quotes")
def admin_quotes(request:Request):
    require_admin(request)
    with db() as conn:
        rows=conn.execute("""select q.reference,q.name,q.email,q.phone,q.business,q.project_stage,q.location,q.capacity,q.space,q.utilities,q.requirements,q.package_name,q.status,q.created_at,coalesce(sum(qi.quantity),0) from quotes q left join quote_items qi on qi.quote_id=q.id group by q.id order by q.created_at desc limit 100""").fetchall()
    return {"quotes":[{"reference":r[0],"name":r[1],"email":r[2],"phone":r[3],"business":r[4],"stage":r[5],"location":r[6],"capacity":r[7],"space":r[8],"utilities":r[9],"requirements":r[10],"packageName":r[11],"status":r[12],"createdAt":r[13].isoformat(),"itemCount":r[14]} for r in rows]}


def write_audit(conn, actor_user_id, action, entity_type=None, entity_id=None, metadata=None):
    conn.execute(
        "insert into audit_logs (actor_user_id,action,entity_type,entity_id,metadata) values (%s,%s,%s,%s,%s)",
        (actor_user_id, action, entity_type, entity_id, json.dumps(metadata or {}))
    )

@app.get("/api/admin/inventory")
def admin_inventory(request:Request):
    actor=require_admin(request)
    with db() as conn:
        rows=conn.execute("""
            select i.id,p.legacy_catalogue_id,p.name,i.quantity,i.reserved_quantity,
                   i.reorder_level,i.status,i.updated_at
            from inventory i join products p on p.id=i.product_id
            order by p.legacy_catalogue_id
            limit 200
        """).fetchall()
    return {"inventory":[
        {"id":str(r[0]),"productId":r[1],"name":r[2],"quantity":r[3],
         "reservedQuantity":r[4],"reorderLevel":r[5],"status":r[6],
         "updatedAt":r[7].isoformat()}
        for r in rows
    ]}

@app.post("/api/admin/inventory/adjust",status_code=201)
def adjust_inventory(payload:InventoryAdjustmentPayload,request:Request):
    actor=require_admin(request)
    with db() as conn:
        product=conn.execute("select id,name from products where legacy_catalogue_id=%s and active=true",(payload.productId,)).fetchone()
        if not product: raise HTTPException(status_code=404,detail="Product not found")
        row=conn.execute("select id,quantity,reserved_quantity from inventory where product_id=%s for update",(product[0],)).fetchone()
        if not row:
            iid=uuid.uuid4()
            new_quantity=payload.delta
            if new_quantity<0: raise HTTPException(status_code=400,detail="Inventory cannot start below zero")
            conn.execute("insert into inventory (id,product_id,quantity) values (%s,%s,%s)",(iid,product[0],new_quantity))
        else:
            iid,quantity,reserved=row
            new_quantity=quantity+payload.delta
            if new_quantity<reserved: raise HTTPException(status_code=400,detail="Quantity cannot be below reserved stock")
            if new_quantity<0: raise HTTPException(status_code=400,detail="Inventory cannot be negative")
            conn.execute("update inventory set quantity=%s,updated_at=now() where id=%s",(new_quantity,iid))
        conn.execute("insert into inventory_adjustments (inventory_id,actor_user_id,delta,reason) values (%s,%s,%s,%s)",(iid,actor["sub"],payload.delta,payload.reason))
        write_audit(conn,uuid.UUID(actor["sub"]),"inventory.adjusted","inventory",iid,{"productId":payload.productId,"delta":payload.delta,"reason":payload.reason})
        conn.commit()
    return {"ok":True,"productId":payload.productId,"quantity":new_quantity}

@app.get("/api/admin/orders")
def admin_orders(request:Request):
    require_admin(request)
    with db() as conn:
        rows=conn.execute("""
            select id,reference,status,payment_status,currency,total_amount,customer_name,
                   customer_email,customer_phone,created_at,updated_at
            from orders order by created_at desc limit 200
        """).fetchall()
    return {"orders":[
        {"id":str(r[0]),"reference":r[1],"status":r[2],"paymentStatus":r[3],
         "currency":r[4],"totalAmount":float(r[5]),"customerName":r[6],
         "customerEmail":r[7],"customerPhone":r[8],"createdAt":r[9].isoformat(),
         "updatedAt":r[10].isoformat()}
        for r in rows
    ]}

@app.post("/api/admin/orders/from-quote",status_code=201)
def create_order_from_quote(payload:OrderCreatePayload,request:Request):
    actor=require_admin(request)
    with db() as conn:
        quote=conn.execute("""
            select id,user_id,name,email,phone from quotes where reference=%s
        """,(payload.quoteReference,)).fetchone()
        if not quote: raise HTTPException(status_code=404,detail="Quote not found")
        existing=conn.execute("select id,reference from orders where quote_id=%s",(quote[0],)).fetchone()
        if existing: return {"order":{"id":str(existing[0]),"reference":existing[1],"existing":True}}
        oid=uuid.uuid4()
        reference=f"TW-ORD-{datetime.now().year}-{secrets.token_hex(3).upper()}"
        conn.execute("""
            insert into orders
            (id,reference,user_id,quote_id,customer_name,customer_email,customer_phone,notes)
            values (%s,%s,%s,%s,%s,%s,%s,%s)
        """,(oid,reference,quote[1],quote[0],quote[2],quote[3],quote[4],payload.notes))
        items=conn.execute("""
            select qi.product_id,p.legacy_catalogue_id,p.name,qi.quantity
            from quote_items qi left join products p on p.id=qi.product_id
            where qi.quote_id=%s
        """,(quote[0],)).fetchall()
        for item in items:
            conn.execute("""
                insert into order_items
                (id,order_id,product_id,legacy_catalogue_id,name,quantity)
                values (%s,%s,%s,%s,%s,%s)
            """,(uuid.uuid4(),oid,item[0],item[1],item[2] or "Catalogue item",item[3]))
        write_audit(conn,uuid.UUID(actor["sub"]),"order.created","order",oid,{"quoteReference":payload.quoteReference})
        conn.commit()
    return {"order":{"id":str(oid),"reference":reference,"status":"pending","paymentStatus":"unpaid","existing":False}}

@app.patch("/api/admin/orders/{order_id}")
def update_order_status(order_id:str,payload:OrderStatusPayload,request:Request):
    actor=require_admin(request)
    allowed={"pending","confirmed","processing","ready","completed","cancelled"}
    if payload.status not in allowed: raise HTTPException(status_code=422,detail="Unsupported order status")
    oid=uuid.UUID(order_id)
    with db() as conn:
        cur=conn.execute("update orders set status=%s,updated_at=now() where id=%s",(payload.status,oid))
        if cur.rowcount==0: raise HTTPException(status_code=404,detail="Order not found")
        write_audit(conn,uuid.UUID(actor["sub"]),"order.status_changed","order",oid,{"status":payload.status})
        conn.commit()
    return {"ok":True,"status":payload.status}

@app.get("/api/admin/delivery")
def admin_delivery(request:Request):
    require_admin(request)
    with db() as conn:
        rows=conn.execute("""
            select d.id,d.order_id,o.reference,d.recipient_name,d.phone,d.address,d.city,d.state,
                   d.country,d.status,d.tracking_reference,d.scheduled_at,d.delivered_at,d.notes,d.updated_at
            from deliveries d join orders o on o.id=d.order_id
            order by d.created_at desc limit 200
        """).fetchall()
    return {"deliveries":[
        {"id":str(r[0]),"orderId":str(r[1]),"orderReference":r[2],"recipientName":r[3],
         "phone":r[4],"address":r[5],"city":r[6],"state":r[7],"country":r[8],
         "status":r[9],"trackingReference":r[10],
         "scheduledAt":r[11].isoformat() if r[11] else None,
         "deliveredAt":r[12].isoformat() if r[12] else None,"notes":r[13],
         "updatedAt":r[14].isoformat()}
        for r in rows
    ]}

@app.post("/api/admin/delivery",status_code=201)
def create_delivery(payload:DeliveryCreatePayload,request:Request):
    actor=require_admin(request)
    oid=uuid.UUID(payload.orderId);did=uuid.uuid4()
    with db() as conn:
        exists=conn.execute("select id from orders where id=%s",(oid,)).fetchone()
        if not exists: raise HTTPException(status_code=404,detail="Order not found")
        existing=conn.execute("select id from deliveries where order_id=%s",(oid,)).fetchone()
        if existing: raise HTTPException(status_code=409,detail="Delivery already exists for this order")
        conn.execute("""
            insert into deliveries
            (id,order_id,recipient_name,phone,address,city,state,country,notes)
            values (%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """,(did,oid,payload.recipientName,payload.phone,payload.address,payload.city,payload.state,payload.country,payload.notes))
        write_audit(conn,uuid.UUID(actor["sub"]),"delivery.created","delivery",did,{"orderId":payload.orderId})
        conn.commit()
    return {"delivery":{"id":str(did),"orderId":payload.orderId,"status":"pending"}}

@app.patch("/api/admin/delivery/{delivery_id}")
def update_delivery_status(delivery_id:str,payload:DeliveryStatusPayload,request:Request):
    actor=require_admin(request)
    allowed={"pending","scheduled","dispatched","in_transit","delivered","failed","cancelled"}
    if payload.status not in allowed: raise HTTPException(status_code=422,detail="Unsupported delivery status")
    did=uuid.UUID(delivery_id)
    with db() as conn:
        cur=conn.execute("""
            update deliveries
            set status=%s,tracking_reference=coalesce(%s,tracking_reference),
                delivered_at=case when %s='delivered' then now() else delivered_at end,
                updated_at=now()
            where id=%s
        """,(payload.status,payload.trackingReference,payload.status,did))
        if cur.rowcount==0: raise HTTPException(status_code=404,detail="Delivery not found")
        write_audit(conn,uuid.UUID(actor["sub"]),"delivery.status_changed","delivery",did,{"status":payload.status})
        conn.commit()
    return {"ok":True,"status":payload.status}

@app.get("/api/admin/audit")
def admin_audit(request:Request):
    require_admin(request)
    with db() as conn:
        rows=conn.execute("""
            select a.id,a.action,a.entity_type,a.entity_id,a.metadata,a.created_at,
                   coalesce(u.name,u.email,'System')
            from audit_logs a left join users u on u.id=a.actor_user_id
            order by a.created_at desc limit 200
        """).fetchall()
    return {"events":[
        {"id":r[0],"action":r[1],"entityType":r[2],"entityId":str(r[3]) if r[3] else None,
         "metadata":r[4],"createdAt":r[5].isoformat(),"actor":r[6]}
        for r in rows
    ]}



# Operations Admin v1. Server-authoritative commerce operations.
class OrderCreateDetailedPayload(BaseModel):
    quoteReference:str=Field(min_length=4,max_length=80)
    items:list[dict[str,Any]]=Field(default_factory=list,max_length=100)
    deliveryFee:float=Field(default=0,ge=0)
    customerLocation:str|None=None
    customerNotes:str|None=None
    internalNotes:str|None=None

class ProductPayload(BaseModel):
    name:str=Field(min_length=2,max_length=180)
    category:str=Field(min_length=2,max_length=100)
    description:str|None=None
    specifications:dict[str,Any]=Field(default_factory=dict)
    priceMode:str=Field(default="quote")
    price:float|None=Field(default=None,ge=0)
    currency:str=Field(default="NGN",min_length=3,max_length=3)
    availabilityStatus:str=Field(default="available",min_length=2,max_length=40)
    active:bool=True
    mediaIds:list[str]=Field(default_factory=list,max_length=50)

class ProductUpdatePayload(ProductPayload):
    pass

def _slugify_product(value:str)->str:
    slug=re.sub(r"[^a-z0-9]+","-",value.lower()).strip("-")
    return slug or f"product-{secrets.token_hex(3)}"

def _next_catalogue_number(conn):
    return (conn.execute("select coalesce(max(catalogue_number),0)+1 from products").fetchone()[0] or 1)

def _category_id(conn,name:str):
    row=conn.execute("select id from categories where lower(name)=lower(%s)",(name.strip(),)).fetchone()
    if row: return row[0]
    cid=uuid.uuid4(); slug=_slugify_product(name)
    while conn.execute("select 1 from categories where slug=%s",(slug,)).fetchone(): slug=f"{slug}-{secrets.token_hex(2)}"
    conn.execute("insert into categories(id,slug,name) values(%s,%s,%s)",(cid,slug,name.strip()))
    return cid

@app.get("/api/admin/operations/overview")
def operations_overview(request:Request):
    require_admin(request)
    with db() as conn:
        q=conn.execute("select count(*) from quotes where status not in ('Closed')").fetchone()[0]
        orders=conn.execute("select count(*) from orders where status not in ('completed','cancelled')").fetchone()[0]
        awaiting=conn.execute("select count(*) from orders where payment_status in ('unpaid','pending') and status not in ('cancelled','completed')").fetchone()[0]
        paid=conn.execute("select count(*) from orders where payment_status='paid'").fetchone()[0]
        fulfil=conn.execute("select count(*) from orders where fulfilment_status in ('pending','preparing','ready') and payment_status='paid'").fetchone()[0]
        delivery=conn.execute("select count(*) from deliveries where status in ('pending','scheduled','dispatched','in_transit')").fetchone()[0]
        recent=conn.execute("select reference,customer_name,total_amount,payment_status,status,fulfilment_status,created_at from orders order by created_at desc limit 8").fetchall()
    return {"kpis":{"newQuotes":q,"openOrders":orders,"awaitingPayment":awaiting,"paidOrders":paid,"awaitingFulfilment":fulfil,"awaitingDelivery":delivery},
      "recentOrders":[{"reference":r[0],"customerName":r[1],"total":float(r[2]),"paymentStatus":r[3],"status":r[4],"fulfilmentStatus":r[5],"createdAt":r[6].isoformat()} for r in recent]}

@app.get("/api/admin/operations/quotes/{reference}")
def operations_quote_detail(reference:str,request:Request):
    require_admin(request)
    with db() as conn:
        q=conn.execute("select q.id,q.reference,q.user_id,q.name,q.email,q.phone,q.business,q.project_stage,q.location,q.capacity,q.space,q.utilities,q.requirements,q.package_name,q.status,q.created_at,q.updated_at from quotes q where q.reference=%s",(reference,)).fetchone()
        if not q: raise HTTPException(status_code=404,detail="Quote not found")
        items=conn.execute("select qi.product_id,coalesce(p.name,'Catalogue item'),qi.quantity,p.legacy_catalogue_id from quote_items qi left join products p on p.id=qi.product_id where qi.quote_id=%s",(q[0],)).fetchall()
    return {"quote":{"id":str(q[0]),"reference":q[1],"userId":str(q[2]) if q[2] else None,"name":q[3],"email":q[4],"phone":q[5],"business":q[6],"stage":q[7],"location":q[8],"capacity":q[9],"space":q[10],"utilities":q[11],"requirements":q[12],"packageName":q[13],"status":q[14],"createdAt":q[15].isoformat(),"updatedAt":q[16].isoformat(),"items":[{"productId":str(x[0]) if x[0] else None,"name":x[1],"quantity":x[2],"legacyId":x[3]} for x in items]}}

@app.get("/api/admin/operations/orders/{order_id}")
def operations_order_detail(order_id:str,request:Request):
    require_admin(request); oid=uuid.UUID(order_id)
    with db() as conn:
        r=conn.execute("""select id,reference,user_id,quote_id,status,payment_status,fulfilment_status,currency,subtotal,delivery_fee,total_amount,customer_name,customer_email,customer_phone,customer_location,notes,internal_notes,created_at,updated_at from orders where id=%s""",(oid,)).fetchone()
        if not r: raise HTTPException(status_code=404,detail="Order not found")
        items=conn.execute("select id,product_id,product_name_snapshot,quantity,agreed_unit_price,line_total from order_items where order_id=%s order by id",(oid,)).fetchall()
        payments=conn.execute("select id,reference,gateway,provider_reference,amount,currency,status,gateway_status,created_at,paid_at from payment_transactions where order_id=%s order by created_at desc",(oid,)).fetchall()
        delivery=conn.execute("select id,status,recipient_name,phone,address,city,state,country,tracking_reference,scheduled_at,delivered_at,notes from deliveries where order_id=%s",(oid,)).fetchone()
    return {"order":{"id":str(r[0]),"reference":r[1],"userId":str(r[2]) if r[2] else None,"quoteId":str(r[3]) if r[3] else None,"status":r[4],"paymentStatus":r[5],"fulfilmentStatus":r[6],"currency":r[7],"subtotal":float(r[8]),"deliveryFee":float(r[9]),"total":float(r[10]),"customer":{"name":r[11],"email":r[12],"phone":r[13],"location":r[14]},"notes":r[15],"internalNotes":r[16],"createdAt":r[17].isoformat(),"updatedAt":r[18].isoformat(),"items":[{"id":str(x[0]),"productId":str(x[1]) if x[1] else None,"name":x[2],"quantity":x[3],"unitPrice":float(x[4] or 0),"lineTotal":float(x[5] or 0)} for x in items],"payments":[{"id":str(x[0]),"reference":x[1],"gateway":x[2],"providerReference":x[3],"amount":float(x[4]),"currency":x[5],"status":x[6],"gatewayStatus":x[7],"createdAt":x[8].isoformat(),"paidAt":x[9].isoformat() if x[9] else None} for x in payments],"delivery":None if not delivery else {"id":str(delivery[0]),"status":delivery[1],"recipientName":delivery[2],"phone":delivery[3],"address":delivery[4],"city":delivery[5],"state":delivery[6],"country":delivery[7],"trackingReference":delivery[8],"scheduledAt":delivery[9].isoformat() if delivery[9] else None,"deliveredAt":delivery[10].isoformat() if delivery[10] else None,"notes":delivery[11]} }}

@app.post("/api/admin/operations/orders/from-quote",status_code=201)
def create_detailed_order(payload:OrderCreateDetailedPayload,request:Request):
    actor=require_admin(request)
    with db() as conn:
        quote=conn.execute("select id,user_id,name,email,phone,location from quotes where reference=%s for update",(payload.quoteReference,)).fetchone()
        if not quote: raise HTTPException(status_code=404,detail="Quote not found")
        if conn.execute("select id from orders where quote_id=%s",(quote[0],)).fetchone(): raise HTTPException(status_code=409,detail="An order already exists for this quote")
        oid=uuid.uuid4(); reference=f"TK-{_next_catalogue_number(conn):06d}"
        while conn.execute("select 1 from orders where reference=%s",(reference,)).fetchone():
            reference=f"TK-{secrets.randbelow(999999):06d}"
        subtotal=0; valid_items=[]
        for item in payload.items:
            pid=uuid.UUID(str(item.get("productId"))); qty=int(item.get("quantity",0)); price=float(item.get("agreedUnitPrice",0))
            if qty<1 or price<0: raise HTTPException(status_code=422,detail="Invalid order item")
            row=conn.execute("select name from products where id=%s",(pid,)).fetchone()
            if not row: raise HTTPException(status_code=404,detail="Product not found")
            line=qty*price; subtotal+=line; valid_items.append((pid,row[0],qty,price,line))
        if not valid_items: raise HTTPException(status_code=422,detail="At least one order item is required")
        total=subtotal+payload.deliveryFee
        conn.execute("""insert into orders(id,reference,user_id,quote_id,status,payment_status,fulfilment_status,currency,subtotal,delivery_fee,total_amount,customer_name,customer_email,customer_phone,customer_location,notes,internal_notes)
          values(%s,%s,%s,%s,'confirmed','unpaid','pending','NGN',%s,%s,%s,%s,%s,%s,%s,%s,%s)""",(oid,reference,quote[1],quote[0],subtotal,payload.deliveryFee,total,quote[2],quote[3],quote[4],payload.customerLocation or quote[5],payload.customerNotes,payload.internalNotes))
        for pid,name,qty,price,line in valid_items:
            conn.execute("insert into order_items(id,order_id,product_id,product_name_snapshot,quantity,agreed_unit_price,line_total,name,unit_amount) values(%s,%s,%s,%s,%s,%s,%s,%s,%s)",(uuid.uuid4(),oid,pid,name,qty,price,line,name,price))
        write_audit(conn,uuid.UUID(actor["sub"]),"order.created","order",oid,{"quoteReference":payload.quoteReference,"total":total})
        conn.commit()
    return {"order":{"id":str(oid),"reference":reference,"status":"confirmed","paymentStatus":"unpaid","total":total}}

@app.patch("/api/admin/operations/orders/{order_id}/fulfilment")
def update_operations_fulfilment(order_id:str,payload:OrderStatusPayload,request:Request):
    actor=require_admin(request); allowed={"pending","preparing","ready","out_for_delivery","delivered"}
    if payload.status not in allowed: raise HTTPException(status_code=422,detail="Unsupported fulfilment status")
    oid=uuid.UUID(order_id)
    with db() as conn:
        cur=conn.execute("update orders set fulfilment_status=%s,updated_at=now() where id=%s",(payload.status,oid))
        if cur.rowcount==0: raise HTTPException(status_code=404,detail="Order not found")
        if payload.status=="delivered": conn.execute("update orders set status='completed',updated_at=now() where id=%s",(oid,))
        write_audit(conn,uuid.UUID(actor["sub"]),"order.fulfilment_changed","order",oid,{"status":payload.status}); conn.commit()
    return {"ok":True,"status":payload.status}

@app.get("/api/admin/operations/payments")
def operations_payments(request:Request):
    require_admin(request)
    with db() as conn:
        rows=conn.execute("""select pt.id,pt.reference,pt.gateway,pt.provider_reference,pt.amount,pt.currency,pt.status,pt.gateway_status,pt.created_at,pt.paid_at,o.reference from payment_transactions pt left join orders o on o.id=pt.order_id order by pt.created_at desc limit 200""").fetchall()
    return {"payments":[{"id":str(r[0]),"reference":r[1],"gateway":r[2],"providerReference":r[3],"amount":float(r[4]),"currency":r[5],"status":r[6],"gatewayStatus":r[7],"createdAt":r[8].isoformat(),"paidAt":r[9].isoformat() if r[9] else None,"orderReference":r[10]} for r in rows]}

@app.get("/api/admin/operations/customers")
def operations_customers(request:Request):
    require_admin(request)
    with db() as conn:
        rows=conn.execute("""select u.id,u.name,u.phone,u.email,u.created_at,count(distinct q.id),count(distinct o.id),coalesce(sum(case when o.payment_status='paid' then o.total_amount else 0 end),0),max(o.created_at)
          from users u left join quotes q on q.user_id=u.id left join orders o on o.user_id=u.id where u.role='customer' group by u.id order by u.created_at desc limit 200""").fetchall()
    return {"customers":[{"id":str(r[0]),"name":r[1],"phone":r[2],"email":r[3],"createdAt":r[4].isoformat(),"quoteCount":r[5],"orderCount":r[6],"totalPaid":float(r[7]),"latestOrderAt":r[8].isoformat() if r[8] else None} for r in rows]}

@app.get("/api/admin/operations/delivery")
def operations_delivery(request:Request):
    require_admin(request)
    with db() as conn:
        rows=conn.execute("""select o.id,o.reference,o.customer_name,o.customer_phone,o.customer_location,o.payment_status,o.fulfilment_status,o.total_amount,d.status,d.address,d.city,d.state,d.notes
          from orders o left join deliveries d on d.order_id=o.id where o.payment_status='paid' or o.fulfilment_status<>'pending' order by o.updated_at desc limit 200""").fetchall()
    return {"delivery":[{"orderId":str(r[0]),"orderReference":r[1],"customerName":r[2],"phone":r[3],"destination":r[4],"paymentStatus":r[5],"fulfilmentStatus":r[6],"total":float(r[7]),"deliveryStatus":r[8] or "not_scheduled","address":r[9],"city":r[10],"state":r[11],"notes":r[12]} for r in rows]}

@app.get("/api/admin/operations/products")
def operations_products(request:Request):
    require_admin(request)
    with db() as conn:
        rows=conn.execute("""select p.id,p.catalogue_number,p.name,coalesce(c.name,''),p.description,p.specifications,p.price_mode,p.price,p.currency,p.availability_status,p.active,p.status,
          (select count(*) from product_media pm where pm.product_id=p.id) from products p left join categories c on c.id=p.category_id order by p.catalogue_number nulls last,p.name""").fetchall()
    return {"products":[{"id":str(r[0]),"catalogueNumber":r[1],"name":r[2],"category":r[3],"description":r[4],"specifications":r[5] or {},"priceMode":r[6],"price":float(r[7]) if r[7] is not None else None,"currency":r[8],"availabilityStatus":r[9],"active":r[10],"status":r[11],"mediaCount":r[12]} for r in rows]}

@app.post("/api/admin/operations/products",status_code=201)
def create_operations_product(payload:ProductPayload,request:Request):
    actor=require_admin(request)
    if payload.priceMode not in ("quote","fixed"): raise HTTPException(status_code=422,detail="priceMode must be quote or fixed")
    if payload.priceMode=="fixed" and payload.price is None: raise HTTPException(status_code=422,detail="Fixed-price products require a price")
    with db() as conn:
        pid=uuid.uuid4(); number=_next_catalogue_number(conn); slug=_slugify_product(payload.name)
        while conn.execute("select 1 from products where slug=%s",(slug,)).fetchone(): slug=f"{slug}-{secrets.token_hex(2)}"
        cid=_category_id(conn,payload.category)
        conn.execute("""insert into products(id,catalogue_number,category_id,name,slug,description,tag,price_mode,price,currency,availability_status,active,status,specifications)
          values(%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'DRAFT',%s)""",(pid,number,cid,payload.name,slug,payload.description,payload.category,payload.priceMode,payload.price,payload.currency,payload.availabilityStatus,payload.active,json.dumps(payload.specifications)))
        for i,mid in enumerate(payload.mediaIds):
            conn.execute("update product_media set product_id=%s,sort_order=%s where id=%s and source in ('OWNER','OWNER/LOCAL','LOCAL','TWINS_OWNER')",(pid,i,uuid.UUID(mid)))
        write_audit(conn,uuid.UUID(actor["sub"]),"product.created","product",pid,{"catalogueNumber":number}); conn.commit()
    return {"product":{"id":str(pid),"catalogueNumber":number,"name":payload.name,"status":"DRAFT"}}

@app.patch("/api/admin/operations/products/{product_id}")
def update_operations_product(product_id:str,payload:ProductUpdatePayload,request:Request):
    actor=require_admin(request); pid=uuid.UUID(product_id)
    if payload.priceMode not in ("quote","fixed") or (payload.priceMode=="fixed" and payload.price is None): raise HTTPException(status_code=422,detail="Invalid pricing configuration")
    with db() as conn:
        row=conn.execute("select id from products where id=%s",(pid,)).fetchone()
        if not row: raise HTTPException(status_code=404,detail="Product not found")
        cid=_category_id(conn,payload.category)
        conn.execute("""update products set category_id=%s,name=%s,description=%s,tag=%s,price_mode=%s,price=%s,currency=%s,availability_status=%s,active=%s,specifications=%s,updated_at=now() where id=%s""",(cid,payload.name,payload.description,payload.category,payload.priceMode,payload.price,payload.currency,payload.availabilityStatus,payload.active,json.dumps(payload.specifications),pid))
        if payload.mediaIds is not None:
            conn.execute("update product_media set product_id=null where product_id=%s and source in ('OWNER','OWNER/LOCAL','LOCAL','TWINS_OWNER') and id <> all(%s::uuid[])",(pid,[uuid.UUID(x) for x in payload.mediaIds] or [uuid.uuid4()]))
            for i,mid in enumerate(payload.mediaIds): conn.execute("update product_media set product_id=%s,sort_order=%s where id=%s and source in ('OWNER','OWNER/LOCAL','LOCAL','TWINS_OWNER')",(pid,i,uuid.UUID(mid)))
        write_audit(conn,uuid.UUID(actor["sub"]),"product.updated","product",pid,{"name":payload.name}); conn.commit()
    return {"ok":True}

@app.patch("/api/admin/operations/products/{product_id}/archive")
def archive_operations_product(product_id:str,request:Request):
    actor=require_admin(request); pid=uuid.UUID(product_id)
    with db() as conn:
        cur=conn.execute("update products set active=false,status='ARCHIVED',updated_at=now() where id=%s",(pid,))
        if cur.rowcount==0: raise HTTPException(status_code=404,detail="Product not found")
        write_audit(conn,uuid.UUID(actor["sub"]),"product.archived","product",pid); conn.commit()
    return {"ok":True}

@app.post("/api/admin/operations/orders/{order_id}/payments",status_code=201)
def initialize_paystack_payment(order_id:str,request:Request):
    actor=require_admin(request); oid=uuid.UUID(order_id)
    if not settings.paystack_secret_key: raise HTTPException(status_code=503,detail="PAYSTACK_SECRET_KEY is not configured")
    with db() as conn:
        order=conn.execute("select id,reference,total_amount,currency,customer_name,customer_email,customer_phone,payment_status from orders where id=%s for update",(oid,)).fetchone()
        if not order: raise HTTPException(status_code=404,detail="Order not found")
        if order[7]=="paid": raise HTTPException(status_code=409,detail="Order is already paid")
        if not order[5]: raise HTTPException(status_code=422,detail="Customer email is required for Paystack payment")
        reference=f"TKPAY-{order[1]}-{secrets.token_hex(5).upper()}"
        payload={"email":order[5],"amount":int(round(float(order[2])*100)),"currency":order[3],"reference":reference,"metadata":{"orderId":str(oid),"orderReference":order[1]}}
        try:
            with httpx.Client(timeout=20) as client: resp=client.post(settings.paystack_base_url+"/transaction/initialize",headers={"Authorization":"Bearer "+settings.paystack_secret_key,"Content-Type":"application/json"},json=payload)
        except httpx.HTTPError as exc: raise HTTPException(status_code=502,detail=f"Payment provider unavailable: {exc}")
        data=resp.json()
        if resp.status_code>=400 or not data.get("status"): raise HTTPException(status_code=502,detail=data.get("message","Paystack initialization failed"))
        provider_ref=data["data"]["reference"]
        conn.execute("insert into payment_transactions(id,order_id,user_id,reference,provider_reference,gateway,purpose,amount,currency,status,gateway_status,metadata) values(%s,%s,%s,%s,%s,'paystack','order',%s,%s,'pending','initialized',%s)",(uuid.uuid4(),oid,order[0] if order[0] else None,reference,provider_ref,order[2],order[3],json.dumps(data.get("data",{}))))
        conn.execute("update orders set payment_status='pending',updated_at=now() where id=%s",(oid,))
        write_audit(conn,uuid.UUID(actor["sub"]),"payment.request_created","order",oid,{"reference":reference}); conn.commit()
    return {"payment":{"reference":reference,"providerReference":provider_ref,"authorizationUrl":data["data"].get("authorization_url"),"amount":float(order[2]),"currency":order[3],"status":"pending"}}

@app.post("/api/payments/paystack/webhook")
async def paystack_webhook(request:Request):
    body=await request.body(); signature=request.headers.get("x-paystack-signature","")
    if not settings.paystack_secret_key or not signature: raise HTTPException(status_code=401,detail="Webhook verification unavailable")
    expected=hmac.new(settings.paystack_secret_key.encode(),body,hashlib.sha512).hexdigest()
    if not hmac.compare_digest(expected,signature): raise HTTPException(status_code=401,detail="Invalid webhook signature")
    event=json.loads(body.decode("utf-8")); data=event.get("data") or {}; provider_ref=data.get("reference")
    if event.get("event") not in ("charge.success","charge.failed") or not provider_ref: return {"ok":True}
    with db() as conn:
        tx=conn.execute("select id,order_id,amount,currency,status from payment_transactions where provider_reference=%s for update",(provider_ref,)).fetchone()
        if not tx: return {"ok":True}
        if tx[4]=="successful": return {"ok":True,"duplicate":True}
        success=event.get("event")=="charge.success" and data.get("status")=="success" and int(data.get("amount") or 0)==int(round(float(tx[2])*100)) and str(data.get("currency") or "").upper()==str(tx[3]).upper()
        new_status="successful" if success else "failed"
        conn.execute("update payment_transactions set status=%s,gateway_status=%s,processed_at=now(),paid_at=case when %s='successful' then now() else paid_at end,updated_at=now() where id=%s",(new_status,data.get("status"),new_status,tx[0]))
        if success:
            conn.execute("update orders set payment_status='paid',updated_at=now() where id=%s",(tx[1],))
            write_audit(conn,None,"payment.received","order",tx[1],{"providerReference":provider_ref})
        conn.commit()
    return {"ok":True}

# Photo-first owner intake.
_INTAKE_EXTENSIONS={".jpg",".jpeg",".png",".webp",".gif",".bmp"}
_INTAKE_MIME_PREFIX="image/"

def _safe_name(value:str)->str:
    value=Path(value or "photo").name
    value=re.sub(r"[^A-Za-z0-9._ -]+","_",value).strip(" .")
    return value or "photo"

def _normalise_words(value:str)->str:
    value=re.sub(r"[_-]+"," ",value.lower())
    value=re.sub(r"\b(?:front|back|side|left|right|top|bottom|angle|view|photo|image|img|pic)\b"," ",value)
    value=re.sub(r"\b\d{1,4}\b$"," ",value)
    value=re.sub(r"\s+"," ",value).strip()
    return value

def _bucket_name(relative_path:str,filename:str)->str:
    text=(relative_path or filename).lower()
    rules=[
        ("Mixers",("mixer","planetary","spiral mixer")),
        ("Ovens",("oven","deck oven","rack oven","convection")),
        ("Slicers",("slicer","bread slicer","meat slicer")),
        ("Refrigeration",("refrigerator","refrigeration","freezer","chiller","display cooler","cold room")),
        ("Tables",("table","workbench","work table")),
        ("Dough & Bakery Machines",("dough","sheeter","proofer","proofing","divider")),
        ("Packaging Machines",("packaging","sealer","filler","wrapping")),
        ("Cooking Equipment",("range","fryer","grill","griddle","cooker")),
    ]
    for name,words in rules:
        if any(w in text for w in words): return name
    parts=Path(relative_path).parts if relative_path else ()
    if len(parts)>1:
        return _normalise_words(parts[-2]).title() or "Other"
    return "Other"

def _group_key(relative_path:str,filename:str)->str:
    stem=Path(filename).stem
    parent=Path(relative_path).parent.as_posix() if relative_path else ""
    clean=_normalise_words(stem)
    # Keep meaningful capacity/model tokens; only strip trailing sequence/view tokens.
    clean=re.sub(r"\s+(?:\d{1,4}|a|b|c)$","",clean).strip()
    return f"{parent.lower()}::{clean}" if parent and parent!="." else clean

def _image_signature(content:bytes,filename:str)->bool:
    ext=Path(filename).suffix.lower()
    if ext in (".jpg",".jpeg"): return content[:3]==b"\xff\xd8\xff"
    if ext==".png": return content[:8]==b"\x89PNG\r\n\x1a\n"
    if ext==".gif": return content[:6] in (b"GIF87a",b"GIF89a")
    if ext==".webp": return content[:4]==b"RIFF" and content[8:12]==b"WEBP"
    if ext==".bmp": return content[:2]==b"BM"
    return False

class IntakeGroupPayload(BaseModel):
    assetIds:list[str]=Field(min_length=1,max_length=5000)
    name:str|None=None

class IntakeNamePayload(BaseModel):
    name:str=Field(min_length=2,max_length=200)
    productType:str|None=Field(default=None,max_length=120)
    category:str|None=Field(default=None,max_length=120)

class IntakeMovePayload(BaseModel):
    assetIds:list[str]=Field(min_length=1,max_length=5000)
    targetGroupId:str|None=None

class IntakeMergePayload(BaseModel):
    groupIds:list[str]=Field(min_length=2,max_length=100)

class IntakeStatusPayload(BaseModel):
    status:str=Field(min_length=3,max_length=30)

@app.post("/api/admin/intake/batches",status_code=201)
def intake_create_batch(name:str=Form("Owner photo intake"),request:Request=None):
    actor=require_admin(request)
    bid=uuid.uuid4()
    with db() as conn:
        conn.execute("insert into intake_batches (id,name,created_by) values (%s,%s,%s)",(bid,name.strip() or "Owner photo intake",actor["sub"]))
        write_audit(conn,uuid.UUID(actor["sub"]),"intake.batch_created","intake_batch",bid,{"name":name})
        conn.commit()
    return {"batch":{"id":str(bid),"name":name.strip() or "Owner photo intake","status":"OPEN"}}

@app.post("/api/admin/intake/batches/{batch_id}/upload",status_code=201)
async def intake_upload(batch_id:str,request:Request,files:list[UploadFile]=File(...),relative_paths:str=Form("[]")):
    actor=require_admin(request)
    try: bid=uuid.UUID(batch_id)
    except ValueError: raise HTTPException(status_code=422,detail="Invalid batch id")
    try: paths=json.loads(relative_paths)
    except Exception: paths=[]
    if not isinstance(paths,list): paths=[]
    with db() as conn:
        if not conn.execute("select id from intake_batches where id=%s",(bid,)).fetchone():
            raise HTTPException(status_code=404,detail="Intake batch not found")
        created=[]
        for idx,upload in enumerate(files):
            original=_safe_name(upload.filename or "photo")
            ext=Path(original).suffix.lower()
            if ext not in _INTAKE_EXTENSIONS or not (upload.content_type or "").startswith(_INTAKE_MIME_PREFIX):
                raise HTTPException(status_code=415,detail=f"Unsupported image: {original}")
            data=await upload.read()
            if not data or len(data)>25*1024*1024:
                raise HTTPException(status_code=413,detail=f"Invalid image size: {original}")
            if not _image_signature(data,original):
                raise HTTPException(status_code=415,detail=f"Image signature does not match file type: {original}")
            digest=hashlib.sha256(data).hexdigest()
            asset_id=uuid.uuid4()
            rel=str(paths[idx]) if idx<len(paths) else original
            duplicate=conn.execute("select id from intake_assets where sha256=%s order by created_at limit 1",(digest,)).fetchone()
            dest=INTAKE_ROOT/str(bid)
            dest.mkdir(parents=True,exist_ok=True)
            filename=f"{asset_id.hex}{ext}"
            storage=dest/filename
            storage.write_bytes(data)
            conn.execute("""insert into intake_assets
                (id,batch_id,original_name,relative_path,storage_path,mime_type,byte_size,sha256,duplicate_of)
                values (%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (asset_id,bid,original,rel,str(storage.relative_to(INTAKE_ROOT)),upload.content_type,len(data),digest,duplicate[0] if duplicate else None))
            created.append({"id":str(asset_id),"name":original,"relativePath":rel,"duplicateOf":str(duplicate[0]) if duplicate else None,"sha256":digest})
        conn.execute("update intake_batches set updated_at=now() where id=%s",(bid,))
        write_audit(conn,uuid.UUID(actor["sub"]),"intake.assets_uploaded","intake_batch",bid,{"count":len(created)})
        conn.commit()
    return {"assets":created}

@app.get("/api/admin/intake/assets/{asset_id}/file")
def intake_asset_file(asset_id:str,request:Request):
    require_admin(request)
    try: aid=uuid.UUID(asset_id)
    except ValueError: raise HTTPException(status_code=422,detail="Invalid asset id")
    with db() as conn: row=conn.execute("select storage_path,mime_type,original_name from intake_assets where id=%s",(aid,)).fetchone()
    if not row: raise HTTPException(status_code=404,detail="Asset not found")
    path=INTAKE_ROOT/row[0]
    if not path.is_file(): raise HTTPException(status_code=404,detail="Stored photo not found")
    return FileResponse(path,media_type=row[1],filename=row[2])

@app.get("/api/admin/intake/batches/{batch_id}")
def intake_batch(batch_id:str,request:Request):
    require_admin(request)
    try: bid=uuid.UUID(batch_id)
    except ValueError: raise HTTPException(status_code=422,detail="Invalid batch id")
    with db() as conn:
        batch=conn.execute("select id,name,status,created_at,updated_at from intake_batches where id=%s",(bid,)).fetchone()
        if not batch: raise HTTPException(status_code=404,detail="Intake batch not found")
        assets=conn.execute("""select id,original_name,relative_path,byte_size,sha256,duplicate_of,created_at
                               from intake_assets where batch_id=%s order by created_at""",(bid,)).fetchall()
        buckets=conn.execute("""select id,name,normalized_key from intake_buckets where batch_id=%s order by name""",(bid,)).fetchall()
        groups=conn.execute("""select cg.id,cg.bucket_id,cg.name,cg.status,cg.grouping_basis,cg.product_id,
                                      count(cga.asset_id)
                               from candidate_groups cg
                               left join candidate_group_assets cga on cga.group_id=cg.id
                               where cg.bucket_id in (select id from intake_buckets where batch_id=%s)
                               group by cg.id order by cg.created_at""",(bid,)).fetchall()
        group_assets=conn.execute("""select cga.group_id,cga.asset_id
                                     from candidate_group_assets cga
                                     join candidate_groups cg on cg.id=cga.group_id
                                     join intake_buckets ib on ib.id=cg.bucket_id
                                     where ib.batch_id=%s""",(bid,)).fetchall()
    return {"batch":{"id":str(batch[0]),"name":batch[1],"status":batch[2],"createdAt":batch[3].isoformat(),"updatedAt":batch[4].isoformat()},
            "assets":[{"id":str(r[0]),"name":r[1],"relativePath":r[2],"size":r[3],"sha256":r[4],"duplicateOf":str(r[5]) if r[5] else None,"createdAt":r[6].isoformat()} for r in assets],
            "buckets":[{"id":str(r[0]),"name":r[1],"normalizedKey":r[2]} for r in buckets],
            "groups":[{"id":str(r[0]),"bucketId":str(r[1]),"name":r[2],"status":r[3],"basis":r[4],"productId":str(r[5]) if r[5] else None,"assetCount":r[6]} for r in groups],
            "groupAssets":[{"groupId":str(r[0]),"assetId":str(r[1])} for r in group_assets]}

@app.post("/api/admin/intake/batches/{batch_id}/suggest",status_code=201)
def intake_suggest(batch_id:str,request:Request):
    actor=require_admin(request)
    bid=uuid.UUID(batch_id)
    with db() as conn:
        assets=conn.execute("select id,original_name,relative_path from intake_assets where batch_id=%s order by created_at",(bid,)).fetchall()
        if not assets: return {"createdGroups":0,"message":"No photos to organize yet"}
        bucket_map={}
        group_map={}
        for aid,name,rel in assets:
            bname=_bucket_name(rel,name); bkey=re.sub(r"[^a-z0-9]+","-",bname.lower()).strip("-") or "other"
            brow=conn.execute("select id from intake_buckets where batch_id=%s and normalized_key=%s",(bid,bkey)).fetchone()
            if not brow:
                bucket_id=uuid.uuid4();conn.execute("insert into intake_buckets (id,batch_id,name,normalized_key) values (%s,%s,%s,%s)",(bucket_id,bid,bname,bkey))
            else: bucket_id=brow[0]
            gkey=_group_key(rel,name)
            if not gkey: gkey=f"asset-{aid}"
            mapkey=(bucket_id,gkey)
            if mapkey not in group_map:
                grow=conn.execute("select id from candidate_groups where bucket_id=%s and name=%s and status in ('SUGGESTED','UNRESOLVED')",(bucket_id,gkey[:160])).fetchone()
                gid=grow[0] if grow else uuid.uuid4()
                if not grow:
                    conn.execute("insert into candidate_groups (id,bucket_id,name,status,grouping_basis) values (%s,%s,%s,'SUGGESTED','FILENAME')",(gid,bucket_id,gkey[:160]))
                group_map[mapkey]=gid
            gid=group_map[mapkey]
            conn.execute("insert into candidate_group_assets (group_id,asset_id) values (%s,%s) on conflict do nothing",(gid,aid))
        write_audit(conn,uuid.UUID(actor["sub"]),"intake.suggestions_generated","intake_batch",bid,{"assets":len(assets)})
        conn.commit()
    return {"createdGroups":len(group_map)}

@app.post("/api/admin/intake/groups",status_code=201)
def intake_create_group(payload:IntakeGroupPayload,request:Request):
    actor=require_admin(request)
    asset_ids=[uuid.UUID(x) for x in payload.assetIds]
    with db() as conn:
        row=conn.execute("""select a.batch_id from intake_assets a where a.id=%s""",(asset_ids[0],)).fetchone()
        if not row: raise HTTPException(status_code=404,detail="Asset not found")
        bid=row[0]
        bucket_id=uuid.uuid4()
        name=(payload.name or "New product group").strip()
        conn.execute("insert into intake_buckets (id,batch_id,name,normalized_key) values (%s,%s,%s,%s) on conflict do nothing",(bucket_id,bid,"Manual grouping",f"manual-{bucket_id.hex}"))
        gid=uuid.uuid4()
        conn.execute("insert into candidate_groups (id,bucket_id,name,status,grouping_basis) values (%s,%s,%s,'UNRESOLVED','MANUAL')",(gid,bucket_id,name))
        for pos,aid in enumerate(asset_ids):
            conn.execute("insert into candidate_group_assets (group_id,asset_id,position) values (%s,%s,%s) on conflict do nothing",(gid,aid,pos))
        write_audit(conn,uuid.UUID(actor["sub"]),"intake.group_created","candidate_group",gid,{"assetCount":len(asset_ids)})
        conn.commit()
    return {"group":{"id":str(gid),"name":name,"status":"UNRESOLVED","assetCount":len(asset_ids)}}

@app.post("/api/admin/intake/groups/{group_id}/move")
def intake_move_assets(group_id:str,payload:IntakeMovePayload,request:Request):
    actor=require_admin(request)
    gid=uuid.UUID(group_id); aids=[uuid.UUID(x) for x in payload.assetIds]
    with db() as conn:
        target=uuid.UUID(payload.targetGroupId) if payload.targetGroupId else uuid.uuid4()
        if not payload.targetGroupId:
            brow=conn.execute("select bucket_id from candidate_groups where id=%s",(gid,)).fetchone()
            if not brow: raise HTTPException(status_code=404,detail="Source group not found")
            target=uuid.uuid4()
            conn.execute("insert into candidate_groups (id,bucket_id,name,status,grouping_basis) values (%s,%s,'New product group','UNRESOLVED','MANUAL')",(target,brow[0]))
        if not conn.execute("select id from candidate_groups where id=%s",(target,)).fetchone(): raise HTTPException(status_code=404,detail="Target group not found")
        conn.execute("delete from candidate_group_assets where group_id=%s and asset_id=any(%s)",(gid,aids))
        for aid in aids: conn.execute("insert into candidate_group_assets (group_id,asset_id) values (%s,%s) on conflict do nothing",(target,aid))
        conn.execute("update candidate_groups set updated_at=now(),status='UNRESOLVED' where id=%s",(target,))
        conn.commit()
    return {"targetGroupId":str(target)}

@app.post("/api/admin/intake/groups/merge")
def intake_merge_groups(payload:IntakeMergePayload,request:Request):
    actor=require_admin(request)
    gids=[uuid.UUID(x) for x in payload.groupIds]
    keep=gids[0]
    with db() as conn:
        if len(conn.execute("select id from candidate_groups where id=any(%s)",(gids,)).fetchall())!=len(gids): raise HTTPException(status_code=404,detail="One or more groups not found")
        for gid in gids[1:]:
            conn.execute("insert into candidate_group_assets (group_id,asset_id,position) select %s,asset_id,position from candidate_group_assets where group_id=%s on conflict do nothing",(keep,gid))
            conn.execute("delete from candidate_group_assets where group_id=%s",(gid,))
            conn.execute("update candidate_groups set status='MERGED',updated_at=now() where id=%s",(gid,))
        conn.execute("update candidate_groups set status='UNRESOLVED',updated_at=now() where id=%s",(keep,))
        conn.commit()
    return {"groupId":str(keep)}

@app.patch("/api/admin/intake/groups/{group_id}")
def intake_update_group(group_id:str,payload:IntakeStatusPayload,request:Request):
    require_admin(request)
    allowed={"SUGGESTED","UNRESOLVED","CONFIRMED","NAMED","ARCHIVED"}
    if payload.status not in allowed: raise HTTPException(status_code=422,detail="Unsupported group status")
    with db() as conn:
        cur=conn.execute("update candidate_groups set status=%s,updated_at=now() where id=%s",(payload.status,uuid.UUID(group_id)))
        if cur.rowcount==0: raise HTTPException(status_code=404,detail="Group not found")
        conn.commit()
    return {"ok":True,"status":payload.status}

@app.post("/api/admin/intake/groups/{group_id}/name",status_code=201)
def intake_name_group(group_id:str,payload:IntakeNamePayload,request:Request):
    actor=require_admin(request)
    gid=uuid.UUID(group_id);name=payload.name.strip()
    if not name: raise HTTPException(status_code=422,detail="Product name is required")
    with db() as conn:
        group=conn.execute("""select cg.id,cg.product_id,ib.name,ib.batch_id
                              from candidate_groups cg join intake_buckets ib on ib.id=cg.bucket_id where cg.id=%s""",(gid,)).fetchone()
        if not group: raise HTTPException(status_code=404,detail="Group not found")
        if group[1]: raise HTTPException(status_code=409,detail="This group already has a product")
        category_id=None
        if payload.category:
            category_id=conn.execute("select id from categories where lower(name)=lower(%s) limit 1",(payload.category,)).fetchone()
            category_id=category_id[0] if category_id else None
        pid=uuid.uuid4()
        max_id=conn.execute("select coalesce(max(catalogue_number),0) from products").fetchone()[0] or 0
        product_number=max_id+1
        slug=re.sub(r"[^a-z0-9]+","-",name.lower()).strip("-") or f"product-{product_number}"
        base=slug
        n=2
        while conn.execute("select 1 from products where slug=%s",(slug,)).fetchone():
            slug=f"{base}-{n}";n+=1
        conn.execute("""insert into products
            (id,catalogue_number,category_id,name,slug,description,tag,price_mode,active,status,product_type,owner_confirmed_at)
            values (%s,%s,%s,%s,%s,%s,%s,'quote',true,'DRAFT',%s,now())""",
            (pid,product_number,category_id,name,slug,"Owner-confirmed product from photo intake.",None,payload.productType or group[2]))
        assets=conn.execute("select a.id,a.original_name,a.storage_path from candidate_group_assets cga join intake_assets a on a.id=cga.asset_id where cga.group_id=%s order by cga.position,a.created_at",(gid,)).fetchall()
        for pos,a in enumerate(assets):
            src="storage/intake/"+a[2].replace("\\","/")
            conn.execute("insert into product_media (id,product_id,kind,src,alt_text,sort_order,source,rights,provenance) values (%s,%s,'image',%s,%s,%s,'OWNER','OWNED','OWNER/LOCAL')",(uuid.uuid4(),pid,src,name,pos))
        alias=re.sub(r"\s+"," ",name.lower()).strip()
        conn.execute("insert into catalogue_aliases (id,product_id,alias,normalized_alias) values (%s,%s,%s,%s) on conflict do nothing",(uuid.uuid4(),pid,name,alias))
        conn.execute("update candidate_groups set name=%s,status='NAMED',product_id=%s,updated_at=now() where id=%s",(name,pid,gid))
        write_audit(conn,uuid.UUID(actor["sub"]),"intake.product_created","product",pid,{"groupId":str(gid),"assetCount":len(assets),"catalogueNumber":product_number})
        conn.commit()
    return {"product":{"id":str(pid),"catalogueNumber":product_number,"name":name,"slug":slug,"assetCount":len(assets),"status":"DRAFT"}}

@app.post("/api/admin/intake/batches/{batch_id}/complete")
def intake_complete_batch(batch_id:str,request:Request):
    actor=require_admin(request);bid=uuid.UUID(batch_id)
    with db() as conn:
        conn.execute("update intake_batches set status='COMPLETED',updated_at=now() where id=%s",(bid,))
        write_audit(conn,uuid.UUID(actor["sub"]),"intake.batch_completed","intake_batch",bid,{})
        conn.commit()
    return {"ok":True}

@app.get("/api/admin/intake/name-suggestions")
def intake_name_suggestions(q:str="",request:Request=None):
    require_admin(request)
    query=re.sub(r"\s+"," ",q.strip().lower())
    if len(query)<2:return {"suggestions":[]}
    with db() as conn:
        rows=conn.execute("""select name from products where active=true and lower(name) like %s
                             union select alias from catalogue_aliases where lower(alias) like %s
                             order by name limit 12""",(f"%{query}%",f"%{query}%")).fetchall()
    seen=set();suggestions=[]
    for row in rows:
        value=row[0]
        if value and value.lower() not in seen:
            seen.add(value.lower());suggestions.append(value)
    return {"suggestions":suggestions}

class IntakeProductStatusPayload(BaseModel):
    status:str=Field(min_length=3,max_length=30)

@app.patch("/api/admin/intake/products/{product_id}/status")
def intake_product_status(product_id:str,payload:IntakeProductStatusPayload,request:Request):
    actor=require_admin(request)
    allowed={"DRAFT","APPROVED","PUBLISHED","ARCHIVED"}
    if payload.status not in allowed: raise HTTPException(status_code=422,detail="Unsupported product status")
    pid=uuid.UUID(product_id)
    with db() as conn:
        cur=conn.execute("update products set status=%s,active=%s,updated_at=now() where id=%s",
                         (payload.status,payload.status!="ARCHIVED",pid))
        if cur.rowcount==0: raise HTTPException(status_code=404,detail="Product not found")
        write_audit(conn,uuid.UUID(actor["sub"]),"intake.product_status_changed","product",pid,{"status":payload.status})
        conn.commit()
    return {"ok":True,"status":payload.status}
