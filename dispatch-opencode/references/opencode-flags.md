# OpenCode CLI 派工參考

以下內容於 2026-09-02 透過這些來源驗證：

- `opencode-ai`／`opencode` 1.18.26（npm 最新版）
- 本機 `opencode --version`、`opencode run --help`、`opencode models --help`
- 本機 `opencode models nvidia --refresh --verbose`（重新整理後之詳細型錄）
- [OpenCode 官方 CLI 文件](https://opencode.ai/docs/cli/)
- [OpenCode 官方模型與 variant 文件](https://opencode.ai/docs/models/)

2026-09-08 於本機 `opencode` 1.18.29 追加查核並改寫模型章節：`opencode run --help`、`opencode auth list`、`opencode models`／`opencode models opencode --refresh --verbose`、`opencode agent list`，以及對各候選模型 ID 之實跑（結果見下）。

## 非互動語法

```text
opencode run [message..]
```

未提供位置 message 時，目前版本的 OpenCode 會從 stdin 讀取內容。`dispatchOpencode()` 使用 stdin，因此長篇與多行提示詞不會遇到命令列長度與引號問題。

## 必要模型與 variant

```text
--model opencode/muse-spark-1.3-contributor-free --variant xhigh
```

2026-09-08 重新整理後的型錄（1.18.29，`opencode models opencode --verbose`）顯示：

```text
供應商／模型：opencode/muse-spark-1.3-contributor-free
名稱：Muse Spark 1.3 Free
狀態：status: active（release_date 2026-09-02）
能力：reasoning: true、toolcall: true、attachment: true
variant：minimal、low、medium、high、xhigh
脈絡窗：1,048,576；最大輸出：131,072
費用：input／output 皆 0
```

`xhigh` 是此項目最深的一檔，**它沒有 `max`**。**不傳 `--variant` 就是跑供應商預設，不是 `xhigh`。**

### 已實測可用之其他選項（同一 `opencode` 供應商，免費且免第三方金鑰）

| 模型 ID | 定位 | 實測（2026-09-08） |
|---|---|---|
| `opencode/muse-spark-1.3-contributor-free` | 本技能必要預設值 | 以 `--variant xhigh` 跑讀檔＋建檔任務通過：工具呼叫正常、檔案確實建立、離開碼 0、中文原樣往返 |
| `opencode/nemotron-3.5-lightning-free` | 備選 | 以預設 variant 跑同一任務通過 |

同供應商型錄另列 `big-pickle`、`ling-3.0-flash-fin-free`、`mimo-v2.5-free`、`muse-spark-1.2-contributor-free`、`nemotron-3-ultra-free` 等，**未實跑**；要用之前先照下節查核並實跑。

### 已確認不可用之項目

| 項目 | 實測結果（2026-09-08） |
|---|---|
| `nvidia/deepseek-ai/deepseek-v4-flash` | HTTP 410 `Gone`，`detail` 為 has reached its end of life on 2026-08-07 |
| `nvidia/deepseek-ai/deepseek-v4-pro` | 同上 410 |
| `nvidia/deepseek-ai/deepseek-v4-flash-0731`、`…/deepseek-v4-pro-0813` | 403 `Authorization failed` |
| `nvidia/poolside/laguna-xs-2.1` | 403 `Authorization failed` |
| `cline/deepseek/deepseek-v4-flash` | 型錄為 `reasoning: false`、`variants: {}`，無推理變體 |
| `opencode/deepseek-v4-flash-free` | 不在型錄中（`w-dispatch-ai` 的 `providers` 表仍收錄此 ID 作為 Zen REST 路徑之用，不代表 CLI 型錄查得到） |

**前四項在同一天的 `opencode models nvidia --refresh` 中照樣列得出來**——型錄查得到不等於供應商還在服務，這是本技能改用現行預設值的直接原因。

### 供應商沒設定就等於模型不存在——但可用 `config` 當場注入

`opencode models` 只列出**已認證或已在設定中定義**之供應商的模型。2026-09-08 本機（`opencode auth list` 顯示 Nvidia、cline 兩筆憑證，加上內建 `opencode`）共 111 項模型、僅此三家。查未設定的供應商回 `Error: Provider not found: <名稱>`；硬用 `-m <該供應商>/<模型>` 派工則回 `UnknownError`（伺服器錯誤），訊息不會告訴你是沒認證。

**但這兩種錯誤都不等於「該模型不能用」**：轉接器的 `config` 選項會為當次程序注入 provider 定義，型錄查不到照樣派得動。`w-dispatch-ai/src/providers.mjs` 內建的第三方條目即為此形式：

| 條目 id | `model` | `provider` | 金鑰環境變數 | baseURL | npm 轉接器 |
|---|---|---|---|---|---|
| `oc:agnes-ai/agnes-2.5-flash` | `agnes-ai/agnes-2.5-flash` | `agnes-ai` | `AGNES_KEYS` | `https://apihub.agnes-ai.com/v1` | `@ai-sdk/openai-compatible` |
| `oc:poolside/poolside/laguna-s-2.1` | `poolside/poolside/laguna-s-2.1` | `poolside` | `POOLSIDE_KEYS` | `https://inference.poolside.ai/v1` | `@ai-sdk/openai-compatible` |

上表之 `nvidia/poolside/laguna-xs-2.1`（403）是 **NVIDIA 轉售的另一個 laguna 項目**，與此處 Poolside 官方 REST／CLI 路徑無關，別混為一談。同一個模型經不同路徑屬不同供應商，額度池與故障域各自獨立。

該表另有同名模型的 REST 條目（`agnes:agnes-2.5-flash`、`poolside:laguna-s-2.1`，kind 為 `api-openai-compat`），走 `dispatchApiOpenaiCompat` 而非本轉接器：免 CLI、快，但**無工具能力**，只適合純文字生成。

### `config` 內的權限設定

同一個 `config` 物件除了 provider 定義，還吃 `permission`，可逐項給 `allow`／`ask`／`deny`：

```javascript
config: { permission: { edit: 'deny', write: 'deny', bash: 'deny' } }
```

`providers.mjs` 的每個 opencode 條目都帶這把唯讀鎖。2026-09-08 實測：加上此鎖後，讀取照常、建檔失敗且 `out.txt` 未建立，但**離開碼仍為 0、stdout 非空**，轉錄裡甚至出現 `✓ Create out.txt file`（建檔被轉交子代理，子代理回報成功）。派需要寫入的任務時要把對應項目放開，並一律以產物是否落地判成敗。

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

`opencode models` 支援 `[provider]` 位置參數過濾、`--refresh`（自 models.dev 重抓快取）與 `--verbose`（含成本與 variants 等中繼資料）。2026-09-08 本機可用之供應商為 `cline`、`nvidia`、`opencode`（共 111 項模型）；不在此列者一律 `Provider not found`。

## 認證

```bash
opencode auth login
opencode auth list
opencode auth logout
```

必要預設模型走 OpenCode 自家供應商，`opencode auth login` 完成一次即可，不需第三方金鑰。第三方供應商（如 NVIDIA）的模型才需要該供應商憑證；`dispatchOpencode()` 也能透過 `provider` 與 `key`，僅為當次程序注入 `OPENCODE_AUTH_CONTENT`，不會修改已保存的認證檔案。

第三方供應商定義可透過轉接器的 `config` 選項注入為 `OPENCODE_CONFIG_CONTENT`。供應商、模型、base URL 與憑證來源必須互相對應。

## 輸出與工作階段

```text
opencode run --format json --model opencode/muse-spark-1.3-contributor-free --variant xhigh
opencode run --continue "繼續"
opencode run --session <SESSION_ID> "後續指令"
```

`--format json` 是每行一個 JSON 值的事件流，必須當成 JSONL 解析。

## 執行期驗證

```bash
opencode --version
opencode run --help
opencode auth list
opencode models opencode --refresh
opencode models opencode --verbose
opencode agent list                 # 各代理的實際生效權限規則
npm view opencode-ai version
```

查完型錄還要實跑一次最小任務才算驗證過（型錄會照列已下線的模型）。若指定模型或 `xhigh` variant 已消失，應明確回報失敗並要求選擇新的模型／供應商，不可靜默改派其他模型。
