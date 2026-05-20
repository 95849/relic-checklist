// GET /api/projects/:slug — 通过 slug 获取项目和条目（公开）
import { getSupabase } from '../../_lib/supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: '仅支持 GET' })
  }

  const { slug } = req.query

  try {
    const supabase = getSupabase()

    const { data: project, error: projErr } = await supabase
      .from('projects')
      .select('*')
      .or(`person1_slug.eq.${slug},person2_slug.eq.${slug}`)
      .single()

    if (projErr || !project) {
      return res.status(404).json({ error: '项目不存在' })
    }

    const { data: items, error: itemsErr } = await supabase
      .from('items')
      .select('*')
      .eq('project_id', project.id)
      .order('sort_order', { ascending: true })

    if (itemsErr) throw itemsErr

    // 判断当前是哪个角色
    const role = project.person1_slug === slug ? 'p1' : 'p2'

    // 检查是否已提交
    let existing = null
    if (role === 'p1') {
      const { data: subs } = await supabase
        .from('person1')
        .select('*')
        .eq('project_id', project.id)
      existing = subs || []
    } else {
      const { data: subs } = await supabase
        .from('person2')
        .select('*')
        .eq('project_id', project.id)
      existing = subs || []
    }

    return res.status(200).json({
      project: {
        id: project.id,
        title: project.title,
        status: project.status,
      },
      role,
      items,
      existing: existing.length > 0 ? existing : null,
    })
  } catch (err) {
    console.error('获取项目错误:', err)
    return res.status(500).json({ error: err.message })
  }
}
