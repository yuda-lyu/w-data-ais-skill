# Codex CLI 旗標完整參考

來源（官方文件）：
- https://developers.openai.com/codex/config-advanced
- https://developers.openai.com/codex/noninteractive
- https://developers.openai.com/codex/config-reference

來源（原始碼確認，`codex-cli v0.124.0`，2026-04-24）：
- `codex-rs/exec/src/cli.rs`
- `codex-rs/utils/cli/src/shared_options.rs`
- `codex-rs/protocol/src/openai_models.rs`
- `codex-rs/models-manager/models.json`

## codex exec 子命令

`codex exec` 是專為非互動/自動化設計的入口點，與直接執行 `codex` 不同。

```
codex exec [OPTIONS] "task prompt"
```

### 主要選項

| 選項 | 說明 |
|------|------|
| `-m, --model <MODEL>` | 指定模型（例：`gpt-5.5`。本 skill 預設使用 `gpt-5.5`） |
| `--full-auto` | 自動核准所有操作，不需人工確認（沙箱仍作用） |
| `--dangerously-bypass-approvals-and-sandbox` / `--yolo` | 跳過所有核准且停用沙箱（與 `--full-auto` 互斥；危險） |
| `-s, --sandbox <MODE>` | 沙箱模式：`read-only` / `workspace-write` / `danger-full-access` |
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

# 指定模型（本 skill 預設使用最新旗艦 gpt-5.5）
--config model='"gpt-5.5"'

# 推理等級（預設使用最強 xhigh）
--config model_reasoning_effort='"xhigh"'

# 推理摘要輸出格式
--config model_reasoning_summary='"concise"'

# 回應詳細程度
--config model_verbosity='"medium"'

# 值以 TOML 格式解析；包含空格時需加引號
```

### 推理相關設定

| 設定 | 可選值 | 說明 |
|------|--------|------|
| `model_reasoning_effort` | `none` / `minimal` / `low` / `medium` / `high` / `xhigh` | 推理深度，`xhigh` 為最強（目前**沒有** `max` 等級） |
| `plan_mode_reasoning_effort` | 同上 | Plan mode 預設推理深度 |
| `model_reasoning_summary` | `auto` / `concise` / `detailed` / `none` | 推理摘要輸出格式 |
| `model_verbosity` | `low` / `medium` / `high` | 回應長度控制 |

### --profile 命名設定檔

```bash
# 使用命名設定檔
codex exec --profile deep "你的任務描述"
```

對應 `~/.codex/config.toml` 中的設定檔定義：

```toml
[profiles.deep]
model = "gpt-5.5"
model_reasoning_effort = "xhigh"

[profiles.fast]
model = "gpt-5.4-mini"
model_reasoning_effort = "low"
```

## 對應的 config.toml 設定

`~/.codex/config.toml` 中的等效設定：

```toml
model = "gpt-5.5"
sandbox_mode = "workspace-write"
model_reasoning_effort = "xhigh"
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
| `gpt-5.5` | **本 skill 預設**，OpenAI 最新旗艦（2026-04-23 發布），Codex 官方推薦首選；**僅透過 ChatGPT 登入可用**，API key 認證尚不可用 |
| `gpt-5.4` | bundled `models.json` 中的旗艦（priority=2），API key 環境下的最強可用選項 |
| `gpt-5.4-mini` | 輕量版（priority=4） |
| `gpt-5.3-codex` | 程式碼優化（priority=6） |
| `gpt-5.2` | 舊版（priority=10） |

> 型錄來源：[codex-rs/models-manager/models.json](https://github.com/openai/codex/blob/main/codex-rs/models-manager/models.json)
> 注意事項：
> - `gpt-5.5` 目前（2026-04-24）**尚未加入 bundled `models.json`**，但 CLI v0.124.0+ 接受 `-m gpt-5.5` 並走 ChatGPT 登入路由。
> - `gpt-5.1-codex-max` 只保留為舊版遷移提示用常數，已非有效型錄項目。

## 已棄用／更名

| 舊名 | 現況 | 建議 |
|------|------|------|
| `--experimental-json` | 仍為別名 | 改用 `--json` |
| `experimental_instructions_file`（config） | 已棄用，被忽略 | 改用 `model_instructions_file` |
| `--enable-auto-mode`（舊 Codex）／ 硬編碼 model presets | 已從原始碼移除 | 使用型錄檔 `models.json` 與 `--profile` |
