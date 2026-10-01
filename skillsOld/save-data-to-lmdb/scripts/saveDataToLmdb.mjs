// saveDataToLmdb.mjs — 將任意資料寫入本機 LMDB，依外部指定之主鍵欄位 pk 去重
//
// 主鍵設計：
//   w-orm-lmdb 內部固定以記錄的 `id` 欄位作為 LMDB key，且 insert 時若 `id` 不是「非空字串」
//   便會自動以 genIDSeq() 產生隨機值（見 w-orm-lmdb/src/WOrmLmdb.mjs:212-214）。
//   隨機 id 代表每次寫入都是新 key ── 去重會靜默失效。
//   故本模組要求呼叫端以 `pk` 指定「哪個欄位是不重複主鍵」，取該欄位值轉為非空字串後
//   寫入 `id`，把主鍵的決定權交回外部資料本身。
//
// 去重機制：
//   走 LMDB key 路徑（逐筆 insert，nInserted===1 即為新項目），為 O(k) 操作，
//   不隨資料量成長而變慢。同一批內 pk 重複時第一筆勝出，其餘計入 dupCount。
//
// 去重鍵的選擇（呼叫端責任）：
//   pk 欄位須為「同一筆資料的穩定識別」。若指定到會隨每次抓取而微變的欄位
//   （如逐次重抓會差幾個字的內文摘要），同一筆會被當成新項目而重複儲存。
//
// 輸出：{ status, savedAt, result: { ok, code, message, receivedCount, addCount, dupCount, itemsAdd } }

import WOrm from "w-orm-lmdb";

/** LMDB key 的安全上限（lmdb-js 預設 maxKeySize 為 1978 bytes，取保守值） */
const MAX_KEY_BYTES = 1000;

/**
 * 取出並正規化一筆資料的主鍵值。
 * 回傳非空字串代表可用；回傳 null 代表該筆不具備合法主鍵。
 * 之所以強制轉字串：w-orm-lmdb 只認「非空字串」的 id，數字型主鍵（如 1234）
 * 若原樣傳入會被判定為無效而遭隨機 id 覆寫。
 */
function pickPkValue(item, pk) {
  if (!item || typeof item !== "object") return null;
  const v = item[pk];
  if (v === null || v === undefined) return null;
  if (typeof v === "object") return null; // 物件／陣列不可作為主鍵
  const s = String(v).trim();
  return s === "" ? null : s;
}

/** 取得 UTC+8 時間字串 YYYY-MM-DD HH:mm:ss */
function ts() {
  return new Date()
    .toLocaleString("sv-SE", { timeZone: "Asia/Taipei" })
    .replace("T", " ")
    .slice(0, 19);
}

/**
 * 將 itemsNew 寫入本機 LMDB，依 pk 欄位去重，回傳新增結果。
 * @param {object} payload
 * @param {string} payload.dbPath LMDB 資料夾路徑（必填）
 * @param {string} [payload.db='name-db'] 資料庫名稱
 * @param {string} [payload.cl='name-cl'] 集合名稱
 * @param {string} [payload.pk='pk'] 主鍵欄位名稱，指定 itemsNew 內哪個欄位為不重複主鍵
 * @param {Array}  payload.itemsNew 資料陣列，每筆至少含[pk]欄位且其值非空
 * @returns {Promise<object>}
 *   注意：實際寫入 LMDB 的記錄會帶上 `id` 欄位（值＝該筆的 pk 值），因為 w-orm-lmdb
 *   固定以 `id` 為 key。若 pk 不是 'id' 且原資料已有 `id` 欄位，該欄位會被覆寫。
 */
export async function saveDataToLmdb(payload = {}) {
  const { dbPath, db = "name-db", cl = "name-cl", pk = "pk", itemsNew } = payload;

  // ---------- 驗證 ----------
  if (!dbPath) {
    return { status: "error", message: "Missing required field: dbPath" };
  }
  if (typeof pk !== "string" || pk.trim() === "") {
    return { status: "error", message: "Invalid field: pk (needs to be a non-empty string)" };
  }
  if (!Array.isArray(itemsNew) || itemsNew.length === 0) {
    return {
      status: "error",
      message: "Missing required field: itemsNew (needs to be a non-empty array)",
    };
  }

  // 先算出各筆主鍵值，任一筆缺主鍵即整批拒絕：
  // 若放行，該筆會被 w-orm-lmdb 指派隨機 id 而永遠無法去重（靜默錯誤）。
  const ids = itemsNew.map((it) => pickPkValue(it, pk));
  const badIdx = ids.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);
  if (badIdx.length > 0) {
    const preview = badIdx.slice(0, 5).join(", ");
    return {
      status: "error",
      message:
        `${badIdx.length} item(s) missing a usable "${pk}" value` +
        ` (index: ${preview}${badIdx.length > 5 ? ", ..." : ""})`,
    };
  }
  const tooLongIdx = ids
    .map((v, i) => (Buffer.byteLength(v, "utf8") > MAX_KEY_BYTES ? i : -1))
    .filter((i) => i >= 0);
  if (tooLongIdx.length > 0) {
    return {
      status: "error",
      message:
        `${tooLongIdx.length} item(s) have a "${pk}" value longer than ${MAX_KEY_BYTES} bytes` +
        ` (index: ${tooLongIdx.slice(0, 5).join(", ")})；請改用較短的主鍵欄位，或於呼叫端先自行雜湊`,
    };
  }

  // ---------- 開啟 LMDB ----------
  let wo;
  try {
    wo = WOrm({ url: dbPath, db, cl });
  } catch (e) {
    return { status: "error", message: `open lmdb failed: ${e.message}` };
  }

  // ---------- 逐筆寫入（key 路徑去重） ----------
  const itemsAdd = [];
  let dupCount = 0;
  try {
    for (let i = 0; i < itemsNew.length; i++) {
      const it = itemsNew[i];
      const rec = { ...it, id: ids[i] };
      const r = await wo.insert([rec]);
      // nInserted===1 → 全新；===0 → 已存在（含批內重複，第一筆勝出）
      if (r && r.nInserted === 1) itemsAdd.push(it);
      else dupCount++;
    }
  } catch (e) {
    return { status: "error", message: `insert failed: ${e.message}` };
  } finally {
    // 必須關閉：close() 會釋放 LMDB env 的檔案鎖，未關閉時 Windows 下該資料夾
    // 會被行程持有，後續刪除／再開啟可能失敗或讀到舊映射
    try {
      await wo.close();
    } catch { /* noop：關閉失敗不影響已寫入的資料 */ }
  }

  return {
    status: "success",
    savedAt: ts(),
    result: {
      ok: true,
      code: "SUCCESS",
      message: "處理完成",
      receivedCount: itemsNew.length,
      addCount: itemsAdd.length,
      dupCount,
      itemsAdd,
    },
  };
}

export default saveDataToLmdb;
