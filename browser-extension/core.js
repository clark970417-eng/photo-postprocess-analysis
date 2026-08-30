(function exposeLumenTraceCore(root, factory) {
  const api = factory()
  if (typeof module === 'object' && module.exports) module.exports = api
  root.LumenTraceCore = api
})(typeof globalThis !== 'undefined' ? globalThis : this, function createLumenTraceCore() {
  const SUPPORTED_PAGE = /^https:\/\/(x\.com|twitter\.com|www\.instagram\.com)\//i
  const CHATGPT_PAGE = /^https:\/\/(chatgpt\.com|chat\.openai\.com)\//i
  const TRANSFER_TTL_MS = 30 * 60 * 1000

  function buildAnalysisPrompt(metadata = {}) {
    const source = metadata.platform || '社群貼文'
    const width = metadata.width || '未知'
    const height = metadata.height || '未知'

    return `請用繁體中文分析我附上的同一張照片，逆向推測它可能採用的後期手法。請分析可見結果，不要把無法由成品證明的 RAW 數值、相機描述檔、預設、圖層堆疊或插件名稱說成事實。

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

收到圖片時，第一行固定輸出「LUMEN_TRACE_READY v0.3｜已收到圖片」。若圖片尚未附上，只輸出「LUMEN_TRACE_NEEDS_IMAGE」，不要憑這段文字開始猜測。`
  }

  function calculateCropBox(rect, viewportWidth, viewportHeight, bitmapWidth, bitmapHeight) {
    const values = [rect?.x, rect?.y, rect?.width, rect?.height, viewportWidth, viewportHeight, bitmapWidth, bitmapHeight]
    if (values.some((value) => !Number.isFinite(value)) || rect.width < 8 || rect.height < 8 || viewportWidth <= 0 || viewportHeight <= 0 || bitmapWidth <= 0 || bitmapHeight <= 0) {
      throw new Error('無法定位圖片')
    }

    const scaleX = bitmapWidth / viewportWidth
    const scaleY = bitmapHeight / viewportHeight
    const sourceX = Math.min(bitmapWidth - 1, Math.max(0, Math.round(rect.x * scaleX)))
    const sourceY = Math.min(bitmapHeight - 1, Math.max(0, Math.round(rect.y * scaleY)))
    const sourceWidth = Math.min(bitmapWidth - sourceX, Math.max(1, Math.round(rect.width * scaleX)))
    const sourceHeight = Math.min(bitmapHeight - sourceY, Math.max(1, Math.round(rect.height * scaleY)))
    return { sourceX, sourceY, sourceWidth, sourceHeight }
  }

  function getFreshTransfer(value, now = Date.now()) {
    if (!value || typeof value.prompt !== 'string' || !value.prompt.trim() || !Number.isFinite(value.savedAt)) return null
    if (now < value.savedAt || now - value.savedAt > TRANSFER_TTL_MS) return null
    return value
  }

  function createTransfer(metadata, prompt, now = Date.now(), imageMode = 'clipboard') {
    return {
      version: 1,
      prompt,
      platform: metadata.platform || '社群貼文',
      width: metadata.width || null,
      height: metadata.height || null,
      sourceTabId: Number.isInteger(metadata.tabId) ? metadata.tabId : null,
      savedAt: now,
      imageMode,
      status: 'photo_copied'
    }
  }

  function classifyPage(url = '') {
    if (SUPPORTED_PAGE.test(url)) return 'source'
    if (CHATGPT_PAGE.test(url)) return 'chatgpt'
    return 'unsupported'
  }

  function makeDownloadFilename(now = new Date()) {
    const stamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').replace('Z', '')
    return `Lumen-Trace-${stamp}.png`
  }

  return {
    CHATGPT_PAGE,
    SUPPORTED_PAGE,
    TRANSFER_TTL_MS,
    buildAnalysisPrompt,
    calculateCropBox,
    classifyPage,
    createTransfer,
    getFreshTransfer,
    isChatGPTPage: (url = '') => CHATGPT_PAGE.test(url),
    isSupportedPage: (url = '') => SUPPORTED_PAGE.test(url),
    makeDownloadFilename
  }
})
