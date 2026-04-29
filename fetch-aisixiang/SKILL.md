---
name: fetch-aisixiang
description: 抓取愛思想（aisixiang.com）的文章資料。支援五種模式：(1) list-author 列出某作者全部文章（即時抓 /thinktank/ 全站作者列表 → 中文名→URL slug → 抓該作者欄頁，無專欄者自動 fallback 到搜尋）；(2) list-keyword 按 keyword tag 搜尋；(3) list-title 按標題模糊搜；(4) list-topic 按策展主題抓（即時抓 /zhuanti/ 主題清單 → 主題名→ID → 抓該主題頁，主題不存在時 fail-fast 不轉向）；(5) fetch 抓單篇文章轉 markdown。stateless 設計，不寫快取檔。**所有查詢字串需為簡體中文**——呼叫端負責轉換；技能不做 silent transformation。
---

# fetch-aisixiang — 愛思想文章抓取

## 概述

愛思想（aisixiang.com）是大陸主要的學術思想文章聚合網站，收錄思想史、哲學、政治學、經濟學、法學等領域學者的論文、隨筆、演講、訪談。本技能把該站的四個查詢入口（作者欄頁、keyword 搜尋、title 搜尋、單篇文章）包裝為一致的 CLI。

## 站方特性與限制

| 項目 | 狀況 |
|---|---|
| sitemap.xml | ❌ 404 |
| robots.txt | ❌ 404 |
| 搜尋分頁 | ✓ `&page=N`（搜尋）或 `?page=N`（zhuanti），每頁 30 筆 |
| 策展主題 | ✓ `/zhuanti/<id>.html` ~803 個主題（学科/事件/人物三類） |
| 搜尋語言 | **僅簡體**（繁體輸入直接 0 筆。呼叫端必須先轉簡體；本技能不自動轉） |
| 作者欄頁 | ✓ 963 位作者，全集分類齊全 |
| RSS | ✓ `/rss?type=1` 與 `?type=2`，各 20 筆最新（不能依主題篩；用既有 `fetch-rss` 即可，本技能未納入） |
| AJAX `/authorlist` | ❌ 404（HTML 內 JS 函式引用但 endpoint 已廢） |

**作者分兩類**：
- **A 類（963 位有專欄）**：`/thinktank/<slug>.html` 列出全部文章（分論文／隨筆／演講等）
- **B 類（無專欄）**：文章在站上但無專欄頁（例：楊儒賓、余英時）。只能透過站內 `searchfield=author` 搜尋拿最近 30 篇

## 安裝指引

> **執行 AI 須先依照本節說明確認執行環境，避免無法執行。**

**零外部依賴**——只用 Node 內建 `fetch`、`fs`、`path`。

```bash
node --version    # 需 >= v18（內建 fetch 自 Node 18 起穩定；建議 v20+）
```

> 本技能職責：抓原文、結構化 markdown、輸出 JSON 索引。**不做翻譯／繁簡轉換**——這類處理由呼叫端用其他工具（`opencc` CLI、Python `opencc`、`fix-tw-conversion.mjs` 等）銜接。

## 執行方式

```bash
node scripts/fetch_aisixiang.mjs <subcommand> [options]
```

### `list-author` — 列出某作者全部文章

每次呼叫 stateless 走兩跳：
1. GET `/thinktank/` → 解析全站 ~963 位作者的「中文名 → slug」清單
2. 用 slug 拼 `/thinktank/<slug>.html` → 抓該作者欄頁 → 解析分類文章列表

```bash
# --name 必須傳「站上登錄的字形」(簡體)
node scripts/fetch_aisixiang.mjs list-author --name 葛兆光 \
  --output ./out/gezhaoguang_list.json

node scripts/fetch_aisixiang.mjs list-author --name 许倬云 \
  --output ./out/xuzhuoyun_list.json

# 直接給 slug 跳過第一跳
node scripts/fetch_aisixiang.mjs list-author --slug gezhaoguang
```

**輸出**：JSON，`items[]` 每筆含 `aid / url / title / category`（論文／時評／隨筆／著作／演講／讀書／訪談／未分類）

**找不到時 fail-fast**：中文名不在 `/thinktank/` 作者清單時，**回 `status: "not_found"` 並停止**，不自動轉去搜尋。意圖是讓 agent 明確知道「該作者沒專欄」並決定下一步（例如改用 list-keyword 用作者名查文章）。

```json
{
  "status": "not_found",
  "site": "aisixiang",
  "mode": "author",
  "query": "楊儒賓",
  "authors_count": 963,
  "message": "「楊儒賓」不在愛思想專欄作者清單中（共 963 位）。尚無此作者文章。提醒：本技能不轉簡繁，呼叫端負責用站方登錄字形（通常是簡體）。"
}
```

### `list-keyword` — 按 keyword tag 搜尋（自動翻頁全抓）

```bash
# --keyword 必須是簡體（站方搜尋只認簡體）
node scripts/fetch_aisixiang.mjs list-keyword --keyword 老庄 \
  --output ./out/laozhuang_list.json
```

每頁 30 筆，自動翻完所有頁面（頁間延遲 1 秒），最多抓 50 頁。`items[]` 每筆含 `aid / url / title / author`；`resolved` 含 `total_pages / pages_fetched`。

**0 筆時回 `status: "no_results"`** 並附訊息提示可能字形不對：

```json
{
  "status": "no_results",
  "mode": "keyword",
  "query": "老莊",
  "count": 0,
  "items": [],
  "message": "關鍵字 \"老莊\" 在愛思想無相關文章。提醒：站方搜尋只認簡體，呼叫端負責簡體化；若已是簡體仍 0 筆，該主題可能無 tag 索引。"
}
```

### `list-title` — 按標題模糊搜尋（自動翻頁全抓，多噪音）

```bash
# 同樣必須簡體
node scripts/fetch_aisixiang.mjs list-title --keyword 第一哲学
```

模糊匹配，會混入字面相同但無關的結果（搜「探底」會抓到「蘇格拉底」）。建議搭配 `list-keyword` 互補。0 筆時同樣回 `status: "no_results"` 並附訊息。

### `list-topic` — 按策展主題抓全部文章（fail-fast）

愛思想 `/zhuanti/` 收錄 ~803 個編輯精選的主題集（学科／事件／人物三大類），每個主題集是站方手選的代表作，比 `list-keyword` 的 tag 匹配精準。

每次呼叫 stateless 走兩跳：
1. GET `/zhuanti/` → 解析全部 ~803 個「主題名 → ID」
2. 用 ID 拼 `/zhuanti/<id>.html` → 自動翻頁全抓

```bash
# 用主題名（自動查當下站上完整主題清單）
node scripts/fetch_aisixiang.mjs list-topic --keyword 大数据 \
  --output ./out/dasuju_list.json

# 直接給 ID 跳過第一跳
node scripts/fetch_aisixiang.mjs list-topic --id 301
```

**fail-fast 行為**：主題名不在清單中時，**回 `status: "not_a_topic"` 並提示改用 list-keyword，但不自動轉向**。設計意圖是讓 agent 明確知道「這不是策展主題」並決定是否退到 keyword tag 搜尋。

```json
{
  "status": "not_a_topic",
  "site": "aisixiang",
  "mode": "topic",
  "query": "老莊",
  "topics_count": 803,
  "message": "「老莊」不在愛思想策展主題清單中（共 803 個主題）。建議改用 list-keyword --keyword \"老莊\" 查 keyword tag 結果。本技能不自動轉向，請呼叫端決定是否重試。"
}
```

**輸出**：JSON，`items[]` 每筆含 `aid / url / title / author`；`resolved` 含 `id / name / category / url / total_pages / pages_fetched`。

### `fetch` — 抓單篇文章為 markdown

```bash
# 用 aid
node scripts/fetch_aisixiang.mjs fetch --aid 146669 \
  --output-dir ./knowledge/葛兆光/

# 用 URL
node scripts/fetch_aisixiang.mjs fetch \
  --url "https://www.aisixiang.com/data/146669.html" \
  --output-dir ./knowledge/葛兆光/
```

**輸出**：`<title>.md`（標題與檔名皆已去掉站方後綴 `_爱思想` / `_愛思想`），保留**原文（簡體）**，含 frontmatter（`title / source / created` 等基本欄位）＋ markdown 正文。需要繁體請呼叫端後處理。

## 共用選項

| 選項 | 範圍 | 說明 |
|---|---|---|
| `--output <path>` | list 模式 | JSON 輸出路徑（預設 `aisixiang_<mode>_<query>_YYYYMMDD.json`） |
| `--output-dir <dir>` | fetch 模式 | 輸出目錄（預設 cwd） |

## status 代碼（agent 用來分支）

| status | 觸發條件 | items 是否填充 | message 是否填充 |
|---|---|---|---|
| `success` | 查到結果 | ✓ | — |
| `not_found` | list-author 找不到該作者（不在 /thinktank/） | ✗ | ✓ |
| `not_a_topic` | list-topic 找不到該主題（不在 /zhuanti/） | ✗ | ✓（建議改 list-keyword） |
| `no_results` | list-keyword / list-title 搜尋 0 筆 | `[]` | ✓ |
| `error` | HTTP 失敗、解析失敗 | ✗ | ✓（error 訊息） |

agent 看 `status` 即可決定下一步，不必再判斷 `count` 是否為 0。

## 輸出格式

### list 模式（JSON）

```json
{
  "status": "success",
  "site": "aisixiang",
  "mode": "author",
  "query": "葛兆光",
  "resolved": { "slug": "gezhaoguang", "url": "..." },
  "fetched_at": "2026-04-28T12:34:56.000Z",
  "count": 162,
  "items": [
    { "aid": "146669", "url": "...", "title": "禅宗与中国文化",
      "author": "葛兆光", "category": "演讲" }
  ]
}
```

錯誤時：
```json
{ "status": "error", "site": "aisixiang", "mode": "...",
  "error": "錯誤訊息", "fetched_at": "..." }
```

### fetch 模式（markdown）

```markdown
---
title: "葛兆光：禅宗与中国文化"
source: "https://www.aisixiang.com/data/146669.html"
author:
published:
created: 2026-04-28
description:
---
[正文]
```

## 邊界與已知限制

1. **搜尋分頁**：每頁 30 筆，技能自動翻完全部頁面（頁間延遲 1 秒，安全上限 50 頁＝1500 筆）。熱門關鍵字（如「政治」「历史」）可能抓到上百筆；冷門關鍵字只有一頁
2. **搜尋只認簡體**：呼叫端負責簡體化；本技能不做任何 silent transformation。傳了繁體 → 0 筆 → 由呼叫端判斷後重試
3. **B 類作者**：站上作者列表外的作者只能透過 author 搜尋抓（無分類資訊；同樣自動翻頁全抓）
4. **HTML→MD 是 regex 自製版**：愛思想 HTML 乾淨夠用；複雜內嵌（表格、程式碼）可能不完整。後續可升級 turndown
5. **stateless 設計**：每次 `list-author` 多一次 ~170KB HTTP（抓 `/thinktank/`）。換永遠最新、無快取狀態、可攜
6. **AJAX `/authorlist` 已廢**：靜態 HTML 已含全部作者，本技能不嘗試 AJAX
7. **頁間 delay 與上限是 hardcoded**（`PAGE_DELAY_MS=1000`, `MAX_PAGES=50`）：v1 不開放 CLI 覆寫，避免呼叫端因不熟悉而設出招封風險
8. **重試與超時**：每次請求超時 30 秒；對 HTTP `429` / `5xx` 與網路層錯誤（`ECONNRESET` / `ETIMEDOUT` / `ENOTFOUND` / DNS 失敗 / TLS 等）皆重試，**最多重試 5 次，含初始請求最多執行 6 次**，採指數退避並 cap 在 30 秒（5s → 10s → 20s → 30s → 30s）
