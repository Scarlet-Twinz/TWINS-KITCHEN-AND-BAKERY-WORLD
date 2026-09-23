import os
import psycopg

DATABASE_URL=os.getenv("DATABASE_URL","")

OWNER_ROLE_MIGRATION_SQL=(
    "alter table users drop constraint if exists users_role_check; "
    "alter table users add constraint users_role_check "
    "check (role in ('customer','staff','admin','owner','supplier'))"
)

def migrate_owner_role(conn):
    conn.execute(OWNER_ROLE_MIGRATION_SQL)

if __name__=="__main__":
    if not DATABASE_URL:
        raise SystemExit("DATABASE_URL is required")
    with psycopg.connect(DATABASE_URL) as conn:
        migrate_owner_role(conn)
        conn.commit()
    print("OWNER role schema ready")
