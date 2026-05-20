import { useRef, useEffect } from 'react'

// 直接用原生 DOM 渲染 img，绕过 React 的 src 处理
export default function BlobImg({ dataUri, style }) {
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.innerHTML = ''

    if (!dataUri || !dataUri.startsWith('data:')) {
      el.textContent = ''
      return
    }

    const img = document.createElement('img')
    img.alt = ''
    Object.entries(style || {}).forEach(([k, v]) => {
      img.style[k] = v
    })

    img.onerror = () => {
      el.textContent = dataUri.substring(0, 50) + '...'
    }

    img.src = dataUri
    el.appendChild(img)
  }, [dataUri, style])

  return <span ref={ref} />
}
