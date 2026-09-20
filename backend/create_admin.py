import os,sys,uuid,bcrypt,psycopg

DATABASE_URL=os.getenv("DATABASE_URL","")
if len(sys.argv)<4:
    raise SystemExit("Usage: python create_admin.py \"Full Name\" email password")
if not DATABASE_URL:
    raise SystemExit("DATABASE_URL is required")
name,email,password=sys.argv[1],sys.argv[2].strip().lower(),sys.argv[3]
if len(password)<8:
    raise SystemExit("Password must be at least 8 characters")
hash_value=bcrypt.hashpw(password.encode(),bcrypt.gensalt()).decode()
with psycopg.connect(DATABASE_URL) as conn:
    row=conn.execute("select id from users where email=%s",(email,)).fetchone()
    if row:
        conn.execute("update users set name=%s,password_hash=%s,role='admin',updated_at=now() where id=%s",(name,hash_value,row[0]))
    else:
        conn.execute("insert into users (id,name,email,password_hash,role) values (%s,%s,%s,%s,'admin')",(uuid.uuid4(),name,email,hash_value))
    conn.commit()
print("Admin account ready:",email)
