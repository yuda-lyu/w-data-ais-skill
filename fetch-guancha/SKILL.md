---
name: fetch-guancha
description: 抓取觀察者網（guancha.cn）的文章資料並轉成 markdown。支援五種模式：(1) list-author 列出某作者全部文章（從首頁 A-Z 索引解析 ~700 位專欄作者，中文名→拼音 slug，再抓該作者欄頁翻頁全收）；(2) list-keyword 按關鍵字搜尋（站方 search API 走 sojson.v4 簽名，純 curl 不可用，回 status: error）；(3) list-title 按標題搜尋（與 keyword 同源，同樣不可用）；(4) list-topic 按主題（含內建已知主題對照表 ~28 個，命中查、不命中 status: error 並提示）；(5) fetch 抓單篇文章轉 markdown。底層委派 fetch-web-by-curl。**所有查詢字串需為簡體中文**——呼叫端負責轉換；技能不做 silent transformation。
---

# fetch-guancha — 觀察者網文章抓取

## 概述

觀察者網（guancha.cn）是中國大陸主要的時政／思想／國際／財經評論聚合平台，立場明確（民族主義／國家主義／親中央政府）。本技能把該站的四個查詢入口（作者欄頁、欄目／主題集翻頁、單篇文章）包裝為與 fetch-aisixiang 一致的 CLI。**搜尋功能站方走 sojson.v4 簽名，純 curl 無法使用**——本技能誠實回 `status: "error"`，不做 fallback。

## 站方特性與限制

| 項目 | 狀況 |
|---|---|
| sitemap.xml | ❌ 404 |
| robots.txt | ✓ 但只 disallow `/Search/` 與 `/df888/` |
| 文章 URL | ✓ `/<slug>/<YYYY_MM_DD>_<articleId>.shtml` |
| 作者頁 / 欄目頁 / 主題集頁 | ✓ `/<slug>` 或 `/<slug>/list_<N>.shtml`（每頁 60 篇）|
| 全站 A-Z 作者索引 | ✓ 首頁底部 `<dl class="fix"><dt>X</dt><dd>...</dd></dl>` 含 ~700 位 |
| 詳細作者卡片 | ✓ `/authorcolumn` 含 ~349 位（有頭像／頭銜）|
| 主題清單頁 | ❌ 無公開頁；僅內建約 28 個已知主題對照（見下表）|
| 全文搜尋 | ❌ JSON API `s.guancha.cn/main/search-v2` 走 sojson.v4 簽名，純 curl 拿到 `code:4 验证错误` |
| 內容語言 | 簡體中文 |
| 反爬 | **目前無**（curl 即可抓所有非搜尋功能；先前看到的「302 跳首頁」是因為文章被下架的特殊行為，不是反爬） |

## 安裝指引

> **[執行AI須先依照技能內說明安裝指定依賴之套件]**

**零 npm 依賴**——抓取層委派給同層 sibling 技能 `fetch-web-by-curl`（其本身亦零 npm 依賴，僅需系統 curl）。

執行前驗證：
```bash
node --version            # 需 >= v18
curl --version            # Windows 10 1803+ 內建
```

且 `fetch-web-by-curl/` 必須與 `fetch-guancha/` 位於同一技能庫的同層目錄（本技能透過 `../../fetch-web-by-curl/scripts/fetchWebByCurl.mjs` 相對載入）。

> 本技能職責：抓原文、結構化 markdown、輸出 JSON 索引。**不做翻譯／繁簡轉換**——這類處理由呼叫端用其他工具銜接。

## 執行方式

```bash
node fetch-guancha/scripts/fetch_guancha.mjs <subcommand> [options]
```

### `list-author` — 列出某作者全部文章

```bash
# --name 必須傳「站上登錄的中文名」（簡體）
node fetch-guancha/scripts/fetch_guancha.mjs list-author --name 张维为 \
  --output ./out/zhangweiwei_list.json

# 直接給 slug 跳過第一跳
node fetch-guancha/scripts/fetch_guancha.mjs list-author --slug ZhangWeiWei
```

stateless 兩跳：(1) GET `https://www.guancha.cn/` 解析底部 A-Z 索引（`<dl><dt>X</dt><dd>...`）成中文名→slug 對照；(2) 用 slug 拼 `/<slug>/list_<N>.shtml` 翻頁全抓（每頁 60 篇，安全上限 50 頁）。

**找不到時**：回 `status: "success", count: 0` 並附訊息「尚無此作者文章」（按全庫 binary contract）。

### `list-keyword` / `list-title` — 關鍵字／標題搜尋（**目前不可用**）

站方搜尋 API 由 sojson.v4 混淆並要 MD5 簽名，純 curl 無法調用。本技能回：

```json
{
  "status": "error",
  "mode": "keyword",
  "query": "...",
  "message": "觀察者網搜尋 API 由 sojson.v4 混淆後簽名，本技能（純 curl 路徑）無法支援。如已知作者拼音 slug，請改用 list-author --slug；如已知主題 slug，請改用 list-topic --slug。"
}
```

> `list-title` 與 `list-keyword` 在站方同源（無分標題或全文搜尋），行為相同。

### `list-topic` — 列出某主題全部文章

```bash
# --name 在內建 KNOWN_TOPICS 對照表中查找（~28 個）
node fetch-guancha/scripts/fetch_guancha.mjs list-topic --name 财经 \
  --output ./out/topic_caijing.json

# 直接給 slug 跳過對照表
node fetch-guancha/scripts/fetch_guancha.mjs list-topic --slug economy
```

**fail-fast 行為**：主題不在 KNOWN_TOPICS 對照表中時，回 `status: "error"` 並訊息建議改用 list-keyword（雖 list-keyword 目前不可用，呼叫端 agent 自行處理）。

#### 內建 KNOWN_TOPICS 對照表

| slug | 中文名 |
|---|---|
| `economy` | 财经 |
| `internation` | 国际 |
| `military-affairs` | 军事 |
| `JunShi` | 军事（替代 slug）|
| `ZhengZhi` | 政治 |
| `WenHua` | 文化 |
| `chanjing` | 产经 |
| `qiche` | 观出行 |
| `gongye-keji` | 科技 |
| `ChengShi` | 城事 |
| `GuanJinRong` | 观金融 |
| `XinShiDai` | 新时代 |
| `CaiJing` | 财经（替代 slug）|
| `ChaoJiGongCheng` | 超级工程 |
| `NengYuanZhanLue` | 能源战略 |
| `RenGongZhiNeng` | 人工智能 |
| `XinZhiGuanChaSuoNews` | 心智观察所 |
| `YiLangJuShi` | 伊朗局势 |
| `MeiGuoMeng` | 美国一梦 |
| `MeiGuoJingJi` | 美国经济 |
| `ELuoSiZhiSheng` | 俄罗斯之声 |
| `lianganyuanzhuopai` | 两岸圆桌派 |
| `ZheJiuShiZhongGuo` | 这就是中国 |
| `YiZhouJunQingGuanCha` | 一周军事观察 |
| `feizhoushangkou` | 非洲之窗 |
| `toutiao` | 观察者头条 |
| `gushi` | 股市 |
| `guanwangwenyu` | 新潮观鱼 |
| `jingtiriben` | 冲破战后秩序 日本想干什么 |
| `DaoGuoDianAVI` | 日本 |

> 表內為當前抓取時點所見之主題。觀察者網持續新增主題，呼叫端遇 `status: "error"` 可能需更新對照表或直接傳 `--slug`。

### `fetch` — 抓單篇文章為 markdown

```bash
node fetch-guancha/scripts/fetch_guancha.mjs fetch \
  --url "https://www.guancha.cn/internation/2026_04_29_815417.shtml" \
  --output-dir ./knowledge/guancha/
```

**輸出**：`<title>.md`（標題已去掉站方後綴），保留**原文（簡體）**，含 frontmatter（`title / source / author / published / created`）＋ markdown 正文。

**找不到 / 已下架時**：站方會 302 跳到首頁，本技能偵測後回 `status: "error", message: "無此文章（可能已下架）"`。

## status 約定（與全庫一致：success / error 二分法）

| status | count | 含義 |
|---|---|---|
| `success` | > 0 | 抓到文章（list 模式）或文章存在（fetch 模式）|
| `success` | 0 | 查清楚但確實無結果（如作者不在索引中、欄目無近期文章）|
| `error` | — | 技術錯誤（網路、HTTP 失敗、文章下架、本技能不支援該功能等）|

> Agent 看 `status === "error"` 即決定 fallback；看 `status === "success" && count === 0` 不必 fallback（已查清楚）。

## 輸出格式

### list 模式（JSON）

```json
{
  "status": "success",
  "site": "guancha",
  "mode": "author",
  "query": "张维为",
  "resolved": { "slug": "ZhangWeiWei", "url": "https://www.guancha.cn/ZhangWeiWei", "name": "张维为" },
  "fetched_at": "2026-04-29T15:00:00.000Z",
  "count": 84,
  "items": [
    { "url": "https://www.guancha.cn/ZhangWeiWei/2026_04_29_815400.shtml", "title": "..." }
  ]
}
```

### 錯誤
```json
{ "status": "error", "site": "guancha", "mode": "...", "error": "...", "fetched_at": "..." }
```

### fetch 模式（markdown）

```markdown
---
title: "下一个退出OPEC+的是哈萨克斯坦？该国能源部否认"
source: "https://www.guancha.cn/internation/2026_04_29_815417.shtml"
author: "观察者网 齐倩"
published: "2026-04-29 19:04:33"
created: "2026-04-29"
description:
---
[正文]
```

## 共用選項

| 選項 | 範圍 | 說明 |
|---|---|---|
| `--output <path>` | list 模式 | JSON 輸出路徑（預設 `guancha_<mode>_<query>_YYYYMMDD.json`）|
| `--output-dir <dir>` | fetch 模式 | 輸出目錄（預設 cwd）|

## 邊界與已知限制

1. **搜尋功能不支援**：站方 JSON API `s.guancha.cn/main/search-v2` 走 sojson.v4 簽名；本技能（純 curl）路徑無法調用。將回 `status: "error"`。
2. **主題清單需對照表**：站方無公開主題清單頁；本技能內建 ~28 個常見主題，未涵蓋者請傳 `--slug` 直接抓。
3. **作者索引從首頁底部解析**：每次 list-author 多一次 ~340KB HTTP（抓首頁），換永遠最新、無快取狀態。
4. **HTML→MD 是 regex 自製版**：觀察者網 `content all-txt` 區塊 HTML 乾淨夠用；複雜內嵌（表格、互動圖）可能不完整。後續可升級 turndown。
5. **欄目／主題集翻頁全抓**：每頁 60 筆，自動翻完所有頁面（頁間延遲 1 秒，安全上限 50 頁＝3000 筆）。
6. **重試與超時**：底層委派 fetch-web-by-curl，**最多重試 5 次，含初始請求最多執行 6 次**，線性退避 3-15 秒，單次請求 15 秒超時。
7. **stateless 設計**：每次呼叫獨立、不寫快取狀態。
8. **內容立場警告**：觀察者網內容立場明確（民族主義／國家主義／親中央政府）；用於多元觀點蒐集或對照分析合適，直接做事實生成需謹慎。
