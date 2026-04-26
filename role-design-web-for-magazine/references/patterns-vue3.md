# Vue 3 global build + Composition API：寫法與 gotcha

本檔為 magazine 技能下使用 **Vue 3（global build，無 build step）** 模式的專屬指南：CDN 設定、硬規則、注意事項。

> 設計理念見 [SKILL.md](../SKILL.md) 與 L1-L5；本檔只講 Vue 3 框架的 gotcha。

## 目錄

1. [CDN 版本鎖定](#cdn-版本鎖定)
2. [四條不可妥協的硬規則](#四條不可妥協的硬規則)
3. [元件註冊](#元件註冊)
4. [其他注意事項](#其他注意事項)

---

## CDN 版本鎖定

使用**精確版本**的 `vue.global.js`(含 template compiler 的開發版)：

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

> 如果走 `.vue` SFC（`vue3-sfc-loader`），則可以用 PascalCase —— 但 SFC 非本文件主軸。

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

**兩種註冊方式，依需求選用**：

```js
// 全域註冊：整個 app 都能用（用於 TweaksPanel、ThemeProvider 這類貫穿元件）
const app = createApp(Root);
app.component('tweaks-panel', TweaksPanel);
app.mount('#app');

// 區域註冊：只在父元件內可用（用於只在特定頁面用的元件）
const Page = {
  components: { IPhoneFrame },
  template: `<iphone-frame>...</iphone-frame>`
};
```

> **避免過度全域註冊**：全域元件無法 tree-shake，原型階段還好，但若專案會長期迭代，區域註冊較乾淨。

---

## 其他注意事項

- **根元件與元件的 `data`**：根元件的 `data` 可以是 object，但**元件的 `data` 必須是 function 回傳 object**（避免多實例共用狀態）。若用 Composition API 的 `setup()` 則無此問題。
- **template 字串可以用 ES template literal**：`template: \`<div>\${foo}</div>\`` —— 但**不要用 JS 字串插值做動態內容**，改用 Vue 的 `{{ }}` 與 `v-bind`，否則失去反應性。
- **避免命名衝突**：不要用 `styles` 當變數／屬性名（同 SKILL.md 主檔通用規則）。
