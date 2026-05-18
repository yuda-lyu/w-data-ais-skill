// shortenUrl.mjs — 用 da.gd API 將長網址轉成短網址
//
// 對外匯出：
//   shortenUrl(url, options?) → Promise<{ status, url, shortUrl?, alias?, errorCode?, message?, attempts }>
//
// 為何選 da.gd（取代先前的 is.gd / TinyURL）：
//   - is.gd: 約 10% 機率 deterministic backend bug（"Error, database insert failed"），自 2025/2 起未修
//   - TinyURL: api-create.php 已被官方標為 deprecated；對「曾建立過的短碼」會插 preview 倒數頁，
//             redirect 顯著變慢（使用者實測「等很久」）
//   - da.gd: 實測 10/10 成功、redirect 單一 302 直達、回應 plain text 帶清晰錯誤訊息（"Long URL must
//           have http:// or https:// scheme."、"Short URL already taken. Pick a different one." 等）
//
// 端點：https://da.gd/s?url=<URL>[&shorturl=<alias>]
//   成功：HTTP 200, body = 短網址（https://da.gd/xxxxx）
//   失敗：HTTP 400, body = 英文錯誤訊息
//
// 重試策略：
//   - 網路錯誤 / HTTP 5xx / HTTP 429 → 最多重試 5 次（含初始最多執行 6 次），退避 2s/4s/8s/15s/30s
//   - HTTP 400（含 "already taken"、scheme 錯等）→ 永久錯誤，不重試
//
// da.gd alias 規則（實證 2026-05）：
//   - 4-10 字元 [A-Za-z0-9_-]（>10 會 silent 截斷，本技能 client 端拒絕）
//   - 短於 5 字元 / 過短可能與站方自動生成的短碼衝突（不可預測）
//   - 全域唯一，case-sensitive

const API = 'https://da.gd/s'
const REQUEST_TIMEOUT_MS = 15000
const NETWORK_MAX_RETRIES = 5
const NETWORK_RETRY_DELAY_MS = [2000, 4000, 8000, 15000, 30000]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function _isHttpUrl(s) {
    return typeof s === 'string' && /^https?:\/\//i.test(s)
}

// 4-10 字元，[A-Za-z0-9_-]（da.gd 對 >10 字元的 alias 會 silent 截斷）
function _validateAlias(a) {
    return typeof a === 'string' && /^[A-Za-z0-9_-]{4,10}$/.test(a)
}

function _isShortUrlBody(t) {
    return typeof t === 'string' && /^https?:\/\/da\.gd\/[A-Za-z0-9_-]+/i.test(t.trim())
}

async function _callDaGd(requestUrl) {
    const res = await fetch(requestUrl, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
    const text = (await res.text()).trim()
    return { httpStatus: res.status, text }
}

function _classifyDaGdError(text) {
    const t = text.toLowerCase()
    if (t.includes('already taken')) return 'alias-rejected'
    if (t.includes('scheme') || t.includes('cannot be empty') || t.includes('invalid')) return 'invalid-url'
    return 'dagd-error'
}

/**
 * 將長網址轉成短網址（da.gd）
 * @param {string} url - 要縮短的長網址，必須以 http:// 或 https:// 開頭
 * @param {object} [options]
 * @param {string} [options.alias] - 自訂短碼（4-10 字元 [A-Za-z0-9_-]，需全域唯一；da.gd 限制 ≤10 字元）
 * @returns {Promise<object>} { status, url, shortUrl?, alias?, errorCode?, message?, attempts }
 */
export async function shortenUrl(url, options = {}) {
    if (!_isHttpUrl(url)) {
        return { status: 'error', url, message: 'url 必須以 http:// 或 https:// 開頭', errorCode: 'invalid-input', attempts: 0 }
    }
    const alias = options.alias
    if (alias != null && !_validateAlias(alias)) {
        return { status: 'error', url, message: 'alias 必須為 4-10 字元 [A-Za-z0-9_-]（da.gd 對 >10 字元會 silent 截斷）', errorCode: 'invalid-alias', attempts: 0 }
    }

    const params = new URLSearchParams({ url })
    if (alias) params.set('shorturl', alias)
    const requestUrl = `${API}?${params.toString()}`

    let attempts = 0
    let lastErrMsg = ''

    for (let netAttempt = 0; netAttempt <= NETWORK_MAX_RETRIES; netAttempt++) {
        attempts++
        try {
            const { httpStatus, text } = await _callDaGd(requestUrl)
            if (httpStatus >= 500 || httpStatus === 429) {
                lastErrMsg = `da.gd HTTP ${httpStatus}: ${text.slice(0, 100)}`
                if (netAttempt < NETWORK_MAX_RETRIES) {
                    await sleep(NETWORK_RETRY_DELAY_MS[netAttempt] ?? 30000)
                    continue
                }
                break
            }
            if (httpStatus === 200 && _isShortUrlBody(text)) {
                const shortUrl = text
                const aliasOut = shortUrl.replace(/^https?:\/\/da\.gd\//i, '')
                // 若 caller 指定 alias 但回傳短碼不符（da.gd 截斷時觸發），視為錯誤
                if (alias && aliasOut !== alias) {
                    return {
                        status: 'error',
                        url,
                        errorCode: 'alias-mismatch',
                        message: `da.gd 回傳短碼「${aliasOut}」與請求的 alias「${alias}」不符（可能 silent 截斷）`,
                        attempts,
                    }
                }
                return { status: 'success', url, shortUrl, alias: aliasOut, attempts }
            }
            // HTTP 400 或其他非預期回應 → 永久錯誤
            return {
                status: 'error',
                url,
                errorCode: _classifyDaGdError(text),
                message: `da.gd 拒絕 (HTTP ${httpStatus}): ${text.slice(0, 150)}`,
                attempts,
            }
        } catch (err) {
            lastErrMsg = err.message || String(err)
            if (netAttempt < NETWORK_MAX_RETRIES) {
                await sleep(NETWORK_RETRY_DELAY_MS[netAttempt] ?? 30000)
                continue
            }
        }
    }

    return {
        status: 'error',
        url,
        errorCode: 'network-error',
        message: `da.gd 連線失敗（網路重試已耗盡）：${lastErrMsg}`,
        attempts,
    }
}

export default shortenUrl
