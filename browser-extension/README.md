# Lumen Trace 瀏覽器擴充功能

同一份 Manifest V3 原始碼支援：

- Google Chrome
- Opera GX
- macOS Safari 16.4 以上

## Chrome 安裝方式

1. 解壓縮 `Lumen-Trace-Chrome-Opera-0.5.0.zip`。
2. 在網址列輸入 `chrome://extensions`。
3. 開啟「開發人員模式」。
4. 按「載入未封裝項目」，選擇裡面直接看得到 `manifest.json` 的資料夾。
5. 從拼圖選單把 Lumen Trace 固定到工具列。

## Opera GX 安裝方式

1. 解壓縮下載的 `Lumen-Trace-Chrome-Opera-0.5.0.zip`。
2. 在 Opera GX 網址列輸入 `opera:extensions`，按 Enter。
3. 開啟頁面右上方的「開發人員模式」。
4. 選擇「載入未封裝的擴充功能」（Load unpacked）。
5. 指定解壓後、裡面直接看得到 `manifest.json` 的資料夾。
6. 將 Lumen Trace 固定在工具列。

若重新開啟 Opera GX 後出現開發者模式提醒，保留並啟用 Lumen Trace 即可。

## Safari 安裝方式（Safari 16.4+，macOS 測試安裝）

1. 在 Safari 選擇「Safari → 設定 → 進階」，開啟網頁開發者功能。
2. 進入「開發者」分頁，按「加入暫時擴充功能…」（Add Temporary Extension…）。
3. 選擇 `browser-extension` 資料夾或其 ZIP，並在 Safari 的「擴充功能」設定中啟用 Lumen Trace。
4. 依網站授權 X、Instagram 與 ChatGPT 的存取範圍。

Safari 會在 24 小時後或 Safari 結束時移除暫時擴充功能。若要長期安裝、提供 iPhone／iPad 版本或上架 App Store，需要用完整 Xcode 的 `safari-web-extension-packager` 建立並簽署 Safari App。這台專案目前只包含跨瀏覽器 WebExtension 原始碼，不包含 Apple 憑證或簽署成品。

官方文件：[Chrome 載入未封裝擴充功能](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked)、[Safari 暫時安裝與測試](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension)、[Safari 正式打包](https://developer.apple.com/documentation/safariservices/packaging-a-web-extension-for-safari)。

### Safari 功能差異

Safari 支援照片偵測、可見畫面 PNG、ChatGPT 交接與分析提示；最低版本設為 Safari 16.4，因為交接使用 `storage.session`。Apple 的 Safari Web Extension 不提供 `downloads` API，所以：

- Chrome／Opera GX：IG 限動可使用「原畫質下載並交接」。
- Safari：IG 限動自動改成「複製限動照片」PNG 流程，不會顯示一個無法完成的來源檔下載按鈕。
- Safari 若無法寫入圖片剪貼簿，不提供背景下載備援，請重新授權剪貼簿或改用網站入口。

## 使用方式（免 API）

### X／Instagram 一般貼文

1. 停在 X 或 Instagram 的圖片貼文，點工具列上的 Lumen Trace；它會挑選目前畫面中最主要的貼文圖片。
2. 按「複製照片」。擴充功能會在本機裁切畫面中可見的照片，剪貼簿只放 `image/png`，不混入文字。成功後按「開啟 ChatGPT」。
3. 在 ChatGPT 按 `⌘V`（Windows / Linux 為 `Ctrl+V`），先確認輸入框上方真的出現照片縮圖。此時不要送出。
4. 在 ChatGPT 分頁再點一次 Lumen Trace。只有勾選「我已在 ChatGPT 看到照片縮圖」後，才會解鎖「複製分析提示」；回輸入框再按一次 `⌘V`。確認照片縮圖與分析提示同時存在後，再由你送出。

### Instagram 限動照片

1. 打開要分析的限時動態，等照片完整顯示後點 Lumen Trace。
2. Chrome／Opera GX 按「原畫質下載並交接」；Safari 按「複製限動照片」。
3. Chrome／Opera GX 在 ChatGPT 用迴紋針上傳最新的 `Lumen-Trace-IG-Story-*` 圖片；Safari 在 ChatGPT 貼上 PNG。看到縮圖後再開一次 Lumen Trace。
4. 勾選縮圖確認，複製分析提示並貼回輸入框，確認照片與文字都存在後再送出。

為避免 A 照片誤配到 B 提示，擴充功能一次只保留一組未完成交接；完成第 4 步、交接過期，或短暫的照片準備保留逾時後，才能開始下一張。

若 Opera 無法把圖片寫入剪貼簿，擴充功能會觸發一張 `Lumen-Trace-*.png` 的下載，並請你先確認下載項目，再到 ChatGPT 用迴紋針上傳。它不會把「只複製到文字」誤報成照片成功。若下載被取消、下載紀錄遭清除或長時間沒有完成，可在 ChatGPT 再開啟 Lumen Trace，選「放棄下載並回貼文」，立即清除後重新開始。

Instagram 限動照片會優先使用「原畫質下載並交接」：擴充功能把 Instagram 當下實際提供給瀏覽器的 JPEG、PNG、WebP 或 AVIF 交給 Opera 下載，不截圖，也不再次縮放或重新編碼。這代表下載檔不會再被擴充功能吃畫質；但 Instagram 在上傳或傳送前可能已壓縮，因此它不是上傳者相機裡的原始檔。若來源網址過期或限動已切換，可立即改用畫面 PNG 備援。

「連圖片網址在網站開啟」、圖片右鍵選單與快捷鍵（macOS `⌘⇧L`，Windows / Linux `Alt+Shift+L`）會把目前頁面的來源圖片網址放進 Lumen Trace 網頁的 query string；Instagram 等來源網址可能包含存取或簽名參數，也可能出現在瀏覽器紀錄與網站請求紀錄。它不會自動送出 API 分析，因此沒有 API 金鑰也不會立刻跳出 API 錯誤。若不希望傳送來源網址，請使用上方的 ChatGPT 剪貼簿流程。

擴充功能只在使用者點擊時取得目前頁面的圖片網址，不讀取 Cookie、帳號、私訊或瀏覽紀錄，也不會把 API 金鑰存進擴充功能。

## 權限說明

- `activeTab`：只在你點擊按鈕或快捷鍵時存取目前分頁。
- `clipboardWrite`：只在你主動執行對應步驟時，分別寫入純 PNG 或分析提示。
- `contextMenus`：在 X／Instagram 的圖片右鍵選單加入分析入口。
- `downloads`：Chrome／Opera GX 在 IG 限動的原來源檔交接，或圖片剪貼簿失敗的 PNG 備援時使用；收到瀏覽器的完成狀態後才開啟 ChatGPT。Safari 不提供此 API，程式會自動停用相關按鈕與背景流程。
- `scripting`：尋找目前貼文中畫面最大的圖片。
- `storage`：在瀏覽器記憶體保存唯一交接編號、分析提示、平台、尺寸、來源分頁 ID、交接模式、狀態與時間戳；下載時另存自產檔名與下載 ID，讓背景服務重啟後仍能恢復。IG 的簽名圖片網址只交給 Opera 當次下載，不寫入交接紀錄。它不保存照片、來源圖片網址或 ChatGPT 對話。交接的有效期為 30 分鐘，尚未取得照片的準備保留只維持 2 分鐘；成功複製提示後會先嘗試刪除整筆紀錄。若刪除暫時失敗，會改存一筆不含提示文字的空白清除標記，並在下次開啟時重試；若儲存空間當下完全不可用，原紀錄仍會在期限後失效。瀏覽器／擴充功能 session 結束時也會清除 session 紀錄。

擴充功能不要求 `chatgpt.com` 網域權限、不注入 ChatGPT、不讀取對話，也不會替你按送出。

擴充功能不要求瀏覽紀錄、Cookie、密碼、下載內容或所有網站的常駐存取權。
