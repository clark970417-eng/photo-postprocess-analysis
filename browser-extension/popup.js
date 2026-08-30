const ANALYZER = 'https://lumen-stage.vercel.app/analyze'
const CHATGPT = 'https://chatgpt.com/'
const TRANSFER_KEY = 'lumenTraceHandoff'

const {
  buildAnalysisPrompt,
  calculateCropBox,
  classifyPage,
  createTransfer,
  getFreshTransfer,
  makeDownloadFilename
} = globalThis.LumenTraceCore

const panel = document.querySelector('.panel')
const preview = document.querySelector('#preview')
const imageStage = document.querySelector('#imageStage')
const emptyState = document.querySelector('#emptyState')
const emptyTitle = document.querySelector('#emptyTitle')
const emptyHint = document.querySelector('#emptyHint')
const sourceLabel = document.querySelector('#sourceLabel')
const statusDot = document.querySelector('#statusDot')
const dimensions = document.querySelector('#dimensions')
const primaryButton = document.querySelector('#primaryButton')
const primaryLabel = document.querySelector('#primaryLabel')
const primaryBadge = document.querySelector('#primaryBadge')
const secondaryButton = document.querySelector('#secondaryButton')
const secondaryLabel = document.querySelector('#secondaryLabel')
const secondaryMeta = document.querySelector('#secondaryMeta')
const message = document.querySelector('#message')
const photoStep = document.querySelector('#photoStep')
const pasteStep = document.querySelector('#pasteStep')
const promptStep = document.querySelector('#promptStep')

const handoffStorage = chrome.storage.session

let activeTab = null
let primaryAction = null
let secondaryAction = null
let selectedImage = null
let selectedMetadata = null
let transfer = null

function setSteps(done = [], current = null) {
  const steps = { photo: photoStep, paste: pasteStep, prompt: promptStep }
  for (const [name, element] of Object.entries(steps)) {
    element.classList.toggle('done', done.includes(name))
    element.classList.toggle('current', name === current)
  }
}

function setPrimary(label, badge, action, enabled = true, complete = false) {
  primaryLabel.childNodes[0].nodeValue = label
  primaryBadge.textContent = badge
  primaryAction = action
  primaryButton.disabled = !enabled
  primaryButton.classList.toggle('complete', complete)
}

function setSecondary(label, meta, action, enabled = true) {
  secondaryLabel.textContent = label
  secondaryMeta.textContent = meta
  secondaryAction = action
  secondaryButton.disabled = !enabled
}

function setMessage(text, isError = false) {
  message.textContent = text
  message.classList.toggle('error', isError)
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
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG_ENCODE_FAILED')), 'image/png')
  })
}

async function captureVisiblePhoto() {
  const rect = selectedMetadata?.visibleRect
  const viewportWidth = selectedMetadata?.viewportWidth
  const viewportHeight = selectedMetadata?.viewportHeight
  if (!rect || !viewportWidth || !viewportHeight) throw new Error('INVALID_CROP')

  let bitmap = null
  try {
    const screenshot = await chrome.tabs.captureVisibleTab(selectedMetadata.windowId, { format: 'png' })
    bitmap = await createImageBitmap(await (await fetch(screenshot)).blob())
    const crop = calculateCropBox(rect, viewportWidth, viewportHeight, bitmap.width, bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = crop.sourceWidth
    canvas.height = crop.sourceHeight
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('PNG_ENCODE_FAILED')
    context.drawImage(
      bitmap,
      crop.sourceX,
      crop.sourceY,
      crop.sourceWidth,
      crop.sourceHeight,
      0,
      0,
      crop.sourceWidth,
      crop.sourceHeight
    )
    return await canvasToPng(canvas)
  } catch (error) {
    if (error?.message === 'INVALID_CROP' || error?.message === 'PNG_ENCODE_FAILED' || error?.message === '無法定位圖片') throw error
    throw new Error('CAPTURE_FAILED')
  } finally {
    bitmap?.close()
  }
}

async function writePngOnly(blob) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('PNG_CLIPBOARD_UNSUPPORTED')
  if (typeof ClipboardItem.supports === 'function' && !ClipboardItem.supports('image/png')) throw new Error('PNG_CLIPBOARD_UNSUPPORTED')

  try {
    let item
    try {
      item = new ClipboardItem({ 'image/png': blob }, { presentationStyle: 'attachment' })
    } catch {
      item = new ClipboardItem({ 'image/png': blob })
    }
    await navigator.clipboard.write([item])
  } catch {
    throw new Error('PNG_CLIPBOARD_FAILED')
  }
}

function downloadPng(blob) {
  try {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = makeDownloadFilename()
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 2000)
    return true
  } catch {
    return false
  }
}

async function saveTransfer(record) {
  if (!handoffStorage) throw new Error('HANDOFF_SAVE_FAILED')
  await handoffStorage.set({ [TRANSFER_KEY]: record })
}

async function loadTransfer() {
  if (!handoffStorage) return null
  const stored = await handoffStorage.get(TRANSFER_KEY)
  return getFreshTransfer(stored[TRANSFER_KEY])
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
    width: image.naturalWidth || Math.round(rect.width),
    height: image.naturalHeight || Math.round(rect.height),
    viewportWidth: innerWidth,
    viewportHeight: innerHeight,
    visibleRect: { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
  }
}

function showError(title, hint) {
  preview.hidden = true
  imageStage.classList.remove('ready')
  emptyState.hidden = false
  emptyTitle.textContent = title
  emptyHint.textContent = hint
  sourceLabel.textContent = 'CHECK'
  statusDot.classList.remove('ready')
  dimensions.textContent = '— × —'
  setPrimary('無法繼續', 'CHECK', null, false)
  setSecondary('關閉後重試', '重新開啟擴充功能', 'close', true)
  setSteps([], null)
  setMessage(hint, true)
}

function showImage(result, platform) {
  selectedImage = result.url
  selectedMetadata = {
    platform,
    width: result.width,
    height: result.height,
    viewportWidth: result.viewportWidth,
    viewportHeight: result.viewportHeight,
    visibleRect: result.visibleRect,
    tabId: activeTab.id,
    windowId: activeTab.windowId
  }
  preview.referrerPolicy = 'no-referrer'
  preview.src = result.url
  preview.hidden = false
  preview.addEventListener('load', () => imageStage.classList.add('ready'), { once: true })
  emptyState.hidden = true
  sourceLabel.textContent = platform
  statusDot.classList.add('ready')
  dimensions.textContent = `${result.width || '—'} × ${result.height || '—'}`
  setPrimary('複製照片', 'PNG ONLY', 'copy_photo', true)
  setSecondary('在網站開啟', '不會自動送出', 'website', true)
  setSteps([], 'photo')
  setMessage('第一步只複製 PNG，避免 ChatGPT 把文字當成照片的替代格式。')
}

async function showChatGptResume() {
  panel.classList.add('resume')
  preview.hidden = true
  imageStage.classList.remove('ready')
  emptyState.hidden = false
  transfer = await loadTransfer()

  if (!transfer) {
    showError('找不到待分析照片', '交接已過期或擴充功能剛重新載入；請回 X／Instagram 重新複製照片。')
    return
  }

  const isDownload = transfer.imageMode === 'download'
  emptyTitle.textContent = isDownload ? '請先上傳下載的 PNG' : '請先確認照片縮圖'
  emptyHint.textContent = isDownload
    ? '用 ChatGPT 的迴紋針選擇最新 Lumen-Trace PNG'
    : '回到輸入框按 ⌘V；看到縮圖後再做第 3 步'
  sourceLabel.textContent = 'CHATGPT HANDOFF'
  statusDot.classList.add('ready')
  dimensions.textContent = `${transfer.width || '—'} × ${transfer.height || '—'}`
  setPrimary('已看到縮圖，複製提示', 'TEXT ONLY', 'copy_prompt', true)
  setSecondary('回到照片貼文', transfer.platform || 'SOURCE', 'return_source', Number.isInteger(transfer.sourceTabId))
  setSteps(['photo'], 'paste')
  setMessage(isDownload
    ? '上傳下載的 PNG；看到縮圖後再按上方按鈕複製提示。'
    : '照片仍在剪貼簿。先按 ⌘V，確認出現縮圖，再複製提示。')
}

async function detectSourceImage() {
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: findPrimaryPostImage
    })
    if (!result?.url || !/^https:\/\//i.test(result.url)) {
      showError('沒有找到可分析圖片', '將貼文圖片捲動到畫面中央後再試一次。')
      return
    }
    const platform = /instagram\.com/i.test(activeTab.url) ? 'INSTAGRAM' : 'X POST'
    showImage(result, platform)
  } catch {
    showError('無法讀取目前分頁', '重新整理貼文頁面後再試一次。')
  }
}

async function handleCopyPhoto() {
  primaryButton.disabled = true
  secondaryButton.disabled = true
  setMessage('正在本機裁切畫面中的貼文照片…')

  try {
    const blob = await captureVisiblePhoto()
    let imageMode = 'clipboard'
    try {
      await writePngOnly(blob)
    } catch {
      if (!downloadPng(blob)) throw new Error('PNG_CLIPBOARD_FAILED')
      imageMode = 'download'
    }

    transfer = createTransfer(selectedMetadata, buildAnalysisPrompt(selectedMetadata), Date.now(), imageMode)
    await saveTransfer(transfer)
    setPrimary('開啟 ChatGPT', 'STEP 2', 'open_chatgpt', true, true)
    setSecondary('在網站開啟', '不會自動送出', 'website', true)
    setSteps(['photo'], 'paste')
    setMessage(imageMode === 'clipboard'
      ? '照片已以純 PNG 複製。開啟 ChatGPT 後按 ⌘V，確認出現縮圖。'
      : 'Opera 未能複製圖片，已改下載 PNG；到 ChatGPT 用迴紋針上傳。')
  } catch (error) {
    const storageFailure = /storage|quota/i.test(error?.message || '')
    setPrimary('再試一次', 'PNG ONLY', 'copy_photo', true)
    setSecondary('在網站開啟', '手動上傳圖片', 'website', true)
    setSteps([], 'photo')
    setMessage(storageFailure
      ? '照片已準備，但無法保存交接提示。請重新載入擴充功能後再試。'
      : '無法複製或下載照片；請允許剪貼簿寫入，或改用網站手動上傳。', true)
  }
}

async function handleCopyPrompt() {
  if (!transfer?.prompt) return
  primaryButton.disabled = true
  setMessage('正在複製分析提示；不會讀取或送出 ChatGPT 內容…')
  const copied = await copyText(transfer.prompt)
  if (!copied) {
    setPrimary('再試一次', 'TEXT ONLY', 'copy_prompt', true)
    setMessage('提示複製失敗。請允許剪貼簿寫入後重試。', true)
    return
  }

  transfer = { ...transfer, status: 'prompt_copied', promptCopiedAt: Date.now() }
  await saveTransfer(transfer).catch(() => {})
  setPrimary('提示已複製', '⌘V', 'close', true, true)
  setSteps(['photo', 'paste', 'prompt'], null)
  setMessage('回到輸入框按 ⌘V；確認「照片縮圖＋提示文字」同時存在，再送出。')
  window.setTimeout(() => window.close(), 900)
}

async function handlePrimary() {
  if (primaryAction === 'copy_photo') return handleCopyPhoto()
  if (primaryAction === 'open_chatgpt') {
    try {
      await chrome.tabs.create({ url: CHATGPT })
      window.close()
    } catch {
      setPrimary('再試一次', 'STEP 2', 'open_chatgpt', true)
      setMessage('無法開啟 ChatGPT；請手動前往 chatgpt.com。', true)
    }
    return
  }
  if (primaryAction === 'copy_prompt') return handleCopyPrompt()
  if (primaryAction === 'close') window.close()
}

async function handleSecondary() {
  if (secondaryAction === 'website' && selectedImage) {
    const url = new URL(ANALYZER)
    url.searchParams.set('source', selectedImage)
    await chrome.tabs.create({ url: url.toString() })
    window.close()
    return
  }
  if (secondaryAction === 'return_source' && Number.isInteger(transfer?.sourceTabId)) {
    try {
      await chrome.tabs.update(transfer.sourceTabId, { active: true })
      window.close()
    } catch {
      setMessage('原貼文分頁已關閉；請手動回到 X／Instagram。', true)
    }
    return
  }
  if (secondaryAction === 'close') window.close()
}

async function detectContext() {
  ;[activeTab] = await chrome.tabs.query({ active: true, currentWindow: true })
  const context = classifyPage(activeTab?.url || '')
  if (!activeTab?.id || context === 'unsupported') {
    showError('這個頁面尚未支援', '請開啟 X／Instagram 圖片貼文，或在 ChatGPT 繼續剛才的交接。')
    return
  }
  if (context === 'chatgpt') {
    await showChatGptResume()
    return
  }
  await detectSourceImage()
}

primaryButton.addEventListener('click', () => void handlePrimary())
secondaryButton.addEventListener('click', () => void handleSecondary())

void detectContext()
