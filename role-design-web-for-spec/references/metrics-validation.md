# 量化驗收指標

role-design-web-for-spec 要求**事前宣告、事後自評**的可觀察指標，避免設計決策全憑主觀判斷。

**核心原則**：量化不是取代品味，是**補足品味看不見的盲點**。Dribbble 等級的視覺 + 可量測的通過率 = 同時有靈魂與骨架的設計。

---

## 事前宣告（在 Step 3 Design System 一併定義）

每份產物都要列出**打算量測的指標**與**目標值**。預設如下（可依情境調整）：

| 指標類別 | 量測點 | 預設目標 | 誰負責 |
|---|---|---|---|
| 無障礙 | Lighthouse Accessibility | ≥ 95 | 自動 |
| 對比度 | 每個文字組合 | 正文 ≥ 4.5:1，大文字 ≥ 3:1 | 半自動 |
| 對比度 | 非文字元素（icon、邊框、聚焦環） | ≥ 3:1 | 手動 |
| 效能 | Lighthouse Performance | ≥ 85 | 自動 |
| 最佳實踐 | Lighthouse Best Practices | ≥ 95 | 自動 |
| 錯誤 | Console（主要互動後） | 0 errors / 0 warnings | 手動 |
| 響應式 | 320 / 768 / 1024 / 1440 / 1920px | 無溢出、無截斷、版面合理 | 手動 |
| 鍵盤可達 | Tab 走完主要路徑 | 100% 可達、焦點可見 | 手動 |
| 主題切換 | light / dark / system | 無破圖、對比未失效 | 手動 |
| 動畫降級 | prefers-reduced-motion: reduce | 非必要動畫已停用 | 手動 |

---

## 情境專屬指標（依產物類型加碼）

### Landing Page / 行銷頁

| 指標 | 量測方式 | 參考目標 |
|---|---|---|
| First Contentful Paint | Lighthouse | < 1.8s |
| Largest Contentful Paint | Lighthouse | < 2.5s |
| Cumulative Layout Shift | Lighthouse | < 0.1 |
| 主要 CTA 可見於第一屏 | 手動（1920×1080 桌面 / 375×812 手機） | ✅ |

### Dashboard / 資料視覺化

| 指標 | 量測方式 | 參考目標 |
|---|---|---|
| 核心數字閱讀時間 | 手動計時（假設使用者） | < 5s |
| 圖表響應式（縮放視窗） | 手動 | 無變形、ResizeObserver 運作 |
| 色盲友善（同資料在模擬下可區分） | DevTools → Rendering → Emulate vision deficiencies | ✅ |
| Dark mode 下圖表背景與軸線可讀 | 手動 | ✅ |

### 互動原型

| 指標 | 量測方式 | 參考目標 |
|---|---|---|
| 主要互動路徑完整可點 | 手動走一遍 | ✅ |
| 變體切換無破圖 | 手動切 Tweaks | ✅ |
| 狀態覆蓋完整度 | 對照 default/hover/active/focus/disabled/loading/empty/error 逐項檢查 | ≥ 6/8 狀態有處理 |

### HTML 簡報

| 指標 | 量測方式 | 參考目標 |
|---|---|---|
| 1920×1080 下文字 ≥ 24px | 手動抽查 | ✅ |
| 縮放自適應（各視窗大小都顯示完整） | 手動拉視窗 | ✅ |
| 鍵盤導覽（← → Space） | 手動 | ✅ |
| localStorage 記憶位置 | 重新整理測試 | ✅ |

---

## 量測方式細節

### Lighthouse

Chrome DevTools → Lighthouse → Analyze page load。

**建議配置**：
- Mode: Navigation
- Device: Mobile（嚴格）+ Desktop（補做）
- Categories: Performance / Accessibility / Best Practices
- 各跑 3 次取中位數（第一次常受快取影響）

### 對比度

**工具**：
1. **Chrome DevTools**：Inspect element → 點顏色色票 → 自動顯示對比值與 AA/AAA 通過狀態
2. **WebAIM**：https://webaim.org/resources/contrastchecker/
3. **Stark**（Figma 外掛）：適用於設計階段

**批次檢查技巧**：把所有用到的顏色組合列一張表，逐一填入對比值。

```markdown
| 前景 | 背景 | 對比值 | 通過 AA? |
|---|---|---|---|
| --fg (#1a1a1a) | --bg (#fafafa) | 16.1:1 | ✅ |
| --muted (#666) | --bg (#fafafa) | 5.7:1 | ✅ |
| --muted (#666) | --surface (#f0f0f0) | 4.3:1 | ❌ 正文不過 |
```

### Console 錯誤

打開 DevTools → Console，**執行主要互動路徑**（點擊、開啟模態、提交表單、切換主題等），觀察有無錯誤或警告。

**常見假陽性**：開發模式下的 React DevTools 提示、CDN 提示 —— 這些不算違規。

### 響應式

Chrome DevTools → Device toolbar → 逐一切換：
- 320px（iPhone SE 縱）
- 375px（iPhone 13 縱）
- 768px（iPad 縱）
- 1024px（iPad 橫）
- 1440px（桌面）
- 1920px（桌面大）

也可用 `Ctrl/Cmd + Shift + M` 進入響應式模式，手動拖拉視窗寬度。

### 鍵盤可達

1. 關閉滑鼠（或把它放遠）
2. 按 `Tab` 從頁面開頭走到結尾
3. 確認每個互動元件都能 Tab 到、焦點環可見
4. 嘗試用 `Enter` / `Space` 觸發按鈕，`Esc` 關模態
5. 表格 / 下拉選單 / 日期選擇器特別容易漏，要個別確認

---

## 交付時的指標摘要

完整版可選擇產出 `validation-report.md`；簡化版直接在交付訊息附：

```markdown
## 驗收指標摘要

**自動化**
- Lighthouse A11y: 98 ✅
- Lighthouse Performance: 89 ✅
- Lighthouse Best Practices: 96 ✅

**手動**
- 對比度：12 組文字組合全通過 AA ✅
- 鍵盤可達：全部互動元件可達 ✅
- 響應式：320 / 768 / 1024 / 1440px 皆無溢出 ✅
- 主題切換：light / dark / system 無破圖 ✅
- Console：主要路徑零錯誤 ✅

**已知例外**
- （若有，例如「背景影片在 reduce motion 下停在第 1 幀，不是淡出」）
```

---

## 指標 vs 品味的取捨

**指標不會告訴你設計好不好看**，只會告訴你**哪裡客觀失敗**。

- 對比通過 ≠ 配色好看
- Lighthouse 95 ≠ 體驗驚艷
- 所有狀態都有 ≠ 互動順暢

**量化是地板，不是天花板**。地板以上的品質靠品味、變體探索、審美判斷。

同時，**品味也不能推翻硬指標**：「這個 muted 灰比較美但對比 3.8:1」**不行** —— 找一個既美又通過的灰。用 `oklch()` 微調 L 值通常 5 分鐘內能找到兼顧的解。

---

## 常見陷阱

- **「我用 `outline: none` 因為不好看」** → 改成 `outline: none; box-shadow: 0 0 0 3px var(--ring);` 自訂焦點
- **「這個圖示不需要 alt 吧」** → 有語意就 `aria-label`，純裝飾就 `alt=""`
- **「Lighthouse 跑不出 95 分是檔案太大」** → 檢查是否載了不必要的 CDN（Tailwind、Framer Motion、過大 icon font）
- **「動畫一定要有，不能降級」** → 把位移動畫換成 opacity 變化，即便 reduce motion 下也能保留回饋
- **「對比跑不到 4.5 但設計師說這樣才好看」** → 用 `oklch()` 微調 L 值，通常能兼顧
