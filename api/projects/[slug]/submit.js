// POST /api/projects/:slug/submit — 提交表单回答
import { getSupabase } from '../../_lib/supabase.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '仅支持 POST' })
  }

  const { slug } = req.query
  const { role, person_name, answers } = req.body

  if (!role || !person_name || !answers || answers.length === 0) {
    return res.status(400).json({ error: '缺少必填字段' })
  }

  try {
    const supabase = getSupabase()

    // 查找项目
    const { data: project, error: projErr } = await supabase
      .from('projects')
      .select('*')
      .or(`person1_slug.eq.${slug},person2_slug.eq.${slug}`)
      .single()

    if (projErr || !project) {
      return res.status(404).json({ error: '项目不存在' })
    }

    if (role === 'p1') {
      // 出借方提交
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
      if (error) throw error

      // 更新项目状态
      await supabase
        .from('projects')
        .update({ status: 'waiting_p2' })
        .eq('id', project.id)

    } else if (role === 'p2') {
      // 审批人提交
      const records = answers.map(a => ({
        project_id: project.id,
        item_id: a.item_id,
        person_name,
        agreed: a.agreed || 'yes',
      }))

      const { error } = await supabase.from('person2').insert(records)
      if (error) throw error

      // 更新项目状态
      await supabase
        .from('projects')
        .update({ status: 'completed' })
        .eq('id', project.id)
    } else {
      return res.status(400).json({ error: '无效的角色' })
    }

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('提交错误:', err)
    return res.status(500).json({ error: err.message })
  }
}
