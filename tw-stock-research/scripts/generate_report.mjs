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

// --- Fix 2: MOPS skip list (例行公告，不影響股價) ---
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

// --- Shared helpers ---
const parseNum = (s) => parseInt(String(s || '0').replace(/,/g, '')) || 0;
// Institutional stock code: 4-digit numeric only (excludes ETFs like 00940, 00953B)
const isStockCode = (code) => /^\d{4}$/.test(code) && parseInt(code) >= 1000;

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

// --- Fix 1: Build name→code lookup from institutional + MOPS data ---
function buildNameCodeMap(twseData, tpexData, mopsData) {
    const map = new Map(); // name → code

    // From institutional data (all listed stocks, ~14000 rows)
    const addFromInst = (data) => {
        const list = data?.data || [];
        list.forEach(item => {
            const code = String(item['證券代號'] || item['代號'] || '').trim();
            const name = String(item['證券名稱'] || item['名稱'] || '').trim();
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
        { k: '跌停', w: 1 }, { k: '重挫', w: 1 },
        { k: '大賣', w: 1 }, { k: '法人賣超', w: 1 }, { k: '賣超', w: 1 },
        { k: '罰鍰', w: 1 }, { k: '違約', w: 1 }, { k: '遭罰', w: 1 },
        { k: '利空', w: 1 }, { k: '下修', w: 1 }, { k: '不如預期', w: 2 },
        { k: '裁員', w: 1 }, { k: '衰退', w: 1 }, { k: '減產', w: 1 }, { k: '敗訴', w: 1 },
        { k: '不漲反跌', w: 2 }, { k: '反跌', w: 1 }, { k: '利多出盡', w: 2 }, { k: '股價不漲', w: 1 },
    ];

    // 檢查關鍵字是否被否定前綴修飾（出現在關鍵字前 4 字內）
    const isNegated = (keyword) => {
        const idx = text.indexOf(keyword);
        if (idx <= 0) return false;
        const prefix = text.substring(Math.max(0, idx - 4), idx);
        return NEGATION_PREFIXES.some(neg => prefix.includes(neg));
    };

    let score = 0;
    bullish.forEach(({ k, w }) => {
        if (text.includes(k)) score += isNegated(k) ? -w : w;
    });
    bearish.forEach(({ k, w }) => {
        if (text.includes(k)) score -= isNegated(k) ? -w : w;
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

function generateImpactTable(impactMap, priceMap, priceMapT2, volumeMap, instMap, marketChangePct, allNewsItems) {
    let output = `## 📊 個股影響總表\n\n`;

    if (impactMap.size === 0) {
        output += `(今日新聞未偵測到明顯個股利多/空關鍵字)\n\n`;
        return output;
    }

    // 信心等級：3=法人方向一致, 2=無法人資料, 1=法人方向相反
    const getConfidence = (impact, instNetNum) => {
        const isBullish = impact.includes('利多');
        if (instNetNum === null) return 2;
        return ((isBullish && instNetNum > 0) || (!isBullish && instNetNum < 0)) ? 3 : 1;
    };
    const confLabel = (c) => c === 3 ? '★★★' : c === 2 ? '★★☆' : '★☆☆';

    // 法人動向欄：顯示 ✅買超/⚠️賣超 + 股數，方向與研判一致為 ✅，相反為 ⚠️
    const fmtInst = (impact, instNetNum) => {
        if (instNetNum === null) return '-';
        const isBullish = impact.includes('利多');
        const aligned = (isBullish && instNetNum > 0) || (!isBullish && instNetNum < 0);
        const prefix = aligned ? '✅' : '⚠️';
        const dir = instNetNum > 0 ? '買超' : '賣超';
        return `${prefix}${dir} ${Math.abs(instNetNum).toLocaleString()}`;
    };

    // 子句級漲停/跌停判斷：以標點切分子句，只有個股名稱與關鍵字出現在同一子句才算
    const stockInClauseWith = (stockName, stockCode, reasonText, keyword) => {
        if (!reasonText.includes(keyword)) return false;
        const clauses = reasonText.split(/[，；。！？]/);
        return clauses.some(clause =>
            clause.includes(keyword) &&
            (clause.includes(stockName) || clause.includes(stockCode))
        );
    };

    // --- 新聞日期解析：將各種時間格式轉為 YYYYMMDD ---
    const parseNewsDate = (timeStr) => {
        if (!timeStr) return null;
        // Format: "2026-03-26 11:59:01" or "2026-03-26"
        let m = String(timeStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return `${m[1]}${m[2]}${m[3]}`;
        // Format: "2026/03/26"
        m = String(timeStr).match(/^(\d{4})\/(\d{2})\/(\d{2})/);
        if (m) return `${m[1]}${m[2]}${m[3]}`;
        // Format: "03/27 10:24" (no year — assume current year from TODAY)
        m = String(timeStr).match(/^(\d{2})\/(\d{2})/);
        if (m) return `${TODAY.substring(0, 4)}${m[1]}${m[2]}`;
        return null;
    };

    // Determine T-1 and T-2 dates for audit date matching
    const instDateT1 = prevWeekday(TODAY);
    const instDateT2 = prevWeekday(instDateT1);
    const t1DateShort = `${instDateT1.substring(4, 6)}/${instDateT1.substring(6, 8)}`;
    const t2DateShort = `${instDateT2.substring(4, 6)}/${instDateT2.substring(6, 8)}`;

    // 找出新聞中提及特定股票+關鍵字的新聞日期
    const findNewsDateForStock = (stockName, stockCode, keyword) => {
        if (!allNewsItems || !Array.isArray(allNewsItems)) return null;
        for (const item of allNewsItems) {
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
    };

    // 二次審計：以實際 OHLC 驗證漲停/跌停
    // 支持 T-1 和 T-2 日期交叉審計
    // 漲停條件：收盤≈最高 且 漲幅 ≥ 9.5%
    // 跌停條件：收盤≈最低 且 跌幅 ≤ -9.5%
    const verifyPriceAction = (code, keyword, useMap) => {
        const pm = useMap || priceMap;
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
    };

    // 審計紀錄收集器
    const auditLog = [];

    // Helper: perform audit with date-aware T-1/T-2 matching
    const performAudit = (code, stockName, keyword, reason) => {
        let priceTag = '';
        const newsDate = findNewsDateForStock(stockName, code, keyword);
        const matchedT2 = newsDate && newsDate === instDateT2;

        // Try T-2 first if news date matches T-2
        if (matchedT2 && priceMapT2) {
            const vT2 = verifyPriceAction(code, keyword, priceMapT2);
            if (vT2.hasData && vT2.confirmed) {
                // Confirmed on T-2; also show T-1 follow-through
                const vT1 = verifyPriceAction(code, keyword, priceMap);
                const t1Info = vT1.hasData
                    ? ` → ${t1DateShort} ${vT1.price.changePercent >= 0 ? '+' : ''}${vT1.price.changePercent.toFixed(1)}%`
                    : '';
                const limitLabel = keyword === '漲停' ? '漲停' : '跌停';
                const sign = vT2.price.changePercent >= 0 ? '+' : '';
                priceTag = `⚠️${t2DateShort} ${limitLabel}(${sign}${vT2.price.changePercent.toFixed(1)}%)${t1Info}｜`;
                const resultLabel = vT1.hasData
                    ? `✅ 確認(T-2${t1Info.includes('-') ? ', 回落' : ''})`
                    : '✅ 確認(T-2)';
                auditLog.push({ code, name: stockName, claim: keyword, result: resultLabel,
                    close: vT2.price.close, high: keyword === '漲停' ? vT2.price.high : vT2.price.low,
                    pct: vT2.price.changePercent,
                    t1pct: vT1.hasData ? vT1.price.changePercent : null,
                    newsDate: t2DateShort });
                return priceTag;
            }
        }

        // Default: verify against T-1
        const v = verifyPriceAction(code, keyword, priceMap);
        if (keyword === '漲停') {
            if (v.hasData && v.confirmed) {
                priceTag = `⚠️昨日漲停(+${v.price.changePercent.toFixed(1)}%)｜`;
                auditLog.push({ code, name: stockName, claim: '漲停', result: '✅ 確認',
                    close: v.price.close, high: v.price.high, pct: v.price.changePercent });
            } else if (v.hasData) {
                // If T-1 didn't confirm but T-2 has data, try T-2 as fallback
                if (priceMapT2) {
                    const vT2 = verifyPriceAction(code, keyword, priceMapT2);
                    if (vT2.hasData && vT2.confirmed) {
                        const t1Sign = v.price.changePercent >= 0 ? '+' : '';
                        priceTag = `⚠️${t2DateShort} 漲停(+${vT2.price.changePercent.toFixed(1)}%) → ${t1DateShort} 回落(${t1Sign}${v.price.changePercent.toFixed(1)}%)｜`;
                        auditLog.push({ code, name: stockName, claim: '漲停', result: '✅ 確認(T-2, 回落)',
                            close: vT2.price.close, high: vT2.price.high, pct: vT2.price.changePercent,
                            t1pct: v.price.changePercent, newsDate: t2DateShort });
                        return priceTag;
                    }
                }
                const sign = v.price.changePercent >= 0 ? '+' : '';
                priceTag = `📊昨收${v.price.close}(${sign}${v.price.changePercent.toFixed(1)}%)｜`;
                auditLog.push({ code, name: stockName, claim: '漲停', result: '❌ 非漲停',
                    close: v.price.close, high: v.price.high, pct: v.price.changePercent });
            } else {
                priceTag = '⚠️昨日疑似漲停(未驗證)｜';
                auditLog.push({ code, name: stockName, claim: '漲停', result: '⚠️ 無資料',
                    close: '-', high: '-', pct: '-' });
            }
        } else if (keyword === '跌停') {
            if (v.hasData && v.confirmed) {
                priceTag = `⚠️昨日跌停(${v.price.changePercent.toFixed(1)}%)｜`;
                auditLog.push({ code, name: stockName, claim: '跌停', result: '✅ 確認',
                    close: v.price.close, high: v.price.low, pct: v.price.changePercent });
            } else if (v.hasData) {
                // If T-1 didn't confirm but T-2 has data, try T-2 as fallback
                if (priceMapT2) {
                    const vT2 = verifyPriceAction(code, keyword, priceMapT2);
                    if (vT2.hasData && vT2.confirmed) {
                        const t1Sign = v.price.changePercent >= 0 ? '+' : '';
                        priceTag = `⚠️${t2DateShort} 跌停(${vT2.price.changePercent.toFixed(1)}%) → ${t1DateShort} 反彈(${t1Sign}${v.price.changePercent.toFixed(1)}%)｜`;
                        auditLog.push({ code, name: stockName, claim: '跌停', result: '✅ 確認(T-2, 反彈)',
                            close: vT2.price.close, high: vT2.price.low, pct: vT2.price.changePercent,
                            t1pct: v.price.changePercent, newsDate: t2DateShort });
                        return priceTag;
                    }
                }
                const sign = v.price.changePercent >= 0 ? '+' : '';
                priceTag = `📊昨收${v.price.close}(${sign}${v.price.changePercent.toFixed(1)}%)｜`;
                auditLog.push({ code, name: stockName, claim: '跌停', result: '❌ 非跌停',
                    close: v.price.close, high: v.price.low, pct: v.price.changePercent });
            } else {
                priceTag = '⚠️昨日疑似跌停(未驗證)｜';
                auditLog.push({ code, name: stockName, claim: '跌停', result: '⚠️ 無資料',
                    close: '-', high: '-', pct: '-' });
            }
        }
        return priceTag;
    };

    const renderTable = (entries) => {
        let t = `| 代碼 | 名稱 | 信心 | 法人動向 | 簡要理由 |\n`;
        t += `|------|------|------|----------|----------|\n`;
        const sorted = [...entries].sort((a, b) =>
            getConfidence(b[1].impact, b[1].instNetNum) - getConfidence(a[1].impact, a[1].instNetNum)
        );
        sorted.forEach(([code, info]) => {
            const conf = getConfidence(info.impact, info.instNetNum);
            let priceTag = '';

            // 漲停驗證（利多個股）— 使用日期交叉審計
            if (info.impact.includes('利多') && stockInClauseWith(info.name, code, info.reason, '漲停')) {
                priceTag = performAudit(code, info.name, '漲停', info.reason);
            }

            // 跌停驗證（利空個股）— 使用日期交叉審計
            if (info.impact.includes('利空') && stockInClauseWith(info.name, code, info.reason, '跌停')) {
                priceTag = performAudit(code, info.name, '跌停', info.reason);
            }

            const reason = info.reason.length > 40 ? info.reason.substring(0, 40) + '...' : info.reason;
            t += `| ${code} | ${info.name} | ${confLabel(conf)} | ${fmtInst(info.impact, info.instNetNum)} | ${priceTag}${reason} |\n`;
        });
        return t + '\n';
    };

    const bullish = [...impactMap.entries()].filter(([, v]) => v.impact === '⬆️ 利多');
    const bearish = [...impactMap.entries()].filter(([, v]) => v.impact === '⬇️ 利空');

    // Change 5: Market direction confidence adjustment
    output += `### ⬆️ 利多（${bullish.length} 檔）\n\n`;
    if (marketChangePct <= -1) {
        output += `> ⚠️ 大盤重挫逾 1%，利多個股開盤恐受壓，追高風險升高\n\n`;
    }
    output += bullish.length > 0 ? renderTable(bullish) : `(無)\n\n`;

    output += `### ⬇️ 利空（${bearish.length} 檔）\n\n`;
    if (marketChangePct >= 1) {
        output += `> 📈 大盤強漲，利空個股跌幅可能受限\n\n`;
    }
    output += bearish.length > 0 ? renderTable(bearish) : `(無)\n\n`;

    output += `> 信心說明：★★★ 法人方向一致｜★★☆ 無法人資料｜★☆☆ 法人方向相反（高風險）\n\n`;

    // 二次審計紀錄
    if (auditLog.length > 0) {
        output += `### 🔍 二次審計（昨日股價驗證）\n\n`;
        output += `> 針對報告中提及「漲停」「跌停」之個股，以昨日實際 OHLC 交叉驗證。\n`;
        output += `> 支援 T-2 日期交叉比對：若新聞來自前天，以前天股價驗證，並顯示昨日後續走勢。\n\n`;
        output += `| 代碼 | 名稱 | 新聞提及 | 昨收 | 最高 | 昨漲跌% | 結果 |\n`;
        output += `|------|------|----------|------|------|---------|------|\n`;
        auditLog.forEach(a => {
            const pctStr = typeof a.pct === 'number' ? `${a.pct >= 0 ? '+' : ''}${a.pct.toFixed(1)}%` : a.pct;
            const t1Str = a.t1pct != null ? ` (T-1: ${a.t1pct >= 0 ? '+' : ''}${a.t1pct.toFixed(1)}%)` : '';
            const dateStr = a.newsDate ? ` [${a.newsDate}]` : '';
            output += `| ${a.code} | ${a.name} | ${a.claim}${dateStr} | ${a.close} | ${a.high} | ${pctStr}${t1Str} | ${a.result} |\n`;
        });
        output += `\n`;
    }

    // --- Change 4: 做空候選清單 ---
    const shortCandidates = [];
    // From audit log: confirmed limit-up + institutional selling
    auditLog.forEach(a => {
        if (a.result.includes('✅') && a.claim === '漲停') {
            const instNet = instMap ? instMap.get(a.code) : null;
            if (instNet !== null && instNet < 0) {
                shortCandidates.push({
                    code: a.code, name: a.name,
                    changePct: a.pct,
                    instDir: `賣超 ${Math.abs(instNet).toLocaleString()}`,
                    risk: '漲停+法人賣超',
                });
            }
        }
    });
    // Large gain + institutional selling (changePercent > 7% AND instNetNum < 0)
    for (const [code, info] of impactMap) {
        if (shortCandidates.some(c => c.code === code)) continue; // avoid duplicates
        const price = priceMap ? priceMap.get(code) : null;
        const instNet = info.instNetNum;
        if (price && price.changePercent > 7 && instNet !== null && instNet < 0) {
            shortCandidates.push({
                code, name: info.name,
                changePct: price.changePercent,
                instDir: `賣超 ${Math.abs(instNet).toLocaleString()}`,
                risk: '大漲+法人賣超',
            });
        }
    }

    if (shortCandidates.length > 0) {
        output += `### ⚠️ 利多出盡 / 做空候選\n\n`;
        output += `> 昨日漲停 + 法人反向賣超 = 高機率回落標的\n\n`;
        output += `| 代碼 | 名稱 | 昨漲跌% | 法人動向 | 風險因子 |\n`;
        output += `|------|------|---------|----------|----------|\n`;
        shortCandidates.forEach(c => {
            const sign = c.changePct >= 0 ? '+' : '';
            output += `| ${c.code} | ${c.name} | ${sign}${c.changePct.toFixed(1)}% | ${c.instDir} | ${c.risk} |\n`;
        });
        output += `\n`;
    }

    // --- Change 2: 上榜個股昨日價量明細 ---
    const priceDetailRows = [];
    for (const [code, info] of impactMap) {
        const price = priceMap ? priceMap.get(code) : null;
        if (!price) continue;
        const vol = volumeMap ? (volumeMap.get(code) || 0) : 0;
        const volLots = Math.round(vol / 1000); // 股 → 張
        const instNet = info.instNetNum;
        let instRatio = '-';
        if (instNet !== null && vol > 0) {
            // Both instNetNum and vol are in shares (股)
            instRatio = `${(Math.abs(instNet) / vol * 100).toFixed(1)}%`;
        }
        const sign = price.changePercent >= 0 ? '+' : '';
        priceDetailRows.push({
            code, name: info.name,
            open: price.open, high: price.high, low: price.low, close: price.close,
            changePct: `${sign}${price.changePercent.toFixed(1)}%`,
            volLots: volLots.toLocaleString(),
            instRatio,
        });
    }

    if (priceDetailRows.length > 0) {
        output += `### 📊 上榜個股昨日價量明細\n\n`;
        output += `| 代碼 | 名稱 | 昨開 | 昨高 | 昨低 | 昨收 | 漲跌% | 成交量(張) | 法人佔比 |\n`;
        output += `|------|------|------|------|------|------|-------|-----------|----------|\n`;
        priceDetailRows.forEach(r => {
            output += `| ${r.code} | ${r.name} | ${r.open} | ${r.high} | ${r.low} | ${r.close} | ${r.changePct} | ${r.volLots} | ${r.instRatio} |\n`;
        });
        output += `\n`;
    }

    return output;
}

// --- Fix 3: 投資決策重點 ---
function generateDecisionSection(impactMap, twseData, tpexData) {
    let section = `## 💡 投資決策重點\n\n`;

    // Top institutional buys (positive net buy/sell)
    // 統一取得買超股數，合併 TWSE + TPEX 後按金額排序再取 Top 5
    const getNetBuy = (item) => parseNum(item['三大法人買賣超股數'] || item['三大法人買賣超股數合計'] || '0');
    const twseBuys = (twseData?.data || [])
        .filter(i => isStockCode(i['證券代號'] || '') && parseNum(i['三大法人買賣超股數']) > 0);
    const tpexBuys = (tpexData?.data || [])
        .filter(i => isStockCode(i['代號'] || '') && parseNum(i['三大法人買賣超股數合計']) > 0);
    const topBuys = [...twseBuys, ...tpexBuys]
        .sort((a, b) => getNetBuy(b) - getNetBuy(a))
        .slice(0, 5);

    if (topBuys.length > 0) {
        section += `### 🏦 法人重點買超（前一交易日前5名）\n`;
        topBuys.forEach(item => {
            const code = item['證券代號'] || item['代號'] || '';
            const name = item['證券名稱'] || item['名稱'] || '';
            const val = item['三大法人買賣超股數'] || item['三大法人買賣超股數合計'] || '';
            section += `- **${code} ${name}**：法人買超 ${val} 股\n`;
        });
        section += '\n';
    }

    // Bullish stocks from impact map
    const bullishStocks = [...impactMap.entries()].filter(([, v]) => v.impact === '⬆️ 利多');
    if (bullishStocks.length > 0) {
        section += `### ⬆️ 利多關注\n`;
        bullishStocks.forEach(([code, info]) => {
            const reason = info.reason.length > 50 ? info.reason.substring(0, 50) + '...' : info.reason;
            section += `- **${code} ${info.name}**：${reason}\n`;
        });
        section += '\n';
    }

    // Bearish stocks from impact map
    const bearishStocks = [...impactMap.entries()].filter(([, v]) => v.impact === '⬇️ 利空');
    if (bearishStocks.length > 0) {
        section += `### ⬇️ 利空注意\n`;
        bearishStocks.forEach(([code, info]) => {
            const reason = info.reason.length > 50 ? info.reason.substring(0, 50) + '...' : info.reason;
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
    const map = new Map(); // code → instNetNum
    const parseInstNum = (s) => {
        const n = parseInt(String(s || '0').replace(/,/g, ''), 10);
        return isNaN(n) ? null : n;
    };
    (twseData?.data || []).forEach(item => {
        const code = String(item['證券代號'] || '').trim();
        const val  = parseInstNum(item['三大法人買賣超股數']);
        if (code && val !== null) map.set(code, val);
    });
    (tpexData?.data || []).forEach(item => {
        const code = String(item['代號'] || '').trim();
        const val  = parseInstNum(item['三大法人買賣超股數合計']);
        if (code && val !== null) map.set(code, val);
    });
    return map;
}

// --- Build price map from OHLC data (for 二次審計) ---
function buildPriceMap(twsePrices, tpexPrices) {
    const map = new Map(); // code → { open, high, low, close, change, prevClose, changePercent }
    const pf = (s) => { const v = parseFloat(String(s || '0').replace(/,/g, '')); return isNaN(v) ? 0 : v; };

    // TWSE MI_INDEX: tables 格式（2026 年後新版），個股資料在 title 含「每日收盤行情」的 table
    // fields 動態查找以適應欄位順序變動；方向欄位可能含 HTML（如 <p style= color:red>+</p>）
    if (twsePrices && twsePrices.tables) {
        const stockTable = twsePrices.tables.find(t => t.title && t.title.includes('每日收盤行情'));
        if (stockTable && stockTable.data) {
            const fields = stockTable.fields || [];
            const fi = (name) => fields.indexOf(name);
            const iCode = fi('證券代號'), iOpen = fi('開盤價'), iHigh = fi('最高價');
            const iLow = fi('最低價'), iClose = fi('收盤價'), iDir = fi('漲跌(+/-)'), iChange = fi('漲跌價差');
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
                    map.set(code, { open, high, low, close, change, prevClose, changePercent });
                });
            }
        }
    }

    // TPEX: data[i] = [代號, 名稱, 收盤, 漲跌, 開盤, 最高, 最低, 成交股數, ...]
    if (tpexPrices && tpexPrices.data) {
        tpexPrices.data.forEach(row => {
            const code = String(row[0] || '').trim();
            if (!isStockCode(code)) return;
            const close = pf(row[2]), change = pf(row[3]);
            const open = pf(row[4]), high = pf(row[5]), low = pf(row[6]);
            const prevClose = close - change;
            const changePercent = prevClose > 0 ? +(change / prevClose * 100).toFixed(2) : 0;
            map.set(code, { open, high, low, close, change, prevClose, changePercent });
        });
    }

    return map;
}

// --- Build volume map from OHLC data (for 個股價量明細) ---
function buildVolumeMap(twsePrices, tpexPrices) {
    const map = new Map(); // code → volumeShares (in 股)
    const pn = (s) => parseInt(String(s || '0').replace(/,/g, '')) || 0;

    // TWSE Table 8: 成交股數
    if (twsePrices && twsePrices.tables) {
        const stockTable = twsePrices.tables.find(t => t.title && t.title.includes('每日收盤行情'));
        if (stockTable && stockTable.data) {
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

// --- 大盤概況 ---
function generateMarketSummary(twsePrices) {
    let output = `## 📈 大盤概況（前一交易日）\n\n`;

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
    output += `\n`;

    // Market direction assessment
    let directionNote = '';
    if (indexChangePct <= -1) {
        directionNote = '> ⚠️ 大盤重挫';
    } else if (indexChangePct <= -0.3) {
        directionNote = '> 📉 大盤下跌';
    } else if (indexChangePct >= 0.3) {
        directionNote = '> 📈 大盤上漲';
    } else {
        directionNote = '> ➖ 大盤持平';
    }
    output += directionNote + `\n\n`;

    return { output, marketChangePct: indexChangePct };
}

// --- Build name→code map ---
const nameCodeMap = buildNameCodeMap(twseData, tpexData, mopsData);
const instMap     = buildInstMap(twseData, tpexData);
const priceMap    = buildPriceMap(twsePricesData, tpexPricesData);
const priceMapT2  = buildPriceMap(twsePricesDataT2, tpexPricesDataT2);
const volumeMap   = buildVolumeMap(twsePricesData, tpexPricesData);

// Collect all news for analysis (tag each item with its source)
let allNews = [];
if (cnyesData && Array.isArray(cnyesData)) allNews = allNews.concat(cnyesData.map(n => ({...n, _source: 'cnyes'})));
if (statementdogData && Array.isArray(statementdogData)) allNews = allNews.concat(statementdogData.map(n => ({...n, _source: 'statementdog'})));
if (moneydjData) {
    if (Array.isArray(moneydjData)) allNews = allNews.concat(moneydjData.map(n => ({...n, _source: 'moneydj'})));
    else if (moneydjData.data) allNews = allNews.concat(moneydjData.data.map(n => ({...n, _source: 'moneydj'})));
}

// Compute impact map once (shared between table + decision section)
const impactMap = computeImpactMap(allNews, nameCodeMap, instMap);

let report = `# 台股盤前調研報告（${reportDate}）\n\n`;
report += `> 調研日期：${TODAY}\n`;
report += `> 執行時間：${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}\n`;
report += `> 來源：MOPS (公開資訊觀測站)、鉅亨網、財報狗、MoneyDJ、證交所/櫃買中心\n\n`;

// 0. 大盤概況（前一交易日）
const { output: marketSummary, marketChangePct } = generateMarketSummary(twsePricesData);
report += marketSummary;

// 1. 個股影響總表
report += generateImpactTable(impactMap, priceMap, priceMapT2, volumeMap, instMap, marketChangePct, allNews);

// 2. 三大法人買賣超
report += `## 💰 三大法人買賣超重點\n\n`;

const processInst = (data, marketName) => {
    let output = `### ${marketName}\n`;
    if (!data || (!data.data && !data.items)) {
        output += `(尚無資料或今日未開盤)\n\n`;
        return output;
    }

    // Filter ETFs (keep 4-digit stock codes only), sort by net buy/sell descending
    const list = (data.data || [])
        .filter(item => isStockCode(item['證券代號'] || item['代號'] || ''))
        .sort((a, b) =>
            parseNum(b['三大法人買賣超股數'] || b['三大法人買賣超股數合計']) -
            parseNum(a['三大法人買賣超股數'] || a['三大法人買賣超股數合計'])
        )
        .slice(0, 10);
    if (list.length === 0) {
        output += `(無資料)\n\n`;
    } else {
        output += `| 代號 | 名稱 | 買賣超股數 |\n|---|---|---|\n`;
        list.forEach(item => {
            const code = item['證券代號'] || item['代號'] || '';
            const name = item['證券名稱'] || item['名稱'] || '';
            const val  = item['三大法人買賣超股數'] || item['三大法人買賣超股數合計'] || '';
            output += `| ${code} | ${name} | ${val} |\n`;
        });
        output += `\n`;
    }
    return output;
};

report += processInst(twseData, '上市 (TWSE)');
report += processInst(tpexData, '上櫃 (TPEX)');


// 2. MOPS 重大公告（過濾例行公告）
report += `## 📢 MOPS 重大公告精選\n\n`;
if (mopsData && Array.isArray(mopsData)) {
    mopsData.forEach(market => {
        const marketName = market.market;
        const result = market.data && market.data.result;
        if (result && Array.isArray(result)) {
            let marketHasData = false;
            let marketSection = `### ${marketName}\n`;

            result.forEach(category => {
                // Fix 2: Skip routine/low-impact categories
                const header = category.header || '';
                if (MOPS_SKIP_HEADERS.some(skip => header.includes(skip))) return;

                if (category.data && category.data.length > 0) {
                    marketHasData = true;
                    marketSection += `#### ${header}\n`;
                    const titleIdx = Array.isArray(category.titles)
                        ? category.titles.findIndex(t => t.main === '主旨')
                        : -1;
                    category.data.forEach(row => {
                        const code = row[0];
                        const name = row[1];
                        const title = (titleIdx >= 0 ? row[titleIdx] : null) || row[4] || row[3] || row[2] || '無標題';
                        marketSection += `- **${code} ${name}**: ${title}\n`;
                    });
                }
            });

            if (marketHasData) {
                report += marketSection + '\n';
            }
        }
    });
} else {
    report += `(無 MOPS 資料)\n\n`;
}

// 3. 新聞精選
report += `## 📰 新聞精選\n\n`;

if (cnyesData && Array.isArray(cnyesData)) {
    report += `### 鉅亨網 (Anue)\n`;
    cnyesData.slice(0, 15).forEach(news => {
        report += `- [${news.title}](${news.link || '#'}) (${news.time})\n`;
    });
    report += `\n`;
} else {
    report += `### 鉅亨網 (Anue)\n(無鉅亨網資料)\n\n`;
}

if (statementdogData && Array.isArray(statementdogData)) {
    report += `### 財報狗 (StatementDog)\n`;
    statementdogData.slice(0, 15).forEach(news => {
        report += `- [${news.title}](${news.link || '#'}) (${news.time})\n`;
    });
    report += `\n`;
} else {
    report += `### 財報狗 (StatementDog)\n(無財報狗資料)\n\n`;
}

const moneydjList = Array.isArray(moneydjData) ? moneydjData
    : (moneydjData?.data ? moneydjData.data : null);
if (moneydjList) {
    const filtered = moneydjList.filter(news =>
        !MONEYDJ_SKIP_PATTERNS.some(p => (news.title || '').includes(p))
    );
    if (filtered.length > 0) {
        report += `### MoneyDJ\n`;
        filtered.slice(0, 15).forEach(news => {
            report += `- [${news.title}](${news.link || '#'}) (${news.time})\n`;
        });
        report += `\n`;
    } else {
        report += `### MoneyDJ\n(過濾後無有效新聞)\n\n`;
    }
} else {
    report += `### MoneyDJ\n(無 MoneyDJ 資料)\n\n`;
}

// 4. 投資決策重點 (Fix 3)
report += generateDecisionSection(impactMap, twseData, tpexData);

// Save Report
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

fs.writeFileSync(REPORT_FILE, report);
console.log(`Report generated: ${REPORT_FILE}`);
