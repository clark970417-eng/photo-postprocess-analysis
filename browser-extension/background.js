const ANALYZER = 'https://lumen-stage.vercel.app/analyze'
const SUPPORTED_PAGES = ['https://x.com/*', 'https://twitter.com/*', 'https://www.instagram.com/*']

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'lumen-analyze-image',
    title: '在 Lumen Trace 網站開啟這張圖片',
    contexts: ['image'],
    documentUrlPatterns: SUPPORTED_PAGES
  })
  chrome.contextMenus.create({
    id: 'lumen-analyze-post',
    title: '在 Lumen Trace 網站開啟貼文主圖',
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
