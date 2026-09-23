import os
import psycopg

DATABASE_URL=os.getenv("DATABASE_URL","")

OWNER_ROLE_MIGRATION_SQL=(
    "alter table users drop constraint if exists users_role_check; "
    "alter table users add constraint users_role_check "
    "check (role in ('customer','staff','admin','owner','supplier'))"
)

MEDIA_CENTER_MIGRATION_SQL="""
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
"""

def migrate_owner_role(conn):
    conn.execute(OWNER_ROLE_MIGRATION_SQL)

def migrate_media_center(conn):
    conn.execute(MEDIA_CENTER_MIGRATION_SQL)

def migrate_all(conn):
    migrate_owner_role(conn)
    migrate_media_center(conn)

if __name__=="__main__":
    if not DATABASE_URL:
        raise SystemExit("DATABASE_URL is required")
    with psycopg.connect(DATABASE_URL) as conn:
        migrate_all(conn)
        conn.commit()
    print("OWNER role and Media Center schema ready")
