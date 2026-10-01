# React 18 + Babel（inline JSX）：寫法與 gotcha

本檔為 magazine 技能下使用 **React 18 + Babel inline JSX**（無 build step、純 HTML 檔）模式的專屬指南：CDN 設定、硬規則、注意事項。

> 設計理念見 [SKILL.md](../SKILL.md) 與 L1-L5；本檔只講 React 框架的 gotcha。

## 目錄

1. [CDN 版本鎖定](#cdn-版本鎖定)
2. [三條不可妥協的硬規則](#三條不可妥協的硬規則)
3. [其他注意事項](#其他注意事項)

---

## CDN 版本鎖定

使用**精確版本**的 scripts（建議保留 `integrity` hash；若 CDN 受限再拿掉）：

```html
<script src="https://unpkg.com/react@18.3.1/umd/react.development.js"
        integrity="sha384-hD6/rw4ppMLGNu3tX5cjIb+uRZ7UkRJ6BPkLpg4hAu/6onKUg4lLsHAs9EBPT82L"
        crossorigin="anonymous"></script>
<script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js"
        integrity="sha384-u6aeetuaXnQ38mYT8rp6sbXaQe3NL9t+IBXmnYxwkUI2Hw4bsp2Wvmx4yRQF1uAm"
        crossorigin="anonymous"></script>
<script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js"
        integrity="sha384-m08KidiNqLdpJqLq95G/LEi8Qvjl/xUYll3QILypMoQ65QorJ9Lvtp2RXYGBFj1y"
        crossorigin="anonymous"></script>
```

**載入順序**：React → ReactDOM → Babel → 各元件檔案（每個都用 `<script type="text/babel" src="...">`）。

**掛載範例**：

```html
<div id="root"></div>
<script type="text/babel">
  function App() {
    return <div>Hello</div>;
  }
  ReactDOM.createRoot(document.getElementById('root')).render(<App />);
</script>
```

---

## 三條不可妥協的硬規則

### 1. 絕不使用 `const styles = { ... }`

多個元件檔案都把 `styles` 當全域物件，會彼此無聲覆蓋，導致詭異 bug。永遠以元件名稱做 namespace：

```jsx
// ✅ 正確
const terminalStyles = { container: { ... }, line: { ... } };
const headerStyles = { wrap: { ... } };

// ❌ 錯誤
const styles = { container: { ... } };  // 跨檔名稱衝突
```

或直接使用 inline `style={{...}}`。**永遠不要把 `styles` 當成變數名。**

### 2. 獨立的 `<script type="text/babel">` 區塊不共享 scope

每個 Babel script 都是獨立編譯的。要讓元件跨檔可用，檔尾必須明確掛到 `window` 上：

```jsx
function Terminal() { /* ... */ }
function Line() { /* ... */ }

Object.assign(window, { Terminal, Line });
```

其他檔案才能以 `<Terminal />`、`<Line />` 直接使用。

### 3. 不要使用 `scrollIntoView`

在 iframe 嵌入的預覽環境中，`element.scrollIntoView()` 會干擾外層捲動。需要程式化捲動時，改用 `element.scrollTop = ...` 或 `window.scrollTo({...})`。

---

## 其他注意事項

- **不要在 React CDN `<script>` 加 `type="module"`** —— 會破壞 Babel 的轉譯管線
- **開發版 vs. 生產版**：設計原型用 `react.development.js`（含 warning 與有用的錯誤訊息），不要用 `.production.min.js`
- **hooks 規則**：Hooks 只能在元件頂層呼叫，不能在條件式或迴圈內（Babel inline 模式下也一樣會噴錯）
