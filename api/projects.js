// 项目 CRUD API
import { getSupabase } from './_lib/supabase.js'
import { v4 as uuidv4 } from 'uuid'

function generateSlug() {
  return uuidv4().replace(/-/g, '').substring(0, 12)
}

export default async function handler(req, res) {
  const supabase = getSupabase()

  // GET — 列表所有项目
  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*, items(count)')
        .order('created_at', { ascending: false })

      if (error) throw error
      return res.status(200).json(data)
    } catch (err) {
      return res.status(500).json({ error: err.message })
    }
  }

  // POST — 创建项目
  if (req.method === 'POST') {
    try {
      const { title, items } = req.body

      if (!items || items.length === 0) {
        return res.status(400).json({ error: '条目数据不能为空' })
      }

      const person1Slug = generateSlug()
      const person2Slug = generateSlug()

      // 创建项目
      const { data: project, error: projErr } = await supabase
        .from('projects')
        .insert({
          title: title || '借展文物清单',
          person1_slug: person1Slug,
          person2_slug: person2Slug,
          status: 'waiting_p1',
        })
        .select()
        .single()

      if (projErr) throw projErr

      // 处理图片上传
      const itemRecords = []
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        const imageUrls = []

        // 如果有 base64 图片数据，上传到 Supabase Storage
        if (item.image_data && item.image_data.startsWith('data:')) {
          try {
            const matches = item.image_data.match(/^data:(.+);base64,(.+)$/)
            if (matches) {
              const mimeType = matches[1]
              const base64Data = matches[2]
              const ext = mimeType.split('/')[1] || 'png'
              const fileName = `${project.id}/${i}_0.${ext}`
              const imageBuffer = Buffer.from(base64Data, 'base64')

              const { data: uploadData, error: uploadErr } = await supabase
                .storage
                .from('project-images')
                .upload(fileName, imageBuffer, {
                  contentType: mimeType,
                  upsert: false,
                })

              if (!uploadErr) {
                const { data: publicUrl } = supabase
                  .storage
                  .from('project-images')
                  .getPublicUrl(fileName)
                imageUrls.push(publicUrl.publicUrl)
              }
            }
          } catch (e) {
            console.error('图片上传失败:', e)
          }
        }

        itemRecords.push({
          project_id: project.id,
          seq: item.seq || '',
          name: item.name || '',
          era: item.era || '',
          ref_no: item.ref_no || '',
          quantity: item.quantity || '',
          dimensions: item.dimensions || '',
          excavation_site: item.excavation_site || '',
          images: imageUrls,
          image_source: item.image_source || '',
          sort_order: i,
        })
      }

      // 批量插入条目
      const { error: itemsErr } = await supabase
        .from('items')
        .insert(itemRecords)

      if (itemsErr) throw itemsErr

      return res.status(201).json({
        project,
        links: {
          person1: `/form/p1/${person1Slug}`,
          person2: `/form/p2/${person2Slug}`,
        },
      })
    } catch (err) {
      console.error('创建项目错误:', err)
      return res.status(500).json({ error: err.message })
    }
  }

  return res.status(405).json({ error: '不支持的方法' })
}
