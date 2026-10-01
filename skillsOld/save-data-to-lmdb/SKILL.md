---
name: save-data-to-lmdb
description: 將任意資料陣列寫入本機 LMDB 並自動去重，去重主鍵由呼叫端以 pk 參數指定欄位名稱（預設 'pk'），取該欄位值作為記錄主鍵。走 LMDB key 路徑逐筆去重（O(k)，不隨資料量成長變慢），回傳新增／重複筆數與實際新增的項目。適用於 AI Agent 反覆抓取外部資料後只保留新項目、增量匯入知識庫、批次資料落地等場景。
---

# save-data-to-lmdb — 資料寫入本機 LMDB（依 pk 去重）

## 概述

把一批資料寫進本機 LMDB，**已存在的自動略過、只回傳真正新增的項目**。

**特點**：
- **主鍵由外部決定**：以 `pk` 指定「哪個欄位是不重複主鍵」，取該欄位值作為記錄主鍵；不同資料集用不同欄位（`code` / `url` / `sid` / `id`…）皆可
- **去重走 LMDB key 路徑**：逐筆 insert，`nInserted===1` 即為新項目；為 O(k) 操作，**不隨資料量成長而變慢**，也沒有網路超時／重試競態
- **同批內重複亦會偵測**：同一批出現相同 pk 值時第一筆勝出，其餘計入 `dupCount`
- **既有記錄不被覆寫**：pk 已存在時整筆略過（不做 merge／update），保留首次寫入的內容

**適用場景**：
- AI Agent 反覆抓取外部資料（新聞／清單／報表），只想取出「這次才出現的新項目」
- 增量匯入知識庫、批次資料落地

**不適用**：
- 需要「存在就更新」的 upsert 語意（本技能存在即略過；upsert 請直接用 `w-orm-lmdb` 的 `save()`）
- 需要跨機共享的資料庫（LMDB 為本機嵌入式資料庫）

## 主鍵設計（最重要的一節）

`w-orm-lmdb` **固定以記錄的 `id` 欄位作為 LMDB key**，且 insert 時若 `id` 不是「非空字串」，會自動以 `genIDSeq()` 產生**隨機值**（`w-orm-lmdb/src/WOrmLmdb.mjs:212-214`）。

隨機 id 代表每次寫入都是新 key ——**去重會靜默失效，而且不會報錯**。

因此本技能：

1. 以 `pk` 指定主鍵欄位名稱（預設 `'pk'`）
2. 取 `item[pk]` 的值，**強制轉為字串**後寫入 `id`（故數字型主鍵如 `2317` 也能正確去重，與字串 `'2317'` 視為同一筆）
3. 任一筆缺少可用的 pk 值（`null` / `undefined` / 空白字串 / 物件）→ **整批拒絕並回報 index**，絕不放行讓它被隨機 id 覆寫

> ⚠ **實際寫入的記錄會帶上 `id` 欄位**（值＝該筆的 pk 值）。若 `pk` 不是 `'id'` 且原資料本身已有 `id` 欄位，該欄位**會被覆寫**。
>
> ⚠ **pk 欄位須為「同一筆資料的穩定識別」**。若指定到會隨每次抓取而微變的欄位（例如逐次重抓會差幾個字的內文摘要，或同篇文章來源不同的 `from`），同一筆會被當成新項目而重複儲存。

## 安裝指引

> **[執行AI須先依照技能內說明安裝指定依賴之套件]**

所需 npm 套件：`w-orm-lmdb`

執行前驗證：
```bash
node -e "import('w-orm-lmdb').then(()=>console.log('w-orm-lmdb OK'))"
```

若顯示錯誤則安裝（安裝位置由執行環境決定，需確保腳本的模組解析路徑可達）：
```bash
npm install w-orm-lmdb
```

> `w-orm-lmdb` 相依的 `lmdb` 為原生模組，安裝時可能出現 `allow-scripts` 警告；實測即使 install script 未執行仍可正常載入（走 prebuilt binary）。

## 執行方式

### CLI

```bash
node save-data-to-lmdb/scripts/save_data_to_lmdb.mjs \
  --items <items.json> --db-path <dir> \
  [--db <name>] [--cl <name>] [--pk <field>] [--output <out.json>]
```

範例：

```bash
# 以 sid 欄位為主鍵寫入
node save-data-to-lmdb/scripts/save_data_to_lmdb.mjs \
  --items ./tmp/items.json --db-path ./tmp/mydb --pk sid --output ./tmp/out.json

# 以 url 為主鍵（抓取類資料常用）
node save-data-to-lmdb/scripts/save_data_to_lmdb.mjs \
  --items ./tmp/news.json --db-path ./tmp/newsdb --db news --cl items --pk url
```

### 旗標

| 旗標 | 必要 | 說明 |
|---|---|---|
| `--items <path>` | ✅ | 資料來源 JSON 檔；內容為陣列，或含 `itemsNew` / `items` 陣列欄位之物件 |
| `--db-path <dir>` | ✅ | LMDB 資料夾路徑 |
| `--db <name>` | ❌ | 資料庫名稱，預設 `name-db` |
| `--cl <name>` | ❌ | 集合名稱，預設 `name-cl` |
| `--pk <field>` | ❌ | 主鍵欄位名稱，預設 `pk` |
| `--output <path>` | ❌ | 輸出結果 JSON；未指定則全量印至 stdout。指定時 stdout 只印摘要（`itemsAdd` 以筆數代替），完整內容寫入檔案 |

### 程式化呼叫

```javascript
import { saveDataToLmdb } from './save-data-to-lmdb/scripts/saveDataToLmdb.mjs';

const r = await saveDataToLmdb({
  dbPath: './tmp/mydb',     // 必填，LMDB 資料夾路徑
  db: 'name-db',            // 預設 'name-db'
  cl: 'name-cl',            // 預設 'name-cl'
  pk: 'code',               // 主鍵欄位名稱，預設 'pk'
  itemsNew: [
    { code: '2330', name: '台積電' },
    { code: 2317, name: '鴻海' },     // 數字型主鍵亦可
  ],
});

if (r.status === 'success') {
  console.log(`新增 ${r.result.addCount} 筆、重複 ${r.result.dupCount} 筆`);
  for (const it of r.result.itemsAdd) {
    // 只處理這次才出現的新項目（例如推播、後續分析）
  }
}
```

## 輸出格式

### 成功（`status: "success"`）

```json
{
  "status": "success",
  "savedAt": "2026-07-28 11:28:27",
  "result": {
    "ok": true,
    "code": "SUCCESS",
    "message": "處理完成",
    "receivedCount": 3,
    "addCount": 2,
    "dupCount": 1,
    "itemsAdd": [ { "sid": "A1", "title": "第一筆" }, { "sid": "A2", "title": "第二筆" } ]
  }
}
```

- `receivedCount` — 收到的筆數（＝`itemsNew.length`）
- `addCount` / `dupCount` — 實際新增／判定為重複的筆數，兩者相加等於 `receivedCount`
- `itemsAdd` — **實際新增的原始項目**（不含補上的 `id` 欄位），供呼叫端接續處理

### 錯誤（`status: "error"`）

```json
{
  "status": "error",
  "message": "2 item(s) missing a usable \"code\" value (index: 1, 2)"
}
```

錯誤情況：
- `Missing required field: dbPath` — 未指定 LMDB 路徑
- `Invalid field: pk` — `pk` 非非空字串
- `Missing required field: itemsNew` — 未給資料或給了空陣列
- `N item(s) missing a usable "<pk>" value (index: ...)` — 有資料缺主鍵值，**整批未寫入**
- `N item(s) have a "<pk>" value longer than 1000 bytes` — 主鍵過長（LMDB key 有長度上限），請改用較短欄位或於呼叫端先自行雜湊
- `open lmdb failed: ...` / `insert failed: ...` — 開啟或寫入失敗

## status 約定

依全庫慣例：
- `status: "success"` — 寫入流程完成（**即使 `addCount` 為 0**，全部重複也算成功）
- `status: "error"` — 參數不合法、主鍵缺失／過長、LMDB 開啟或寫入失敗

CLI 以 exit code 反映：`0` 為 success、`1` 為 error。

## 邊界與已知限制

1. **存在即略過，不做更新**：pk 已存在時整筆不寫入，DB 保留首次版本。需要 upsert 請改用 `w-orm-lmdb` 的 `save()`。
2. **主鍵過長會被擋下**：LMDB key 有長度上限（lmdb-js 預設 1978 bytes），本技能保守限制在 1000 bytes 並提前報錯，而非讓寫入在底層失敗。
3. **缺主鍵為整批拒絕**：不採「跳過壞資料、寫入其餘」，因為部分寫入會讓 `addCount` 與實際狀態不一致，難以除錯。
4. **檔案鎖**：本模組於 `finally` 呼叫 `wo.close()` 釋放 LMDB env 的檔案鎖。**Windows 下若未關閉，該資料夾會被行程持有** —— 刪除會靜默失敗或留下殘骸，且存活的舊行程仍讀得到舊映射（全域規範 §11.4）。自行改寫此流程時務必保留 close。
5. **單行程寫入**：未處理多行程同時寫同一 LMDB 的競態；批次排程請確保同一 DB 路徑同時只有一個寫入者。
