import { useState, useEffect, useCallback } from 'react'
import BlobImg from '../components/BlobImg'
import { Link } from 'react-router-dom'
import { TEXT } from '../config/text'
import { PROJECT_STATUS } from '../config/constants'
import { parseDocument, createProject, listProjects } from '../lib/api'

function buildLinks(project) {
  const base = window.location.href.split('#')[0]
  return {
    person1: `${base}#/form/p1/${project.person1_slug}`,
    person2: `${base}#/form/p2/${project.person2_slug}`,
  }
}

export default function Home() {
  const [projects, setProjects] = useState([])
  const [uploading, setUploading] = useState(false)
  const [parsedData, setParsedData] = useState(null)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [createdLinks, setCreatedLinks] = useState(null)
  const [copied, setCopied] = useState('')
  const [expandedProject, setExpandedProject] = useState(null)

  const loadProjects = useCallback(async () => {
    try {
      const data = await listProjects()
      setProjects(data)
    } catch (e) { /* ignore */ }
  }, [])

  useEffect(() => {
    loadProjects()
    // 恢复 localStorage 中的链接
    const saved = localStorage.getItem('last_created_links')
    if (saved) {
      try { setCreatedLinks(JSON.parse(saved)) } catch (e) {}
    }
  }, [loadProjects])

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setError('')
    setUploading(true)
    setParsedData(null)

    try {
      const result = await parseDocument(file)
      if (!result.items || result.items.length === 0) {
        setError('未解析到任何条目，请检查文档格式')
      } else {
        setParsedData(result)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  async function handleCreate() {
    if (!parsedData) return
    setCreating(true)
    setError('')

    try {
      const result = await createProject({
        title: parsedData.title,
        items: parsedData.items,
      })
      const base = window.location.href.split('#')[0]
      const links = {
        person1: `${base}#${result.links.person1}`,
        person2: `${base}#${result.links.person2}`,
        projectId: result.project.id,
      }
      setCreatedLinks(links)
      localStorage.setItem('last_created_links', JSON.stringify(links))
      setParsedData(null)
      loadProjects()
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  function copyLink(url, key) {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(''), 2000)
    })
  }

  function isDataUri(s) {
    return s && s.trim().startsWith('data:')
  }

  function statusLabel(s) {
    if (s === PROJECT_STATUS.waitingP1) return TEXT.statusWaitingP1
    if (s === PROJECT_STATUS.waitingP2) return TEXT.statusWaitingP2
    if (s === PROJECT_STATUS.completed) return TEXT.statusCompleted
    return s
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-center mb-6">{TEXT.homeTitle}</h1>

      {/* 创建成功 — 分享链接 */}
      {createdLinks && (
        <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <h2 className="font-semibold text-green-800 mb-2">项目创建成功！</h2>
          <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium min-w-[180px]">{TEXT.person1Title}：</span>
              <code className="text-xs bg-white px-2 py-1 rounded break-all flex-1">{createdLinks.person1}</code>
              <button onClick={() => copyLink(createdLinks.person1, 'p1')}
                className="shrink-0 px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600">
                {copied === 'p1' ? TEXT.copied : TEXT.copyLink1}
              </button>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium min-w-[180px]">{TEXT.person2Title}：</span>
              <code className="text-xs bg-white px-2 py-1 rounded break-all flex-1">{createdLinks.person2}</code>
              <button onClick={() => copyLink(createdLinks.person2, 'p2')}
                className="shrink-0 px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600">
                {copied === 'p2' ? TEXT.copied : TEXT.copyLink2}
              </button>
            </div>
          </div>
          <button onClick={() => {
            setCreatedLinks(null)
            localStorage.removeItem('last_created_links')
          }} className="mt-3 text-sm text-gray-500 underline">{TEXT.cancelBtn}</button>
        </div>
      )}

      {/* 上传区域 */}
      {!parsedData && (
        <div className="mb-6 p-6 border-2 border-dashed border-gray-300 rounded-lg text-center">
          <input type="file" accept=".docx,.pdf" onChange={handleFile} className="hidden" id="file-upload" />
          <label htmlFor="file-upload"
            className="cursor-pointer inline-block px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-lg">
            {uploading ? TEXT.parsing : TEXT.newProject}
          </label>
          <p className="mt-2 text-sm text-gray-500">{TEXT.uploadHint}</p>
          {uploading && (
            <div className="mt-3 flex items-center justify-center gap-2 text-gray-500">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {TEXT.parsing}
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">{error}</div>
      )}

      {/* 解析预览 */}
      {parsedData && (
        <div className="mb-6">
          <h2 className="font-semibold mb-2">{TEXT.previewTitle}</h2>
          <p className="text-sm text-gray-500 mb-2">
            标题：{parsedData.title} &nbsp;|&nbsp; 共 {parsedData.items.length} 条记录
          </p>
          <div className="overflow-x-auto border rounded-lg max-h-96">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100 sticky top-0">
                <tr>
                  {parsedData.columns.map((col, i) => (
                    <th key={i} className="px-2 py-1 text-left border-b whitespace-nowrap">{col}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {parsedData.items.map((item, i) => (
                  <tr key={i} className="border-t hover:bg-gray-50">
                    <td className="px-2 py-1 whitespace-nowrap">{item.seq}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{item.name}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{item.era}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{item.ref_no}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{item.quantity}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{item.dimensions}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{item.excavation_site}</td>
                    <td className="px-2 py-1">
                      {(item.image_data && item.image_data.length > 10) ? (
                        <BlobImg dataUri={item.image_data}
                          style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4 }} />
                      ) : <span className="text-gray-400 text-xs">{TEXT.noImage}</span>}
                    </td>
                      {(() => {
                        const src = (item.image_data || '').trim()
                        if (!src || src.length < 10) return <span className="text-gray-400 text-xs">{TEXT.noImage}</span>
                        return <img src={src} alt=""
                          style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 4, display: 'block' }}
                          onError={e => {
                            e.target.style.display = 'none'
                            const fb = e.target.nextElementSibling
                            if (fb) fb.style.display = 'block'
                          }} />
                      })()}
                      <span style={{ display: 'none', fontSize: 10, color: '#999', wordBreak: 'break-all' }}>
                        {(item.image_data || '').substring(0, 60)}...
                      </span>
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap">{item.image_source}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex gap-3">
            <button onClick={handleCreate} disabled={creating}
              className="px-6 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50">
              {creating ? TEXT.submitting : TEXT.confirmCreate}
            </button>
            <button onClick={() => setParsedData(null)}
              className="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400">
              {TEXT.cancelBtn}
            </button>
          </div>
        </div>
      )}

      {/* 项目列表 */}
      {projects.length > 0 && (
        <div>
          <h2 className="font-semibold mb-3">{TEXT.projectList}</h2>
          <div className="space-y-2">
            {projects.map(p => {
              const links = buildLinks(p)
              const expanded = expandedProject === p.id
              return (
                <div key={p.id} className="p-3 bg-white border rounded-lg">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <div className="font-medium">{p.title}</div>
                      <div className="text-xs text-gray-500">
                        {statusLabel(p.status)}
                        {p.items && ` · ${p.items[0]?.count || 0} 条`}
                      </div>
                    </div>
                    <div className="flex gap-2 items-center">
                      <button onClick={() => setExpandedProject(expanded ? null : p.id)}
                        className="px-3 py-1.5 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200">
                        {expanded ? '收起' : '复制链接'}
                      </button>
                      <Link to={`/admin/${p.id}`}
                        className="px-4 py-1.5 bg-blue-500 text-white text-sm rounded hover:bg-blue-600">
                        {TEXT.viewResult}
                      </Link>
                    </div>
                  </div>
                  {expanded && (
                    <div className="mt-3 pt-3 border-t space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium min-w-[170px]">{TEXT.person1Title}：</span>
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded break-all flex-1">{links.person1}</code>
                        <button onClick={() => copyLink(links.person1, `p1-${p.id}`)}
                          className="shrink-0 px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600">
                          {copied === `p1-${p.id}` ? TEXT.copied : '复制'}
                        </button>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium min-w-[170px]">{TEXT.person2Title}：</span>
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded break-all flex-1">{links.person2}</code>
                        <button onClick={() => copyLink(links.person2, `p2-${p.id}`)}
                          className="shrink-0 px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600">
                          {copied === `p2-${p.id}` ? TEXT.copied : '复制'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {projects.length === 0 && !parsedData && !uploading && (
        <p className="text-center text-gray-400 text-sm">{TEXT.noProjects}</p>
      )}
    </div>
  )
}
