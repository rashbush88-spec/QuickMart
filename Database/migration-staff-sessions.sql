-- ============================================================
--  Migration: staff login / logout times
--  Run once against an existing quickmart_saas database:
--
--    mysql -u quickmart -p quickmart_saas < migration-staff-sessions.sql
--
--  Fresh installs from schema_v2.sql already have this.
-- ============================================================

CREATE TABLE IF NOT EXISTS staff_sessions (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  shop_id       INT UNSIGNED  NOT NULL,
  user_id       INT UNSIGNED  NOT NULL,
  user_name     VARCHAR(120)  NOT NULL,   -- kept even if the account is renamed later
  login_at      DATETIME      NOT NULL,
  last_seen_at  DATETIME      NOT NULL,   -- their most recent action
  logout_at     DATETIME      NULL,       -- only set when they click Log Out
  ended_by      ENUM('logout') NULL,      -- null means the session was simply abandoned
  ip_address    VARCHAR(45)   NULL,

  FOREIGN KEY (shop_id) REFERENCES shops(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_session_day (shop_id, login_at),
  INDEX idx_session_user (user_id, login_at)
) ENGINE=InnoDB;
