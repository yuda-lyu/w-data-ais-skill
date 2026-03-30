import fs from 'fs';
import path from 'path';

/**
 * 台股盤前調研報告生成器
 *
 * 用法：node generate_report.mjs [YYYYMMDD] [baseOutputDir]
 * 參數：
 * 1. YYYYMMDD  (選填)：指定日期，預設為今日。
 * 2. baseOutputDir (選填)：資料輸出根目錄；腳本會自動推導
 *                         <baseOutputDir>/tw-stock-research/<YYYYMMDD>/。
 *                         agent 調用時應顯式傳入；若省略僅作本地手動執行時的便利 fallback。
 */

const TODAY      = process.argv[2] || new Date().toLocaleString('en-CA', { timeZone: 'Asia/Taipei' }).slice(0, 10).replace(/-/g, '');
const BASE_OUTPUT_INPUT = process.argv[3] || path.join(process.cwd(), 'w-data-news');
const BASE_OUTPUT_DIR = resolveBaseOutputDir(BASE_OUTPUT_INPUT);
const OUTPUT_DIR = path.join(BASE_OUTPUT_DIR, 'tw-stock-research', TODAY);
const RAW_DIR    = path.join(OUTPUT_DIR, 'raw');
const REPORT_FILE = path.join(OUTPUT_DIR, `report_${TODAY}.md`);

function resolveBaseOutputDir(inputPath) {
    const resolved = path.resolve(inputPath);
    if (path.basename(resolved) === TODAY && path.basename(path.dirname(resolved)) === 'tw-stock-research') {
        return path.dirname(path.dirname(resolved));
    }
    return resolved;
}

const readJson = (filename) => {
    const filePath = path.join(RAW_DIR, filename);
    try {
        if (fs.existsSync(filePath)) {
            const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            // Unwrap unified output format: { status: 'success', message: <data> }
            if (raw && raw.status === 'success') return raw.message;
            if (raw && raw.status === 'error') {
                console.warn(`${filename} contains error: ${raw.message}`);
                return null;
            }
            return raw; // fallback for legacy format
        }
    } catch (e) {
        console.error(`Warning: Could not read or parse ${filePath}: ${e.message}`);
    }
    return null;
};

const mopsData = readJson('mops.json');
const cnyesData = readJson('cnyes.json');
const statementdogData = readJson('statementdog.json');
const moneydjData = readJson('moneydj.json');
const twseData = readJson('institutional_twse.json');
const tpexData = readJson('institutional_tpex.json');
const twsePricesData = readJson('prices_twse.json');
const tpexPricesData = readJson('prices_tpex.json');
const twsePricesDataT2 = readJson('prices_twse_t2.json');
const tpexPricesDataT2 = readJson('prices_tpex_t2.json');
const taifexData = readJson('taifex.json');
const marginTwseData = readJson('margin_twse.json');
const marginTpexData = readJson('margin_tpex.json');

const reportDate = `${TODAY.substring(0, 4)}/${TODAY.substring(4, 6)}/${TODAY.substring(6, 8)}`;

// 往前推一個工作日（跳過週六日）
function prevWeekday(dateStr) {
    const y = parseInt(dateStr.substring(0, 4));
    const m = parseInt(dateStr.substring(4, 6)) - 1;
    const d = parseInt(dateStr.substring(6, 8));
    const dt = new Date(y, m, d);
    do { dt.setDate(dt.getDate() - 1); } while (dt.getDay() === 0 || dt.getDay() === 6);
    const yyyy = dt.getFullYear();
    const mm   = String(dt.getMonth() + 1).padStart(2, '0');
    const dd   = String(dt.getDate()).padStart(2, '0');
    return `${yyyy}${mm}${dd}`;
}

// --- 前一交易日 (T-1) 與 T-2 日期常數（全報告共用）---
const instDateT1 = prevWeekday(TODAY);
const instDateT2 = prevWeekday(instDateT1);
const T1_SHORT = `${instDateT1.substring(4, 6)}/${instDateT1.substring(6, 8)}`;
const T2_SHORT = `${instDateT2.substring(4, 6)}/${instDateT2.substring(6, 8)}`;
const T1_LABEL = `前一交易日(${T1_SHORT})`;

// --- MoneyDJ 例行公告過濾（行政/法規性公告，不影響投資決策）---
const MONEYDJ_SKIP_PATTERNS = [
    '股東常會',           // 含「召開115年股東常會」等帶年份格式
    '股東臨時會',
    '內部稽核主管',
    '會計主管',
    '財務主管',
    '員工及董監事酬勞',
    '董監事酬勞',
    '簡易合併',
    '私募',
    '現金增資發行新股',
    '增資發行新股',
    '累積處分同一有價證券',
    '累積取得同一有價證券',
    '年度個別財務報告',
    '年度合併財務報告',
    '合併財務資訊',       // 含「自結合併財務資訊」
    '限制員工權利新股',
    '資金貸與及背書保證',  // 合規例行揭露
    '參與投資人說明會',    // 會議排程通知
    '年度合併財務報表',    // 年度例行財報申報
    '更換主辦輔導推薦',    // 行政性換券商
];

// --- MOPS impact level tagging ---
function getMopsImpactLevel(header, title) {
    // 🔴 Major: mergers, large asset disposals, delisting, capital reduction
    const major = ['合併', '分割', '收購', '股份受讓', '終止上市', '終止上櫃', '減資', '重大訊息'];
    // 🟡 Medium: dividends, treasury stock, major contracts
    const medium = ['股息', '紅利', '除息', '庫藏股', '買回', '處分資產', '取得資產'];
    // ⚪ Routine: remaining items
    const text = (header || '') + (title || '');
    if (major.some(k => text.includes(k))) return '🔴';
    if (medium.some(k => text.includes(k))) return '🟡';
    return '⚪';
}

// --- MOPS 例行公告過濾（不影響股價）---
const MOPS_SKIP_HEADERS = [
    '召開股東常會',
    '召開股東臨時會',
    '財務報告無虛偽或隱匿之聲明書',
    '內控聲明書',
    '內部控制制度聲明書',
    '資金貸與',
    '背書保證',
    '採候選人提名',
    '依發行辦法約定收回',
    '分配收益公告',
    '依證交法第43條之1第1項取得股份',
];

// --- News skip patterns (non-trading-related content) ---
const NEWS_SKIP_PATTERNS = [
    /不買房|買房更自由|房市觀點/,     // lifestyle
    /招募|人才班|開搶|報名/,           // employment/training
    /環境部|綠領|碳權/,               // environmental policy
    /^推論時代來臨|^看好.+ETF/,       // ETF promotional
    /^當「|^你真的/,                   // opinion columns
];

// --- Shared helpers ---
const parseNum = (s) => parseInt(String(s || '0').replace(/,/g, '')) || 0;
const isStockCode = (code) => /^\d{4}$/.test(code) && parseInt(code) >= 1000;

// TWSE/TPEX 欄位存取器（消除 TWSE vs TPEX 命名差異的重複判斷）
const getCode = (item) => String(item['證券代號'] || item['代號'] || '').trim();
const getName = (item) => item['證券名稱'] || item['名稱'] || '';
const getInstNetStr = (item) => item['三大法人買賣超股數'] || item['三大法人買賣超股數合計'] || '0';

/** 從 TWSE MI_INDEX 資料中找出個股收盤行情表 */
function findTwseStockTable(twsePrices) {
    if (!twsePrices?.tables) return null;
    return twsePrices.tables.find(t => t.title && t.title.includes('每日收盤行情')) || null;
}

// --- 常用別名對照表 ---
// 涵蓋兩種情況：
// (1) T86 官方短名與新聞常用名不同（如 日月光投控 → 日月光、台新新光金 → 台新金）
// (2) 主要大型公司安全網（即使已在 nameCodeMap，確保不因資料缺漏而漏失）
const COMPANY_ALIASES = [
    // 半導體／晶圓
    ['台積電', '2330'], ['聯電', '2303'], ['聯發科', '2454'],
    ['日月光', '3711'],  // T86 官方：日月光投控
    ['矽力', '6415'],
    // 電子代工／ODM
    ['鴻海', '2317'], ['廣達', '2382'], ['仁寶', '2324'],
    ['緯創', '3231'], ['英業達', '2356'], ['和碩', '4938'],
    ['緯穎', '6669'], ['鴻準', '2354'],
    // 面板
    ['友達', '2409'], ['群創', '3481'],
    // 電腦品牌
    ['華碩', '2357'], ['宏碁', '2353'],
    // 電信
    ['中華電', '2412'], ['遠傳', '4904'], ['台灣大', '3045'],
    // 記憶體
    ['南亞科', '2408'], ['旺宏', '2337'], ['華邦電', '2344'],
    ['威剛', '3260'],
    // PCB／載板
    ['南電', '8046'], ['欣興', '3037'], ['景碩', '3189'],
    ['台光電', '2383'], ['華通', '2313'],
    // 伺服器／散熱
    ['廣運', '6442'], ['奇鋐', '3017'],
    // 石化
    ['台塑', '1301'], ['南亞', '1303'], ['台化', '1326'],
    ['台塑化', '6505'], ['遠東新', '1402'],
    // 鋼鐵
    ['中鋼', '2002'],
    // 航運
    ['長榮', '2603'], ['陽明', '2609'], ['萬海', '2615'],
    ['長榮航', '2618'], ['華航', '2610'],
    // 金融
    ['富邦金', '2881'], ['國泰金', '2882'], ['中信金', '2891'],
    ['玉山金', '2884'], ['兆豐金', '2886'], ['第一金', '2892'],
    ['永豐金', '2890'],
    ['台新金', '2887'],  // T86 官方：台新新光金
    ['元大金', '2885'], ['合庫金', '5880'],
    ['彰銀', '2801'], ['華南金', '2880'],
    // 食品／零售
    ['統一', '1216'], ['統一超', '2912'],
    // 水泥
    ['台泥', '1101'], ['亞泥', '1102'],
];

// --- Build name→code lookup from institutional + MOPS data ---
function buildNameCodeMap(twseData, tpexData, mopsData) {
    const map = new Map(); // name → code

    // From institutional data (all listed stocks, ~14000 rows)
    const addFromInst = (data) => {
        (data?.data || []).forEach(item => {
            const code = getCode(item);
            const name = getName(item).trim();
            if (code && name && /^\d{4}/.test(code) && name.length >= 2) {
                map.set(name, code);
            }
        });
    };
    addFromInst(twseData);
    addFromInst(tpexData);

    // From MOPS (companies with announcements today)
    if (Array.isArray(mopsData)) {
        mopsData.forEach(market => {
            const result = market?.data?.result;
            if (Array.isArray(result)) {
                result.forEach(category => {
                    (category.data || []).forEach(row => {
                        const code = String(row[0] || '').trim();
                        const name = String(row[1] || '').trim();
                        if (code && name && /^\d{4}/.test(code) && name.length >= 2) {
                            map.set(name, code);
                        }
                    });
                });
            }
        });
    }

    // Merge company aliases (only add if not already present from institutional data)
    COMPANY_ALIASES.forEach(([alias, code]) => {
        if (!map.has(alias)) map.set(alias, code);
    });

    return map;
}

// Extract ALL stocks mentioned in a single text (brackets + name lookup)
function extractAllStocks(text, nameCodeMap) {
    const stocks = [];
    const seenCodes = new Set();

    // 1. Bracket pattern: extract ALL occurrences of (2330) or （2330）
    const bracketRe = /[（(](\d{4})[）)]/g;
    let m;
    while ((m = bracketRe.exec(text)) !== null) {
        const code = m[1];
        if (parseInt(code) < 1000 || seenCodes.has(code)) continue;
        // Name before bracket
        const before = text.substring(0, m.index);
        const beforeMatch = before.match(/([\u4e00-\u9fff\w-]{1,8})$/);
        // Name after bracket
        const after = text.substring(m.index + m[0].length);
        const afterMatch = after.match(/^([\u4e00-\u9fff]{1,6})/);
        const name = (beforeMatch && /[\u4e00-\u9fff]/.test(beforeMatch[1]))
            ? beforeMatch[1]
            : (afterMatch ? afterMatch[1] : '');
        stocks.push({ code, name });
        seenCodes.add(code);
    }

    // 2. Name lookup (longer names first to avoid partial overlap)
    if (nameCodeMap && nameCodeMap.size > 0) {
        const sorted = [...nameCodeMap.entries()].sort((a, b) => b[0].length - a[0].length);
        for (const [name, code] of sorted) {
            if (seenCodes.has(code)) continue;
            let found = false;
            if (name.length <= 2) {
                // For short names, require a non-CJK character before the match
                // to avoid e.g. "新產" (2850) matching inside "越南新產能"
                let pos = text.indexOf(name);
                while (pos !== -1) {
                    const charBefore = pos > 0 ? text[pos - 1] : null;
                    if (!charBefore || !/[\u4e00-\u9fff]/.test(charBefore)) {
                        found = true;
                        break;
                    }
                    pos = text.indexOf(name, pos + 1);
                }
            } else {
                found = text.includes(name);
            }
            if (found) {
                stocks.push({ code, name });
                seenCodes.add(code);
            }
        }
    }

    return stocks;
}

// --- Helper for Impact Analysis ---
// 否定前綴：當關鍵字前方出現這些詞時，反轉該關鍵字的多空方向
const NEGATION_PREFIXES = ['未能', '無法', '難以', '不再', '未見', '不如預期的'];

function analyzeImpact(text) {
    // weight ≥ 2: 高確信（具體財務數據）; weight 1: 一般訊號
    const bullish = [
        { k: '營收創新高', w: 2 }, { k: '獲利大增', w: 2 }, { k: '獲利暴增', w: 2 },
        { k: '獲利創新高', w: 2 }, { k: '業績創新高', w: 2 },
        { k: '攻漲停', w: 1 }, { k: '拉漲停', w: 1 }, { k: '漲停', w: 1 }, { k: '連拉', w: 1 },
        { k: '大買', w: 1 }, { k: '法人買超', w: 1 }, { k: '買超', w: 1 },
        { k: '配息創高', w: 2 }, { k: '股利創高', w: 2 }, { k: '高配息', w: 1 },
        { k: '強漲', w: 1 }, { k: '利多', w: 1 }, { k: '優於預期', w: 2 }, { k: '上修', w: 1 }, { k: '擴產', w: 1 },
        { k: '創新高', w: 1 }, { k: '創高', w: 1 }, { k: '完工', w: 1 }, { k: '入帳', w: 1 }, { k: '法說報喜', w: 2 },
        { k: '啟動', w: 1 }, { k: '啟用', w: 1 }, { k: '外資調升', w: 2 }, { k: '調升目標價', w: 2 }, { k: '衝新高', w: 1 },
        { k: '大幅成長', w: 2 }, { k: '超越預期', w: 2 }, { k: '勝訴', w: 1 },
    ];
    const bearish = [
        { k: '營收衰退', w: 2 }, { k: '虧損擴大', w: 2 }, { k: '虧損', w: 2 }, { k: '淨損', w: 2 },
        { k: '跌停', w: 1 }, { k: '重挫', w: 2 },
        { k: '大賣', w: 1 }, { k: '法人賣超', w: 1 }, { k: '賣超', w: 1 },
        { k: '罰鍰', w: 1 }, { k: '違約', w: 1 }, { k: '遭罰', w: 1 },
        { k: '利空', w: 1 }, { k: '下修', w: 1 }, { k: '不如預期', w: 2 },
        { k: '裁員', w: 1 }, { k: '衰退', w: 1 }, { k: '減產', w: 1 }, { k: '敗訴', w: 1 },
        { k: '不漲反跌', w: 2 }, { k: '反跌', w: 1 }, { k: '利多出盡', w: 2 }, { k: '股價不漲', w: 1 },
        { k: '利多失效', w: 2 }, { k: '走弱', w: 1 }, { k: '全面走弱', w: 2 },
    ];

    // 檢查關鍵字是否被否定前綴修飾（出現在關鍵字前 4 字內）
    const isNegated = (keyword) => {
        const idx = text.indexOf(keyword);
        if (idx <= 0) return false;
        const prefix = text.substring(Math.max(0, idx - 4), idx);
        return NEGATION_PREFIXES.some(neg => prefix.includes(neg));
    };

    let score = 0;

    // Compound bearish phrases that contain bullish substrings — must be checked first
    const compoundBearish = ['利多失效', '利多出盡'];
    let compoundMask = '';
    compoundBearish.forEach(phrase => {
        if (text.includes(phrase)) {
            score -= 2;
            // Mask the phrase so "利多" inside it doesn't match as bullish
            compoundMask += phrase;
        }
    });

    // Process bearish keywords (skip compound phrases already scored above)
    bearish.forEach(({ k, w }) => {
        if (compoundBearish.includes(k) && compoundMask.includes(k)) return;
        if (text.includes(k)) score -= isNegated(k) ? -w : w;
    });
    // Then bullish, skipping keywords contained in compound bearish matches
    bullish.forEach(({ k, w }) => {
        if (text.includes(k)) {
            // Skip if this keyword is part of a compound bearish phrase already scored
            if (compoundMask.includes(k)) return;
            score += isNegated(k) ? -w : w;
        }
    });

    if (score > 0) return '⬆️ 利多';
    if (score < 0) return '⬇️ 利空';
    return '➖ 中性';
}

// Filter: skip routine annual financial disclosures (not actionable for盤前)
function isRoutineDisclosure(title) {
    const patterns = [
        /\d{3}年綜合損益表/,             // e.g. "114年綜合損益表，每股虧損X元"
        /\d{3}年度累積虧損達實收資本額/,  // e.g. "114年度累積虧損達實收資本額二分之一"
        /自結\d{3}年合併虧損/,            // e.g. "自結114年合併虧損X億元"
        /\d{3}年合併虧損.*每股稅後/,      // e.g. "114年合併虧損X億元，每股稅後-Y元"
    ];
    return patterns.some(re => re.test(title));
}

// Clickbait penalty: titles matching these patterns get 0.5x weight
const CLICKBAIT_RE = /[~～！]{2,}|黑馬|曝光|飆股|必看/;

// Compute impact map from all news
// instMap (optional): code → instNetNum，用於計算法人確認欄位
// 同一股票出現多則新聞時，彙總多空訊號取淨方向；若多空相消則排除
function computeImpactMap(newsItems, nameCodeMap, instMap) {
    const aggMap = new Map(); // code → { name, bullish, bearish, reasons[] }
    if (Array.isArray(newsItems)) {
        newsItems.forEach(item => {
            const title = item.title || '';
            if (isRoutineDisclosure(title)) return; // skip routine annual disclosures
            const impact = analyzeImpact(title);
            if (impact === '➖ 中性') return;
            // Clickbait penalty: reduce weight by 0.5x
            const weight = CLICKBAIT_RE.test(title) ? 0.5 : 1;
            extractAllStocks(title, nameCodeMap).forEach(stock => {
                if (!aggMap.has(stock.code)) {
                    aggMap.set(stock.code, { name: stock.name, bullish: 0, bearish: 0, reasons: [] });
                }
                const entry = aggMap.get(stock.code);
                if (impact === '⬆️ 利多') entry.bullish += weight;
                else entry.bearish += weight;
                entry.reasons.push(title);
            });
        });
    }
    // 彙總：取淨方向，多空相消則排除
    const map = new Map();
    for (const [code, agg] of aggMap) {
        const net = agg.bullish - agg.bearish;
        if (net === 0) continue; // 多空訊號相消 → 中性，略過
        const impact = net > 0 ? '⬆️ 利多' : '⬇️ 利空';
        const reason = agg.reasons[0]; // 取第一則（最新）作為代表理由
        const instNetNum = instMap ? (instMap.get(code) ?? null) : null;
        map.set(code, { name: agg.name, impact, reason, instNetNum });
    }
    return map;
}

// ============================================================
// 共用工具函式（從 generateImpactTable 提取，無閉包依賴）
// ============================================================

/** 信心等級：3=法人方向一致, 2=無法人資料, 1=法人方向相反 */
function getConfidence(impact, instNetNum) {
    const isBullish = impact.includes('利多');
    if (instNetNum === null) return 2;
    return ((isBullish && instNetNum > 0) || (!isBullish && instNetNum < 0)) ? 3 : 1;
}

const confLabel = (c) => c === 3 ? '★★★' : c === 2 ? '★★☆' : '★☆☆';

/** 法人動向格式化：✅買超 / ⚠️賣超 + 股數 */
function fmtInst(impact, instNetNum) {
    if (instNetNum === null) return '-';
    const isBullish = impact.includes('利多');
    const aligned = (isBullish && instNetNum > 0) || (!isBullish && instNetNum < 0);
    const prefix = aligned ? '✅' : '⚠️';
    const dir = instNetNum > 0 ? '買超' : '賣超';
    return `${prefix}${dir} ${Math.abs(instNetNum).toLocaleString()}`;
}

/** 子句級關鍵字判斷：以標點切分子句，只有個股名稱與關鍵字出現在同一子句才算 */
function stockInClauseWith(stockName, stockCode, reasonText, keyword) {
    if (!reasonText.includes(keyword)) return false;
    const clauses = reasonText.split(/[，；。！？]/);
    return clauses.some(clause =>
        clause.includes(keyword) &&
        (clause.includes(stockName) || clause.includes(stockCode))
    );
}

/** 新聞日期解析：將各種時間格式轉為 YYYYMMDD */
function parseNewsDate(timeStr) {
    if (!timeStr) return null;
    let m = String(timeStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}${m[2]}${m[3]}`;
    m = String(timeStr).match(/^(\d{4})\/(\d{2})\/(\d{2})/);
    if (m) return `${m[1]}${m[2]}${m[3]}`;
    m = String(timeStr).match(/^(\d{2})\/(\d{2})/);
    if (m) return `${TODAY.substring(0, 4)}${m[1]}${m[2]}`;
    return null;
}

/** OHLC 驗證漲停/跌停 */
function verifyPriceAction(code, keyword, pm) {
    const price = pm ? pm.get(code) : null;
    if (!price) return { hasData: false };
    if (keyword === '漲停') {
        const confirmed = Math.abs(price.close - price.high) < 0.011 && price.changePercent >= 9.5;
        return { hasData: true, confirmed, price };
    }
    if (keyword === '跌停') {
        const confirmed = Math.abs(price.close - price.low) < 0.011 && price.changePercent <= -9.5;
        return { hasData: true, confirmed, price };
    }
    return { hasData: true, confirmed: false, price };
}

/** Clickbait 判斷 */
const isClickbaitReason = (reason) => CLICKBAIT_RE.test(reason);

/** 字串截斷 */
const truncate = (str, maxLen) => str.length > maxLen ? str.substring(0, maxLen) + '...' : str;

/** 找出新聞中提及特定股票+關鍵字的新聞日期 */
function findNewsDateForStock(stockName, stockCode, keyword, newsItems) {
    if (!newsItems || !Array.isArray(newsItems)) return null;
    for (const item of newsItems) {
        const title = item.title || '';
        if (!title.includes(keyword)) continue;
        const clauses = title.split(/[，；。！？]/);
        const inClause = clauses.some(clause =>
            clause.includes(keyword) &&
            (clause.includes(stockName) || clause.includes(stockCode))
        );
        if (inClause) return parseNewsDate(item.time);
    }
    return null;
}

/**
 * 二次審計：以 T-1/T-2 OHLC 驗證漲停/跌停
 * @returns {{ priceTag: string, auditEntry: object|null }}
 */
function performAudit(code, stockName, keyword, newsItems, pmT1, pmT2) {
    let priceTag = '';
    let auditEntry = null;
    const newsDate = findNewsDateForStock(stockName, code, keyword, newsItems);
    const matchedT2 = newsDate && newsDate === instDateT2;

    // Try T-2 first if news date matches T-2
    if (matchedT2 && pmT2) {
        const vT2 = verifyPriceAction(code, keyword, pmT2);
        if (vT2.hasData && vT2.confirmed) {
            const vT1 = verifyPriceAction(code, keyword, pmT1);
            const t1Info = vT1.hasData
                ? ` → ${T1_SHORT} ${vT1.price.changePercent >= 0 ? '+' : ''}${vT1.price.changePercent.toFixed(1)}%`
                : '';
            const limitLabel = keyword === '漲停' ? '漲停' : '跌停';
            const sign = vT2.price.changePercent >= 0 ? '+' : '';
            priceTag = `⚠️${T2_SHORT} ${limitLabel}(${sign}${vT2.price.changePercent.toFixed(1)}%)${t1Info}｜`;
            const resultLabel = vT1.hasData
                ? `✅ 確認(T-2${t1Info.includes('-') ? ', 回落' : ''})`
                : '✅ 確認(T-2)';
            auditEntry = { code, name: stockName, claim: keyword, result: resultLabel,
                close: vT2.price.close, high: keyword === '漲停' ? vT2.price.high : vT2.price.low,
                pct: vT2.price.changePercent,
                t1pct: vT1.hasData ? vT1.price.changePercent : null,
                newsDate: T2_SHORT };
            return { priceTag, auditEntry };
        }
    }

    // Default: verify against T-1
    const v = verifyPriceAction(code, keyword, pmT1);
    if (keyword === '漲停') {
        if (v.hasData && v.confirmed) {
            priceTag = `⚠️${T1_SHORT}漲停(+${v.price.changePercent.toFixed(1)}%)｜`;
            auditEntry = { code, name: stockName, claim: '漲停', result: '✅ 確認',
                close: v.price.close, high: v.price.high, pct: v.price.changePercent };
        } else if (v.hasData) {
            if (pmT2) {
                const vT2 = verifyPriceAction(code, keyword, pmT2);
                if (vT2.hasData && vT2.confirmed) {
                    const t1Sign = v.price.changePercent >= 0 ? '+' : '';
                    priceTag = `⚠️${T2_SHORT} 漲停(+${vT2.price.changePercent.toFixed(1)}%) → ${T1_SHORT} 回落(${t1Sign}${v.price.changePercent.toFixed(1)}%)｜`;
                    auditEntry = { code, name: stockName, claim: '漲停', result: '✅ 確認(T-2, 回落)',
                        close: vT2.price.close, high: vT2.price.high, pct: vT2.price.changePercent,
                        t1pct: v.price.changePercent, newsDate: T2_SHORT };
                    return { priceTag, auditEntry };
                }
            }
            const sign = v.price.changePercent >= 0 ? '+' : '';
            priceTag = `📊${T1_SHORT}收${v.price.close}(${sign}${v.price.changePercent.toFixed(1)}%)｜`;
            auditEntry = { code, name: stockName, claim: '漲停', result: '❌ 非漲停',
                close: v.price.close, high: v.price.high, pct: v.price.changePercent };
        } else {
            priceTag = `⚠️${T1_SHORT}疑似漲停(未驗證)｜`;
            auditEntry = { code, name: stockName, claim: '漲停', result: '⚠️ 無資料',
                close: '-', high: '-', pct: '-' };
        }
    } else if (keyword === '跌停') {
        if (v.hasData && v.confirmed) {
            priceTag = `⚠️${T1_SHORT}跌停(${v.price.changePercent.toFixed(1)}%)｜`;
            auditEntry = { code, name: stockName, claim: '跌停', result: '✅ 確認',
                close: v.price.close, high: v.price.low, pct: v.price.changePercent };
        } else if (v.hasData) {
            if (pmT2) {
                const vT2 = verifyPriceAction(code, keyword, pmT2);
                if (vT2.hasData && vT2.confirmed) {
                    const t1Sign = v.price.changePercent >= 0 ? '+' : '';
                    priceTag = `⚠️${T2_SHORT} 跌停(${vT2.price.changePercent.toFixed(1)}%) → ${T1_SHORT} 反彈(${t1Sign}${v.price.changePercent.toFixed(1)}%)｜`;
                    auditEntry = { code, name: stockName, claim: '跌停', result: '✅ 確認(T-2, 反彈)',
                        close: vT2.price.close, high: vT2.price.low, pct: vT2.price.changePercent,
                        t1pct: v.price.changePercent, newsDate: T2_SHORT };
                    return { priceTag, auditEntry };
                }
            }
            const sign = v.price.changePercent >= 0 ? '+' : '';
            priceTag = `📊${T1_SHORT}收${v.price.close}(${sign}${v.price.changePercent.toFixed(1)}%)｜`;
            auditEntry = { code, name: stockName, claim: '跌停', result: '❌ 非跌停',
                close: v.price.close, high: v.price.low, pct: v.price.changePercent };
        } else {
            priceTag = `⚠️${T1_SHORT}疑似跌停(未驗證)｜`;
            auditEntry = { code, name: stockName, claim: '跌停', result: '⚠️ 無資料',
                close: '-', high: '-', pct: '-' };
        }
    }
    return { priceTag, auditEntry };
}

/** 做空候選清單建構 */
function buildShortCandidates(auditLog, impactMap, priceMap, instMap, marginMap) {
    const candidates = [];
    // 1. Confirmed limit-up + institutional selling
    auditLog.forEach(a => {
        if (a.result.includes('✅') && a.claim === '漲停') {
            const instNet = instMap ? instMap.get(a.code) : null;
            if (instNet !== null && instNet < 0) {
                candidates.push({ code: a.code, name: a.name, changePct: a.pct,
                    instDir: `賣超 ${Math.abs(instNet).toLocaleString()}`, risk: '漲停+法人賣超' });
            }
        }
    });
    // 2. Large gain + institutional selling
    for (const [code, info] of impactMap) {
        if (candidates.some(c => c.code === code)) continue;
        const price = priceMap ? priceMap.get(code) : null;
        if (price && price.changePercent > 7 && info.instNetNum !== null && info.instNetNum < 0) {
            candidates.push({ code, name: info.name, changePct: price.changePercent,
                instDir: `賣超 ${Math.abs(info.instNetNum).toLocaleString()}`, risk: '大漲+法人賣超' });
        }
    }
    // 3. Margin chasing
    for (const [code, info] of impactMap) {
        if (candidates.some(c => c.code === code)) continue;
        const price = priceMap ? priceMap.get(code) : null;
        const margin = marginMap ? marginMap.get(code) : null;
        if (price && price.changePercent > 5 && margin && margin.marginChange > 500) {
            candidates.push({ code, name: info.name, changePct: price.changePercent,
                instDir: `融資+${margin.marginChange}張`, risk: '大漲+散戶追價' });
        }
    }
    // 4. T-2 pullback
    auditLog.forEach(a => {
        if (candidates.some(c => c.code === a.code)) return;
        if (a.result.includes('T-2') && a.claim === '漲停' && a.result.includes('✅')) {
            if (a.t1pct !== null && a.t1pct < a.pct * 0.5) {
                const instNet = instMap ? instMap.get(a.code) : null;
                const instLabel = instNet !== null
                    ? (instNet > 0 ? `買超 ${Math.abs(instNet).toLocaleString()}` : `賣超 ${Math.abs(instNet).toLocaleString()}`)
                    : '-';
                candidates.push({ code: a.code, name: a.name, changePct: a.t1pct,
                    instDir: instLabel, risk: 'T-2漲停→T-1回落' });
            }
        }
    });
    return candidates;
}

/** 渲染做空候選表格 */
function renderShortCandidates(shortCandidates, marginMap) {
    if (shortCandidates.length === 0) return '';
    let output = `### ⚠️ 利多出盡 / 做空候選\n\n`;
    output += `> ${T1_LABEL}漲停 + 法人反向賣超 / 融資暴增 = 高機率回落標的\n\n`;
    output += `| 代碼 | 名稱 | ${T1_SHORT}漲跌% | 法人動向 | 融資增減 | 風險因子 |\n`;
    output += `|------|------|---------|----------|---------|----------|\n`;
    shortCandidates.forEach(c => {
        const sign = c.changePct >= 0 ? '+' : '';
        const margin = marginMap ? marginMap.get(c.code) : null;
        const mChg = margin ? (margin.marginChange >= 0 ? `+${margin.marginChange}` : `${margin.marginChange}`) : '-';
        output += `| ${c.code} | ${c.name} | ${sign}${c.changePct.toFixed(1)}% | ${c.instDir} | ${mChg} | ${c.risk} |\n`;
    });
    return output + '\n';
}

/** 渲染上榜個股價量明細表 */
function renderPriceDetailTable(impactMap, priceMap, volumeMap, marginMap) {
    const rows = [];
    for (const [code, info] of impactMap) {
        const price = priceMap ? priceMap.get(code) : null;
        if (!price) continue;
        const vol = volumeMap ? (volumeMap.get(code) || 0) : 0;
        const volLots = Math.round(vol / 1000);
        let instRatio = '-';
        if (info.instNetNum !== null && vol > 0) {
            instRatio = `${(Math.abs(info.instNetNum) / vol * 100).toFixed(1)}%`;
        }
        const margin = marginMap ? marginMap.get(code) : null;
        const sign = price.changePercent >= 0 ? '+' : '';
        rows.push({
            code, name: info.name, close: price.close,
            changePct: `${sign}${price.changePercent.toFixed(1)}%`,
            peStr: formatPE(price.pe),
            volLots: volLots.toLocaleString(),
            instRatio,
            marginChg: margin?.marginChange != null ? (margin.marginChange >= 0 ? `+${margin.marginChange}` : `${margin.marginChange}`) : '-',
            shortChg: margin?.shortChange != null ? (margin.shortChange >= 0 ? `+${margin.shortChange}` : `${margin.shortChange}`) : '-',
        });
    }
    if (rows.length === 0) return '';
    let output = `### 📊 上榜個股${T1_LABEL}價量明細\n\n`;
    output += `| 代碼 | 名稱 | ${T1_SHORT}收盤 | 漲跌% | 本益比 | 量(張) | 法人佔比 | 融資增減 | 融券增減 |\n`;
    output += `|------|------|------|-------|--------|--------|---------|---------|----------|\n`;
    rows.forEach(r => {
        output += `| ${r.code} | ${r.name} | ${r.close} | ${r.changePct} | ${r.peStr} | ${r.volLots} | ${r.instRatio} | ${r.marginChg} | ${r.shortChg} |\n`;
    });
    return output + '\n';
}

/** 渲染審計紀錄表 */
function renderAuditSection(auditLog) {
    if (auditLog.length === 0) return '';
    let output = `### 🔍 二次審計（${T1_LABEL}股價驗證）\n\n`;
    output += `> 針對報告中提及「漲停」「跌停」之個股，以${T1_LABEL}實際 OHLC 交叉驗證。\n`;
    output += `> 支援 T-2 日期交叉比對：若新聞來自${T2_SHORT}，以該日股價驗證，並顯示${T1_SHORT}後續走勢。\n\n`;
    output += `| 代碼 | 名稱 | 新聞提及 | ${T1_SHORT}收盤 | 最高 | ${T1_SHORT}漲跌% | 結果 |\n`;
    output += `|------|------|----------|------|------|---------|------|\n`;
    auditLog.forEach(a => {
        const pctStr = typeof a.pct === 'number' ? `${a.pct >= 0 ? '+' : ''}${a.pct.toFixed(1)}%` : a.pct;
        const t1Str = a.t1pct != null ? ` (T-1: ${a.t1pct >= 0 ? '+' : ''}${a.t1pct.toFixed(1)}%)` : '';
        const dateStr = a.newsDate ? ` [${a.newsDate}]` : '';
        output += `| ${a.code} | ${a.name} | ${a.claim}${dateStr} | ${a.close} | ${a.high} | ${pctStr}${t1Str} | ${a.result} |\n`;
    });
    return output + '\n';
}

/** 新聞列表渲染（DRY：cnyes / statementdog / moneydj 共用） */
function renderNewsList(items, sourceName, filterFn) {
    if (!items || (Array.isArray(items) && items.length === 0)) {
        return `### ${sourceName}\n(無${sourceName}資料)\n\n`;
    }
    const list = Array.isArray(items) ? items : (items?.data || []);
    const filtered = filterFn ? list.filter(filterFn) : list;
    if (filtered.length === 0) {
        return `### ${sourceName}\n(過濾後無有效新聞)\n\n`;
    }
    let output = `### ${sourceName}\n`;
    filtered.slice(0, 15).forEach(news => {
        output += `- [${news.title}](${news.link || '#'}) (${news.time})\n`;
    });
    return output + '\n';
}

// ============================================================
// 個股影響總表（主函式）
// ============================================================

function generateImpactTable(impactMap, priceMap, priceMapT2, volumeMap, instMap, marginMap, marketChangePct, allNewsItems) {
    let output = `## 📊 個股影響總表\n\n`;

    if (impactMap.size === 0) {
        output += `(今日新聞未偵測到明顯個股利多/空關鍵字)\n\n`;
        return { output, auditLog: [], shortCandidates: [], bullA: [], bullB: [], bullC: [], bearA: [], bearB: [], bearC: [] };
    }

    // 審計 + priceTag 建構（使用模組級 performAudit，回傳 { priceTag, auditEntry }）
    const auditLog = [];
    const priceTags = new Map();

    for (const [code, info] of impactMap) {
        let priceTag = '';
        if (info.impact.includes('利多') && stockInClauseWith(info.name, code, info.reason, '漲停')) {
            const r = performAudit(code, info.name, '漲停', allNewsItems, priceMap, priceMapT2);
            priceTag = r.priceTag;
            if (r.auditEntry) auditLog.push(r.auditEntry);
        }
        if (info.impact.includes('利空') && stockInClauseWith(info.name, code, info.reason, '跌停')) {
            const r = performAudit(code, info.name, '跌停', allNewsItems, priceMap, priceMapT2);
            priceTag = r.priceTag;
            if (r.auditEntry) auditLog.push(r.auditEntry);
        }
        priceTags.set(code, priceTag);
    }

    // A/B/C 分級
    const isT2Pullback = (code) => auditLog.some(a => a.code === code && a.result.includes('T-2') && a.result.includes('回落'));

    const classifyTier = (code, info) => {
        const conf = getConfidence(info.impact, info.instNetNum);
        if (conf === 3 && !isClickbaitReason(info.reason) && !isT2Pullback(code)) return 'A';
        if (conf >= 2) return 'B';
        return 'C';
    };

    const renderTieredTable = (entries, tier) => {
        if (entries.length === 0) return '(無)\n\n';
        let t = '';
        if (tier === 'A') {
            t += `| 代碼 | 名稱 | 本益比 | 法人動向 | 簡要理由 |\n`;
            t += `|------|------|--------|----------|----------|\n`;
        } else {
            t += `| 代碼 | 名稱 | 信心 | 法人動向 | 簡要理由 |\n`;
            t += `|------|------|------|----------|----------|\n`;
        }
        entries.forEach(([code, info]) => {
            const conf = getConfidence(info.impact, info.instNetNum);
            const priceTag = priceTags.get(code) || '';
            const reason = truncate(info.reason, 40);
            if (tier === 'A') {
                const price = priceMap ? priceMap.get(code) : null;
                const peStr = price ? formatPE(price.pe) : '-';
                t += `| ${code} | ${info.name} | ${peStr} | ${fmtInst(info.impact, info.instNetNum)} | ${priceTag}${reason} |\n`;
            } else {
                t += `| ${code} | ${info.name} | ${confLabel(conf)} | ${fmtInst(info.impact, info.instNetNum)} | ${priceTag}${reason} |\n`;
            }
        });
        return t + '\n';
    };

    const bullish = [...impactMap.entries()].filter(([, v]) => v.impact === '⬆️ 利多');
    const bearish = [...impactMap.entries()].filter(([, v]) => v.impact === '⬇️ 利空');

    // DRY：利多/利空 A/B/C 渲染共用邏輯
    const renderSide = (entries, label, warning) => {
        let s = `### ${label}\n\n`;
        if (warning) s += `> ${warning}\n\n`;
        const a = entries.filter(([code, info]) => classifyTier(code, info) === 'A').slice(0, 5);
        const b = entries.filter(([code, info]) => classifyTier(code, info) === 'B');
        const c = entries.filter(([code, info]) => classifyTier(code, info) === 'C');
        s += `#### \uD83C\uDD70\uFE0F A 級（法人方向一致 + 題材硬，共 ${a.length} 檔）\n\n`;
        s += renderTieredTable(a, 'A');
        s += `#### \uD83C\uDD71\uFE0F B 級（條件未全，共 ${b.length} 檔）\n\n`;
        s += renderTieredTable(b, 'B');
        s += `#### \u2139\uFE0F C 級（法人方向相反，共 ${c.length} 檔）\n\n`;
        s += renderTieredTable(c, 'C');
        return { s, a, b, c };
    };

    const bullResult = renderSide(bullish, '⬆️ 利多',
        marketChangePct <= -1 ? '⚠️ 大盤重挫逾 1%，利多個股開盤恐受壓，追高風險升高' : null);
    output += bullResult.s;
    const { a: bullA, b: bullB, c: bullC } = bullResult;

    const bearResult = renderSide(bearish, '⬇️ 利空',
        marketChangePct >= 1 ? '📈 大盤強漲，利空個股跌幅可能受限' : null);
    output += bearResult.s;
    const { a: bearA, b: bearB, c: bearC } = bearResult;

    output += `> 信心說明：★★★ 法人方向一致｜★★☆ 無法人資料｜★☆☆ 法人方向相反（高風險）\n\n`;

    // 委派渲染至模組級函式
    output += renderAuditSection(auditLog);
    const shortCandidates = buildShortCandidates(auditLog, impactMap, priceMap, instMap, marginMap);
    output += renderShortCandidates(shortCandidates, marginMap);
    output += renderPriceDetailTable(impactMap, priceMap, volumeMap, marginMap);

    return { output, auditLog, shortCandidates, bullA, bullB, bullC, bearA, bearB, bearC };
}

// --- Theme patterns for sector grouping ---
const THEME_PATTERNS = [
    { pattern: /低軌衛星|衛星|SpaceX/i, name: '低軌衛星（SpaceX IPO）' },
    { pattern: /PCB|載板|印刷電路/i, name: 'PCB / 載板' },
    { pattern: /玻纖|玻璃纖維/i, name: '玻纖布' },
    { pattern: /記憶體|DRAM|NAND|HBM/i, name: '記憶體' },
    { pattern: /AI.{0,5}伺服器|液冷|散熱/i, name: 'AI 伺服器 / 散熱' },
    { pattern: /矽光子|光通訊/i, name: '矽光子 / 光通訊' },
    { pattern: /機器人|自動化/i, name: '機器人 / 自動化' },
    { pattern: /風電|離岸風電|再生能源/i, name: '風電 / 再生能源' },
];

// --- Theme context: static fallback + dynamic from news ---
const THEME_CONTEXT = {
    '低軌衛星（SpaceX IPO）': 'SpaceX 擬 IPO，帶動衛星供應鏈短線題材',
    'PCB / 載板': 'AI 伺服器帶動 ABF 載板需求，但短線漲多需留意回檔',
    '玻纖布': '供給端吃緊推升報價，惟法人全面賣超顯示追高意願低',
    '記憶體': 'DRAM/NAND 價格波動影響記憶體族群表現',
    'AI 伺服器 / 散熱': 'AI 推論需求持續擴張，散熱/液冷為長線趨勢',
    '矽光子 / 光通訊': '資料中心互連升級帶動光通訊需求',
    '機器人 / 自動化': '人形機器人題材持續發酵',
    '風電 / 再生能源': '離岸風電選商即將啟動',
};

function generateThemeSection(allNewsItems, nameCodeMap, priceMap, auditLog) {
    let output = `## 🏭 主攻族群\n\n`;

    // For each theme, scan all news items and collect stocks mentioned in matching titles
    const themeGroups = new Map(); // theme name → Map(code → { name, pct, isLimitUp, isLimitDown })
    const themeNewsMap = new Map(); // theme name → matching news items

    if (!Array.isArray(allNewsItems) || allNewsItems.length === 0) {
        output += `(無新聞資料可分析族群)\n\n`;
        return { output, themeGroups };
    }

    THEME_PATTERNS.forEach(({ pattern, name: themeName }) => {
        const stockMap = new Map();
        const matchingNews = [];
        allNewsItems.forEach(item => {
            const title = item.title || '';
            if (!pattern.test(title)) return;
            matchingNews.push(item);
            const stocks = extractAllStocks(title, nameCodeMap);
            stocks.forEach(({ code, name }) => {
                if (stockMap.has(code)) return;
                const price = priceMap ? priceMap.get(code) : null;
                const pct = price ? price.changePercent : null;
                const isLimitUp = auditLog && auditLog.some(a => a.code === code && a.claim === '漲停' && a.result.includes('✅'));
                const isLimitDown = auditLog && auditLog.some(a => a.code === code && a.claim === '跌停' && a.result.includes('✅'));
                stockMap.set(code, { name, pct, isLimitUp, isLimitDown });
            });
        });
        if (stockMap.size > 0) {
            themeGroups.set(themeName, stockMap);
            themeNewsMap.set(themeName, matchingNews);
        }
    });

    if (themeGroups.size === 0) {
        output += `(未偵測到明顯族群訊號)\n\n`;
        return { output, themeGroups };
    }

    for (const [themeName, stockMap] of themeGroups) {
        output += `### ${themeName}\n`;

        // Theme context line: dynamic from longest matching news title, fallback to static
        const themeNews = themeNewsMap.get(themeName) || [];
        const contextNews = themeNews.sort((a, b) => (b.title || '').length - (a.title || '').length)[0];
        const context = contextNews ? contextNews.title.substring(0, 40) : (THEME_CONTEXT[themeName] || '');
        if (context) {
            output += `> ${context}\n`;
        }

        const parts = [];
        for (const [code, info] of stockMap) {
            let label = `${info.name}(${code})`;
            if (info.pct !== null) {
                const sign = info.pct >= 0 ? '+' : '';
                if (info.isLimitUp) label = `${info.name}(⚠️漲停${sign}${info.pct.toFixed(1)}%)`;
                else if (info.isLimitDown) label = `${info.name}(⚠️跌停${sign}${info.pct.toFixed(1)}%)`;
                else label = `${info.name}(${sign}${info.pct.toFixed(1)}%)`;
            }
            parts.push(label);
        }
        output += parts.join(' | ') + '\n';

        // Check for warnings: if theme has mixed signals (some up, some down)
        const pcts = [...stockMap.values()].filter(v => v.pct !== null).map(v => v.pct);
        const hasLimitDown = [...stockMap.values()].some(v => v.isLimitDown);
        const hasPullback = pcts.some(p => p < -1) && pcts.some(p => p > 3);
        if (hasLimitDown) {
            output += `> ⚠️ 族群有跌停個股，注意利空衝擊\n`;
        } else if (hasPullback) {
            output += `> ⚠️ 族群內已分化，部分個股回落\n`;
        }
        output += '\n';
    }

    return { output, themeGroups };
}

// --- 投資決策重點 ---
function generateDecisionSection(impactMap, twseData, tpexData) {
    let section = `## 💡 投資決策重點\n\n`;

    // Top institutional buys (positive net buy/sell)
    // 統一取得買超股數，合併 TWSE + TPEX 後按金額排序再取 Top 5
    const getNetBuy = (item) => parseNum(getInstNetStr(item));
    const allInst = [...(twseData?.data || []), ...(tpexData?.data || [])];
    const topBuys = allInst
        .filter(i => isStockCode(getCode(i)) && getNetBuy(i) > 0)
        .sort((a, b) => getNetBuy(b) - getNetBuy(a))
        .slice(0, 5);

    if (topBuys.length > 0) {
        section += `### 🏦 法人重點買超（${T1_LABEL}前5名）\n`;
        topBuys.forEach(item => {
            section += `- **${getCode(item)} ${getName(item)}**：法人買超 ${getInstNetStr(item)} 股\n`;
        });
        section += '\n';
    }

    // Bullish stocks from impact map
    const bullishStocks = [...impactMap.entries()].filter(([, v]) => v.impact === '⬆️ 利多');
    if (bullishStocks.length > 0) {
        section += `### ⬆️ 利多關注\n`;
        bullishStocks.forEach(([code, info]) => {
            const reason = truncate(info.reason, 50);
            section += `- **${code} ${info.name}**：${reason}\n`;
        });
        section += '\n';
    }

    // Bearish stocks from impact map
    const bearishStocks = [...impactMap.entries()].filter(([, v]) => v.impact === '⬇️ 利空');
    if (bearishStocks.length > 0) {
        section += `### ⬇️ 利空注意\n`;
        bearishStocks.forEach(([code, info]) => {
            const reason = truncate(info.reason, 50);
            section += `- **${code} ${info.name}**：${reason}\n`;
        });
        section += '\n';
    }

    if (topBuys.length === 0 && impactMap.size === 0) {
        section += `(今日無明顯投資訊號)\n\n`;
    }

    return section;
}

// --- Build inst code→netNum map (for 法人確認) ---
function buildInstMap(twseData, tpexData) {
    const map = new Map();
    const parseInstNum = (s) => {
        const n = parseInt(String(s || '0').replace(/,/g, ''), 10);
        return isNaN(n) ? null : n;
    };
    const addItems = (data) => {
        (data?.data || []).forEach(item => {
            const code = getCode(item);
            const val = parseInstNum(getInstNetStr(item));
            if (code && val !== null) map.set(code, val);
        });
    };
    addItems(twseData);
    addItems(tpexData);
    return map;
}

// --- Build price map from OHLC data (for 二次審計) ---
function buildPriceMap(twsePrices, tpexPrices) {
    const map = new Map(); // code → { open, high, low, close, change, prevClose, changePercent, pe }
    const pf = (s) => { const v = parseFloat(String(s || '0').replace(/,/g, '')); return isNaN(v) ? 0 : v; };

    // TWSE MI_INDEX: fields 動態查找以適應欄位順序變動；方向欄位可能含 HTML
    {
        const stockTable = findTwseStockTable(twsePrices);
        if (stockTable && stockTable.data) {
            const fields = stockTable.fields || [];
            const fi = (name) => fields.indexOf(name);
            const iCode = fi('證券代號'), iOpen = fi('開盤價'), iHigh = fi('最高價');
            const iLow = fi('最低價'), iClose = fi('收盤價'), iDir = fi('漲跌(+/-)'), iChange = fi('漲跌價差');
            const iPE = fi('本益比');
            if (iCode >= 0 && iClose >= 0) {
                stockTable.data.forEach(row => {
                    const code = String(row[iCode] || '').trim();
                    if (!isStockCode(code)) return;
                    const open = pf(row[iOpen]), high = pf(row[iHigh]), low = pf(row[iLow]), close = pf(row[iClose]);
                    const dirStr = String(row[iDir] || '+');
                    const sign = dirStr.includes('-') ? -1 : 1;
                    const change = sign * pf(row[iChange]);
                    const prevClose = close - change;
                    const changePercent = prevClose > 0 ? +(change / prevClose * 100).toFixed(2) : 0;
                    const pe = iPE >= 0 ? pf(row[iPE]) : 0;
                    map.set(code, { open, high, low, close, change, prevClose, changePercent, pe });
                });
            }
        }
    }

    // TPEX: data[i] = [代號, 名稱, 收盤, 漲跌, 開盤, 最高, 最低, 成交股數, ...]
    // TPEX data does not include PE ratio
    if (tpexPrices && tpexPrices.data) {
        tpexPrices.data.forEach(row => {
            const code = String(row[0] || '').trim();
            if (!isStockCode(code)) return;
            const close = pf(row[2]), change = pf(row[3]);
            const open = pf(row[4]), high = pf(row[5]), low = pf(row[6]);
            const prevClose = close - change;
            const changePercent = prevClose > 0 ? +(change / prevClose * 100).toFixed(2) : 0;
            map.set(code, { open, high, low, close, change, prevClose, changePercent, pe: 0 });
        });
    }

    return map;
}

// --- PE ratio formatting helper ---
function formatPE(pe) {
    if (!pe || pe === 0) return '-';
    const peVal = parseFloat(pe);
    if (isNaN(peVal) || peVal === 0) return '-';
    let label = '';
    if (peVal > 50) label = ' ⚠️高估';
    else if (peVal > 30) label = ' 偏高';
    else if (peVal < 10) label = ' 低估';
    return `${peVal.toFixed(1)}${label}`;
}

// --- Build volume map from OHLC data (for 個股價量明細) ---
function buildVolumeMap(twsePrices, tpexPrices) {
    const map = new Map(); // code → volumeShares (in 股)
    const pn = (s) => parseInt(String(s || '0').replace(/,/g, '')) || 0;

    // TWSE 成交股數
    {
        const stockTable = findTwseStockTable(twsePrices);
        if (stockTable?.data) {
            const fields = stockTable.fields || [];
            const iCode = fields.indexOf('證券代號');
            const iVol = fields.indexOf('成交股數');
            if (iCode >= 0 && iVol >= 0) {
                stockTable.data.forEach(row => {
                    const code = String(row[iCode] || '').trim();
                    if (!isStockCode(code)) return;
                    map.set(code, pn(row[iVol]));
                });
            }
        }
    }

    // TPEX: data[i][8] is 成交股數
    if (tpexPrices && tpexPrices.data) {
        tpexPrices.data.forEach(row => {
            const code = String(row[0] || '').trim();
            if (!isStockCode(code)) return;
            map.set(code, pn(row[8]));
        });
    }

    return map;
}

// --- Build margin map from 融資融券 data ---
function buildMarginMap(twseMargin, tpexMargin) {
    const map = new Map();
    const addData = (list) => {
        if (!Array.isArray(list)) return;
        list.forEach(item => {
            const code = String(item.code || '').trim();
            if (!isStockCode(code)) return;
            map.set(code, {
                marginChange: item.marginChange ?? null,
                shortChange: item.shortChange ?? null,
                marginBalance: item.marginBalance ?? null,
                shortBalance: item.shortBalance ?? null,
            });
        });
    };
    addData(twseMargin?.data);
    addData(tpexMargin?.data);
    return map;
}

// --- 大盤概況 ---
function generateMarketSummary(twsePrices, taifex) {
    let output = `## 📈 大盤概況（${T1_LABEL}）\n\n`;

    if (!twsePrices || !twsePrices.tables) {
        output += `(無 TWSE 行情資料)\n\n`;
        return { output, marketChangePct: 0 };
    }

    // Table 0: 價格指數 — 發行量加權股價指數
    let indexClose = '-', indexChange = '-', indexChangePct = 0, indexChangeStr = '-';
    const table0 = twsePrices.tables.find(t => t.title && t.title.includes('價格指數') && !t.title.includes('跨市場') && !t.title.includes('指數公司'));
    if (table0 && table0.data) {
        const row = table0.data.find(r => String(r[0] || '').includes('發行量加權股價'));
        if (row) {
            indexClose = row[1] || '-';
            // Parse direction from HTML in 漲跌(+/-)
            const dirHtml = String(row[2] || '+');
            const sign = dirHtml.includes('-') ? '-' : '+';
            const points = row[3] || '0';
            const pct = row[4] || '0';
            // pct field may already contain sign, so use absolute value and apply direction from HTML
            indexChangePct = Math.abs(parseFloat(pct)) * (sign === '-' ? -1 : 1);
            indexChangeStr = `${sign}${points}, ${indexChangePct >= 0 ? '+' : ''}${indexChangePct.toFixed(2)}%`;
        }
    }

    // Table 6: 大盤統計資訊 — 1.一般股票
    let volumeStr = '-';
    const table6 = twsePrices.tables.find(t => t.title && t.title.includes('大盤統計資訊'));
    if (table6 && table6.data) {
        const row = table6.data.find(r => String(r[0] || '').includes('1.一般股票'));
        if (row) {
            const amount = parseInt(String(row[1] || '0').replace(/,/g, '')) || 0;
            const amountYi = Math.round(amount / 100000000);
            volumeStr = `${amountYi.toLocaleString()} 億`;
        }
    }

    // Table 7: 漲跌證券數合計 — 股票 column (index 2)
    let upCount = '-', downCount = '-', flatCount = '-', untradedCount = '-';
    const table7 = twsePrices.tables.find(t => t.title && t.title.includes('漲跌證券數合計'));
    if (table7 && table7.data) {
        // The format is e.g. "362(20)" for stocks — we need the number before the parenthesis
        const extractCount = (rowName) => {
            const row = table7.data.find(r => String(r[0] || '').startsWith(rowName));
            if (!row) return '-';
            const val = String(row[2] || '0');
            // Extract main count, stripping "(漲停/跌停)" parenthetical
            const match = val.match(/^([\d,]+)/);
            return match ? match[1] : val;
        };
        upCount = extractCount('上漲');
        downCount = extractCount('下跌');
        flatCount = extractCount('持平');
        untradedCount = extractCount('未成交');
    }

    output += `| 指標 | 數值 |\n`;
    output += `|------|------|\n`;
    output += `| 加權指數 | ${indexClose} (${indexChangeStr}) |\n`;
    output += `| 成交量（一般股票） | ${volumeStr} |\n`;
    output += `| 上漲 / 下跌 / 持平 | ${upCount} / ${downCount} / ${flatCount} |\n`;

    // TAIFEX 期貨資料
    if (taifex) {
        const tx = taifex.futures?.tx;
        if (tx) {
            const ahClose = tx.afterHoursClose;
            const dayClose = tx.close;
            const ahDiff = ahClose && dayClose ? ahClose - dayClose : null;
            const ahStr = ahClose
                ? `${ahClose} (${ahDiff >= 0 ? '+' : ''}${ahDiff})`
                : '-';
            output += `| 台指期近月收盤 | ${dayClose || '-'} (結算 ${tx.settlement || '-'}) |\n`;
            output += `| 台指期夜盤收盤 | ${ahStr} |\n`;
        }
        const foreign = taifex.institutional?.foreign;
        if (foreign) {
            const netDir = foreign.netContracts > 0 ? '淨多單' : '淨空單';
            output += `| 外資台指期未平倉 | ${netDir} ${Math.abs(foreign.netContracts).toLocaleString()} 口 |\n`;
        }
        const pc = taifex.pcRatio;
        if (pc) {
            const pcLabel = pc.ratio > 120 ? '偏空' : pc.ratio > 100 ? '中性偏空' : pc.ratio > 80 ? '中性偏多' : '偏多';
            output += `| P/C ratio | ${pc.ratio.toFixed(1)}%（${pcLabel}）|\n`;
        }
    }

    output += `\n`;

    // Multi-signal market direction scoring
    let bullSignals = 0, bearSignals = 0;
    const signals = [];

    if (indexChangePct > 0.3) { bullSignals++; signals.push(`現貨漲+${indexChangePct.toFixed(1)}%`); }
    else if (indexChangePct < -0.3) { bearSignals++; signals.push(`現貨跌${indexChangePct.toFixed(1)}%`); }

    // 夜盤方向
    const tx = taifex?.futures?.tx;
    if (tx?.afterHoursClose && tx?.close) {
        if (tx.afterHoursClose > tx.close + 50) {
            bullSignals++;
            signals.push(`夜盤反彈+${((tx.afterHoursClose - tx.close) / tx.close * 100).toFixed(1)}%`);
        } else if (tx.afterHoursClose < tx.close - 50) {
            bearSignals++;
            signals.push(`夜盤續跌${((tx.afterHoursClose - tx.close) / tx.close * 100).toFixed(1)}%`);
        }
    }

    // 外資期貨
    const foreignNet = taifex?.institutional?.foreign?.netContracts;
    if (foreignNet > 5000) { bullSignals++; signals.push(`外資期貨淨多${Math.abs(foreignNet).toLocaleString()}口`); }
    else if (foreignNet < -5000) { bearSignals++; signals.push(`外資期貨淨空${Math.abs(foreignNet).toLocaleString()}口`); }

    // P/C ratio
    const pcr = taifex?.pcRatio?.ratio;
    if (pcr && pcr < 80) { bullSignals++; signals.push(`P/C ${pcr.toFixed(0)}%`); }
    else if (pcr && pcr > 120) { bearSignals++; signals.push(`P/C ${pcr.toFixed(0)}%`); }

    // 漲跌家數
    const upN = parseInt(String(upCount).replace(/,/g, '')) || 0;
    const downN = parseInt(String(downCount).replace(/,/g, '')) || 0;
    if (upN > downN * 1.3) { bullSignals++; signals.push(`漲${upN}/跌${downN}`); }
    else if (downN > upN * 1.3) { bearSignals++; signals.push(`漲${upN}/跌${downN}`); }

    // Composite assessment
    let directionLabel;
    if (bullSignals > bearSignals + 1) { directionLabel = '📈 偏多'; }
    else if (bearSignals > bullSignals + 1) { directionLabel = '📉 偏空'; }
    else if (bullSignals > 0 && bearSignals > 0) { directionLabel = '⚖️ 多空矛盾'; }
    else { directionLabel = '➖ 中性'; }

    const directionNote = `> ${directionLabel}（${signals.join('、')}）`;

    output += directionNote + `\n\n`;

    return { output, marketChangePct: indexChangePct, directionLabel, signals };
}

// --- 風險提示 ---
function generateRiskAlerts(impactMap, priceMap, allNews, marketChangePct, taifexData, bullA, themeGroups) {
    const alerts = [];

    // 1. Sector concentration check: are A-tier stocks concentrated in one theme?
    if (bullA && bullA.length > 0 && themeGroups && themeGroups.size > 0) {
        const aCodes = new Set(bullA.map(([code]) => code));
        for (const [themeName, stockMap] of themeGroups) {
            const overlap = [...stockMap.keys()].filter(code => aCodes.has(code));
            if (overlap.length / bullA.length > 0.6 && overlap.length >= 2) {
                alerts.push(`A 級推薦中 ${overlap.length}/${bullA.length} 檔屬「${themeName}」，產業集中度偏高`);
                break;
            }
        }
    }

    // 2. Geopolitical risk scan
    const geoKeywords = ['戰爭', '戰事', '軍事', '制裁', '關稅', '禁令', '衝突', '地緣'];
    const geoNews = (allNews || []).filter(n => geoKeywords.some(k => (n.title || '').includes(k)));
    if (geoNews.length > 0) {
        alerts.push(`地緣政治風險：${geoNews[0].title.substring(0, 30)}...`);
    }

    // 3. Limit-down contagion risk
    const limitDownStocks = [...impactMap.entries()].filter(([code, info]) => {
        const price = priceMap?.get(code);
        return price && price.changePercent <= -9.5 && Math.abs(price.close - price.low) < 0.011;
    });
    if (limitDownStocks.length > 0) {
        const names = limitDownStocks.map(([, info]) => info.name).join('、');
        alerts.push(`跌停個股（${names}）可能外溢至相關供應鏈`);
    }

    // 4. Market volatility warning
    if (Math.abs(marketChangePct) > 1) {
        alerts.push(`大盤波動劇烈（${marketChangePct > 0 ? '+' : ''}${marketChangePct.toFixed(1)}%），追高殺低風險升高`);
    }

    // 5. Foreign futures contradiction
    const foreignNet = taifexData?.institutional?.foreign?.netContracts;
    if (foreignNet && foreignNet < -20000) {
        alerts.push(`外資台指期大量淨空單（${Math.abs(foreignNet).toLocaleString()} 口），中期偏空風險`);
    }

    // 6. High-PE chasing warning: any A-tier stock with PE > 40
    if (bullA && bullA.length > 0) {
        const highPeStocks = bullA.filter(([code]) => {
            const price = priceMap?.get(code);
            return price && price.pe > 40;
        });
        if (highPeStocks.length > 0) {
            const names = highPeStocks.map(([, info]) => info.name).join('、');
            alerts.push(`A 級標的中 ${names} 本益比偏高（>40），追價風險升高`);
        }
    }

    if (alerts.length === 0) {
        alerts.push('目前無特殊風險警示，惟仍應注意市場突發事件');
    }

    let section = `## ⚠️ 風險提示\n\n`;
    alerts.forEach(a => { section += `- ${a}\n`; });
    section += '\n';
    return section;
}

// --- 盤前焦點變化 ---
function generateDeltaSection(impactMap, priceMap, priceMapT2, auditLog, instMap, marginMap, allNews, nameCodeMap, themeGroups) {
    let section = `## 📋 盤前焦點變化（基於${T1_LABEL}數據）\n\n`;
    const items = [];

    // 1. New limit-up / limit-down stocks from audit
    if (auditLog && auditLog.length > 0) {
        const limitUps = auditLog.filter(a => a.claim === '漲停' && a.result.includes('✅') && !a.result.includes('T-2'));
        const limitDowns = auditLog.filter(a => a.claim === '跌停' && a.result.includes('✅') && !a.result.includes('T-2'));
        if (limitUps.length > 0) {
            const names = limitUps.map(a => `${a.name}(+${a.pct.toFixed(1)}%)`).join('、');
            // Try to find a common theme from news
            const upCodes = new Set(limitUps.map(a => a.code));
            let theme = '';
            if (themeGroups) {
                for (const [themeName, stockMap] of themeGroups) {
                    const overlap = [...stockMap.keys()].filter(c => upCodes.has(c));
                    if (overlap.length >= 2) { theme = ` — ${themeName}題材`; break; }
                }
            }
            items.push(`**${T1_SHORT}漲停（今日留意續航或回落）**：${names}${theme}`);
        }
        if (limitDowns.length > 0) {
            const names = limitDowns.map(a => `${a.name}(${a.pct.toFixed(1)}%)`).join('、');
            items.push(`**${T1_SHORT}跌停（今日留意止穩或續跌）**：${names}`);
        }
    }

    // 2. Sector rotation: theme stocks where T-2 was hot but T-1 cooled
    if (themeGroups && priceMapT2 && priceMap) {
        for (const [themeName, stockMap] of themeGroups) {
            const codes = [...stockMap.keys()];
            let t2Gains = 0, t1Cools = 0;
            const examples = [];
            for (const code of codes) {
                const t2 = priceMapT2.get(code);
                const t1 = priceMap.get(code);
                if (t2 && t1 && t2.changePercent > 3 && t1.changePercent < t2.changePercent - 3) {
                    t2Gains++;
                    t1Cools++;
                    const info = stockMap.get(code);
                    const sign = t1.changePercent >= 0 ? '+' : '';
                    examples.push(`${info.name}${sign}${t1.changePercent.toFixed(1)}%`);
                }
            }
            if (t1Cools >= 2) {
                items.push(`**族群降溫**：${themeName}（${examples.slice(0, 3).join('、')}），動能衰退`);
            }
        }
    }

    // 3. Institutional vs margin divergence
    if (instMap && marginMap) {
        for (const [code, info] of impactMap) {
            const instNet = instMap.get(code);
            const margin = marginMap.get(code);
            if (!instNet || !margin) continue;
            // Institutional buying but margin selling (smart money vs retail divergence)
            if (instNet > 5000000 && margin.marginChange < -500) {
                items.push(`**籌碼背離**：${info.name} 法人買超 ${(instNet / 10000).toFixed(0)}萬股 但融資 ${margin.marginChange} 張（散戶獲利了結、法人接棒）`);
            }
            // Institutional selling but margin buying (retail chasing, smart money exiting)
            if (instNet < -5000000 && margin.marginChange > 500) {
                items.push(`**籌碼背離**：${info.name} 法人賣超 ${(Math.abs(instNet) / 10000).toFixed(0)}萬股 但融資 +${margin.marginChange} 張（散戶追價、法人出貨）`);
            }
        }
    }

    if (items.length === 0) {
        items.push(`${T1_LABEL}無顯著結構性變化`);
    }

    items.forEach(item => { section += `- ${item}\n`; });
    section += '\n';
    return section;
}

// --- 三大法人買賣超 ---
const ETF_HEAVY_STOCKS = new Set([
    '1101','1102','1216','1301','1303','1326','2002','2105','2301','2303','2308','2317','2327','2330',
    '2357','2379','2382','2395','2412','2454','2603','2609','2615','2801','2880','2881','2882','2884',
    '2885','2886','2887','2890','2891','2892','3008','3045','3711','5871','5876','5880','6505',
]);

function generateInstSection(data, marketName) {
    let output = `### ${marketName}\n`;
    if (!data || (!data.data && !data.items)) {
        output += `(尚無資料或今日未開盤)\n\n`;
        return output;
    }

    const getDominantBuyer = (item) => {
        const foreignNet = parseNum(item['外陸資買賣超股數(不含外資自營商)']);
        const trustNet = parseNum(item['投信買賣超股數']);
        let dealerNet = parseNum(item['自營商買賣超股數']);
        if (!dealerNet) {
            dealerNet = parseNum(item['自營商買賣超股數(自行買賣)']) + parseNum(item['自營商買賣超股數(避險)']);
        }
        if (foreignNet || trustNet || dealerNet) {
            const maxNet = Math.max(foreignNet, trustNet, dealerNet);
            if (maxNet <= 0) return '-';
            if (maxNet === foreignNet) return '外資';
            if (maxNet === trustNet) return '投信';
            return '自營';
        }
        return '-';
    };

    const list = (data.data || [])
        .filter(item => isStockCode(getCode(item)))
        .sort((a, b) => parseNum(getInstNetStr(b)) - parseNum(getInstNetStr(a)))
        .slice(0, 10);

    if (list.length === 0) {
        output += `(無資料)\n\n`;
        return output;
    }

    const etfCount = list.filter(item => ETF_HEAVY_STOCKS.has(getCode(item))).length;
    const likelyEtfRebalance = etfCount >= 6;

    output += `| 代號 | 名稱 | 買賣超股數 | 主買方 |\n|---|---|---|---|\n`;
    list.forEach(item => {
        const code = getCode(item);
        let buyer = getDominantBuyer(item);
        if (likelyEtfRebalance && ETF_HEAVY_STOCKS.has(code)) buyer += '(被動)';
        output += `| ${code} | ${getName(item)} | ${getInstNetStr(item)} | ${buyer} |\n`;
    });
    output += `\n`;

    if (likelyEtfRebalance) {
        output += `> ℹ️ 法人買超前 10 名中 ${etfCount} 檔為 ETF 權值股，買盤可能以被動式基金申購為主\n\n`;
    }
    return output;
}

// --- MOPS 重大公告 ---
function generateMopsSection(mopsData) {
    let output = `## 📢 MOPS 重大公告精選\n\n`;
    if (!mopsData || !Array.isArray(mopsData)) {
        output += `(無 MOPS 資料)\n\n`;
        return output;
    }
    mopsData.forEach(market => {
        const result = market?.data?.result;
        if (!Array.isArray(result)) return;
        let marketHasData = false;
        let section = `### ${market.market}\n`;
        result.forEach(category => {
            const header = category.header || '';
            if (MOPS_SKIP_HEADERS.some(skip => header.includes(skip))) return;
            if (!category.data?.length) return;
            marketHasData = true;
            section += `#### ${header}\n`;
            const titleIdx = Array.isArray(category.titles)
                ? category.titles.findIndex(t => t.main === '主旨') : -1;
            category.data.forEach(row => {
                const title = (titleIdx >= 0 ? row[titleIdx] : null) || row[4] || row[3] || row[2] || '無標題';
                section += `- ${getMopsImpactLevel(header, title)} **${row[0]} ${row[1]}**: ${title}\n`;
            });
        });
        if (marketHasData) output += section + '\n';
    });
    return output;
}

// --- 今日交易摘要 ---
function generateExecutiveSummary({ directionLabel, dirSignals, bullA, impactAuditLog,
    impactShortCandidates, marginMap, allNews, nameCodeMap, themeGroups }) {
    let summary = `## ⚡ 今日交易摘要\n\n`;

    const dirStr = directionLabel || '➖ 中性';
    const sigStr = (dirSignals || []).join('、');
    summary += `- **大盤方向**：${dirStr}（${sigStr}）\n`;

    // Top long pick: prefer A-tier bullish, not limit-up, highest instNetNum
    let topLong = null;
    const bullACandidates = (bullA || []).filter(([code]) => {
        const audit = impactAuditLog.find(a => a.code === code && a.claim === '漲停' && a.result.includes('✅'));
        return !audit;
    });
    if (bullACandidates.length > 0) {
        bullACandidates.sort((a, b) => Math.abs(b[1].instNetNum || 0) - Math.abs(a[1].instNetNum || 0));
        topLong = bullACandidates[0];
    } else if (bullA && bullA.length > 0) {
        topLong = bullA[0];
    }

    if (topLong) {
        const [code, info] = topLong;
        const instStr = info.instNetNum ? (info.instNetNum > 0 ? `法人買超${Math.abs(info.instNetNum).toLocaleString()}股` : `法人賣超${Math.abs(info.instNetNum).toLocaleString()}股`) : '';
        const margin = marginMap ? marginMap.get(code) : null;
        const marginStr = margin ? (margin.marginChange < 0 ? `融資${margin.marginChange}張` : margin.marginChange > 0 ? `融資+${margin.marginChange}張` : '') : '';
        const details = [instStr, marginStr].filter(Boolean).join('+');
        summary += `- **做多首選**：${info.name}(${code}) — ${truncate(info.reason, 30)}${details ? `+${details}` : ''}\n`;
    } else {
        summary += `- **做多首選**：(今日無明確 A 級做多標的)\n`;
    }

    if (impactShortCandidates && impactShortCandidates.length > 0) {
        const sc = impactShortCandidates[0];
        summary += `- **做空首選**：${sc.name}(${sc.code}) — ${sc.risk}+${sc.instDir}\n`;
    } else {
        summary += `- **做空首選**：(今日無明確做空標的)\n`;
    }

    const riskTitles = allNews.filter(n => (n.title || '').includes('跌停')).slice(0, 3);
    if (riskTitles.length > 0) {
        const riskStocks = [];
        riskTitles.forEach(n => {
            extractAllStocks(n.title, nameCodeMap).forEach(s => {
                if (!riskStocks.find(r => r.code === s.code)) riskStocks.push(s);
            });
        });
        summary += `- **風險事件**：${truncate(riskTitles[0].title, 25)}（${riskStocks.slice(0, 5).map(s => s.name).join('/')}）\n`;
    } else {
        summary += `- **風險事件**：(無重大跌停風險)\n`;
    }

    if (themeGroups && themeGroups.size > 0) {
        summary += `- **主攻族群**：${[...themeGroups.keys()].slice(0, 3).join('、')}\n`;
    }

    summary += '\n';
    return summary;
}

// ============================================================
// 資料 Map 建構（模組執行區塊）
// ============================================================

const nameCodeMap = buildNameCodeMap(twseData, tpexData, mopsData);
const instMap     = buildInstMap(twseData, tpexData);
const priceMap    = buildPriceMap(twsePricesData, tpexPricesData);
const priceMapT2  = buildPriceMap(twsePricesDataT2, tpexPricesDataT2);
const marginMap   = buildMarginMap(marginTwseData, marginTpexData);
const volumeMap   = buildVolumeMap(twsePricesData, tpexPricesData);

// Collect all news for analysis
const tagNews = (items, source) => (Array.isArray(items) ? items : []).map(n => ({ ...n, _source: source }));
const moneydjItems = Array.isArray(moneydjData) ? moneydjData : (moneydjData?.data || []);
const allNews = [
    ...tagNews(cnyesData, 'cnyes'),
    ...tagNews(statementdogData, 'statementdog'),
    ...tagNews(moneydjItems, 'moneydj'),
];

// Compute impact map once (shared between table + decision section)
const impactMap = computeImpactMap(allNews, nameCodeMap, instMap);

let report = `# 台股盤前調研報告（${reportDate}）\n\n`;
report += `> 調研日期：${TODAY}\n`;
report += `> 執行時間：${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}\n`;
report += `> 來源：MOPS (公開資訊觀測站)、鉅亨網、財報狗、MoneyDJ、證交所/櫃買中心\n\n`;

// 0. 大盤概況（前一交易日）
const { output: marketSummary, marketChangePct, directionLabel, signals: dirSignals } = generateMarketSummary(twsePricesData, taifexData);
report += marketSummary;

// 1. 個股影響總表
const impactResult = generateImpactTable(impactMap, priceMap, priceMapT2, volumeMap, instMap, marginMap, marketChangePct, allNews);
const { auditLog: impactAuditLog, shortCandidates: impactShortCandidates, bullA, bearA } = impactResult;

// 1.5 主攻族群
const { output: themeOutput, themeGroups } = generateThemeSection(allNews, nameCodeMap, priceMap, impactAuditLog);

const executiveSummary = generateExecutiveSummary({
    directionLabel, dirSignals, bullA, impactAuditLog,
    impactShortCandidates, marginMap, allNews, nameCodeMap, themeGroups,
});

// Insert executive summary after market summary, before impact table
report += executiveSummary;

// 盤前焦點變化
report += generateDeltaSection(impactMap, priceMap, priceMapT2, impactAuditLog, instMap, marginMap, allNews, nameCodeMap, themeGroups);

report += impactResult.output;
report += themeOutput;

// 2. 三大法人買賣超
report += `## 💰 三大法人買賣超重點\n\n`;

report += generateInstSection(twseData, '上市 (TWSE)');
report += generateInstSection(tpexData, '上櫃 (TPEX)');


report += generateMopsSection(mopsData);

// 3. 新聞精選
report += `## 📰 新聞精選\n\n`;

const defaultNewsFilter = (news) => !NEWS_SKIP_PATTERNS.some(p => p.test(news.title || ''));
const moneydjNewsFilter = (news) =>
    !MONEYDJ_SKIP_PATTERNS.some(p => (news.title || '').includes(p)) && defaultNewsFilter(news);

report += renderNewsList(cnyesData, '鉅亨網 (Anue)', defaultNewsFilter);
report += renderNewsList(statementdogData, '財報狗 (StatementDog)', defaultNewsFilter);
report += renderNewsList(moneydjItems, 'MoneyDJ', moneydjNewsFilter);

// 風險提示
report += generateRiskAlerts(impactMap, priceMap, allNews, marketChangePct, taifexData, bullA, themeGroups);

// 投資決策重點
report += generateDecisionSection(impactMap, twseData, tpexData);

// 免責聲明
report += `---\n\n`;
report += `> ⚖️ **免責聲明**：本報告由自動化程式產出，僅供資訊參考，不構成任何買賣建議。投資人應自行評估風險並為投資決策負責。報告引用之資料來源包括公開資訊觀測站（MOPS）、鉅亨網、財報狗、MoneyDJ、證交所及櫃買中心，資料正確性以原始來源為準。報告產出後市場狀況可能已發生重大變化。\n`;

// Save Report
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

fs.writeFileSync(REPORT_FILE, report);
console.log(`Report generated: ${REPORT_FILE}`);
