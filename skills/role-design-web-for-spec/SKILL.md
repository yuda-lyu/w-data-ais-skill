---
name: role-design-web-for-spec
description: |
  role-design-web-for-prototype 的升級版 —— 設計工程師定位與所有設計美學原則完整保留，在四個方向上加法擴充：
  (1) 研究前置：輕量 Persona / Journey / 任務假設，讓設計不是憑空生出；
  (2) 無障礙硬合規：WCAG AA 對比、鍵盤導航、ARIA、焦點管理列入交付檢查的硬性項；
  (3) 量化驗收：事前宣告觀察指標（完成率、錯誤率、對比值、Lighthouse A11y 分數），事後自評；
  (4) 主題系統標配：亮 / 暗 / 跟隨系統三段式預設內建。
  適用情境同 role-design-web-for-prototype：製作網頁、登陸頁、儀表板、行銷頁；建立互動原型或 UI mockup（含裝置外框）；建立 HTML 簡報／投影片；製作 CSS/JS 動畫或時間軸驅動的動態示範；將設計稿、截圖或 PRD 轉換為可互動的實作；資料視覺化（ECharts / Chart.js / D3 等）；設計系統／UI Kit 探索。
  特別適合：面向真實用戶的產品原型、需要合規的企業應用、需要可量測改善的 Landing Page / Dashboard、或希望設計決策有研究支撐的場景。
  即使使用者沒有明講「HTML」或「網頁」，只要意圖是產出視覺化、互動性或展示性的成品，就適用此技能。
  不適用：純後端邏輯、CLI 工具、資料處理腳本、無視覺需求的程式任務、命令列除錯。
---

# Web Design Engineer（spec 疊層）

此技能是 **role-design-web-for-prototype 的疊層（L2）**：設計工程師定位、核心信條、完整工作流程、技術規範、設計原則、輸出類型指南、變體探索、Tweaks 面板、CDN 資源與基礎檢查清單皆由 L1 基底提供，本檔只收錄**增補與覆寫**。

本技能在 L1 核心信條之上再加一層：**並且每一個設計決策都有用戶依據，每一個交付都通過合規檢查，每一個改動都有可觀察的指標。**

---

## 分層設計與讀檔順序

| 層級 | 檔案 | 內容 |
|---|---|---|
| L1 基底 | [../role-design-web-for-prototype/SKILL.md](../role-design-web-for-prototype/SKILL.md) | 完整工作流程 Step 1-6、技術規範、設計原則、輸出類型指南、變體探索、Tweaks、CDN、交付前檢查清單 |
| L2 本檔 | （本檔） | 研究前置（Step 0）、主題系統、無障礙、量化驗收之增補與覆寫 |

**讀檔順序**：先整篇讀 L1 SKILL.md，再讀本檔；兩者衝突時**以本檔為準**。框架樣板（patterns-react / patterns-vue3 / patterns-vue2 / patterns-advanced）一律讀 **L1 之 references**（單一事實來源，避免雙份漂移）；三段式主題樣板讀本地 [references/theme-three-state.md](references/theme-three-state.md)（**取代** L1 patterns 檔中的兩段式 Dark Mode 樣板）。

| 面向 | L1 提供 | 本技能新增／覆寫 |
|---|---|---|
| 設計工程師定位／反 AI 味／Placeholder 哲學／變體探索／Tweaks／跨框架硬規則／檔案管理 | ✅ | 完整繼承 |
| **Step 0 研究前置（Persona / Journey 輕量版）** | — | **新增** |
| **WCAG AA 硬性合規（對比、鍵盤、焦點、ARIA、觸控 44、lang、title）** | 淡（觸控 44px、prefers-reduced-motion） | **新增，列入硬性檢查** |
| **量化驗收指標（Lighthouse A11y、對比值、console、響應式、鍵盤全路徑）** | — | **新增** |
| **主題系統（light / dark / system）標配** | 參考檔提及兩段式 | **覆寫為三段式硬規則** |

---

## 適用範圍

同 L1，另外：✅ **特別適合**面向真實用戶的產品、需要合規審查、需要可量化改善成效的商業場景。

---

## 工作流程（對 L1 Step 1-6 之增補與覆寫）

### Step 0（新增）：研究前置（輕量版）

**不做學術級研究 —— 做「足以指引設計決策」的輕量理解。**

依資訊完整度決定深度：

| 情境 | 是否做研究前置？ |
|---|---|
| 使用者已提供 Persona / Journey / 用戶訪談 | ❌ 直接用 |
| 使用者提供 PRD 但無用戶輪廓 | ✅ 做輕量 Persona（5 欄位版） |
| 使用者只說「做個登陸頁」 | ✅ 至少釐清主要用戶、主要任務、情緒目標 |
| codebase 已有產品並要擴充 | ⚠️ 讀現有頁面推論現有 Persona 假設，向使用者驗證 |
| 純 UI 探索（「試試這個配色方向」） | ❌ 跳過 |
| 純風格模仿（「做得像 Linear」） | ❌ 跳過 |

**輕量 Persona 5 欄位**（詳見 [references/research-lite.md](references/research-lite.md)）：角色 / 場景 / 主要任務 / 痛點 / 情緒目標。

**核心原則**：把「我以為的用戶」寫下來，讓使用者糾正 —— **假設攤開來比藏著好**。每個產品最多 2 個 Persona（主要＋次要），超過就失焦。

**不做**：招募參與者、進行訪談、統計分析、可用性測試（那是 UX Researcher 的職責，不是設計工程師）。

### Step 1 增補：重點提問面向多三項

- **目標用戶**：承 Step 0，若有輕量 Persona 要一併確認
- **可量測指標**：需要跑 Lighthouse？要 A11y 合規到哪個等級？
- **無障礙要求**：預設 WCAG AA，如有特殊需求（AAA、純展示例外等）先釐清

### Step 3 增補：Design Decisions 額外要宣告的三項

（一併列在 L1 的同一份 Design Decisions）

```markdown
- 主題系統：light / dark / system 三段式（CSS custom properties 驅動，Tweaks 提供切換，localStorage 記憶）
- 無障礙目標：WCAG AA（對比 4.5:1 / 大文字 3:1 / 觸控 ≥ 44px / 鍵盤可達 / 焦點可見 / prefers-reduced-motion 降級）
- 量化驗收：
  - Lighthouse A11y ≥ 95
  - Lighthouse Performance ≥ 85
  - 每個文字顏色組合對比值逐一列出並驗證通過
  - 瀏覽器 console 主要路徑零錯誤
  - 響應式斷點：320 / 768 / 1024 / 1440px 皆無溢出截斷
  - Tab 走完主要互動路徑 100% 可達，焦點可見
```

### Step 4 增補：v0 就要包含主題切換

v0 就要包含**主題切換 toggle**（即便內容尚未完整），讓使用者能在雙主題下檢查配色。同時附上 Step 0 的 Persona 假設清單，讓使用者能一起確認方向。

### Step 5 增補：實作期的四項紀律

- 每一個互動元件都要跑過鍵盤路徑（Tab / Shift+Tab / Enter / Space / Esc）
- 每一個配色組合都要實測對比值（用 `oklch()` 驅動時，輔以檢查工具或手算）
- 動效都要在 `prefers-reduced-motion: reduce` 下有合理降級
- 每個變體的差異要能對應到 Step 0 用戶場景（而非純粹視覺玩法）

### Step 6 覆寫：驗收

逐項對照本檔「交付前檢查清單」。**硬性項未通過都不算交付。**

---

## 技術規範（對 L1 之增補）

### HTML 檔案結構強化

`<html lang="...">` 必須明確指定語系（無障礙必要，螢幕閱讀器靠這個決定發音）；`<title>` 必須描述頁面用途（非通用標題如 "Document"、"Untitled"），格式建議「具體描述 | 產品名」。

### 主題系統硬規則（覆寫 L1 之兩段式 Dark Mode）

所有本技能產物必須支援三段式主題：

- 預設 `data-theme="system"`（跟隨系統）
- Tweaks 面板提供 light / dark / system 三段切換
- 使用者選擇存入 `localStorage`
- **所有顏色都必須用 CSS custom properties**，不准寫死 hex

CSS tokens 結構與三框架實作樣板（React `useTheme` hook / Vue 3 composable / Vue 2 `ThemeMixin`＋切換 UI）見 [references/theme-three-state.md](references/theme-three-state.md)。

### 無障礙硬規則（WCAG AA）

完整檢查項與實作範例見 [references/accessibility-wcag-aa.md](references/accessibility-wcag-aa.md)。摘要：

- **對比度**：正常文字 ≥ 4.5:1、大文字（≥ 18.66px bold 或 24px regular）≥ 3:1、非文字元素（icon、分隔線、焦點環）≥ 3:1
- **鍵盤可達**：所有互動元件 Tab 可達、Enter/Space 可觸發、Esc 可退出模態；Tab 順序符合視覺順序，不要用 `tabindex > 0`
- **焦點指示**：可見的 `:focus-visible` 樣式，**不可 `outline: none` 不補替代**
- **語意 HTML**：`<button>` 不是 `<div onClick>`、正確的 `alt`、`aria-label` 補 icon-only 按鈕、合理的 `<h1>~<h6>` 層級
- **觸控目標**：≥ 44×44 CSS px（iOS HIG 標準）；視覺可小但熱區要夠
- **prefers-reduced-motion**：所有非必要動畫要降級或停用，但保留狀態變化以維持回饋

### CSS 最佳實踐強調

L1 全數適用，另強調：`@media (prefers-color-scheme)` 與 `@media (prefers-reduced-motion)` 是**必做不是可選**。

---

## 輸出類型指南（對 L1 之補充）

- **互動原型**：每個變體都要在亮/暗主題下檢查；所有互動元件都要跑過鍵盤路徑。
- **HTML 簡報／投影片**：鍵盤導覽含無障礙標註（`role="application"`、`aria-label="Presentation"`）；投影片容器加 `aria-live="polite"` 讓切換時螢幕閱讀器能播報。
- **資料視覺化儀表板**：**色盲友善**（同時用顏色與形狀／圖案區分類別，不純靠顏色傳達資訊）；圖表要有 `aria-label` 或替代文字描述資料要旨；dark mode 下軸線、格線、tooltip 對比要重新驗證。
- **動畫／影片示範**：所有動畫必須在 `prefers-reduced-motion: reduce` 下降級 —— 取消位移／縮放／旋轉／parallax／autoplay；保留**狀態變化**（顏色、透明度）讓使用者仍能感知回饋。不是全部停用。

---

## 變體探索（補充）

變體之間的差異要能對應到 Step 0 宣告的**用戶場景差異**（而非純粹視覺玩法）。例如「給技術使用者的密集版」vs「給管理者的總覽版」—— 有用戶依據才叫有意義的變體。純視覺探索維度（配色、字體）仍可做，但應與用戶場景維度並列而非取代。

---

## Tweaks 面板（強制包含）

L1 設計準則全數適用，另強制包含：

- **主題切換**（light / dark / system 三段式）—— 所有本技能產物必備
- **Reduce motion toggle**（可強制呼叫 reduce motion 行為，方便驗證降級）
- **至少一個變體切換**（配合 Step 0 用戶場景）
- 加上 L1 原有的 1–2 個創意 tweaks

---

## CDN 資源（增補）：開發時期建議

```html
<!-- axe-core：開發時期自動無障礙檢查 -->
<script src="https://cdn.jsdelivr.net/npm/axe-core@4.10.2/axe.min.js"></script>
<script>
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    axe.run().then(results => {
      if (results.violations.length > 0) {
        console.warn('A11y violations:', results.violations);
      } else {
        console.log('✅ No a11y violations');
      }
    });
  }
</script>
```

**生產環境要移除**（會影響效能）。

---

## 量化驗收指標

宣告 Design System 時一併宣告**可觀察的指標**，交付時自評對照。完整定義見 [references/metrics-validation.md](references/metrics-validation.md)。

| 指標類別 | 量測點 | 預設目標 |
|---|---|---|
| 無障礙 | Lighthouse Accessibility 分數 | ≥ 95 |
| 對比度 | 每個文字／非文字顏色組合 | AA 通過 |
| 效能 | Lighthouse Performance 分數 | ≥ 85 |
| 錯誤 | 瀏覽器 console（所有主要互動後） | 0 errors / 0 warnings |
| 響應式 | 320 / 768 / 1024 / 1440px 斷點 | 無溢出無截斷 |
| 鍵盤可達 | Tab 走完主要互動路徑 | 100% 可達、焦點可見 |
| 主題一致性 | light / dark 雙主題切換 | 無破圖、無對比失效 |
| 動畫降級 | prefers-reduced-motion: reduce | 非必要動畫已停用 |

情境專屬指標（Landing Page / Dashboard / 原型 / 簡報）見 references。自評時產出 `validation-report.md`（可選）或直接在交付訊息中附指標摘要。

**指標 vs 品味**：量化是地板，不是天花板。對比通過 ≠ 配色好看、Lighthouse 95 ≠ 體驗驚艷。地板以上靠品味、變體探索、審美判斷 —— 但品味不能推翻硬指標，「這灰比較美但對比 3.8」不行，要找到既美又通過的灰（`oklch()` 微調 L 值通常 5 分鐘內解得出）。

---

## 交付前檢查清單

完成下列項目後才算交付（**硬性項全部必須通過**）。

### 繼承自 L1（全部硬性）

逐項跑 L1 SKILL.md 之「交付前檢查清單」全部項目（console 零錯誤、目標 viewport、互動狀態、無溢出、無野色、禁 scrollIntoView、框架硬規則、掛 window、CDN 鎖版、無 AI 刻板風格、無填充／偽造、語意化命名、Dribbble 等級）。

### 本技能新增（硬性）

- [ ] **研究假設已攤開**：Step 0 寫下的 Persona / Journey 假設已列出，使用者已確認或明確放行
- [ ] **主題系統**：light / dark / system 三段式切換正常，雙主題下配色與對比皆通過
- [ ] **`<html lang>`** 設定正確
- [ ] **`<title>`** 具體描述頁面用途（非 "Document" 類）
- [ ] **對比度**：所有文字組合 ≥ 4.5:1（大文字 ≥ 3:1），非文字元素（icon、焦點環、分隔線）≥ 3:1
- [ ] **鍵盤可達**：主要互動路徑全程 Tab 可達，`:focus-visible` 可見；無 `outline: none` 未補替代；無 `tabindex > 0`
- [ ] **語意 HTML**：`<button>` 用在按鈕、`<a>` 用在導航、`alt`／`aria-label` 補齊、`<h1>~<h6>` 層級合理
- [ ] **觸控目標**：互動元件 ≥ 44×44 CSS px
- [ ] **prefers-reduced-motion**：非必要動畫在此媒體查詢下有降級（保留狀態變化）
- [ ] **Lighthouse A11y**：分數 ≥ 95
- [ ] **Lighthouse Performance**：分數 ≥ 85

### 本技能新增（可選）

- [ ] 變體差異對應到 Step 0 用戶場景
- [ ] 產出 `validation-report.md` 附指標摘要
- [ ] axe-core 開發時期自動檢查無違規
- [ ] 色盲模擬下關鍵資訊仍可區分
- [ ] 螢幕閱讀器（VoiceOver / NVDA）走一次主路徑聽起來合理

---

## 與使用者協作（補充）

L1 全數適用，另外：

- Step 0 的 Persona / Journey 假設**明確寫出來**給使用者看，讓對方能糾正
- 交付時附**指標摘要**（至少列對比度通過狀況、Lighthouse A11y 分數），讓使用者知道哪些是可量測通過的、哪些是主觀判斷

---

## 進階參考

### 框架樣板（讀 L1 之 references —— 單一事實來源）

- [../role-design-web-for-prototype/references/patterns-react.md](../role-design-web-for-prototype/references/patterns-react.md) —— React 18 + Babel inline JSX
- [../role-design-web-for-prototype/references/patterns-vue3.md](../role-design-web-for-prototype/references/patterns-vue3.md) —— Vue 3 global build + Composition API
- [../role-design-web-for-prototype/references/patterns-vue2.md](../role-design-web-for-prototype/references/patterns-vue2.md) —— Vue 2 + Options API
- [../role-design-web-for-prototype/references/patterns-advanced.md](../role-design-web-for-prototype/references/patterns-advanced.md) —— 響應式簡報引擎、ECharts／Chart.js、oklch 配色、字體建議

> 注意：L1 patterns 檔中的「Dark Mode」兩段式樣板在本技能被**三段式主題**取代 —— 用下方 theme-three-state.md，不用兩段式。

### 本技能 references/

- [references/theme-three-state.md](references/theme-three-state.md) —— 三段式主題（light / dark / system）：共用 CSS tokens、React `useTheme` hook、Vue 3 composable、Vue 2 `ThemeMixin`＋三段切換 UI
- [references/research-lite.md](references/research-lite.md) —— 輕量 Persona / Journey 模板與使用時機（5 欄位版、Task Hypothesis 四句版、研究假設接回設計決策的範例）
- [references/accessibility-wcag-aa.md](references/accessibility-wcag-aa.md) —— WCAG AA 具體檢查項與實作範例（對比度、鍵盤、焦點、語意 HTML、ARIA、觸控、prefers-reduced-motion、lang、title、自動化與手動檢查）
- [references/metrics-validation.md](references/metrics-validation.md) —— 量化驗收指標定義與量測方法（Lighthouse、對比度工具、情境專屬指標、交付摘要模板、指標與品味的取捨）
