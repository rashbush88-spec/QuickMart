-- ============================================================
--  QuickMart Ghana - Multi-Tenant Database Schema  (v2.0)
-- ============================================================
--  What changed from v1:
--    * Every shop that registers gets its own row in `shops`
--      and its own shop_code (e.g. QM-2026-0001).
--    * Every business table now carries shop_id, so two shops
--      never see each other's products, sales or staff.
--    * Categories moved out of hardcoded HTML into a real table
--      that each shop can edit.
--    * Subscription plans, subscriptions and payments added.
--    * Passwords are stored as bcrypt hashes, not plain text.
--    * Receipt branding (name, logo, header, footer, TIN,
--      receipt number series) lives on the shop record, so the
--      printed receipt shows THAT shop's details automatically.
--
--  Engine: InnoDB / utf8mb4  (MySQL 5.7+ or MariaDB 10.3+)
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

CREATE DATABASE IF NOT EXISTS quickmart_saas
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE quickmart_saas;


-- ============================================================
--  1. PLANS - what a shop owner can subscribe to
-- ============================================================
DROP TABLE IF EXISTS plans;
CREATE TABLE plans (
  id             TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  code           VARCHAR(20)    NOT NULL UNIQUE,      -- starter | business | enterprise
  name           VARCHAR(60)    NOT NULL,
  price_monthly  DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
  price_yearly   DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
  max_users      INT            NOT NULL DEFAULT 3,   -- 0 = unlimited
  max_products   INT            NOT NULL DEFAULT 500, -- 0 = unlimited
  max_branches   INT            NOT NULL DEFAULT 1,
  trial_days     SMALLINT       NOT NULL DEFAULT 14,
  features       TEXT           NULL,                 -- one feature per line, shown on pricing page
  is_active      TINYINT(1)     NOT NULL DEFAULT 1,
  sort_order     TINYINT        NOT NULL DEFAULT 0,
  created_at     TIMESTAMP      DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;


-- ============================================================
--  2. SHOPS - one row per registered supermarket (the tenant)
-- ============================================================
DROP TABLE IF EXISTS shops;
CREATE TABLE shops (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  shop_code         VARCHAR(20)   NOT NULL UNIQUE,   -- QM-2026-0001, printed on every receipt
  name              VARCHAR(150)  NOT NULL,          -- replaces "QuickMart Ghana" everywhere
  business_type     VARCHAR(60)   NOT NULL DEFAULT 'Supermarket',
  slogan            VARCHAR(150)  NULL,

  -- Owner / contact
  owner_name        VARCHAR(120)  NOT NULL,
  email             VARCHAR(120)  NOT NULL UNIQUE,   -- login email of the owner account
  phone             VARCHAR(25)   NOT NULL,
  alt_phone         VARCHAR(25)   NULL,

  -- Location (Ghana-specific)
  address           VARCHAR(200)  NULL,
  city              VARCHAR(80)   NULL,
  region            VARCHAR(80)   NULL,
  digital_address   VARCHAR(20)   NULL,              -- Ghana Post GPS, e.g. UE-0044-4030

  -- Receipt / branding
  logo_path         VARCHAR(255)  NULL,
  tin               VARCHAR(30)   NULL,              -- Tax Identification Number
  currency          CHAR(3)       NOT NULL DEFAULT 'GHS',
  currency_symbol   VARCHAR(6)    NOT NULL DEFAULT 'GH₵',
  tax_rate          DECIMAL(5,2)  NOT NULL DEFAULT 0.00,   -- e.g. 15.00 for VAT
  tax_label         VARCHAR(20)   NOT NULL DEFAULT 'Tax',
  receipt_prefix    VARCHAR(10)   NOT NULL DEFAULT 'RCP',
  next_receipt_no   INT UNSIGNED  NOT NULL DEFAULT 1,       -- per-shop counter
  receipt_header    VARCHAR(255)  NULL,
  receipt_footer    VARCHAR(255)  NOT NULL DEFAULT 'Thank you for shopping with us!',

  -- Payment collection
  momo_provider     ENUM('MTN','Telecel','AirtelTigo') NULL,
  momo_number       VARCHAR(25)   NULL,
  momo_name         VARCHAR(120)  NULL,

  -- Account state
  status            ENUM('trial','active','suspended','cancelled') NOT NULL DEFAULT 'trial',
  trial_ends_on     DATE          NULL,
  timezone          VARCHAR(50)   NOT NULL DEFAULT 'Africa/Accra',
  onboarded         TINYINT(1)    NOT NULL DEFAULT 0,   -- has the setup wizard been finished?
  created_at        TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_shop_status (status)
) ENGINE=InnoDB;


-- ============================================================
--  3. SUBSCRIPTIONS - which plan a shop is on, and until when
-- ============================================================
DROP TABLE IF EXISTS subscriptions;
CREATE TABLE subscriptions (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  shop_id        INT UNSIGNED   NOT NULL,
  plan_id        TINYINT UNSIGNED NOT NULL,
  billing_cycle  ENUM('monthly','yearly') NOT NULL DEFAULT 'monthly',
  amount         DECIMAL(10,2)  NOT NULL,
  starts_on      DATE           NOT NULL,
  ends_on        DATE           NOT NULL,
  status         ENUM('pending','active','expired','cancelled') NOT NULL DEFAULT 'pending',
  auto_renew     TINYINT(1)     NOT NULL DEFAULT 0,
  created_at     TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
  FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE RESTRICT,
  INDEX idx_sub_shop (shop_id, status),
  INDEX idx_sub_expiry (ends_on)
) ENGINE=InnoDB;


-- ============================================================
--  4. SUBSCRIPTION PAYMENTS - money received from shop owners
-- ============================================================
DROP TABLE IF EXISTS subscription_payments;
CREATE TABLE subscription_payments (
  id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  shop_id          INT UNSIGNED  NOT NULL,
  subscription_id  INT UNSIGNED  NULL,
  amount           DECIMAL(10,2) NOT NULL,
  method           ENUM('momo','card','bank','cash') NOT NULL DEFAULT 'momo',
  provider         VARCHAR(30)   NULL,             -- MTN, Telecel, Paystack...
  reference        VARCHAR(100)  NOT NULL UNIQUE,  -- transaction / Paystack reference
  payer_number     VARCHAR(25)   NULL,
  status           ENUM('pending','success','failed','refunded') NOT NULL DEFAULT 'pending',
  paid_at          DATETIME      NULL,
  notes            VARCHAR(255)  NULL,
  created_at       TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (shop_id)         REFERENCES shops(id)         ON DELETE CASCADE,
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE SET NULL,
  INDEX idx_pay_shop (shop_id, status)
) ENGINE=InnoDB;


-- ============================================================
--  5. USERS - staff accounts, always tied to one shop
-- ============================================================
DROP TABLE IF EXISTS users;
CREATE TABLE users (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  shop_id        INT UNSIGNED  NOT NULL,
  name           VARCHAR(120)  NOT NULL,
  email          VARCHAR(120)  NOT NULL,
  username       VARCHAR(50)   NULL,               -- optional; staff may log in with this instead of email
  phone          VARCHAR(25)   NULL,
  password_hash  VARCHAR(255)  NOT NULL,           -- bcrypt, never plain text
  role           ENUM('owner','admin','cashier','inventory') NOT NULL DEFAULT 'cashier',
  status         ENUM('active','disabled') NOT NULL DEFAULT 'active',
  last_login_at  DATETIME      NULL,
  created_at     TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  updated_at     TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
  UNIQUE KEY uq_user_email (shop_id, email),       -- same email may exist in another shop
  UNIQUE KEY uq_user_username (shop_id, username), -- MySQL allows many NULLs here, so "no username" stays legal
  INDEX idx_user_role (shop_id, role)
) ENGINE=InnoDB;


-- ============================================================
--  6. PLATFORM ADMINS - you and your team, above all shops
-- ============================================================
DROP TABLE IF EXISTS platform_admins;
CREATE TABLE platform_admins (
  id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name           VARCHAR(120)  NOT NULL,
  email          VARCHAR(120)  NOT NULL UNIQUE,
  password_hash  VARCHAR(255)  NOT NULL,
  status         ENUM('active','disabled') NOT NULL DEFAULT 'active',
  last_login_at  DATETIME      NULL,
  created_at     TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;


-- ============================================================
--  7. CATEGORIES - per shop, replaces the hardcoded dropdowns
-- ============================================================
DROP TABLE IF EXISTS categories;
CREATE TABLE categories (
  id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  shop_id      INT UNSIGNED  NOT NULL,
  name         VARCHAR(100)  NOT NULL,
  description  VARCHAR(255)  NULL,
  icon         VARCHAR(16)   NULL,        -- emoji, used when there is no picture
  image_path   VARCHAR(255)  NULL,        -- "/uploads/cat-3-8-172590.png"
  sort_order   SMALLINT      NOT NULL DEFAULT 0,
  is_active    TINYINT(1)    NOT NULL DEFAULT 1,
  created_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
  UNIQUE KEY uq_category (shop_id, name)
) ENGINE=InnoDB;


-- ============================================================
--  8. DEFAULT CATEGORIES - the demo shop's starting categories
-- ------------------------------------------------------------
--  Only the demo shop below is seeded from this. A shop that
--  registers starts with no categories at all and creates its
--  own, because a hardware shop has no use for "Canned Foods".
-- ============================================================
DROP TABLE IF EXISTS default_categories;
CREATE TABLE default_categories (
  id          TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  icon        VARCHAR(16)  NULL,
  sort_order  TINYINT      NOT NULL DEFAULT 0
) ENGINE=InnoDB;


-- ============================================================
--  9. PRODUCTS - scoped to a shop, linked to a category
-- ============================================================
DROP TABLE IF EXISTS products;
CREATE TABLE products (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  shop_id     INT UNSIGNED   NOT NULL,
  category_id INT UNSIGNED   NULL,
  name        VARCHAR(200)   NOT NULL,
  barcode     VARCHAR(40)    NOT NULL,
  sku         VARCHAR(40)    NULL,
  cost_price  DECIMAL(10,2)  NOT NULL DEFAULT 0.00,   -- what the shop paid (for profit reports)
  price       DECIMAL(10,2)  NOT NULL DEFAULT 0.00,   -- selling price
  stock       INT            NOT NULL DEFAULT 0,
  min_stock   INT            NOT NULL DEFAULT 0,
  unit        VARCHAR(20)    NOT NULL DEFAULT 'pcs',
  image_path  VARCHAR(255)   NULL,
  is_active   TINYINT(1)     NOT NULL DEFAULT 1,
  created_at  TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP      DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (shop_id)     REFERENCES shops(id)      ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  UNIQUE KEY uq_barcode (shop_id, barcode),    -- barcodes unique inside a shop, not globally
  INDEX idx_prod_name (shop_id, name),
  INDEX idx_prod_stock (shop_id, stock)
) ENGINE=InnoDB;


-- ============================================================
-- 10. SALES - one row per completed transaction
-- ============================================================
DROP TABLE IF EXISTS sales;
CREATE TABLE sales (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  shop_id         INT UNSIGNED   NOT NULL,
  receipt_no      VARCHAR(40)    NOT NULL,
  cashier_id      INT UNSIGNED   NULL,
  cashier_name    VARCHAR(120)   NOT NULL,       -- kept as text so old receipts survive staff deletion
  subtotal        DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
  discount        DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
  tax_amount      DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
  total           DECIMAL(10,2)  NOT NULL,
  payment_method  ENUM('cash','momo','card','split') NOT NULL DEFAULT 'cash',
  amount_paid     DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
  change_amount   DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
  momo_provider   VARCHAR(20)    NULL,
  momo_number     VARCHAR(25)    NULL,
  customer_name   VARCHAR(120)   NULL,
  customer_phone  VARCHAR(25)    NULL,
  status          ENUM('completed','voided') NOT NULL DEFAULT 'completed',
  voided_by       INT UNSIGNED   NULL,
  voided_at       DATETIME       NULL,
  sale_date       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (shop_id)    REFERENCES shops(id) ON DELETE CASCADE,
  FOREIGN KEY (cashier_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uq_receipt (shop_id, receipt_no),
  INDEX idx_sale_date (shop_id, sale_date),
  INDEX idx_sale_payment (shop_id, payment_method)
) ENGINE=InnoDB;


-- ============================================================
-- 11. SALE ITEMS - the lines on each receipt
-- ============================================================
DROP TABLE IF EXISTS sale_items;
CREATE TABLE sale_items (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sale_id       INT UNSIGNED   NOT NULL,
  shop_id       INT UNSIGNED   NOT NULL,
  product_id    INT UNSIGNED   NULL,
  product_name  VARCHAR(200)   NOT NULL,      -- snapshot at time of sale
  barcode       VARCHAR(40)    NULL,
  unit_price    DECIMAL(10,2)  NOT NULL,
  cost_price    DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
  quantity      INT            NOT NULL,
  subtotal      DECIMAL(10,2)  NOT NULL,

  FOREIGN KEY (sale_id)    REFERENCES sales(id)    ON DELETE CASCADE,
  FOREIGN KEY (shop_id)    REFERENCES shops(id)    ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  INDEX idx_item_product (shop_id, product_id)
) ENGINE=InnoDB;


-- ============================================================
-- 12. STOCK MOVEMENTS - audit trail for every stock change
-- ============================================================
DROP TABLE IF EXISTS stock_movements;
CREATE TABLE stock_movements (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  shop_id         INT UNSIGNED  NOT NULL,
  product_id      INT UNSIGNED  NULL,
  product_name    VARCHAR(200)  NOT NULL,
  movement_type   ENUM('in','out','adjustment') NOT NULL,
  quantity        INT           NOT NULL,
  previous_stock  INT           NOT NULL,
  new_stock       INT           NOT NULL,
  reason          VARCHAR(255)  NOT NULL,
  performed_by    INT UNSIGNED  NULL,
  performed_name  VARCHAR(120)  NOT NULL,
  movement_date   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (shop_id)      REFERENCES shops(id)    ON DELETE CASCADE,
  FOREIGN KEY (product_id)   REFERENCES products(id) ON DELETE SET NULL,
  FOREIGN KEY (performed_by) REFERENCES users(id)    ON DELETE SET NULL,
  INDEX idx_move_date (shop_id, movement_date)
) ENGINE=InnoDB;


-- ============================================================
-- 13. ACTIVITY LOG - who did what, for accountability
-- ============================================================
DROP TABLE IF EXISTS activity_log;
CREATE TABLE activity_log (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  shop_id     INT UNSIGNED  NULL,
  user_id     INT UNSIGNED  NULL,
  user_name   VARCHAR(120)  NULL,
  action      VARCHAR(60)   NOT NULL,      -- login, product.create, sale.void...
  entity      VARCHAR(40)   NULL,
  entity_id   VARCHAR(40)   NULL,
  details     VARCHAR(500)  NULL,
  ip_address  VARCHAR(45)   NULL,
  created_at  TIMESTAMP     DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_log_shop (shop_id, created_at)
) ENGINE=InnoDB;


-- ============================================================
--  STAFF SESSIONS - when each staff member was on duty
-- ------------------------------------------------------------
--  login_at is written when they sign in, last_seen_at follows
--  them as they work, and logout_at is set only when they click
--  Log Out. A session with no logout_at was simply abandoned -
--  the browser closed - so last_seen_at is the honest answer to
--  "when did they stop?".
-- ============================================================
CREATE TABLE staff_sessions (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  shop_id       INT UNSIGNED  NOT NULL,
  user_id       INT UNSIGNED  NOT NULL,
  user_name     VARCHAR(120)  NOT NULL,   -- kept even if the account is renamed later
  login_at      DATETIME      NOT NULL,
  last_seen_at  DATETIME      NOT NULL,
  logout_at     DATETIME      NULL,
  ended_by      ENUM('logout') NULL,
  ip_address    VARCHAR(45)   NULL,

  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_session_day (shop_id, login_at),
  INDEX idx_session_user (user_id, login_at)
) ENGINE=InnoDB;


SET FOREIGN_KEY_CHECKS = 1;


-- ============================================================
--  SEED DATA
-- ============================================================

-- ── Subscription plans (edit the prices to what you want) ──
INSERT INTO plans (code, name, price_monthly, price_yearly, max_users, max_products, max_branches, trial_days, features, sort_order) VALUES
('starter',    'Starter',     80.00,   800.00,  3,  500, 1, 14,
 'POS & receipt printing\nInventory tracking\nUp to 3 staff accounts\nDaily sales report', 1),
('business',   'Business',   180.00,  1800.00,  10, 5000, 1, 14,
 'Everything in Starter\nUp to 10 staff accounts\nProfit reports\nCSV export\nLow-stock alerts', 2),
('enterprise', 'Enterprise', 350.00,  3500.00,  0,    0, 5, 14,
 'Everything in Business\nUnlimited staff & products\nUp to 5 branches\nPriority support', 3);

-- ── Starting categories for the demo shop ──
INSERT INTO default_categories (name, icon, sort_order) VALUES
('Grains & Cereals',  '🍚', 1),
('Beverages',         '🥤', 2),
('Canned Foods',      '🥫', 3),
('Oils & Condiments', '🧂', 4),
('Dairy & Frozen',    '🧃', 5),
('Snacks & Biscuits', '🍪', 6),
('Personal Care',     '🧴', 7),
('Household',         '🧹', 8);

-- ── Platform admin (you). Password: super123 - change it. ──
INSERT INTO platform_admins (name, email, password_hash) VALUES
('Bushran Abdul-Rashid', 'admin@marshaltechhub.com',
 '$2a$10$NvP8rA8OO.a3n67Xq6sYXuTjm7gxRLnqEfV5yub/QhineAnzRRH2O');


-- ============================================================
--  DEMO SHOP - so the system has something to show on day one
-- ============================================================
INSERT INTO shops
  (shop_code, name, business_type, slogan, owner_name, email, phone,
   address, city, region, digital_address, tin, tax_rate, tax_label,
   receipt_prefix, receipt_header, receipt_footer,
   momo_provider, momo_number, momo_name, status, trial_ends_on, onboarded)
VALUES
  ('QM-2026-0001', 'QuickMart Ghana', 'Supermarket', 'Fresh. Fair. Fast.',
   'Kwame Asante', 'admin@supermarket.com', '+233 24 000 0000',
   'Spintex Road', 'Accra', 'Greater Accra', 'GA-183-9421', 'C0012345678',
   0.00, 'VAT', 'QM', 'QuickMart Ghana - Spintex Branch',
   'Thank you for shopping with us! Goods sold are not returnable after 7 days.',
   'MTN', '024 000 0000', 'QuickMart Ghana Ltd', 'active', NULL, 1);

SET @shop := LAST_INSERT_ID();

-- Copy the default categories into the demo shop
INSERT INTO categories (shop_id, name, icon, sort_order)
SELECT @shop, name, icon, sort_order FROM default_categories;

-- Staff accounts. Passwords: admin123 / cashier123 / inventory123
INSERT INTO users (shop_id, name, email, phone, password_hash, role) VALUES
(@shop, 'Kwame Asante',  'admin@supermarket.com',     '024 000 0001',
 '$2a$10$5lTsqYqoZkX8dNqHl88/FeBPz/YWmNL3NALvYttp7Tv.wv0pqJ9j.', 'owner'),
(@shop, 'Ama Mensah',    'cashier@supermarket.com',   '024 000 0002',
 '$2a$10$KO74miVzUdaB18tud6XfoekQnYiGeBf9knXTY/uF2LEPD/oGgf6C2', 'cashier'),
(@shop, 'Kofi Boateng',  'inventory@supermarket.com', '024 000 0003',
 '$2a$10$elonT4H95g.V2YGv./5J6OBe99P.93Vym7lS0NM5b6O5Ms1w48RQa', 'inventory');

-- An active subscription for the demo shop
INSERT INTO subscriptions (shop_id, plan_id, billing_cycle, amount, starts_on, ends_on, status, auto_renew)
SELECT @shop, id, 'monthly', price_monthly, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 1 MONTH), 'active', 1
FROM plans WHERE code = 'business';

-- The 20 products from v1, now with cost prices and category links
INSERT INTO products (shop_id, category_id, name, barcode, cost_price, price, stock, min_stock, unit) VALUES
(@shop, (SELECT id FROM categories WHERE shop_id=@shop AND name='Grains & Cereals'),    'Adom Rice (5kg)',                 'GH-10001', 70.00, 85.00,  50, 10, 'bag'),
(@shop, (SELECT id FROM categories WHERE shop_id=@shop AND name='Grains & Cereals'),    'Indomie Instant Noodles (pack)',  'GH-10002',  3.20,  4.50, 200, 40, 'pcs'),
(@shop, (SELECT id FROM categories WHERE shop_id=@shop AND name='Beverages'),           'Voltic Water (1.5L)',             'GH-10003',  3.50,  5.00, 150, 30, 'bottle'),
(@shop, (SELECT id FROM categories WHERE shop_id=@shop AND name='Beverages'),           'Coca-Cola (500ml)',               'GH-10004',  6.00,  8.00, 120, 25, 'bottle'),
(@shop, (SELECT id FROM categories WHERE shop_id=@shop AND name='Beverages'),           'Malta Guinness (330ml)',          'GH-10005',  9.00, 12.00,  80, 20, 'bottle'),
(@shop, (SELECT id FROM categories WHERE shop_id=@shop AND name='Canned Foods'),        'Exeter Corned Beef',              'GH-10006', 26.00, 32.00,  45, 10, 'pcs'),
(@shop, (SELECT id FROM categories WHERE shop_id=@shop AND name='Canned Foods'),        'Gino Tomato Paste',               'GH-10007',  5.50,  7.50, 100, 20, 'pcs'),
(@shop, (SELECT id FROM categories WHERE shop_id=@shop AND name='Oils & Condiments'),   'Frytol Vegetable Oil (1L)',       'GH-10008', 23.00, 28.00,  60, 15, 'bottle'),
(@shop, (SELECT id FROM categories WHERE shop_id=@shop AND name='Oils & Condiments'),   'Shito (Pepper Sauce, jar)',       'GH-10009', 18.00, 25.00,  35,  8, 'jar'),
(@shop, (SELECT id FROM categories WHERE shop_id=@shop AND name='Dairy & Frozen'),      'Fan Milk FanYogo (150ml)',        'GH-10010',  4.50,  6.00,  90, 20, 'pcs'),
(@shop, (SELECT id FROM categories WHERE shop_id=@shop AND name='Dairy & Frozen'),      'Fan Milk FanIce',                 'GH-10011',  3.00,  4.00, 100, 25, 'pcs'),
(@shop, (SELECT id FROM categories WHERE shop_id=@shop AND name='Beverages'),           'Milo (400g)',                     'GH-10012', 38.00, 45.00,  40, 10, 'pcs'),
(@shop, (SELECT id FROM categories WHERE shop_id=@shop AND name='Dairy & Frozen'),      'Nido Milk Powder (400g)',         'GH-10013', 44.00, 52.00,  30,  8, 'pcs'),
(@shop, (SELECT id FROM categories WHERE shop_id=@shop AND name='Dairy & Frozen'),      'Peak Milk (Evaporated, 160g)',    'GH-10014',  7.50,  9.50,  75, 15, 'pcs'),
(@shop, (SELECT id FROM categories WHERE shop_id=@shop AND name='Snacks & Biscuits'),   'McVities Digestive Biscuits',     'GH-10015', 14.00, 18.00,  55, 12, 'pcs'),
(@shop, (SELECT id FROM categories WHERE shop_id=@shop AND name='Snacks & Biscuits'),   'Perk Biscuits',                   'GH-10016',  1.40,  2.00, 300, 50, 'pcs'),
(@shop, (SELECT id FROM categories WHERE shop_id=@shop AND name='Personal Care'),       'Key Soap (bar)',                  'GH-10017',  4.80,  6.50,  80, 20, 'pcs'),
(@shop, (SELECT id FROM categories WHERE shop_id=@shop AND name='Household'),           'OMO Detergent (500g)',            'GH-10018', 11.50, 15.00,  65, 15, 'pcs'),
(@shop, (SELECT id FROM categories WHERE shop_id=@shop AND name='Household'),           'Parazone Bleach (1L)',            'GH-10019',  9.00, 12.00,  40, 10, 'bottle'),
(@shop, (SELECT id FROM categories WHERE shop_id=@shop AND name='Snacks & Biscuits'),   'Golden Tree Chocolate Bar',       'GH-10020',  7.50, 10.00,  70, 15, 'pcs');


-- ============================================================
--  VIEWS - handy for the dashboards
-- ============================================================

CREATE OR REPLACE VIEW v_low_stock AS
SELECT p.shop_id, p.id, p.name, c.name AS category, p.stock, p.min_stock, p.unit,
       CASE WHEN p.stock = 0 THEN 'out' ELSE 'low' END AS stock_state
FROM products p
LEFT JOIN categories c ON c.id = p.category_id
WHERE p.is_active = 1 AND p.stock <= p.min_stock;

CREATE OR REPLACE VIEW v_daily_sales AS
SELECT shop_id, DATE(sale_date) AS sale_day,
       COUNT(*) AS transactions,
       SUM(total) AS revenue,
       SUM(CASE WHEN payment_method='cash' THEN total ELSE 0 END) AS cash_total,
       SUM(CASE WHEN payment_method='momo' THEN total ELSE 0 END) AS momo_total,
       SUM(CASE WHEN payment_method='card' THEN total ELSE 0 END) AS card_total
FROM sales
WHERE status = 'completed'
GROUP BY shop_id, DATE(sale_date);

CREATE OR REPLACE VIEW v_top_products AS
SELECT si.shop_id, si.product_id, si.product_name,
       SUM(si.quantity) AS units_sold,
       SUM(si.subtotal) AS revenue,
       SUM(si.subtotal - (si.cost_price * si.quantity)) AS gross_profit
FROM sale_items si
JOIN sales s ON s.id = si.sale_id AND s.status = 'completed'
GROUP BY si.shop_id, si.product_id, si.product_name;

CREATE OR REPLACE VIEW v_shop_overview AS
SELECT sh.id AS shop_id, sh.shop_code, sh.name, sh.status, sh.city, sh.region,
       p.name AS plan_name, sub.status AS subscription_status, sub.ends_on,
       (SELECT COUNT(*) FROM users u WHERE u.shop_id = sh.id) AS staff_count,
       (SELECT COUNT(*) FROM products pr WHERE pr.shop_id = sh.id) AS product_count,
       (SELECT IFNULL(SUM(s.total),0) FROM sales s WHERE s.shop_id = sh.id AND s.status='completed') AS lifetime_revenue
FROM shops sh
LEFT JOIN subscriptions sub ON sub.shop_id = sh.id AND sub.status = 'active'
LEFT JOIN plans p ON p.id = sub.plan_id;


-- ============================================================
--  RECEIPT NUMBERING
-- ============================================================
--  Each shop keeps its own counter, so QuickMart's receipts run
--  QM-000001, QM-000002 while another shop runs MEL-000001.
--  Call this inside the same transaction as the sale insert:
--
--    UPDATE shops SET next_receipt_no = next_receipt_no + 1 WHERE id = ?;
--    SELECT CONCAT(receipt_prefix, '-', LPAD(next_receipt_no - 1, 6, '0'))
--    FROM shops WHERE id = ?;
-- ============================================================
