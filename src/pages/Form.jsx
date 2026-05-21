import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { TEXT } from '../config/text'
import { getProject, submitForm } from '../lib/api'
import { base64ToBlobUrl } from '../lib/image'

export default function Form() {
  const { role, slug } = useParams()
  const navigate = useNavigate()
  const isP1 = role === 'p1'

  const [project, setProject] = useState(null)
  const [items, setItems] = useState([])
  const [personName, setPersonName] = useState('')
  const [answers, setAnswers] = useState({})  // { itemId: { published, storage_location, ... } }
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [batchOpen, setBatchOpen] = useState(false)
  const [lightboxImg, setLightboxImg] = useState(null)
  const nameRef = useRef(null)

  // 加载项目数据
  useEffect(() => {
    (async () => {
      try {
        const data = await getProject(slug)
        setProject(data.project)
        setItems(data.items)

        // 恢复已有答案
        if (data.existing) {
          const map = {}
          for (const sub of data.existing) {
            map[sub.item_id] = isP1 ? {
              published: sub.published,
              published_notes: sub.published_notes || '',
              storage_location: sub.storage_location,
              storage_detail: sub.storage_detail || '',
              relic_status: sub.relic_status,
              agreed: sub.agreed,
            } : {
              agreed: sub.agreed,
            }
          }
          setAnswers(map)
          if (data.existing.length > 0) {
            setPersonName(data.existing[0].person_name)
          }
        }
        setLoading(false)
      } catch (err) {
        setError(err.message)
        setLoading(false)
      }
    })()
  }, [slug, isP1])

  // 本地自动保存
  const saveKey = `draft_${slug}_${role}`
  useEffect(() => {
    if (Object.keys(answers).length > 0) {
      localStorage.setItem(saveKey, JSON.stringify({ personName, answers }))
    }
  }, [answers, personName, saveKey])

  useEffect(() => {
    const saved = localStorage.getItem(saveKey)
    if (saved && Object.keys(answers).length === 0) {
      try {
        const draft = JSON.parse(saved)
        if (draft.personName) setPersonName(draft.personName)
        if (draft.answers) setAnswers(draft.answers)
      } catch (e) { /* ignore */ }
    }
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  function setAnswer(itemId, field, value) {
    setAnswers(prev => {
      const item = prev[itemId] || (isP1
        ? { published: '', storage_location: '', relic_status: '', agreed: '' }
        : { agreed: '' })
      return { ...prev, [itemId]: { ...item, [field]: value } }
    })
  }

  // 批量设置
  function batchSet(field, value) {
    const upd = {}
    for (const item of items) {
      const current = answers[item.id] || (isP1
        ? { published: '', storage_location: '', relic_status: '', agreed: '' }
        : { agreed: '' })
      upd[item.id] = { ...current, [field]: value }
    }
    setAnswers(prev => ({ ...prev, ...upd }))
    setBatchOpen(false)
  }

  // 校验
  function validate() {
    const errors = []
    if (!personName.trim()) {
      errors.push('请填写姓名')
    }
    for (const item of items) {
      const label = `#${item.seq || items.indexOf(item) + 1} ${item.name || '(未命名)'}`
      const a = answers[item.id]
      if (!a) { errors.push(`${label}：未填写任何选项`); continue }
      if (isP1) {
        if (!a.published) errors.push(`${label}：缺少「${TEXT.qPublished}」`)
        if (a.published === 'notes' && !a.published_notes?.trim()) errors.push(`${label}：「${TEXT.qPublished}」选了备注但未填写备注内容`)
        if (!a.storage_location) errors.push(`${label}：缺少「${TEXT.qStorage}」`)
        if (a.storage_location === '其他' && !a.storage_detail?.trim()) errors.push(`${label}：「${TEXT.qStorage}」选了其他但未填写具体地点`)
        if (!a.relic_status) errors.push(`${label}：缺少「${TEXT.qStatus}」`)
        if (!a.agreed) errors.push(`${label}：缺少「${TEXT.qAgree}」`)
      } else {
        if (!a.agreed) errors.push(`${label}：缺少「${TEXT.approveAgree}」`)
      }
    }
    if (errors.length > 0) {
      setError(errors.slice(0, 10).join('\n') + (errors.length > 10 ? `\n...还有 ${errors.length - 10} 条未完成` : ''))
      return false
    }
    return true
  }

  const handleSubmit = useCallback(async () => {
    setError('')
    if (!validate()) {
      return
    }

    setSubmitting(true)
    try {
      await submitForm(slug, role, {
        person_name: personName.trim(),
        answers: items.map(item => ({
          item_id: item.id,
          ...answers[item.id],
        })),
      })
      localStorage.removeItem(saveKey)
      navigate(`/form/${role}/${slug}/success`)
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }, [answers, items, personName, role, slug, saveKey, navigate])  // eslint-disable-line react-hooks/exhaustive-deps

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">加载中...</div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-500">{error || '项目不存在'}</div>
      </div>
    )
  }

  const title = isP1 ? TEXT.formTitle1 : TEXT.formTitle2

  return (
    <div className="max-w-2xl mx-auto px-3 py-4 pb-32">
      <h1 className="text-lg font-bold text-center mb-4">{title}</h1>

      {/* 姓名输入 */}
      <div className="mb-4" ref={nameRef}>
        <input
          type="text"
          value={personName}
          onChange={e => setPersonName(e.target.value)}
          placeholder={TEXT.namePlaceholder}
          className="w-full px-4 py-3 border rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>
      )}

      {/* 批量操作栏 */}
      <div className="sticky top-0 z-10 bg-white/95 backdrop-blur pb-2 mb-3">
        <button
          onClick={() => setBatchOpen(!batchOpen)}
          className="w-full px-4 py-2.5 bg-gray-100 border border-gray-300 rounded-lg text-sm font-medium flex items-center justify-between"
        >
          <span>{TEXT.batchBarLabel}</span>
          <span className={`transform transition-transform ${batchOpen ? 'rotate-180' : ''}`}>▼</span>
        </button>
        {batchOpen && (
          <div className="mt-2 p-3 bg-gray-50 border rounded-lg space-y-2">
            {isP1 ? (
              <>
                <BatchRow label={TEXT.qPublished} options={[
                  { v: 'yes', t: TEXT.published_yes }, { v: 'no', t: TEXT.published_no }, { v: 'notes', t: TEXT.published_notes }
                ]} onSelect={v => batchSet('published', v)} />
                <BatchRow label={TEXT.qStorage} options={[
                  { v: '站队', t: TEXT.storage_station }, { v: '其他', t: TEXT.storage_other }
                ]} onSelect={v => batchSet('storage_location', v)} />
                <BatchRow label={TEXT.qStatus} options={[
                  { v: '适合外借', t: TEXT.status_suitable }, { v: '不适合外借', t: TEXT.status_not_suitable }
                ]} onSelect={v => batchSet('relic_status', v)} />
                <BatchRow label={TEXT.qAgree} options={[
                  { v: 'yes', t: TEXT.agree_yes }, { v: 'no', t: TEXT.agree_no }
                ]} onSelect={v => batchSet('agreed', v)} />
              </>
            ) : (
              <BatchRow label={TEXT.approveAgree} options={[
                { v: 'yes', t: TEXT.agree_yes }, { v: 'no', t: TEXT.agree_no }
              ]} onSelect={v => batchSet('agreed', v)} />
            )}
          </div>
        )}
      </div>

      {/* 条目卡片列表 */}
      <div className="space-y-3">
        {items.map((item, idx) => (
          <ItemCard
            key={item.id}
            item={item}
            index={idx}
            isP1={isP1}
            answer={answers[item.id] || (isP1
              ? { published: '', storage_location: '', relic_status: '', agreed: '' }
              : { agreed: '' })}
            onChange={(field, value) => setAnswer(item.id, field, value)}
            onImageClick={img => setLightboxImg(img)}
          />
        ))}
      </div>

      {/* 底部提交栏 */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-3 z-20">
        <div className="max-w-2xl mx-auto">
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-3 bg-blue-500 text-white text-lg font-medium rounded-lg hover:bg-blue-600 disabled:opacity-50"
          >
            {submitting ? TEXT.submitting : TEXT.submitBtn}
          </button>
        </div>
      </div>

      {/* 图片 Lightbox */}
      {lightboxImg && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setLightboxImg(null)}
        >
          <img src={lightboxImg} alt="" className="max-w-full max-h-full object-contain rounded" />
          <button
            onClick={() => setLightboxImg(null)}
            className="absolute top-4 right-4 text-white text-3xl leading-none"
          >&times;</button>
        </div>
      )}
    </div>
  )
}

function BatchRow({ label, options, onSelect }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-medium text-gray-600 min-w-[70px]">{label}：</span>
      {options.map(opt => (
        <button
          key={opt.v}
          onClick={() => onSelect(opt.v)}
          className="px-2.5 py-1 text-xs bg-white border rounded hover:bg-blue-50 hover:border-blue-300"
        >
          {opt.t}
        </button>
      ))}
    </div>
  )
}

function ItemCard({ item, index, isP1, answer, onChange, onImageClick }) {
  const images = item.images || []
  const imgSrc = images[0] || base64ToBlobUrl(item.image_data)

  return (
    <div className="bg-white border rounded-lg p-3 shadow-sm">
      {/* 图片区 */}
      {imgSrc && (
        <div className="flex gap-2 mb-2 overflow-x-auto">
          <img
            src={imgSrc}
            alt=""
            className="w-20 h-20 object-cover rounded border cursor-pointer shrink-0"
            onClick={() => onImageClick(imgSrc)}
          />
        </div>
      )}

      {/* 文物基础信息（显示所有列） */}
      <div className="text-sm text-gray-600 mb-3 space-y-0.5">
        <span className="font-medium text-gray-800">#{index + 1}</span>
        {item.seq && <span className="ml-2">序号：{item.seq}</span>}
        <div className="font-medium text-base text-gray-900">{item.name || '(未命名)'}</div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
          {(item.raw_data ? Object.entries(item.raw_data) : [
            ['时代', item.era], ['编号', item.ref_no], ['数量', item.quantity],
            ['尺寸', item.dimensions], ['出土地点', item.excavation_site], ['图片来源', item.image_source],
          ]).filter(([k, v]) => {
            // 过滤：不显示空值、不显示图片列、不显示名称（已在上方显示）
            if (!v) return false
            const label = String(k)
            if (label.includes('图片') && !label.includes('来源') && !label.includes('出处')) return false
            if (label === '名称') return false
            return true
          }).map(([k, v]) => (
            <span key={k}>{String(k)}：{String(v)}</span>
          ))}
        </div>
      </div>

      {/* 问题区 */}
      {isP1 ? (
        <div className="space-y-2.5">
          {/* 是否发表 */}
          <ChoiceGroup
            label={TEXT.qPublished}
            options={[
              { v: 'yes', t: TEXT.published_yes },
              { v: 'no', t: TEXT.published_no },
              { v: 'notes', t: TEXT.published_notes },
            ]}
            value={answer.published}
            onChange={v => onChange('published', v)}
          />
          {answer.published === 'notes' && (
            <input
              type="text"
              value={answer.published_notes || ''}
              onChange={e => onChange('published_notes', e.target.value)}
              placeholder={TEXT.publishedNotesHint}
              className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          )}

          {/* 存放地点 */}
          <ChoiceGroup
            label={TEXT.qStorage}
            options={[
              { v: '站队', t: TEXT.storage_station },
              { v: '其他', t: TEXT.storage_other },
            ]}
            value={answer.storage_location}
            onChange={v => onChange('storage_location', v)}
          />
          {answer.storage_location === '其他' && (
            <input
              type="text"
              value={answer.storage_detail || ''}
              onChange={e => onChange('storage_detail', e.target.value)}
              placeholder={TEXT.storageDetailHint}
              className="w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          )}

          {/* 文物状态 */}
          <ChoiceGroup
            label={TEXT.qStatus}
            options={[
              { v: '适合外借', t: TEXT.status_suitable },
              { v: '不适合外借', t: TEXT.status_not_suitable },
            ]}
            value={answer.relic_status}
            onChange={v => onChange('relic_status', v)}
          />

          {/* 是否同意 */}
          <ChoiceGroup
            label={TEXT.qAgree}
            options={[
              { v: 'yes', t: TEXT.agree_yes },
              { v: 'no', t: TEXT.agree_no },
            ]}
            value={answer.agreed}
            onChange={v => onChange('agreed', v)}
          />
        </div>
      ) : (
        <div>
          <ChoiceGroup
            label={TEXT.approveAgree}
            options={[
              { v: 'yes', t: TEXT.agree_yes },
              { v: 'no', t: TEXT.agree_no },
            ]}
            value={answer.agreed}
            onChange={v => onChange('agreed', v)}
          />
        </div>
      )}
    </div>
  )
}

function ChoiceGroup({ label, options, value, onChange }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-medium text-gray-500 min-w-[65px]">{label}</span>
      {options.map(opt => (
        <button
          key={opt.v}
          onClick={() => onChange(opt.v)}
          className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
            value === opt.v
              ? 'bg-blue-500 text-white border-blue-500'
              : 'bg-white text-gray-700 border-gray-300 hover:border-blue-300'
          }`}
        >
          {opt.t}
        </button>
      ))}
    </div>
  )
}
