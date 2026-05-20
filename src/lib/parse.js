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
  const images = []

  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      convertImage: mammoth.images.imgElement(function (image) {
        return image.read().then(function (imageBuffer) {
          const base64 = arrayBufferToBase64(imageBuffer)
          const contentType = image.contentType || 'image/png'
          const dataUri = `data:${contentType};base64,${base64}`
          images.push(dataUri)
          return { src: dataUri }
        })
      }),
    }
  )

  const html = result.value

  // 提取表格
  const tableMatch = html.match(/<table[^>]*>([\s\S]*?)<\/table>/i)
  if (!tableMatch) {
    throw new Error('未在文档中找到表格，请确认文档包含9列表格')
  }

  const tableHtml = tableMatch[0]
  const rows = []
  const trMatches = tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)

  for (const tr of trMatches) {
    const tdContent = []
    const tdMatches = tr[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[hd]>/gi)
    for (const td of tdMatches) {
      let content = td[1].replace(/<[^>]+>/g, '').trim()
      const imgMatch = td[1].match(/<img[^>]*src="([^"]*)"[^>]*>/i)
      if (imgMatch) content = imgMatch[1]
      tdContent.push(content)
    }
    if (tdContent.length >= 9) rows.push(tdContent)
  }

  if (rows.length < 2) {
    throw new Error('表格数据不足，请确认文档包含表头和数据行')
  }

  const dataRows = rows.slice(1).filter(r => r.some(c => c.length > 0))

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
    columns: ['序号', '名称', '时代', '编号', '数量', '尺寸', '出土地点', '图片', '图片来源'],
    items: dataRows.map((row, i) => ({
      seq: row[0] || '',
      name: row[1] || '',
      era: row[2] || '',
      ref_no: row[3] || '',
      quantity: row[4] || '',
      dimensions: row[5] || '',
      excavation_site: row[6] || '',
      image_data: row[7] || '',
      image_source: row[8] || '',
      sort_order: i,
    })),
  }
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}
