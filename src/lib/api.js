// 前端 API — 直连 Supabase（无中间服务器）
import { supabase } from './supabase'
import { v4 as uuidv4 } from 'uuid'
import { parseDocument } from './parse'

function generateSlug() {
  return uuidv4().replace(/-/g, '').substring(0, 12)
}

// 根据关键词从 fields 中查找值
function findField(fields, keywords) {
  for (const [key, val] of Object.entries(fields)) {
    if (keywords.some(kw => key.includes(kw)) && val) {
      return val
    }
  }
  return ''
}

export { parseDocument }

// 上传单张图片到 Supabase Storage，返回公开 URL
export async function uploadTempImage(dataUri) {
  if (!dataUri || !dataUri.startsWith('data:')) return null

  try {
    // data URI → Blob：多种解码方式依次尝试
    let blob = null

    // 方式1：fetch（如果 data URI 不太长）
    if (dataUri.length < 500000) {
      try {
        const res = await fetch(dataUri)
        if (res.ok) blob = await res.blob()
      } catch (_) { /* fetch 失败，继续尝试 */ }
    }

    // 方式2：手动 atob 解码
    if (!blob) {
      const commaIdx = dataUri.indexOf(',')
      if (commaIdx === -1) return null
      const header = dataUri.substring(0, commaIdx)
      const b64 = dataUri.substring(commaIdx + 1).replace(/\s/g, '')
      const mimeMatch = header.match(/data:([^;]+)/)
      const mime = mimeMatch ? mimeMatch[1] : 'image/png'

      // 补全 base64 padding
      const padded = b64 + '='.repeat((4 - b64.length % 4) % 4)
      const raw = atob(padded)
      const bytes = new Uint8Array(raw.length)
      for (let i = 0; i < raw.length; i++) {
        bytes[i] = raw.charCodeAt(i)
      }
      blob = new Blob([bytes], { type: mime })
    }

    if (!blob) return null

    const ext = (blob.type || 'image/png').split('/')[1] || 'png'
    const fileName = `temp/${uuidv4()}.${ext}`

    const { error } = await supabase.storage
      .from('project-images')
      .upload(fileName, blob, { contentType: blob.type, upsert: true })

    if (error) {
      console.error('上传失败:', error.message)
      return null
    }

    const { data } = supabase.storage.from('project-images').getPublicUrl(fileName)
    return data.publicUrl
  } catch (e) {
    console.error('上传异常:', e.message || e)
    return null
  }
}

export async function createProject(data) {
  const p1Slug = generateSlug()
  const p2Slug = generateSlug()

  // 1. 创建项目
  const { data: project, error: projErr } = await supabase
    .from('projects')
    .insert({
      title: data.title || '借展文物清单',
      person1_slug: p1Slug,
      person2_slug: p2Slug,
      status: 'waiting_p1',
    })
    .select()
    .single()

  if (projErr) throw new Error(projErr.message)

  // 2. 准备图片 base64（直接存数据库）
  const imageBuffers = data.imageBuffers || []

  // 3. 创建条目（从 fields 中提取已知列 + 存完整 raw_data）
  const itemRecords = data.items.map((item, i) => {
    const f = item.fields || {}
    const imgBase64 = (item.img_idx >= 0 && imageBuffers[item.img_idx]?.base64)
      ? imageBuffers[item.img_idx].base64 : null

    return {
      project_id: project.id,
      seq: findField(f, ['序号']) || '',
      name: findField(f, ['名称']) || '',
      era: findField(f, ['时代', '年代']) || '',
      ref_no: findField(f, ['编号', '总号']) || '',
      quantity: findField(f, ['数量']) || '',
      dimensions: findField(f, ['尺寸', '大小']) || '',
      excavation_site: findField(f, ['出土地点', '出土地', '来源', '藏地', '收藏地']) || '',
      image_data: imgBase64,
      images: [],
      image_source: findField(f, ['图片来源', '图片出处']) || '',
      raw_data: f,
      sort_order: i,
    }
  })

  const { error: itemsErr } = await supabase.from('items').insert(itemRecords)
  if (itemsErr) throw new Error(itemsErr.message)

  return {
    project,
    links: {
      person1: `/form/p1/${p1Slug}`,
      person2: `/form/p2/${p2Slug}`,
    },
  }
}

export async function getProject(slug) {
  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('*')
    .or(`person1_slug.eq.${slug},person2_slug.eq.${slug}`)
    .single()

  if (projErr || !project) throw new Error('项目不存在')

  const { data: items, error: itemsErr } = await supabase
    .from('items')
    .select('*')
    .eq('project_id', project.id)
    .order('sort_order', { ascending: true })

  if (itemsErr) throw new Error(itemsErr.message)

  const role = project.person1_slug === slug ? 'p1' : 'p2'
  const tableName = role === 'p1' ? 'person1' : 'person2'
  const { data: existing } = await supabase
    .from(tableName)
    .select('*')
    .eq('project_id', project.id)

  // 室主任需看到队长的回答
  let person1Data = null
  if (role === 'p2') {
    const { data: p1 } = await supabase
      .from('person1')
      .select('*')
      .eq('project_id', project.id)
    if (p1?.length > 0) {
      const map = {}
      p1.forEach(s => { map[s.item_id] = s })
      person1Data = map
    }
  }

  return {
    project: { id: project.id, title: project.title, status: project.status },
    role,
    items,
    existing: existing?.length > 0 ? existing : null,
    person1Data,
  }
}

export async function submitForm(slug, role, payload) {
  // 查找项目
  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('*')
    .or(`person1_slug.eq.${slug},person2_slug.eq.${slug}`)
    .single()

  if (projErr || !project) throw new Error('项目不存在')

  const { person_name, answers } = payload

  if (role === 'p1') {
    const records = answers.map(a => ({
      project_id: project.id,
      item_id: a.item_id,
      person_name,
      published: a.published || 'no',
      published_notes: a.published_notes || null,
      storage_location: a.storage_location || '站队',
      storage_detail: a.storage_detail || null,
      relic_status: a.relic_status || '适合外借',
      agreed: a.agreed || 'yes',
    }))
    const { error } = await supabase.from('person1').insert(records)
    if (error) throw new Error(error.message)

    await supabase.from('projects').update({ status: 'waiting_p2' }).eq('id', project.id)
  } else {
    const records = answers.map(a => ({
      project_id: project.id,
      item_id: a.item_id,
      person_name,
      agreed: a.agreed || 'yes',
    }))
    const { error } = await supabase.from('person2').insert(records)
    if (error) throw new Error(error.message)

    await supabase.from('projects').update({ status: 'completed' }).eq('id', project.id)
  }

  return { success: true }
}

export async function getResults(projectId) {
  const { data: project, error: projErr } = await supabase
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single()

  if (projErr || !project) throw new Error('项目不存在')

  const { data: items } = await supabase
    .from('items')
    .select('*')
    .eq('project_id', projectId)
    .order('sort_order', { ascending: true })

  const { data: p1Data } = await supabase
    .from('person1')
    .select('*')
    .eq('project_id', projectId)

  const { data: p2Data } = await supabase
    .from('person2')
    .select('*')
    .eq('project_id', projectId)

  const p1Map = {}, p2Map = {}
  for (const s of (p1Data || [])) p1Map[s.item_id] = s
  for (const s of (p2Data || [])) p2Map[s.item_id] = s

  return {
    project,
    rows: items?.map(item => ({
      item,
      person1: p1Map[item.id] || null,
      person2: p2Map[item.id] || null,
    })) || [],
    person1Name: (p1Data || [])[0]?.person_name || null,
    person2Name: (p2Data || [])[0]?.person_name || null,
  }
}

export async function listProjects() {
  const { data, error } = await supabase
    .from('projects')
    .select('*, items(count)')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data || []
}

export async function updateProject(id, updates) {
  const { error } = await supabase
    .from('projects')
    .update(updates)
    .eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteItem(itemId) {
  const { error } = await supabase
    .from('items')
    .delete()
    .eq('id', itemId)
  if (error) throw new Error(error.message)
}

export async function addItems(projectId, newItems) {
  const records = newItems.map((item, i) => ({
    project_id: projectId,
    seq: item.seq || '',
    name: item.name || '',
    era: item.era || '',
    ref_no: item.ref_no || '',
    quantity: item.quantity || '',
    dimensions: item.dimensions || '',
    excavation_site: item.excavation_site || '',
    images: [],
    image_source: item.image_source || '',
    sort_order: i,
  }))
  const { error } = await supabase.from('items').insert(records)
  if (error) throw new Error(error.message)
}

export async function deleteProject(projectId) {
  // 级联删除：items 和 submissions 设置了 ON DELETE CASCADE
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId)
  if (error) throw new Error(error.message)
}
