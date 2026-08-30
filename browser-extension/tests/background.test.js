const assert = require('node:assert/strict')
const path = require('node:path')
const test = require('node:test')

let handoff = {}
let nextDownloadId = 90
let nextDownloadState = 'in_progress'
let storageSetCount = 0
let failingStorageSetCalls = new Set()
let storageGetGate = null
let failNextStorageRemove = false
const createdTabs = []
const downloads = new Map()
const downloadRequests = []
const listeners = {}

global.chrome = {
  runtime: {
    onInstalled: { addListener: (listener) => { listeners.installed = listener } },
    onStartup: { addListener: (listener) => { listeners.startup = listener } },
    onMessage: { addListener: (listener) => { listeners.message = listener } }
  },
  contextMenus: {
    create: () => {},
    onClicked: { addListener: (listener) => { listeners.contextMenu = listener } }
  },
  commands: {
    onCommand: { addListener: (listener) => { listeners.command = listener } }
  },
  downloads: {
    download: async (request) => {
      const { filename } = request
      downloadRequests.push(request)
      const extension = filename.split('.').pop().toLowerCase()
      const mime = ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif' })[extension] || ''
      const id = ++nextDownloadId
      downloads.set(id, {
        id,
        filename: `/Downloads/${filename}`,
        url: request.url,
        finalUrl: request.url,
        mime,
        startTime: new Date().toISOString(),
        state: nextDownloadState
      })
      return id
    },
    search: async (query) => {
      if (Number.isInteger(query.id)) return downloads.has(query.id) ? [downloads.get(query.id)] : []
      if (Array.isArray(query.query)) {
        return [...downloads.values()].filter((item) => query.query.every((term) => item.filename.includes(term.replace(/\.png$/, ''))))
      }
      return [...downloads.values()]
    },
    onChanged: { addListener: (listener) => { listeners.downloadChanged = listener } }
  },
  storage: {
    session: {
      get: async () => {
        if (storageGetGate) {
          const gate = storageGetGate
          storageGetGate = null
          gate.started()
          await gate.wait
        }
        return { ...handoff }
      },
      set: async (value) => {
        storageSetCount += 1
        if (failingStorageSetCalls.has(storageSetCount)) throw new Error('storage unavailable')
        handoff = { ...handoff, ...value }
      },
      remove: async (key) => {
        if (failNextStorageRemove) {
          failNextStorageRemove = false
          throw new Error('remove unavailable')
        }
        delete handoff[key]
      }
    }
  },
  tabs: {
    create: async (options) => { createdTabs.push(options); return { id: createdTabs.length } },
    query: async () => []
  },
  scripting: { executeScript: async () => [{ result: null }] }
}

require(path.resolve(__dirname, '..', 'background.js'))

function makeTransfer(transferId = 'transfer-0001') {
  return {
    version: 1,
    transferId,
    prompt: 'analysis prompt',
    platform: 'X POST',
    width: 1200,
    height: 800,
    sourceTabId: 12,
    savedAt: Date.now(),
    imageMode: 'clipboard',
    status: 'photo_reserving'
  }
}

function sendMessage(message) {
  return new Promise((resolve) => {
    const keepAlive = listeners.message(message, {}, resolve)
    assert.equal(keepAlive, true)
  })
}

function flushAsyncWork() {
  return new Promise((resolve) => setImmediate(() => setImmediate(resolve)))
}

function gateNextStorageGet() {
  let release
  let markStarted
  const wait = new Promise((resolve) => { release = resolve })
  const started = new Promise((resolve) => { markStarted = resolve })
  storageGetGate = { wait, started: markStarted }
  return { waitUntilStarted: started, release }
}

test.beforeEach(() => {
  handoff = {}
  downloads.clear()
  createdTabs.length = 0
  downloadRequests.length = 0
  nextDownloadState = 'in_progress'
  failingStorageSetCalls = new Set()
  storageGetGate = null
  failNextStorageRemove = false
})

test('reserves one handoff and rejects a different unfinished transfer', async () => {
  const first = await sendMessage({ type: 'SAVE_HANDOFF', transfer: makeTransfer('transfer-0001') })
  const second = await sendMessage({ type: 'SAVE_HANDOFF', transfer: makeTransfer('transfer-0002') })

  assert.equal(first.ok, true)
  assert.equal(second.ok, false)
  assert.equal(second.error, 'HANDOFF_IN_PROGRESS')
  assert.equal(handoff.lumenTraceHandoff.transferId, 'transfer-0001')
})

test('background owns fallback state and opens only one ChatGPT tab after completion', async () => {
  const transfer = makeTransfer()
  await sendMessage({ type: 'SAVE_HANDOFF', transfer })
  const response = await sendMessage({
    type: 'DOWNLOAD_PNG_FALLBACK',
    dataUrl: 'data:image/png;base64,cG5n',
    filename: 'Lumen-Trace-2026-08-30.png',
    transfer
  })

  assert.equal(response.ok, true)
  assert.equal(handoff.lumenTraceHandoff.status, 'download_pending')
  assert.equal(handoff.lumenTraceHandoff.downloadId, response.downloadId)

  downloads.get(response.downloadId).state = 'complete'
  listeners.downloadChanged({ id: response.downloadId, state: { current: 'complete' } })
  listeners.downloadChanged({ id: response.downloadId, state: { current: 'complete' } })
  await flushAsyncWork()

  assert.equal(handoff.lumenTraceHandoff.status, 'photo_downloaded')
  assert.equal(handoff.lumenTraceHandoff.imageMode, 'download')
  assert.deepEqual(createdTabs, [{ url: 'https://chatgpt.com/' }])
})

test('downloads an Instagram Story source without storing its signed URL', async () => {
  const transfer = { ...makeTransfer(), platform: 'IG STORY' }
  const sourceUrl = 'https://scontent-lax3-1.cdninstagram.com/v/t51/photo.webp?sig=secret'
  await sendMessage({ type: 'SAVE_HANDOFF', transfer })
  const response = await sendMessage({
    type: 'DOWNLOAD_SOURCE_HANDOFF',
    sourceUrl,
    filename: 'Lumen-Trace-IG-Story-2026-08-30.webp',
    transfer
  })

  assert.equal(response.ok, true)
  assert.equal(downloadRequests[0].url, sourceUrl)
  assert.equal(handoff.lumenTraceHandoff.sourceUrl, undefined)
  assert.equal(handoff.lumenTraceHandoff.status, 'download_pending')

  downloads.get(response.downloadId).state = 'complete'
  listeners.downloadChanged({ id: response.downloadId, state: { current: 'complete' } })
  await flushAsyncWork()
  assert.equal(handoff.lumenTraceHandoff.status, 'photo_downloaded')
  assert.deepEqual(createdTabs, [{ url: 'https://chatgpt.com/' }])
})

test('rejects arbitrary source hosts and non-Story source transfers', async () => {
  const story = { ...makeTransfer(), platform: 'IG STORY' }
  const evil = await sendMessage({
    type: 'DOWNLOAD_SOURCE_HANDOFF',
    sourceUrl: 'https://evil.example/photo.jpg',
    filename: 'Lumen-Trace-IG-Story-2026-08-30.jpg',
    transfer: story
  })
  const post = await sendMessage({
    type: 'DOWNLOAD_SOURCE_HANDOFF',
    sourceUrl: 'https://scontent.cdninstagram.com/photo.jpg',
    filename: 'Lumen-Trace-IG-Story-2026-08-30.jpg',
    transfer: makeTransfer()
  })

  assert.equal(evil.error, 'INVALID_DOWNLOAD_REQUEST')
  assert.equal(post.error, 'INVALID_DOWNLOAD_REQUEST')
  assert.equal(downloadRequests.length, 0)
})

test('loads without a downloads API and reports a supported Safari fallback', async () => {
  const downloadsApi = chrome.downloads
  chrome.downloads = undefined
  try {
    const transfer = { ...makeTransfer(), platform: 'IG STORY' }
    const response = await sendMessage({
      type: 'DOWNLOAD_SOURCE_HANDOFF',
      sourceUrl: 'https://scontent.cdninstagram.com/photo.jpg',
      filename: 'Lumen-Trace-IG-Story-2026-08-30.jpg',
      transfer
    })
    assert.equal(response.ok, false)
    assert.equal(response.error, 'DOWNLOADS_UNAVAILABLE')
    assert.equal(response.started, false)
  } finally {
    chrome.downloads = downloadsApi
  }
})

test('rejects a completed Story download that redirects off the allowlist or is not an image', async () => {
  for (const invalid of [
    { finalUrl: 'https://evil.example/photo.jpg', mime: 'image/jpeg' },
    { finalUrl: 'https://scontent.cdninstagram.com/error.jpg', mime: 'text/html' }
  ]) {
    const transfer = { ...makeTransfer(`transfer-${Math.random().toString(36).slice(2, 10)}`), platform: 'IG STORY' }
    const response = await sendMessage({
      type: 'DOWNLOAD_SOURCE_HANDOFF',
      sourceUrl: 'https://scontent.cdninstagram.com/photo.jpg?sig=valid',
      filename: 'Lumen-Trace-IG-Story-2026-08-30.jpg',
      transfer
    })
    Object.assign(downloads.get(response.downloadId), invalid, { state: 'complete' })
    listeners.downloadChanged({ id: response.downloadId, state: { current: 'complete' } })
    await flushAsyncWork()
    assert.equal(handoff.lumenTraceHandoff.status, 'download_failed')
    assert.equal(createdTabs.length, 0)
    handoff = {}
  }
})

test('refresh recovers a uniquified filename after a failed download-id write', async () => {
  const transfer = makeTransfer()
  await sendMessage({ type: 'SAVE_HANDOFF', transfer })
  failingStorageSetCalls.add(storageSetCount + 2)
  const response = await sendMessage({
    type: 'DOWNLOAD_PNG_FALLBACK',
    dataUrl: 'data:image/png;base64,cG5n',
    filename: 'Lumen-Trace-2026-08-30.png',
    transfer
  })

  assert.equal(response.ok, true)
  assert.equal(response.tracking, 'event_recovery')
  assert.equal(handoff.lumenTraceHandoff.status, 'download_starting')
  assert.equal(handoff.lumenTraceHandoff.downloadId, undefined)

  failingStorageSetCalls = new Set()
  downloads.get(response.downloadId).filename = '/Downloads/Lumen-Trace-2026-08-30 (1).png'
  downloads.get(response.downloadId).state = 'complete'
  const recovered = await sendMessage({ type: 'REFRESH_DOWNLOAD_STATUS' })

  assert.equal(recovered.ok, true)
  assert.equal(recovered.recovered, true)
  assert.equal(handoff.lumenTraceHandoff.status, 'photo_downloaded')
  assert.equal(createdTabs.length, 1)
})

test('popup refresh retries terminal persistence after a transient failure', async () => {
  const transfer = makeTransfer()
  await sendMessage({ type: 'SAVE_HANDOFF', transfer })
  const response = await sendMessage({
    type: 'DOWNLOAD_PNG_FALLBACK',
    dataUrl: 'data:image/png;base64,cG5n',
    filename: 'Lumen-Trace-2026-08-30.png',
    transfer
  })
  downloads.get(response.downloadId).state = 'complete'
  failingStorageSetCalls.add(storageSetCount + 1)
  listeners.downloadChanged({ id: response.downloadId, state: { current: 'complete' } })
  await flushAsyncWork()

  assert.equal(handoff.lumenTraceHandoff.status, 'download_pending')
  assert.equal(createdTabs.length, 0)

  failingStorageSetCalls = new Set()
  const recovered = await sendMessage({ type: 'REFRESH_DOWNLOAD_STATUS' })
  assert.equal(recovered.ok, true)
  assert.equal(handoff.lumenTraceHandoff.status, 'photo_downloaded')
  assert.equal(createdTabs.length, 1)
})

test('interrupted fallback is visible and does not open ChatGPT', async () => {
  const transfer = makeTransfer()
  await sendMessage({ type: 'SAVE_HANDOFF', transfer })
  const response = await sendMessage({
    type: 'DOWNLOAD_PNG_FALLBACK',
    dataUrl: 'data:image/png;base64,cG5n',
    filename: 'Lumen-Trace-2026-08-30.png',
    transfer
  })
  downloads.get(response.downloadId).state = 'interrupted'
  listeners.downloadChanged({ id: response.downloadId, state: { current: 'interrupted' } })
  await flushAsyncWork()

  assert.equal(handoff.lumenTraceHandoff.status, 'download_failed')
  assert.equal(createdTabs.length, 0)

  const replacement = await sendMessage({ type: 'SAVE_HANDOFF', transfer: makeTransfer('transfer-0002') })
  assert.equal(replacement.ok, true)
  assert.equal(handoff.lumenTraceHandoff.transferId, 'transfer-0002')
})

test('background catches a download completed before listener observation', async () => {
  const transfer = makeTransfer()
  await sendMessage({ type: 'SAVE_HANDOFF', transfer })
  nextDownloadState = 'complete'
  const response = await sendMessage({
    type: 'DOWNLOAD_PNG_FALLBACK',
    dataUrl: 'data:image/png;base64,cG5n',
    filename: 'Lumen-Trace-2026-08-30.png',
    transfer
  })

  assert.equal(response.ok, true)
  assert.equal(handoff.lumenTraceHandoff.status, 'photo_downloaded')
  assert.deepEqual(createdTabs, [{ url: 'https://chatgpt.com/' }])
})

test('abandoning A while its completion is pending cannot overwrite a new B handoff', async () => {
  const transferA = makeTransfer('transfer-0001')
  await sendMessage({ type: 'SAVE_HANDOFF', transfer: transferA })
  const download = await sendMessage({
    type: 'DOWNLOAD_PNG_FALLBACK',
    dataUrl: 'data:image/png;base64,cG5n',
    filename: 'Lumen-Trace-2026-08-30.png',
    transfer: transferA
  })
  downloads.get(download.downloadId).state = 'complete'

  const gate = gateNextStorageGet()
  listeners.downloadChanged({ id: download.downloadId, state: { current: 'complete' } })
  await gate.waitUntilStarted
  const clearA = sendMessage({ type: 'CLEAR_HANDOFF', transferId: transferA.transferId })
  const saveB = sendMessage({ type: 'SAVE_HANDOFF', transfer: makeTransfer('transfer-0002') })
  gate.release()
  await Promise.all([clearA, saveB])
  await flushAsyncWork()

  assert.equal(handoff.lumenTraceHandoff.transferId, 'transfer-0002')
  assert.equal(handoff.lumenTraceHandoff.status, 'photo_reserving')
  assert.equal(createdTabs.length, 0)
})

test('prompt cleanup failure stores no prompt and refresh removes the tombstone', async () => {
  const transfer = { ...makeTransfer(), status: 'photo_copied' }
  await sendMessage({ type: 'SAVE_HANDOFF', transfer })
  failNextStorageRemove = true

  const completed = await sendMessage({ type: 'COMPLETE_HANDOFF', transferId: transfer.transferId })
  assert.equal(completed.ok, true)
  assert.equal(completed.cleaned, false)
  assert.equal(completed.tombstoned, true)
  assert.deepEqual(handoff.lumenTraceHandoff, {
    version: 1,
    transferId: transfer.transferId,
    savedAt: handoff.lumenTraceHandoff.savedAt,
    status: 'prompt_copied'
  })
  assert.equal(handoff.lumenTraceHandoff.prompt, undefined)

  const refreshed = await sendMessage({ type: 'REFRESH_DOWNLOAD_STATUS' })
  assert.equal(refreshed.cleanupRetried, true)
  assert.equal(handoff.lumenTraceHandoff, undefined)
})
