// 前端 API — 直连 Supabase（无中间服务器）
import { supabase } from './supabase'
import { v4 as uuidv4 } from 'uuid'
import { parseDocument } from './parse'

function generateSlug() {
  return uuidv4().replace(/-/g, '').substring(0, 12)
}

export { parseDocument }

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

  // 2. 上传图片 + 创建条目
  const itemRecords = []
  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i]
    const imageUrls = []

    if (item.image_data && item.image_data.startsWith('data:')) {
      try {
        const matches = item.image_data.match(/^data:(.+);base64,(.+)$/)
        if (matches) {
          const mimeType = matches[1]
          const base64Data = matches[2]
          const ext = mimeType.split('/')[1] || 'png'
          const fileName = `${project.id}/${i}_0.${ext}`

          // base64 → Uint8Array
          const binaryStr = atob(base64Data)
          const bytes = new Uint8Array(binaryStr.length)
          for (let j = 0; j < binaryStr.length; j++) {
            bytes[j] = binaryStr.charCodeAt(j)
          }

          const { error: uploadErr } = await supabase.storage
            .from('project-images')
            .upload(fileName, bytes, { contentType: mimeType, upsert: false })

          if (!uploadErr) {
            const { data: urlData } = supabase.storage
              .from('project-images')
              .getPublicUrl(fileName)
            imageUrls.push(urlData.publicUrl)
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

  return {
    project: { id: project.id, title: project.title, status: project.status },
    role,
    items,
    existing: existing?.length > 0 ? existing : null,
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
