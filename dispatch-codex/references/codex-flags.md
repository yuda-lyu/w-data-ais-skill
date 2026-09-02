# Codex CLI 派工參考

以下內容於 2026-09-02 透過這些來源驗證：

- `@openai/codex`／`codex-cli` 0.152.1（npm 最新版）
- 本機 `codex --version`、`codex exec --help`、`codex debug models`
- 本機 `codex exec --strict-config -c '<key>'` 實測設定鍵是否受支援
- [Codex 官方開發者命令參考](https://learn.chatgpt.com/docs/developer-commands?surface=cli)
- [Codex 官方設定參考](https://learn.chatgpt.com/docs/config-file/config-reference)
- [Codex 官方模型頁面](https://learn.chatgpt.com/docs/models)

## 非互動語法

```text
codex exec [OPTIONS] [PROMPT]
codex exec [OPTIONS] <COMMAND> [ARGS]
```

省略 `PROMPT` 或傳入 `-` 時，Codex 會從 stdin 讀取提示詞；stdin 與位置提示詞同時給定時，stdin 會以 `<stdin>` 區塊附加在後。`dispatchCodex()` 會省略位置提示詞並提供 stdin。

子命令：`resume`（以 id 或 `--last` 續接）、`fork`（分叉既有工作階段）、`review`（對儲存庫跑程式碼審查）。

## 必要模型與推理強度

```text
-m gpt-5.6-sol --config model_reasoning_effort="max"
```

0.152.1 執行期型錄（`codex debug models`）之派工相關模型：

| slug | 定位 | 預設 effort | 支援 effort |
|---|---|---|---|
| `gpt-5.6-sol` | 旗艦，處理困難／高風險工作（priority 1） | `low` | low、medium、high、xhigh、max、ultra |
| `gpt-5.6-terra` | 均衡日常工作 | `medium` | low、medium、high、xhigh、max、ultra |
| `gpt-5.6-luna` | 快速廉價 | `medium` | low、medium、high、xhigh、max |
| `gpt-5.5` | 前代 | `medium` | low、medium、high、xhigh |
| `gpt-5.4`、`gpt-5.4-mini` | 更舊世代 | `medium` | low、medium、high、xhigh |

各 effort 之執行期說明：

| 推理強度 | 執行期說明 |
|---|---|
| `low` | 較快、較少推理；也是 Sol 的預設值 |
| `medium` | 平衡速度與推理深度 |
| `high` | 適合複雜問題的較深推理 |
| `xhigh` | 額外高強度推理 |
| `max` | 最大推理深度；本技能預設值 |
| `ultra` | 最大推理加上自動任務委派（以子代理平行拆解，非更深的單任務推理） |

「最深思考」應使用 `max`。只有在明確需要巢狀自動委派時才使用 `ultra`。**Sol 的預設 effort 是 `low`，不明確傳入就是跑最淺推理。**

部分設定參考頁面的表格可能落後於即時型錄，仍只列到 `xhigh`；以 `codex debug models` 的即時型錄為準。

## `codex exec` 旗標（0.152.1 實際 help）

| 旗標 | 用途 |
|---|---|
| `-m`、`--model <MODEL>` | 覆寫設定中的模型 |
| `-s`、`--sandbox <mode>` | `read-only`、`workspace-write` 或 `danger-full-access` |
| `-C`、`--cd <DIR>` | 設定代理的工作根目錄 |
| `--add-dir <DIR>` | 增加可寫入目錄 |
| `--skip-git-repo-check` | 允許在 Git 儲存庫之外執行 |
| `-c`、`--config <key=value>` | 可重複使用的 TOML 設定覆寫；支援 `foo.bar.baz` 巢狀路徑 |
| `--enable <FEATURE>` | 開啟功能旗標，等同 `-c features.<name>=true`（可重複） |
| `--disable <FEATURE>` | 關閉功能旗標，等同 `-c features.<name>=false`（可重複） |
| `--strict-config` | 遇到未知設定欄位時直接失敗 |
| `-i`、`--image <FILE>...` | 附加圖片到初始提示詞 |
| `--json` | 輸出 JSONL 事件 |
| `-o`、`--output-last-message <FILE>` | 儲存最終助理訊息 |
| `--output-schema <FILE>` | 以 JSON Schema 檔案驗證最終輸出 |
| `--color <always\|never\|auto>` | 輸出著色設定 |
| `--ephemeral` | 不保存工作階段檔案 |
| `--ignore-user-config` | 忽略 `$CODEX_HOME/config.toml`；仍會載入認證 |
| `--ignore-rules` | 忽略使用者／專案 execpolicy `.rules` |
| `--thread-source <SOURCE>` | 新建／分叉 thread 的來源分類 |
| `--approve-for-me` | 以 workspace-write 沙箱自動審查核准請求 |
| `--oss`、`--local-provider <lmstudio\|ollama>` | 改用本機開源供應商 |
| `--dangerously-bypass-approvals-and-sandbox` | 停用核准與沙箱；只可用於外部隔離執行器 |
| `--dangerously-bypass-hook-trust` | 不要求已持久化的 hook 信任即執行 hook；只可用於已審核 hook 來源的自動化 |

**`-p` 在 `codex exec` 是 `--profile`（設定 profile），不是提示詞。** 不可套用 Claude 的 `-p` 用法（OpenCode 的 `-p` 又是 `--password`，三者互不相同）。

**已移除／隱藏的旗標**：`--full-auto` 在 0.152.1 已移除（實測回 `error: unexpected argument '--full-auto' found`），改用 `--sandbox workspace-write`。`--yolo` 仍可被接受但未列於 help（隱藏別名）；若確實需要，應改用完整名稱 `--dangerously-bypass-approvals-and-sandbox` 以清楚表達意圖。

**Windows 沙箱設定鍵**：`-c 'windows.sandbox="unelevated"'` 可改用不需管理員設定的 unelevated 沙箱（隔離較弱）。此鍵於 0.152.1 仍受支援（`codex exec --strict-config -c 'windows.sandbox="unelevated"'` 不報 unknown configuration field；對照組 `windows.bogus_zz=1` 會報錯）。預設 elevated 沙箱需先互動跑一次 `codex` 完成一次性 UAC 設定（判別：`~/.codex/.sandbox/setup_marker.json` 是否存在），否則所有命令 `blocked by policy`；詳見 SKILL.md「Windows 前置」。

## 常用設定覆寫

設定值會以 TOML 解析。透過 `w-dispatch-ai` 時，每個 `key=value` 都是命令列參數陣列中的獨立元素，因此不需要 shell 專屬跳脫。

```javascript
extraArgs: [
    '--config', 'model_reasoning_effort="max"',
    '--config', 'model_reasoning_summary="concise"',
    '--config', 'model_verbosity="medium"',
    '--config', 'sandbox_workspace_write.network_access=true',
]
```

只有任務確實需要網路時才可開啟網路權限。

等效的持久化設定如下：

```toml
model = "gpt-5.6-sol"
model_reasoning_effort = "max"
sandbox_mode = "workspace-write"

[sandbox_workspace_write]
network_access = false
```

## 輸出與延續工作階段

```text
codex exec --json -
codex exec --output-last-message ./result.txt -
codex exec resume --last "繼續任務"
codex exec resume <SESSION_ID> "後續指令"
codex exec fork <SESSION_ID> "從此分支續作"
```

`--json` 會輸出 JSONL，須逐行解析。只需要最終自然語言結果時，`--output-last-message` 是最簡單的介面。

## 執行期驗證

```bash
codex --version
codex exec --help
codex debug models          # 即時模型型錄（JSON，含 default_reasoning_level 與 supported_reasoning_levels）
codex debug prompt-input    # 檢視模型可見的 prompt input
npm view @openai/codex version
```

`codex debug models` 輸出達數百 KB，取模型與 effort 清單時應以程式擷取欄位，不要整份倒進 context：

```bash
codex debug models | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);j.models.forEach(m=>console.log(m.slug,m.default_reasoning_level,(m.supported_reasoning_levels||[]).map(x=>x.effort).join(',')))})"
```

注意 `codex debug models` 不接受 `--strict-config`（要驗設定鍵須用 `codex exec --strict-config`）。

若 `gpt-5.6-sol` 或 `max` 失敗，應檢查 CLI 版本、認證、帳號可用性與即時型錄。不可在使用者明確指定模型時靜默退回其他模型。
