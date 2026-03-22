# Codex CLI 旗標完整參考

來源：https://developers.openai.com/codex/config-advanced
來源：https://developers.openai.com/codex/noninteractive

## codex exec 子命令

`codex exec` 是專為非互動/自動化設計的入口點，與直接執行 `codex` 不同。

```
codex exec [OPTIONS] "task prompt"
```

### 主要選項

| 選項 | 說明 |
|------|------|
| `--full-auto` | 自動核准所有操作，不需人工確認 |
| `--skip-git-repo-check` | 跳過 git repo 信任目錄檢查 |
| `--json` | 以 JSONL 格式輸出事件流，適合 script 解析 |
| `--ephemeral` | 不儲存 session 到磁碟，適合暫時性任務 |
| `--output-schema ./schema.json` | 強制最終回應符合 JSON Schema |
| `--sandbox danger-full-access` | 完全開放沙箱（受控環境使用） |

### --config 旗標（點記法覆蓋設定）

```bash
# 啟用網路存取（允許 npm install 等）
--config sandbox_workspace_write.network_access=true

# 指定模型
--config model='"gpt-4o"'

# 值以 TOML 格式解析；包含空格時需加引號
```

## 對應的 config.toml 設定

`~/.codex/config.toml` 中的等效設定：

```toml
sandbox_mode = "workspace-write"

[sandbox_workspace_write]
network_access = true
```

## 多 agent 情境中的 Resume 功能

```bash
# 繼續上次 session
codex exec resume --last "繼續之前的任務"

# 以 session ID 繼續
codex exec resume <SESSION_ID> "追加指令"
```
