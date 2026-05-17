// convertChinese.mjs — 繁簡中文互轉（opencc-js 包裝）
//
// 對外匯出：
//   convertChinese(text, { from, to }) → string
//   listLocales() → string[]
//
// locale 代碼（沿用 opencc-js）：
//   cn   簡體中文（中國大陸）
//   tw   繁體中文（台灣，字級轉換）
//   twp  繁體中文（台灣，含詞彙轉換：网络→網路、视频→影片、信息→資訊）
//   hk   繁體中文（香港）
//   jp   日本新字體
//   t    OpenCC 標準繁體（通用）

const LOCALES = ['cn', 'tw', 'twp', 'hk', 'jp', 't']

let _OpenCC = null
async function _loadOpenCC() {
    if (_OpenCC) return _OpenCC
    try {
        const m = await import('opencc-js')
        _OpenCC = m.default || m
        return _OpenCC
    } catch (err) {
        throw new Error("opencc-js not installed (npm install opencc-js)")
    }
}

// converter cache：同 from/to 組合重複呼叫不重建字典
const _cache = new Map()
function _getConverter(OpenCC, from, to) {
    const k = `${from}|${to}`
    let c = _cache.get(k)
    if (!c) {
        c = OpenCC.Converter({ from, to })
        _cache.set(k, c)
    }
    return c
}

export function listLocales() {
    return [...LOCALES]
}

export async function convertChinese(text, options = {}) {
    if (typeof text !== 'string') throw new Error('text must be a string')
    const from = options.from ?? 'cn'
    const to = options.to ?? 'twp'
    if (!LOCALES.includes(from)) throw new Error(`unknown from locale: ${from} (allowed: ${LOCALES.join(', ')})`)
    if (!LOCALES.includes(to)) throw new Error(`unknown to locale: ${to} (allowed: ${LOCALES.join(', ')})`)
    if (from === to) return text  // no-op，避免無謂建表
    if (text.length === 0) return ''
    const OpenCC = await _loadOpenCC()
    const conv = _getConverter(OpenCC, from, to)
    return conv(text)
}

export default convertChinese
