// Reads the first sheet of an Excel .xlsx file into a table of cells, without a library: an .xlsx
// is a zip of XML files. Entries are unzipped with the browser's DecompressionStream ('deflate-raw'),
// which Chrome, Edge, the Windows app and the Android app all have. Cells come back as strings, or
// numbers for number cells (Excel stores dates and times as numbers; lib/taskImport.js reads them).
const td = new TextDecoder()

async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

// The zip's files by name: { 'xl/worksheets/sheet1.xml': Uint8Array }, using its central directory.
async function unzip(buf) {
  const view = new DataView(buf)
  const u8 = new Uint8Array(buf)
  let end = -1
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i -= 1) if (view.getUint32(i, true) === 0x06054b50) { end = i; break }
  if (end < 0) throw new Error('This is not an Excel (.xlsx) file.')
  const count = view.getUint16(end + 10, true)
  let p = view.getUint32(end + 16, true)
  const files = {}
  for (let n = 0; n < count; n += 1) {
    if (view.getUint32(p, true) !== 0x02014b50) break
    const method = view.getUint16(p + 10, true)
    const size = view.getUint32(p + 20, true)
    const nameLen = view.getUint16(p + 28, true), extraLen = view.getUint16(p + 30, true), commentLen = view.getUint16(p + 32, true)
    const local = view.getUint32(p + 42, true)
    const name = td.decode(u8.subarray(p + 46, p + 46 + nameLen))
    p += 46 + nameLen + extraLen + commentLen
    if (!/^xl\/(sharedStrings\.xml|workbook\.xml|_rels\/workbook\.xml\.rels|worksheets\/sheet\d+\.xml)$/.test(name)) continue
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true)
    const data = u8.subarray(start, start + size)
    files[name] = method === 0 ? data : method === 8 ? await inflate(data) : null
  }
  return files
}

const unescape = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&amp;/g, '&')
const textOf = (xml) => unescape([...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''))
const colIndex = (ref) => [...ref.replace(/\d+/g, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1

export async function readXlsx(buf) {
  const files = await unzip(buf)
  const strings = files['xl/sharedStrings.xml'] ? [...td.decode(files['xl/sharedStrings.xml']).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1])) : []
  // The first sheet in the workbook's own order (not always sheet1.xml).
  let sheet = 'xl/worksheets/sheet1.xml'
  if (files['xl/workbook.xml'] && files['xl/_rels/workbook.xml.rels']) {
    const rid = td.decode(files['xl/workbook.xml']).match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1]
    const target = rid && td.decode(files['xl/_rels/workbook.xml.rels']).match(new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`))?.[1]
    if (target) sheet = `xl/${target.replace(/^\/?xl\//, '')}`
  }
  if (!files[sheet]) throw new Error('The Excel file has no sheet to read.')
  const rows = []
  for (const rm of td.decode(files[sheet]).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = []
    for (const cm of rm[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1], body = cm[2] || ''
      const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1]
      const type = attrs.match(/\bt="([^"]+)"/)?.[1]
      const raw = body.match(/<v>([\s\S]*?)<\/v>/)?.[1]
      let value = ''
      if (type === 's') value = strings[+raw] ?? ''
      else if (type === 'inlineStr') value = textOf(body)
      else if (type === 'str' || type === 'b' || type === 'e') value = raw === undefined ? '' : unescape(raw)
      else if (raw !== undefined) value = Number(raw)
      row[ref ? colIndex(ref) : row.length] = value
    }
    rows.push(Array.from(row, (v) => v ?? ''))
  }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''))
}
