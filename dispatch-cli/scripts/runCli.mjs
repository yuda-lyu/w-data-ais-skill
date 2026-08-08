/**
 * runCli.mjs — dispatch-cli 核心模組：通用 CLI 子進程調用
 *
 * 本檔為 wsemi 之 `execCli` 的轉發層：實作已抽出至該套件統一維護，
 * 此處僅保留技能既有的匯入路徑與函式名稱，故既有呼叫端無須改動。
 *
 * runCli(command, args, options)
 *   → Promise<{ ok, stdout, stderr, code, error, durationMs, pid, attempts }>
 *   本函式不 throw，一律以結果物件之 ok 與 error 欄位回報成敗。
 *
 * options：
 *   timeoutMs=120000    逾時毫秒（逾時強制關閉子進程及其子孫程序）
 *   cwd=process.cwd()   子進程工作目錄
 *   input=undefined     傳入 stdin 的字串
 *   validate=undefined  stdout 驗證規則 'nonempty' / 'json' / 'min:<n>'（可逗號串接）或自訂函式
 *   maxBuffer=10485760  stdout/stderr 各自累積上限
 *   onStdout / onStderr 串流回呼 (chunk: string) => void
 *   maxRetries=0        失敗重試次數（ENOENT 與 exit code 2 視為不可重試而中止）
 *   retryDelayMs=5000   重試間隔（實際為 retryDelayMs × 次數，上限 15000ms）
 * 完整 API 見 https://yuda-lyu.github.io/wsemi/global.html#execCli
 *
 * 注意：
 *   1. wsemi 為 UMD 套件，只能 default import，named import 取不到函式。
 *   2. Windows 下 npm 全域命令為 .cmd 批次檔，spawn 無法直接執行
 *      （CVE-2024-27980 後回 EINVAL）；execCli 內部已參考 cross-spawn 解析 .cmd
 *      實際入口並繞過 cmd.exe，故支援含多行文字之參數。
 *
 * 命令列用法請改用同層之 run_cli.mjs（僅調用層，負責 argv/環境變數解析與 JSON 輸出）。
 */

import w from 'wsemi';

export const runCli = w.execCli;

export default runCli;
