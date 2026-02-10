import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * 整合抓取腳本
 * 目的：同時抓取 TWSE (T86) 與 TPEX (3Insti) 的三大法人資料
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function runScript(scriptName) {
    return new Promise((resolve, reject) => {
        const scriptPath = path.join(__dirname, scriptName);
        console.log(`Starting ${scriptName}...`);
        
        const child = spawn('node', [scriptPath], { stdio: 'inherit' });
        
        child.on('close', (code) => {
            if (code === 0) {
                console.log(`${scriptName} finished successfully.`);
                resolve();
            } else {
                console.error(`${scriptName} failed with code ${code}.`);
                // 不 reject，讓另一個任務能繼續執行
                resolve(); 
            }
        });
        
        child.on('error', (err) => {
            console.error(`Failed to start ${scriptName}:`, err);
            resolve();
        });
    });
}

async function main() {
    // 依序執行，避免同時大量請求
    await runScript('fetch_twse_t86.mjs');
    await runScript('fetch_tpex_3insti.mjs');
}

main();