// 浏览器端文档解析（docx）
import mammoth from 'mammoth'

export async function parseDocument(file) {
  const ext = file.name.split('.').pop().toLowerCase()
  if (ext !== 'docx') {
    throw new Error('暂仅支持 .docx 文件，PDF 支持开发中')
  }
  return parseDocx(file)
}

async function parseDocx(file) {
  const arrayBuffer = await file.arrayBuffer()

  // 收集提取到的图片
  const imageBuffers = []

  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      convertImage: mammoth.images.imgElement(function (image) {
        const idx = imageBuffers.length
        imageBuffers.push({
          base64: null,
          blobUrl: null,
          contentType: image.contentType || 'image/png',
          _promise: image.read().then(buf => {
            const bytes = new Uint8Array(buf)
            let binary = ''
            for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
            imageBuffers[idx].base64 = btoa(binary)
            imageBuffers[idx].blobUrl = URL.createObjectURL(new Blob([buf], { type: imageBuffers[idx].contentType }))
          }),
        })
        return { src: `__IMG_${idx}__` }
      }),
    }
  )

  await Promise.all(imageBuffers.map(img => img._promise))
  imageBuffers.forEach(img => { delete img._promise })

  const html = result.value

  // 提取表格
  const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/i)
  if (!tableMatch) {
    throw new Error('未在文档中找到表格')
  }

  const tableHtml = tableMatch[0]
  const rows = []
  const trMatches = tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)

  for (const tr of trMatches) {
    const tdContent = []
    const tdMatches = tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[hd]>/gi)
    for (const td of tdMatches) {
      const imgMatch = td[1].match(/<img[^>]*src\s*=\s*["']?([^"'\s>]+)["']?[^>]*>/i)
      if (imgMatch) {
        const src = imgMatch[1].trim()
        const pm = src.match(/^__IMG_(\d+)__$/)
        if (pm) tdContent.push(`__IMG_${pm[1]}__`)
        else tdContent.push(src)
      } else {
        tdContent.push(td[1].replace(/<[^>]+>/g, '').trim())
      }
    }
    rows.push(tdContent)
  }

  if (rows.length < 2) {
    throw new Error('表格至少需要表头 + 一行数据')
  }

  // 表头
  const headers = rows[0].map(c => c.replace(/<[^>]+>/g, '').trim())

  // 找到图片列（含「图片」但不含「来源」「出处」）
  let imgCol = -1
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i]
    if (h.includes('图片') && !h.includes('来源') && !h.includes('出处')) {
      imgCol = i
      break
    }
  }

  // 数据行
  const dataRows = rows.slice(1).filter(r => r.some(c => c.length > 0))
  if (dataRows.length === 0) {
    throw new Error('未检测到数据行。请在表格中填入文物信息后重新上传。')
  }

  // 提取标题
  let title = '借展文物清单'
  const hMatch = html.match(/<h[1-3][^>]*>([^<]+)<\/h[1-3]>/i)
  if (hMatch) title = hMatch[1].trim()
  else {
    const pMatch = html.match(/<p[^>]*>([^<]+)<\/p>/i)
    if (pMatch && pMatch[1].trim()) title = pMatch[1].trim()
  }

  return {
    title,
    imageBuffers,
    columns: headers,  // 原始表头
    imgCol,           // 图片列索引
    items: dataRows.map((row, i) => ({
      fields: headers.reduce((obj, hdr, ci) => {
        obj[hdr] = row[ci] || ''
        return obj
      }, {}),
      img_idx: imgCol >= 0 ? parseImgIdx(row[imgCol]) : -1,
      sort_order: i,
    })),
  }
}

function parseImgIdx(val) {
  if (!val) return -1
  const m = String(val).match(/^__IMG_(\d+)__$/)
  return m ? parseInt(m[1]) : -1
}
