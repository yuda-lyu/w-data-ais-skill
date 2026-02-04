# AI 共享 Skills 庫

AI Agent 的技能模組庫，配合 [OpenClaw](https://github.com/nickmitchko/openclaw) 使用。

## 用途

- 存放可重複使用的 AI agent 技能模組
- 支援多 agent 共用同一技能庫
- 每個技能包含說明文件與腳本

## 目錄結構

```
.
├── tw-stock-research/     # 台股調研技能
│   ├── SKILL.md           # 技能說明與使用方式
│   └── scripts/           # 相關腳本
│       └── init_task.py   # 初始化腳本
└── (其他技能模組...)
```

## 現有技能

| 技能 | 說明 |
|------|------|
| `tw-stock-research` | 台股調研分析 |

## 使用方式

Agent 可透過讀取各技能目錄下的 `SKILL.md` 了解如何使用該技能。

## License

MIT
