// 文档解析 API — 支持 docx 和 PDF
import mammoth from 'mammoth'
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs'
import { v4 as uuidv4 } from 'uuid'

// 设置 PDF.js worker（使用本地文件，避免 CDN 问题）
const __dirname = new URL('.', import.meta.url).pathname
const pdfjsPath = new URL('../../node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).pathname

export const config = { api: { bodyParser: false } }

async function parseBuffer(buffer, fileName) {
  let buf = buffer
  // FormData 解析
  if (typeof buffer === 'object' && buffer.arrayBuffer) {
    buf = Buffer.from(await buffer.arrayBuffer())
  }

  const ext = fileName ? fileName.split('.').pop().toLowerCase() : ''

  if (ext === 'docx') {
    return parseDocx(buf)
  } else if (ext === 'pdf') {
    return parsePdf(buf)
  } else {
    throw new Error('不支持的文件格式，请上传 .docx 或 .pdf 文件')
  }
}

async function parseDocx(buf) {
  const images = []

  const result = await mammoth.convertToHtml(
    { buffer: buf },
    {
      convertImage: mammoth.images.imgElement(function (image) {
        return image.read().then(function (imageBuffer) {
          const base64 = imageBuffer.toString('base64')
          const contentType = image.contentType || 'image/png'
          const dataUri = `data:${contentType};base64,${base64}`
          images.push(dataUri)
          return { src: dataUri }
        })
      }),
    }
  )

  const html = result.value

  // 从 HTML 中提取表格数据
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
      // 检查是否包含图片
      const imgMatch = td[1].match(/<img[^>]*src="([^"]*)"[^>]*>/i)
      if (imgMatch) {
        content = imgMatch[1] // 用图片 data URI 作为内容
      }
      tdContent.push(content)
    }
    if (tdContent.length >= 9) {
      rows.push(tdContent)
    }
  }

  if (rows.length < 2) {
    throw new Error('表格数据不足，请确认文档包含表头和数据行')
  }

  // 第一行是表头，从第二行开始是数据
  const dataRows = rows.slice(1).filter(r => r.some(c => c.length > 0))

  return {
    title: extractTitle(html),
    columns: ['序号', '名称', '时代', '编号', '数量', '尺寸', '出土地点', '图片', '图片来源'],
    items: dataRows.map((row, i) => ({
      seq: row[0] || '',
      name: row[1] || '',
      era: row[2] || '',
      ref_no: row[3] || '',
      quantity: row[4] || '',
      dimensions: row[5] || '',
      excavation_site: row[6] || '',
      image_data: row[7] || '', // base64 图片
      image_source: row[8] || '',
      sort_order: i,
    })),
  }
}

async function parsePdf(buf) {
  const data = new Uint8Array(buf)
  const doc = await pdfjsLib.getDocument({ data }).promise

  const allTextItems = []
  const allImages = []

  for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
    const page = await doc.getPage(pageNum)
    const textContent = await page.getTextContent()

    // 收集文本项及其坐标
    for (const item of textContent.items) {
      allTextItems.push({
        page: pageNum,
        x: item.transform[4],
        y: item.transform[5],
        text: item.str.trim(),
      })
    }

    // 提取图片
    try {
      const ops = await page.getOperatorList()
      for (let i = 0; i < ops.fnArray.length; i++) {
        const fn = ops.fnArray[i]
        // OPS.paintImageXObject 或类似的图片操作
        if (fn === pdfjsLib.OPS.paintImageXObject ||
            fn === pdfjsLib.OPS.paintInlineImageXObject ||
            fn === 82 || fn === 85 || fn === 43 || fn === 36) {
          try {
            const imgData = await page.objs.get(ops.argsArray[i][0])
            if (imgData && imgData.data) {
              const bytes = new Uint8Array(imgData.data.buffer || imgData.data)
              const base64 = Buffer.from(bytes).toString('base64')
              allImages.push(`data:image/png;base64,${base64}`)
            }
          } catch (e) {
            // 跳过无法提取的图片
          }
        }
      }
    } catch (e) {
      // 图片提取失败不影响文本解析
    }
  }

  // 按 Y 坐标聚类为行
  const sorted = allTextItems.sort((a, b) => b.y - a.y || a.x - b.x)
  const rowClusters = []
  const yThreshold = 5

  for (const item of sorted) {
    let added = false
    for (const cluster of rowClusters) {
      if (Math.abs(cluster.y - item.y) < yThreshold) {
        cluster.items.push(item)
        added = true
        break
      }
    }
    if (!added) {
      rowClusters.push({ y: item.y, items: [item] })
    }
  }

  // 每行内按 X 坐标排序
  for (const cluster of rowClusters) {
    cluster.items.sort((a, b) => a.x - b.x)
  }

  // 过滤掉文本过少的行，取前9列
  const dataRows = rowClusters
    .map(c => c.items.map(i => i.text).filter(t => t.length > 0))
    .filter(row => row.length >= 2)

  // 第一行是表头，之后是数据
  const items = dataRows.slice(1).map((row, i) => ({
    seq: row[0] || '',
    name: row[1] || '',
    era: row[2] || '',
    ref_no: row[3] || '',
    quantity: row[4] || '',
    dimensions: row[5] || '',
    excavation_site: row[6] || '',
    image_data: allImages[i] || '',
    image_source: row[8] || row[7] || '',
    sort_order: i,
  }))

  return {
    title: '借展文物清单',
    columns: ['序号', '名称', '时代', '编号', '数量', '尺寸', '出土地点', '图片', '图片来源'],
    items,
  }
}

function extractTitle(html) {
  const hMatch = html.match(/<h[1-3][^>]*>([^<]+)<\/h[1-3]>/i)
  if (hMatch) return hMatch[1].trim()

  const pMatch = html.match(/<p[^>]*>([^<]+)<\/p>/i)
  if (pMatch && pMatch[1].trim().length > 0) return pMatch[1].trim()

  return '借展文物清单'
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: '仅支持 POST 请求' })
  }

  try {
    // 解析 multipart/form-data
    const chunks = []
    for await (const chunk of req) {
      chunks.push(chunk)
    }
    const rawBody = Buffer.concat(chunks)

    const contentType = req.headers['content-type'] || ''
    const boundary = contentType.split('boundary=')[1]

    if (!boundary) {
      // 简单 buffer 上传
      const fileName = req.headers['x-file-name'] || 'unknown.docx'
      const result = await parseBuffer(rawBody, fileName)
      return res.status(200).json(result)
    }

    // 解析 multipart
    const boundaryBytes = Buffer.from('--' + boundary)
    const parts = rawBody.toString('binary').split('--' + boundary)

    let fileBuffer = null
    let fileName = ''

    for (const part of parts) {
      if (part.includes('filename=')) {
        const headerEnd = part.indexOf('\r\n\r\n')
        const header = part.substring(0, headerEnd)
        const fileContent = part.substring(headerEnd + 4)
        // 去除末尾的 \r\n--
        const cleanContent = fileContent.replace(/\r\n--\r\n$/, '').replace(/\r\n--$/, '')

        const nameMatch = header.match(/filename="([^"]*)"/)
        fileName = nameMatch ? nameMatch[1] : 'unknown.docx'

        fileBuffer = Buffer.from(cleanContent, 'binary')
        break
      }
    }

    if (!fileBuffer) {
      return res.status(400).json({ error: '未找到上传文件' })
    }

    const result = await parseBuffer(fileBuffer, fileName)
    return res.status(200).json(result)
  } catch (err) {
    console.error('解析错误:', err)
    return res.status(400).json({ error: err.message || '文档解析失败' })
  }
}
