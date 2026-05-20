import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { TEXT } from '../config/text'
import { COLUMN_LABELS } from '../config/constants'
import { getResults } from '../lib/api'
import * as XLSX from 'xlsx'

export default function AdminResult() {
  const { projectId } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lightboxImg, setLightboxImg] = useState(null)

  useEffect(() => {
    (async () => {
      try {
        const result = await getResults(projectId)
        setData(result)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    })()
  }, [projectId])

  function exportExcel() {
    if (!data) return

    const headers = [
      '序号', '名称', '时代', '编号', '数量', '尺寸', '出土地点', '图片来源',
      `[${TEXT.person1Title}] 是否发表`,
      `[${TEXT.person1Title}] 发表备注`,
      `[${TEXT.person1Title}] 存放地点`,
      `[${TEXT.person1Title}] 存放详情`,
      `[${TEXT.person1Title}] 文物状态`,
      `[${TEXT.person1Title}] 是否同意`,
      `[${TEXT.person2Title}] 是否同意`,
    ]

    const sheetRows = [headers]

    for (const row of data.rows) {
      const item = row.item
      const p1 = row.person1 || {}
      const p2 = row.person2 || {}
      sheetRows.push([
        item.seq || '',
        item.name || '',
        item.era || '',
        item.ref_no || '',
        item.quantity || '',
        item.dimensions || '',
        item.excavation_site || '',
        item.image_source || '',
        p1.published === 'yes' ? TEXT.published_yes :
          p1.published === 'no' ? TEXT.published_no :
          p1.published === 'notes' ? TEXT.published_notes : '',
        p1.published_notes || '',
        p1.storage_location || '',
        p1.storage_detail || '',
        p1.relic_status || '',
        p1.agreed === 'yes' ? TEXT.agree_yes :
          p1.agreed === 'no' ? TEXT.agree_no : '',
        p2.agreed === 'yes' ? TEXT.agree_yes :
          p2.agreed === 'no' ? TEXT.agree_no : '',
      ])
    }

    // 末尾加填写人信息
    sheetRows.push([])
    sheetRows.push([`${TEXT.person1Title}：${data.person1Name || TEXT.notSubmitted}`])
    sheetRows.push([`${TEXT.person2Title}：${data.person2Name || TEXT.notSubmitted}`])

    const ws = XLSX.utils.aoa_to_sheet(sheetRows)
    ws['!cols'] = headers.map(() => ({ wch: 16 }))
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, '填写结果')
    XLSX.writeFile(wb, `${data.project.title || '借展文物清单'}_结果.xlsx`)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">加载中...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-500">{error}</div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="max-w-full mx-auto px-3 py-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <Link to="/" className="text-blue-500 text-sm hover:underline">&larr; {TEXT.backHome}</Link>
          <h1 className="text-lg font-bold mt-1">{data.project.title} — {TEXT.resultTitle}</h1>
        </div>
        <button
          onClick={exportExcel}
          className="px-4 py-2 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600"
        >
          {TEXT.exportExcel}
        </button>
      </div>

      {/* 填写人信息 */}
      <div className="mb-3 flex gap-4 text-sm text-gray-600 flex-wrap">
        <span>{TEXT.person1Title}：<strong>{data.person1Name || TEXT.notSubmitted}</strong></span>
        <span>{TEXT.person2Title}：<strong>{data.person2Name || TEXT.notSubmitted}</strong></span>
      </div>

      {/* PC 表格视图 */}
      <div className="hidden md:block overflow-x-auto border rounded-lg">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              {['序号', '名称', '时代', '编号', '图片',
                `P1-发表`, `P1-存放`, `P1-状态`, `P1-同意`,
                `P2-同意`
              ].map((h, i) => (
                <th key={i} className="px-2 py-1.5 text-left border-b whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, i) => {
              const item = row.item
              const p1 = row.person1 || {}
              const p2 = row.person2 || {}
              const imgs = item.images || []
              return (
                <tr key={i} className="border-t hover:bg-gray-50">
                  <td className="px-2 py-1 whitespace-nowrap">{item.seq || i + 1}</td>
                  <td className="px-2 py-1 whitespace-nowrap font-medium">{item.name}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{item.era}</td>
                  <td className="px-2 py-1 whitespace-nowrap">{item.ref_no}</td>
                  <td className="px-2 py-1">
                    {imgs.length > 0 ? (
                      <img src={imgs[0]} alt="" className="w-10 h-10 object-cover rounded cursor-pointer"
                        onClick={() => setLightboxImg(imgs[0])} />
                    ) : TEXT.noImage}
                  </td>
                  <td className="px-2 py-1 whitespace-nowrap text-xs">{renderP1Field(p1, 'published')}</td>
                  <td className="px-2 py-1 whitespace-nowrap text-xs">
                    {p1.storage_location || '-'}{p1.storage_detail ? ` (${p1.storage_detail})` : ''}
                  </td>
                  <td className="px-2 py-1 whitespace-nowrap text-xs">{p1.relic_status || '-'}</td>
                  <td className="px-2 py-1 whitespace-nowrap text-xs">{agreeText(p1.agreed)}</td>
                  <td className="px-2 py-1 whitespace-nowrap text-xs">{agreeText(p2.agreed)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* 手机卡片视图 */}
      <div className="md:hidden space-y-3">
        {data.rows.map((row, i) => {
          const item = row.item
          const p1 = row.person1 || {}
          const p2 = row.person2 || {}
          const imgs = item.images || []
          return (
            <div key={i} className="bg-white border rounded-lg p-3 shadow-sm">
              {imgs.length > 0 && (
                <img src={imgs[0]} alt="" className="w-full h-40 object-cover rounded mb-2 cursor-pointer"
                  onClick={() => setLightboxImg(imgs[0])} />
              )}
              <div className="font-medium">{item.seq || `#${i + 1}`}. {item.name || '(未命名)'}</div>
              <div className="text-xs text-gray-500 mt-1">
                {item.era && <span>时代：{item.era} &nbsp;</span>}
                {item.ref_no && <span>编号：{item.ref_no} &nbsp;</span>}
                {item.quantity && <span>数量：{item.quantity}</span>}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
                <div className="text-gray-500">发表：<span className="text-gray-800">{renderP1Field(p1, 'published')}</span></div>
                <div className="text-gray-500">存放：<span className="text-gray-800">{p1.storage_location || '-'}</span></div>
                <div className="text-gray-500">状态：<span className="text-gray-800">{p1.relic_status || '-'}</span></div>
                <div className="text-gray-500">{TEXT.person1Title}同意：<span className="text-gray-800 font-medium">{agreeText(p1.agreed)}</span></div>
                <div className="text-gray-500 col-span-2">{TEXT.person2Title}同意：<span className="text-gray-800 font-medium">{agreeText(p2.agreed)}</span></div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Lightbox */}
      {lightboxImg && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
          onClick={() => setLightboxImg(null)}>
          <img src={lightboxImg} alt="" className="max-w-full max-h-full object-contain rounded" />
          <button onClick={() => setLightboxImg(null)}
            className="absolute top-4 right-4 text-white text-3xl leading-none">&times;</button>
        </div>
      )}
    </div>
  )
}

function renderP1Field(p1, field) {
  if (field === 'published') {
    const v = p1.published
    if (v === 'yes') return TEXT.published_yes
    if (v === 'no') return TEXT.published_no
    if (v === 'notes') return `${TEXT.published_notes}${p1.published_notes ? `: ${p1.published_notes}` : ''}`
    return '-'
  }
  return p1[field] || '-'
}

function agreeText(v) {
  if (v === 'yes') return TEXT.agree_yes
  if (v === 'no') return TEXT.agree_no
  return TEXT.notSubmitted
}
