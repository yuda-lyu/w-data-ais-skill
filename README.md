# AI 共享 Skills 庫

AI Agent 的技能模組庫。

## 用途

- 存放可重複使用的 AI agent 技能模組
- 支援多 agent 共用同一技能庫
- 每個技能包含 `SKILL.md` 與可選的 `scripts/` 腳本
- 目前以台股研究、自動化抓取、模型額度檢查為主

## 目錄結構

```text
.
├── check-all-quota/
│   ├── SKILL.md
│   └── scripts/
│       └── check_quota_batch.py
├── check-antigravity-quota/
│   ├── SKILL.md
│   └── scripts/
│       └── check_quota.py
├── check-codex-quota/
│   ├── SKILL.md
│   └── scripts/
│       ├── check_codex_quota.py
│       └── check_quota.py
├── fetch-cnyes/
│   ├── SKILL.md
│   └── scripts/
│       └── fetch_cnyes.mjs
├── fetch-institutional-net-buy-sell/
│   ├── SKILL.md
│   └── scripts/
│       ├── fetch_tpex_3insti.mjs
│       └── fetch_twse_t86.mjs
├── fetch-moneydj/
│   ├── SKILL.md
│   └── scripts/
│       └── fetch_moneydj.mjs
├── fetch-mops/
│   ├── SKILL.md
│   └── scripts/
│       └── fetch_mops.mjs
├── fetch-statementdog/
│   ├── SKILL.md
│   └── scripts/
│       └── fetch_statementdog.mjs
├── fetch-tpex/
│   ├── SKILL.md
│   └── scripts/
│       └── fetch_tpex.mjs
├── fetch-twse/
│   ├── SKILL.md
│   └── scripts/
│       └── fetch_twse.mjs
├── tw-stock-post-market/
│   ├── SKILL.md
│   └── scripts/
│       └── generate_report.mjs
└── tw-stock-research/
    ├── SKILL.md
    └── scripts/
        └── generate_report.mjs
```

## 現有技能清單

### 綜合分析類
| 技能 | 說明 | 主要腳本 |
|------|------|----------|
| `tw-stock-research` | 台股盤前調研，整合多來源新聞、公告與個股影響判斷 | `generate_report.mjs` |
| `tw-stock-post-market` | 台股盤後總結，驗證盤前研判與實際走勢 | `generate_report.mjs` |

### 數據抓取類（Fetchers）
| 技能 | 說明 | 主要腳本 |
|------|------|----------|
| `fetch-mops` | 抓取 MOPS 重大公告（上市 / 上櫃 / 興櫃 / 公開發行） | `fetch_mops.mjs` |
| `fetch-cnyes` | 抓取鉅亨網台股新聞 | `fetch_cnyes.mjs` |
| `fetch-statementdog` | 抓取財報狗產業新聞 | `fetch_statementdog.mjs` |
| `fetch-moneydj` | 抓取 MoneyDJ 營收與法說會新聞 | `fetch_moneydj.mjs` |
| `fetch-twse` | 抓取證交所個股或全市場成交資訊 | `fetch_twse.mjs` |
| `fetch-tpex` | 抓取櫃買中心個股或全市場成交資訊 | `fetch_tpex.mjs` |
| `fetch-institutional-net-buy-sell` | 抓取三大法人買賣超（官方 TWSE / TPEX） | `fetch_twse_t86.mjs`, `fetch_tpex_3insti.mjs` |

### 額度 / 配額檢查類
| 技能 | 說明 | 主要腳本 |
|------|------|----------|
| `check-all-quota` | 批次檢查多個模型或服務的可用額度 / quota 狀態 | `check_quota_batch.py` |
| `check-codex-quota` | 檢查 Codex 相關額度 / quota 狀態 | `check_codex_quota.py`, `check_quota.py` |
| `check-antigravity-quota` | 檢查 Antigravity 類服務額度 / quota 狀態 | `check_quota.py` |

## 使用方式

- Agent 可透過讀取各技能目錄下的 `SKILL.md` 了解如何使用技能。
- 技能腳本以 Node.js 或 Python 撰寫，依各技能目錄內容為準。
- 若技能有外部依賴，請依 `SKILL.md` 說明先完成安裝。

## License

MIT
