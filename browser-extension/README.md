# Lumen Trace 瀏覽器擴充功能（Opera GX）

## Opera GX 安裝方式

1. 解壓縮下載的 `Lumen-Trace-Opera-GX-0.1.0.zip`。
2. 在 Opera GX 網址列輸入 `opera:extensions`，按 Enter。
3. 開啟頁面右上方的「開發人員模式」。
4. 選擇「載入未封裝的擴充功能」（Load unpacked）。
5. 指定解壓後、裡面直接看得到 `manifest.json` 的 `Lumen-Trace-Opera-GX-0.1.0` 資料夾。
6. 將 Lumen Trace 固定在工具列。

若重新開啟 Opera GX 後出現開發者模式提醒，保留並啟用 Lumen Trace 即可。

## Chrome／Edge 安裝方式

1. 開啟瀏覽器的「管理擴充功能」。
2. 開啟「開發人員模式」。
3. 選擇「載入未封裝項目」，指定解壓後的擴充功能資料夾。
4. 將 Lumen Trace 固定在工具列。

## 使用方式

- 在 X 或 Instagram 對圖片按右鍵，選擇「用 Lumen Trace 分析這張圖片」。
- 或停在貼文畫面，點工具列的 Lumen Trace；它會挑選畫面中最大的貼文圖片。
- 快捷鍵：macOS 為 `⌘⇧L`，Windows / Linux 為 `Alt+Shift+L`。

擴充功能只在使用者點擊時取得目前頁面的圖片網址，不讀取 Cookie、帳號、私訊或瀏覽紀錄。分析由 `https://lumen-stage.vercel.app/analyze` 執行。

## 權限說明

- `activeTab`：只在你點擊按鈕或快捷鍵時存取目前分頁。
- `contextMenus`：在 X／Instagram 的圖片右鍵選單加入分析入口。
- `scripting`：尋找目前貼文中畫面最大的圖片。

擴充功能不要求瀏覽紀錄、Cookie、密碼、下載內容或所有網站的常駐存取權。
