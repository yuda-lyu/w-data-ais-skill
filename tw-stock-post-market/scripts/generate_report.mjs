import fs from 'fs';
import path from 'path';

/**
 * 台股盤後總結報告生成器
 * 目的：彙整今日盤後數據，比對盤前研判準確度，並自動產出預判機制分析
 *
 * 用法：node generate_report.mjs [YYYYMMDD] [baseOutputDir]
 * 參數：
 * 1. YYYYMMDD     (選填)：指定日期，預設為今日。
 * 2. baseOutputDir (選填)：資料輸出根目錄；腳本會自動推導：
 *                         - <baseOutputDir>/tw-stock-post-market/<YYYYMMDD>/
 *                         - <baseOutputDir>/tw-stock-research/<YYYYMMDD>/
 *                         agent 調用時應顯式傳入；若省略僅作本地手動執行時的便利 fallback。
 */

const TODAY           = process.argv[2] || new Date().toISOString().slice(0, 10).replace(/-/g, '');
const BASE_OUTPUT_INPUT = process.argv[3] || path.join(process.cwd(), 'w-data-news');
const BASE_OUTPUT_DIR = resolveBaseOutputDir(BASE_OUTPUT_INPUT);
const POST_MARKET_DIR = path.join(BASE_OUTPUT_DIR, 'tw-stock-post-market', TODAY);
const PRE_MARKET_DIR  = path.join(BASE_OUTPUT_DIR, 'tw-stock-research', TODAY);
const RAW_DIR         = path.join(POST_MARKET_DIR, 'raw');
const REPORT_FILE     = path.join(POST_MARKET_DIR, `report_${TODAY}.md`);

function resolveBaseOutputDir(baseOutputPath) {
    const resolved = path.resolve(baseOutputPath);
    if (path.basename(resolved) === TODAY && path.basename(path.dirname(resolved)) === 'tw-stock-post-market') {
        return path.dirname(path.dirname(resolved));
    }
    return resolved;
}

// --- Helper Functions ---

const readJson = (filePath) => {
    try {
        if (fs.existsSync(filePath)) {
            const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            // Unwrap unified output format: { status: 'success', message: <data> }
            if (raw && raw.status === 'success') return raw.message;
            if (raw && raw.type === 'error') {
                console.warn(`${filePath} contains error: ${raw.message}`);
                return null;
            }
            return raw; // fallback for legacy format
        }
    } catch (e) {
        console.error(`Warning: Could not read ${filePath}: ${e.message}`);
    }
    return null;
};

// 提取盤前研判表
// 直接解析盤前 Markdown 報告（無 input.json 中間層）。
// 盤前報告格式（新版）：
//   - 利多/利空各一段，段落標題含檔數，如：### ⬆️ 利多（25 檔）
//   - 表格 5 欄：| 代碼 | 名稱 | 信心 | 法人動向 | 簡要理由 |
//   - 舊版 3 欄（代碼|名稱|簡要理由）亦相容
const getPreMarketPredictions = () => {
    const preReportPath = path.join(PRE_MARKET_DIR, `report_${TODAY}.md`);
    if (!fs.existsSync(preReportPath)) return [];

    const content = fs.readFileSync(preReportPath, 'utf8');

    // 段落標題用模糊匹配（忽略尾端的「（N 檔）」）
    // 欄位順序：代碼(0) | 名稱(1) | 信心(2) | 法人動向(3) | 簡要理由(4)
    const parseSection = (headerKeyword, impactLabel) => {
        // 匹配任何包含 headerKeyword 的 ### 標題行
        const re = new RegExp(
            `###[^\n]*${headerKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\n]*\n` +
            `[\\s\\S]*?\\| 代碼[\\s\\S]*?(?=\\n###|\\n##|$)`
        );
        const match = content.match(re);
        if (!match) return [];

        return match[0].split('\n')
            .filter(line => line.startsWith('|') && !line.includes('---') && !line.includes('代碼'))
            .map(row => {
                const cols = row.split('|').map(c => c.trim()).filter(c => c);
                // 新版 5 欄：代碼(0) 名稱(1) 信心(2) 法人動向(3) 簡要理由(4)
                if (cols.length >= 5) {
                    return { code: cols[0], name: cols[1], impact: impactLabel, reason: cols[4] };
                }
                // 舊版 3 欄相容：代碼(0) 名稱(1) 簡要理由(2)
                if (cols.length >= 3) {
                    return { code: cols[0], name: cols[1], impact: impactLabel, reason: cols[2] };
                }
                return null;
            })
            .filter(Boolean);
    };

    const bullish = parseSection('⬆️ 利多', '⬆️ 利多');
    const bearish  = parseSection('⬇️ 利空', '⬇️ 利空');
    return [...bullish, ...bearish];
};

// 取得今日收盤價（由 fetch-twse / fetch-tpex 腳本產出，readJson 已自動解包 status/message 包裝）
//
// prices_twse.json 解包後：MI_INDEX 格式
//   { stat, fields9: [...], data9: [[證券代號, 證券名稱, ..., 開盤價(idx5), ..., 收盤價(idx8), ...]] }
//
// prices_tpex.json 解包後：TPEX 格式
//   { source, date, count, data: [[代號(0), 名稱(1), 收盤(2), 漲跌(3), 開盤(4), 最高(5), 最低(6), ...]] }
const getPrices = () => {
    const combined = {};

    const twseData = readJson(path.join(RAW_DIR, 'prices_twse.json'));
    // 相容兩種格式：舊版 data9（直接屬性）/ 新版 tables[]（MI_INDEX 改版後）
    let twsePriceRows, twseOpenIdx, twseCloseIdx;
    if (twseData?.data9) {
        twsePriceRows = twseData.data9;
        const f = Array.isArray(twseData.fields9) ? twseData.fields9 : [];
        twseOpenIdx  = f.indexOf('開盤價'); if (twseOpenIdx  === -1) twseOpenIdx  = 5;
        twseCloseIdx = f.indexOf('收盤價'); if (twseCloseIdx === -1) twseCloseIdx = 8;
    } else if (twseData?.tables) {
        const tbl = twseData.tables.find(t => Array.isArray(t?.fields) && t.fields.includes('開盤價'));
        if (tbl) {
            twsePriceRows = tbl.data;
            twseOpenIdx  = tbl.fields.indexOf('開盤價');
            twseCloseIdx = tbl.fields.indexOf('收盤價');
        }
    }
    if (twsePriceRows) {
        twsePriceRows.forEach(row => {
            const code = (row[0] || '').trim();
            const name = (row[1] || '').trim();
            const open = parseFloat((row[twseOpenIdx]  || '').replace(/,/g, ''));
            const close = parseFloat((row[twseCloseIdx] || '').replace(/,/g, ''));
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

    // TPEX data 欄位順序：[0]=代號, [1]=名稱, [2]=收盤, [3]=漲跌, [4]=開盤, ...
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

// 取得法人買賣超（由 fetch-institutional-net-buy-sell 腳本產出，readJson 已自動解包 status/message 包裝）
//
// institutional_twse.json 解包後：
//   { source, date, data: [{ 證券代號, 證券名稱, 三大法人買賣超股數, ... }] }
//
// institutional_tpex.json 解包後：
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

// --- Analysis Helper Functions ---

/** 取得法人買賣超數值（股數，數值型；null 表示無資料） */
const getInstNetNum = (inst) => {
    if (!inst) return null;
    const n = parseInt(String(inst.totalNet).replace(/,/g, ''), 10);
    return isNaN(n) ? null : n;
};

/** 格式化法人買賣超為顯示字串 */
const fmtInstNet = (num) => {
    if (num === null) return '-';
    return (num >= 0 ? '+' : '') + num.toLocaleString();
};

/** 描述個股當日實際表現（開收盤 + 法人動向，一行文字） */
const describeActualPerf = (price, instNetNum) => {
    const pctStr = (price.changePercent >= 0 ? '+' : '') + price.changePercent + '%';
    const instStr = instNetNum !== null
        ? `；法人淨${instNetNum >= 0 ? '買' : '賣'}超 ${Math.abs(instNetNum).toLocaleString()} 股`
        : '';
    return `開盤 ${price.open} → 收盤 ${price.close}（${pctStr}）${instStr}`;
};

/** 自動描述「符合」依據（根據漲跌幅與法人動向推導） */
const describeMatchReason = (pred, price, instNetNum) => {
    const pct = price.changePercent;
    const isBullish = pred.impact.includes('利多');
    const parts = [];

    if (isBullish) {
        if (pct >= 5)      parts.push(`強勢大漲 +${pct}%，多頭走勢明確`);
        else if (pct >= 2) parts.push(`上漲 +${pct}%，股價方向符合利多預期`);
        else               parts.push(`小幅收紅 +${pct}%，符合利多方向`);

        if (instNetNum !== null && instNetNum > 0)
            parts.push(`法人同步買超 ${instNetNum.toLocaleString()} 股，動向一致`);
        else if (instNetNum !== null && instNetNum < 0)
            parts.push(`法人小幅賣超，但股價仍收紅，買盤承接力道充足`);
    } else {
        if (pct <= -5)     parts.push(`大跌 ${pct}%，空頭走勢明確`);
        else if (pct <= -2) parts.push(`下跌 ${pct}%，符合利空預期`);
        else               parts.push(`小幅收黑 ${pct}%，符合利空方向`);

        if (instNetNum !== null && instNetNum < 0)
            parts.push(`法人同步賣超 ${Math.abs(instNetNum).toLocaleString()} 股，確認方向`);
        else if (instNetNum !== null && instNetNum > 0)
            parts.push(`法人小幅買超，但股價仍收黑，賣壓偏重`);
    }
    return parts.join('；');
};

/**
 * 自動分類誤判原因，回傳 { label, category }
 * category: '大幅反向' | '明顯反向' | '小幅反向' | '收平' | '法人反向'
 * INST_THRESHOLD: 50萬股，視為明顯機構操作
 */
const INST_THRESHOLD = 500000;
const classifyMisjudgment = (pred, price, instNetNum) => {
    const pct = price.changePercent;
    const isBullish = pred.impact.includes('利多');
    const instOpposes = instNetNum !== null && (
        (isBullish  && instNetNum < -INST_THRESHOLD) ||
        (!isBullish && instNetNum >  INST_THRESHOLD)
    );

    if (isBullish) {
        if (pct < -5) return { label: `重挫 ${pct}%，可能受大盤系統性賣壓或重大利空介入`, category: '大幅反向' };
        if (pct < -2) return { label: `明顯走弱 ${pct}%，買盤力道不足以支撐`, category: '明顯反向' };
        if (pct === 0) return { label: '收平（0%），量縮整理，利多未能帶動上漲', category: '收平' };
        if (instOpposes) return { label: `法人反手賣超 ${Math.abs(instNetNum).toLocaleString()} 股，機構動向與利多研判相反`, category: '法人反向' };
        return { label: `小幅收跌 ${pct}%，多空力道相近，利多效果有限`, category: '小幅反向' };
    } else {
        if (pct > 5) return { label: `強勢大漲 +${pct}%，買盤超乎預期，利空失效`, category: '大幅反向' };
        if (pct > 2) return { label: `明顯走強 +${pct}%，利空未能壓制股價`, category: '明顯反向' };
        if (pct === 0) return { label: '收平（0%），利空效果有限，未能帶動下跌', category: '收平' };
        if (instOpposes) return { label: `法人逆勢買超 ${instNetNum.toLocaleString()} 股，機構動向與利空研判相反`, category: '法人反向' };
        return { label: `小幅收紅 +${pct}%，空方力道不足`, category: '小幅反向' };
    }
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

let stats = { total: 0, correct: 0, wrong: 0, neutral: 0,
              bullishTotal: 0, bullishCorrect: 0, bearishTotal: 0, bearishCorrect: 0 };
let correctList  = [];
let wrongList    = [];
let bullishRows  = [];  // { pred, open, close, pct, instNetNum, result }
let bearishRows  = [];

predictions.forEach(pred => {
    const price      = prices[pred.code];
    const inst       = institutional[pred.code];
    const instNetNum = getInstNetNum(inst);
    let result = '❓ 無數據';
    let open = '-', close = '-', pct = '-';

    if (price) {
        open  = price.open;
        close = price.close;
        pct   = (price.changePercent >= 0 ? '+' : '') + price.changePercent + '%';

        const isBullish_actual = price.close > price.open;
        const isBearish_actual = price.close < price.open;

        if (pred.impact.includes('利多')) {
            result = isBullish_actual ? '✅ 符合' : '❌ 誤判';
            if (isBullish_actual) { stats.correct++; stats.bullishCorrect++; correctList.push({ ...pred, price, instNetNum }); }
            else                  { stats.wrong++;                            wrongList.push({ ...pred, price, instNetNum }); }
            stats.total++; stats.bullishTotal++;
        } else if (pred.impact.includes('利空')) {
            result = isBearish_actual ? '✅ 符合' : '❌ 誤判';
            if (isBearish_actual) { stats.correct++; stats.bearishCorrect++; correctList.push({ ...pred, price, instNetNum }); }
            else                  { stats.wrong++;                            wrongList.push({ ...pred, price, instNetNum }); }
            stats.total++; stats.bearishTotal++;
        } else {
            stats.neutral++;
            result = '➖ 中性';
        }
    }

    const row = { pred, open, close, pct, instNetNum, result };
    if (pred.impact.includes('利多'))      bullishRows.push(row);
    else if (pred.impact.includes('利空')) bearishRows.push(row);
});

const TABLE_HEADER = `| 代碼 | 名稱 | 開盤 | 收盤 | 漲跌% | 法人買賣超 | 結果 |\n`
                   + `|------|------|------|------|-------|------------|------|\n`;
const toTableRow = ({ pred, open, close, pct, instNetNum, result }) =>
    `| ${pred.code} | ${pred.name} | ${open} | ${close} | ${pct} | ${fmtInstNet(instNetNum)} | ${result} |\n`;
// 符合排前，誤判排後，無數據排最後
const sortRows = (rows) => {
    const order = (r) => r.result.startsWith('✅') ? 0 : r.result.startsWith('❌') ? 1 : 2;
    return [...rows].sort((a, b) => order(a) - order(b));
};

report += `## 📊 研判驗證總表\n\n`;
report += `### ⬆️ 利多\n\n`;
report += TABLE_HEADER;
sortRows(bullishRows).forEach(r => { report += toTableRow(r); });
report += `\n`;
report += `### ⬇️ 利空\n\n`;
report += TABLE_HEADER;
sortRows(bearishRows).forEach(r => { report += toTableRow(r); });
report += `\n`;

// ── 統計摘要 ──────────────────────────────────────────────────────────────────
const accuracy = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
const wrongPct = stats.total > 0 ? Math.round((stats.wrong  / stats.total) * 100) : 0;
const bullishAcc = stats.bullishTotal > 0 ? Math.round(stats.bullishCorrect / stats.bullishTotal * 100) : 0;
const bearishAcc = stats.bearishTotal > 0 ? Math.round(stats.bearishCorrect / stats.bearishTotal * 100) : 0;

report += `## 📈 統計摘要\n\n`;
report += `- 總計研判：${stats.total} 檔\n`;
report += `- ✅ 符合：${stats.correct} 檔（${accuracy}%）\n`;
report += `- ❌ 誤判：${stats.wrong} 檔（${wrongPct}%）\n`;
report += `- ➖ 中性：${stats.neutral} 檔（不計入）\n`;
report += `- 利多準確率：${stats.bullishCorrect}/${stats.bullishTotal}（${bullishAcc}%）\n`;
report += `- 利空準確率：${stats.bearishCorrect}/${stats.bearishTotal}（${bearishAcc}%）\n\n`;

// ── 符合分析（全數個股，自動產出） ──────────────────────────────────────────
report += `## ✅ 符合分析\n\n`;
if (correctList.length > 0) {
    correctList.forEach((item, i) => {
        report += `### ${i + 1}. ${item.name}（${item.code}）\n`;
        report += `- **盤前研判**：${item.impact}｜${item.reason}\n`;
        report += `- **實際表現**：${describeActualPerf(item.price, item.instNetNum)}\n`;
        report += `- **符合依據**：${describeMatchReason(item, item.price, item.instNetNum)}\n`;
        report += `\n`;
    });
} else {
    report += `（今日無符合項目）\n\n`;
}

// ── 誤判分析（全數個股，自動產出） ──────────────────────────────────────────
report += `## ❌ 誤判分析\n\n`;
if (wrongList.length > 0) {
    wrongList.forEach((item, i) => {
        const mc = classifyMisjudgment(item, item.price, item.instNetNum);
        report += `### ${i + 1}. ${item.name}（${item.code}）\n`;
        report += `- **盤前研判**：${item.impact}｜${item.reason}\n`;
        report += `- **實際表現**：${describeActualPerf(item.price, item.instNetNum)}\n`;
        report += `- **誤判分類**：${mc.label}\n`;
        report += `\n`;
    });
} else {
    report += `（今日無誤判項目）\n\n`;
}

// ── 盤前預判機制分析 ──────────────────────────────────────────────────────────
report += `## 📋 盤前預判機制分析\n\n`;

// 法人動向一致性統計
const instStats = {
    bullishInstBuy:  { total: 0, correct: 0 },  // 利多 + 法人買超
    bullishInstSell: { total: 0, correct: 0 },  // 利多 + 法人賣超
    bearishInstSell: { total: 0, correct: 0 },  // 利空 + 法人賣超
    bearishInstBuy:  { total: 0, correct: 0 },  // 利空 + 法人買超
};
const addInstStat = (item, isCorrect) => {
    const isBullPred = item.impact.includes('利多');
    const n = item.instNetNum;
    if (n === null) return;
    if (isBullPred && n > 0) { instStats.bullishInstBuy.total++;  if (isCorrect) instStats.bullishInstBuy.correct++;  }
    if (isBullPred && n < 0) { instStats.bullishInstSell.total++; if (isCorrect) instStats.bullishInstSell.correct++; }
    if (!isBullPred && n < 0) { instStats.bearishInstSell.total++; if (isCorrect) instStats.bearishInstSell.correct++; }
    if (!isBullPred && n > 0) { instStats.bearishInstBuy.total++;  if (isCorrect) instStats.bearishInstBuy.correct++;  }
};
correctList.forEach(item => addInstStat(item, true));
wrongList.forEach(item   => addInstStat(item, false));

const instAcc = (g) => g.total > 0 ? Math.round(g.correct / g.total * 100) : null;
const instRow = (label, g) => {
    const acc = instAcc(g);
    return acc !== null ? `| ${label} | ${g.correct}/${g.total} | ${acc}% |\n` : '';
};

report += `### 法人動向一致性\n\n`;
report += `| 情境 | 符合/總計 | 準確率 |\n`;
report += `|------|-----------|--------|\n`;
report += instRow('利多 + 法人買超（動向一致）', instStats.bullishInstBuy);
report += instRow('利多 + 法人賣超（動向相反）', instStats.bullishInstSell);
report += instRow('利空 + 法人賣超（動向一致）', instStats.bearishInstSell);
report += instRow('利空 + 法人買超（動向相反）', instStats.bearishInstBuy);
report += `\n`;

// 誤判模式分類
const misjudgCategories = {};
wrongList.forEach(item => {
    const mc = classifyMisjudgment(item, item.price, item.instNetNum);
    misjudgCategories[mc.category] = (misjudgCategories[mc.category] || 0) + 1;
});

const categoryDescMap = {
    '大幅反向': '大幅反向（±5% 以上），可能受大盤或突發消息影響',
    '明顯反向': '明顯反向（±2~5%），研判方向偏差',
    '小幅反向': '小幅反向（±2% 以內），多空力道相近',
    '收平':     '收平（0%），動能不足，利多/利空未帶動方向',
    '法人反向': '法人動向與研判相反，機構立場改變',
};

if (Object.keys(misjudgCategories).length > 0) {
    report += `### 誤判模式分類\n\n`;
    report += `| 模式 | 次數 | 說明 |\n`;
    report += `|------|------|------|\n`;
    const sorted = Object.entries(misjudgCategories).sort((a, b) => b[1] - a[1]);
    sorted.forEach(([cat, cnt]) => {
        report += `| ${cat} | ${cnt} | ${categoryDescMap[cat] || cat} |\n`;
    });
    report += `\n`;
}

// 自動優化建議
const suggestions = [];

if (Math.abs(bullishAcc - bearishAcc) >= 15) {
    if (bullishAcc > bearishAcc)
        suggestions.push(`**利多 vs 利空 準確率差距明顯**（${bullishAcc}% vs ${bearishAcc}%）：利空研判容易誤判，建議強化利空標準，例如要求法人連續賣超 2 日以上，或有具體財報/消息面佐證`);
    else
        suggestions.push(`**利多 vs 利空 準確率差距明顯**（${bullishAcc}% vs ${bearishAcc}%）：利多研判容易誤判，建議加入量價配合條件（成交量需同步放大），避免消息面利多但量縮個股`);
}

const bibAcc = instAcc(instStats.bullishInstBuy);
const bisAcc = instAcc(instStats.bullishInstSell);
if (bibAcc !== null && bisAcc !== null && bibAcc - bisAcc >= 20)
    suggestions.push(`**法人動向是強力確認因子**：利多＋法人買超準確率（${bibAcc}%）明顯高於利多＋法人賣超（${bisAcc}%），建議盤前評估時優先選擇法人動向一致的個股，過濾法人賣超的利多研判`);
else if (bibAcc !== null && bibAcc >= 65)
    suggestions.push(`**法人買超確認效果佳**：利多＋法人買超準確率達 ${bibAcc}%，「法人動向一致」是可信賴的強化因子，建議在個股評分中給予較高權重`);

const flatCount  = misjudgCategories['收平']     || 0;
const instOpsCnt = misjudgCategories['法人反向'] || 0;
const largeCnt   = misjudgCategories['大幅反向'] || 0;
if (flatCount > 0)
    suggestions.push(`**收平誤判共 ${flatCount} 檔**：研判有方向性卻量縮收平，建議對「量縮整理」個股降低研判信心，或等待突破量確認後再行研判`);
if (instOpsCnt > 0)
    suggestions.push(`**法人方向相反共 ${instOpsCnt} 檔**：盤前研判時應確認最新（當日或前一交易日）法人動向，動向已改變者應降低信心或移除研判`);
if (largeCnt > 0)
    suggestions.push(`**大幅反向共 ${largeCnt} 檔**：可能受大盤系統性走勢或突發消息影響，建議研判時加入大盤情緒評估（如加權指數多空方向），系統性賣壓日暫緩利多研判`);

if (suggestions.length === 0)
    suggestions.push(`今日整體研判準確率 ${accuracy}%，各類別無明顯異常，持續觀察後續趨勢`);

report += `### 💡 優化建議\n\n`;
suggestions.forEach((s, i) => {
    report += `${i + 1}. ${s}\n`;
});
report += `\n`;

if (!fs.existsSync(POST_MARKET_DIR)) {
    fs.mkdirSync(POST_MARKET_DIR, { recursive: true });
}
if (!fs.existsSync(RAW_DIR)) {
    fs.mkdirSync(RAW_DIR, { recursive: true });
}

fs.writeFileSync(REPORT_FILE, report);
console.log(`Post-market report generated: ${REPORT_FILE}`);
