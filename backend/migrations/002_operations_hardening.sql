-- Operations Admin hardening
-- Safe to run repeatedly with the existing startup migration runner.
create sequence if not exists operations_order_reference_seq start 1 increment 1;
select setval(
  'operations_order_reference_seq',
  coalesce((select max(cast(substring(reference from 4) as bigint))
            from orders where reference ~ '^TK-[0-9]{6}$'),0) + 1,
  false
);
create index if not exists idx_orders_payment_fulfilment
  on orders(payment_status,fulfilment_status,created_at desc);
create index if not exists idx_marketplace_reports_listing_created
  on marketplace_reports(listing_id,created_at desc);
