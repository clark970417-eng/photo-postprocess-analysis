const ANALYZER = 'https://lumen-stage.vercel.app/analyze'
const CHATGPT = 'https://chatgpt.com/'
const TRANSFER_KEY = 'lumenTraceHandoff'
const SUPPORTED_PAGES = ['https://x.com/*', 'https://twitter.com/*', 'https://www.instagram.com/*']
const TRANSFER_TTL_MS = 30 * 60 * 1000
const RESERVATION_TTL_MS = 2 * 60 * 1000
const finalizingDownloads = new Set()
const cancellingTransfers = new Set()
let handoffQueue = Promise.resolve()

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'lumen-analyze-image',
    title: '傳圖片網址到 Lumen Trace 網站',
    contexts: ['image'],
    documentUrlPatterns: SUPPORTED_PAGES
  })
  chrome.contextMenus.create({
    id: 'lumen-analyze-post',
    title: '傳貼文主圖網址到 Lumen Trace 網站',
    contexts: ['page'],
    documentUrlPatterns: SUPPORTED_PAGES
  })
})

function openAnalyzer(imageUrl) {
  if (!imageUrl || !/^https:\/\//i.test(imageUrl)) return
  const url = new URL(ANALYZER)
  url.searchParams.set('source', imageUrl)
  chrome.tabs.create({ url: url.toString() })
}

function validInstagramSourceUrl(value) {
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    return url.protocol === 'https:' && (
      hostname === 'instagram.com' ||
      hostname.endsWith('.instagram.com') ||
      hostname === 'cdninstagram.com' ||
      hostname.endsWith('.cdninstagram.com') ||
      hostname === 'fbcdn.net' ||
      hostname.endsWith('.fbcdn.net')
    )
  } catch {
    return false
  }
}

function getDownloadRequestUrl(message) {
  if (!validTransfer(message?.transfer)) return null
  if (message.type === 'DOWNLOAD_PNG_FALLBACK' &&
      typeof message.dataUrl === 'string' &&
      message.dataUrl.startsWith('data:image/png;base64,') &&
      /^Lumen-Trace-[A-Za-z0-9_.-]+\.png$/.test(message.filename || '')) {
    return message.dataUrl
  }
  if (message.type === 'DOWNLOAD_SOURCE_HANDOFF' &&
      message.transfer.platform === 'IG STORY' &&
      validInstagramSourceUrl(message.sourceUrl) &&
      /^Lumen-Trace-IG-Story-[A-Za-z0-9_.-]+\.(?:jpe?g|png|webp|avif)$/i.test(message.filename || '')) {
    return message.sourceUrl
  }
  return null
}

function validTransfer(transfer) {
  return transfer?.version === 1 &&
    typeof transfer.transferId === 'string' &&
    /^[a-zA-Z0-9-]{8,80}$/.test(transfer.transferId) &&
    typeof transfer.prompt === 'string' &&
    transfer.prompt.length > 0 &&
    transfer.prompt.length < 20000 &&
    Number.isFinite(transfer.savedAt)
}

function makeTransferRecord(transfer, status, imageMode, downloadId = null, filename = null, downloadKind = null) {
  const record = {
    version: 1,
    transferId: transfer.transferId,
    prompt: transfer.prompt,
    platform: typeof transfer.platform === 'string' ? transfer.platform : '社群貼文',
    width: Number.isFinite(transfer.width) ? transfer.width : null,
    height: Number.isFinite(transfer.height) ? transfer.height : null,
    sourceTabId: Number.isInteger(transfer.sourceTabId) ? transfer.sourceTabId : null,
    savedAt: transfer.savedAt,
    imageMode,
    status
  }
  if (Number.isInteger(downloadId)) record.downloadId = downloadId
  if (typeof filename === 'string' && filename) record.filename = filename
  const safeDownloadKind = downloadKind || (['source', 'png_fallback'].includes(transfer.downloadKind) ? transfer.downloadKind : null)
  if (safeDownloadKind) record.downloadKind = safeDownloadKind
  return record
}

function isFreshHandoff(record, now = Date.now()) {
  if (!validTransfer(record) || now < record.savedAt) return false
  if (record.status === 'download_failed') return false
  const ttl = record.status === 'photo_reserving' ? RESERVATION_TTL_MS : TRANSFER_TTL_MS
  return now - record.savedAt <= ttl
}

function serializeHandoff(task) {
  const run = handoffQueue.then(task, task)
  handoffQueue = run.catch(() => {})
  return run
}

async function getStoredHandoff() {
  const stored = await chrome.storage.session.get(TRANSFER_KEY)
  return stored[TRANSFER_KEY] || null
}

async function saveHandoff(message) {
  if (!validTransfer(message?.transfer)) return { ok: false, error: 'INVALID_HANDOFF' }
  const existing = await getStoredHandoff()
  if (isFreshHandoff(existing) && existing.transferId !== message.transfer.transferId) {
    return {
      ok: false,
      error: 'HANDOFF_IN_PROGRESS',
      currentStatus: existing.status,
      existingTransferId: existing.transferId
    }
  }
  const status = message.transfer.status === 'photo_reserving' ? 'photo_reserving' : 'photo_copied'
  const imageMode = message.transfer.imageMode === 'download' ? 'download' : 'clipboard'
  await chrome.storage.session.set({
    [TRANSFER_KEY]: makeTransferRecord(message.transfer, status, imageMode)
  })
  return { ok: true }
}

async function clearHandoff(transferId, reservingOnly = false) {
  const existing = await getStoredHandoff()
  if (!existing) return { ok: true, removed: false, absent: true }
  if (existing.transferId !== transferId) return { ok: false, error: 'HANDOFF_CHANGED' }
  if (reservingOnly && existing.status !== 'photo_reserving') return { ok: false, error: 'HANDOFF_ADVANCED' }
  await chrome.storage.session.remove(TRANSFER_KEY)
  return { ok: true, removed: true }
}

async function completeHandoff(transferId) {
  const existing = await getStoredHandoff()
  if (!existing) return { ok: true, cleaned: true }
  if (existing.transferId !== transferId) return { ok: false, error: 'HANDOFF_CHANGED' }

  try {
    await chrome.storage.session.remove(TRANSFER_KEY)
    return { ok: true, cleaned: true }
  } catch {
    await chrome.storage.session.set({
      [TRANSFER_KEY]: {
        version: 1,
        transferId,
        savedAt: Date.now(),
        status: 'prompt_copied'
      }
    })
    return { ok: true, cleaned: false, tombstoned: true }
  }
}

function filenameMatches(actualPath, requestedName) {
  if (typeof actualPath !== 'string' || typeof requestedName !== 'string') return false
  const actual = actualPath.split(/[\\/]/).pop()
  const dot = requestedName.lastIndexOf('.')
  const stem = dot > 0 ? requestedName.slice(0, dot) : requestedName
  const extension = dot > 0 ? requestedName.slice(dot) : ''
  const escapedStem = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const escapedExtension = extension.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escapedStem}(?: \\(\\d+\\))?${escapedExtension}$`).test(actual)
}

function recordMatchesDownload(record, item) {
  if (!record || !item) return false
  if (record.downloadId === item.id) return true
  if (!['download_starting', 'download_pending'].includes(record.status) || !record.filename) return false
  if (!filenameMatches(item.filename, record.filename)) return false
  const startedAt = Date.parse(item.startTime || '')
  return !Number.isFinite(startedAt) || startedAt >= record.savedAt - 10000
}

async function finalizeFallbackDownload(downloadId, state, knownItem = null) {
  if (finalizingDownloads.has(downloadId)) return
  finalizingDownloads.add(downloadId)

  try {
    const record = await getStoredHandoff()
    const item = knownItem || (await chrome.downloads.search({ id: downloadId }))[0]
    if (!recordMatchesDownload(record, item)) return
    if (cancellingTransfers.has(record.transferId)) return

    const validSourceCompletion = record.downloadKind !== 'source' || (
      validInstagramSourceUrl(item?.finalUrl || item?.url) &&
      ['image/jpeg', 'image/png', 'image/webp', 'image/avif'].includes(String(item?.mime || '').toLowerCase())
    )

    if (state === 'complete' && validSourceCompletion) {
      const completed = makeTransferRecord(record, 'photo_downloaded', 'download')
      await chrome.storage.session.set({ [TRANSFER_KEY]: completed })
      await chrome.tabs.create({ url: CHATGPT }).catch(() => {})
      return
    }

    if (state === 'interrupted' || (state === 'complete' && !validSourceCompletion)) {
      const failed = makeTransferRecord(record, 'download_failed', 'download')
      await chrome.storage.session.set({ [TRANSFER_KEY]: failed })
    }
  } finally {
    finalizingDownloads.delete(downloadId)
  }
}

async function startTrackedDownload(message) {
  const downloadUrl = getDownloadRequestUrl(message)
  if (!downloadUrl) return { ok: false, error: 'INVALID_DOWNLOAD_REQUEST' }

  const existing = await getStoredHandoff()
  if (isFreshHandoff(existing) && existing.transferId !== message.transfer.transferId) {
    return {
      ok: false,
      error: 'HANDOFF_IN_PROGRESS',
      currentStatus: existing.status,
      existingTransferId: existing.transferId,
      started: false
    }
  }

  const downloadKind = message.type === 'DOWNLOAD_SOURCE_HANDOFF' ? 'source' : 'png_fallback'
  const starting = makeTransferRecord(message.transfer, 'download_starting', 'download_pending', null, message.filename, downloadKind)
  try {
    await chrome.storage.session.set({ [TRANSFER_KEY]: starting })
  } catch {
    return { ok: false, error: 'HANDOFF_SAVE_FAILED', started: false }
  }

  let downloadId
  try {
    downloadId = await chrome.downloads.download({
      url: downloadUrl,
      filename: message.filename,
      conflictAction: 'uniquify',
      saveAs: false
    })
  } catch {
    try {
      await clearHandoff(message.transfer.transferId)
    } catch {}
    return { ok: false, error: 'DOWNLOAD_START_FAILED', started: false }
  }

  const pending = makeTransferRecord(message.transfer, 'download_pending', 'download_pending', downloadId, message.filename, downloadKind)
  let tracking = 'active'

  try {
    await chrome.storage.session.set({ [TRANSFER_KEY]: pending })
  } catch {
    tracking = 'event_recovery'
  }

  try {
    const [item] = await chrome.downloads.search({ id: downloadId })
    if (item?.state === 'complete' || item?.state === 'interrupted') {
      await finalizeFallbackDownload(downloadId, item.state, item)
    }
  } catch {}

  return { ok: true, downloadId, tracking, started: true }
}

async function recoverPendingDownload() {
  const record = await getStoredHandoff()
  if (!record || !['download_starting', 'download_pending'].includes(record.status)) return { ok: true, recovered: false }

  let items = []
  if (Number.isInteger(record.downloadId)) {
    items = await chrome.downloads.search({ id: record.downloadId })
  } else if (record.filename) {
    items = await chrome.downloads.search({ query: [record.filename.replace(/\.[a-z0-9]{2,5}$/i, '')] })
  }
  const item = items
    .filter((candidate) => recordMatchesDownload(record, candidate))
    .sort((a, b) => Date.parse(b.startTime || 0) - Date.parse(a.startTime || 0))[0]
  if (!item) return { ok: true, recovered: false }

  if (item.state === 'complete' || item.state === 'interrupted') {
    await finalizeFallbackDownload(item.id, item.state, item)
    return { ok: true, recovered: true, state: item.state }
  }

  if (!Number.isInteger(record.downloadId)) {
    await chrome.storage.session.set({
      [TRANSFER_KEY]: makeTransferRecord(record, 'download_pending', 'download_pending', item.id, record.filename)
    })
  }
  return { ok: true, recovered: true, state: item.state }
}

async function refreshHandoff() {
  const record = await getStoredHandoff()
  if (record?.status === 'prompt_copied') {
    await chrome.storage.session.remove(TRANSFER_KEY)
    return { ok: true, cleanupRetried: true }
  }
  return recoverPendingDownload()
}

chrome.downloads.onChanged.addListener((delta) => {
  if (!delta.state || (delta.state.current !== 'complete' && delta.state.current !== 'interrupted')) return
  void serializeHandoff(() => finalizeFallbackDownload(delta.id, delta.state.current)).catch(() => {})
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  let operation = null
  if (message?.type === 'SAVE_HANDOFF') operation = serializeHandoff(() => saveHandoff(message))
  if (message?.type === 'CLEAR_HANDOFF') {
    cancellingTransfers.add(message.transferId)
    operation = serializeHandoff(async () => {
      try {
        return await clearHandoff(message.transferId, Boolean(message.reservingOnly))
      } finally {
        cancellingTransfers.delete(message.transferId)
      }
    })
  }
  if (message?.type === 'COMPLETE_HANDOFF') operation = serializeHandoff(() => completeHandoff(message.transferId))
  if (message?.type === 'DOWNLOAD_PNG_FALLBACK' || message?.type === 'DOWNLOAD_SOURCE_HANDOFF') {
    operation = serializeHandoff(() => startTrackedDownload(message))
  }
  if (message?.type === 'REFRESH_DOWNLOAD_STATUS') operation = serializeHandoff(() => refreshHandoff())
  if (!operation) return false
  void operation.then(sendResponse).catch((error) => sendResponse({ ok: false, error: error?.message || 'HANDOFF_FAILED' }))
  return true
})

chrome.runtime.onStartup?.addListener(() => {
  void serializeHandoff(() => refreshHandoff()).catch(() => {})
})

function findPrimaryPostImage() {
  const visible = (element) => {
    const rect = element.getBoundingClientRect()
    return rect.width > 160 && rect.height > 160 && rect.bottom > 0 && rect.top < innerHeight
  }
  const score = (image) => {
    const rect = image.getBoundingClientRect()
    const viewportOverlap = Math.max(0, Math.min(rect.bottom, innerHeight) - Math.max(rect.top, 0))
    const nearCenter = 1 / (1 + Math.abs((rect.top + rect.bottom) / 2 - innerHeight / 2))
    return rect.width * viewportOverlap + nearCenter * 10000
  }
  const articleImages = Array.from(document.querySelectorAll('article img')).filter(visible)
  const candidates = articleImages.length ? articleImages : Array.from(document.images).filter(visible)
  candidates.sort((a, b) => score(b) - score(a))
  return candidates[0]?.currentSrc || candidates[0]?.src || null
}

async function analyzeTab(tab) {
  if (!tab?.id || !/^https:\/\/(x\.com|twitter\.com|www\.instagram\.com)\//i.test(tab.url || '')) return
  try {
    const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: findPrimaryPostImage })
    openAnalyzer(result)
  } catch {
    chrome.tabs.create({ url: ANALYZER })
  }
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'lumen-analyze-image' && info.srcUrl) return openAnalyzer(info.srcUrl)
  if (info.menuItemId === 'lumen-analyze-post') void analyzeTab(tab)
})

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'analyze-current-post') return
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  void analyzeTab(tab)
})
