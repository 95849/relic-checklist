// 本地测试服务器：同时提供前端和 API 路由
import express from 'express'
import { createClient } from '@supabase/supabase-js'
import { v4 as uuidv4 } from 'uuid'
import mammoth from 'mammoth'
import { Buffer } from 'buffer'
import 'dotenv/config'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const app = express()

// 环境变量（从 .env 或系统环境读取）
const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, serviceRoleKey)

function generateSlug() {
  return uuidv4().replace(/-/g, '').substring(0, 12)
}

app.use(express.json({ limit: '50mb' }))
app.use(express.raw({ type: 'application/octet-stream', limit: '50mb' }))

// ========== API 路由 ==========

// POST /api/parse — 解析文档
app.post('/api/parse', async (req, res) => {
  try {
    let buffer, fileName

    if (req.headers['content-type']?.includes('multipart/form-data')) {
      // 简单处理：取 request body 中的文件部分
      const boundary = req.headers['content-type'].split('boundary=')[1]
      const str = req.body.toString()
      const parts = str.split('--' + boundary)
      for (const part of parts) {
        if (part.includes('filename=')) {
          const nameMatch = part.match(/filename="([^"]*)"/)
          fileName = nameMatch ? nameMatch[1] : 'unknown.docx'
          const headerEnd = part.indexOf('\r\n\r\n')
          const content = part.substring(headerEnd + 4).replace(/\r\n--\r\n$/, '').replace(/\r\n--$/, '')
          buffer = Buffer.from(content, 'binary')
          break
        }
      }
    } else {
      buffer = req.body
      fileName = req.headers['x-file-name'] || 'unknown.docx'
    }

    if (!buffer) return res.status(400).json({ error: '未找到文件' })

    const ext = fileName.split('.').pop().toLowerCase()

    if (ext === 'docx') {
      const images = []
      const result = await mammoth.convertToHtml(
        { buffer },
        {
          convertImage: mammoth.images.imgElement(function (image) {
            return image.read().then(function (imageBuffer) {
              const base64 = imageBuffer.toString('base64')
              const contentType = image.contentType || 'image/png'
              const dataUri = `data:${contentType};base64,${base64}`
              images.push(dataUri)
              return { src: dataUri }
            })
          }),
        }
      )

      const html = result.value
      const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/i)
      if (!tableMatch) return res.status(400).json({ error: '未在文档中找到表格' })

      const tableHtml = tableMatch[0]
      const rows = []
      const trMatches = tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)
      for (const tr of trMatches) {
        const tdContent = []
        const tdMatches = tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[hd]>/gi)
        for (const td of tdMatches) {
          let content = td[1].replace(/<[^>]+>/g, '').trim()
          const imgMatch = td[1].match(/<img[^>]*src="([^"]*)"[^>]*>/i)
          if (imgMatch) content = imgMatch[1]
          tdContent.push(content)
        }
        if (tdContent.length >= 9) rows.push(tdContent)
      }

      if (rows.length < 2) return res.status(400).json({ error: '表格数据不足' })

      const dataRows = rows.slice(1).filter(r => r.some(c => c.length > 0))
      const titleMatch = html.match(/<h[1-3][^>]*>([^<]+)<\/h[1-3]>/i) || html.match(/<p[^>]*>([^<]+)<\/p>/i)

      return res.json({
        title: titleMatch ? titleMatch[1].trim() : '借展文物清单',
        columns: ['序号', '名称', '时代', '编号', '数量', '尺寸', '出土地点', '图片', '图片来源'],
        items: dataRows.map((row, i) => ({
          seq: row[0] || '', name: row[1] || '', era: row[2] || '',
          ref_no: row[3] || '', quantity: row[4] || '', dimensions: row[5] || '',
          excavation_site: row[6] || '', image_data: row[7] || '',
          image_source: row[8] || '', sort_order: i,
        })),
      })
    } else {
      return res.status(400).json({ error: '暂仅支持 docx，PDF 支持进行中' })
    }
  } catch (err) {
    console.error('解析错误:', err)
    return res.status(400).json({ error: err.message })
  }
})

// GET /api/projects — 列表
app.get('/api/projects', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('projects')
      .select('*, items(count)')
      .order('created_at', { ascending: false })
    if (error) throw error
    return res.json(data)
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

// POST /api/projects — 创建项目
app.post('/api/projects', async (req, res) => {
  try {
    const { title, items } = req.body
    if (!items || items.length === 0) return res.status(400).json({ error: '条目不能为空' })

    const p1Slug = generateSlug()
    const p2Slug = generateSlug()

    const { data: project, error: projErr } = await supabase
      .from('projects').insert({
        title: title || '借展文物清单',
        person1_slug: p1Slug, person2_slug: p2Slug, status: 'waiting_p1',
      }).select().single()
    if (projErr) throw projErr

    const itemRecords = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const imageUrls = []

      if (item.image_data && item.image_data.startsWith('data:')) {
        try {
          const matches = item.image_data.match(/^data:(.+);base64,(.+)$/)
          if (matches) {
            const mimeType = matches[1]
            const base64Data = matches[2]
            const ext = mimeType.split('/')[1] || 'png'
            const fileName = `${project.id}/${i}_0.${ext}`
            const imageBuffer = Buffer.from(base64Data, 'base64')

            const { error: uploadErr } = await supabase.storage
              .from('project-images').upload(fileName, imageBuffer, {
                contentType: mimeType, upsert: false,
              })

            if (!uploadErr) {
              const { data: publicUrl } = supabase.storage
                .from('project-images').getPublicUrl(fileName)
              imageUrls.push(publicUrl.publicUrl)
            }
          }
        } catch (e) { console.error('图片上传失败:', e) }
      }

      itemRecords.push({
        project_id: project.id, seq: item.seq || '', name: item.name || '',
        era: item.era || '', ref_no: item.ref_no || '', quantity: item.quantity || '',
        dimensions: item.dimensions || '', excavation_site: item.excavation_site || '',
        images: imageUrls, image_source: item.image_source || '', sort_order: i,
      })
    }

    const { error: itemsErr } = await supabase.from('items').insert(itemRecords)
    if (itemsErr) throw itemsErr

    return res.status(201).json({
      project,
      links: {
        person1: `/form/p1/${p1Slug}`,
        person2: `/form/p2/${p2Slug}`,
      },
    })
  } catch (err) {
    console.error('创建错误:', err)
    return res.status(500).json({ error: err.message })
  }
})

// GET /api/projects/:slug
app.get('/api/projects/:slug', async (req, res) => {
  try {
    const { slug } = req.params
    const { data: project, error: projErr } = await supabase
      .from('projects').select('*')
      .or(`person1_slug.eq.${slug},person2_slug.eq.${slug}`).single()
    if (projErr || !project) return res.status(404).json({ error: '项目不存在' })

    const { data: items, error: itemsErr } = await supabase
      .from('items').select('*').eq('project_id', project.id).order('sort_order')
    if (itemsErr) throw itemsErr

    const role = project.person1_slug === slug ? 'p1' : 'p2'
    const tableName = role === 'p1' ? 'person1' : 'person2'
    const { data: existing } = await supabase.from(tableName).select('*').eq('project_id', project.id)

    return res.json({
      project: { id: project.id, title: project.title, status: project.status },
      role, items, existing: existing?.length > 0 ? existing : null,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

// POST /api/projects/:slug/submit
app.post('/api/projects/:slug/submit', async (req, res) => {
  try {
    const { slug } = req.params
    const { role, person_name, answers } = req.body
    if (!role || !person_name || !answers?.length) return res.status(400).json({ error: '缺少必填字段' })

    const { data: project, error: projErr } = await supabase
      .from('projects').select('*')
      .or(`person1_slug.eq.${slug},person2_slug.eq.${slug}`).single()
    if (projErr || !project) return res.status(404).json({ error: '项目不存在' })

    if (role === 'p1') {
      const records = answers.map(a => ({
        project_id: project.id, item_id: a.item_id, person_name,
        published: a.published || 'no', published_notes: a.published_notes || null,
        storage_location: a.storage_location || '站队', storage_detail: a.storage_detail || null,
        relic_status: a.relic_status || '适合外借', agreed: a.agreed || 'yes',
      }))
      const { error } = await supabase.from('person1').insert(records)
      if (error) throw error
      await supabase.from('projects').update({ status: 'waiting_p2' }).eq('id', project.id)
    } else {
      const records = answers.map(a => ({
        project_id: project.id, item_id: a.item_id, person_name,
        agreed: a.agreed || 'yes',
      }))
      const { error } = await supabase.from('person2').insert(records)
      if (error) throw error
      await supabase.from('projects').update({ status: 'completed' }).eq('id', project.id)
    }

    return res.json({ success: true })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

// GET /api/results/:id
app.get('/api/results/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { data: project } = await supabase.from('projects').select('*').eq('id', id).single()
    if (!project) return res.status(404).json({ error: '项目不存在' })

    const { data: items } = await supabase.from('items').select('*').eq('project_id', id).order('sort_order')
    const { data: p1Data } = await supabase.from('person1').select('*').eq('project_id', id)
    const { data: p2Data } = await supabase.from('person2').select('*').eq('project_id', id)

    const p1Map = {}, p2Map = {}
    for (const s of (p1Data || [])) p1Map[s.item_id] = s
    for (const s of (p2Data || [])) p2Map[s.item_id] = s

    return res.json({
      project,
      rows: items.map(item => ({
        item,
        person1: p1Map[item.id] || null,
        person2: p2Map[item.id] || null,
      })),
      person1Name: (p1Data || [])[0]?.person_name || null,
      person2Name: (p2Data || [])[0]?.person_name || null,
    })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

// ========== 前端（SPA fallback） ==========
app.use(express.static(join(__dirname, 'dist')))

// 需要先构建前端：npm run build
// 然后运行：node server.js

const PORT = process.env.PORT || 3456
app.listen(PORT, () => {
  console.log(`\n  本地服务器启动: http://localhost:${PORT}`)
  console.log(`  打开浏览器访问上面的地址\n`)
})
