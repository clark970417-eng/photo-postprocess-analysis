const ANALYZER = 'https://lumen-stage.vercel.app/analyze'
const CHATGPT = 'https://chatgpt.com/'
const TRANSFER_KEY = 'lumenTraceHandoff'

const {
  buildAnalysisPrompt,
  calculateCropBox,
  classifyPage,
  createTransfer,
  getFreshTransfer,
  makeDownloadFilename,
  makeSourceDownloadFilename
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
const photoConfirmRow = document.querySelector('#photoConfirmRow')
const photoConfirmed = document.querySelector('#photoConfirmed')

const handoffStorage = chrome.storage.session

let activeTab = null
let primaryAction = null
let secondaryAction = null
let selectedImage = null
let selectedSourceUrl = null
let selectedMetadata = null
let transfer = null
let blockingTransferId = null

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

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(reader.result), { once: true })
    reader.addEventListener('error', () => reject(new Error('PNG_ENCODE_FAILED')), { once: true })
    reader.readAsDataURL(blob)
  })
}

async function startFallbackDownload(blob, record) {
  const response = await chrome.runtime.sendMessage({
    type: 'DOWNLOAD_PNG_FALLBACK',
    dataUrl: await blobToDataUrl(blob),
    filename: makeDownloadFilename(),
    transfer: record
  })
  if (!response?.ok) {
    const error = new Error(response?.error || 'DOWNLOAD_START_FAILED')
    error.started = Boolean(response?.started)
    error.currentStatus = response?.currentStatus || null
    error.existingTransferId = response?.existingTransferId || null
    throw error
  }
  return response
}

async function startSourceDownload(record) {
  const response = await chrome.runtime.sendMessage({
    type: 'DOWNLOAD_SOURCE_HANDOFF',
    sourceUrl: selectedSourceUrl,
    filename: makeSourceDownloadFilename(record.platform, selectedSourceUrl),
    transfer: record
  })
  if (!response?.ok) {
    const error = new Error(response?.error || 'DOWNLOAD_START_FAILED')
    error.started = Boolean(response?.started)
    error.currentStatus = response?.currentStatus || null
    error.existingTransferId = response?.existingTransferId || null
    throw error
  }
  return response
}

async function saveTransfer(record) {
  const response = await chrome.runtime.sendMessage({ type: 'SAVE_HANDOFF', transfer: record })
  if (!response?.ok) {
    const error = new Error(response?.error || 'HANDOFF_SAVE_FAILED')
    error.currentStatus = response?.currentStatus || null
    error.existingTransferId = response?.existingTransferId || null
    throw error
  }
}

async function reserveTransfer(record) {
  return saveTransfer({ ...record, status: 'photo_reserving' })
}

async function clearTransfer(record, reservingOnly = false) {
  return clearTransferId(record?.transferId, reservingOnly)
}

async function clearTransferId(transferId, reservingOnly = false) {
  if (!transferId) return false
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'CLEAR_HANDOFF',
      transferId,
      reservingOnly
    })
    return Boolean(response?.ok)
  } catch {
    return false
  }
}

async function completeTransfer(record) {
  if (!record?.transferId) return { ok: false }
  try {
    return await chrome.runtime.sendMessage({
      type: 'COMPLETE_HANDOFF',
      transferId: record.transferId
    })
  } catch {
    return { ok: false }
  }
}

async function loadTransfer() {
  if (!handoffStorage) return null
  try {
    const stored = await handoffStorage.get(TRANSFER_KEY)
    return getFreshTransfer(stored[TRANSFER_KEY])
  } catch {
    throw new Error('HANDOFF_LOAD_FAILED')
  }
}

function findPrimaryPostImage() {
  const isStory = /^\/stories\//i.test(location.pathname)
  const visible = (element) => {
    const rect = element.getBoundingClientRect()
    const minimum = isStory ? 260 : 160
    const style = getComputedStyle(element)
    const hiddenByAccessibility = Boolean(element.closest('[aria-hidden="true"]'))
    const centerX = Math.min(innerWidth - 1, Math.max(0, (Math.max(0, rect.left) + Math.min(innerWidth, rect.right)) / 2))
    const centerY = Math.min(innerHeight - 1, Math.max(0, (Math.max(0, rect.top) + Math.min(innerHeight, rect.bottom)) / 2))
    const paintedAtCenter = !isStory || document.elementsFromPoint(centerX, centerY).includes(element)
    return rect.width > minimum && rect.height > minimum && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth &&
      style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0.01 && !hiddenByAccessibility && paintedAtCenter
  }
  const score = (image) => {
    const rect = image.getBoundingClientRect()
    const viewportOverlap = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0))
    const verticalDistance = Math.abs((rect.top + rect.bottom) / 2 - innerHeight / 2)
    const horizontalDistance = Math.abs((rect.left + rect.right) / 2 - innerWidth / 2)
    const articleBonus = image.closest('article') ? 1.35 : 1
    const storyBonus = isStory ? 2.2 / (1 + horizontalDistance / Math.max(1, innerWidth)) : 1
    return (rect.width * viewportOverlap + 14000 / (1 + verticalDistance)) * articleBonus * storyBonus
  }
  const highestSource = (image) => {
    const entries = String(image.srcset || '').split(',').map((entry) => {
      const match = entry.trim().match(/^(https:\/\/\S+)\s+(\d+)w$/i)
      return match ? { url: match[1], width: Number(match[2]) } : null
    }).filter(Boolean).sort((a, b) => b.width - a.width)
    return entries[0]?.url || image.currentSrc || image.src || null
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
    sourceUrl: highestSource(image),
    isStory,
    width: image.naturalWidth || Math.round(rect.width),
    height: image.naturalHeight || Math.round(rect.height),
    viewportWidth: innerWidth,
    viewportHeight: innerHeight,
    visibleRect: { x: left, y: top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) }
  }
}

function showError(title, hint) {
  photoConfirmRow.hidden = true
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
  photoConfirmRow.hidden = true
  photoConfirmed.checked = false
  selectedImage = result.url
  selectedSourceUrl = result.sourceUrl || result.url
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
  if (platform === 'IG STORY') {
    setPrimary('原畫質下載並交接', 'NO RE-ENCODE', 'download_source', true)
    setSecondary('改用畫面複製', 'PNG 備援', 'copy_photo', true)
  } else {
    setPrimary('複製照片', 'PNG ONLY', 'copy_photo', true)
    setSecondary('連圖片網址在網站開啟', '會帶入來源網址', 'website', true)
  }
  setSteps([], 'photo')
  setMessage(platform === 'IG STORY'
    ? '會下載 Instagram 此刻提供給瀏覽器的照片檔，不截圖、不重新壓縮；IG 上傳時可能已壓縮。'
    : '第一步只複製 PNG，避免 ChatGPT 把文字當成照片的替代格式。')
}

async function showChatGptResume() {
  panel.classList.add('resume')
  preview.hidden = true
  imageStage.classList.remove('ready')
  emptyState.hidden = false
  try {
    transfer = await loadTransfer()
  } catch {
    showError('無法讀取交接資料', 'Opera 暫時無法使用 session storage；請重新載入擴充功能後再試。')
    return
  }

  if (!transfer) {
    showError('找不到待分析照片', '交接已過期或擴充功能剛重新載入；請回 X／Instagram 重新複製照片。')
    return
  }

  if (transfer.status === 'photo_reserving') {
    emptyTitle.textContent = '照片準備沒有完成'
    emptyHint.textContent = '這筆交接尚未產生可貼上的照片'
    sourceLabel.textContent = 'INCOMPLETE'
    dimensions.textContent = `${transfer.width || '—'} × ${transfer.height || '—'}`
    photoConfirmRow.hidden = true
    setPrimary('放棄並回原貼文', 'RESET', 'abandon_handoff', true)
    setSecondary('關閉', '不會送出任何內容', 'close', true)
    setSteps([], 'photo')
    setMessage('可能是在裁切或複製完成前關閉了視窗。先清除這筆準備，再重新複製照片。', true)
    return
  }

  if (['download_starting', 'download_pending'].includes(transfer.status)) {
    emptyTitle.textContent = '照片檔仍在下載'
    emptyHint.textContent = '下載完成後會自動開啟新的 ChatGPT 分頁'
    sourceLabel.textContent = 'DOWNLOAD PENDING'
    dimensions.textContent = `${transfer.width || '—'} × ${transfer.height || '—'}`
    photoConfirmRow.hidden = true
    setPrimary('等待下載完成', 'BACKGROUND', null, false)
    setSecondary('放棄下載並回貼文', '找不到檔案時使用', 'abandon_handoff', true)
    setSteps([], 'photo')
    setMessage('可關閉此視窗；背景服務會等待 Opera 回報下載完成。')
    return
  }

  if (transfer.status === 'download_failed') {
    emptyTitle.textContent = '照片下載未完成'
    emptyHint.textContent = '下載遭取消或中斷，沒有照片可以交接'
    sourceLabel.textContent = 'DOWNLOAD FAILED'
    dimensions.textContent = `${transfer.width || '—'} × ${transfer.height || '—'}`
    photoConfirmRow.hidden = true
    setPrimary('清除並回原貼文', 'RESET', 'abandon_handoff', true)
    setSecondary('關閉', '稍後也可重新開始', 'close', true)
    setSteps([], 'photo')
    setMessage('清除失敗交接後即可重新複製；不必等待 30 分鐘。', true)
    return
  }

  const isDownload = transfer.imageMode === 'download'
  emptyTitle.textContent = isDownload ? '請先上傳下載的照片' : '請先確認照片縮圖'
  emptyHint.textContent = isDownload
    ? '用 ChatGPT 的迴紋針選擇最新 Lumen-Trace 圖片'
    : '回到輸入框按 ⌘V；看到縮圖後再做第 3 步'
  sourceLabel.textContent = 'CHATGPT HANDOFF'
  statusDot.classList.add('ready')
  dimensions.textContent = `${transfer.width || '—'} × ${transfer.height || '—'}`
  photoConfirmRow.hidden = false
  photoConfirmed.checked = false
  setPrimary('確認縮圖後複製提示', 'TEXT ONLY', 'copy_prompt', false)
  setSecondary('回到照片貼文', transfer.platform || 'SOURCE', 'return_source', Number.isInteger(transfer.sourceTabId))
  setSteps(['photo'], 'paste')
  setMessage(isDownload
    ? '上傳下載的照片；看到縮圖後勾選確認，才會解鎖提示按鈕。'
    : '照片仍在剪貼簿。先按 ⌘V；看到縮圖後勾選確認，才會解鎖提示。')
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
    const isInstagram = /^https:\/\/www\.instagram\.com\//i.test(activeTab.url || '')
    const platform = isInstagram && result.isStory ? 'IG STORY' : isInstagram ? 'INSTAGRAM' : 'X POST'
    showImage(result, platform)
  } catch {
    showError('無法讀取目前分頁', '重新整理貼文頁面後再試一次。')
  }
}

async function handleDownloadSource() {
  primaryButton.disabled = true
  secondaryButton.disabled = true
  setMessage('正在取得 Instagram 當下提供的照片檔；不會重新編碼…')

  let reserved = false
  let downloadStarted = false
  try {
    transfer = createTransfer(selectedMetadata, buildAnalysisPrompt(selectedMetadata), Date.now(), 'download_pending')
    await reserveTransfer(transfer)
    reserved = true
    const result = await startSourceDownload({ ...transfer, imageMode: 'download_pending' })
    downloadStarted = Boolean(result.started)
    setPrimary('等待照片下載', 'BACKGROUND', null, false)
    setSecondary('下載進行中', '完成後自動開啟 ChatGPT', null, false)
    setSteps([], 'photo')
    setMessage(result.tracking === 'event_recovery'
      ? '下載已開始；Opera 會在完成事件或下次開啟時恢復這筆交接，請勿重複按。'
      : '下載完成後會自動開啟 ChatGPT；再用迴紋針上傳最新的 Lumen-Trace 圖片。')
  } catch (error) {
    if (reserved && !downloadStarted) await clearTransfer(transfer, true)
    if (error?.message === 'HANDOFF_IN_PROGRESS') {
      blockingTransferId = error.existingTransferId
      const preparing = error.currentStatus === 'photo_reserving'
      setPrimary(preparing ? '清除中斷準備' : '繼續上次交接', preparing ? 'RESET' : 'STEP 2', preparing ? 'clear_blocked_reservation' : 'open_chatgpt', true)
      setSecondary('目前只保留一組', '避免照片與提示錯配', null, false)
      setMessage(preparing ? '上一筆準備沒有完成；清除後即可重試。' : '已有一張照片尚未完成交接。請先完成它。', true)
      return
    }
    setPrimary('改用畫面複製', 'PNG 備援', 'copy_photo', true)
    setSecondary('重新偵測限動', '來源可能已過期', 'close', true)
    setSteps([], 'photo')
    setMessage('Instagram 來源檔無法下載，可能是限動已切換或簽名網址過期；可改用畫面 PNG。', true)
  }
}

async function handleCopyPhoto() {
  primaryButton.disabled = true
  secondaryButton.disabled = true
  setMessage('正在本機裁切畫面中的貼文照片…')

  let photoCopied = false
  let fallbackStarted = false
  let reserved = false
  try {
    transfer = createTransfer(selectedMetadata, buildAnalysisPrompt(selectedMetadata), Date.now(), 'clipboard')
    await reserveTransfer(transfer)
    reserved = true
    const blob = await captureVisiblePhoto()
    try {
      await writePngOnly(blob)
      photoCopied = true
    } catch {
      let fallback
      try {
        fallback = await startFallbackDownload(blob, { ...transfer, imageMode: 'download_pending' })
        fallbackStarted = Boolean(fallback.started)
      } catch (error) {
        fallbackStarted = Boolean(error?.started)
        throw error
      }
      setPrimary('等待 PNG 下載', 'BACKGROUND', null, false)
      setSecondary('背景下載進行中', '請等待完成', null, false)
      setSteps([], 'photo')
      setMessage(fallback.tracking === 'event_recovery'
        ? 'PNG 已開始下載；Opera 會用唯一檔名在完成事件或下次開啟時恢復交接，請勿重複按。'
        : '圖片剪貼簿不可用；背景下載已開始，完成後會自動開啟 ChatGPT。')
      return
    }

    transfer = { ...transfer, imageMode: 'clipboard', status: 'photo_copied' }
    await saveTransfer(transfer)
    setPrimary('開啟 ChatGPT', 'STEP 2', 'open_chatgpt', true, true)
    setSecondary('連圖片網址在網站開啟', '會帶入來源網址', 'website', true)
    setSteps(['photo'], 'paste')
    setMessage('照片已以純 PNG 複製。開啟 ChatGPT 後按 ⌘V，確認出現縮圖。')
  } catch (error) {
    if (reserved && !photoCopied && !fallbackStarted) await clearTransfer(transfer, true)

    if ((error?.message === 'HANDOFF_SAVE_FAILED' || error?.message === 'HANDOFF_FAILED') && photoCopied) {
      setPrimary('重試保存交接', '不重複複製', 'retry_save', true)
      setSecondary('連圖片網址在網站開啟', '會帶入來源網址', 'website', true)
      setSteps(['photo'], 'paste')
      setMessage('照片已在剪貼簿，但交接提示尚未保存；重試不會覆蓋圖片。', true)
      return
    }

    if (error?.message === 'HANDOFF_IN_PROGRESS') {
      blockingTransferId = error.existingTransferId
      const preparing = error.currentStatus === 'photo_reserving'
      setPrimary(preparing ? '清除中斷準備' : '繼續上次交接', preparing ? 'RESET' : 'STEP 2', preparing ? 'clear_blocked_reservation' : 'open_chatgpt', true)
      setSecondary('目前只保留一組', '避免照片與提示錯配', null, false)
      setSteps([], 'photo')
      setMessage(preparing
        ? '上一個照片準備沒有完成。清除後即可重新按「複製照片」。'
        : '已有一張照片尚未完成交接。請先在 ChatGPT 完成它，再回來開始下一張。', true)
      return
    }

    setPrimary('再試一次', 'PNG ONLY', 'copy_photo', true)
    setSecondary('連圖片網址在網站開啟', '會帶入來源網址', 'website', true)
    setSteps([], 'photo')
    setMessage('無法複製照片，下載備援也未完成；請檢查瀏覽器權限後重試。', true)
  }
}

async function handleRetrySave() {
  if (!transfer) return
  primaryButton.disabled = true
  setMessage('正在重新保存交接提示；不會改動照片剪貼簿或下載檔…')
  try {
    await saveTransfer(transfer)
    setPrimary('開啟 ChatGPT', 'STEP 2', 'open_chatgpt', true, true)
    setSteps(['photo'], 'paste')
    setMessage(transfer.imageMode === 'clipboard'
      ? '交接已保存。開啟 ChatGPT 後按 ⌘V，確認出現縮圖。'
      : '交接已保存。開啟 ChatGPT 後用迴紋針上傳下載的 PNG。')
  } catch {
    setPrimary('重試保存交接', '不重複複製', 'retry_save', true)
    setMessage('仍無法使用 session storage；可重新載入擴充功能後再試。', true)
  }
}

async function handleCopyPrompt() {
  if (!transfer?.prompt || !photoConfirmed.checked) return
  primaryButton.disabled = true
  setMessage('正在複製分析提示；不會讀取或送出 ChatGPT 內容…')
  const copied = await copyText(transfer.prompt)
  if (!copied) {
    setPrimary('再試一次', 'TEXT ONLY', 'copy_prompt', true)
    setMessage('提示複製失敗。請允許剪貼簿寫入後重試。', true)
    return
  }

  const cleanup = await completeTransfer(transfer)
  photoConfirmRow.hidden = true
  setPrimary('提示已複製', '⌘V', 'close', true, true)
  setSteps(['photo', 'paste', 'prompt'], null)
  setMessage(cleanup?.cleaned
    ? '回到輸入框按 ⌘V；確認「照片縮圖＋提示文字」同時存在，再送出。'
    : cleanup?.tombstoned
      ? '提示已複製且已從暫存移除；空白清除標記會在下次開啟時刪除。回輸入框按 ⌘V。'
      : '提示已複製，但 Opera 暫時無法清除交接；它會在 30 分鐘後失效。回輸入框按 ⌘V。')
  window.setTimeout(() => window.close(), 900)
}

async function returnToSource(sourceTabId) {
  if (!Number.isInteger(sourceTabId)) return false
  try {
    await chrome.tabs.update(sourceTabId, { active: true })
    window.close()
    return true
  } catch {
    setMessage('原貼文分頁已關閉；請手動回到 X／Instagram。', true)
    return false
  }
}

async function handleAbandonHandoff() {
  if (!transfer) return
  primaryButton.disabled = true
  setMessage('正在清除這筆未完成交接…')
  const cleared = await clearTransfer(transfer)
  if (!cleared) {
    setPrimary('再試一次', 'RESET', 'abandon_handoff', true)
    setMessage('暫時無法清除；請重新載入擴充功能後再試。', true)
    return
  }
  if (!await returnToSource(transfer.sourceTabId)) {
    setPrimary('已清除', 'DONE', 'close', true, true)
  }
}

async function handleClearBlockedReservation() {
  primaryButton.disabled = true
  const cleared = await clearTransferId(blockingTransferId, true)
  if (!cleared) {
    setPrimary('再試一次', 'RESET', 'clear_blocked_reservation', true)
    setMessage('暫時無法清除上一筆準備；請重新載入後再試。', true)
    return
  }
  blockingTransferId = null
  setPrimary('複製照片', 'PNG ONLY', 'copy_photo', true)
  setSecondary('連圖片網址在網站開啟', '會帶入來源網址', 'website', true)
  setSteps([], 'photo')
  setMessage('中斷的準備已清除。現在可以重新複製這張照片。')
}

async function handlePrimary() {
  if (primaryAction === 'copy_photo') return handleCopyPhoto()
  if (primaryAction === 'download_source') return handleDownloadSource()
  if (primaryAction === 'retry_save') return handleRetrySave()
  if (primaryAction === 'abandon_handoff') return handleAbandonHandoff()
  if (primaryAction === 'clear_blocked_reservation') return handleClearBlockedReservation()
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
    await returnToSource(transfer.sourceTabId)
    return
  }
  if (secondaryAction === 'abandon_handoff') return handleAbandonHandoff()
  if (secondaryAction === 'close') window.close()
}

async function detectContext() {
  await chrome.runtime.sendMessage({ type: 'REFRESH_DOWNLOAD_STATUS' }).catch(() => {})
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
photoConfirmed.addEventListener('change', () => {
  if (!transfer) return
  if (photoConfirmed.checked) {
    setPrimary('複製分析提示', 'TEXT ONLY', 'copy_prompt', true)
    setSteps(['photo', 'paste'], 'prompt')
    setMessage('已確認照片縮圖。現在複製提示，再回輸入框按一次 ⌘V。')
  } else {
    setPrimary('確認縮圖後複製提示', 'TEXT ONLY', 'copy_prompt', false)
    setSteps(['photo'], 'paste')
    setMessage('先回輸入框貼上照片；看到縮圖後再勾選確認。')
  }
})

void detectContext()
