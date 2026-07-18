# 牧茗管理顧問官方網站

牧茗管理顧問有限公司官方網站原始碼。

正式網址：<https://sally741117.github.io/muming-website/>

## 專案結構

```text
muming-website/
├── index.html
├── assets/
│   ├── image_1.png
│   ├── image_2.png
│   └── line-official-qr.png
├── README.md
└── .gitignore
```

## 網站架構

- 單一靜態 HTML 網站。
- CSS 與 JavaScript 目前保留在 `index.html`。
- 使用 hash pseudo-page 架構，主要入口包含 `#services`、`#free-course`、`#consultation`、`#faq`、`#about`、`#contact`。
- 靜態素材放在 `assets/`，其中 `assets/line-official-qr.png` 為 LINE 官方帳號 QR Code。

## 本機預覽

可直接用瀏覽器開啟 `index.html`，或在專案根目錄啟動本機 HTTP server：

```bash
py -m http.server 8088 --bind 127.0.0.1
```

預覽網址：

```text
http://127.0.0.1:8088/
```

## 聯絡資訊

- LINE：[@498hxein](https://line.me/R/ti/p/@498hxein)
- Email：[muming9000@gmail.com](mailto:muming9000@gmail.com)

## GitHub Pages

此專案目前設計為 GitHub Pages 相容的靜態網站。部署前請先確認 Git remote、branch 與本機差異，再將變更推送到正式 repository。
