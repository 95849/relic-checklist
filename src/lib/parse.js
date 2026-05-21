// 浏览器端文档解析（docx）
import mammoth from 'mammoth'

import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker

export async function parseDocument(file) {
  const ext = file.name.split('.').pop().toLowerCase()
  if (ext === 'docx') return parseDocx(file)
  if (ext === 'pdf') return parsePdf(file)
  throw new Error('不支持的文件格式，请上传 .docx 或 .pdf 文件')
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

// ---- PDF 解析 ----
async function parsePdf(file) {
  const arrayBuffer = await file.arrayBuffer()
  const doc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const imageBuffers = []
  const allRows = []  // [{ y, cells: [{ x, text }] }]

  for (let pageNum = 1; pageNum <= Math.min(doc.numPages, 50); pageNum++) {
    const page = await doc.getPage(pageNum)
    const textContent = await page.getTextContent()

    // 收集文本项及坐标
    const items = []
    for (const item of textContent.items) {
      const text = item.str?.trim()
      if (!text) continue
      items.push({ x: item.transform[4], y: item.transform[5], text })
    }

    if (items.length === 0) continue

    // 按 Y 聚类为行（同一行内的文本 Y 坐标接近）
    items.sort((a, b) => b.y - a.y || a.x - b.x)
    const rows = []
    for (const item of items) {
      let placed = false
      for (const row of rows) {
        if (Math.abs(row.y - item.y) < 4) {
          row.cells.push(item)
          placed = true
          break
        }
      }
      if (!placed) rows.push({ y: item.y, cells: [item] })
    }

    // 每行内按 X 排序
    for (const row of rows) {
      row.cells.sort((a, b) => a.x - b.x)
      allRows.push(row)
    }

    // 尝试提取图片（PDF 图片提取较复杂，这里先跳过）
  }

  if (allRows.length < 2) {
    throw new Error('PDF 中未找到表格数据')
  }

  // 表头行 = 第一行，数据行 = 后续
  // 合并相邻的文本（同一单元格内可能有多个文本片段）
  function mergeCells(cells) {
    const merged = []
    let current = ''
    for (const cell of cells) {
      // 如果当前片段与上一个 X 坐标接近（< 5pt），属于同一单元格
      if (merged.length > 0 && Math.abs(cell.x - (merged[merged.length - 1]._x || 0)) < 5) {
        merged[merged.length - 1] = cell.text
      } else if (current) {
        merged.push(current)
        current = cell.text
      } else {
        current = cell.text
      }
    }
    if (current) merged.push(current)
    // 如果合并后太少，返回原始
    const raw = cells.map(c => c.text)
    return merged.length >= raw.length * 0.5 ? merged : raw
  }

  // 找到最长的行作为表头参考
  let headerRow = allRows[0]
  for (const row of allRows.slice(0, 3)) {
    if (row.cells.length > headerRow.cells.length) headerRow = row
  }

  // 提取纯文本
  const headers = headerRow.cells.map(c => c.text)
  const dataRows = allRows.slice(allRows.indexOf(headerRow) + 1)

  if (dataRows.length === 0) {
    throw new Error('PDF 中未检测到数据行')
  }

  // 找到图片列
  let imgCol = -1
  for (let i = 0; i < headers.length; i++) {
    if (headers[i].includes('图片') && !headers[i].includes('来源') && !headers[i].includes('出处')) {
      imgCol = i
      break
    }
  }

  return {
    title: '借展文物清单（PDF）',
    imageBuffers,
    columns: headers,
    imgCol,
    items: dataRows.map((row, i) => ({
      fields: headers.reduce((obj, hdr, ci) => {
        obj[hdr] = row.cells[ci]?.text || ''
        return obj
      }, {}),
      img_idx: -1,  // PDF 图片提取暂不支持
      sort_order: i,
    })),
  }
}
