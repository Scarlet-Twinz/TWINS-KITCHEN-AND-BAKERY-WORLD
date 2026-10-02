-- Twins Marketplace production hardening migration
-- Safe to run against an existing PostgreSQL database.

alter table marketplace_listing_media add column if not exists mime_type text;
alter table marketplace_listing_media add column if not exists sha256 text;
alter table marketplace_listing_media add column if not exists size_bytes bigint;

alter table seller_subscriptions add column if not exists gateway_plan_code text;
alter table seller_subscriptions add column if not exists gateway_subscription_code text;
alter table seller_subscriptions add column if not exists last_payment_at timestamptz;
alter table seller_subscriptions add column if not exists next_payment_at timestamptz;

alter table seller_profiles add column if not exists verified_at timestamptz;
alter table marketplace_listings add column if not exists published_at timestamptz;
alter table payment_transactions add column if not exists processed_at timestamptz;

create index if not exists idx_marketplace_listing_media_listing
  on marketplace_listing_media(listing_id,sort_order);

create unique index if not exists uq_marketplace_listing_media_sha256
  on marketplace_listing_media(sha256)
  where sha256 is not null;

create index if not exists idx_seller_subscriptions_gateway_code
  on seller_subscriptions(gateway_subscription_code);

create index if not exists idx_seller_subscriptions_status
  on seller_subscriptions(status,updated_at desc);

create table if not exists marketplace_webhook_events (
  id bigserial primary key,
  event_key text unique not null,
  event_name text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create index if not exists idx_marketplace_webhook_events_name_received
  on marketplace_webhook_events(event_name,received_at desc);
