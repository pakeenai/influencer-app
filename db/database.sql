-- ============================================================
-- Xstream Solution — MySQL / MariaDB schema + seed
-- ชื่อตารางมี prefix: xstream2_
-- นำไปลง server ได้เลย (phpMyAdmin / cPanel / mysql CLI)
-- คอลัมน์ที่เก็บ array/object ใช้ชนิด JSON (platforms, member_ids,
-- assigned_influencers, assigned_influencer_ids, linked_project_ids)
-- ข้อมูลจริงที่กรอกในเว็บ: กดปุ่ม "ดาวน์โหลด .sql" ในหน้าแอดมิน
-- จะได้ไฟล์ฉบับเต็ม (schema + ข้อมูลทั้งหมด) รูปแบบเดียวกับไฟล์นี้
-- ============================================================

-- ถ้ายังไม่มีฐานข้อมูล ให้ปลดคอมเมนต์ 2 บรรทัดนี้:
-- CREATE DATABASE IF NOT EXISTS xstream_solution CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE xstream_solution;

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS xstream2_admins (
  username VARCHAR(64) PRIMARY KEY, password VARCHAR(255), role VARCHAR(32), created_at VARCHAR(40)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS xstream2_influencers (
  id VARCHAR(64) PRIMARY KEY, name VARCHAR(255), phone VARCHAR(64), line VARCHAR(128), email VARCHAR(255),
  national_id VARCHAR(32), rating INT DEFAULT 0, avatar_url LONGTEXT, url_tiktok VARCHAR(512), url_shopee VARCHAR(512), url_facebook VARCHAR(512),
  url_instagram VARCHAR(512), url_lemon9 VARCHAR(512), department_id VARCHAR(64), platforms JSON, notes TEXT,
  created_at VARCHAR(40), updated_at VARCHAR(40)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS xstream2_influencer_pins (
  influencer_id VARCHAR(64) PRIMARY KEY, pin VARCHAR(16), created_at VARCHAR(40), updated_at VARCHAR(40)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS xstream2_departments (
  id VARCHAR(64) PRIMARY KEY, name VARCHAR(255), head VARCHAR(255), description TEXT, member_ids JSON,
  created_at VARCHAR(40), updated_at VARCHAR(40)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS xstream2_department_credentials (
  department_id VARCHAR(64) PRIMARY KEY, username VARCHAR(64), password VARCHAR(255),
  created_at VARCHAR(40), updated_at VARCHAR(40)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS xstream2_projects (
  id VARCHAR(64) PRIMARY KEY, name VARCHAR(255), brand VARCHAR(255), budget VARCHAR(64), start_date VARCHAR(40),
  end_date VARCHAR(40), department_id VARCHAR(64), clip_count VARCHAR(32), deadline VARCHAR(64), quality VARCHAR(64),
  assigned_influencers JSON, assigned_influencer_ids JSON, created_at VARCHAR(40), updated_at VARCHAR(40)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS xstream2_posts (
  id VARCHAR(64) PRIMARY KEY, influencer_id VARCHAR(64), project_id VARCHAR(64), platform VARCHAR(32), link TEXT,
  work_name VARCHAR(255), category VARCHAR(128), sold_date VARCHAR(40), sold_amount VARCHAR(64),
  commission_amount VARCHAR(64), status VARCHAR(32), rejection_reason TEXT, created_at VARCHAR(40),
  updated_at VARCHAR(40), department_id VARCHAR(64)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS xstream2_registration_campaigns (
  id VARCHAR(64) PRIMARY KEY, title VARCHAR(255), description TEXT, image_url TEXT, linked_project_ids JSON,
  active TINYINT(1), created_at VARCHAR(40), updated_at VARCHAR(40)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS xstream2_registration_submissions (
  id VARCHAR(64) PRIMARY KEY, campaign_id VARCHAR(64), influencer_id VARCHAR(64), name VARCHAR(255),
  phone VARCHAR(64), line VARCHAR(128), status VARCHAR(32), created_at VARCHAR(40), reviewed_at VARCHAR(40),
  review_note TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- TikTok Login Kit: แมป open_id ของ TikTok -> influencer + เก็บ OAuth token (auth ภายใน, ไม่อยู่ใน snapshot)
CREATE TABLE IF NOT EXISTS xstream2_influencer_tiktok (
  open_id VARCHAR(128) PRIMARY KEY, influencer_id VARCHAR(64), union_id VARCHAR(128), scope VARCHAR(255),
  access_token TEXT, refresh_token TEXT, expires_at VARCHAR(40), created_at VARCHAR(40), updated_at VARCHAR(40)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ============================================================
-- DATA (seed)
-- ============================================================

INSERT INTO xstream2_admins (username, password, role, created_at) VALUES ('admin', 'admin', 'super_admin', '2026-05-29T00:00:00.000Z');
