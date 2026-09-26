# Google 收錄與品牌識別（2026-09-26）

## 本輪查證

- 正式 repository：`sally741117/muming-website`；Pages 使用 `main` 根目錄，自動部署，強制 HTTPS。
- 起始本機 HEAD：`da9b48fd932c52f3cb32233d24b1c36c0b8d0cfd`；遠端正式基準：`6edf38608f66cfb4407352d73cd8b55806993815`。先以 fast-forward 同步，差異只有 CNAME。
- 正式站首頁與基準 HTML 一致（忽略 CRLF/LF）。原首頁缺少 description、canonical、robots meta、Open Graph、JSON-LD；title 不含公司完整名稱，且由 JavaScript 再次設定。
- 根目錄 robots.txt、sitemap.xml 原本回傳 404。子目錄的 robots.txt 不適用於全站。
- 未發現既有公開 HTML 的 noindex、nofollow 或錯誤 canonical；未設定 canonical 與設定錯誤是不同情況。沒有 manifest，靜態網站收錄不以 manifest 為必要條件。
- DNS：apex 四筆 A 記錄為 GitHub Pages 的 185.199.108–111.153；www CNAME 指向 sally741117.github.io。
- HTTP apex、HTTP/HTTPS www、舊 GitHub Pages 首頁均為 301 → https://mumingconsulting.tw/ → 200；不存在路徑回傳真正 404。保留現有 CNAME 與 Pages 轉址，不新增 JavaScript 網域轉址。
- 無 Search Console 帳號內資料，無法判定 Google 未顯示官網的唯一原因，亦未確認 Google 已收錄。上述缺口是可改善的品牌及發現訊號，不代表每一項都是索引必要條件。

## 網站端設定

- 首頁 title（含 JS）：`牧茗管理顧問有限公司｜MUMING`。
- 首頁 description：牧茗管理顧問有限公司（MUMING）提供企業 AI 基礎課程、工具評估、工作流程整理與導入陪跑，協助企業從實際工作需求出發，逐步找到適合的 AI 應用方式。
- 首頁 canonical：`https://mumingconsulting.tw/`；各工具及內容頁使用自己的正式 URL，不能全指向首頁。目錄 index.html 使用結尾斜線的目錄 URL；互動參數不另列入 sitemap。
- 213 個既有、受版本控制的公開 HTML 頁面補齊 metadata；包含 200 個既有色彩說明頁。其他頁面的描述沿用實際內容，補足預約、關於及隱私頁描述。
- 首頁保留一個主要 H1；同文件的 hash 分頁標題改為 H2 並保留原樣式。既有可見介紹文字補上公司全名與 MUMING，不加入隱藏 SEO 文字。
- 首頁 JSON-LD 為 Organization 與 WebSite；公司全名、MUMING、牧茗、正式網址、既有 logo 與公開 email 均可由既有網站確認。不推測創辦人、成立日或服務區域。
- robots.txt 允許公開內容抓取，宣告正式 sitemap。sitemap 僅列公開正式 URL，不含 hash、測試、備份、未追蹤工具、管理頁或預覽 URL；未虛構 lastmod。
- 網站仍保留既有 hash 分頁架構；`#about`、`#services` 等是同一份文件，不宣稱能各自獨立收錄。本輪沒有重建路由或新增服務頁。
- 舊網域的圖片及首頁連結已改用正式網域。

## 小羽手動操作 Search Console

1. 用管理公司網站的 Google 帳號登入 [Google Search Console](https://search.google.com/search-console/)。
2. 新增資源，建議選「網域／Domain」，輸入 `mumingconsulting.tw`，不要填 https 或路徑。若已有相同資源，直接使用。
3. 複製 Google 給的 DNS TXT 值，在目前 DNS 管理平台新增 TXT。主機名稱依平台填 `@` 或空白，值貼上完整 `google-site-verification=...`，保留現有 A、www CNAME 與其他 TXT。
4. 等待 DNS 傳播後回 Search Console 點「驗證」。驗證成功後保留 TXT。Domain 資源需要 DNS 驗證，不需要在網站放假的驗證碼。
5. 進入「Sitemap」，提交 `https://mumingconsulting.tw/sitemap.xml`，確認處理狀態成功。
6. 在「網址審查／URL Inspection」輸入 `https://mumingconsulting.tw/`，執行「測試實際網址」，確認可擷取、允許索引、使用者宣告的 canonical 正確。
7. 點「要求建立索引／Request Indexing」。如 Google 所選 canonical 尚未更新，等待重新抓取後再看；不要重複提交同一網址期待加速。
8. 稍後查看「網頁索引／Page indexing」及首頁 URL Inspection：留意上次檢索日期、Google 所選 canonical 與是否已建立索引。若未收錄，依實際原因處理。

如果無法管理 DNS，可改新增 `https://mumingconsulting.tw/` 的「網址前置字元」資源，使用 Google 實際提供的 HTML 檔案或 meta 驗證；這只涵蓋該網址前置字元。收到真正驗證資料後再加入網站。

網站端可抓取與 metadata 正確、Search Console 驗證與提交、Google 實際建立索引，是三個不同階段。Google 說明重新檢索可能需要數天到數週；提交不保證收錄或排名。

## 維護與回復

本輪部署前檢查：213 頁 metadata、JSON-LD、sitemap 與站內檔案連結通過；Edge 無頭瀏覽器驗證 1440px、390px、360px 首頁及 14 個 hash 分頁，標題字型與尺寸保持一致。桌機／手機導覽、三個預約入口及 13 個重要頁面開啟通過，無 JavaScript 例外；沒有送出真實預約表單。已逐項比對 HTML body 與腳本，差異僅為本輪公司名稱介紹、標題語意、首頁 title 與舊網域連結。

新增公開頁面時補上唯一 title、description、canonical、robots 及 OG，並同步 sitemap；不把所有本機 HTML 自動當成公開頁。可執行 `python scripts/verify_seo.py` 檢查 metadata、JSON-LD、sitemap、CNAME 與站內檔案連結。需驗證已部署內容時使用 `python scripts/verify_seo.py --live`。

需要回復時對本輪 SEO commit 執行 `git revert <SEO commit hash>`，檢查並推送 main；不要 reset 或覆寫其他工作。部署前正式基準為 `6edf386`，CNAME 不屬於本輪修改。

## 官方依據

- [Google 網域資源與驗證](https://support.google.com/webmasters/answer/9008080?hl=zh-Hant)
- [建立與提交 sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Organization 結構化資料](https://developers.google.com/search/docs/appearance/structured-data/organization)
- [要求 Google 重新檢索](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl)
- [GitHub Pages 自訂網域](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/managing-a-custom-domain-for-your-github-pages-site)
