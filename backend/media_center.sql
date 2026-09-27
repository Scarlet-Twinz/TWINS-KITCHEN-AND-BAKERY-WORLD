alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check check (role in ('customer','staff','admin','owner','supplier'));
create table if not exists media_assets (
 id uuid primary key, product_legacy_id integer, filename text not null, storage_path text not null unique,
 sha256 text not null, mime_type text, width integer, height integer,
 source_type text not null check (source_type in ('owned','supplier-authorized','licensed','public-domain','cc0','review','unresolved')),
 rights_status text not null check (rights_status in ('owned','supplier-authorized','licensed','public-domain','cc0','review','unresolved')),
 provenance text, source_url text, license text, attribution text,
 role text not null default 'primary' check (role in ('primary','front','side','rear','detail','control-panel','installed','contextual')),
 status text not null default 'QUEUED' check (status in ('QUEUED','REVIEW','VERIFIED','REJECTED','DUPLICATE','APPROVED','MAPPED')),
 batch_id uuid not null, uploaded_by uuid not null references users(id),
 verified_at timestamptz, verified_by uuid references users(id), approved_at timestamptz, approved_by uuid references users(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create unique index if not exists uq_media_assets_sha256 on media_assets(sha256);
create index if not exists idx_media_assets_product on media_assets(product_legacy_id);
create index if not exists idx_media_assets_status on media_assets(status,created_at desc);
create index if not exists idx_media_assets_batch on media_assets(batch_id,created_at);
create table if not exists media_production_mappings (
 id uuid primary key, asset_id uuid not null unique references media_assets(id) on delete restrict,
 product_legacy_id integer not null, role text not null, published boolean not null default false,
 created_by uuid not null references users(id), created_at timestamptz not null default now()
);
create index if not exists idx_media_production_mappings_product on media_production_mappings(product_legacy_id,published);
create table if not exists media_supporting_documents (
 id uuid primary key, batch_id uuid not null, filename text not null, storage_path text not null unique,
 mime_type text not null default 'application/pdf', uploaded_by uuid not null references users(id), created_at timestamptz not null default now()
);
create index if not exists idx_media_supporting_documents_batch on media_supporting_documents(batch_id,created_at);


-- Phase 2: independent media-library state and review metadata.
alter table media_assets add column if not exists original_filename text;
alter table media_assets add column if not exists uploaded_at timestamptz not null default now();
alter table media_assets add column if not exists ai_state text not null default 'UNRESOLVED'
  check (ai_state in ('UNRESOLVED','REVIEW','VERIFIED','REJECTED','DUPLICATE'));
alter table media_assets add column if not exists candidate_product_ids jsonb not null default '[]'::jsonb;
alter table media_assets add column if not exists confidence numeric(7,6);
alter table media_assets add column if not exists review_state text not null default 'UNREVIEWED'
  check (review_state in ('UNREVIEWED','REVIEW_REQUIRED','CONFIRMED','UNRESOLVED','REJECTED'));
alter table media_assets alter column product_legacy_id drop not null;
update media_assets
set original_filename=coalesce(original_filename,filename),
    uploaded_at=coalesce(uploaded_at,created_at),
    ai_state=case
      when status='REJECTED' then 'REJECTED'
      when status in ('VERIFIED','APPROVED','MAPPED') then 'VERIFIED'
      when status='DUPLICATE' then 'DUPLICATE'
      else 'REVIEW'
    end
where original_filename is null;
create index if not exists idx_media_assets_ai_state on media_assets(ai_state,created_at desc);
create index if not exists idx_media_assets_review_state on media_assets(review_state,created_at desc);


-- Phase 3: persisted human-review decisions and new-product candidates.
create table if not exists media_match_results (
 id uuid primary key,
 asset_id uuid not null references media_assets(id) on delete cascade,
 candidate_product_id integer,
 confidence numeric(7,6),
 margin numeric(7,6),
 evidence jsonb not null default '{}'::jsonb,
 state text not null check (state in ('HIGH','MEDIUM','UNRESOLVED','VERIFIED','REJECTED')),
 created_at timestamptz not null default now()
);
create index if not exists idx_media_match_results_asset on media_match_results(asset_id,created_at desc);
create index if not exists idx_media_match_results_candidate on media_match_results(candidate_product_id,created_at desc);

create table if not exists media_product_candidates (
 id uuid primary key,
 asset_id uuid not null references media_assets(id) on delete cascade,
 suggested_name text,
 category text,
 source_asset_ids jsonb not null default '[]'::jsonb,
 evidence jsonb not null default '{}'::jsonb,
 status text not null default 'PENDING_OWNER' check (status in ('PENDING_OWNER','CREATED','MERGED','KEPT_UNRESOLVED','REJECTED')),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists idx_media_product_candidates_asset on media_product_candidates(asset_id,created_at desc);
create index if not exists idx_media_product_candidates_status on media_product_candidates(status,created_at desc);
