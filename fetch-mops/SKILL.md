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

## 📝 錯誤紀錄機制（必要）

執行過程中遭遇的錯誤須記錄至調用方的 `error_log.jsonl`。

### 紀錄格式

```json
{
  "timestamp": "2026-02-05T08:15:30+08:00",
  "date": "20260205",
  "source": "mops",
  "phase": "fetch",
  "error": {
    "type": "network",
    "message": "API request timeout",
    "details": "POST /mops/api/home_page/t05sr01_1 timeout after 30s"
  },
  "attempts": [
    {"action": "retry after 5s", "result": "failed"},
    {"action": "retry after 10s", "result": "success"}
  ],
  "resolution": "success",
  "notes": "MOPS API may be slow during market open hours"
}
```

### 錯誤類型

| type | 說明 |
|------|------|
| `network` | 網路連線失敗 |
| `timeout` | 請求逾時 |
| `parse` | JSON 解析失敗 |
| `empty` | API 回傳空資料 |
| `browser` | 瀏覽器操作失敗 |

### 何時紀錄

1. API 請求失敗或逾時
2. 瀏覽器無法開啟/evaluate 失敗
3. 回傳資料格式異常
4. 重試嘗試（成功或失敗皆記錄）

## 🔧 常見問題與排除

### 1. 抓取失敗 (Browser Error)

**症狀**：
- `error_log.jsonl` 出現 `No connected browser-capable nodes` 或 `無 Brave Search API key`。
- 本技能需要 browser context 呼叫內部 API，若 OpenClaw 瀏覽器服務未啟動，會嘗試降級使用 Search API，若無 Key 則報錯。

**解決方法**：
重啟瀏覽器服務：
```bash
openclaw browser start
```
檢查狀態：
```bash
openclaw browser status
```

## 快速執行

```
請使用 fetch-mops 技能抓取 MOPS 重大公告：
- 日期範圍：昨日 + 今日
- 輸出：JSON 格式
- 錯誤須記錄至 error_log.jsonl
```
