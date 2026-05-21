// base64 文本 → Blob URL（绕过 data URI 渲染限制）
export function base64ToBlobUrl(base64) {
  if (!base64) return null
  try {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    const blob = new Blob([bytes], { type: 'image/png' })
    return URL.createObjectURL(blob)
  } catch (e) {
    return null
  }
}
