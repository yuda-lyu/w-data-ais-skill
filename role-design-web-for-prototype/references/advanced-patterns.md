# 進階參考：框架無關的樣板與資源

本檔收錄**與框架無關**的樣板與設計資源。框架專屬的元件樣板（React／Vue 3／Vue 2 版的裝置外框、Tweaks 面板、動畫引擎、ThemeProvider、設計畫布）請見：

- [react-patterns.md](react-patterns.md) —— React 18 + Babel inline JSX
- [vue3-patterns.md](vue3-patterns.md) —— Vue 3 + Composition API
- [vue2-patterns.md](vue2-patterns.md) —— Vue 2 + Options API

## 目錄

1. [響應式簡報引擎](#響應式簡報引擎)
2. [資料視覺化樣板](#資料視覺化樣板)
3. [配色系統最佳實踐（oklch）](#配色系統最佳實踐)
4. [字體建議](#字體建議)
5. [配色 × 字體搭配參考](#配色--字體搭配參考)

---

## 響應式簡報引擎

用來製作固定尺寸、自動適應任何 viewport 的簡報。**純 HTML + JS，不依賴框架**，可直接嵌入任何專案。

**關鍵約定**：
- 內部陣列使用 0-indexed，**但呈現給使用者的數字永遠是 1-indexed**
- 每個 `<section class="slide">` 加上 `data-screen-label="01 Title"`、`data-screen-label="02 Agenda"` 等標籤以便引用
- 控制按鈕放在 `.stage` 縮放容器**外部**，確保在小螢幕上仍可使用

```html
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { 
    background: #000; 
    display: flex; 
    align-items: center; 
    justify-content: center;
    height: 100vh;
    overflow: hidden;
    font-family: system-ui, sans-serif;
  }
  .stage {
    width: 1920px;
    height: 1080px;
    position: relative;
    transform-origin: center center;
  }
  .slide {
    position: absolute;
    inset: 0;
    display: none;
    padding: 80px;
  }
  .slide.active { display: flex; }
  .controls {
    position: fixed;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 12px;
    z-index: 1000;
  }
  .controls button {
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    background: rgba(255,255,255,0.15);
    color: white;
    cursor: pointer;
    font-size: 14px;
  }
  .slide-counter {
    position: fixed;
    bottom: 20px;
    right: 20px;
    color: rgba(255,255,255,0.6);
    font-size: 14px;
  }
</style>

<script>
  // 自動縮放適應
  function scaleStage() {
    const stage = document.querySelector('.stage');
    const scaleX = window.innerWidth / 1920;
    const scaleY = window.innerHeight / 1080;
    const scale = Math.min(scaleX, scaleY);
    stage.style.transform = `scale(${scale})`;
  }
  window.addEventListener('resize', scaleStage);
  scaleStage();

  // 投影片導覽
  let current = parseInt(localStorage.getItem('slideIndex') || '0');
  const slides = document.querySelectorAll('.slide');
  
  function showSlide(n) {
    current = Math.max(0, Math.min(n, slides.length - 1));
    slides.forEach((s, i) => s.classList.toggle('active', i === current));
    localStorage.setItem('slideIndex', current);
    // 呈現給使用者的是 1-indexed，內部儲存為 0-indexed
    document.querySelector('.slide-counter').textContent = `${current + 1} / ${slides.length}`;
  }
  
  document.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === ' ') showSlide(current + 1);
    if (e.key === 'ArrowLeft') showSlide(current - 1);
  });
  
  showSlide(current);
</script>
```

---

## 資料視覺化樣板

**優先順序（由高至低）**：

| 情境 | 推薦 | 理由 |
|---|---|---|
| 儀表板、複雜互動、大資料集 | **ECharts**（預設） | 2000+ 圖表類型、內建 zoom/pan/tooltip/legend、支援百萬級資料點、官方 dark theme |
| 小規模、快速拋棄式原型、簡單需求 | **Chart.js** | 輕量、API 最簡單、適合 Landing page 與單一 KPI 卡 |
| 完全客製視覺、藝術向資料藝術 | **D3.js**（見主檔 SKILL.md 常用 CDN 一節） | 最底層，學習曲線陡，但表現力最強 |

不確定時選 ECharts —— 它涵蓋 Chart.js 八成的使用情境，且從小圖表延伸到複雜儀表板不需換庫。

---

### ECharts（優先）

```html
<div id="chart" style="width: 100%; height: 400px;"></div>
<script src="https://cdn.jsdelivr.net/npm/echarts@5.5.1/dist/echarts.min.js"></script>
<script>
  // 初始化，第二參數為主題：'default' | 'dark' | 自訂 theme 名稱
  const chart = echarts.init(document.getElementById('chart'), 'default');

  chart.setOption({
    tooltip: { trigger: 'axis' },
    legend: { show: false },
    grid: { left: 40, right: 20, top: 20, bottom: 30 },
    xAxis: {
      type: 'category',
      boundaryGap: false,                  // line chart 慣例：緊貼軸端
      data: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
      axisLine: { lineStyle: { color: '#e5e7eb' } },
      axisLabel: { color: '#6b7280' }
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: '#f0f0f0' } },
      axisLabel: { color: '#6b7280' }
    },
    series: [{
      name: 'Revenue',
      type: 'line',
      smooth: true,
      data: [12, 19, 3, 5, 2, 3],
      lineStyle: { color: '#3b82f6', width: 2 },
      itemStyle: { color: '#3b82f6' },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: 'rgba(59, 130, 246, 0.25)' },
            { offset: 1, color: 'rgba(59, 130, 246, 0)' }
          ]
        }
      }
    }]
  });

  // 響應式：容器尺寸變動時重繪
  new ResizeObserver(() => chart.resize())
    .observe(document.getElementById('chart'));
</script>
```

**Dark Mode 切換**（配合 `prefers-color-scheme` 或 Tweaks 切換）：

```js
function applyTheme(isDark) {
  chart.dispose();                         // ECharts 切主題需重建實例
  const newChart = echarts.init(
    document.getElementById('chart'),
    isDark ? 'dark' : 'default'
  );
  newChart.setOption(option);              // 把上面的 option 抽成變數重用
  return newChart;
}

// 跟隨系統
window.matchMedia('(prefers-color-scheme: dark)')
  .addEventListener('change', e => applyTheme(e.matches));
```

**常用配置要點**：
- `tooltip.trigger: 'axis'`：折線／長條圖用，hover 軸上任意位置顯示所有 series
- `tooltip.trigger: 'item'`：散點／圓餅圖用，hover 單一資料點
- `dataZoom`：`[{ type: 'inside' }, { type: 'slider' }]` —— 時序大資料集必備
- `toolbox.feature.saveAsImage`：匯出 PNG（示範用）
- 大資料集：`large: true, largeThreshold: 2000` 啟用優化渲染路徑

---

### Chart.js（輕量替代）

```html
<canvas id="myChart" width="800" height="400"></canvas>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js"></script>
<script>
  const ctx = document.getElementById('myChart').getContext('2d');
  const chart = new Chart(ctx, {
    type: 'line', // bar、pie、doughnut、radar 等
    data: {
      labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
      datasets: [{
        label: 'Revenue',
        data: [12, 19, 3, 5, 2, 3],
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        tension: 0.4,
        fill: true
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: { beginAtZero: true, grid: { color: '#f0f0f0' } },
        x: { grid: { display: false } }
      }
    }
  });

  // 容器尺寸變動時重繪
  new ResizeObserver(() => chart.resize())
    .observe(document.querySelector('#myChart').parentElement);
</script>
```

---

## 配色系統最佳實踐

使用 oklch 定義和諧的配色系統 —— 相較於 hex/rgb，oklch 在亮度維度上是感知均勻的，衍生色階更自然：

```css
:root {
  /* 以 oklch 為基礎的配色系統 */
  --primary-h: 250;  /* 色相 */
  --primary: oklch(0.55 0.25 var(--primary-h));
  --primary-light: oklch(0.75 0.15 var(--primary-h));
  --primary-dark: oklch(0.35 0.2 var(--primary-h));
  
  /* 中性色 */
  --gray-50: oklch(0.98 0.002 250);
  --gray-100: oklch(0.96 0.004 250);
  --gray-200: oklch(0.92 0.006 250);
  --gray-300: oklch(0.87 0.008 250);
  --gray-400: oklch(0.71 0.01 250);
  --gray-500: oklch(0.55 0.014 250);
  --gray-600: oklch(0.45 0.014 250);
  --gray-700: oklch(0.37 0.014 250);
  --gray-800: oklch(0.27 0.014 250);
  --gray-900: oklch(0.21 0.014 250);
}
```

---

## 字體建議

> ⚠️ **以下為經驗性建議，不是硬規則。**
> - 永遠優先使用品牌或設計系統已指定的字體；只有當使用者未提供任何字體方案時才參考此表。
> - 唯一的硬規則：**避開 Inter／Roboto／Arial／Fraunces／system-ui —— 這些是 AI 生成內容濫用的字體**，一眼就會被認出「這是 AI 拼湊出來的」。
> - 挑字體時，專注於「個性契合」而非「流不流行」。下表列出常見的高品質選項，不是窮盡清單。

| 使用情境 | 推薦 | Google Fonts 名稱 |
|------|------|------------------|
| 現代感標題 | Plus Jakarta Sans | Plus+Jakarta+Sans |
| 優雅內文 | Outfit | Outfit |
| 技術感 | Space Grotesk | Space+Grotesk |
| 高端品牌 | Sora | Sora |
| 編輯感 | Newsreader | Newsreader |
| 手寫風 | Caveat | Caveat |
| 等寬／程式碼 | JetBrains Mono | JetBrains+Mono |

```html
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
```

---

## 配色 × 字體搭配參考

> ⚠️ **以下為經驗性搭配建議，不是硬規則。** 當你**完全沒有設計脈絡**時，挑一組作為起點 —— 遠勝於從 Inter + #3b82f6 起手。
> 一旦使用者提供品牌／設計系統／參考網站，立刻放下這個表，改依其素材。

用於快速建立有個性的視覺系統：

| 風格 | 主色（oklch） | 字體搭配 | 適用情境 |
|---|---|---|---|
| 現代科技 | `oklch(0.55 0.25 250)` 藍紫色 | Space Grotesk + Inter | SaaS、開發者工具、AI 產品 |
| 優雅編輯 | `oklch(0.35 0.10 30)` 暖棕色 | Newsreader + Outfit | 內容平台、部落格、編輯類 |
| 高端品牌 | `oklch(0.20 0.02 250)` 近黑 | Sora + Plus Jakarta Sans | 精品、顧問、金融 |
| 活潑消費 | `oklch(0.70 0.20 30)` 珊瑚色 | Plus Jakarta Sans + Outfit | 電商、生活風格、社群 |
| 極簡專業 | `oklch(0.50 0.15 200)` 青藍色 | Outfit + Space Grotesk | 資料產品、儀表板、B2B |
| 工藝溫暖 | `oklch(0.55 0.15 80)` 焦糖色 | Caveat（裝飾用） + Newsreader | 餐飲、教育、創意 |

避開這些組合：
- ❌ Inter + Roboto + 藍色按鈕（AI 味頂點）
- ❌ Fraunces + 紫粉漸層（用到爛）
- ❌ 超過三種字體家族（視覺混亂）
