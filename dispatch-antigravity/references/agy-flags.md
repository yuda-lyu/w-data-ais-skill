# agy CLI 旗標參考（agy 1.1.4，2026-07-19 實證）

來源：下載官方 GitHub release `1.1.4`（google-antigravity/antigravity-cli，2026-07-18 發佈）之 Windows binary，於隔離目錄執行 `--help`、`--version`、`models` 取得（非第三方教學引用）；版本沿革取自官方 releases 頁 changelog。

## 主命令旗標（`agy [flags]`）

| 旗標 | 短旗 | 預設 | 說明 |
|------|------|------|------|
| `--add-dir <path>` | — | — | 將指定目錄加入 workspace（可重複指定多個） |
| `--agent <name>` | — | — | 指定本次 session 使用的自訂 agent（1.1.1+） |
| `--continue` | `-c` | — | 接續最近一次對話 |
| `--conversation <id>` | — | — | 用對話 ID 恢復先前 session |
| `--dangerously-skip-permissions` | — | false | **自動核准所有工具權限請求**（非互動 / CI 模式必加） |
| `--log-file <path>` | — | — | 覆寫 CLI log 檔路徑 |
| `--mode <mode>` | — | — | 設定本次 session 的執行模式：`accept-edits` / `plan`（1.1.0+；不設＝預設行為） |
| `--model <name>` | — | — | **指定本次 session 的模型**（1.0.5+）；值為 `agy models` 列出的顯示名稱，含空格與括號須整段加引號 |
| `--new-project` | — | — | 為本次 session 建立新 project |
| `--print <text>` | `-p` | — | **單次非互動模式**：跑一次 prompt 印結果後退出（subprocess 用） |
| `--prompt <text>` | — | — | 等同 `--print` |
| `--prompt-interactive <text>` | `-i` | — | 帶起始 prompt，但仍進入互動模式 |
| `--print-timeout <duration>` | — | `5m0s` | print 模式等待回應的 timeout（如 `30s`, `2m`, `10m`） |
| `--project <id>` | — | — | 指定本次 session 的 project ID |
| `--sandbox` | — | false | 啟用 terminal 沙箱限制（會影響網路 / 檔案操作） |
| `--version` | — | — | 顯示版本 |
| `--help` | `-h` | — | 顯示說明 |

## 子命令

| 子命令 | 用途 |
|--------|------|
| `agy agent` / `agy agents` | 列出可用 agents（1.1.1+） |
| `agy changelog` | 顯示變更紀錄 |
| `agy help` | 子命令說明 |
| `agy install [--dir <path>] [--skip-aliases] [--skip-path]` | 配置 PATH 與 shell 設定 |
| `agy models` | **列出可用模型**（1.0.5+） |
| `agy plugin ...` / `agy plugins` | 管理 plugin（install / uninstall / list / enable / disable） |
| `agy update` | 更新 CLI 自身 |

## 可用模型（`agy models` 1.1.4 實測輸出）

```
Gemini 3.5 Flash (Medium)
Gemini 3.5 Flash (High)
Gemini 3.5 Flash (Low)
Gemini 3.1 Pro (Low)
Gemini 3.1 Pro (High)
Claude Sonnet 4.6 (Thinking)
Claude Opus 4.6 (Thinking)
GPT-OSS 120B (Medium)
```

- **最強模型＋最深思考 ＝ `Gemini 3.1 Pro (High)`**（本 skill 預設）。
- 思考深度內嵌於模型變體名（`(Low)`/`(Medium)`/`(High)`、Claude 之 `(Thinking)`），無獨立思考深度旗標。
- `--model` 解析失敗行為：**1.1.2 起 print 模式硬性失敗（非零 exit）並列出可用模型**；1.1.1 及以前會靜默降回預設模型（危險，建議升級）。互動模式維持「降級＋警告」。

## 重要不支援項目（agy 1.1.4 確認沒有）

| 期望旗標 | 實際 | 影響 |
|---------|------|------|
| `-m` 短旗 | ❌ 不存在 | 模型旗標只有全名 `--model` |
| `--reasoning <level>` / `--thinking` / `--effort` | ❌ 不存在 | 思考深度以模型變體名（`(High)`/`(Thinking)`）選擇，無獨立旗標 |
| `--output-format json` / `-o json` | ❌ 不存在 | 沒有官方結構化輸出；只能 parse plain text stdout |
| `--temperature` / `--top-p` | ❌ 不存在 | 採樣參數無法調整 |
| `--workdir <path>` | ❌ 不存在 | 用 `--add-dir` 加 workspace；cwd 仍以執行目錄為主（透過 dispatch-cli 的 `CLI_CWD` 控制） |

## 版本沿革（與派工相關者）

| 版本 | 日期 | 派工相關變更 |
|------|------|------|
| 1.0.5 | 2026-06 | 新增 `--model` 旗標與 `models` 子命令 |
| 1.1.0 | 2026-07-08 | `--mode`（`accept-edits`/`plan`）公開；request-review 成為互動預設行為 |
| 1.1.1 | 2026-07-10 | 新增 `--agent` 旗標與 `agent/agents` 子命令；**print 模式 server 端失敗改回非零 exit + stderr**（先前靜默成功、輸出空白）；**修正 `agy -p` 在 shell script / subprocess 內因讀 stdin 而 hang**（prompt 由旗標提供時不再讀 stdin） |
| 1.1.2 | 2026-07-13 | **`--model` 解析失敗時 print 模式硬性失敗並列出可用模型**；print 模式支援經 controlling terminal 貼 OAuth code，純 headless 直接 fail fast |
| 1.1.3 | 2026-07-16 | headless 需權限確認的工具改為 soft-deny + stderr 提示所需 allow-rule（未帶 `--dangerously-skip-permissions` 時不再 hang／誤自動核准） |
| 1.1.4 | 2026-07-18 | headless（`-p`）改為遵循 `settings.json` 之 permissions / sandbox / auto-execution 等政策 |

## 認證

agy 首次執行 `-p` 模式時若未登入會嘗試 OAuth。在純 CI / 無桌面環境的對策：
- 先在桌面互動模式跑一次 `agy` 完成 OAuth（憑證會快取在 `%USERPROFILE%\.agy\` 或 `~/.agy/`）
- 已登入 Antigravity 2.0 desktop IDE 的使用者，agy CLI 通常自動沿用同一份 OAuth 憑證
- 1.1.2 起：stdin 被 prompt 佔用時可經 controlling terminal（POSIX `/dev/tty`、Windows `CONIN$`）貼授權碼；真正無終端的 headless 會 fail fast 給明確錯誤，不再無限卡住

## 安裝路徑（Windows 實證）

- 安裝指令：`irm https://antigravity.google/cli/install.ps1 | iex`
- 預設安裝位置：`%LOCALAPPDATA%\agy\bin\agy.exe`
- 需手動加入 PATH（安裝腳本會印出說明）；新開 shell 才能直接用 `agy`
- 確認版本：`agy --version`；過舊以 `agy update` 升級（最新 1.1.4）

## 退出碼

- `0` = 成功
- 非 0 = 失敗；1.1.1 起 server 端請求失敗、1.1.2 起 `--model` 解析失敗，print 模式皆保證非零 exit 並寫 stderr（更早版本存在「失敗仍 exit 0 且輸出空白」的陷阱）
