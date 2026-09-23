import os,sys,uuid,bcrypt,psycopg

DATABASE_URL=os.getenv("DATABASE_URL","")
OWNER_ROLE_CONSTRAINT_SQL=(
    "alter table users drop constraint if exists users_role_check; "
    "alter table users add constraint users_role_check "
    "check (role in ('customer','staff','admin','owner','supplier'))"
)

def ensure_owner_role_constraint(conn):
    conn.execute(OWNER_ROLE_CONSTRAINT_SQL)

if __name__=="__main__":
    if len(sys.argv)<4: raise SystemExit('Usage: python create_owner.py "Full Name" email password')
    if not DATABASE_URL: raise SystemExit("DATABASE_URL is required")
    name,email,password=sys.argv[1],sys.argv[2].strip().lower(),sys.argv[3]
    if len(password)<12: raise SystemExit("Owner password must be at least 12 characters")
    password_hash=bcrypt.hashpw(password.encode(),bcrypt.gensalt()).decode()
    with psycopg.connect(DATABASE_URL) as conn:
        ensure_owner_role_constraint(conn)
        row=conn.execute("select id from users where email=%s",(email,)).fetchone()
        if row:
            conn.execute("update users set name=%s,password_hash=%s,role='owner',updated_at=now() where id=%s",(name,password_hash,row[0]))
        else:
            conn.execute("insert into users (id,name,email,password_hash,role) values (%s,%s,%s,%s,'owner')",(uuid.uuid4(),name,email,password_hash))
        conn.commit()
    print("Owner account ready:",email)
