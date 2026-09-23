-- Initial PostgreSQL shape for the Twins platform.
-- Architecture scaffold, not a production migration.

create table users (
  id uuid primary key,
  name text not null,
  email text unique not null,
  phone text,
  password_hash text not null,
  role text not null default 'customer' check (role in ('customer','staff','admin','owner','supplier')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table categories (
  id uuid primary key,
  slug text unique not null,
  name text unique not null,
  description text,
  created_at timestamptz not null default now()
);

create table products (
  id uuid primary key,
  legacy_catalogue_id integer unique,
  category_id uuid references categories(id),
  name text not null,
  slug text unique not null,
  description text,
  tag text,
  price_mode text not null default 'quote' check (price_mode in ('quote','fixed')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table product_media (
  id uuid primary key,
  product_id uuid references products(id) on delete cascade,
  kind text not null check (kind in ('image','video')),
  src text not null,
  alt_text text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table quotes (
  id uuid primary key,
  reference text unique not null,
  user_id uuid references users(id),
  name text not null,
  email text,
  phone text not null,
  business text,
  project_stage text,
  location text,
  capacity text,
  space text,
  utilities text,
  requirements text,
  package_name text,
  status text not null default 'Draft' check (status in ('Draft','Prepared','Sent to Twins','In review','Quoted','Closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table quote_items (
  id uuid primary key,
  quote_id uuid not null references quotes(id) on delete cascade,
  product_id uuid references products(id),
  quantity integer not null check (quantity > 0)
);

create table project_plans (
  id uuid primary key,
  user_id uuid references users(id),
  business text,
  stage text,
  location text,
  capacity text,
  space text,
  utilities text,
  owned text,
  needs text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table audit_logs (
  id bigserial primary key,
  actor_user_id uuid references users(id),
  action text not null,
  entity_type text,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_quotes_user_created on quotes(user_id, created_at desc);
create index if not exists idx_quote_items_quote on quote_items(quote_id);
create index if not exists idx_products_active on products(active);
create index if not exists idx_quotes_status_created on quotes(status, created_at desc);


-- Safe upgrades for databases created from an earlier scaffold.
alter table users add column if not exists name text not null default '';
alter table quotes add column if not exists package_name text;


-- Community marketplace layer.
create table seller_profiles (
  id uuid primary key,
  user_id uuid unique not null references users(id) on delete cascade,
  display_name text not null,
  phone text,
  location text,
  verification_status text not null default 'pending' check (verification_status in ('pending','verified','rejected','suspended')),
  seller_status text not null default 'active' check (seller_status in ('active','paused','suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table marketplace_listings (
  id uuid primary key,
  seller_id uuid not null references seller_profiles(id) on delete cascade,
  title text not null,
  category text not null,
  description text not null,
  price_mode text not null default 'on_request' check (price_mode in ('on_request','fixed','negotiable')),
  price numeric(14,2),
  currency text not null default 'NGN',
  location text,
  status text not null default 'pending_review' check (status in ('draft','pending_review','published','rejected','paused','sold','archived')),
  moderation_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table marketplace_listing_media (
  id uuid primary key,
  listing_id uuid not null references marketplace_listings(id) on delete cascade,
  kind text not null check (kind in ('image','video')),
  storage_key text not null,
  alt_text text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table seller_subscriptions (
  id uuid primary key,
  seller_id uuid not null references seller_profiles(id) on delete cascade,
  plan text not null,
  status text not null default 'pending_payment' check (status in ('pending_payment','active','past_due','cancelled','expired')),
  gateway text,
  gateway_reference text,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table marketplace_reports (
  id uuid primary key,
  listing_id uuid not null references marketplace_listings(id) on delete cascade,
  reporter_user_id uuid references users(id),
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now()
);

create table payment_transactions (
  id uuid primary key,
  user_id uuid references users(id),
  seller_subscription_id uuid references seller_subscriptions(id),
  reference text unique not null,
  gateway text not null,
  purpose text not null check (purpose in ('order','seller_membership','promotion','deposit')),
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null default 'NGN',
  status text not null default 'initiated' check (status in ('initiated','pending','successful','failed','refunded')),
  gateway_status text,
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_marketplace_listings_status_created on marketplace_listings(status, created_at desc);
create index if not exists idx_marketplace_listings_seller on marketplace_listings(seller_id, created_at desc);
create index if not exists idx_marketplace_reports_status on marketplace_reports(status, created_at desc);
create index if not exists idx_payment_transactions_user on payment_transactions(user_id, created_at desc);

-- Phase 4 production hardening.
create index if not exists idx_users_email_lower on users(lower(email));
create index if not exists idx_seller_profiles_verification on seller_profiles(verification_status,seller_status);
create index if not exists idx_marketplace_reports_listing_status on marketplace_reports(listing_id,status);
create index if not exists idx_product_media_product_order on product_media(product_id,sort_order);
create index if not exists idx_project_plans_user_updated on project_plans(user_id,updated_at desc);

alter table users add column if not exists email_verified_at timestamptz;
alter table seller_profiles add column if not exists verified_at timestamptz;
alter table marketplace_listings add column if not exists published_at timestamptz;
alter table payment_transactions add column if not exists processed_at timestamptz;
