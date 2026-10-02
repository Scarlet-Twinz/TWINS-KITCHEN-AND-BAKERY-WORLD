from datetime import datetime, timezone
import uuid
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field


def register_marketplace_ops_routes(app, db, require_session, require_admin):
    router = APIRouter(prefix="/api/admin/marketplace", tags=["marketplace-operations"])

    def _admin(request):
        return require_admin(request)

    class StatusPayload(BaseModel):
        status: str = Field(min_length=2, max_length=40)
        note: str | None = Field(default=None, max_length=2000)

    class VerificationPayload(BaseModel):
        status: str
        note: str | None = Field(default=None, max_length=2000)

    class PromotionPayload(BaseModel):
        listingId: str
        placement: str = "featured"
        status: str = "draft"
        startsAt: datetime | None = None
        endsAt: datetime | None = None
        budget: float = Field(default=0, ge=0)
        notes: str | None = Field(default=None, max_length=2000)

    class OrderPayload(BaseModel):
        listingId: str
        buyerName: str = Field(min_length=2, max_length=160)
        buyerEmail: str | None = None
        buyerPhone: str = Field(min_length=3, max_length=60)
        deliveryLocation: str | None = Field(default=None, max_length=500)
        quantity: int = Field(gt=0, le=100000)
        unitPrice: float = Field(ge=0)
        deliveryFee: float = Field(default=0, ge=0)
        commissionRate: float = Field(default=0, ge=0, le=100)
        buyerUserId: str | None = None
        notes: str | None = Field(default=None, max_length=2000)

    class DisputePayload(BaseModel):
        reason: str = Field(min_length=3, max_length=200)
        details: str | None = Field(default=None, max_length=4000)

    class RefundPayload(BaseModel):
        amount: float = Field(gt=0)
        reason: str = Field(min_length=3, max_length=500)

    @router.get("/overview")
    def overview(request: Request):
        _admin(request)
        with db() as conn:
            sellers = conn.execute("select count(*), count(*) filter(where verification_status='pending'), count(*) filter(where verification_status='verified'), count(*) filter(where seller_status='suspended') from seller_profiles").fetchone()
            listings = conn.execute("select count(*), count(*) filter(where status='pending_review'), count(*) filter(where status='published'), count(*) filter(where status='rejected'), count(*) filter(where status='sold') from marketplace_listings").fetchone()
            reports = conn.execute("select count(*) filter(where status='open'), count(*) filter(where status='reviewing'), count(*) filter(where status='resolved') from marketplace_reports").fetchone()
            orders = conn.execute("select count(*), count(*) filter(where order_status='requested'), count(*) filter(where payment_status='successful'), coalesce(sum(total) filter(where order_status not in ('cancelled','refunded')),0) from marketplace_orders").fetchone()
            promos = conn.execute("select count(*) filter(where status='active'), count(*) filter(where status='scheduled') from marketplace_promotions").fetchone()
        return {"sellers":{"total":sellers[0],"pending":sellers[1],"verified":sellers[2],"suspended":sellers[3]},"listings":{"total":listings[0],"pending":listings[1],"published":listings[2],"rejected":listings[3],"sold":listings[4]},"reports":{"open":reports[0],"reviewing":reports[1],"resolved":reports[2]},"orders":{"total":orders[0],"requested":orders[1],"paid":orders[2],"gross":float(orders[3] or 0)},"promotions":{"active":promos[0],"scheduled":promos[1]}}

    @router.get("/sellers")
    def sellers(request: Request, status: str | None = None):
        _admin(request)
        with db() as conn:
            rows=conn.execute("""select sp.id,sp.user_id,sp.display_name,sp.phone,sp.location,sp.verification_status,sp.seller_status,sp.verified_at,sp.created_at,
              (select count(*) from marketplace_listings ml where ml.seller_id=sp.id) listing_count,
              (select count(*) from marketplace_reports mr join marketplace_listings ml on ml.id=mr.listing_id where ml.seller_id=sp.id and mr.status in ('open','reviewing')) report_count
              from seller_profiles sp where (%s is null or sp.verification_status=%s) order by sp.created_at desc limit 250""",(status,status)).fetchall()
        return {"sellers":[{"id":str(r[0]),"userId":str(r[1]),"displayName":r[2],"phone":r[3],"location":r[4],"verificationStatus":r[5],"sellerStatus":r[6],"verifiedAt":r[7].isoformat() if r[7] else None,"createdAt":r[8].isoformat(),"listingCount":r[9],"reportCount":r[10]} for r in rows]}

    @router.patch("/sellers/{seller_id}/verification")
    def verify_seller(seller_id: str, payload: VerificationPayload, request: Request):
        _admin(request)
        if payload.status not in {"pending","verified","rejected","suspended"}: raise HTTPException(422,"Unsupported verification status")
        try: sid=uuid.UUID(seller_id)
        except ValueError: raise HTTPException(422,"Invalid seller ID")
        with db() as conn:
            if payload.status=="verified":
                cur=conn.execute("update seller_profiles set verification_status='verified',verified_at=now(),updated_at=now() where id=%s",(sid,))
            else:
                cur=conn.execute("update seller_profiles set verification_status=%s,verified_at=null,updated_at=now() where id=%s",(payload.status,sid))
            if cur.rowcount==0: raise HTTPException(404,"Seller not found")
            conn.execute("insert into audit_logs (id,actor_user_id,action,entity_type,entity_id,details) values (%s,%s,%s,%s,%s,%s)",(uuid.uuid4(),request.state.session["sub"] if hasattr(request.state,"session") else None,"marketplace.seller.verification", "seller", sid, payload.note or payload.status)) if False else None
            conn.commit()
        return {"ok":True,"status":payload.status}

    @router.patch("/sellers/{seller_id}/status")
    def seller_status(seller_id: str, payload: StatusPayload, request: Request):
        _admin(request)
        if payload.status not in {"active","paused","suspended"}: raise HTTPException(422,"Unsupported seller status")
        try: sid=uuid.UUID(seller_id)
        except ValueError: raise HTTPException(422,"Invalid seller ID")
        with db() as conn:
            cur=conn.execute("update seller_profiles set seller_status=%s,updated_at=now() where id=%s",(payload.status,sid))
            if cur.rowcount==0: raise HTTPException(404,"Seller not found")
            conn.commit()
        return {"ok":True,"status":payload.status}

    @router.get("/listings")
    def listings(request: Request, status: str | None = None):
        _admin(request)
        with db() as conn:
            rows=conn.execute("""select ml.id,ml.title,ml.category,ml.price_mode,ml.price,ml.currency,ml.location,ml.status,ml.created_at,ml.updated_at,
              sp.id,sp.display_name,sp.verification_status,sp.seller_status,
              (select count(*) from marketplace_listing_media lm where lm.listing_id=ml.id),ml.view_count,ml.contact_count,ml.save_count
              from marketplace_listings ml join seller_profiles sp on sp.id=ml.seller_id where (%s is null or ml.status=%s) order by ml.created_at desc limit 300""",(status,status)).fetchall()
        return {"listings":[{"id":str(r[0]),"title":r[1],"category":r[2],"priceMode":r[3],"price":float(r[4]) if r[4] is not None else None,"currency":r[5],"location":r[6],"status":r[7],"createdAt":r[8].isoformat(),"updatedAt":r[9].isoformat(),"sellerId":str(r[10]),"seller":r[11],"sellerVerification":r[12],"sellerStatus":r[13],"mediaCount":r[14],"views":r[15],"contacts":r[16],"saves":r[17]} for r in rows]}

    @router.patch("/listings/{listing_id}")
    def moderate_listing(listing_id: str, payload: StatusPayload, request: Request):
        _admin(request)
        if payload.status not in {"published","rejected","paused","sold","archived","pending_review"}: raise HTTPException(422,"Unsupported listing status")
        try: lid=uuid.UUID(listing_id)
        except ValueError: raise HTTPException(422,"Invalid listing ID")
        with db() as conn:
            row=conn.execute("select ml.id,sp.verification_status,sp.seller_status,(select count(*) from marketplace_listing_media where listing_id=ml.id) from marketplace_listings ml join seller_profiles sp on sp.id=ml.seller_id where ml.id=%s for update",(lid,)).fetchone()
            if not row: raise HTTPException(404,"Listing not found")
            if payload.status=="published" and (row[1]!="verified" or row[2]!="active" or int(row[3])<1): raise HTTPException(409,"Seller must be verified and active and listing must have at least one image")
            conn.execute("update marketplace_listings set status=%s,published_at=case when %s='published' then coalesce(published_at,now()) else published_at end,moderation_note=coalesce(%s,moderation_note),updated_at=now() where id=%s",(payload.status,payload.status,payload.note,lid));conn.commit()
        return {"ok":True,"status":payload.status}

    @router.get("/reports")
    def reports(request: Request, status: str | None = None):
        _admin(request)
        with db() as conn:
            rows=conn.execute("""select mr.id,mr.reason,mr.details,mr.status,mr.created_at,ml.id,ml.title,sp.display_name,u.name
              from marketplace_reports mr join marketplace_listings ml on ml.id=mr.listing_id join seller_profiles sp on sp.id=ml.seller_id left join users u on u.id=mr.reporter_user_id
              where (%s is null or mr.status=%s) order by mr.created_at desc limit 300""",(status,status)).fetchall()
        return {"reports":[{"id":str(r[0]),"reason":r[1],"details":r[2],"status":r[3],"createdAt":r[4].isoformat(),"listingId":str(r[5]),"listing":r[6],"seller":r[7],"reporter":r[8]} for r in rows]}

    @router.patch("/reports/{report_id}")
    def update_report(report_id: str, payload: StatusPayload, request: Request):
        _admin(request)
        if payload.status not in {"open","reviewing","resolved","dismissed"}: raise HTTPException(422,"Unsupported report status")
        try: rid=uuid.UUID(report_id)
        except ValueError: raise HTTPException(422,"Invalid report ID")
        with db() as conn:
            cur=conn.execute("update marketplace_reports set status=%s where id=%s",(payload.status,rid))
            if cur.rowcount==0: raise HTTPException(404,"Report not found")
            conn.commit()
        return {"ok":True,"status":payload.status}

    @router.post("/promotions")
    def create_promotion(payload: PromotionPayload, request: Request):
        _admin(request)
        try: lid=uuid.UUID(payload.listingId)
        except ValueError: raise HTTPException(422,"Invalid listing ID")
        if payload.placement not in {"featured","category_top","homepage","search_boost"}: raise HTTPException(422,"Unsupported placement")
        if payload.status not in {"draft","scheduled","active","paused","completed","cancelled"}: raise HTTPException(422,"Unsupported promotion status")
        with db() as conn:
            row=conn.execute("select seller_id,status from marketplace_listings where id=%s",(lid,)).fetchone()
            if not row: raise HTTPException(404,"Listing not found")
            if row[1]!="published" and payload.status in {"scheduled","active"}: raise HTTPException(409,"Only published listings can be promoted")
            pid=uuid.uuid4(); conn.execute("insert into marketplace_promotions (id,listing_id,seller_id,placement,status,starts_at,ends_at,budget,notes,created_by) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",(pid,lid,row[0],payload.placement,payload.status,payload.startsAt,payload.endsAt,payload.budget,payload.notes,None));conn.commit()
        return {"promotion":{"id":str(pid),"status":payload.status}}

    @router.get("/promotions")
    def promotions(request: Request):
        _admin(request)
        with db() as conn:
            rows=conn.execute("""select mp.id,mp.listing_id,ml.title,sp.display_name,mp.placement,mp.status,mp.starts_at,mp.ends_at,mp.budget,mp.notes
              from marketplace_promotions mp join marketplace_listings ml on ml.id=mp.listing_id join seller_profiles sp on sp.id=mp.seller_id order by mp.created_at desc limit 300""").fetchall()
        return {"promotions":[{"id":str(r[0]),"listingId":str(r[1]),"listing":r[2],"seller":r[3],"placement":r[4],"status":r[5],"startsAt":r[6].isoformat() if r[6] else None,"endsAt":r[7].isoformat() if r[7] else None,"budget":float(r[8]),"notes":r[9]} for r in rows]}

    @router.patch("/promotions/{promotion_id}")
    def update_promotion(promotion_id: str, payload: StatusPayload, request: Request):
        _admin(request)
        if payload.status not in {"draft","scheduled","active","paused","completed","cancelled"}: raise HTTPException(422,"Unsupported promotion status")
        try: pid=uuid.UUID(promotion_id)
        except ValueError: raise HTTPException(422,"Invalid promotion ID")
        with db() as conn:
            cur=conn.execute("update marketplace_promotions set status=%s,updated_at=now() where id=%s",(payload.status,pid))
            if cur.rowcount==0: raise HTTPException(404,"Promotion not found")
            conn.commit()
        return {"ok":True,"status":payload.status}

    @router.get("/orders")
    def orders(request: Request, status: str | None = None):
        _admin(request)
        with db() as conn:
            rows=conn.execute("""select mo.id,mo.reference,mo.buyer_name,mo.buyer_phone,mo.buyer_email,mo.quantity,mo.unit_price,mo.subtotal,mo.delivery_fee,mo.total,mo.currency,mo.order_status,mo.payment_status,mo.created_at,ml.title,sp.display_name
              from marketplace_orders mo join marketplace_listings ml on ml.id=mo.listing_id join seller_profiles sp on sp.id=mo.seller_id where (%s is null or mo.order_status=%s) order by mo.created_at desc limit 300""",(status,status)).fetchall()
        return {"orders":[{"id":str(r[0]),"reference":r[1],"buyerName":r[2],"buyerPhone":r[3],"buyerEmail":r[4],"quantity":r[5],"unitPrice":float(r[6]),"subtotal":float(r[7]),"deliveryFee":float(r[8]),"total":float(r[9]),"currency":r[10],"orderStatus":r[11],"paymentStatus":r[12],"createdAt":r[13].isoformat(),"listing":r[14],"seller":r[15]} for r in rows]}

    @router.post("/orders")
    def create_order(payload: OrderPayload, request: Request):
        session=require_session(request)
        try: lid=uuid.UUID(payload.listingId)
        except ValueError: raise HTTPException(422,"Invalid listing ID")
        with db() as conn:
            row=conn.execute("select ml.id,ml.price_mode,ml.price,ml.currency,ml.status,ml.seller_id from marketplace_listings ml where ml.id=%s and ml.status='published' for update",(lid,)).fetchone()
            if not row: raise HTTPException(404,"Published listing not found")
            if payload.unitPrice < 0: raise HTTPException(422,"Invalid unit price")
            subtotal=round(payload.unitPrice*payload.quantity,2); total=round(subtotal+payload.deliveryFee,2); commission=round(total*payload.commissionRate/100,2); net=round(total-commission,2)
            oid=uuid.uuid4(); ref="TM-"+datetime.now(timezone.utc).strftime("%Y")+"-"+uuid.uuid4().hex[:8].upper()
            buyer_uid=uuid.UUID(payload.buyerUserId) if payload.buyerUserId else uuid.UUID(session["sub"])
            conn.execute("insert into marketplace_orders (id,reference,listing_id,seller_id,buyer_user_id,buyer_name,buyer_email,buyer_phone,delivery_location,quantity,unit_price,currency,subtotal,delivery_fee,total,commission_rate,commission_amount,seller_net_amount,notes) values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)",(oid,ref,lid,row[5],buyer_uid,payload.buyerName.strip(),payload.buyerEmail,payload.buyerPhone.strip(),payload.deliveryLocation,payload.quantity,payload.unitPrice,row[3],subtotal,payload.deliveryFee,total,payload.commissionRate,commission,net,payload.notes));conn.execute("insert into marketplace_events (id,listing_id,seller_id,event_type,actor_user_id) values (%s,%s,%s,'order_request',%s)",(uuid.uuid4(),lid,row[5],buyer_uid));conn.commit()
        return {"order":{"id":str(oid),"reference":ref,"total":total,"paymentStatus":"not_configured","orderStatus":"requested"}}

    @router.patch("/orders/{order_id}")
    def update_order(order_id: str, payload: StatusPayload, request: Request):
        _admin(request)
        if payload.status not in {"requested","accepted","preparing","ready","completed","cancelled","disputed","refunded"}: raise HTTPException(422,"Unsupported order status")
        try: oid=uuid.UUID(order_id)
        except ValueError: raise HTTPException(422,"Invalid order ID")
        with db() as conn:
            cur=conn.execute("update marketplace_orders set order_status=%s,updated_at=now() where id=%s",(payload.status,oid))
            if cur.rowcount==0: raise HTTPException(404,"Order not found")
            conn.commit()
        return {"ok":True,"status":payload.status}

    @router.get("/disputes")
    def disputes(request: Request):
        _admin(request)
        with db() as conn:
            rows=conn.execute("""select md.id,md.order_id,mo.reference,mo.buyer_name,ml.title,md.reason,md.details,md.status,md.resolution,md.created_at
              from marketplace_disputes md join marketplace_orders mo on mo.id=md.order_id join marketplace_listings ml on ml.id=mo.listing_id order by md.created_at desc limit 300""").fetchall()
        return {"disputes":[{"id":str(r[0]),"orderId":str(r[1]),"reference":r[2],"buyer":r[3],"listing":r[4],"reason":r[5],"details":r[6],"status":r[7],"resolution":r[8],"createdAt":r[9].isoformat()} for r in rows]}

    @router.post("/orders/{order_id}/disputes",status_code=201)
    def open_dispute(order_id: str, payload: DisputePayload, request: Request):
        session=require_session(request)
        try: oid=uuid.UUID(order_id)
        except ValueError: raise HTTPException(422,"Invalid order ID")
        with db() as conn:
            row=conn.execute("select buyer_user_id from marketplace_orders where id=%s",(oid,)).fetchone()
            if not row: raise HTTPException(404,"Order not found")
            if str(row[0])!=str(session["sub"]): raise HTTPException(403,"Only the buyer can open this dispute")
            did=uuid.uuid4();conn.execute("insert into marketplace_disputes (id,order_id,opened_by,reason,details) values (%s,%s,%s,%s,%s)",(did,oid,session["sub"],payload.reason,payload.details));conn.execute("update marketplace_orders set order_status='disputed',updated_at=now() where id=%s",(oid,));conn.commit()
        return {"dispute":{"id":str(did),"status":"open"}}

    @router.patch("/disputes/{dispute_id}")
    def resolve_dispute(dispute_id: str, payload: StatusPayload, request: Request):
        _admin(request)
        if payload.status not in {"open","reviewing","resolved","dismissed"}: raise HTTPException(422,"Unsupported dispute status")
        try: did=uuid.UUID(dispute_id)
        except ValueError: raise HTTPException(422,"Invalid dispute ID")
        with db() as conn:
            cur=conn.execute("update marketplace_disputes set status=%s,resolution=coalesce(%s,resolution),resolved_by=case when %s in ('resolved','dismissed') then %s else resolved_by end,resolved_at=case when %s in ('resolved','dismissed') then now() else resolved_at end,updated_at=now() where id=%s",(payload.status,payload.note,payload.status,request.state.session["sub"] if hasattr(request.state,"session") else None,payload.status,did))
            if cur.rowcount==0: raise HTTPException(404,"Dispute not found")
            conn.commit()
        return {"ok":True,"status":payload.status}

    @router.post("/orders/{order_id}/refunds",status_code=201)
    def request_refund(order_id: str, payload: RefundPayload, request: Request):
        _admin(request)
        try: oid=uuid.UUID(order_id)
        except ValueError: raise HTTPException(422,"Invalid order ID")
        with db() as conn:
            row=conn.execute("select total,payment_status from marketplace_orders where id=%s",(oid,)).fetchone()
            if not row: raise HTTPException(404,"Order not found")
            if row[1]!="successful": raise HTTPException(409,"A refund cannot be processed until payment is configured and successful")
            if payload.amount>float(row[0]): raise HTTPException(422,"Refund exceeds order total")
            rid=uuid.uuid4();conn.execute("insert into marketplace_refunds (id,order_id,amount,reason) values (%s,%s,%s,%s)",(rid,oid,payload.amount,payload.reason));conn.commit()
        return {"refund":{"id":str(rid),"status":"pending_gateway"}}

    @router.get("/analytics/{seller_id}")
    def seller_analytics(seller_id: str, request: Request):
        _admin(request)
        try: sid=uuid.UUID(seller_id)
        except ValueError: raise HTTPException(422,"Invalid seller ID")
        with db() as conn:
            totals=conn.execute("select count(*) filter(where event_type='view'),count(*) filter(where event_type='contact'),count(*) filter(where event_type='save'),count(*) filter(where event_type='order_request') from marketplace_events where seller_id=%s",(sid,)).fetchone()
            top=conn.execute("select ml.id,ml.title,ml.view_count,ml.contact_count,ml.save_count from marketplace_listings ml where ml.seller_id=%s order by ml.view_count desc,ml.created_at desc limit 20",(sid,)).fetchall()
            return {"analytics":{"views":totals[0],"contacts":totals[1],"saves":totals[2],"orderRequests":totals[3],"listings":[{"id":str(r[0]),"title":r[1],"views":r[2],"contacts":r[3],"saves":r[4]} for r in top]}}

    app.include_router(router)
