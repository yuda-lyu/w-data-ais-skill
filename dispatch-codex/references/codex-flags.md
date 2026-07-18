# Codex CLI 旗標完整參考

來源（官方文件）：
- https://developers.openai.com/codex/config-advanced
- https://developers.openai.com/codex/noninteractive
- https://developers.openai.com/codex/config-reference

來源（原始碼確認 @ rust-v0.144.3；本機 `codex exec --help` 實測 v0.144.6，2026-07-19）：
- `codex-rs/exec/src/cli.rs`（@ rust-v0.144.3）
- `codex-rs/protocol/src/openai_models.rs`（@ rust-v0.144.3）
- `codex-rs/models-manager/models.json`（@ rust-v0.144.3）

> npm 最新發佈版 0.144.6（2026-07-19 查核）。

## codex exec 子命令

`codex exec` 是專為非互動/自動化設計的入口點，與直接執行 `codex` 不同。

```
codex exec [OPTIONS] "task prompt"
```

### 主要選項

| 選項 | 說明 |
|------|------|
| `-m, --model <MODEL>` | 指定模型（例：`gpt-5.6-sol`。本 skill 預設使用 `gpt-5.6-sol`） |
| `-s, --sandbox <MODE>` | 沙箱模式：`read-only` / `workspace-write` / `danger-full-access`；**headless 自動寫檔用 `--sandbox workspace-write`（取代已棄用之 `--full-auto`）** |
| `--full-auto` | **已棄用（v0.144.x）**：原始碼標為 hidden「Legacy compatibility trap」，執行印警告 `--full-auto is deprecated; use --sandbox workspace-write instead`；勿再使用 |
| `--dangerously-bypass-approvals-and-sandbox` | 跳過所有核准且停用沙箱（危險；`--yolo` 別名已不在 v0.144.x help 列出） |
| `--dangerously-bypass-hook-trust` | 免 hook 信任確認直接執行 hooks（危險，僅限已自行審核 hook 來源的自動化） |
| `--strict-config` | config.toml 含本版不認得的欄位時直接報錯 |
| `--skip-git-repo-check` | 跳過 git repo 信任目錄檢查 |
| `--json` | 以 JSONL 格式輸出事件流，適合 script 解析（舊名 `--experimental-json` 仍為別名） |
| `--ephemeral` | 不儲存 session 到磁碟，適合暫時性任務 |
| `--ignore-user-config` | 不載入 `$CODEX_HOME/config.toml`（認證仍會讀取） |
| `--ignore-rules` | 跳過 user/project 的 execpolicy 規則 |
| `--enable <FEATURE>` / `--disable <FEATURE>` | v0.124.0+：啟/停特定功能（可重複），等同 `-c features.<name>=true/false` |
| `-o, --output-last-message <FILE>` | 將最終訊息寫入檔案 |
| `--output-schema <FILE>` | 強制最終回應符合 JSON Schema |
| `-C, --cd <DIR>` | 指定工作目錄 |
| `--add-dir <DIR>` | 額外可寫入目錄（可重複） |
| `-i, --image <FILE>` | 附加圖片（可重複或逗號分隔） |
| `-p, --profile <NAME>` | 載入 `~/.codex/config.toml` 中的 profile |
| `-c, --config <key=value>` | 覆蓋任意設定（可重複；RHS 以 TOML 解析，失敗退為字串） |
| `--oss` / `--local-provider <lmstudio\|ollama>` | 使用本地模型 |
| `--color <always\|never\|auto>` | 顏色輸出控制 |

### --config 旗標（點記法覆蓋設定）

```bash
# 啟用網路存取（允許 npm install 等）
--config sandbox_workspace_write.network_access=true

# 指定模型（本 skill 預設使用最新旗艦 gpt-5.6-sol）
--config model='"gpt-5.6-sol"'

# 推理等級（預設使用最深 max；ultra 為 Sol 專屬 max+自動子代理模式）
--config model_reasoning_effort='"max"'

# 推理摘要輸出格式
--config model_reasoning_summary='"concise"'

# 回應詳細程度
--config model_verbosity='"medium"'

# 值以 TOML 格式解析；包含空格時需加引號
```

### 推理相關設定

| 設定 | 可選值 | 說明 |
|------|--------|------|
| `model_reasoning_effort` | `none` / `minimal` / `low` / `medium` / `high` / `xhigh` / `max` / `ultra`（另接受自訂字串） | 推理深度：`max` 為最深單任務推理（gpt-5.6 全系支援）；`ultra` 為 Sol 專屬「max 推理＋自動子代理派工」執行模式（部分入口需於 app 設定啟用）。enum 出處 `openai_models.rs` @ rust-v0.144.3 |
| `plan_mode_reasoning_effort` | 同上 | Plan mode 預設推理深度 |
| `model_reasoning_summary` | `auto` / `concise` / `detailed` / `none` | 推理摘要輸出格式 |
| `model_verbosity` | `low` / `medium` / `high` | 回應長度控制 |

### --profile 命名設定檔（v0.144.x 為 v2 檔案制）

```bash
# 使用命名設定檔（疊加 $CODEX_HOME/<name>.config.toml 於基礎設定之上）
codex exec --profile deep "你的任務描述"
```

對應獨立檔案 `~/.codex/deep.config.toml`（**v2 profile 為一名一檔，非舊版 config.toml 內 `[profiles.x]` 段落**）：

```toml
model = "gpt-5.6-sol"
model_reasoning_effort = "max"
```

## 對應的 config.toml 設定

`~/.codex/config.toml` 中的等效設定：

```toml
model = "gpt-5.6-sol"
sandbox_mode = "workspace-write"
model_reasoning_effort = "max"
model_reasoning_summary = "concise"
model_verbosity = "medium"

[sandbox_workspace_write]
network_access = true
```

## 多 agent 情境中的 Resume / Review 功能

```bash
# 繼續上次 session
codex exec resume --last "繼續之前的任務"

# 以 session ID 繼續
codex exec resume <SESSION_ID> "追加指令"

# 程式碼審查子命令
codex exec review --base main "審查相對 main 的變更"
codex exec review --commit <SHA>
codex exec review --uncommitted
```

## 可用模型

| 模型 ID | 說明 |
|---------|------|
| `gpt-5.6-sol` | **本 skill 預設**，GPT-5.6 旗艦（frontier，priority=1），高難度開放式任務；372K context；唯一支援 `ultra` 推理檔 |
| `gpt-5.6-terra` | 均衡日常主力（priority=2），372K context |
| `gpt-5.6-luna` | 快速低成本（priority=3），372K context |

> 型錄來源：[codex-rs/models-manager/models.json](https://github.com/openai/codex/blob/main/codex-rs/models-manager/models.json)（@ rust-v0.144.3 實證）
> 注意事項：
> - v0.144.3 bundled 型錄**僅含 gpt-5.6 三階**，free～enterprise 全 plan 可用；三者皆支援 `low`～`max` 推理，Sol 另支援 `ultra`。
> - 舊 `gpt-5.5` / `gpt-5.4` / `gpt-5.4-mini` / `gpt-5.3-codex` / `gpt-5.2` 已自 bundled 型錄移除，不再是建議選項。

## 已棄用／更名

| 舊名 | 現況 | 建議 |
|------|------|------|
| `--full-auto` | **v0.144.x 已棄用**：hidden「Legacy compatibility trap」，執行印棄用警告 | 改用 `--sandbox workspace-write` |
| `--yolo` | 已不在 v0.144.x help 列出 | 如確需 bypass 用全名 `--dangerously-bypass-approvals-and-sandbox`（危險） |
| `--experimental-json` | 仍為別名 | 改用 `--json` |
| `experimental_instructions_file`（config） | 已棄用，被忽略 | 改用 `model_instructions_file` |
| `--enable-auto-mode`（舊 Codex）／ 硬編碼 model presets | 已從原始碼移除 | 使用型錄檔 `models.json` 與 `--profile` |
| `[profiles.x]` 段落制 profile | v0.144.x 改為 v2 檔案制 | 一名一檔 `$CODEX_HOME/<name>.config.toml` |
