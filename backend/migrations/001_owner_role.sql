-- OWNER role migration for existing databases.
-- Safe to run repeatedly. Preserves customer, staff, admin, and supplier.
alter table users drop constraint if exists users_role_check;
alter table users add constraint users_role_check
  check (role in ('customer','staff','admin','owner','supplier'));
