-- 借展文物清单确认系统 — 数据库建表脚本
-- 在 Supabase SQL Editor 中执行此脚本

-- 1. 项目表
CREATE TABLE projects (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title           text NOT NULL,
  person1_slug    text UNIQUE NOT NULL,
  person2_slug    text UNIQUE NOT NULL,
  status          text NOT NULL DEFAULT 'waiting_p1',
  created_at      timestamptz DEFAULT NOW()
);

-- 2. 文物条目表
CREATE TABLE items (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  seq             text DEFAULT '',
  name            text DEFAULT '',
  era             text DEFAULT '',
  ref_no          text DEFAULT '',
  quantity        text DEFAULT '',
  dimensions      text DEFAULT '',
  excavation_site text DEFAULT '',
  images          jsonb DEFAULT '[]'::jsonb,
  image_source    text DEFAULT '',
  sort_order      int DEFAULT 0
);

-- 3. 队长/站队负责人提交表（出借方）
CREATE TABLE person1 (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  item_id         uuid REFERENCES items(id) ON DELETE CASCADE,
  person_name     text NOT NULL,
  published       text NOT NULL,
  published_notes text,
  storage_location text NOT NULL,
  storage_detail  text,
  relic_status    text NOT NULL,
  agreed          text NOT NULL,
  submitted_at    timestamptz DEFAULT NOW()
);

-- 4. 室主任/研究室负责人提交表（审批人）
CREATE TABLE person2 (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid REFERENCES projects(id) ON DELETE CASCADE,
  item_id         uuid REFERENCES items(id) ON DELETE CASCADE,
  person_name     text NOT NULL,
  agreed          text NOT NULL,
  submitted_at    timestamptz DEFAULT NOW()
);

-- 5. 索引
CREATE INDEX idx_items_project ON items(project_id, sort_order);
CREATE INDEX idx_person1_project ON person1(project_id);
CREATE INDEX idx_person1_item ON person1(item_id);
CREATE INDEX idx_person2_project ON person2(project_id);
CREATE INDEX idx_person2_item ON person2(item_id);

-- 6. 开启 RLS（Row Level Security）
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE person1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE person2 ENABLE ROW LEVEL SECURITY;

-- 7. RLS 策略：允许公开读取（因为通过唯一 slug 访问）
CREATE POLICY "public_read_projects" ON projects FOR SELECT USING (true);
CREATE POLICY "public_read_items" ON items FOR SELECT USING (true);
CREATE POLICY "public_insert_person1" ON person1 FOR INSERT WITH CHECK (true);
CREATE POLICY "public_read_person1" ON person1 FOR SELECT USING (true);
CREATE POLICY "public_insert_person2" ON person2 FOR INSERT WITH CHECK (true);
CREATE POLICY "public_read_person2" ON person2 FOR SELECT USING (true);
