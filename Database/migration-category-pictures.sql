-- ============================================================
--  Migration: category pictures
--  Run once against an existing quickmart_saas database:
--
--    mysql -u quickmart -p quickmart_saas < migration-category-pictures.sql
--
--  Fresh installs from schema_v2.sql already have this and do
--  not need to run it.
-- ============================================================

ALTER TABLE categories
  ADD COLUMN image_path VARCHAR(255) NULL AFTER icon;
