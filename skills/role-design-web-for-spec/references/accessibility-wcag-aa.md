# WCAG AA 合規硬檢查

role-design-web-for-spec 將無障礙列為**硬性交付項**。本檔定義具體檢查項、量測方式、實作範例。

基準：WCAG 2.1 AA。不追求 AAA（那會犧牲設計表現力）。

---

## 硬性項（全部必過）

### 1. 對比度

| 元素類型 | 最低對比度 |
|---|---|
| 正常文字（< 18.66px bold 或 < 24px regular） | **4.5:1** |
| 大文字（≥ 18.66px bold 或 ≥ 24px regular） | **3:1** |
| 非文字元素（icon、分隔線、表單邊框、聚焦指示） | **3:1** |

**量測工具**：
- Chrome DevTools → Inspect element → Contrast ratio（彈出色票時自動顯示）
- WebAIM Contrast Checker：https://webaim.org/resources/contrastchecker/
- 開發時期內嵌 axe-core（見主 SKILL.md「常用 CDN」章節）

**oklch 快速記憶**：
- 淺色背景（L > 80%）配深色文字（L < 40%）通常過關
- 中間值（L 40%~60%）之間的組合要實測
- 彩度（C）過高時對比值會下降，慎用飽和色做大面積文字

---

### 2. 鍵盤可達性

**所有互動元件都要能用鍵盤操作。**

| 元件類型 | 必須支援的鍵 |
|---|---|
| 按鈕 | `Tab`（聚焦）+ `Enter` / `Space`（觸發） |
| 連結 | `Tab` + `Enter` |
| 表單欄位 | `Tab` + 對應按鍵（文字輸入、方向鍵選擇等） |
| 下拉選單 | `Tab` + `Enter`（展開）+ `↑↓`（移動）+ `Enter`（選取）+ `Esc`（關閉） |
| 模態對話框 | `Esc` 關閉；聚焦應鎖在對話框內（focus trap） |
| Tab 面板 | 方向鍵切換 panel |

**Tab 順序必須符合視覺順序**（用 `tabindex="0"` 補自訂元件，但**不要用 `tabindex > 0`**，會打亂順序）。

---

### 3. 焦點指示（`:focus-visible`）

**永遠不要寫 `outline: none` 而不補替代樣式。**

```css
/* ❌ 災難 */
button:focus { outline: none; }

/* ✅ 正確：自訂焦點指示 */
button:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

/* ✅ 或用 box-shadow 做更柔和的焦點環 */
button:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--focus-ring);
}
```

**焦點環的對比度也要 ≥ 3:1**（對背景）。

---

### 4. 語意 HTML

**用對的標籤**：

| 意圖 | 用這個 | 別用這個 |
|---|---|---|
| 點了有動作的東西 | `<button>` | `<div onClick>` |
| 導航 | `<a href>` | `<button onClick={navigate}>` |
| 頁面區塊 | `<header>` `<nav>` `<main>` `<aside>` `<footer>` `<section>` | 全部 `<div>` |
| 標題層級 | `<h1>`~`<h6>` 依視覺層級依序使用 | 用 CSS 假裝標題 |
| 清單 | `<ul>` `<ol>` `<li>` | 一堆 `<div>` |
| 表格資料 | `<table>` `<th>` `<td>` | CSS Grid 假裝 |
| 表單 | `<form>` `<label for>` `<input id>` | 缺 label 或 label 與 input 未關聯 |

---

### 5. 替代文字與 ARIA

| 元素 | 處理 |
|---|---|
| `<img>` 有意義 | 寫 `alt="描述內容"` |
| `<img>` 純裝飾 | 寫 `alt=""`（**不是省略 alt**） |
| icon-only 按鈕 | `aria-label="功能描述"` |
| 用 icon font 當按鈕 | 外層 `<button aria-label="...">` 包 icon |
| SVG icon | `<svg role="img" aria-label="..."><title>...</title>...</svg>` 或 `aria-hidden="true"` 搭配旁邊的文字 |
| 動態狀態變化（toast、loading 完成） | `aria-live="polite"`（非緊急）或 `aria-live="assertive"`（緊急） |
| 模態開啟時 | 背景用 `aria-hidden="true"` 或 `inert` |

**不濫用 ARIA**：第一選擇永遠是語意 HTML，ARIA 是補救。

---

### 6. 觸控目標

互動元件 **≥ 44×44 CSS px**（iOS HIG 與 WCAG 2.5.5 AA 建議）。

- 視覺上可以小，但可點擊區域要達到 44×44
- 用 `padding` 擴大熱區，或 `::before` 絕對定位補足
- 相鄰可點擊元件之間留 ≥ 8px 間隔

```css
/* 視覺小但點擊大的範例 */
.icon-button {
  width: 24px; height: 24px;
  padding: 10px;          /* 總熱區 44×44 */
  background: transparent;
}
```

---

### 7. prefers-reduced-motion

**尊重使用者的動畫偏好。**

```css
/* 預設動畫 */
.card {
  transition: transform 300ms ease, opacity 300ms ease;
}
.card:hover {
  transform: translateY(-4px);
}

/* 降級 */
@media (prefers-reduced-motion: reduce) {
  .card {
    transition: none;
  }
  .card:hover {
    transform: none;  /* 或保留極小變化 */
  }
}
```

**降級原則**：
- 取消位移、縮放、旋轉
- 取消 parallax、autoplay 影片
- 保留**狀態變化**（顏色、透明度）讓使用者仍能感知回饋
- 不是「全部停用」—— 功能性回饋要保留

---

### 8. 語系

```html
<html lang="zh-TW">
<!-- 或 lang="en" / lang="ja" 等 -->
```

**必填**。螢幕閱讀器靠這個決定發音。

### 9. 頁面標題

```html
<title>具體描述 | 產品名</title>
```

**不要**：
- `<title>Document</title>`
- `<title>Untitled</title>`
- 所有頁面共用同一個 title

---

## 自動化檢查

### Lighthouse（必做）

Chrome DevTools → Lighthouse → Accessibility。**目標分數 ≥ 95**。

### axe-core（開發時期建議）

```html
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

## 手動檢查清單

自動化工具只抓得到機械性問題，**這些要靠人**：

- [ ] 拔掉滑鼠，**只用鍵盤**走完主要路徑（包含模態、下拉選單、表格排序等）
- [ ] 開螢幕閱讀器（macOS: `⌘+F5` VoiceOver；Windows: NVDA）走一次，聽起來合理嗎？
- [ ] 把網頁縮放到 200%，版面還完整嗎？文字還能讀嗎？
- [ ] 切換到高對比模式（Windows 設定），關鍵元素還可見嗎？
- [ ] 關掉 CSS（DevTools → Rendering → Disable CSS），內容順序仍合理嗎？
- [ ] 色盲模擬（DevTools → Rendering → Emulate vision deficiencies），純靠顏色傳達的資訊還能區分嗎？

---

## 例外情境

若情境需要犧牲某項合規（如純展示簡報、藝術向作品），**明確標示**：

```markdown
## 無障礙例外聲明

此產物為 [情境]，以下項目刻意不符合 AA：
- [項目]：原因 [說明]
- 替代方案：[若有]
```

**不要默默跳過**。交付時明講，讓使用者知情決策。
