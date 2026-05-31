# Vue 3 global build + Composition API：寫法與樣板

本檔為使用 **Vue 3（global build，無 build step）** 模式的專屬指南：CDN 設定、硬規則、對應樣板。

> 設計理念（工作流程、設計原則、placeholder 哲學、變體探索、避開 AI 味）見主檔 [SKILL.md](../SKILL.md) —— 本檔只講「怎麼寫 Vue 3 程式碼」。

## 目錄

1. [CDN 版本鎖定](#cdn-版本鎖定)
2. [四條不可妥協的硬規則](#四條不可妥協的硬規則)
3. [元件註冊](#元件註冊)
4. [其他注意事項](#其他注意事項)
5. [樣板：裝置模擬外框](#樣板裝置模擬外框)
6. [樣板：Tweaks 面板](#樣板tweaks-面板)
7. [樣板：動畫時間軸 composable](#樣板動畫時間軸-composable)
8. [樣板：設計畫布](#樣板設計畫布)
9. [樣板：三段式主題 composable（light / dark / system）](#樣板三段式主題-composablelight--dark--system)

---

## CDN 版本鎖定

使用**精確版本**的 `vue.global.js`（含 template compiler 的開發版）：

```html
<script src="https://unpkg.com/vue@3.5.13/dist/vue.global.js"></script>
```

⚠️ **版本選擇的關鍵差異**：

| 檔案 | 是否含 compiler | 是否開發版 | 用途 |
|---|---|---|---|
| `vue.global.js` ✅ | 含 | 開發版 | **設計原型首選** |
| `vue.global.prod.js` | 含 | 生產版 | 正式上線（缺 warning，不利除錯） |
| `vue.runtime.global.js` | **不含** | 開發版 | **不要用** —— 會編不了 template |
| `vue.esm-browser.js` | 含 | 開發版 | 走 ES modules `<script type="module">` 時用 |

**掛載範例**：

```html
<div id="app"></div>
<script>
  const { createApp, ref, computed, onMounted } = Vue;
  
  const App = {
    setup() {
      const message = ref('Hello Vue 3');
      return { message };
    },
    template: `<div>{{ message }}</div>`
  };
  
  createApp(App).mount('#app');
</script>
```

---

## 四條不可妥協的硬規則

### 1. 不能用 `<script setup>`

`<script setup>` 是 **compile-time 語法糖**，必須搭配 build tool（Vite／Webpack）。在 CDN + 無 build step 模式下**絕對無法使用** —— 改用 `setup()` option：

```js
// ❌ 錯誤（CDN 模式下會噴錯）
<script setup>
import { ref } from 'vue';
const count = ref(0);
</script>

// ✅ 正確：Composition API 透過 setup() option
const Counter = {
  setup() {
    const count = Vue.ref(0);
    return { count };
  },
  template: `<button @click="count++">{{ count }}</button>`
};
```

### 2. in-DOM template 的元件名要用 kebab-case

瀏覽器 HTML parser 會把所有標籤自動轉小寫，所以**在 template 字串或 in-DOM template 中引用元件必須用 kebab-case**：

```js
const IPhoneFrame = { /* ... */ };

// ✅ template 字串中用 kebab-case
createApp({
  components: { IPhoneFrame },
  template: `<iphone-frame>content</iphone-frame>`
}).mount('#app');

// ❌ template 字串中用 PascalCase 會失效
// template: `<IPhoneFrame>content</IPhoneFrame>`
```

> 如果走 `.vue` SFC（`vue3-sfc-loader`），則可以用 PascalCase —— 但 SFC 非本文件主場景。

### 3. 跨 `<script>` 區塊共用元件必須掛到 `window`

每個 `<script>` 是獨立執行環境，頂層宣告彼此看不到。需要跨檔共用：

```js
// 在 iphone-frame.js 結尾
window.IPhoneFrame = IPhoneFrame;

// 在主檔
createApp({
  components: { IPhoneFrame: window.IPhoneFrame },
  template: `<iphone-frame>...</iphone-frame>`
}).mount('#app');
```

或一次註冊為全域元件：

```js
const app = createApp(RootComponent);
app.component('iphone-frame', window.IPhoneFrame);
app.component('tweaks-panel', window.TweaksPanel);
app.mount('#app');
```

### 4. 不要使用 `scrollIntoView`

在 iframe 嵌入的預覽環境中，`element.scrollIntoView()` 會干擾外層捲動。改用 `element.scrollTop = ...` 或 `window.scrollTo({...})`。

---

## 元件註冊

**兩種註冊方式，依情境選用**：

```js
// 全域註冊：整個 app 都能用（適合 TweaksPanel、ThemeSwitch 這類貫穿元件）
const app = createApp(Root);
app.component('tweaks-panel', TweaksPanel);
app.mount('#app');

// 區域註冊：只在父元件內可用（適合只在特定頁面用的元件）
const Page = {
  components: { IPhoneFrame },
  template: `<iphone-frame>...</iphone-frame>`
};
```

> **避免過度全域註冊**：全域元件無法 tree-shake，原型階段還好，但若專案會長期迭代，區域註冊較乾淨。

---

## 其他注意事項

- **`data` 一律用 function**：Vue3（含根元件）的 `data` **都必須是 function 回傳 object**——Vue3 已移除 object 形式，傳 object 會觸發警告且不生效；元件更須如此以避免多實例共用狀態。若用 Composition API 的 `setup()` 則無此問題。
- **template 字串可以用 ES template literal**：`template: \`<div>\${foo}</div>\`` —— 但**不要用 JS 字串插值做動態內容**，改用 Vue 的 `{{ }}` 與 `v-bind`，否則失去反應性。
- **避免命名衝突**：不要用 `styles` 當變數／屬性名（同 SKILL.md 主檔通用規則）。

---

## 樣板：裝置模擬外框

### iPhone 外框

```js
const IPhoneFrame = {
  props: { title: { type: String, default: 'App' } },
  setup() {
    const containerStyle = {
      width: '390px',
      height: '844px',
      borderRadius: '48px',
      border: '12px solid #1a1a1a',
      overflow: 'hidden',
      position: 'relative',
      boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
      background: '#fff'
    };
    const statusBarStyle = {
      height: '54px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px',
      fontSize: '14px',
      fontWeight: 600
    };
    const notchStyle = {
      width: '126px',
      height: '34px',
      background: '#1a1a1a',
      borderRadius: '20px',
      position: 'absolute',
      left: '50%',
      transform: 'translateX(-50%)',
      top: '8px'
    };
    const contentStyle = { height: 'calc(100% - 54px)', overflow: 'auto' };
    const homeIndicatorStyle = {
      position: 'absolute',
      bottom: '8px',
      left: '50%',
      transform: 'translateX(-50%)',
      width: '134px',
      height: '5px',
      background: '#1a1a1a',
      borderRadius: '3px'
    };
    return { containerStyle, statusBarStyle, notchStyle, contentStyle, homeIndicatorStyle };
  },
  template: `
    <div :style="containerStyle">
      <div :style="statusBarStyle">
        <span>9:41</span>
        <div :style="notchStyle"></div>
        <span>⚡ 📶</span>
      </div>
      <div :style="contentStyle">
        <slot></slot>
      </div>
      <div :style="homeIndicatorStyle"></div>
    </div>
  `
};

window.IPhoneFrame = IPhoneFrame;
```

### 瀏覽器視窗外框

```js
const BrowserFrame = {
  props: {
    url: { type: String, default: 'https://example.com' },
    title: { type: String, default: 'Page' }
  },
  setup() {
    const wrapStyle = {
      borderRadius: '12px',
      overflow: 'hidden',
      boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
      border: '1px solid #e5e5e5'
    };
    const titleBarStyle = {
      background: '#f5f5f5',
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      borderBottom: '1px solid #e5e5e5'
    };
    const dotsWrapStyle = { display: 'flex', gap: '8px' };
    const dotStyle = (color) => ({
      width: '12px', height: '12px', borderRadius: '50%', background: color
    });
    const urlBarStyle = {
      flex: 1,
      background: '#fff',
      borderRadius: '6px',
      padding: '6px 12px',
      fontSize: '13px',
      color: '#666',
      border: '1px solid #e0e0e0'
    };
    const contentStyle = { background: '#fff' };
    return { wrapStyle, titleBarStyle, dotsWrapStyle, dotStyle, urlBarStyle, contentStyle };
  },
  template: `
    <div :style="wrapStyle">
      <div :style="titleBarStyle">
        <div :style="dotsWrapStyle">
          <div :style="dotStyle('#ff5f57')"></div>
          <div :style="dotStyle('#febc2e')"></div>
          <div :style="dotStyle('#28c840')"></div>
        </div>
        <div :style="urlBarStyle">{{ url }}</div>
      </div>
      <div :style="contentStyle">
        <slot></slot>
      </div>
    </div>
  `
};

window.BrowserFrame = BrowserFrame;
```

---

## 樣板：Tweaks 面板

使用 `v-model:config` 實現雙向綁定：

```js
const TweaksPanel = {
  props: {
    config: { type: Object, required: true },
    visible: { type: Boolean, default: true }
  },
  emits: ['update:config'],
  setup(props, { emit }) {
    const panelStyle = {
      position: 'fixed',
      bottom: '20px',
      right: '20px',
      width: '280px',
      background: 'rgba(24, 24, 27, 0.95)',
      backdropFilter: 'blur(12px)',
      borderRadius: '12px',
      padding: '16px',
      color: '#fff',
      fontSize: '13px',
      zIndex: 9999,
      boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      border: '1px solid rgba(255,255,255,0.1)'
    };
    const titleStyle = { fontWeight: 600, marginBottom: '12px', fontSize: '14px' };
    const itemStyle = { marginBottom: '12px' };
    const labelStyle = { display: 'block', marginBottom: '4px', opacity: 0.7 };
    const textInputStyle = {
      width: '100%',
      background: 'rgba(255,255,255,0.1)',
      border: '1px solid rgba(255,255,255,0.2)',
      borderRadius: '4px',
      padding: '4px 8px',
      color: '#fff'
    };

    const update = (key, value) => {
      emit('update:config', { ...props.config, [key]: value });
    };
    const typeOf = (v) => {
      if (typeof v === 'boolean') return 'boolean';
      if (typeof v === 'number') return 'number';
      if (typeof v === 'string' && v.startsWith('#')) return 'color';
      return 'text';
    };

    return { panelStyle, titleStyle, itemStyle, labelStyle, textInputStyle, update, typeOf };
  },
  template: `
    <div v-if="visible" :style="panelStyle">
      <div :style="titleStyle">Tweaks</div>
      <div v-for="(value, key) in config" :key="key" :style="itemStyle">
        <label :style="labelStyle">{{ key }}</label>
        <input v-if="typeOf(value) === 'boolean'" type="checkbox"
          :checked="value"
          @change="update(key, $event.target.checked)" />
        <input v-else-if="typeOf(value) === 'number'" type="range"
          min="0" max="100"
          :value="value"
          @input="update(key, Number($event.target.value))"
          style="width: 100%" />
        <input v-else-if="typeOf(value) === 'color'" type="color"
          :value="value"
          @input="update(key, $event.target.value)" />
        <input v-else type="text"
          :value="value"
          @input="update(key, $event.target.value)"
          :style="textInputStyle" />
      </div>
    </div>
  `
};

window.TweaksPanel = TweaksPanel;
```

使用方式：

```js
const App = {
  components: { TweaksPanel: window.TweaksPanel },
  setup() {
    const config = Vue.ref({
      primary: '#3b82f6',
      dark: false,
      scale: 50
    });
    return { config };
  },
  template: `
    <tweaks-panel v-model:config="config" />
  `
};
```

---

## 樣板：動畫時間軸 composable

```js
function useTime(duration = 5000) {
  const { ref, onMounted, onUnmounted, watch } = Vue;
  const time = ref(0);
  const playing = ref(true);
  let frameId = null;
  let startTime = null;

  const tick = (timestamp) => {
    if (!startTime) startTime = timestamp;
    const elapsed = (timestamp - startTime) % duration;
    time.value = elapsed / duration; // 0 到 1
    frameId = requestAnimationFrame(tick);
  };

  const start = () => {
    if (frameId) return;
    startTime = null;
    frameId = requestAnimationFrame(tick);
  };
  const stop = () => {
    if (frameId) cancelAnimationFrame(frameId);
    frameId = null;
  };

  onMounted(() => { if (playing.value) start(); });
  onUnmounted(stop);
  watch(playing, (v) => { v ? start() : stop(); });

  return { time, playing };
}

const Easing = {
  linear: t => t,
  easeInOut: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  easeOut: t => 1 - Math.pow(1 - t, 3),
  easeIn: t => t * t * t,
  spring: t => 1 - Math.pow(Math.E, -6 * t) * Math.cos(8 * t)
};

const interpolate = (t, from, to, easing = Easing.easeInOut) => {
  const progress = easing(Math.max(0, Math.min(1, t)));
  return from + (to - from) * progress;
};

window.useTime = useTime;
window.Easing = Easing;
window.interpolate = interpolate;
```

使用範例（注意 `time` 是 ref，template 中自動解包，在 computed 中要用 `.value`）：

```js
const Demo = {
  setup() {
    const { time } = window.useTime(3000);
    const opacity = Vue.computed(() => window.interpolate(time.value, 0, 1));
    const x = Vue.computed(() => window.interpolate(time.value, -100, 0, window.Easing.spring));
    const boxStyle = Vue.computed(() => ({
      opacity: opacity.value,
      transform: `translateX(${x.value}px)`
    }));
    return { boxStyle };
  },
  template: `<div :style="boxStyle">Hello</div>`
};
```

---

## 樣板：設計畫布

```js
const DesignCanvas = {
  props: {
    options: { type: Array, required: true },
    columns: { type: Number, default: 3 }
  },
  setup(props) {
    const letterOf = (i) => String.fromCharCode(65 + i);
    const wrapStyle = Vue.computed(() => ({
      display: 'grid',
      gridTemplateColumns: `repeat(${props.columns}, 1fr)`,
      gap: '24px',
      padding: '40px',
      background: '#f8f9fa',
      minHeight: '100vh'
    }));
    const cardStyle = {
      background: '#fff',
      borderRadius: '12px',
      overflow: 'hidden',
      boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
    };
    const cardHeaderStyle = {
      padding: '12px 16px',
      borderBottom: '1px solid #eee',
      fontSize: '13px',
      fontWeight: 600,
      color: '#666'
    };
    const cardBodyStyle = { padding: '16px' };
    return { letterOf, wrapStyle, cardStyle, cardHeaderStyle, cardBodyStyle };
  },
  template: `
    <div :style="wrapStyle">
      <div v-for="(option, i) in options" :key="i" :style="cardStyle">
        <div :style="cardHeaderStyle">
          Option {{ letterOf(i) }}: {{ option.label }}
        </div>
        <div :style="cardBodyStyle">
          <component v-if="typeof option.content === 'object'" :is="option.content" />
          <template v-else>{{ option.content }}</template>
        </div>
      </div>
    </div>
  `
};

window.DesignCanvas = DesignCanvas;
```

---

## 樣板：三段式主題 composable（light / dark / system）

> SKILL.md 把「light / dark / system 三段式 + localStorage 記憶 + 不寫死 hex（用 CSS 變數／`data-theme`）」列為**所有產物的硬性交付項**。三框架（React / Vue 3 / Vue 2）的主題邏輯**語意一致**：同樣三態、同樣 localStorage key（`'theme'`）、同樣以 `document.documentElement.dataset.theme` 套用，只是各框架語法不同。

### 色彩用 CSS custom properties（不在 JS 寫死 hex）

顏色由 `[data-theme]` 驅動的 CSS 變數決定，**不在 `data()`／`setup()` 維護 hex 物件**。把這段放進 `<style>`（與 SKILL.md「主題系統硬規則」一致）：

```css
:root {
  /* light 預設 tokens */
  --bg: oklch(98% 0.01 250);
  --surface: oklch(96% 0.01 250);
  --border: oklch(90% 0.01 250);
  --fg: oklch(20% 0.02 250);
  --fg-muted: oklch(45% 0.02 250);
  --primary: oklch(55% 0.18 255);
}
[data-theme="dark"] {
  --bg: oklch(15% 0.02 250);
  --surface: oklch(20% 0.02 250);
  --border: oklch(30% 0.02 250);
  --fg: oklch(95% 0.01 250);
  --fg-muted: oklch(70% 0.02 250);
  --primary: oklch(70% 0.16 255);
}
/* system（未顯式指定 light/dark）時，跟隨 OS 偏好 */
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]):not([data-theme="dark"]) {
    --bg: oklch(15% 0.02 250);
    --surface: oklch(20% 0.02 250);
    --border: oklch(30% 0.02 250);
    --fg: oklch(95% 0.01 250);
    --fg-muted: oklch(70% 0.02 250);
    --primary: oklch(70% 0.16 255);
  }
}
```

template 裡用 `var(--bg)` 等變數，而非 hex：`:style="{ background: 'var(--bg)', color: 'var(--fg)' }"`。

### `useTheme` composable：三態狀態機

```js
const THEMES = ['light', 'dark', 'system'];

// 回傳 { mode, isDark, setMode }
// - mode（ref）：'light' | 'dark' | 'system'（預設 'system'）
// - setMode：三態切換，寫入 <html data-theme> + localStorage
// - isDark（ref）：實際亮暗（system 模式看 prefers-color-scheme，否則看 mode）
function useTheme() {
  const { ref, watch, onUnmounted } = Vue;
  const saved = localStorage.getItem('theme');
  const mode = ref(THEMES.includes(saved) ? saved : 'system'); // 無記錄則 system
  const isDark = ref(false);

  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  let off = null; // system 模式下掛的 change handler

  watch(mode, (m) => {
    document.documentElement.dataset.theme = m; // 套用：設 data-theme（CSS 變數控色）
    localStorage.setItem('theme', m);           // 記憶：存使用者選擇

    const apply = () => { isDark.value = m === 'system' ? mq.matches : m === 'dark'; };
    apply();

    if (off) { mq.removeEventListener('change', off); off = null; }
    if (m === 'system') { off = apply; mq.addEventListener('change', off); } // 非 system 不跟隨
  }, { immediate: true });

  onUnmounted(() => { if (off) mq.removeEventListener('change', off); });

  const setMode = (m) => { if (THEMES.includes(m)) mode.value = m; };
  return { mode, isDark, setMode };
}

window.useTheme = useTheme;
```

### 三段切換 UI（放進 Tweaks 面板）

```js
const ThemeSwitch = {
  props: { mode: { type: String, required: true } },
  emits: ['update:mode'],
  setup(props, { emit }) {
    const options = ['light', 'dark', 'system'];
    const btnStyle = (m) => ({
      flex: 1,
      padding: '6px 8px',
      minHeight: '44px',
      borderRadius: '6px',
      border: '1px solid var(--border)',
      background: props.mode === m ? 'var(--primary)' : 'transparent',
      color: props.mode === m ? '#fff' : 'var(--fg)',
      cursor: 'pointer'
    });
    return { options, btnStyle, pick: (m) => emit('update:mode', m) };
  },
  template: `
    <div role="radiogroup" aria-label="Theme" style="display:flex; gap:4px">
      <button v-for="m in options" :key="m" role="radio"
        :aria-checked="mode === m" :style="btnStyle(m)" @click="pick(m)">
        {{ m }}
      </button>
    </div>
  `
};

window.ThemeSwitch = ThemeSwitch;
```

使用方式：

```js
const App = {
  components: { ThemeSwitch: window.ThemeSwitch },
  setup() {
    const { mode, isDark, setMode } = window.useTheme();
    const rootStyle = { background: 'var(--bg)', color: 'var(--fg)', minHeight: '100vh' };
    return { mode, isDark, setMode, rootStyle };
  },
  template: `
    <div :style="rootStyle">
      <theme-switch :mode="mode" @update:mode="setMode" />
    </div>
  `
};
```

> **三框架一致性**：React 用 `useState` + `useEffect`、Vue 3 用 `ref` + `watch`、Vue 2 用 `data` + `watch`，但三態名稱、`'theme'` localStorage key、`data-theme` 套用機制、system 監聽行為完全相同 —— 對照 [patterns-react.md](patterns-react.md) 與 [patterns-vue2.md](patterns-vue2.md) 的同名樣板。
