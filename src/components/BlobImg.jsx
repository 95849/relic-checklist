import { useState, useEffect } from 'react'

// 把 data URI 转为 Blob URL 后渲染 — 绕过 data: 协议限制
export default function BlobImg({ dataUri, style }) {
  const [url, setUrl] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!dataUri || !dataUri.startsWith('data:')) {
      setFailed(true)
      return
    }
    try {
      const commaIdx = dataUri.indexOf(',')
      if (commaIdx === -1) { setFailed(true); return }

      const header = dataUri.substring(0, commaIdx)
      const base64 = dataUri.substring(commaIdx + 1)
      const mimeMatch = header.match(/data:([^;]+)/)
      const mime = mimeMatch ? mimeMatch[1] : 'image/png'

      // atob 处理 URL-safe base64
      const binaryStr = atob(base64.replace(/-/g, '+').replace(/_/g, '/'))
      const bytes = new Uint8Array(binaryStr.length)
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i)
      }
      const blob = new Blob([bytes], { type: mime })
      const objectUrl = URL.createObjectURL(blob)
      setUrl(objectUrl)
      return () => URL.revokeObjectURL(objectUrl)
    } catch (e) {
      setFailed(true)
    }
  }, [dataUri])

  if (failed || (!url && dataUri && dataUri.length > 10)) {
    return <span style={{ fontSize: 10, color: '#999', wordBreak: 'break-all' }}>
      {(dataUri || '').substring(0, 50)}...
    </span>
  }
  if (!url) return <span style={{ fontSize: 10, color: '#999' }}>加载中...</span>
  return <img src={url} alt="" style={style} onError={() => setFailed(true)} />
}
