import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { TEXT } from '../config/text'
import { getResults, updateProject, deleteItem, addItems } from '../lib/api'
import * as XLSX from 'xlsx'

export default function AdminResult() {
  const { projectId } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lightboxImg, setLightboxImg] = useState(null)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [showAddForm, setShowAddForm] = useState(false)
  const [newItem, setNewItem] = useState({
    seq: '', name: '', era: '', ref_no: '', quantity: '',
    dimensions: '', excavation_site: '', image_source: '',
  })

  const loadData = useCallback(async () => {
    try {
      const result = await getResults(projectId)
      setData(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { loadData() }, [loadData])

  async function handleRename() {
    if (!titleDraft.trim() || titleDraft.trim() === data?.project?.title) {
      setEditingTitle(false)
      return
    }
    try {
      await updateProject(projectId, { title: titleDraft.trim() })
      setData(prev => ({ ...prev, project: { ...prev.project, title: titleDraft.trim() } }))
      setEditingTitle(false)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleDelete(itemId) {
    if (!confirm('确定删除此条目？如果已有提交数据，关联数据也将被删除。')) return
    try {
      await deleteItem(itemId)
      setData(prev => ({ ...prev, rows: prev.rows.filter(r => r.item.id !== itemId) }))
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleAdd() {
    const fields = ['name', 'seq', 'era', 'ref_no', 'quantity', 'dimensions', 'excavation_site']
    if (!newItem.name.trim()) { setError('名称不能为空'); return }
    try {
      await addItems(projectId, [newItem])
      setShowAddForm(false)
      setNewItem({ seq: '', name: '', era: '', ref_no: '', quantity: '', dimensions: '', excavation_site: '', image_source: '' })
      loadData()
    } catch (err) {
      setError(err.message)
    }
  }

  function exportExcel() {
    if (!data) return
    const headers = [
      '序号', '名称', '时代', '编号', '数量', '尺寸', '出土地点', '图片来源',
      `[${TEXT.person1Title}] 是否发表`, `[${TEXT.person1Title}] 发表备注`,
      `[${TEXT.person1Title}] 存放地点`, `[${TEXT.person1Title}] 存放详情`,
      `[${TEXT.person1Title}] 文物状态`, `[${TEXT.person1Title}] 是否同意`,
      `[${TEXT.person2Title}] 是否同意`,
    ]
    const sheetRows = [headers]
    for (const row of data.rows) {
      const item = row.item
      const p1 = row.person1 || {}
      const p2 = row.person2 || {}
      sheetRows.push([
        item.seq || '', item.name || '', item.era || '', item.ref_no || '',
        item.quantity || '', item.dimensions || '', item.excavation_site || '',
        item.image_source || '',
        p1.published === 'yes' ? TEXT.published_yes : p1.published === 'no' ? TEXT.published_no : p1.published === 'notes' ? TEXT.published_notes : '',
        p1.published_notes || '', p1.storage_location || '', p1.storage_detail || '',
        p1.relic_status || '',
        p1.agreed === 'yes' ? TEXT.agree_yes : p1.agreed === 'no' ? TEXT.agree_no : '',
        p2.agreed === 'yes' ? TEXT.agree_yes : p2.agreed === 'no' ? TEXT.agree_no : '',
      ])
    }
    sheetRows.push([])
    sheetRows.push([`${TEXT.person1Title}：${data.person1Name || TEXT.notSubmitted}`])
    sheetRows.push([`${TEXT.person2Title}：${data.person2Name || TEXT.notSubmitted}`])
    const ws = XLSX.utils.aoa_to_sheet(sheetRows)
    ws['!cols'] = headers.map(() => ({ wch: 16 }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '填写结果')
    XLSX.writeFile(wb, `${data.project.title || '借展文物清单'}_结果.xlsx`)
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="text-gray-500">加载中...</div></div>
  if (error) return <div className="flex items-center justify-center min-h-screen"><div className="text-red-500">{error}</div></div>
  if (!data) return null

  return (
    <div className="max-w-full mx-auto px-3 py-4">
      {/* 顶部 */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex-1">
          <Link to="/" className="text-blue-500 text-sm hover:underline">&larr; {TEXT.backHome}</Link>
          <div className="flex items-center gap-2 mt-1">
            {editingTitle ? (
              <input
                type="text" value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onBlur={handleRename}
                onKeyDown={e => { if (e.key === 'Enter') handleRename(); if (e.key === 'Escape') setEditingTitle(false) }}
                className="text-lg font-bold border rounded px-2 py-1 w-full max-w-md"
                autoFocus
              />
            ) : (
              <h1 className="text-lg font-bold cursor-pointer hover:text-blue-500"
                onClick={() => { setTitleDraft(data.project.title); setEditingTitle(true) }}>
                {data.project.title} — {TEXT.resultTitle} ✎
              </h1>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={exportExcel}
            className="px-4 py-2 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600">
            {TEXT.exportExcel}
          </button>
          <button onClick={() => setShowAddForm(!showAddForm)}
            className="px-4 py-2 bg-blue-500 text-white text-sm rounded-lg hover:bg-blue-600">
            + 添加条目
          </button>
        </div>
      </div>

      {/* 填写人信息 */}
      <div className="mb-3 flex gap-4 text-sm text-gray-600 flex-wrap">
        <span>{TEXT.person1Title}：<strong>{data.person1Name || TEXT.notSubmitted}</strong></span>
        <span>{TEXT.person2Title}：<strong>{data.person2Name || TEXT.notSubmitted}</strong></span>
      </div>

      {error && <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>}

      {/* 添加条目表单 */}
      {showAddForm && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="font-semibold mb-3">添加新条目</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { key: 'seq', label: '序号' }, { key: 'name', label: '名称' },
              { key: 'era', label: '时代' }, { key: 'ref_no', label: '编号' },
              { key: 'quantity', label: '数量' }, { key: 'dimensions', label: '尺寸' },
              { key: 'excavation_site', label: '出土地点' }, { key: 'image_source', label: '图片来源' },
            ].map(f => (
              <div key={f.key} className="flex flex-col">
                <label className="text-xs text-gray-500 mb-0.5">{f.label}</label>
                <input
                  type="text" value={newItem[f.key]}
                  onChange={e => setNewItem(prev => ({ ...prev, [f.key]: e.target.value }))}
                  className="px-2 py-1 border rounded text-sm"
                  placeholder={f.key === 'name' ? '必填' : '选填'}
                />
              </div>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button onClick={handleAdd}
              className="px-4 py-1.5 bg-green-500 text-white text-sm rounded hover:bg-green-600">确认添加</button>
            <button onClick={() => setShowAddForm(false)}
              className="px-4 py-1.5 bg-gray-300 text-gray-700 text-sm rounded hover:bg-gray-400">取消</button>
          </div>
        </div>
      )}

      {/* PC 表格视图 */}
      <div className="hidden md:block overflow-x-auto border rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              {['序号', '名称', '时代', '编号', '图片', 'P1-发表', 'P1-存放', 'P1-状态', 'P1-同意', 'P2-同意', '操作']
                .map((h, i) => <th key={i} className="px-2 py-1.5 text-left border-b whitespace-nowrap">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, i) => {
              const item = row.item; const p1 = row.person1 || {}; const p2 = row.person2 || {}
              const imgs = item.images || []
              return (
                <tr key={item.id} className="border-t hover:bg-gray-50">
                  <td className="px-2 py-1 whitespace-nowrap">{item.seq || i + 1}</td>
                  <td className="px-2 py-1 whitespace-nowrap font-medium">{item.name}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{item.era}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{item.ref_no}</td>
                  <td className="px-2 py-1">
                    {imgs.length > 0
                      ? <img src={imgs[0]} alt="" className="w-10 h-10 object-cover rounded cursor-pointer" onClick={() => setLightboxImg(imgs[0])} />
                      : <span className="text-gray-400 text-xs">{TEXT.noImage}</span>}
                  </td>
                  <td className="px-2 py-1 whitespace-nowrap text-xs">{renderP1(p1, 'published')}</td>
                  <td className="px-2 py-1 whitespace-nowrap text-xs">{p1.storage_location || '-'}{p1.storage_detail ? ` (${p1.storage_detail})` : ''}</td>
                  <td className="px-2 py-1 whitespace-nowrap text-xs">{p1.relic_status || '-'}</td>
                  <td className="px-2 py-1 whitespace-nowrap text-xs">{ag(p1.agreed)}</td>
                  <td className="px-2 py-1 whitespace-nowrap text-xs">{ag(p2.agreed)}</td>
                  <td className="px-2 py-1 whitespace-nowrap">
                    <button onClick={() => handleDelete(item.id)}
                      className="text-red-500 hover:text-red-700 text-xs">删除</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 手机卡片视图 */}
      <div className="md:hidden space-y-3">
        {data.rows.map((row, i) => {
          const item = row.item; const p1 = row.person1 || {}; const p2 = row.person2 || {}
          const imgs = item.images || []
          return (
            <div key={item.id} className="bg-white border rounded-lg p-3 shadow-sm relative">
              <button onClick={() => handleDelete(item.id)}
                className="absolute top-2 right-2 text-red-500 text-xs">删除</button>
              {imgs.length > 0 && <img src={imgs[0]} alt="" className="w-full h-40 object-cover rounded mb-2 cursor-pointer" onClick={() => setLightboxImg(imgs[0])} />}
              <div className="font-medium">{item.seq || `#${i + 1}`}. {item.name || '(未命名)'}</div>
              <div className="text-xs text-gray-500 mt-1">
                {item.era && <span>时代：{item.era} &nbsp;</span>}
                {item.ref_no && <span>编号：{item.ref_no} &nbsp;</span>}
                {item.quantity && <span>数量：{item.quantity}</span>}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
                <div>发表：{renderP1(p1, 'published')}</div>
                <div>存放：{p1.storage_location || '-'}</div>
                <div>状态：{p1.relic_status || '-'}</div>
                <div>{TEXT.person1Title}同意：<strong>{ag(p1.agreed)}</strong></div>
                <div className="col-span-2">{TEXT.person2Title}同意：<strong>{ag(p2.agreed)}</strong></div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Lightbox */}
      {lightboxImg && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setLightboxImg(null)}>
          <img src={lightboxImg} alt="" className="max-w-full max-h-full object-contain rounded" />
          <button onClick={() => setLightboxImg(null)} className="absolute top-4 right-4 text-white text-3xl leading-none">&times;</button>
        </div>
      )}
    </div>
  )
}

function renderP1(p1, field) {
  if (field === 'published') {
    const v = p1.published
    if (v === 'yes') return TEXT.published_yes
    if (v === 'no') return TEXT.published_no
    if (v === 'notes') return `${TEXT.published_notes}${p1.published_notes ? `: ${p1.published_notes}` : ''}`
    return '-'
  }
  return p1[field] || '-'
}

function ag(v) {
  if (v === 'yes') return TEXT.agree_yes
  if (v === 'no') return TEXT.agree_no
  return TEXT.notSubmitted
}
