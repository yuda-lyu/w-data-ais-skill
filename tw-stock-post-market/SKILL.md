---
name: tw-stock-post-market
description: 台股盤後總結技能。收盤後執行，比對盤前調研報告的利多/利空研判與實際漲跌表現，分析符合率與誤判原因，累積調研經驗。使用時機：(1) 盤後驗證調研準確度、(2) 檢討研判邏輯、(3) 累積調研經驗。
---

# 台股盤後總結

收盤後執行，驗證盤前調研報告的研判準確度，分析符合與誤判原因。

## 🚦 交易日檢查（必要）

執行前**必須先檢查當日是否為台股交易日**，若非交易日則跳過不執行。

### 檢查方式

使用 `fetch-twse` 技能的交易日檢查功能，或直接呼叫：

```bash
curl -s "https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&date=YYYYMMDD&type=IND" | jq '.stat'
# "OK" = 交易日
# "很抱歉..." = 非交易日
```

### 非交易日處理

若為非交易日，回報：
> 今日（YYYY/MM/DD）為台股非交易日，跳過盤後總結。

## ⏰ 執行時機

- **建議時間**：14:30 ~ 17:30（收盤後，法人資料更新後）
- **資料來源**：證交所收盤資料、Goodinfo 三大法人買賣超

## 📦 資料來源與抓取技能

本技能透過調用專職抓取技能取得資料：

| 資料 | 抓取技能 | 說明 |
|------|----------|------|
| 開收盤價（上市） | `fetch-twse` | 證交所股票收盤資料（上市） |
| 開收盤價（上櫃） | `fetch-tpex` | 櫃買中心股票收盤資料（上櫃；若 fetch-twse 查無資料則改用） |
| 開收盤價（興櫃） | `fetch-emerging` | 興櫃個股 OHLC（Goodinfo K 線日表；若 TWSE/TPEX 皆查無資料則改用） |
| 法人買賣超（逐檔） | `fetch-institutional-net-buy-sell` | 以 TWSE + TPEX 官方資料抓指定日期、指定代碼三大法人買賣超（外資/投信/自營/合計） |

> **技術細節**請參閱各抓取技能的 SKILL.md

## 輸入格式

須從盤前調研報告提取「個股影響總表」JSON 陣列：

```json
[
  {
    "code": "3481",
    "name": "群創",
    "impact": "利多",
    "reason": "法人買超 7.9 萬張（02/04），漲停 +9.79%"
  },
  {
    "code": "2409",
    "name": "友達",
    "impact": "利空",
    "reason": "鉅亨網報導外資調節"
  }
]
```

**欄位說明**：
- `code`：股票代碼
- `name`：股票名稱
- `impact`：`利多` / `利空` / `中性`
- `reason`：研判理由

## 執行流程

```
1. 檢查是否為交易日
2. 讀取今日盤前調研報告的個股影響總表
3. 調用 fetch-twse 技能抓取各股開收盤價（上市）
   - 若 TWSE 查無資料（not-found / 該代碼不在回傳表內），改用 fetch-tpex 抓取（上櫃）
   - 若 TPEX 仍查無資料（該代碼不在回傳表內），改用 fetch-emerging 抓取（興櫃）
4. 調用 fetch-institutional-net-buy-sell 技能抓取三大法人買賣超（逐檔、指定日期；官方 TWSE+TPEX）
5. 比對研判結果
6. 分析符合/誤判原因
7. 產出 report_YYYYMMDD.md
8. 推送至 GitHub
```

## 研判比對邏輯

| 盤前研判 | 實際表現 | 結果 |
|----------|----------|------|
| ⬆️ 利多 | 收盤 > 開盤 | ✅ 符合 |
| ⬆️ 利多 | 收盤 ≤ 開盤 | ❌ 誤判 |
| ⬇️ 利空 | 收盤 < 開盤 | ✅ 符合 |
| ⬇️ 利空 | 收盤 ≥ 開盤 | ❌ 誤判 |
| ➖ 中性 | 任何 | ➖ 不計入 |

## 輸出結構

```
tasks/stock-post-market/
├── report_YYYYMMDD.md      # 盤後總結報告（依執行日期命名）
├── error_log.jsonl         # 錯誤紀錄（累積式，每行一筆）
└── raw/
    ├── input.json          # 輸入的個股影響總表
    ├── prices.json         # 抓取的開收盤價（TWSE/TPEX/興櫃 fallback 後的彙整）
    └── institutional.json  # 三大法人買賣超（官方 TWSE+TPEX；逐檔、指定日期）
```

## 📝 錯誤紀錄機制（必要）

執行過程中遭遇的**重大錯誤**與**重試/修復過程**需記錄至 `error_log.jsonl`，供未來排錯和改進技能參考。

> 原則：
> - **不影響整體報告產出的小波動**（例如短暫延遲但一次成功、可忽略的提示訊息）可不記。
> - **會造成資料缺失、需要 retry、或可能需要後續修復的狀況**必須記。

### 紀錄格式

每行一筆 JSON，追加寫入（不覆蓋）：

```json
{
  "timestamp": "2026-02-05T15:30:00+08:00",
  "date": "20260205",
  "source": "twse",
  "phase": "fetch",
  "error": {
    "type": "network",
    "message": "Connection timeout after 30s",
    "details": "ETIMEDOUT on https://www.twse.com.tw/..."
  },
  "attempts": [
    {
      "action": "retry after 5s",
      "result": "failed",
      "message": "Still timeout"
    },
    {
      "action": "retry after 10s",
      "result": "success",
      "message": "Data fetched successfully"
    }
  ],
  "resolution": "success",
  "notes": "TWSE API may be slow during high traffic hours"
}
```

### 欄位說明

| 欄位 | 必要 | 說明 |
|------|------|------|
| `timestamp` | ✅ | ISO 8601 格式，含時區 |
| `date` | ✅ | 執行日期（YYYYMMDD） |
| `source` | ✅ | 來源：twse / tpex / emerging / institutional / report / system |
| `phase` | ✅ | 階段：init / fetch / parse / compare / report / push |
| `error.type` | ✅ | 錯誤類型：network / timeout / parse / not-found / upstream / unknown |
| `error.message` | ✅ | 簡短錯誤訊息 |
| `resolution` | ✅ | 最終結果：success / failed / skipped |

### 何時記錄（建議門檻：重大錯誤）

1. 來源 API 逾時/網路錯誤/HTTP 非預期
2. 解析失敗（必要欄位或表格缺失）
3. 發生重試（retry/backoff），或需要改用 fallback 來源
4. 造成資料缺失（例如個股價格或法人買賣超無法取得且影響分析）

### 定期回顧

每週應回顧 `error_log.jsonl`：
1. 分析常見錯誤模式
2. 更新相關抓取技能說明
3. 調整 API 使用策略

## 報告結構

```markdown
# 台股盤後總結報告（YYY/MM/DD）

> 執行時間：YYYY-MM-DD HH:MM (台灣時間)
> 盤前調研：report_YYYYMMDD.md
> 資料來源：證交所、Goodinfo

---

## 📊 研判驗證總表

| 代碼 | 名稱 | 盤前研判 | 開盤 | 收盤 | 漲跌% | 法人買賣超 | 結果 |
|------|------|----------|------|------|-------|------------|------|
| 3481 | 群創 | ⬆️ 利多 | 21.5 | 23.0 | +6.98% | +78,960 | ✅ 符合 |
| 2409 | 友達 | ⬇️ 利空 | 18.2 | 17.8 | -2.20% | -5,230 | ✅ 符合 |

---

## 📈 統計摘要

- 總計研判：X 檔
- ✅ 符合：Y 檔（XX%）
- ❌ 誤判：Z 檔（XX%）
- ➖ 中性：W 檔（不計入）

---

## ✅ 符合分析

### 1. 群創（3481）- 利多符合
- **盤前理由**：法人買超 7.9 萬張
- **實際表現**：收盤 +6.98%，法人持續買超
- **符合原因**：法人動向與股價走勢一致

---

## ❌ 誤判分析

### 1. XXX（XXXX）- 利多誤判
- **盤前理由**：...
- **實際表現**：...
- **誤判原因**：...（如：大盤拖累、消息面變化、法人反手等）

---

## 💡 後續建議

1. **強化因子**：...
2. **注意事項**：...
3. **調整方向**：...
```

## 誤判原因分類

常見誤判原因供分析參考：

| 類型 | 說明 |
|------|------|
| 大盤拖累 | 個股利多但大盤重挫 |
| 消息面變化 | 盤中出現新利空/利多消息 |
| 法人反手 | 法人動向與預期相反 |
| 獲利了結 | 連續上漲後回檔 |
| 利多出盡 | 好消息公布後反而下跌 |
| 預期落差 | 實際數據不如預期 |
| 籌碼面壓力 | 融資過高、大戶出貨 |

## 快速執行

```
請執行台股盤後總結任務：
1. 檢查是否為交易日
2. 讀取今日盤前調研報告的個股影響總表
3. 調用 fetch-twse 技能抓取各股開收盤價（上市）；若查無資料則改用 fetch-tpex（上櫃）；若仍查無資料則改用 fetch-emerging（興櫃）
4. 調用 fetch-institutional-net-buy-sell 技能抓取三大法人買賣超（逐檔、指定日期；官方 TWSE+TPEX）
5. 比對研判結果
6. 分析符合/誤判原因
7. 產出 report_YYYYMMDD.md
8. 推送至 GitHub
```
