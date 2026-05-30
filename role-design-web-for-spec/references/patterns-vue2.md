# Vue 2 + Options API：寫法與樣板

本檔為使用 **Vue 2（CDN，無 build step）+ Options API** 模式的專屬指南：CDN 設定、硬規則、對應樣板。

> 設計理念（工作流程、設計原則、placeholder 哲學、變體探索、避開 AI 味）見主檔 [SKILL.md](../SKILL.md) —— 本檔只講「怎麼寫 Vue 2 程式碼」。

## 目錄

1. [CDN 版本鎖定](#cdn-版本鎖定)
2. [五條不可妥協的硬規則](#五條不可妥協的硬規則)
3. [元件註冊](#元件註冊)
4. [其他注意事項](#其他注意事項)
5. [樣板：裝置模擬外框](#樣板裝置模擬外框)
6. [樣板：Tweaks 面板](#樣板tweaks-面板)
7. [樣板：動畫時間軸 mixin](#樣板動畫時間軸-mixin)
8. [樣板：設計畫布](#樣板設計畫布)
9. [樣板：三段式主題（light / dark / system）](#樣板三段式主題light--dark--system)

---

## CDN 版本鎖定

使用 Vue 2 的**最終版本**（`2.7.16`）開發版：

```html
<script src="https://unpkg.com/vue@2.7.16/dist/vue.js"></script>
```

⚠️ **版本差異**：

| 檔案 | 是否含 compiler | 是否開發版 | 用途 |
|---|---|---|---|
| `vue.js` ✅ | 含 | 開發版 | **設計原型首選**（含 warning 與 devtools 支援） |
| `vue.min.js` | 含 | 生產版 | 正式上線（缺 warning，不利除錯） |
| `vue.runtime.js` | **不含** | 開發版 | **不要用** —— 會編不了 template |

**掛載範例**：

```html
<div id="app"></div>
<script>
  new Vue({
    el: '#app',
    data() {
      return { message: 'Hello Vue 2' };
    },
    template: `<div>{{ message }}</div>`
  });
</script>
```

---

## 五條不可妥協的硬規則

### 1. 元件的 `data` 必須是 function

根實例（`new Vue({...})`）的 `data` 可以是 object，但**元件的 `data` 必須是 function**，否則多個實例會共用同一份狀態：

```js
// ✅ 正確
Vue.component('counter', {
  data() {
    return { count: 0 };
  },
  template: `<button @click="count++">{{ count }}</button>`
});

// ❌ 錯誤：多個 <counter> 會共用同一個 count
Vue.component('counter', {
  data: { count: 0 },
  // ...
});
```

### 2. 新屬性必須在 `data()` 初始化時就存在

Vue 2 用 `Object.defineProperty` 遞迴轉換 data 為 getter/setter —— **初始化後新增的屬性不會是反應式**。事後新增要用 `Vue.set` / `this.$set`：

```js
data() {
  return {
    user: { name: 'Alice' }  // 必須把會用到的欄位預留好
  };
},
methods: {
  addAge() {
    // ❌ 錯誤：this.user.age = 30 —— 不會觸發更新
    this.$set(this.user, 'age', 30);  // ✅ 正確
  }
}
```

**策略**：`data()` 裡預先列出所有會用到的欄位，未定值用 `null`／空字串／空物件佔位。

### 3. 陣列變動要用 mutation methods 或 `Vue.set`

`arr[idx] = val` 與 `arr.length = newLen` 都不會觸發更新：

```js
// ❌ 錯誤
this.items[2] = newItem;
this.items.length = 0;

// ✅ 正確
this.$set(this.items, 2, newItem);
this.items.splice(0);
this.items = [];  // 直接指派新陣列也 OK
// 或用 push / pop / shift / unshift / splice / sort / reverse
```

### 4. template 必須有單一根元素

Vue 2 的 template 必須包一個 root element（Vue 3 才開始支援 fragments）：

```js
// ❌ 錯誤（Vue 2 無法編譯）
template: `
  <div>A</div>
  <div>B</div>
`

// ✅ 正確
template: `
  <div>
    <div>A</div>
    <div>B</div>
  </div>
`
```

### 5. 不要使用 `scrollIntoView`

在 iframe 嵌入的預覽環境中，`element.scrollIntoView()` 會干擾外層捲動。改用 `element.scrollTop = ...` 或 `window.scrollTo({...})`。

---

## 元件註冊

**兩種註冊方式，依情境選用**：

```js
// 全域註冊：整個 app 都能用
Vue.component('tweaks-panel', TweaksPanel);

// 區域註冊：只在父元件內可用
const Page = {
  components: { IPhoneFrame },
  template: `<iphone-frame>...</iphone-frame>`
};
```

**命名**：元件名在 template 中用 kebab-case（PascalCase 也行但 in-DOM template 會轉小寫，慣例一律用 kebab-case）。

**跨 `<script>` 共用**：檔尾掛到 `window`（與 Vue 3 相同）：

```js
const IPhoneFrame = { /* ... */ };
window.IPhoneFrame = IPhoneFrame;

// 或直接全域註冊一次搞定
Vue.component('iphone-frame', IPhoneFrame);
```

---

## 其他注意事項

- **Composition API（2.7+ backport）**：Vue 2.7 內建 Composition API（`setup()`、`ref`、`computed`、`watch`）—— 可用，但若目標是**維護舊 Vue 2 專案**，建議照原專案慣例用 Options API；若是新寫則應該改用 Vue 3。
- **`v-model` 差異**：Vue 2 的 `v-model` 預設 `value` + `input`；Vue 3 改為 `modelValue` + `update:modelValue`，且支援多個 `v-model`。樣板中若需雙向綁定，請用 Vue 2 寫法（`props: ['value']`、`$emit('input', ...)`）。
- **不要用 `styles` 當變數／屬性名**（同 SKILL.md 主檔通用規則）。

---

## 樣板：裝置模擬外框

### iPhone 外框

```js
const IPhoneFrame = {
  props: {
    title: { type: String, default: 'App' }
  },
  data() {
    return {
      containerStyle: {
        width: '390px',
        height: '844px',
        borderRadius: '48px',
        border: '12px solid #1a1a1a',
        overflow: 'hidden',
        position: 'relative',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
        background: '#fff'
      },
      statusBarStyle: {
        height: '54px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        fontSize: '14px',
        fontWeight: 600
      },
      notchStyle: {
        width: '126px',
        height: '34px',
        background: '#1a1a1a',
        borderRadius: '20px',
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        top: '8px'
      },
      contentStyle: { height: 'calc(100% - 54px)', overflow: 'auto' },
      homeIndicatorStyle: {
        position: 'absolute',
        bottom: '8px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '134px',
        height: '5px',
        background: '#1a1a1a',
        borderRadius: '3px'
      }
    };
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

Vue.component('iphone-frame', IPhoneFrame);
window.IPhoneFrame = IPhoneFrame;
```

### 瀏覽器視窗外框

```js
const BrowserFrame = {
  props: {
    url: { type: String, default: 'https://example.com' },
    title: { type: String, default: 'Page' }
  },
  data() {
    return {
      wrapStyle: {
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
        border: '1px solid #e5e5e5'
      },
      titleBarStyle: {
        background: '#f5f5f5',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        borderBottom: '1px solid #e5e5e5'
      },
      dotsWrapStyle: { display: 'flex', gap: '8px' },
      urlBarStyle: {
        flex: 1,
        background: '#fff',
        borderRadius: '6px',
        padding: '6px 12px',
        fontSize: '13px',
        color: '#666',
        border: '1px solid #e0e0e0'
      },
      contentStyle: { background: '#fff' }
    };
  },
  methods: {
    dotStyle(color) {
      return { width: '12px', height: '12px', borderRadius: '50%', background: color };
    }
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

Vue.component('browser-frame', BrowserFrame);
window.BrowserFrame = BrowserFrame;
```

---

## 樣板：Tweaks 面板

Vue 2 的 `v-model` 綁 `value`／`input`。若要綁到物件的某個 key，外層用 `:config` + `@update:config`：

```js
const TweaksPanel = {
  props: {
    config: { type: Object, required: true },
    visible: { type: Boolean, default: true }
  },
  data() {
    return {
      panelStyle: {
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
      },
      titleStyle: { fontWeight: 600, marginBottom: '12px', fontSize: '14px' },
      itemStyle: { marginBottom: '12px' },
      labelStyle: { display: 'block', marginBottom: '4px', opacity: 0.7 },
      textInputStyle: {
        width: '100%',
        background: 'rgba(255,255,255,0.1)',
        border: '1px solid rgba(255,255,255,0.2)',
        borderRadius: '4px',
        padding: '4px 8px',
        color: '#fff'
      }
    };
  },
  methods: {
    update(key, value) {
      this.$emit('update:config', { ...this.config, [key]: value });
    },
    typeOf(v) {
      if (typeof v === 'boolean') return 'boolean';
      if (typeof v === 'number') return 'number';
      if (typeof v === 'string' && v.startsWith('#')) return 'color';
      return 'text';
    }
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

Vue.component('tweaks-panel', TweaksPanel);
window.TweaksPanel = TweaksPanel;
```

使用方式：

```js
new Vue({
  el: '#app',
  data() {
    return {
      config: { primary: '#3b82f6', dark: false, scale: 50 }
    };
  },
  template: `
    <div>
      <tweaks-panel :config="config" @update:config="config = $event" />
    </div>
  `
});
```

> Vue 2.3+ 支援 `.sync` 修飾詞：`<tweaks-panel :config.sync="config" />`，行為等同於上面的 `:config` + `@update:config`。

---

## 樣板：動畫時間軸 mixin

Vue 2 沒有 composable —— 用 mixin 或 plugin 達到邏輯複用：

```js
const TimeMixin = {
  props: {
    duration: { type: Number, default: 5000 }
  },
  data() {
    return {
      time: 0,
      playing: true,
      _frameId: null,
      _startTime: null
    };
  },
  watch: {
    playing(v) { v ? this._startAnim() : this._stopAnim(); }
  },
  mounted() {
    if (this.playing) this._startAnim();
  },
  beforeDestroy() {
    this._stopAnim();
  },
  methods: {
    _tick(timestamp) {
      if (!this._startTime) this._startTime = timestamp;
      const elapsed = (timestamp - this._startTime) % this.duration;
      this.time = elapsed / this.duration; // 0 到 1
      this._frameId = requestAnimationFrame(this._tick);
    },
    _startAnim() {
      if (this._frameId) return;
      this._startTime = null;
      this._frameId = requestAnimationFrame(this._tick);
    },
    _stopAnim() {
      if (this._frameId) cancelAnimationFrame(this._frameId);
      this._frameId = null;
    }
  }
};

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

window.TimeMixin = TimeMixin;
window.Easing = Easing;
window.interpolate = interpolate;
```

使用範例：

```js
Vue.component('demo', {
  mixins: [window.TimeMixin],
  computed: {
    opacity() { return window.interpolate(this.time, 0, 1); },
    x() { return window.interpolate(this.time, -100, 0, window.Easing.spring); },
    boxStyle() {
      return {
        opacity: this.opacity,
        transform: `translateX(${this.x}px)`
      };
    }
  },
  template: `<div :style="boxStyle">Hello</div>`
});
```

---

## 樣板：設計畫布

```js
const DesignCanvas = {
  props: {
    options: { type: Array, required: true },
    columns: { type: Number, default: 3 }
  },
  data() {
    return {
      cardStyle: {
        background: '#fff',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      },
      cardHeaderStyle: {
        padding: '12px 16px',
        borderBottom: '1px solid #eee',
        fontSize: '13px',
        fontWeight: 600,
        color: '#666'
      },
      cardBodyStyle: { padding: '16px' }
    };
  },
  computed: {
    wrapStyle() {
      return {
        display: 'grid',
        gridTemplateColumns: `repeat(${this.columns}, 1fr)`,
        gap: '24px',
        padding: '40px',
        background: '#f8f9fa',
        minHeight: '100vh'
      };
    }
  },
  methods: {
    letterOf(i) { return String.fromCharCode(65 + i); }
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

Vue.component('design-canvas', DesignCanvas);
window.DesignCanvas = DesignCanvas;
```

---

## 樣板：三段式主題（light / dark / system）

> SKILL.md 把「light / dark / system 三段式 + localStorage 記憶 + 不寫死 hex（用 CSS 變數／`data-theme`）」列為**所有產物的硬性交付項**。三框架（React / Vue 3 / Vue 2）的主題邏輯**語意一致**：同樣三態、同樣 localStorage key（`'theme'`）、同樣以 `document.documentElement.dataset.theme` 套用，只是各框架語法不同。

### 色彩用 CSS custom properties（不在 JS 寫死 hex）

顏色由 `[data-theme]` 驅動的 CSS 變數決定，**不在 `data()` 維護 hex 物件**。把這段放進 `<style>`（與 SKILL.md「主題系統硬規則」一致）：

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

### `ThemeMixin`：三態狀態機

Vue 2 沒有 composable —— 用 mixin 複用主題邏輯（與上面 `TimeMixin` 同模式）。`mode` 須在 `data()` 預先宣告才有反應式：

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

> **三框架一致性**：React 用 `useState` + `useEffect`、Vue 3 用 `ref` + `watch`、Vue 2 用 `data` + `watch`，但三態名稱、`'theme'` localStorage key、`data-theme` 套用機制、system 監聽行為完全相同 —— 對照 [patterns-react.md](patterns-react.md) 與 [patterns-vue3.md](patterns-vue3.md) 的同名樣板。
