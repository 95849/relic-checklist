import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { TEXT } from '../config/text'
import { getResults, updateProject, deleteItem, addItems, parseDocument } from '../lib/api'
import { supabase } from '../lib/supabase'
import { logout } from '../components/AuthGuard'
import { base64ToBlobUrl } from '../lib/image'
import * as XLSX from 'xlsx'
import { Document, Packer, Paragraph, Table, TableRow, TableCell, TextRun, WidthType, ImageRun } from 'docx'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

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
  const [addingFile, setAddingFile] = useState(false)
  const [parsedItems, setParsedItems] = useState(null)

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

  async function handleAddFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setAddingFile(true)
    setError('')
    try {
      const result = await parseDocument(file)
      if (!result.items?.length) { setError('未解析到条目'); setAddingFile(false); return }
      setParsedItems(result)
    } catch (err) { setError(err.message) }
    setAddingFile(false)
  }

  async function handleAddParsedItems() {
    if (!parsedItems?.items?.length) return
    setError('')
    try {
      // 复用 createProject 的图片上传逻辑
      const { imageBuffers } = parsedItems
      const newRecords = parsedItems.items.map((item, i) => {
        const f = item.fields || {}
        const imgBase64 = (item.img_idx >= 0 && imageBuffers[item.img_idx]?.base64)
          ? imageBuffers[item.img_idx].base64 : null
        return {
          seq: f['序号'] || '', name: f['名称'] || '', era: f['时代'] || '', ref_no: f['编号'] || '',
          quantity: f['数量'] || '', dimensions: f['尺寸'] || '', excavation_site: f['出土地点'] || f['来源'] || '',
          image_data: imgBase64, images: [],
          image_source: f['图片来源'] || '',
          raw_data: f,
        }
      })
      const { error } = await supabase.from('items').insert(
        newRecords.map(r => ({ ...r, project_id: projectId, sort_order: 0 }))
      )
      if (error) throw new Error(error.message)
      setParsedItems(null)
      loadData()
    } catch (err) { setError(err.message) }
  }

  // 从 raw_data 提取动态列（过滤掉图片列、空列）
  function getDataColumns() {
    if (!data?.rows?.length) return []
    const keys = new Set()
    for (const row of data.rows) {
      const rd = row.item?.raw_data
      if (rd) Object.keys(rd).forEach(k => {
        if (!k.includes('图片') || k.includes('来源') || k.includes('出处')) keys.add(k)
      })
    }
    return [...keys].filter(k => k !== '图片')
  }

  function fieldVal(item, col) {
    const rd = item?.raw_data
    if (rd && rd[col] !== undefined) return rd[col]
    return ''
  }

  function p1Text(p1, field) {
    if (!p1) return ''
    if (field === 'published') {
      return p1.published === 'yes' ? TEXT.published_yes : p1.published === 'no' ? TEXT.published_no : p1.published === 'notes' ? `${TEXT.published_notes}${p1.published_notes ? ':' + p1.published_notes : ''}` : ''
    }
    return p1[field] || ''
  }

  function agreeText(v) {
    if (v === 'yes') return TEXT.agree_yes
    if (v === 'no') return TEXT.agree_no
    return ''
  }

  function buildRows() {
    const rows = []
    for (const row of (data?.rows || [])) {
      const item = row.item; const p1 = row.person1 || {}; const p2 = row.person2 || {}
      rows.push({
        item, p1, p2,
        imgSrc: (item.images || [])[0] || base64ToBlobUrl(item.image_data),
        cells: [
          p1Text(p1, 'published'), p1.published_notes || '', p1.storage_location || '', p1.storage_detail || '',
          p1.relic_status || '', agreeText(p1.agreed), p1.agreed_notes || '',
          agreeText(p2.agreed),
        ],
      })
    }
    return rows
  }

  const dataColumns = getDataColumns()
  const exportRows = buildRows()
  const p1Fields = [TEXT.qPublished, '发表备注', TEXT.qStorage, '存放详情', TEXT.qStatus, TEXT.qAgree, '不同意原因']

  function exportExcel() {
    if (!data) return
    const headers = [...dataColumns, ...p1Fields, `${TEXT.person2Title}-${TEXT.qAgree}`]
    const sheetRows = [headers]
    for (const r of exportRows) {
      sheetRows.push([
        ...dataColumns.map(c => fieldVal(r.item, c)),
        ...r.cells,
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

  async function exportDocx() {
    if (!data) return
    const imgHeader = '图片'
    const headers = [...dataColumns, imgHeader, ...p1Fields, `${TEXT.person2Title}-${TEXT.qAgree}`]

    function textCell(text) {
      return new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: String(text || ''), size: 18 })] })] })
    }

    function headerCell(text) {
      return new TableCell({ children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 18 })] })] })
    }

    const tableRows = [new TableRow({ children: headers.map(headerCell) })]

    for (const r of exportRows) {
      const cells = []
      // 数据列
      for (const c of dataColumns) {
        cells.push(textCell(fieldVal(r.item, c)))
      }
      // 图片列
      const imgBase64 = r.item?.image_data
      if (imgBase64) {
        try {
          const b64 = imgBase64.indexOf(',') > -1 ? imgBase64.split(',')[1] : imgBase64
          const binary = atob(b64.replace(/\s/g, ''))
          const bytes = new Uint8Array(binary.length)
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
          cells.push(new TableCell({
            children: [new Paragraph({
              children: [new ImageRun({ data: bytes, transformation: { width: 40, height: 40 } })],
            })],
          }))
        } catch (e) {
          cells.push(textCell('(图片)'))
        }
      } else {
        cells.push(textCell(''))
      }
      // 回答列
      for (const v of r.cells) {
        cells.push(textCell(v))
      }
      tableRows.push(new TableRow({ children: cells }))
    }

    const doc = new Document({
      sections: [{
        children: [
          new Paragraph({ children: [new TextRun({ text: data.project.title || '借展文物清单', bold: true, size: 28 })] }),
          new Paragraph({ children: [new TextRun({ text: `${TEXT.person1Title}：${data.person1Name || ''}    ${TEXT.person2Title}：${data.person2Name || ''}`, size: 20 })] }),
          new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } }),
        ],
      }],
    })
    const blob = await Packer.toBlob(doc)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = `${data.project.title || '清单'}_结果.docx`; a.click()
    URL.revokeObjectURL(url)
  }

  function exportPdf() {
    if (!data) return
    const doc = new jsPDF('l', 'mm', 'a4')
    const headers = [...dataColumns, ...p1Fields, `${TEXT.person2Title}-${TEXT.qAgree}`]
    const body = exportRows.map(r => [...dataColumns.map(c => fieldVal(r.item, c)), ...r.cells])
    doc.setFontSize(14); doc.text(data.project.title || '借展文物清单', 14, 15)
    doc.setFontSize(10)
    doc.text(`${TEXT.person1Title}：${data.person1Name || ''}    ${TEXT.person2Title}：${data.person2Name || ''}`, 14, 22)
    autoTable(doc, { head: [headers], body, startY: 28, styles: { fontSize: 7, cellPadding: 1 }, headStyles: { fillColor: [100, 100, 100] } })
    doc.save(`${data.project.title || '清单'}_结果.pdf`)
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="text-gray-500">加载中...</div></div>
  if (error) return <div className="flex items-center justify-center min-h-screen"><div className="text-red-500">{error}</div></div>
  if (!data) return null

  return (
    <div className="max-w-full mx-auto px-3 py-4">
      {/* 顶部 */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <Link to="/" className="text-blue-500 text-sm hover:underline">&larr; {TEXT.backHome}</Link>
            <button onClick={logout} className="text-xs text-gray-400 hover:text-red-500 underline">退出</button>
          </div>
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
            className="px-3 py-1.5 bg-green-500 text-white text-xs rounded hover:bg-green-600">Excel</button>
          <button onClick={exportDocx}
            className="px-3 py-1.5 bg-blue-500 text-white text-xs rounded hover:bg-blue-600">Word</button>
          <button onClick={exportPdf}
            className="px-3 py-1.5 bg-red-500 text-white text-xs rounded hover:bg-red-600">PDF</button>
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

          {/* 方式A：手动输入 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            {[
              { key: 'seq', label: '序号' }, { key: 'name', label: '名称' },
              { key: 'era', label: '时代' }, { key: 'ref_no', label: '编号' },
              { key: 'quantity', label: '数量' }, { key: 'dimensions', label: '尺寸' },
              { key: 'excavation_site', label: '出土地点' }, { key: 'image_source', label: '图片来源' },
            ].map(f => (
              <div key={f.key} className="flex flex-col">
                <label className="text-xs text-gray-500 mb-0.5">{f.label}</label>
                <input type="text" value={newItem[f.key]}
                  onChange={e => setNewItem(prev => ({ ...prev, [f.key]: e.target.value }))}
                  className="px-2 py-1 border rounded text-sm"
                  placeholder={f.key === 'name' ? '必填' : '选填'} />
              </div>
            ))}
          </div>
          <div className="flex gap-2 mb-4">
            <button onClick={handleAdd} className="px-4 py-1.5 bg-green-500 text-white text-sm rounded hover:bg-green-600">确认添加</button>
          </div>

          {/* 方式B：上传文件批量导入 */}
          <div className="border-t pt-3">
            <p className="text-sm font-medium mb-2">从文件批量导入</p>
            <input type="file" accept=".docx" onChange={handleAddFile}
              className="text-sm" />
            {addingFile && <p className="text-sm text-gray-500 mt-1">解析中...</p>}
          </div>

          {/* 解析结果预览 */}
          {parsedItems && (
            <div className="mt-3 border-t pt-3">
              <p className="text-sm font-medium mb-2">解析到 {parsedItems.items.length} 条记录</p>
              <div className="overflow-x-auto max-h-48 border rounded">
                <table className="min-w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      {parsedItems.columns.map((c, i) => <th key={i} className="px-1 py-0.5 text-left border-b">{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {parsedItems.items.slice(0, 20).map((item, i) => (
                      <tr key={i} className="border-t">
                        {parsedItems.columns.map((col, ci) => (
                          <td key={ci} className="px-1 py-0.5 whitespace-nowrap">{item.fields[col] || ''}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 flex gap-2">
                <button onClick={handleAddParsedItems}
                  className="px-4 py-1.5 bg-green-500 text-white text-sm rounded hover:bg-green-600">导入全部</button>
                <button onClick={() => setParsedItems(null)}
                  className="px-4 py-1.5 bg-gray-300 text-gray-700 text-sm rounded hover:bg-gray-400">取消</button>
              </div>
            </div>
          )}

          <div className="mt-3">
            <button onClick={() => { setShowAddForm(false); setParsedItems(null) }}
              className="px-4 py-1.5 bg-gray-300 text-gray-700 text-sm rounded hover:bg-gray-400">关闭</button>
          </div>
        </div>
      )}

      {/* PC 表格视图 */}
      <div className="hidden md:block overflow-x-auto border rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              {dataColumns.map(c => <th key={c} className="px-2 py-1.5 text-left border-b whitespace-nowrap">{c}</th>)}
              <th className="px-2 py-1.5 text-left border-b whitespace-nowrap">图片</th>
              <th className="px-2 py-1.5 text-left border-b whitespace-nowrap">{TEXT.qPublished}</th>
              <th className="px-2 py-1.5 text-left border-b whitespace-nowrap">{TEXT.qStorage}</th>
              <th className="px-2 py-1.5 text-left border-b whitespace-nowrap">{TEXT.qStatus}</th>
              <th className="px-2 py-1.5 text-left border-b whitespace-nowrap">{TEXT.qAgree}</th>
              <th className="px-2 py-1.5 text-left border-b whitespace-nowrap">P2-{TEXT.qAgree}</th>
              <th className="px-2 py-1.5 text-left border-b whitespace-nowrap">操作</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, i) => {
              const item = row.item; const p1 = row.person1 || {}; const p2 = row.person2 || {}
              const imgSrc = (item.images || [])[0] || base64ToBlobUrl(item.image_data)
              return (
                <tr key={item.id} className="border-t hover:bg-gray-50">
                  {dataColumns.map(c => <td key={c} className="px-2 py-1 whitespace-nowrap text-xs">{fieldVal(item, c)}</td>)}
                  <td className="px-2 py-1">
                    {imgSrc
                      ? <img src={imgSrc} alt="" className="w-10 h-10 object-cover rounded cursor-pointer" onClick={() => setLightboxImg(imgSrc)} />
                      : <span className="text-gray-400 text-xs">{TEXT.noImage}</span>}
                  </td>
                  <td className="px-2 py-1 whitespace-nowrap text-xs">{p1Text(p1, 'published')}</td>
                  <td className="px-2 py-1 whitespace-nowrap text-xs">{p1.storage_location || '-'}{p1.storage_detail ? ` (${p1.storage_detail})` : ''}</td>
                  <td className="px-2 py-1 whitespace-nowrap text-xs">{p1.relic_status || '-'}</td>
                  <td className="px-2 py-1 whitespace-nowrap text-xs">{agreeText(p1.agreed)}{p1.agreed_notes ? ` (${p1.agreed_notes})` : ''}</td>
                  <td className="px-2 py-1 whitespace-nowrap text-xs">{agreeText(p2.agreed)}</td>
                  <td className="px-2 py-1 whitespace-nowrap">
                    <button onClick={() => handleDelete(item.id)} className="text-red-500 hover:text-red-700 text-xs">删除</button>
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
          const imgSrc = (item.images || [])[0] || base64ToBlobUrl(item.image_data)
          return (
            <div key={item.id} className="bg-white border rounded-lg p-3 shadow-sm relative">
              <button onClick={() => handleDelete(item.id)} className="absolute top-2 right-2 text-red-500 text-xs">删除</button>
              {imgSrc && <img src={imgSrc} alt="" className="w-full h-40 object-cover rounded mb-2 cursor-pointer" onClick={() => setLightboxImg(imgSrc)} />}
              <div className="text-xs text-gray-500 mt-1">
                {dataColumns.map(c => {
                  const v = fieldVal(item, c)
                  return v ? <span key={c}>{c}：{v} &nbsp;</span> : null
                })}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
                <div>发表：{p1Text(p1, 'published')}</div>
                <div>存放：{p1.storage_location || '-'}</div>
                <div>状态：{p1.relic_status || '-'}</div>
                <div>{TEXT.person1Title}同意：<strong>{agreeText(p1.agreed)}</strong></div>
                <div className="col-span-2">{TEXT.person2Title}同意：<strong>{agreeText(p2.agreed)}</strong></div>
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
