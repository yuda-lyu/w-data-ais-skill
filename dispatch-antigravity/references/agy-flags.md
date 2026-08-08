# agy CLI 旗標參考（agy 1.1.11，2026-08-07 實證）

來源：本機 `agy --help`、`agy models`、`agy --version`（1.1.11＝GitHub releases 最新，發佈於 2026-08-07）。

> ⚠ **agy 改版頻繁**：1.1.4 → 1.1.11 期間模型清單與旗標皆有變動（新增 `--effort`、`--output-format`、`--json-schema`；`models` 輸出格式改為兩欄）。
> **使用前請一律先跑 `agy models` 與 `agy --help` 對照本檔**，勿直接沿用表格。

## 主命令旗標（`agy [flags]`）

| 旗標 | 短旗 | 預設 | 說明 |
|------|------|------|------|
| `--add-dir <path>` | — | — | 將指定目錄加入 workspace（可重複指定多個） |
| `--agent <name>` | — | — | 指定本次 session 使用的自訂 agent（1.1.1+） |
| `--continue` | `-c` | — | 接續最近一次對話 |
| `--conversation <id>` | — | — | 用對話 ID 恢復先前 session |
| `--dangerously-skip-permissions` | — | false | **自動核准所有工具權限請求**（非互動 / CI 模式必加） |
| `--disable-slash-commands` | — | false | 停用 print 模式的 slash command 與 skill 展開（**1.1.11 新增**） |
| `--effort <level>` | — | — | **推理深度 `low`/`medium`/`high`（1.1.11 新增）**；早前版本無此旗標 |
| `--json-schema <schema>` | — | — | JSON schema 字串或檔案路徑，強制結構化輸出（**1.1.11 新增**；`stream-json` 下僅套用於最終結果） |
| `--log-file <path>` | — | — | 覆寫 CLI log 檔路徑 |
| `--mode <mode>` | — | — | 執行模式：`accept-edits` / `plan`（1.1.0+） |
| `--model <slug>` | — | — | **指定模型**（1.0.5+）；1.1.11 起值為 `agy models` **第一欄 slug** |
| `--new-project` | — | — | 為本次 session 建立新 project |
| `--output-format <fmt>` | — | `text` | print 模式輸出格式：`text` / `json` / `stream-json`（**1.1.11 新增**） |
| `--print <text>` | `-p` | — | **單次非互動模式**：跑一次 prompt 印結果後退出（subprocess 用） |
| `--print-timeout <duration>` | — | `5m0s` | print 模式等待回應的 timeout（如 `30s`, `2m`, `10m`） |
| `--project <id>` | — | — | 指定本次 session 的 project ID |
| `--prompt <text>` | — | — | 等同 `--print` |
| `--prompt-interactive <text>` | `-i` | — | 帶起始 prompt，但仍進入互動模式 |
| `--sandbox` | — | false | 啟用 terminal 沙箱限制（會影響網路 / 檔案操作） |

## 子命令

| 子命令 | 用途 |
|--------|------|
| `agy models` | **列出可用模型**（1.0.5+；1.1.11 起輸出 `<slug>` TAB `<顯示名稱>` 兩欄） |
| `agy agent` / `agy agents` | 列出可用 agents（1.1.1+） |
| `agy changelog` | 顯示變更紀錄 |
| `agy install` | 配置 PATH 與 shell 設定 |
| `agy plugin ...` / `agy plugins` | 管理 plugin |
| `agy update` | 更新 CLI 自身 |

## 可用模型（`agy models` 1.1.11 實測輸出）

```
gemini-3.6-flash-high       Gemini 3.6 Flash (High)
gemini-3.6-flash-medium     Gemini 3.6 Flash (Medium)
gemini-3.6-flash-low        Gemini 3.6 Flash (Low)
gemini-3.5-flash-high       Gemini 3.5 Flash (High)
gemini-3.5-flash-medium     Gemini 3.5 Flash (Medium)
gemini-3.5-flash-low        Gemini 3.5 Flash (Low)
gemini-3.1-pro-high         Gemini 3.1 Pro (High)
gemini-3.1-pro-low          Gemini 3.1 Pro (Low)
claude-sonnet-4-6           Claude Sonnet 4.6 (Thinking)
claude-opus-4-6-thinking    Claude Opus 4.6 (Thinking)
gpt-oss-120b-medium         GPT-OSS 120B (Medium)
```

- **最強模型＋最深思考 ＝ `gemini-3.1-pro-high`**（本 skill 預設）。
- **Gemini 3.1 Pro 僅 high／low 兩檔，無 medium**；Flash 家族才有三檔。
- `--model` 傳**第一欄 slug**；第二欄顯示名稱供人辨識。**1.1.11 是否仍接受顯示名稱未經實證**，以 slug 為準。
- 1.1.11 新增 Gemini 3.6 Flash 家族。

## 思考深度：兩個管道並存

| 管道 | 說明 |
|---|---|
| 模型變體名內嵌檔位 | 如 `gemini-3.1-pro-high`；本 skill 預設採此 |
| `--effort <low\|medium\|high>` | **1.1.11 新增之獨立旗標** |

> ⚠ **兩者同時給定時的優先順序未經實證**（本庫規範禁止實跑 dispatch-* 技能）。
> 本 skill 預設只用模型名內嵌檔位，不額外帶 `--effort`。

## 版本沿革（與派工相關者）

| 版本 | 派工相關變更 |
|------|------|
| 1.0.5 | 新增 `--model` 旗標與 `models` 子命令 |
| 1.1.0 | `--mode`（`accept-edits`/`plan`）公開 |
| 1.1.1 | 新增 `--agent`；**print 模式 server 端失敗改回非零 exit + stderr**；修正 `agy -p` 在 subprocess 內因讀 stdin 而 hang |
| 1.1.2 | **`--model` 解析失敗時 print 模式硬性失敗並列出可用模型** |
| 1.1.3 | headless 需權限確認的工具改為 soft-deny + stderr 提示 |
| 1.1.4 | headless（`-p`）改為遵循 `settings.json` 之 permissions / sandbox 等政策 |
| **1.1.11** | **新增 `--effort`、`--output-format`、`--json-schema`、`--disable-slash-commands`；`models` 改輸出 slug+顯示名兩欄；新增 Gemini 3.6 Flash 家族** |

## 先前版本已不成立的記載（本檔更正）

| 舊記載 | 1.1.11 現況 |
|---|---|
| 「沒有 `--reasoning`/`--thinking`/`--effort`，思考深度只能靠模型變體名」 | ✅ **已有 `--effort low\|medium\|high`** |
| 「沒有 `-o json` 結構化輸出，只能 parse plain text」 | ✅ **已有 `--output-format json\|stream-json` + `--json-schema`** |
| 「`--model` 傳顯示名稱（含空格括號須加引號）」 | 改傳 slug（`gemini-3.1-pro-high`），無空格 |

## 仍不支援（1.1.11 確認）

| 期望旗標 | 實際 |
|---------|------|
| `-m` 短旗 | ❌ 模型旗標只有全名 `--model` |
| `--temperature` / `--top-p` | ❌ 採樣參數無法調整 |
| `--workdir <path>` | ❌ 用 `--add-dir` 加 workspace；cwd 透過 dispatch-cli 的 `CLI_CWD` 控制 |

## 認證

- 先在桌面互動模式跑一次 `agy` 完成 OAuth（憑證快取於 `%USERPROFILE%\.agy\` 或 `~/.agy/`）
- 已登入 Antigravity 2.0 desktop IDE 者，agy CLI 通常自動沿用同一份 OAuth
- 1.1.2 起：stdin 被 prompt 佔用時可經 controlling terminal 貼授權碼；真正無終端的 headless 會 fail fast

## 安裝與更新

```bash
irm https://antigravity.google/cli/install.ps1 | iex   # Windows 首次安裝
agy update                                            # 更新（安裝腳本遇既有安裝可能跳過，用此指令較可靠）
agy --version                                         # 實測 1.1.11
```

預設安裝位置：`%LOCALAPPDATA%\agy\bin\agy.exe`

## 退出碼

- `0` = 成功
- 非 0 = 失敗；1.1.1 起 server 端請求失敗、1.1.2 起 `--model` 解析失敗，print 模式皆保證非零 exit 並寫 stderr
