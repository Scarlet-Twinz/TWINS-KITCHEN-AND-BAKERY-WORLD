-- Initial PostgreSQL shape for the Twins platform.
-- Architecture scaffold, not a production migration.

create table users (
  id uuid primary key,
  name text not null,
  email text unique not null,
  phone text,
  password_hash text not null,
  role text not null default 'customer' check (role in ('customer','staff','admin')),
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
