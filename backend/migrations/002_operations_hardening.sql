-- Operations Admin hardening
-- Safe to run repeatedly.
create sequence if not exists operations_order_reference_seq start 1 increment 1;

do $$
declare max_ref bigint;
begin
  select coalesce(max(cast(substring(reference from 4) as bigint)),0)
    into max_ref
  from orders
  where reference ~ '^TK-[0-9]{6}$';
  perform setval('operations_order_reference_seq', max_ref + 1, false);
end $$;

create index if not exists idx_orders_payment_fulfilment
  on orders(payment_status,fulfilment_status,created_at desc);

create index if not exists idx_marketplace_reports_listing_created
  on marketplace_reports(listing_id,created_at desc);
