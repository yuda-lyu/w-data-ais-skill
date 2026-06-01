# _audit — 技能庫常設「確定性」審計工具

這兩支 .mjs 是從多輪 17 維度審計提煉出的**確定性檢查**：同輸入必同輸出、會收斂，可隨時重跑當回歸檢查。
用途是**取代反覆跑模糊 LLM 多代理審計**（覆蓋不確定、每輪生不同的中間地帶問題、不收斂）的「機械可驗維度」部分。

> 一律**從技能庫根目錄**執行（腳本以 `process.cwd()` 為錨點掃描所有含 `SKILL.md` 的技能目錄）。

## 1. `dep_recon.mjs` — 依賴對帳（維度 6）

```bash
node _audit/dep_recon.mjs
```

解析每支技能 `scripts/*.mjs` 的 `import`（靜態 + 動態 `import()`，並沿相對 import 遞迴進跨技能鏈），
與該技能 `SKILL.md` 安裝指引宣告的 npm 套件對比，列出「碼需要但安裝指引未列」的缺口。

- 輸出「缺口技能數: 0」= 全部技能的 import 鏈所需套件都已在安裝指引宣告（通過）。
- **限制**：只追 `import`/`import()`。透過 `spawnSync('node', [...])` **spawn 委派**的傳遞依賴（如 tw-stock 系列 spawn 子技能）不在此追蹤範圍，需另以人工/spawn 路徑分析確認。

## 2. `audit_deterministic.mjs` — 機械維度全庫掃描（維度 4/7/8/9/10/12）

```bash
node _audit/audit_deterministic.mjs
```

| 維度 | 檢查 |
|---|---|
| dim4 | 機密硬編（api key / token / password 等字面值；排除 placeholder / env） |
| dim7 | 有【安裝指引】者是否含標記字串 `[執行AI須先依照技能內說明安裝指定依賴之套件]` |
| dim8 | 是否寫「技能庫根目錄」等強制執行目錄字眼（已排除「不寫到/不污染…」負面語境） |
| dim9 | 有「重試 N 次」字樣但全篇缺「含初始…」補述 |
| dim10 | 有 fs 寫檔（writeFile 等）但無 Windows nul/保留裝置名 guard |
| dim12 | 非註解行用已棄用 `wmic`；或 `import child_process` 但無 `windowsHide` |

- 輸出「總 flag: 0」= 全部機械維度通過。
- 啟發式已收緊（dim8 排負面語境、dim12 以 `import child_process` 為準避免誤命中 regex 的 `.exec()`、wmic 排註解行）；**仍 flag 的請人工 eyeball 確認真偽**。

## 不在此工具範圍（需語意判斷，依「真痛三條件」人工判）

維度 1/2/3/5/15（SKILL.md 語意正確性、程式碼邏輯 bug、doc↔code 一致性、延時重試是否合理、article→md 五模式契約）無法純機械驗，須讀碼判斷；判準固定用真痛三條件（在合約內 + 已被觀察/可證 + 後果具體），判完即定、不反覆翻案。維度 14（Vue2 EOL）不視為問題。
