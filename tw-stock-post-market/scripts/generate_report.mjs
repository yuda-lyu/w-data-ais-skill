import fs from 'fs';
import path from 'path';

/**
 * 台股盤後總結報告生成器
 * 目的：彙整今日盤後數據，比對盤前研判準確度
 *
 * 用法：node generate_report.mjs [YYYYMMDD]
 * 參數：
 * 1. YYYYMMDD (選填)：指定日期，預設為今日。
 */

const TODAY = process.argv[2] || new Date().toISOString().slice(0, 10).replace(/-/g, '');
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

// 提取盤前研判表
// 優先讀取 raw/input.json；若不存在，Fallback 解析盤前報告 Markdown
const getPreMarketPredictions = () => {
    const inputJsonPath = path.join(RAW_DIR, 'input.json');
    const predictions = readJson(inputJsonPath);
    if (predictions) return predictions;

    const preReportPath = path.join(PRE_MARKET_DIR, `report_${TODAY}.md`);
    if (fs.existsSync(preReportPath)) {
        const content = fs.readFileSync(preReportPath, 'utf8');
        const tableMatch = content.match(/\| 代碼 \| 名稱 \| 影響 \| 簡要理由 \|([\s\S]*?)\n\n/);
        if (tableMatch) {
            return tableMatch[1].trim().split('\n')
                .filter(line => line.startsWith('|') && !line.includes('---'))
                .map(row => {
                    const cols = row.split('|').map(c => c.trim()).filter(c => c);
                    if (cols.length >= 4) {
                        return { code: cols[0], name: cols[1], impact: cols[2], reason: cols[3] };
                    }
                    return null;
                })
                .filter(Boolean);
        }
    }
    return [];
};

// 取得今日收盤價（由 fetch-twse / fetch-tpex 腳本產出的原始格式）
//
// prices_twse.json：fetch_twse.mjs 以 all 模式輸出的 MI_INDEX 格式
//   { stat, fields9: [...], data9: [[證券代號, 證券名稱, ..., 開盤價(idx5), ..., 收盤價(idx8), ...]] }
//
// prices_tpex.json：fetch_tpex.mjs 以 all 模式輸出的格式
//   { source, date, count, data: [[代號(0), 名稱(1), 收盤(2), 漲跌(3), 開盤(4), 最高(5), 最低(6), ...]] }
const getPrices = () => {
    const combined = {};

    const twseData = readJson(path.join(RAW_DIR, 'prices_twse.json'));
    if (twseData?.data9) {
        twseData.data9.forEach(row => {
            const code = (row[0] || '').trim();
            const name = (row[1] || '').trim();
            const open = parseFloat((row[5] || '').replace(/,/g, ''));
            const close = parseFloat((row[8] || '').replace(/,/g, ''));
            if (code && !isNaN(open) && !isNaN(close) && open > 0) {
                combined[code] = {
                    name,
                    open,
                    close,
                    changePercent: parseFloat(((close - open) / open * 100).toFixed(2))
                };
            }
        });
    }

    // TPEX aaData 欄位順序：[0]=代號, [1]=名稱, [2]=收盤, [3]=漲跌, [4]=開盤, ...
    const tpexData = readJson(path.join(RAW_DIR, 'prices_tpex.json'));
    if (tpexData?.data) {
        tpexData.data.forEach(row => {
            const code = (row[0] || '').trim();
            const name = (row[1] || '').trim();
            const close = parseFloat((row[2] || '').replace(/,/g, ''));
            const open = parseFloat((row[4] || '').replace(/,/g, ''));
            if (code && !isNaN(open) && !isNaN(close) && open > 0) {
                combined[code] = {
                    name,
                    open,
                    close,
                    changePercent: parseFloat(((close - open) / open * 100).toFixed(2))
                };
            }
        });
    }

    return combined;
};

// 取得法人買賣超（由 fetch-institutional-net-buy-sell 腳本產出的原始格式）
//
// institutional_twse.json：fetch_twse_t86.mjs 輸出
//   { source, date, data: [{ 證券代號, 證券名稱, 三大法人買賣超股數, ... }] }
//
// institutional_tpex.json：fetch_tpex_3insti.mjs 輸出
//   { source, date, data: [{ 代號, 名稱, 三大法人買賣超股數合計, ... }] }
const getInstitutional = () => {
    const combined = {};

    const twseData = readJson(path.join(RAW_DIR, 'institutional_twse.json'));
    if (twseData?.data) {
        twseData.data.forEach(item => {
            const code = (item['證券代號'] || '').trim();
            if (code) {
                combined[code] = {
                    name: item['證券名稱'] || '',
                    totalNet: item['三大法人買賣超股數'] || '0'
                };
            }
        });
    }

    const tpexData = readJson(path.join(RAW_DIR, 'institutional_tpex.json'));
    if (tpexData?.data) {
        tpexData.data.forEach(item => {
            const code = (item['代號'] || '').trim();
            if (code) {
                combined[code] = {
                    name: item['名稱'] || '',
                    totalNet: item['三大法人買賣超股數合計'] || '0'
                };
            }
        });
    }

    return combined;
};

// --- Main Generation Logic ---

const predictions = getPreMarketPredictions();
const prices = getPrices();
const institutional = getInstitutional();

const reportDate = `${TODAY.substring(0, 4)}/${TODAY.substring(4, 6)}/${TODAY.substring(6, 8)}`;

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
        pct = (price.changePercent >= 0 ? '+' : '') + price.changePercent + '%';

        const isBullish = price.close > price.open;
        const isBearish = price.close < price.open;

        if (pred.impact.includes('利多')) {
            result = isBullish ? '✅ 符合' : '❌ 誤判';
            if (isBullish) { stats.correct++; correctList.push(pred); }
            else { stats.wrong++; wrongList.push(pred); }
            stats.total++;
        } else if (pred.impact.includes('利空')) {
            result = isBearish ? '✅ 符合' : '❌ 誤判';
            if (isBearish) { stats.correct++; correctList.push(pred); }
            else { stats.wrong++; wrongList.push(pred); }
            stats.total++;
        } else {
            stats.neutral++;
            result = '➖ 中性';
        }
    } else {
        result = '❓ 無數據';
    }

    if (inst) {
        const numVal = parseInt(String(inst.totalNet).replace(/,/g, ''), 10);
        if (!isNaN(numVal)) {
            instNet = (numVal > 0 ? '+' : '') + numVal.toLocaleString();
        }
    }

    report += `| ${pred.code} | ${pred.name} | ${pred.impact} | ${open} | ${close} | ${pct} | ${instNet} | ${result} |\n`;
});

report += `\n`;

const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
report += `## 📈 統計摘要\n\n`;
report += `- 總計研判：${stats.total} 檔\n`;
report += `- ✅ 符合：${stats.correct} 檔 (${accuracy}%)\n`;
report += `- ❌ 誤判：${stats.wrong} 檔 (${stats.total > 0 ? 100 - accuracy : 0}%)\n`;
report += `- ➖ 中性：${stats.neutral} 檔（不計入）\n\n`;

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
report += `3. **調整方向**：\n`;

if (!fs.existsSync(POST_MARKET_DIR)) {
    fs.mkdirSync(POST_MARKET_DIR, { recursive: true });
}
if (!fs.existsSync(RAW_DIR)) {
    fs.mkdirSync(RAW_DIR, { recursive: true });
}

fs.writeFileSync(REPORT_FILE, report);
console.log(`Post-market report generated: ${REPORT_FILE}`);
