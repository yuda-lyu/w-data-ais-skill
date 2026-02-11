import fs from 'fs';
import path from 'path';

const TODAY = '20260211';
const RAW_DIR = `w-data-news/tw-stock-research/${TODAY}/raw`;
const REPORT_FILE = `w-data-news/tw-stock-research/${TODAY}/report_${TODAY}.md`;

const readJson = (filename) => {
    const filePath = path.join(RAW_DIR, filename);
    try {
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf8');
            // Handle potential JSON wrapping from logs if not clean JSON
            // But my scripts wrote clean JSON to files.
            return JSON.parse(content);
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

const reportDate = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });

let report = `# 台股盤前調研報告（${reportDate}）\n\n`;
report += `> 調研日期：${TODAY}\n`;
report += `> 執行時間：${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}\n`;
report += `> 來源：MOPS (公開資訊觀測站)、鉅亨網、財報狗、MoneyDJ、證交所/櫃買中心\n\n`;

// 1. 三大法人買賣超
report += `## 💰 三大法人買賣超重點\n\n`;

const processInst = (data, marketName) => {
    let output = `### ${marketName}\n`;
    if (!data || (!data.data && !data.items)) {
        output += `(尚無資料或今日未開盤)\n\n`;
        return output;
    }
    
    // Logic to parse institutional data if available
    // Assuming structure similar to fetched data
    // Since fetch_twse_t86 failed, we handle null.
    // Tpex data was empty list.
    
    const list = data.data || data.items || [];
    if (list.length === 0) {
        output += `(無資料)\n\n`;
    } else {
        // Simple table
        output += `| 代號 | 名稱 | 買賣超股數 |\n|---|---|---|\n`;
        list.slice(0, 10).forEach(item => {
             // Adapt to actual fields if known, otherwise dump
             const code = item.code || item[0];
             const name = item.name || item[1];
             const val = item.net || item[2]; // Approximate
             output += `| ${code} | ${name} | ${val} |\n`;
        });
        output += `\n`;
    }
    return output;
};

report += processInst(twseData, '上市 (TWSE)');
report += processInst(tpexData, '上櫃 (TPEX)');


// 2. MOPS 重大公告
report += `## 📢 MOPS 重大公告精選\n\n`;
if (mopsData && Array.isArray(mopsData)) {
    mopsData.forEach(market => {
        const marketName = market.market;
        const result = market.data && market.data.result;
        if (result && Array.isArray(result)) {
            let marketHasData = false;
            let marketSection = `### ${marketName}\n`;
            
            result.forEach(category => {
                if (category.data && category.data.length > 0) {
                    marketHasData = true;
                    marketSection += `#### ${category.header}\n`;
                    category.data.forEach(row => {
                        // Row is typically array: [code, name, date, title, content_url]
                        // We try to extract title (usually 4th element, index 3)
                        // But checks row length.
                        const code = row[0];
                        const name = row[1];
                        const title = row[3] || row[2] || '無標題'; 
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

if (moneydjData && Array.isArray(moneydjData)) {
    report += `### MoneyDJ\n`;
    moneydjData.slice(0, 15).forEach(news => {
        report += `- [${news.title}](${news.link || '#'}) (${news.time})\n`;
    });
    report += `\n`;
} else if (moneydjData && moneydjData.data) {
    // Adapter if structure is different
    report += `### MoneyDJ\n`;
    moneydjData.data.slice(0, 15).forEach(news => {
        report += `- [${news.title}](${news.link || '#'}) (${news.time})\n`;
    });
    report += `\n`;
}

// Save Report
const outputDir = path.dirname(REPORT_FILE);
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

fs.writeFileSync(REPORT_FILE, report);
console.log(`Report generated: ${REPORT_FILE}`);
