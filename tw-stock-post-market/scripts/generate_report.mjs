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

const TODAY           = process.argv[2] || new Date().toLocaleString('en-CA', { timeZone: 'Asia/Taipei' }).slice(0, 10).replace(/-/g, '');
const BASE_OUTPUT_INPUT = process.argv[3] || path.join(process.cwd(), 'w-data-news');
const BASE_OUTPUT_DIR = resolveBaseOutputDir(BASE_OUTPUT_INPUT);
const POST_MARKET_DIR = path.join(BASE_OUTPUT_DIR, 'tw-stock-post-market', TODAY);
const PRE_MARKET_DIR  = path.join(BASE_OUTPUT_DIR, 'tw-stock-research', TODAY);
const RAW_DIR         = path.join(POST_MARKET_DIR, 'raw');
const REPORT_FILE     = path.join(POST_MARKET_DIR, `report_${TODAY}.md`);
const ERROR_LOG       = path.join(POST_MARKET_DIR, 'error_log.jsonl');

// Windows reserved-device-name guard — 避免 fs 寫入 nul/con/prn 等產生無法刪除的檔案
const _WIN_RESERVED_RE = /^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i;
function _guardPath(p) {
  if (_WIN_RESERVED_RE.test(p.replace(/.*[/\\]/, '')))
    throw new Error(`禁止寫入 Windows 保留裝置名稱: ${p}`);
}

function resolveBaseOutputDir(baseOutputPath) {
    const resolved = path.resolve(baseOutputPath);
    if (path.basename(resolved) === TODAY && path.basename(path.dirname(resolved)) === 'tw-stock-post-market') {
        return path.dirname(path.dirname(resolved));
    }
    return resolved;
}

// --- Helper Functions ---

function appendErrorLog(source, phase, type, message) {
    try {
        fs.mkdirSync(path.dirname(ERROR_LOG), { recursive: true });
        const entry = {
            timestamp: new Date().toISOString(),
            date: TODAY,
            source,
            phase,
            error: { type, message },
            resolution: 'failed',
        };
        _guardPath(ERROR_LOG);
        fs.appendFileSync(ERROR_LOG, JSON.stringify(entry) + '\n');
    } catch (_) { /* ignore log errors */ }
}

const readJson = (filePath) => {
    try {
        if (fs.existsSync(filePath)) {
            const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
            if (raw && raw.status === 'success') return raw.message;
            if (raw && raw.status === 'error') {
                console.warn(`${filePath} contains error: ${raw.message}`);
                return null;
            }
            return raw;
        }
    } catch (e) {
        console.error(`Warning: Could not read ${filePath}: ${e.message}`);
    }
    return null;
};

// --- Data Loading ---

const getPreMarketPredictions = () => {
    const preReportPath = path.join(PRE_MARKET_DIR, `report_${TODAY}.md`);
    if (!fs.existsSync(preReportPath)) {
        const msg = `找不到盤前報告：${preReportPath}，將跳過研判比對`;
        console.warn(`[盤後] ${msg}`);
        appendErrorLog('generate_report', 'pre-market', 'file_not_found', msg);
        return [];
    }

    const content = fs.readFileSync(preReportPath, 'utf8');

    const parseSection = (headerKeyword, impactLabel) => {
        const re = new RegExp(
            `###[^\n]*${headerKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^\n]*\n` +
            `[\\s\\S]*?\\| 代碼[\\s\\S]*?(?=\\n###|\\n##|$)`
        );
        const match = content.match(re);
        if (!match) {
            const msg = `盤前報告中找不到「${headerKeyword}」段落，可能格式已變更`;
            console.warn(`[盤後] ${msg}`);
            appendErrorLog('generate_report', 'pre-market', 'section_not_found', msg);
            return [];
        }

        return match[0].split('\n')
            .filter(line => line.startsWith('|') && !line.includes('---') && !line.includes('代碼'))
            .map(row => {
                const cols = row.split('|').map(c => c.trim()).filter(c => c);
                if (cols.length >= 5) {
                    return { code: cols[0], name: cols[1], impact: impactLabel, reason: cols[4] };
                }
                if (cols.length >= 3) {
                    return { code: cols[0], name: cols[1], impact: impactLabel, reason: cols[2] };
                }
                return null;
            })
            .filter(Boolean);
    };

    const bullish = parseSection('⬆️ 利多', '⬆️ 利多');
    const bearish = parseSection('⬇️ 利空', '⬇️ 利空');
    if (bullish.length + bearish.length === 0) {
        const msg = `盤前報告解析結果為空（0 檔），請確認報告格式是否正確：${preReportPath}`;
        console.warn(`[盤後] ${msg}`);
        appendErrorLog('generate_report', 'pre-market', 'empty_parse_result', msg);
    }
    return [...bullish, ...bearish];
};

/** 將價格列寫入 combined（共用 TWSE/TPEX 的逐列解析邏輯） */
const addPriceRows = (combined, rows, openIdx, closeIdx) => {
    if (!rows) return;
    rows.forEach(row => {
        const code  = (row[0] || '').trim();
        const name  = (row[1] || '').trim();
        const open  = parseFloat((row[openIdx]  || '').replace(/,/g, ''));
        const close = parseFloat((row[closeIdx] || '').replace(/,/g, ''));
        if (code && !isNaN(open) && !isNaN(close) && open > 0) {
            combined[code] = {
                name, open, close,
                changePercent: parseFloat(((close - open) / open * 100).toFixed(2)),
            };
        }
    });
};

const getPrices = () => {
    const combined = {};

    const twseData = readJson(path.join(RAW_DIR, 'prices_twse.json'));
    if (twseData?.data9) {
        const f = Array.isArray(twseData.fields9) ? twseData.fields9 : [];
        let openIdx = f.indexOf('開盤價');   if (openIdx  === -1) openIdx  = 5;
        let closeIdx = f.indexOf('收盤價');  if (closeIdx === -1) closeIdx = 8;
        addPriceRows(combined, twseData.data9, openIdx, closeIdx);
    } else if (twseData?.tables) {
        const tbl = twseData.tables.find(t => Array.isArray(t?.fields) && t.fields.includes('開盤價'));
        if (tbl) {
            addPriceRows(combined, tbl.data, tbl.fields.indexOf('開盤價'), tbl.fields.indexOf('收盤價'));
        }
    }

    // TPEX：[0]=代號, [1]=名稱, [2]=收盤, [4]=開盤
    const tpexData = readJson(path.join(RAW_DIR, 'prices_tpex.json'));
    if (tpexData?.data) {
        addPriceRows(combined, tpexData.data, 4, 2);
    }

    return combined;
};

/** 將法人買賣超資料寫入 combined（共用 TWSE/TPEX 的逐列解析邏輯） */
const addInstitutionalRows = (combined, data, codeField, nameField, netField) => {
    if (!data) return;
    data.forEach(item => {
        const code = (item[codeField] || '').trim();
        if (code) {
            combined[code] = { name: item[nameField] || '', totalNet: item[netField] || '0' };
        }
    });
};

const getInstitutional = () => {
    const combined = {};
    const twseData = readJson(path.join(RAW_DIR, 'institutional_twse.json'));
    addInstitutionalRows(combined, twseData?.data, '證券代號', '證券名稱', '三大法人買賣超股數');
    const tpexData = readJson(path.join(RAW_DIR, 'institutional_tpex.json'));
    addInstitutionalRows(combined, tpexData?.data, '代號', '名稱', '三大法人買賣超股數合計');
    return combined;
};

// --- Analysis Helper Functions ---

const getInstNetNum = (inst) => {
    if (!inst) return null;
    const n = parseInt(String(inst.totalNet).replace(/,/g, ''), 10);
    return isNaN(n) ? null : n;
};

const fmtPct = (pct) => (pct >= 0 ? '+' : '') + pct + '%';

const fmtInstNet = (num) => {
    if (num === null) return '-';
    return (num >= 0 ? '+' : '') + num.toLocaleString();
};

const describeActualPerf = (price, instNetNum) => {
    const pctStr = fmtPct(price.changePercent);
    const instStr = instNetNum !== null
        ? `；法人淨${instNetNum >= 0 ? '買' : '賣'}超 ${Math.abs(instNetNum).toLocaleString()} 股`
        : '';
    return `開盤 ${price.open} → 收盤 ${price.close}（${pctStr}）${instStr}`;
};

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

const INST_AMT_THRESHOLD = 50_000_000;
const classifyMisjudgment = (pred, price, instNetNum) => {
    const pct = price.changePercent;
    const isBullish = pred.impact.includes('利多');
    const instAmt = instNetNum !== null ? Math.abs(instNetNum) * price.close : 0;
    const instOpposes = instNetNum !== null && instAmt >= INST_AMT_THRESHOLD && (
        (isBullish  && instNetNum < 0) ||
        (!isBullish && instNetNum > 0)
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

// --- Prediction Evaluation ---

const evaluatePredictions = (predictions, prices, institutional) => {
    const stats = { total: 0, correct: 0, wrong: 0, neutral: 0,
                    bullishTotal: 0, bullishCorrect: 0, bearishTotal: 0, bearishCorrect: 0 };
    const correctList = [];
    const wrongList   = [];
    const bullishRows = [];
    const bearishRows = [];

    predictions.forEach(pred => {
        const price      = prices[pred.code];
        const instNetNum = getInstNetNum(institutional[pred.code]);
        let result = '❓ 無數據';
        let open = '-', close = '-', pct = '-';

        if (price) {
            open  = price.open;
            close = price.close;
            pct   = fmtPct(price.changePercent);

            const isBullPred = pred.impact.includes('利多');
            const isBearPred = pred.impact.includes('利空');

            if (isBullPred || isBearPred) {
                const isCorrect = isBullPred ? (price.close > price.open) : (price.close < price.open);
                result = isCorrect ? '✅ 符合' : '❌ 誤判';
                stats.total++;
                if (isBullPred) stats.bullishTotal++; else stats.bearishTotal++;

                if (isCorrect) {
                    stats.correct++;
                    if (isBullPred) stats.bullishCorrect++; else stats.bearishCorrect++;
                    correctList.push({ ...pred, price, instNetNum });
                } else {
                    stats.wrong++;
                    wrongList.push({ ...pred, price, instNetNum });
                }
            } else {
                stats.neutral++;
                result = '➖ 中性';
            }
        }

        const row = { pred, open, close, pct, instNetNum, result };
        if (pred.impact.includes('利多'))      bullishRows.push(row);
        else if (pred.impact.includes('利空')) bearishRows.push(row);
    });

    return { stats, correctList, wrongList, bullishRows, bearishRows };
};

// --- Report Section Builders ---

const TABLE_HEADER = `| 代碼 | 名稱 | 開盤 | 收盤 | 漲跌% | 法人買賣超 | 結果 |\n`
                   + `|------|------|------|------|-------|------------|------|\n`;

const toTableRow = ({ pred, open, close, pct, instNetNum, result }) =>
    `| ${pred.code} | ${pred.name} | ${open} | ${close} | ${pct} | ${fmtInstNet(instNetNum)} | ${result} |\n`;

const sortRows = (rows) => {
    const order = (r) => r.result.startsWith('✅') ? 0 : r.result.startsWith('❌') ? 1 : 2;
    return [...rows].sort((a, b) => order(a) - order(b));
};

const buildReportHeader = (reportDate) => {
    let s = `# 台股盤後總結報告（${reportDate}）\n\n`;
    s += `> 執行時間：${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}\n`;
    s += `> 盤前調研：[report_${TODAY}.md](../../tw-stock-research/${TODAY}/report_${TODAY}.md)\n`;
    s += `> 資料來源：證交所、櫃買中心\n\n`;
    return s;
};

const buildVerificationTable = (bullishRows, bearishRows) => {
    let s = `## 📊 研判驗證總表\n\n`;
    s += `### ⬆️ 利多\n\n`;
    s += TABLE_HEADER;
    sortRows(bullishRows).forEach(r => { s += toTableRow(r); });
    s += `\n`;
    s += `### ⬇️ 利空\n\n`;
    s += TABLE_HEADER;
    sortRows(bearishRows).forEach(r => { s += toTableRow(r); });
    s += `\n`;
    return s;
};

const buildStatsSummary = (stats) => {
    const accuracy   = stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : 0;
    const wrongPct   = stats.total > 0 ? Math.round((stats.wrong  / stats.total) * 100) : 0;
    const bullishAcc = stats.bullishTotal > 0 ? Math.round(stats.bullishCorrect / stats.bullishTotal * 100) : 0;
    const bearishAcc = stats.bearishTotal > 0 ? Math.round(stats.bearishCorrect / stats.bearishTotal * 100) : 0;

    let s = `## 📈 統計摘要\n\n`;
    s += `- 總計研判：${stats.total} 檔\n`;
    s += `- ✅ 符合：${stats.correct} 檔（${accuracy}%）\n`;
    s += `- ❌ 誤判：${stats.wrong} 檔（${wrongPct}%）\n`;
    s += `- ➖ 中性：${stats.neutral} 檔（不計入）\n`;
    s += `- 利多準確率：${stats.bullishCorrect}/${stats.bullishTotal}（${bullishAcc}%）\n`;
    s += `- 利空準確率：${stats.bearishCorrect}/${stats.bearishTotal}（${bearishAcc}%）\n\n`;
    return { section: s, accuracy, bullishAcc, bearishAcc };
};

const buildItemAnalysis = (title, emptyMsg, items, extraLine) => {
    let s = `## ${title}\n\n`;
    if (items.length === 0) return s + `${emptyMsg}\n\n`;
    items.forEach((item, i) => {
        s += `### ${i + 1}. ${item.name}（${item.code}）\n`;
        s += `- **盤前研判**：${item.impact}｜${item.reason}\n`;
        s += `- **實際表現**：${describeActualPerf(item.price, item.instNetNum)}\n`;
        s += `- ${extraLine(item)}\n`;
        s += `\n`;
    });
    return s;
};

const CATEGORY_DESC_MAP = {
    '大幅反向': '大幅反向（±5% 以上），可能受大盤或突發消息影響',
    '明顯反向': '明顯反向（±2~5%），研判方向偏差',
    '小幅反向': '小幅反向（±2% 以內），多空力道相近',
    '收平':     '收平（0%），動能不足，利多/利空未帶動方向',
    '法人反向': '法人動向與研判相反，機構立場改變',
};

const buildMechanismAnalysis = (correctList, wrongList, accuracy, bullishAcc, bearishAcc) => {
    let s = `## 📋 盤前預判機制分析\n\n`;

    // 法人動向一致性統計
    const instStats = {
        bullishInstBuy:  { total: 0, correct: 0 },
        bullishInstSell: { total: 0, correct: 0 },
        bearishInstSell: { total: 0, correct: 0 },
        bearishInstBuy:  { total: 0, correct: 0 },
    };
    const addInstStat = (item, isCorrect) => {
        const isBullPred = item.impact.includes('利多');
        const n = item.instNetNum;
        if (n === null) return;
        if (isBullPred && n > 0)  { instStats.bullishInstBuy.total++;  if (isCorrect) instStats.bullishInstBuy.correct++;  }
        if (isBullPred && n < 0)  { instStats.bullishInstSell.total++; if (isCorrect) instStats.bullishInstSell.correct++; }
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

    s += `### 法人動向一致性\n\n`;
    s += `| 情境 | 符合/總計 | 準確率 |\n`;
    s += `|------|-----------|--------|\n`;
    s += instRow('利多 + 法人買超（動向一致）', instStats.bullishInstBuy);
    s += instRow('利多 + 法人賣超（動向相反）', instStats.bullishInstSell);
    s += instRow('利空 + 法人賣超（動向一致）', instStats.bearishInstSell);
    s += instRow('利空 + 法人買超（動向相反）', instStats.bearishInstBuy);
    s += `\n`;

    // 誤判模式分類
    const misjudgCategories = {};
    wrongList.forEach(item => {
        const mc = classifyMisjudgment(item, item.price, item.instNetNum);
        misjudgCategories[mc.category] = (misjudgCategories[mc.category] || 0) + 1;
    });

    if (Object.keys(misjudgCategories).length > 0) {
        s += `### 誤判模式分類\n\n`;
        s += `| 模式 | 次數 | 說明 |\n`;
        s += `|------|------|------|\n`;
        Object.entries(misjudgCategories).sort((a, b) => b[1] - a[1]).forEach(([cat, cnt]) => {
            s += `| ${cat} | ${cnt} | ${CATEGORY_DESC_MAP[cat] || cat} |\n`;
        });
        s += `\n`;
    }

    // 自動優化建議
    const suggestions = [];
    const bibAcc = instAcc(instStats.bullishInstBuy);
    const bisAcc = instAcc(instStats.bullishInstSell);

    if (Math.abs(bullishAcc - bearishAcc) >= 15) {
        if (bullishAcc > bearishAcc)
            suggestions.push(`**利多 vs 利空 準確率差距明顯**（${bullishAcc}% vs ${bearishAcc}%）：利空研判容易誤判，建議強化利空標準，例如要求法人連續賣超 2 日以上，或有具體財報/消息面佐證`);
        else
            suggestions.push(`**利多 vs 利空 準確率差距明顯**（${bullishAcc}% vs ${bearishAcc}%）：利多研判容易誤判，建議加入量價配合條件（成交量需同步放大），避免消息面利多但量縮個股`);
    }

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

    s += `### 💡 優化建議\n\n`;
    suggestions.forEach((si, i) => {
        s += `${i + 1}. ${si}\n`;
    });
    s += `\n`;

    return s;
};

// --- Main ---

function main() {
    const predictions   = getPreMarketPredictions();
    const prices        = getPrices();
    const institutional = getInstitutional();

    const { stats, correctList, wrongList, bullishRows, bearishRows } =
        evaluatePredictions(predictions, prices, institutional);

    const reportDate = `${TODAY.substring(0, 4)}/${TODAY.substring(4, 6)}/${TODAY.substring(6, 8)}`;

    let report = buildReportHeader(reportDate);

    if (predictions.length === 0) {
        report += `> ⚠️ **警告：盤前研判資料為空**（找不到盤前報告或解析結果為 0 檔），以下研判驗證區塊將無內容。\n\n`;
    }

    report += buildVerificationTable(bullishRows, bearishRows);

    const { section: statsSummary, accuracy, bullishAcc, bearishAcc } = buildStatsSummary(stats);
    report += statsSummary;
    report += buildItemAnalysis('✅ 符合分析', '（今日無符合項目）', correctList,
        item => `**符合依據**：${describeMatchReason(item, item.price, item.instNetNum)}`);
    report += buildItemAnalysis('❌ 誤判分析', '（今日無誤判項目）', wrongList,
        item => `**誤判分類**：${classifyMisjudgment(item, item.price, item.instNetNum).label}`);
    report += buildMechanismAnalysis(correctList, wrongList, accuracy, bullishAcc, bearishAcc);

    fs.mkdirSync(POST_MARKET_DIR, { recursive: true });
    fs.mkdirSync(RAW_DIR, { recursive: true });

    _guardPath(REPORT_FILE);
    fs.writeFileSync(REPORT_FILE, report);
    console.log(`Post-market report generated: ${REPORT_FILE}`);
}

main();
