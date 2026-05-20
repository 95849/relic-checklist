-- 添加 INSERT 权限（前端直连 Supabase 需要）
-- 在 Supabase SQL Editor 中执行

-- 允许创建项目
CREATE POLICY "public_insert_projects" ON projects FOR INSERT WITH CHECK (true);

-- 允许插入条目
CREATE POLICY "public_insert_items" ON items FOR INSERT WITH CHECK (true);

-- 允许上传图片到 project-images 存储桶
CREATE POLICY "public_upload_images" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'project-images');

CREATE POLICY "public_read_storage" ON storage.objects
  FOR SELECT USING (bucket_id = 'project-images');
