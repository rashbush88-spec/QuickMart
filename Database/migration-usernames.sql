-- ============================================================
--  Migration: log in with a username as well as an email
--  Run once against an existing quickmart_saas database:
--
--    mysql -u quickmart -p quickmart_saas < migration-usernames.sql
--
--  Fresh installs from schema_v2.sql already have this.
--
--  Usernames are optional. Every account that exists today keeps
--  working on its email alone until someone gives it one.
-- ============================================================

ALTER TABLE users
  ADD COLUMN username VARCHAR(50) NULL AFTER email,
  ADD UNIQUE KEY uq_user_username (shop_id, username);
