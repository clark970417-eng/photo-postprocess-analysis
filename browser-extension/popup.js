const ANALYZER = 'https://lumen-stage.vercel.app/analyze'
const CHATGPT = 'https://chatgpt.com/'
const SUPPORTED_PAGE = /^https:\/\/(x\.com|twitter\.com|www\.instagram\.com)\//i

const preview = document.querySelector('#preview')
const imageStage = document.querySelector('#imageStage')
const emptyState = document.querySelector('#emptyState')
const emptyTitle = document.querySelector('#emptyTitle')
const emptyHint = document.querySelector('#emptyHint')
const sourceLabel = document.querySelector('#sourceLabel')
const statusDot = document.querySelector('#statusDot')
const dimensions = document.querySelector('#dimensions')
const chatgptButton = document.querySelector('#chatgptButton')
const websiteButton = document.querySelector('#websiteButton')
const message = document.querySelector('#message')

let selectedImage = null
let selectedMetadata = null

function buildAnalysisPrompt() {
  const source = selectedMetadata?.platform || '社群貼文'
  const width = selectedMetadata?.width || '未知'
  const height = selectedMetadata?.height || '未知'

  return `請用繁體中文分析我接下來上傳或貼上的同一張照片，逆向推測它可能採用的後期手法。請分析可見結果，不要把無法由成品證明的 RAW 數值、相機描述檔、預設、圖層堆疊或插件名稱說成事實。

來源備註：${source}，偵測尺寸 ${width} × ${height}；可能經過社群平台縮放、銳化或壓縮。

請依照以下證據框架完成：
1. 先說明來源品質限制，區分社群壓縮、縮圖、對焦、鏡頭／濾鏡、現場光線與真正後期效果。
2. 用一句精準的風格標籤，加上 2–3 句整體診斷。
3. 建立證據表，逐項分開列出「直接觀察」「可能推論」「其他解釋」「信心：高／中／低與理由」。不要把觀察和推論混在一起。
4. 依序檢查：曝光與黑白端、曲線 toe／中間調／shoulder、白平衡與色偏、HSL、陰影／中間調／高光分級、局部遮罩、主體與背景分離、皮膚與質感、柔光／bloom／diffusion／halation、清晰度／銳化／降噪／顆粒，以及有證據才提合成或液化。
5. 列出最可能的後期堆疊順序：Profile／白平衡 → 全局影調 → 曲線 → HSL → 色彩分級 → 局部遮罩 → 修飾 → 柔光 → 銳化／降噪／顆粒 → 輸出。
6. 提供 Lightroom Classic／Adobe Camera Raw 可重現的起始配方。用合理範圍（例如 Texture −10 到 −25），不要偽裝成原作者的精確數值；每組參數都說明它對應哪個可見線索，以及何時應停止或回退。
7. 只有 Lightroom／ACR 不容易完成的效果，才補充 Photoshop 圖層與遮罩做法。若你認為可能用了 Evoto、像素蛋糕或美圖秀秀，請先描述可見操作，再提供保守的原生強度範圍，並同時給可手動重現的方法。
8. 最後列出 3–5 個重製後應對照微調的校準點，以及哪些判斷需要原圖／成品對照才能提高信心。

請先確認你已收到圖片；若圖片尚未附上，只提醒我上傳或貼上，不要憑這段文字開始猜測。`
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const field = document.createElement('textarea')
    field.value = text
    field.setAttribute('readonly', '')
    field.style.position = 'fixed'
    field.style.opacity = '0'
    document.body.append(field)
    field.select()
    const copied = document.execCommand('copy')
    field.remove()
    return copied
  }
}

function canvasToPng(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('無法處理圖片')), 'image/png')
  })
}

async function captureVisiblePhoto() {
  const rect = selectedMetadata?.visibleRect
  const viewportWidth = selectedMetadata?.viewportWidth
  const viewportHeight = selectedMetadata?.viewportHeight
  if (!rect || !viewportWidth || !viewportHeight || rect.width < 8 || rect.height < 8) throw new Error('無法定位圖片')

  const screenshot = await chrome.tabs.captureVisibleTab(null, { format: 'png' })
  const bitmap = await createImageBitmap(await (await fetch(screenshot)).blob())
  const scaleX = bitmap.width / viewportWidth
  const scaleY = bitmap.height / viewportHeight
  const sourceX = Math.max(0, Math.round(rect.x * scaleX))
  const sourceY = Math.max(0, Math.round(rect.y * scaleY))
  const sourceWidth = Math.min(bitmap.width - sourceX, Math.max(1, Math.round(rect.width * scaleX)))
  const sourceHeight = Math.min(bitmap.height - sourceY, Math.max(1, Math.round(rect.height * scaleY)))
  const canvas = document.createElement('canvas')
  canvas.width = sourceWidth
  canvas.height = sourceHeight
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('無法處理圖片')
  context.drawImage(bitmap, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, sourceWidth, sourceHeight)
  bitmap.close()
  return canvasToPng(canvas)
}

async function copyPhotoAndPrompt(prompt) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') return copyText(prompt)
  try {
    const image = await captureVisiblePhoto()
    await navigator.clipboard.write([new ClipboardItem({
      'image/png': image,
      'text/plain': new Blob([prompt], { type: 'text/plain' })
    })])
    return true
  } catch {
    return copyText(prompt)
  }
}

function findPrimaryPostImage() {
  const visible = (element) => {
    const rect = element.getBoundingClientRect()
    return rect.width > 160 && rect.height > 160 && rect.bottom > 0 && rect.top < innerHeight
  }
  const score = (image) => {
    const rect = image.getBoundingClientRect()
    const viewportOverlap = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0))
    const centerDistance = Math.abs((rect.top + rect.bottom) / 2 - innerHeight / 2)
    const articleBonus = image.closest('article') ? 1.35 : 1
    return (rect.width * viewportOverlap + 14000 / (1 + centerDistance)) * articleBonus
  }
  const candidates = Array.from(document.images).filter(visible)
  candidates.sort((a, b) => score(b) - score(a))
  const image = candidates[0]
  if (!image) return null
  const rect = image.getBoundingClientRect()
  const left = Math.max(0, rect.left)
  const top = Math.max(0, rect.top)
  const right = Math.min(innerWidth, rect.right)
  const bottom = Math.min(innerHeight, rect.bottom)
  return {
    url: image.currentSrc || image.src || null,
    width: image.naturalWidth || Math.round(image.getBoundingClientRect().width),
    height: image.naturalHeight || Math.round(image.getBoundingClientRect().height),
    viewportWidth: innerWidth,
    viewportHeight: innerHeight,
    visibleRect: { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
  }
}

function showError(title, hint) {
  emptyTitle.textContent = title
  emptyHint.textContent = hint
  sourceLabel.textContent = 'NO IMAGE'
  message.textContent = hint
  message.classList.add('error')
}

function showImage(result, platform) {
  selectedImage = result.url
  selectedMetadata = {
    platform,
    width: result.width,
    height: result.height,
    viewportWidth: result.viewportWidth,
    viewportHeight: result.viewportHeight,
    visibleRect: result.visibleRect
  }
  preview.referrerPolicy = 'no-referrer'
  preview.src = result.url
  preview.hidden = false
  preview.addEventListener('load', () => imageStage.classList.add('ready'), { once: true })
  emptyState.hidden = true
  sourceLabel.textContent = platform
  statusDot.classList.add('ready')
  dimensions.textContent = `${result.width || '—'} × ${result.height || '—'}`
  chatgptButton.disabled = false
  websiteButton.disabled = false
  message.classList.remove('error')
  message.textContent = '會在本機複製畫面中的照片與提示；到 ChatGPT 按 ⌘V 即可貼上。'
}

async function detectImage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id || !SUPPORTED_PAGE.test(tab.url || '')) {
    showError('這個頁面尚未支援', '請先開啟 X 或 Instagram 的圖片貼文，再點一次 Lumen Trace。')
    return
  }

  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: findPrimaryPostImage
    })
    if (!result?.url || !/^https:\/\//i.test(result.url)) {
      showError('沒有找到可分析圖片', '將貼文圖片捲動到畫面中央後再試一次。')
      return
    }
    const platform = /instagram\.com/i.test(tab.url) ? 'INSTAGRAM' : 'X POST'
    showImage(result, platform)
  } catch {
    showError('無法讀取目前分頁', '重新整理貼文頁面後再試一次。')
  }
}

chatgptButton.addEventListener('click', async () => {
  if (!selectedImage) return

  chatgptButton.disabled = true
  message.classList.remove('error')
  message.textContent = '正在本機準備照片與分析提示…'
  const copied = await copyPhotoAndPrompt(buildAnalysisPrompt())
  if (!copied) {
    message.textContent = '無法複製照片或提示。請允許剪貼簿權限後再試一次。'
    message.classList.add('error')
    chatgptButton.disabled = false
    return
  }

  message.classList.remove('error')
  message.textContent = '已複製。請在 ChatGPT 按 ⌘V 貼上後送出。'
  await chrome.tabs.create({ url: CHATGPT })
  window.close()
})

websiteButton.addEventListener('click', () => {
  if (!selectedImage) return
  const url = new URL(ANALYZER)
  url.searchParams.set('source', selectedImage)
  chrome.tabs.create({ url: url.toString() })
  window.close()
})

void detectImage()
