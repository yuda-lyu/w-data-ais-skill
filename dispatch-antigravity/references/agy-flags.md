# agy CLI 旗標參考（agy 1.0.2，2026-05 實證）

來源：實際安裝 agy 1.0.2 並執行 `agy --help`、`agy plugin --help`、`agy install --help` 取得（非第三方教學引用）。

## 主命令旗標（`agy [flags]`）

| 旗標 | 短旗 | 預設 | 說明 |
|------|------|------|------|
| `--add-dir <path>` | — | — | 將指定目錄加入 workspace（可重複指定多個） |
| `--continue` | `-c` | — | 接續最近一次對話 |
| `--conversation <id>` | — | — | 用對話 ID 恢復先前 session |
| `--dangerously-skip-permissions` | — | false | **自動核准所有工具權限請求**（非互動 / CI 模式必加） |
| `--prompt-interactive <text>` | `-i` | — | 帶起始 prompt，但仍進入互動模式 |
| `--log-file <path>` | — | — | 覆寫 CLI log 檔路徑 |
| `--print <text>` | `-p` | — | **單次非互動模式**：跑一次 prompt 印結果後退出（subprocess 用） |
| `--prompt <text>` | — | — | 等同 `--print` |
| `--print-timeout <duration>` | — | `5m0s` | print 模式等待回應的 timeout（如 `30s`, `2m`, `10m`） |
| `--sandbox` | — | false | 啟用 terminal 沙箱限制（會影響網路 / 檔案操作） |
| `--version` | — | — | 顯示版本 |
| `--help` | `-h` | — | 顯示說明 |

## 子命令

| 子命令 | 用途 |
|--------|------|
| `agy changelog` | 顯示變更紀錄 |
| `agy help` | 子命令說明 |
| `agy install [--dir <path>] [--skip-aliases] [--skip-path]` | 配置 PATH 與 shell 設定 |
| `agy plugin list` | 列出已匯入 plugin |
| `agy plugin import gemini\|claude` | 從 Gemini CLI / Claude Code 匯入 plugin |
| `agy plugin install <name@marketplace>` | 安裝 plugin |
| `agy plugin uninstall <name>` | 移除 plugin |
| `agy plugin enable <name>` / `disable <name>` | 啟停 plugin |
| `agy plugin validate [path]` | 驗證 plugin |
| `agy plugin link <mp> <target>` | 生成 marketplace 連結 |
| `agy plugins` | `plugin` 的別名 |
| `agy update` | 更新 CLI 自身 |

## 重要不支援項目（agy 1.0.2 確認沒有）

| 期望旗標 | 實際 | 影響 |
|---------|------|------|
| `--model <id>` / `-m` | ❌ 不存在 | **無法在 CLI 層選擇模型**，模型由後端決定（agy 共用 Antigravity 2.0 desktop 的 agent harness） |
| `--reasoning <level>` / `--thinking` / `--effort` | ❌ 不存在 | **無法在 CLI 層控制思考深度** |
| `--output-format json` | ❌ 不存在 | 沒有官方結構化輸出；只能 parse plain text stdout |
| `--temperature` / `--top-p` | ❌ 不存在 | 採樣參數無法調整 |
| `--workdir <path>` | ❌ 不存在 | 用 `--add-dir` 加 workspace；cwd 仍以執行目錄為主（透過 dispatch-cli 的 `CLI_CWD` 控制） |

> 對應使用者「預設使用最強的模型，與最深的思考程度」的需求：
> agy 1.0.2 沒提供旗標可顯式控制這兩件事。**目前唯一可行的做法**：在 prompt 文字內以自然語言要求模型（如「請動用最強推理能力深度思考此任務後再作答」），由 Gemini 後端自行配置思考預算（thinking budget）。

## 認證

agy 首次執行 `-p` 模式時若未登入會嘗試開瀏覽器 OAuth。在純 CI / 無 X server 環境會卡住。對策：
- 先在桌面互動模式跑一次 `agy` 完成 OAuth（憑證會快取在 `%USERPROFILE%\.agy\` 或 `~/.agy/`）
- 已登入 Antigravity 2.0 desktop IDE 的使用者，agy CLI 通常自動沿用同一份 OAuth 憑證

## 安裝路徑（Windows 實證）

- 安裝指令：`irm https://antigravity.google/cli/install.ps1 | iex`
- 預設安裝位置：`%LOCALAPPDATA%\agy\bin\agy.exe`
- 需手動加入 PATH（安裝腳本會印出說明）；新開 shell 才能直接用 `agy`
- 確認版本：`agy --version`（實證為 `1.0.2`）

## 退出碼

agy 1.0.2 退出碼未在 `--help` 文件化，實證為：
- `0` = 成功
- 非 0 = 失敗（具體分類待官方說明 / 實證補充）
