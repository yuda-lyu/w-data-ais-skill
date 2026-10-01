# 三段式主題（light / dark / system）樣板 —— React / Vue 3 / Vue 2

> SKILL.md 把「light / dark / system 三段式 + localStorage 記憶 + 不寫死 hex（用 CSS 變數／`data-theme`）」列為**所有產物的硬性交付項**。三框架（React / Vue 3 / Vue 2）的主題邏輯**語意一致**：同樣三態、同樣 localStorage key（`'theme'`）、同樣以 `document.documentElement.dataset.theme` 套用，只是各框架語法不同。
>
> 本檔取代 L1 基底（role-design-web-for-prototype）各 patterns 檔中的「Dark Mode」兩段式樣板 —— 本技能產物一律用三段式，不用兩段式。

## 色彩用 CSS custom properties（三框架共用，不在 JS 寫死 hex）

顏色由 `[data-theme]` 驅動的 CSS 變數決定，**不在 JS 端（React state／Vue `data()`／`setup()`）維護 hex 物件**。把這段放進 `<style>`（與 SKILL.md「主題系統硬規則」一致）：

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

- React（JSX）：`style={{ background: 'var(--bg)', color: 'var(--fg)' }}`
- Vue 3 / Vue 2（template）：`:style="{ background: 'var(--bg)', color: 'var(--fg)' }"`

---

## React：`useTheme` hook（三態狀態機）

```jsx
const THEMES = ['light', 'dark', 'system'];

// 回傳 { mode, setMode, isDark }
// - mode：'light' | 'dark' | 'system'（預設 'system'）
// - setMode：三態切換，寫入 <html data-theme> + localStorage
// - isDark：實際亮暗（system 模式看 prefers-color-scheme，否則看 mode）
const useTheme = () => {
  const [mode, setMode] = React.useState(() => {
    const saved = localStorage.getItem('theme');
    return THEMES.includes(saved) ? saved : 'system'; // 無記錄則 system
  });
  const [isDark, setIsDark] = React.useState(false);

  React.useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = mode;          // 套用：設 data-theme（CSS 變數控色）
    localStorage.setItem('theme', mode); // 記憶：存使用者選擇

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => setIsDark(mode === 'system' ? mq.matches : mode === 'dark');
    apply();

    if (mode !== 'system') return;       // 非 system 不跟隨系統
    mq.addEventListener('change', apply); // system：即時跟隨 OS 亮暗
    return () => mq.removeEventListener('change', apply);
  }, [mode]);

  return { mode, setMode, isDark };
};

window.useTheme = useTheme;
```

### 三段切換 UI（放進 Tweaks 面板）

```jsx
const ThemeSwitch = ({ mode, setMode }) => (
  <div role="radiogroup" aria-label="Theme" style={{ display: 'flex', gap: 4 }}>
    {['light', 'dark', 'system'].map(m => (
      <button
        key={m}
        role="radio"
        aria-checked={mode === m}
        onClick={() => setMode(m)}
        style={{
          flex: 1,
          padding: '6px 8px',
          minHeight: 44,
          borderRadius: 6,
          border: '1px solid var(--border)',
          background: mode === m ? 'var(--primary)' : 'transparent',
          color: mode === m ? '#fff' : 'var(--fg)',
          cursor: 'pointer'
        }}
      >
        {m}
      </button>
    ))}
  </div>
);
```

使用：

```jsx
// const { mode, setMode, isDark } = window.useTheme();
// 頂層容器用 CSS 變數：<div style={{ background: 'var(--bg)', color: 'var(--fg)' }}>
// Tweaks 面板內放 <ThemeSwitch mode={mode} setMode={setMode} />
```

---

## Vue 3：`useTheme` composable（三態狀態機）

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

---

## Vue 2：`ThemeMixin`（三態狀態機）

Vue 2 沒有 composable —— 用 mixin 複用主題邏輯（與 patterns-vue2.md 的 `TimeMixin` 同模式）。`mode` 須在 `data()` 預先宣告才有反應式：

```js
const THEMES = ['light', 'dark', 'system'];

// 提供 mode / isDark / setTheme(mode)
// - mode：'light' | 'dark' | 'system'（預設 'system'）
// - setTheme：三態切換，寫入 <html data-theme> + localStorage
// - isDark：實際亮暗（system 模式看 prefers-color-scheme，否則看 mode）
const ThemeMixin = {
  data() {
    const saved = localStorage.getItem('theme');
    return {
      mode: THEMES.includes(saved) ? saved : 'system', // 無記錄則 system
      isDark: false,
      _mq: null,
      _mqHandler: null
    };
  },
  watch: {
    mode: { immediate: true, handler(m) { this._applyTheme(m); } }
  },
  beforeDestroy() {
    if (this._mq && this._mqHandler) this._mq.removeEventListener('change', this._mqHandler);
  },
  methods: {
    _applyTheme(m) {
      document.documentElement.dataset.theme = m; // 套用：設 data-theme（CSS 變數控色）
      localStorage.setItem('theme', m);           // 記憶：存使用者選擇

      if (!this._mq) this._mq = window.matchMedia('(prefers-color-scheme: dark)');
      const apply = () => { this.isDark = (m === 'system' ? this._mq.matches : m === 'dark'); };
      apply();

      // 重掛 system 監聽：非 system 不跟隨
      if (this._mqHandler) { this._mq.removeEventListener('change', this._mqHandler); this._mqHandler = null; }
      if (m === 'system') { this._mqHandler = apply; this._mq.addEventListener('change', this._mqHandler); }
    },
    setTheme(m) { if (THEMES.includes(m)) this.mode = m; }
  }
};

window.ThemeMixin = ThemeMixin;
```

### 三段切換元件（放進 Tweaks 面板）

用 `value` + `input`（Vue 2 `v-model` 慣例）綁定 `mode`：

```js
const ThemeSwitch = {
  props: { value: { type: String, required: true } },
  data() {
    return { options: ['light', 'dark', 'system'] };
  },
  methods: {
    btnStyle(m) {
      return {
        flex: 1,
        padding: '6px 8px',
        minHeight: '44px',
        borderRadius: '6px',
        border: '1px solid var(--border)',
        background: this.value === m ? 'var(--primary)' : 'transparent',
        color: this.value === m ? '#fff' : 'var(--fg)',
        cursor: 'pointer'
      };
    }
  },
  template: `
    <div role="radiogroup" aria-label="Theme" style="display:flex; gap:4px">
      <button v-for="m in options" :key="m" role="radio"
        :aria-checked="value === m" :style="btnStyle(m)" @click="$emit('input', m)">
        {{ m }}
      </button>
    </div>
  `
};

Vue.component('theme-switch', ThemeSwitch);
window.ThemeSwitch = ThemeSwitch;
```

使用方式（根實例混入 `ThemeMixin`）：

```js
new Vue({
  el: '#app',
  mixins: [window.ThemeMixin],
  computed: {
    rootStyle() {
      return { background: 'var(--bg)', color: 'var(--fg)', minHeight: '100vh' };
    }
  },
  template: `
    <div :style="rootStyle">
      <theme-switch :value="mode" @input="setTheme" />
    </div>
  `
});
```

---

> **三框架一致性**：React 用 `useState` + `useEffect`、Vue 3 用 `ref` + `watch`、Vue 2 用 `data` + `watch`，但三態名稱、`'theme'` localStorage key、`data-theme` 套用機制、system 監聽行為完全相同。
