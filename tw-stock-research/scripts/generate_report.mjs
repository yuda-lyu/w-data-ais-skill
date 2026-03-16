import fs from 'fs';
import path from 'path';

/**
 * 台股盤前調研報告生成器
 *
 * 用法：node generate_report.mjs [YYYYMMDD]
 * 參數：
 * 1. YYYYMMDD (選填)：指定日期，預設為今日。
 */

const TODAY = process.argv[2] || new Date().toISOString().slice(0, 10).replace(/-/g, '');
const BASE_DIR = process.cwd();
const RAW_DIR = path.join(BASE_DIR, 'w-data-news', 'tw-stock-research', TODAY, 'raw');
const REPORT_FILE = path.join(BASE_DIR, 'w-data-news', 'tw-stock-research', TODAY, `report_${TODAY}.md`);

const readJson = (filename) => {
    const filePath = path.join(RAW_DIR, filename);
    try {
        if (fs.existsSync(filePath)) {
            const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            // Unwrap unified output format: { status: 'success', message: <data> }
            if (raw && raw.status === 'success') return raw.message;
            if (raw && raw.type === 'error') {
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

const reportDate = `${TODAY.substring(0, 4)}/${TODAY.substring(4, 6)}/${TODAY.substring(6, 8)}`;

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
function analyzeImpact(text) {
    const bullish = [
        '營收創新高', '獲利大增', '獲利暴增', '獲利創新高', '業績創新高',
        '漲停', '攻漲停', '拉漲停', '連拉',
        '大買', '買超', '法人買超',
        '配息創高', '股利創高', '高配息',
        '強漲', '利多', '優於預期', '上修', '擴產',
        '創新高', '創高', '完工', '入帳', '法說報喜',
        '啟動', '啟用', '外資調升', '調升目標價', '衝新高',
        '大幅成長', '超越預期', '勝訴',
    ];
    const bearish = [
        '營收衰退', '虧損', '淨損', '虧損擴大',
        '跌停', '重挫',
        '大賣', '賣超', '法人賣超',
        '罰鍰', '違約', '遭罰',
        '利空', '下修', '不如預期',
        '裁員', '衰退', '減產', '敗訴',
    ];

    let score = 0;
    bullish.forEach(k => { if (text.includes(k)) score++; });
    bearish.forEach(k => { if (text.includes(k)) score--; });

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

// Compute impact map from all news
function computeImpactMap(newsItems, nameCodeMap) {
    const map = new Map(); // code → { name, impact, reason }
    if (Array.isArray(newsItems)) {
        newsItems.forEach(item => {
            const title = item.title || '';
            if (isRoutineDisclosure(title)) return; // skip routine annual disclosures
            const impact = analyzeImpact(title);
            if (impact === '➖ 中性') return;
            extractAllStocks(title, nameCodeMap).forEach(stock => {
                if (!map.has(stock.code)) {
                    map.set(stock.code, { name: stock.name, impact, reason: title });
                }
            });
        });
    }
    return map;
}

function generateImpactTable(impactMap) {
    let table = `## 📊 個股影響總表\n\n`;
    table += `| 代碼 | 名稱 | 影響 | 簡要理由 |\n`;
    table += `|------|------|------|----------|\n`;

    if (impactMap.size === 0) {
        table += `| - | - | ➖ 中性 | (今日新聞未偵測到明顯個股利多/空關鍵字) |\n`;
    } else {
        for (const [code, info] of impactMap) {
            const reason = info.reason.length > 40 ? info.reason.substring(0, 40) + '...' : info.reason;
            table += `| ${code} | ${info.name} | ${info.impact} | ${reason} |\n`;
        }
    }

    return table + '\n';
}

// --- Fix 3: 投資決策重點 ---
function generateDecisionSection(impactMap, twseData, tpexData) {
    let section = `## 💡 投資決策重點\n\n`;

    // Top institutional buys (positive net buy/sell)
    const twseTop = (twseData?.data || [])
        .filter(i => isStockCode(i['證券代號'] || '') && parseNum(i['三大法人買賣超股數']) > 0)
        .sort((a, b) => parseNum(b['三大法人買賣超股數']) - parseNum(a['三大法人買賣超股數']))
        .slice(0, 5);
    const tpexTop = (tpexData?.data || [])
        .filter(i => isStockCode(i['代號'] || '') && parseNum(i['三大法人買賣超股數合計']) > 0)
        .sort((a, b) => parseNum(b['三大法人買賣超股數合計']) - parseNum(a['三大法人買賣超股數合計']))
        .slice(0, 5);

    if (twseTop.length > 0 || tpexTop.length > 0) {
        section += `### 🏦 法人重點買超（今日前5名）\n`;
        [...twseTop, ...tpexTop].slice(0, 5).forEach(item => {
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

    if (twseTop.length === 0 && tpexTop.length === 0 && impactMap.size === 0) {
        section += `(今日無明顯投資訊號)\n\n`;
    }

    return section;
}

// --- Build name→code map ---
const nameCodeMap = buildNameCodeMap(twseData, tpexData, mopsData);

// Collect all news for analysis
let allNews = [];
if (cnyesData && Array.isArray(cnyesData)) allNews = allNews.concat(cnyesData);
if (statementdogData && Array.isArray(statementdogData)) allNews = allNews.concat(statementdogData);
if (moneydjData) {
    if (Array.isArray(moneydjData)) allNews = allNews.concat(moneydjData);
    else if (moneydjData.data) allNews = allNews.concat(moneydjData.data);
}

// Compute impact map once (shared between table + decision section)
const impactMap = computeImpactMap(allNews, nameCodeMap);

let report = `# 台股盤前調研報告（${reportDate}）\n\n`;
report += `> 調研日期：${TODAY}\n`;
report += `> 執行時間：${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}\n`;
report += `> 來源：MOPS (公開資訊觀測站)、鉅亨網、財報狗、MoneyDJ、證交所/櫃買中心\n\n`;

// 0. 個股影響總表
report += generateImpactTable(impactMap);

// 1. 三大法人買賣超
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
        report += `- [${news.title}](${news.href || news.link || '#'}) (${news.time})\n`;
    });
    report += `\n`;
}

if (statementdogData && Array.isArray(statementdogData)) {
    report += `### 財報狗 (StatementDog)\n`;
    statementdogData.slice(0, 15).forEach(news => {
        report += `- [${news.title}](${news.link || '#'}) (${news.time})\n`;
    });
    report += `\n`;
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
    }
}

// 4. 投資決策重點 (Fix 3)
report += generateDecisionSection(impactMap, twseData, tpexData);

// Save Report
const outputDir = path.dirname(REPORT_FILE);
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(REPORT_FILE, report);
console.log(`Report generated: ${REPORT_FILE}`);
