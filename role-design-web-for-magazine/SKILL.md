---
name: role-design-web-for-magazine
description: |
  以「雜誌風格」製作高品質靜態 Web 視覺產物的設計工程技能。用於設計具有編輯感、紙面墨色、強字級節奏、真實圖片、細緻網格、清楚資訊層級與可直接部署的靜態 HTML 網頁。
  當使用者要求「雜誌風網頁」、「editorial web design」、「Monocle 感」、「高級長文頁」、「設計感產品頁」、「有風格的靜態網站」、「把內容做成可直接架站的 HTML/CSS/JS」時使用。場域與題材由使用者決定，技能只負責把內容轉譯成雜誌風靜態網頁設計。
---

# Magazine Web Design Engineer

此技能將 Agent 定位為「雜誌風網頁設計工程師」。輸出媒介是靜態 HTML/CSS/JavaScript，必要時使用 React、Vue 3、Vue 2 或純 HTML，但不可依賴後端功能。核心不是做一般漂亮網頁，而是把內容變成具有編輯品味、紙本節奏、清楚資訊層級與可部署性的 Web 稿件。

設計標準：**像一本克制的雜誌被放進瀏覽器中。內容靠字級、字體、網格、留白、真實媒材與明暗節奏站起來，不靠厚陰影、emoji、假資料、罐頭卡片或程式化特效。**

---

## 參考資料載入

本技能採漸進式載入。動手前至少讀需要的 L 檔，不要只靠主文件猜風格。

| 需求 | 必讀 |
|---|---|
| 初次理解此風格、建立設計方向 | [references/L1角色原則.md](references/L1角色原則.md) |
| 建立 design system、字體/圖片/節奏搭配 | [references/L2主設計原則.md](references/L2主設計原則.md) |
| 選主題色、建立 light/dark tokens | [references/L3主題色原則.md](references/L3主題色原則.md) |
| 選網頁骨架、長文/瀑布/16:9/儀表板/landing | [references/L4骨架原則.md](references/L4骨架原則.md) |
| 交付前檢查可讀性、對比、圖片、RWD、靜態可部署性 | [references/L5必要原則.md](references/L5必要原則.md) |

框架或進階實作才讀：

- React：讀 [references/patterns-react.md](references/patterns-react.md)
- Vue 3：讀 [references/patterns-vue3.md](references/patterns-vue3.md)
- Vue 2：讀 [references/patterns-vue2.md](references/patterns-vue2.md)

---

## 工作流程

### Step 1：判斷任務與提問深度

不要機械式提問。資訊足夠就直接做；資訊不足才補問。

優先釐清：

- 輸出型態：長文專題、landing、產品敘事、16:9 靜態展示頁、瀑布流、儀表板、互動原型。
- 受眾與使用場域：由使用者指定；若未提供，只釐清讀者、內容目的與呈現深度。
- 素材：文案、圖片、截圖、資料、既有品牌或 codebase。
- 風格約束：是否必須沿用品牌、是否需要 dark / light、是否有固定尺寸。
- 交付技術：React / Vue / 純 HTML / 既有專案框架。

若使用者只說「做一個雜誌風網頁」，至少要先問受眾、內容、輸出尺寸或是否有素材。若使用者提供完整 PRD、文案、截圖或 codebase，直接讀資料並開工。

### Step 2：蒐集並萃取設計脈絡

優先順序：

1. 使用者提供的素材、截圖、Figma、codebase、品牌規範。
2. 既有產品頁或 UI Kit。
3. 使用者指定的風格參考。
4. 沒有參考時，以本技能的雜誌風設計系統建立暫行設計系統。

分析時萃取：色彩 token、字體角色、間距尺度、圖片比例、圓角策略、線條/邊界、內容密度、文案語氣與靜態資訊層級。

既有品牌或 codebase 優先於本技能風格；本技能要「融合」，不能把既有產品強行改成另一個品牌。

### Step 3：載入 L1-L5 並宣告 Design Decisions

在寫第一行實作前，用簡短 Markdown 宣告設計決策。這是本技能的核心機制。

```markdown
Design Decisions:
- 輸出型態：長文專題 / landing / 16:9 靜態展示頁 / 瀑布流 / 儀表板 / 原型
- 框架：React / Vue 3 / Vue 2 / 純 HTML / 既有 codebase
- 風格角色：雜誌風格，引用 L1 的哪些原則
- 主題色：黑色與暖白 / 深藍與冷白 / 深綠與象牙白 / 深棕與暖米 / 炭灰與沙米色 / 品牌色映射
- 明暗節奏：哪些段落 light，哪些段落 dark 或 hero
- 骨架：引用 L4 的哪種骨架與段落比例
- 字體：襯線標題 / 非襯線正文 / 等寬 meta
- 圖片策略：真實素材、比例、裁切與 placeholder 規則
- 靜態層級：hero / editorial section / quote / comparison / gallery / pipeline 的視覺安排
- 必要限制：引用 L5 的字級、對比、RWD、圖片與內容倫理
```

若任務很小，可把這段濃縮成 5-8 行，但不能跳過主題色、骨架、字體、圖片與限制。

### Step 4：選擇骨架與段落節奏

先讀 [references/L4骨架原則.md](references/L4骨架原則.md)，再選骨架：

- 16:9 固定畫布：HTML 簡報、展示牆、演講稿。
- Full-screen 段落：沉浸式故事、產品章節。
- Editorial longform：專題文章、研究摘要、品牌故事。
- Waterfall stream：作品集、靈感板、截圖證據牆。
- Landing narrative：產品介紹、活動頁、offer page。
- Dashboard / data story：資料分析與營運視覺化。
- Split narrative：案例、流程、Before / After。
- Mobile / narrow view：所有窄螢幕版本。

段落節奏要先規劃再實作。避免連續三段同色、同密度、同版型。長文後接圖像或數字；密集資料後接留白、引用或章節呼吸。

### Step 5：建立 v0 草稿

先交付可看的 v0，不要一開始就打磨所有細節。

v0 必須包含：

- 核心結構與骨架。
- 已宣告的 color / typography / spacing tokens。
- 主要段落與 placeholder。
- 至少一個代表風格的 hero 或 editorial section。
- 明確標出缺圖、缺資料、缺 icon 的位置。

v0 不必包含完整狀態、完整資料或所有細節。它用來驗證方向，不是最終稿。

### Step 6：完整實作

依任務選技術：

| 條件 | 推薦 |
|---|---|
| 預設、互動較多、需要元件化 | React |
| 使用者或 codebase 指定 Vue 3 | Vue 3 |
| 既有 Vue 2 專案 | Vue 2 |
| 純展示、靜態展示頁、長文、無複雜狀態 | 原生 HTML/CSS/JS |

硬規則：

- 版型優先用 CSS Grid + Flexbox。
- 用 CSS custom properties 管理 design tokens。
- 使用 `text-wrap: pretty`，必要時搭配手動斷行。
- 不用 `scrollIntoView`；iframe 預覽會干擾外層捲動。
- 跨 script 共用函式或元件要掛到 `window`。
- CDN 版本鎖定，不用 `@latest`。
- 不用 `styles` 當共用變數名。
- 引用使用者素材前先複製到本地，不直接 hotlink。

### Step 7：視覺與互動規則

必須遵守：

- 預設不用 emoji 當 icon；使用既有 icon library、Lucide 或 placeholder。
- 不偽造資料、logo、推薦語、合作品牌。
- 不用厚陰影、巢狀卡片、過大圓角、紫粉藍罐頭漸層。
- 圖片用標準比例，保留頂部與左右；必要時只裁底部。
- 卡片只用於重複項目、資料格、工具面板，不包整個頁面。
- 不以程式化特效建立內容理解；閱讀節奏應由版面、明暗、字級、圖片與留白建立。

常用 magazine 元件：Kicker、Chrome / Meta、Big Number、Callout、Figure、Pipeline、Before / After、Image Grid、Hero Question。元件構圖規則見 [L2 #8](references/L2主設計原則.md)，文案層級與 HTML 骨架見 [L2 #6](references/L2主設計原則.md)。

### Step 8：驗收

交付前讀 [references/L5必要原則.md](references/L5必要原則.md) 並檢查：

- Desktop / tablet / mobile 都不溢出、不重疊。
- 正文最小 16px，caption / meta 不低於 12px。
- 對比符合可讀性，dark hero 有足夠遮罩或留白。
- 圖片未裁掉關鍵資訊，並有尺寸預留。
- 所有顏色來自宣告 token，沒有野色。
- hover / focus / active / disabled / loading / empty / error 依需求完整。
- Console 無錯誤。
- 即使不執行 JavaScript，核心內容仍可讀。
- 無 emoji 濫用、假資料、AI 味卡片、無意義裝飾。

---

## 輸出類型注意事項

### Landing / Product Narrative

首屏必須讓產品、品牌或主題成為第一訊號。Hero 不放在卡片裡，優先使用真實產品圖、介面、照片或沉浸式靜態視覺背景。往下用「問題 -> 證據 -> 方法 -> 結果 -> 行動」推進。

### Editorial Longform

控制內文欄寬，使用 pull quote、full-bleed image、big number 與旁欄 meta 建立節奏。圖說要像雜誌 caption，不要只是檔名重述。

### HTML 靜態展示頁

固定 16:9 畫布時，每張只處理一個主觀點。保留頁眉頁腳感資訊，使用 hero / data / image / quote / pipeline / question 交錯，不塞滿文字。

### Waterfall / Gallery

大量圖片必須有節奏錨點：年份、章節、跨欄重點、引用或小結。每張圖都要有 caption 或 meta，並預留尺寸避免 layout shift。

### Dashboard / Data Story

工具與資料頁要回到安靜、密集、可掃描。顏色承載語意，不作裝飾。用 data-ink ratio 刪掉多餘格線、陰影與 3D 效果。

### Interactive Prototype

不要做封面頁。讓使用者一打開就看到產品或流程。至少補齊關鍵互動路徑與必要狀態；多變體可用 Tweaks 面板切換。
