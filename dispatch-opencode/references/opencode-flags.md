# OpenCode CLI 派工參考

以下內容於 2026-09-02 透過這些來源驗證：

- `opencode-ai`／`opencode` 1.18.26（npm 最新版）
- 本機 `opencode --version`、`opencode run --help`、`opencode models --help`
- 本機 `opencode models nvidia --refresh --verbose`（重新整理後之詳細型錄）
- [OpenCode 官方 CLI 文件](https://opencode.ai/docs/cli/)
- [OpenCode 官方模型與 variant 文件](https://opencode.ai/docs/models/)

## 非互動語法

```text
opencode run [message..]
```

未提供位置 message 時，目前版本的 OpenCode 會從 stdin 讀取內容。`dispatchOpencode()` 使用 stdin，因此長篇與多行提示詞不會遇到命令列長度與引號問題。

## 必要模型與 variant

```text
--model nvidia/deepseek-ai/deepseek-v4-flash --variant max
```

重新整理後的型錄（1.18.26）顯示：

```text
供應商／模型：nvidia/deepseek-ai/deepseek-v4-flash
名稱：DeepSeek V4 Flash
支援推理：reasoning: true
variant：none(none)、high(high)、max(max)
脈絡窗：1,048,576；最大輸出：393,216
```

`max` 是此供應商／模型項目提供的最深推理 variant。**不傳 `--variant` 就是跑供應商預設，不是 `max`。**

必要預設值不可使用以下項目：

- `cline/deepseek/deepseek-v4-flash`：型錄仍為 `reasoning: false`、`variants: {}`，沒有推理變體。
- `opencode/deepseek-v4-flash-free`：重新整理供應商型錄後仍不存在（`opencode` 供應商下只有 `big-pickle`、`ling-3.0-flash-fin-free`、`mimo-v2.5-free`、`muse-spark-1.2-contributor-free`、`nemotron-3-ultra-free`、`nemotron-3.5-lightning-free` 等）。注意 `w-dispatch-ai` 的 `providers` 表仍收錄此 ID 作為 Zen REST 路徑之用，不代表 CLI 型錄查得到。

同一供應商另有 `nvidia/deepseek-ai/deepseek-v4-pro`（DeepSeek V4 Pro，同樣 `reasoning: true`、variant `none`／`high`／`max`、脈絡窗 1,048,576）。使用者若要求比 Flash 更強者才改用，本技能預設仍為 Flash。

型錄會動態變更。應使用 `opencode models <provider> --refresh` 與 `--verbose` 查核，不可猜測模型 ID 或 variant。

## `opencode run` 旗標（1.18.26 實際 help）

| 旗標 | 用途 |
|---|---|
| `-m`、`--model <provider/model>` | 選擇模型；ID 可能包含多個斜線 |
| `--variant <name>` | 套用供應商／模型專屬的推理 variant（如 `high`、`max`、`minimal`） |
| `--agent <name>` | 選擇代理；轉接器預設為 `build` |
| `--format default\|json` | 人類可讀輸出或 JSONL 事件 |
| `-f`、`--file <file...>` | 附加檔案 |
| `--dir <path>` | 設定專案目錄；若 `--attach` 遠端 server 則為遠端路徑 |
| `--command <name>` | 執行指定命令，message 作為其參數 |
| `--thinking` | 顯示可用的 thinking 區塊 |
| `--auto` | 自動核准未被明確拒絕的權限；具有風險 |
| `-c`、`--continue` | 延續上一個工作階段 |
| `-s`、`--session <id>` | 延續指定工作階段 |
| `--fork` | 延續前先分叉工作階段（須搭配 `--continue` 或 `--session`） |
| `--title <text>` | 設定工作階段標題 |
| `--share` | 分享此工作階段 |
| `--pure` | 不載入外部 plugin |
| `--attach <url>` | 連接正在執行的 OpenCode server |
| `--port <n>` | 指定本機 server 埠（預設隨機） |
| `-i`、`--interactive` | 直接互動 split-footer 模式；派工不可使用 |
| `--print-logs` | 將 log 印至 stderr |
| `--log-level <level>` | `DEBUG`、`INFO`、`WARN` 或 `ERROR` |

**`-p` 在 `opencode run` 是 `--password`（basic auth），不是提示詞**，`-u` 則是 `--username`。不可套用 Claude 的 `-p` 用法（Codex 的 `-p` 又是 `--profile`，三者互不相同）。

## 模型與 variant

模型選擇優先順序如下：

1. `--model`／`-m`
2. 設定檔中的 `model`
3. 上次使用的模型
4. 內部優先順序

variant 是型錄定義的請求覆寫。不可假設每個推理模型都有 `high` 或 `max`；使用前應檢查 `opencode models <provider> --verbose`。

`opencode models` 支援 `[provider]` 位置參數過濾、`--refresh`（自 models.dev 重抓快取）與 `--verbose`（含成本與 variants 等中繼資料）。目前本機已認證之供應商為 `cline`、`nvidia`、`opencode`（共 110 項模型）。

## 認證

```bash
opencode auth login
opencode auth list
opencode auth logout
```

NVIDIA 模型需要 NVIDIA 供應商憑證。`dispatchOpencode()` 也能透過 `provider: 'nvidia'` 與 `key`，僅為當次程序注入 `OPENCODE_AUTH_CONTENT`，不會修改已保存的認證檔案。

第三方供應商定義可透過轉接器的 `config` 選項注入為 `OPENCODE_CONFIG_CONTENT`。供應商、模型、base URL 與憑證來源必須互相對應。

## 輸出與工作階段

```text
opencode run --format json --model nvidia/deepseek-ai/deepseek-v4-flash --variant max
opencode run --continue "繼續"
opencode run --session <SESSION_ID> "後續指令"
```

`--format json` 是每行一個 JSON 值的事件流，必須當成 JSONL 解析。

## 執行期驗證

```bash
opencode --version
opencode run --help
opencode models nvidia --refresh
opencode models nvidia --verbose
npm view opencode-ai version
```

若指定模型或 `max` variant 已消失，應明確回報失敗並要求選擇新的模型／供應商，不可靜默改派其他模型。
