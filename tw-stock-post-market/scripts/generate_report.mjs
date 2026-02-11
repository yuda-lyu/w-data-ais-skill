import fs from 'fs';
import path from 'path';

/**
 * 台股盤後總結報告生成器
 * 目的：彙整今日盤後數據，比對盤前研判準確度
 */

// --- Configuration ---
// 預設抓取當日，可透過 argv[2] 指定日期 YYYYMMDD
const TODAY = process.argv[2] || new Date().toISOString().slice(0, 10).replace(/-/g, '');

// 資料路徑 (對應 w-data-news 結構)
const BASE_DIR = process.cwd();
const POST_MARKET_DIR = path.join(BASE_DIR, 'w-data-news', 'tw-stock-post-market', TODAY);
const PRE_MARKET_DIR = path.join(BASE_DIR, 'w-data-news', 'tw-stock-research', TODAY);
const RAW_DIR = path.join(POST_MARKET_DIR, 'raw');
const REPORT_FILE = path.join(POST_MARKET_DIR, `report_${TODAY}.md`);

// --- Helper Functions ---

const readJson = (filePath) => {
    try {
        if (fs.existsSync(filePath)) {
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        }
    } catch (e) {
        console.error(`Warning: Could not read ${filePath}: ${e.message}`);
    }
    return null;
};

// 提取盤前研判表 (從 pre-market report markdown 解析)
// 這種方式比較脆弱，理想上盤前應該存一份 structured json (e.g., impact_table.json)
// 這裡假設我們嘗試從 report.md 的表格中解析，或者如果有的話從 raw/input.json 讀取
const getPreMarketPredictions = () => {
    // 優先讀取 input.json (如果有的話)
    const inputJsonPath = path.join(RAW_DIR, 'input.json');
    let predictions = readJson(inputJsonPath);
    
    if (predictions) return predictions;

    // Fallback: 嘗試解析盤前報告 (簡易 Regex)
    const preReportPath = path.join(PRE_MARKET_DIR, `report_${TODAY}.md`);
    if (fs.existsSync(preReportPath)) {
        const content = fs.readFileSync(preReportPath, 'utf8');
        // 尋找表格區塊
        const tableMatch = content.match(/\| 代碼 \| 名稱 \| 影響 \| 簡要理由 \|([\s\S]*?)\n\n/);
        if (tableMatch) {
            const rows = tableMatch[1].trim().split('\n').filter(line => line.startsWith('|') && !line.includes('---'));
            predictions = rows.map(row => {
                const cols = row.split('|').map(c => c.trim()).filter(c => c);
                // | 2330 | 台積電 | ⬆️ 利多 | ... |
                if (cols.length >= 4) {
                    return {
                        code: cols[0],
                        name: cols[1],
                        impact: cols[2], // "⬆️ 利多"
                        reason: cols[3]
                    };
                }
                return null;
            }).filter(p => p);
            return predictions;
        }
    }
    return [];
};

// 取得今日收盤價
const getPrices = () => {
    const pricesFile = path.join(RAW_DIR, 'prices.json');
    // prices.json 應該包含 TWSE 與 TPEX 的合併資料
    // 格式假設: { "2330": { name: "台積電", open: 100, close: 105, change: 5, pct: 5.0 }, ... }
    // 或者是 Array
    const data = readJson(pricesFile);
    if (Array.isArray(data)) {
        // Convert array to map for O(1) lookup
        return data.reduce((acc, curr) => {
            acc[curr.code] = curr;
            return acc;
        }, {});
    }
    return data || {};
};

// 取得法人買賣超
const getInstitutional = () => {
    const instFile = path.join(RAW_DIR, 'institutional.json');
    const data = readJson(instFile);
    if (Array.isArray(data)) {
        return data.reduce((acc, curr) => {
            acc[curr.code] = curr;
            return acc;
        }, {});
    }
    return data || {};
};

// --- Main Generation Logic ---

const predictions = getPreMarketPredictions();
const prices = getPrices();
const institutional = getInstitutional();

const reportDate = `${TODAY.substring(0,4)}/${TODAY.substring(4,6)}/${TODAY.substring(6,8)}`;

let report = `# 台股盤後總結報告（${reportDate}）\n\n`;
report += `> 執行時間：${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}\n`;
report += `> 盤前調研：[report_${TODAY}.md](../../tw-stock-research/${TODAY}/report_${TODAY}.md)\n`;
report += `> 資料來源：證交所、櫃買中心\n\n`;

report += `## 📊 研判驗證總表\n\n`;
report += `| 代碼 | 名稱 | 盤前研判 | 開盤 | 收盤 | 漲跌% | 法人買賣超 | 結果 |\n`;
report += `|------|------|----------|------|------|-------|------------|------|\n`;

let stats = { total: 0, correct: 0, wrong: 0, neutral: 0 };
let correctList = [];
let wrongList = [];

predictions.forEach(pred => {
    const price = prices[pred.code];
    const inst = institutional[pred.code];
    
    let result = '➖ N/A';
    let open = '-', close = '-', pct = '-', instNet = '-';

    if (price) {
        open = price.open;
        close = price.close;
        pct = (price.changePercent > 0 ? '+' : '') + price.changePercent + '%';
        
        // Logic: 
        // Bullish: Close > Open
        // Bearish: Close < Open
        const isBullish = price.close > price.open;
        const isBearish = price.close < price.open;
        
        if (pred.impact.includes('利多')) {
            if (isBullish) { result = '✅ 符合'; stats.correct++; correctList.push(pred); }
            else { result = '❌ 誤判'; stats.wrong++; wrongList.push(pred); }
            stats.total++;
        } else if (pred.impact.includes('利空')) {
            if (isBearish) { result = '✅ 符合'; stats.correct++; correctList.push(pred); }
            else { result = '❌ 誤判'; stats.wrong++; wrongList.push(pred); }
            stats.total++;
        } else {
            stats.neutral++;
        }
    } else {
        result = '❓ 無數據';
    }
    
    if (inst) {
        // totalNet from twse/tpex script output format
        const val = inst.totalNet || inst.三大法人買賣超股數 || inst.三大法人買賣超股數合計 || 0;
        instNet = parseInt(val).toLocaleString();
        if (val > 0) instNet = `+${instNet}`;
    }

    report += `| ${pred.code} | ${pred.name} | ${pred.impact} | ${open} | ${close} | ${pct} | ${instNet} | ${result} |\n`;
});

report += `\n`;

// 統計摘要
const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
report += `## 📈 統計摘要\n\n`;
report += `- 總計研判：${stats.total} 檔\n`;
report += `- ✅ 符合：${stats.correct} 檔 (${accuracy}%)\n`;
report += `- ❌ 誤判：${stats.wrong} 檔 (${stats.total > 0 ? 100 - accuracy : 0}%)\n`;
report += `- ➖ 中性：${stats.neutral} 檔（不計入）\n\n`;

// 分析段落 (Template)
report += `## ✅ 符合分析\n\n`;
if (correctList.length > 0) {
    const sample = correctList[0];
    report += `### 1. ${sample.name}（${sample.code}）\n`;
    report += `- **盤前理由**：${sample.reason}\n`;
    report += `- **實際表現**：(請填寫實際走勢與法人動向)\n`;
    report += `- **符合原因**：(請填寫分析)\n`;
    report += `\n(其餘符合個股請自行補充...)\n\n`;
} else {
    report += `(今日無符合項目)\n\n`;
}

report += `## ❌ 誤判分析\n\n`;
if (wrongList.length > 0) {
    const sample = wrongList[0];
    report += `### 1. ${sample.name}（${sample.code}）\n`;
    report += `- **盤前理由**：${sample.reason}\n`;
    report += `- **實際表現**：(請填寫實際走勢)\n`;
    report += `- **誤判原因**：(請填寫分析，如：大盤拖累、利多出盡...)\n`;
    report += `\n(其餘誤判個股請自行補充...)\n\n`;
} else {
    report += `(今日無誤判項目)\n\n`;
}

report += `## 💡 後續建議\n\n`;
report += `1. **強化因子**：\n`;
report += `2. **注意事項**：\n`;

// Write to file
if (!fs.existsSync(POST_MARKET_DIR)) {
    fs.mkdirSync(POST_MARKET_DIR, { recursive: true });
}

fs.writeFileSync(REPORT_FILE, report);
console.log(`Post-market report generated: ${REPORT_FILE}`);
