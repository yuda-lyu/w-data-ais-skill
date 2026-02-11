# AI 共享 Skills 庫

AI Agent 的技能模組庫，配合 [OpenClaw](https://github.com/nickmitchko/openclaw) 使用。

## 用途

- 存放可重複使用的 AI agent 技能模組
- 支援多 agent 共用同一技能庫
- 每個技能包含說明文件與腳本

## 目錄結構

```
.
├── tw-stock-research/                # 台股盤前調研
│   ├── SKILL.md                      # 技能說明與使用方式
│   └── scripts/                      # 相關腳本
│       └── generate_report.mjs       # 報告生成器
├── tw-stock-post-market/             # 台股盤後總結
│   ├── SKILL.md
│   └── scripts/
│       └── generate_report.mjs
├── fetch-mops/                       # MOPS 公開資訊觀測站抓取
├── fetch-cnyes/                      # 鉅亨網新聞抓取
├── fetch-statementdog/               # 財報狗新聞抓取
├── fetch-moneydj/                    # MoneyDJ 新聞抓取
├── fetch-tpex/                       # 櫃買中心 (上櫃) 股價抓取
├── fetch-twse/                       # 證交所 (上市) 股價抓取
└── fetch-institutional-net-buy-sell/ # 三大法人買賣超抓取
```

## 現有技能清單

### 綜合分析類
| 技能 | 說明 | 執行時機 |
|------|------|----------|
| `tw-stock-research` | 台股盤前調研 (整合多來源新聞與公告) | 盤前 (08:00) |
| `tw-stock-post-market` | 台股盤後總結 (驗證盤前研判與實際走勢) | 盤後 (18:00) |

### 數據抓取類 (Fetchers)
| 技能 | 說明 | 主要腳本 |
|------|------|----------|
| `fetch-mops` | 抓取 MOPS 重大公告 (上市/上櫃/興櫃/公開發行) | `fetch_mops.mjs` |
| `fetch-cnyes` | 抓取鉅亨網台股新聞 | `fetch_cnyes.mjs` |
| `fetch-statementdog` | 抓取財報狗產業新聞 | `fetch_statementdog.mjs` |
| `fetch-moneydj` | 抓取 MoneyDJ 營收與法說會新聞 | `fetch_moneydj.mjs` |
| `fetch-twse` | 抓取證交所個股或全市場成交資訊 | `fetch_twse.mjs` |
| `fetch-tpex` | 抓取櫃買中心個股或全市場成交資訊 | `fetch_tpex.mjs` |
| `fetch-institutional-net-buy-sell` | 抓取三大法人買賣超 (官方 TWSE/TPEX) | `fetch_twse_t86.mjs`<br>`fetch_tpex_3insti.mjs` |

## 使用方式

Agent 可透過讀取各技能目錄下的 `SKILL.md` 了解如何使用該技能。所有腳本皆以 Node.js 撰寫，支援參數化執行。

## License

MIT
