---
name: fetch-emerging
description: 抓取台股興櫃（ESB）個股盤後/歷史日開高低收（OHLC）與成交量資料。以 Goodinfo 個股 K 線（日）頁為來源，支援指定日期+代碼抓取。適用於：(1) 盤後報告補齊興櫃個股開收盤價、(2) TWSE/TPEX 皆查無資料時的第三層 fallback、(3) 驗證興櫃個股指定交易日行情。
---

# fetch-emerging（興櫃 OHLC）

> 目標：在 TWSE（上市）與 TPEX（上櫃）都查不到時，能**至少抓到興櫃個股（例如 6610）指定日期的 OHLC**。

## 資料來源

- Goodinfo 個股 K 線（日）：
  - `https://goodinfo.tw/tw/ShowK_Chart.asp?STOCK_ID={stockNo}`

此頁面內含「交易日期 / 開盤 / 最高 / 最低 / 收盤」的歷史表格，能涵蓋興櫃個股。

## ⚠️ Anti-bot（必要）

Goodinfo 有 JavaScript-based anti-bot / cookie 重定向。

**必須用 browser 工具**（Playwright）開啟頁面並以 `evaluate` 抽取表格，避免用純 requests。

建議流程：

1. `browser open` → 開啟 K 線（日）頁
2. `wait 3~5s`
3. `snapshot`：確認頁面不是導轉頁
   - 若仍看到 `setCookie('CLIENT_KEY'` 或 `window.location.replace`，再 `navigate` 同網址並再等 2~3s
4. `browser act evaluate` 執行下方 JS 抓取

## 輸入

- `stockNo`：股票代碼（例如 `6610`）
- `date`：指定交易日（`YYYYMMDD`，例如 `20260205`）

## 輸出（建議格式）

```json
{
  "source": "goodinfo",
  "market": "emerging",
  "stockNo": "6610",
  "date": "20260205",
  "open": 22.0,
  "high": 24.2,
  "low": 21.7,
  "close": 22.75,
  "volumeLots": 1340,
  "raw": null,
  "error": null
}
```

> `volumeLots` = 成交張數（Goodinfo 表格常見欄位為張數）。

## 抓取腳本（browser evaluate）

### A) 先做「是否載入成功」的快速檢查

```javascript
(() => {
  const text = document.querySelector('main')?.innerText || '';
  const hasK = text.includes('K線圖') || text.includes('K線');
  const hasTradeDate = text.includes('交易') && text.includes('日期');
  return {
    ok: !!(hasK && hasTradeDate),
    sample: text.slice(0, 200)
  };
})();
```

### B) 抽取「指定日期」一列的 OHLC

> Goodinfo 日期格式常見為：`'26/02/05`（西元兩位年），因此需將 `YYYYMMDD` 轉成 `YY/MM/DD` 的匹配字串。

```javascript
((dateYYYYMMDD, stockNo) => {
  const y = dateYYYYMMDD.slice(2, 4);
  const m = dateYYYYMMDD.slice(4, 6);
  const d = dateYYYYMMDD.slice(6, 8);
  const target = `'${y}/${m}/${d}`; // ex: '26/02/05

  // 找出包含「交易日期/開盤/最高/最低/收盤」表頭的表格
  const tables = [...document.querySelectorAll('table')];
  let table = null;
  for (const t of tables) {
    const headerText = [...t.querySelectorAll('th')].map(x => x.innerText.trim()).join('|');
    if (headerText.includes('交易') && headerText.includes('日期') && headerText.includes('開盤') && headerText.includes('收盤')) {
      table = t;
      break;
    }
  }
  if (!table) {
    return { ok: false, error: { type: 'parse', message: 'Cannot find OHLC table' } };
  }

  // 逐列找 target 日期
  const rows = [...table.querySelectorAll('tr')];
  for (const r of rows) {
    const cells = [...r.querySelectorAll('td,th')].map(c => c.innerText.replace(/\s+/g, ' ').trim());
    if (!cells.length) continue;
    if (cells[0] !== target) continue;

    // 期待欄位：日期, 開盤, 最高, 最低, 收盤, ... , 張數(成交張數) ...
    // 但表格可能分段重覆表頭，因此以固定前 5 欄抽 OHLC；成交張數嘗試抓後方第一個像整數的欄位。
    const open = parseFloat(cells[1]);
    const high = parseFloat(cells[2]);
    const low  = parseFloat(cells[3]);
    const close= parseFloat(cells[4]);

    // 尋找成交張數：優先找「張數」欄位所在區段；若找不到則找第一個看起來像千分位整數的欄位
    let volumeLots = null;
    const numLike = (s) => /^-?\d{1,3}(,\d{3})*$/.test(s);
    for (let i = 5; i < cells.length; i++) {
      if (numLike(cells[i])) { volumeLots = parseInt(cells[i].replace(/,/g,''),10); break; }
    }

    return {
      ok: true,
      source: 'goodinfo',
      market: 'emerging',
      stockNo,
      date: dateYYYYMMDD,
      open, high, low, close,
      volumeLots,
      rawRow: cells
    };
  }

  return { ok: false, error: { type: 'not-found', message: `No row for ${target}` } };
})("20260205", "6610");
```

## 錯誤處理原則

- `anti-bot`：頁面仍為導轉頁 → wait + navigate 重試（最多 3 次）
- `parse`：找不到表格 → 先 snapshot 確認頁面是否正常
- `not-found`：表格內沒有該日期列 → 可能為非交易日或 Goodinfo 資料尚未更新

## 測試案例（手動）

- 代碼：`6610`
- 日期：`20260204`、`20260205`
- 預期：能取得 OHLC（且與 Goodinfo 頁面一致）
