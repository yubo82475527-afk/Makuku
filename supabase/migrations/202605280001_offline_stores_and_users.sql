-- 门店主数据表
CREATE TABLE offline_stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  city TEXT NOT NULL,
  channel_type TEXT NOT NULL CHECK (channel_type IN ('modern_trade','baby_store','pharmacy','general_trade','other')),
  address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_offline_stores_name ON offline_stores(name);
CREATE INDEX idx_offline_stores_city ON offline_stores(city);

-- 应用用户表（用户名+密码 MVP 登录）
CREATE TABLE app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT DEFAULT 'field_agent',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- offline_store_visits 增加 store_id 外键
ALTER TABLE offline_store_visits ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES offline_stores(id);
