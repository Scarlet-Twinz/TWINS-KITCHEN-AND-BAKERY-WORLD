import base64, hashlib, hmac, json, secrets, time, uuid
from datetime import datetime, timedelta, timezone
from typing import Any
import bcrypt, psycopg
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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
    model_config=SettingsConfigDict(env_file=".env",extra="ignore")
settings=Settings()
SESSION_COOKIE="__Host-twins_session" if settings.cookie_secure else "twins_session"
app=FastAPI(title="Twins Kitchen & Bakery World API",version="0.3.0")
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
