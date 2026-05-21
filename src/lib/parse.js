// 浏览器端文档解析（docx）
import mammoth from 'mammoth'

// 列名模糊匹配表：中文关键词 → 英文字段名
const COLUMN_KEYWORDS = [
  { keys: ['序号'], field: 'seq' },
  { keys: ['名称'], field: 'name' },
  { keys: ['时代', '年代'], field: 'era' },
  { keys: ['编号'], field: 'ref_no' },
  { keys: ['数量'], field: 'quantity' },
  { keys: ['尺寸', '大小'], field: 'dimensions' },
  { keys: ['出土', '来源'], field: 'excavation_site' },
  { keys: ['藏地', '收藏', '存放'], field: 'storage_place' },
  { keys: ['图片来源', '图片出处'], field: 'image_source' },
]

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
    throw new Error('未在文档中找到表格，请确认文档包含列表格')
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
        const placeholderMatch = src.match(/^__IMG_(\d+)__$/)
        if (placeholderMatch) {
          tdContent.push(`__IMG_${placeholderMatch[1]}__`)
        } else {
          tdContent.push(src)
        }
      } else {
        const text = td[1].replace(/<[^>]+>/g, '').trim()
        tdContent.push(text)
      }
    }
    rows.push(tdContent)
  }

  if (rows.length < 2) {
    throw new Error('表格至少需要表头 + 一行数据。空模板请先填入文物信息再上传。')
  }

  // 解析表头，建立列名 → 列索引映射
  const headerRow = rows[0]
  const colMap = {} // fieldName → columnIndex
  const headerTexts = headerRow.map(c => c.replace(/<[^>]+>/g, '').trim())

  for (let ci = 0; ci < headerTexts.length; ci++) {
    const headerText = headerTexts[ci]
    for (const kw of COLUMN_KEYWORDS) {
      if (kw.keys.some(k => headerText.includes(k))) {
        colMap[kw.field] = ci
        break
      }
    }
  }

  // 数据行
  const dataRows = rows.slice(1).filter(r => r.some(c => c.length > 0))

  if (dataRows.length === 0) {
    throw new Error('表格中未检测到任何数据行。请在表格中填入文物信息后重新上传。')
  }

  // 提取标题
  let title = '借展文物清单'
  const hMatch = html.match(/<h[1-3][^>]*>([^<]+)<\/h[1-3]>/i)
  if (hMatch) title = hMatch[1].trim()
  else {
    const pMatch = html.match(/<p[^>]*>([^<]+)<\/p>/i)
    if (pMatch && pMatch[1].trim()) title = pMatch[1].trim()
  }

  function cell(row, field) {
    return colMap[field] != null ? (row[colMap[field]] || '') : ''
  }

  return {
    title,
    imageBuffers,
    columns: headerTexts,
    items: dataRows.map((row, i) => ({
      seq: cell(row, 'seq'),
      name: cell(row, 'name'),
      era: cell(row, 'era'),
      ref_no: cell(row, 'ref_no'),
      quantity: cell(row, 'quantity'),
      dimensions: cell(row, 'dimensions'),
      excavation_site: cell(row, 'excavation_site'),
      img_idx: findImgIdx(row),
      image_source: cell(row, 'image_source'),
      sort_order: i,
    })),
  }
}

function findImgIdx(row) {
  for (const cell of row) {
    const m = String(cell).match(/^__IMG_(\d+)__$/)
    if (m) return parseInt(m[1])
  }
  return -1
}
