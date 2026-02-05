---
name: fetch-mops
description: 抓取 MOPS（公開資訊觀測站）重大公告。支援指定日期範圍，回傳結構化 JSON。適用於台股調研、個股公告查詢、財報/訴訟/庫藏股等即時資訊。
---

# MOPS 資料抓取

從公開資訊觀測站（MOPS）抓取上市櫃公司重大公告。

## 網站資訊

| 項目 | 說明 |
|------|------|
| 網址 | https://mops.twse.com.tw |
| 資料類型 | 官方公告（財報、重訊、股利、庫藏股、訴訟等） |
| 抓取方式 | browser evaluate + 內部 API |
| 更新頻率 | 即時 |

## 技術說明

MOPS 是 Vue SPA，**必須**用 browser evaluate 呼叫內部 API，無法用 web_fetch。

### 抓取步驟

```
步驟 1：開啟 MOPS 首頁
  browser open → https://mops.twse.com.tw

步驟 2：等待頁面載入
  等待 2-3 秒

步驟 3：呼叫內部 API（透過 browser evaluate）
  browser act evaluate → 執行下方 JavaScript
```

### API 呼叫（IIFE 格式）

```javascript
// 取得最新公告列表
(async () => {
  const r = await fetch('https://mops.twse.com.tw/mops/api/home_page/t05sr01_1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count: '0', marketKind: '' })
  });
  return r.json();
})()
```

### API 參數說明

| 參數 | 說明 |
|------|------|
| `count` | '0' = 取得所有（或指定數量如 '50'） |
| `marketKind` | '' = 全部, 'sii' = 上市, 'otc' = 上櫃 |

### 其他 API 端點

| 端點 | 用途 |
|------|------|
| `/mops/api/home_page/t05sr01_1` | 重大訊息列表 |
| `/mops/api/home_page/t146sb01_1` | 營收公告 |
| `/mops/api/home_page/t108sb01_1` | 庫藏股 |

## 輸出格式

```json
{
  "source": "mops",
  "fetchTime": "2026-02-05T08:00:00+08:00",
  "dateRange": {
    "from": "2026-02-04",
    "to": "2026-02-05"
  },
  "items": [
    {
      "code": "2330",
      "name": "台積電",
      "date": "2026-02-05",
      "time": "07:30",
      "title": "本公司董事會決議股利分派",
      "type": "股利",
      "url": "https://mops.twse.com.tw/..."
    }
  ],
  "error": null
}
```

## 篩選標準

### 要抓（會影響股價）

- 營收公告、財報
- 股利分派
- 庫藏股買回、減資、現增
- 併購、處分資產、重大合約
- 訴訟、仲裁結果、罰鍰
- 駭客攻擊、資安事件
- 澄清媒體報導

### 跳過（例行公告）

- 更名公告
- 背書保證、資金貸與
- 董事會/股東會召開通知
- 發言人/主管異動

## 錯誤處理

遭遇錯誤時，回傳錯誤資訊並記錄：

```json
{
  "source": "mops",
  "fetchTime": "2026-02-05T08:00:00+08:00",
  "items": [],
  "error": {
    "type": "network",
    "message": "API request failed",
    "details": "..."
  }
}
```

## 快速執行

```
請使用 fetch-mops 技能抓取 MOPS 重大公告：
- 日期範圍：昨日 + 今日
- 輸出：JSON 格式
```
