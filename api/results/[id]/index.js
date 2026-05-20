// GET /api/results/:id — 获取项目完整结果
import { getSupabase } from '../../_lib/supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: '仅支持 GET' })
  }

  const { id } = req.query

  try {
    const supabase = getSupabase()

    const { data: project, error: projErr } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single()

    if (projErr || !project) {
      return res.status(404).json({ error: '项目不存在' })
    }

    const { data: items, error: itemsErr } = await supabase
      .from('items')
      .select('*')
      .eq('project_id', id)
      .order('sort_order', { ascending: true })

    if (itemsErr) throw itemsErr

    const { data: p1Data, error: p1Err } = await supabase
      .from('person1')
      .select('*')
      .eq('project_id', id)

    if (p1Err) throw p1Err

    const { data: p2Data, error: p2Err } = await supabase
      .from('person2')
      .select('*')
      .eq('project_id', id)

    if (p2Err) throw p2Err

    // 将提交数据按 item_id 做映射
    const p1Map = {}
    for (const s of (p1Data || [])) {
      p1Map[s.item_id] = s
    }
    const p2Map = {}
    for (const s of (p2Data || [])) {
      p2Map[s.item_id] = s
    }

    const p1Name = (p1Data || []).length > 0 ? p1Data[0].person_name : null
    const p2Name = (p2Data || []).length > 0 ? p2Data[0].person_name : null

    const rows = items.map(item => ({
      item,
      person1: p1Map[item.id] || null,
      person2: p2Map[item.id] || null,
    }))

    return res.status(200).json({
      project,
      rows,
      person1Name: p1Name,
      person2Name: p2Name,
    })
  } catch (err) {
    console.error('获取结果错误:', err)
    return res.status(500).json({ error: err.message })
  }
}
