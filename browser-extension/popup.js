const ANALYZER = 'https://lumen-stage.vercel.app/analyze'
const SUPPORTED_PAGE = /^https:\/\/(x\.com|twitter\.com|www\.instagram\.com)\//i

const preview = document.querySelector('#preview')
const imageStage = document.querySelector('#imageStage')
const emptyState = document.querySelector('#emptyState')
const emptyTitle = document.querySelector('#emptyTitle')
const emptyHint = document.querySelector('#emptyHint')
const sourceLabel = document.querySelector('#sourceLabel')
const statusDot = document.querySelector('#statusDot')
const dimensions = document.querySelector('#dimensions')
const analyzeButton = document.querySelector('#analyzeButton')
const message = document.querySelector('#message')

let selectedImage = null

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
  return {
    url: image.currentSrc || image.src || null,
    width: image.naturalWidth || Math.round(image.getBoundingClientRect().width),
    height: image.naturalHeight || Math.round(image.getBoundingClientRect().height)
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
  preview.referrerPolicy = 'no-referrer'
  preview.src = result.url
  preview.hidden = false
  preview.addEventListener('load', () => imageStage.classList.add('ready'), { once: true })
  emptyState.hidden = true
  sourceLabel.textContent = platform
  statusDot.classList.add('ready')
  dimensions.textContent = `${result.width || '—'} × ${result.height || '—'}`
  analyzeButton.disabled = false
  message.classList.remove('error')
  message.textContent = '已鎖定目前畫面中最主要的貼文照片。'
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

analyzeButton.addEventListener('click', () => {
  if (!selectedImage) return
  const url = new URL(ANALYZER)
  url.searchParams.set('source', selectedImage)
  url.searchParams.set('autostart', '1')
  chrome.tabs.create({ url: url.toString() })
  window.close()
})

void detectImage()
