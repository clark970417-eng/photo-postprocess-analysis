# Lumen Trace 瀏覽器擴充功能（Opera GX）

## Opera GX 安裝方式

1. 解壓縮下載的 `Lumen-Trace-Opera-GX-0.2.0.zip`。
2. 在 Opera GX 網址列輸入 `opera:extensions`，按 Enter。
3. 開啟頁面右上方的「開發人員模式」。
4. 選擇「載入未封裝的擴充功能」（Load unpacked）。
5. 指定解壓後、裡面直接看得到 `manifest.json` 的 `Lumen-Trace-Opera-GX-0.2.0` 資料夾。
6. 將 Lumen Trace 固定在工具列。

若重新開啟 Opera GX 後出現開發者模式提醒，保留並啟用 Lumen Trace 即可。

## Chrome／Edge 安裝方式

1. 開啟瀏覽器的「管理擴充功能」。
2. 開啟「開發人員模式」。
3. 選擇「載入未封裝項目」，指定解壓後的擴充功能資料夾。
4. 將 Lumen Trace 固定在工具列。

## 使用方式（免 API）

1. 停在 X 或 Instagram 的圖片貼文，點工具列上的 Lumen Trace；它會挑選目前畫面中最主要的貼文圖片。
2. 按「用 ChatGPT 分析」。擴充功能會在本機裁切畫面中可見的貼文照片，並把圖片與依據 Photo Post-Process Analysis 證據框架撰寫的繁中提示一起放入剪貼簿，再開啟 ChatGPT。
3. 在 ChatGPT 按 `⌘V`（Windows / Linux 為 `Ctrl+V`）貼上並送出。擴充功能不會在你貼上之前上傳照片，也不會讀取或操作 ChatGPT 頁面。若瀏覽器無法將圖片放入剪貼簿，會改為複製提示，圖片則由你手動上傳。

「在網站開啟」、圖片右鍵選單與快捷鍵（macOS `⌘⇧L`，Windows / Linux `Alt+Shift+L`）會把來源圖片載入 Lumen Trace 網站，但不會自動送出 API 分析，因此沒有 API 金鑰也不會立刻跳出 API 錯誤。

擴充功能只在使用者點擊時取得目前頁面的圖片網址，不讀取 Cookie、帳號、私訊或瀏覽紀錄，也不會把 API 金鑰存進擴充功能。

## 權限說明

- `activeTab`：只在你點擊按鈕或快捷鍵時存取目前分頁。
- `clipboardWrite`：只在你按「用 ChatGPT 分析」時，把畫面中的貼文照片與專業分析提示寫入剪貼簿。
- `contextMenus`：在 X／Instagram 的圖片右鍵選單加入分析入口。
- `scripting`：尋找目前貼文中畫面最大的圖片。

擴充功能不要求瀏覽紀錄、Cookie、密碼、下載內容或所有網站的常駐存取權。
