const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const test = require('node:test')

const core = require('../core.js')
const extensionRoot = path.resolve(__dirname, '..')

test('classifies supported source pages', () => {
  assert.equal(core.classifyPage('https://x.com/user/status/1'), 'source')
  assert.equal(core.classifyPage('https://www.instagram.com/p/abc/'), 'source')
})

test('classifies ChatGPT without granting it host access', () => {
  assert.equal(core.classifyPage('https://chatgpt.com/'), 'chatgpt')
  assert.equal(core.classifyPage('https://chatgpt.com/c/123'), 'chatgpt')
})

test('rejects unrelated and lookalike hosts', () => {
  assert.equal(core.classifyPage('https://example.com/'), 'unsupported')
  assert.equal(core.classifyPage('https://x.com.evil.example/status/1'), 'unsupported')
})

test('analysis prompt carries evidence rules and a visible version handshake', () => {
  const prompt = core.buildAnalysisPrompt({ platform: 'X POST', width: 1600, height: 1067 })
  assert.match(prompt, /觀察.*推論.*其他解釋.*信心/s)
  assert.match(prompt, /Lightroom Classic／Adobe Camera Raw/)
  assert.match(prompt, /LUMEN_TRACE_READY v0\.5\.0/)
  assert.match(prompt, /1600 × 1067/)
})

test('crop box accounts for device-pixel scaling', () => {
  assert.deepEqual(
    core.calculateCropBox({ x: 100, y: 50, width: 300, height: 200 }, 1000, 500, 2000, 1000),
    { sourceX: 200, sourceY: 100, sourceWidth: 600, sourceHeight: 400 }
  )
})

test('crop box clamps to bitmap bounds', () => {
  assert.deepEqual(
    core.calculateCropBox({ x: 950, y: 480, width: 100, height: 80 }, 1000, 500, 2000, 1000),
    { sourceX: 1900, sourceY: 960, sourceWidth: 100, sourceHeight: 40 }
  )
})

test('crop box rejects invalid geometry', () => {
  assert.throws(() => core.calculateCropBox({ x: 0, y: 0, width: 2, height: 2 }, 100, 100, 200, 200))
})

test('handoff record stores no source URL or image bytes', () => {
  const record = core.createTransfer({ platform: 'X POST', width: 1000, height: 700, tabId: 42, url: 'https://secret.example/image' }, 'prompt', 100, 'clipboard')
  assert.deepEqual(Object.keys(record).sort(), ['height', 'imageMode', 'platform', 'prompt', 'savedAt', 'sourceTabId', 'status', 'transferId', 'version', 'width'])
  assert.match(record.transferId, /^[a-zA-Z0-9-]{8,80}$/)
  assert.equal(record.sourceTabId, 42)
  assert.equal(record.imageMode, 'clipboard')
})

test('handoff remains fresh for thirty minutes only', () => {
  const record = core.createTransfer({}, 'prompt', 1_000)
  assert.equal(core.getFreshTransfer(record, 1_000 + core.TRANSFER_TTL_MS), record)
  assert.equal(core.getFreshTransfer(record, 1_001 + core.TRANSFER_TTL_MS), null)
  assert.equal(core.getFreshTransfer(record, 999), null)
})

test('an unfinished photo reservation expires after two minutes', () => {
  const record = { ...core.createTransfer({}, 'prompt', 1_000), status: 'photo_reserving' }
  assert.equal(core.getFreshTransfer(record, 1_000 + core.RESERVATION_TTL_MS), record)
  assert.equal(core.getFreshTransfer(record, 1_001 + core.RESERVATION_TTL_MS), null)
})

test('download name is deterministic and filesystem-safe', () => {
  assert.equal(core.makeDownloadFilename(new Date('2026-08-30T04:03:02.001Z')), 'Lumen-Trace-2026-08-30_04-03-02-001.png')
})

test('source download name preserves supported served formats and rejects unknown formats', () => {
  const now = new Date('2026-08-30T04:03:02.001Z')
  assert.equal(
    core.makeSourceDownloadFilename('IG STORY', 'https://scontent.cdninstagram.com/photo.webp?sig=1', now),
    'Lumen-Trace-IG-Story-2026-08-30_04-03-02-001.webp'
  )
  assert.equal(core.makeSourceDownloadFilename('IG STORY', 'https://scontent.cdninstagram.com/photo?sig=1', now), null)
})

test('manifest adds session storage but no ChatGPT host permission', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'manifest.json'), 'utf8'))
  assert.equal(manifest.version, '0.5.0')
  assert.ok(manifest.permissions.includes('storage'))
  assert.ok(manifest.permissions.includes('downloads'))
  assert.equal(manifest.host_permissions, undefined)
  assert.equal(manifest.optional_host_permissions, undefined)
  assert.equal(manifest.content_scripts, undefined)
  assert.equal(manifest.browser_specific_settings.safari.strict_min_version, '16.4')
  const popup = fs.readFileSync(path.join(extensionRoot, 'popup.js'), 'utf8')
  assert.match(popup, /chrome\.storage\.session/)
  assert.doesNotMatch(popup, /chrome\.storage\.local/)
  assert.match(popup, /type: 'CLEAR_HANDOFF'/)
})

test('clipboard implementation never combines PNG with text/plain', () => {
  const popup = fs.readFileSync(path.join(extensionRoot, 'popup.js'), 'utf8')
  const pngItem = popup.match(/new ClipboardItem\(([^\n]+(?:\n[^\n]+){0,2})/g)?.join('\n') || ''
  assert.match(popup, /'image\/png': blob/)
  assert.doesNotMatch(pngItem, /text\/plain/)
  assert.doesNotMatch(popup, /copyPhotoAndPrompt/)
})

test('download fallback waits for a completed browser download', () => {
  const background = fs.readFileSync(path.join(extensionRoot, 'background.js'), 'utf8')
  assert.match(background, /chrome\.downloads\.download/)
  assert.match(background, /delta\.state\.current !== 'complete'/)
  assert.match(background, /delta\.state\.current !== 'interrupted'/)
  assert.match(background, /makeTransferRecord\(record, 'photo_downloaded', 'download'\)/)
  assert.match(background, /finalizingDownloads\.has\(downloadId\)/)
  assert.match(background, /REFRESH_DOWNLOAD_STATUS/)
  assert.match(background, /filenameMatches\(item\.filename, record\.filename\)/)
  assert.match(background, /serializeHandoff\(\(\) => finalizeFallbackDownload/)
  assert.doesNotMatch(background, /link\.click\(\)/)
})

test('Instagram Story uses a direct source download with a PNG fallback', () => {
  const popup = fs.readFileSync(path.join(extensionRoot, 'popup.js'), 'utf8')
  const background = fs.readFileSync(path.join(extensionRoot, 'background.js'), 'utf8')
  assert.match(popup, /\/stories\\\/\//)
  assert.match(popup, /NO RE-ENCODE/)
  assert.match(popup, /DOWNLOAD_SOURCE_HANDOFF/)
  assert.match(popup, /PNG 備援/)
  assert.match(popup, /elementsFromPoint/)
  assert.match(popup, /aria-hidden="true"/)
  assert.match(popup, /getComputedStyle/)
  assert.match(background, /validInstagramSourceUrl/)
  assert.match(background, /cdninstagram\.com/)
  assert.match(background, /fbcdn\.net/)
  assert.match(background, /chrome\.downloads\?\.onChanged\?\.addListener/)
  assert.match(background, /DOWNLOADS_UNAVAILABLE/)
  assert.match(popup, /Safari 不提供擴充功能下載 API/)
})

test('prompt copying is gated by an explicit thumbnail confirmation', () => {
  const popup = fs.readFileSync(path.join(extensionRoot, 'popup.js'), 'utf8')
  const html = fs.readFileSync(path.join(extensionRoot, 'popup.html'), 'utf8')
  assert.match(html, /id="photoConfirmed" type="checkbox"/)
  assert.match(popup, /!photoConfirmed\.checked/)
  assert.match(popup, /確認縮圖後複製提示/)
  assert.match(popup, /transfer\.status === 'photo_reserving'/)
  assert.match(popup, /abandon_handoff/)
  assert.match(popup, /type: 'COMPLETE_HANDOFF'/)
})
