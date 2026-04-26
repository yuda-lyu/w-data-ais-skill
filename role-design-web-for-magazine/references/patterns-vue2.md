# Vue 2 + Options API：寫法與 gotcha

本檔為 magazine 技能下使用 **Vue 2（CDN，無 build step）+ Options API** 模式的專屬指南：CDN 設定、硬規則、注意事項。

> 設計理念見 [SKILL.md](../SKILL.md) 與 L1-L5；本檔只講 Vue 2 框架的 gotcha。

## 目錄

1. [CDN 版本鎖定](#cdn-版本鎖定)
2. [五條不可妥協的硬規則](#五條不可妥協的硬規則)
3. [元件註冊](#元件註冊)
4. [其他注意事項](#其他注意事項)

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

**兩種註冊方式，依需求選用**：

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
