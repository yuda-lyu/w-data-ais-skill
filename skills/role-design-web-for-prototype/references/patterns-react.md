# React 18 + Babel（inline JSX）：寫法與樣板

本檔為使用 **React 18 + Babel inline JSX**（無 build step、純 HTML 檔）模式的專屬指南：CDN 設定、硬規則、對應樣板。

> 設計理念（工作流程、設計原則、placeholder 哲學、變體探索、避開 AI 味）見主檔 [SKILL.md](../SKILL.md) —— 本檔只講「怎麼寫 React 程式碼」。

## 目錄

1. [CDN 版本鎖定](#cdn-版本鎖定)
2. [三條不可妥協的硬規則](#三條不可妥協的硬規則)
3. [其他注意事項](#其他注意事項)
4. [樣板：裝置模擬外框](#樣板裝置模擬外框)
5. [樣板：Tweaks 面板](#樣板tweaks-面板)
6. [樣板：動畫時間軸引擎](#樣板動畫時間軸引擎)
7. [樣板：設計畫布](#樣板設計畫布)
8. [樣板：Dark Mode Provider](#樣板dark-mode-provider)

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

---

## 樣板：裝置模擬外框

### iPhone 外框

```jsx
const IPhoneFrame = ({ children, title = "App" }) => (
  <div style={{
    width: 390,
    height: 844,
    borderRadius: 48,
    border: '12px solid #1a1a1a',
    overflow: 'hidden',
    position: 'relative',
    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
    background: '#fff'
  }}>
    {/* 狀態列 */}
    <div style={{
      height: 54,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 24px',
      fontSize: 14,
      fontWeight: 600
    }}>
      <span>9:41</span>
      <div style={{
        width: 126,
        height: 34,
        background: '#1a1a1a',
        borderRadius: 20,
        position: 'absolute',
        left: '50%',
        transform: 'translateX(-50%)',
        top: 8
      }} />
      <span>⚡ 📶</span>
    </div>
    {/* 內容 */}
    <div style={{ height: 'calc(100% - 54px)', overflow: 'auto' }}>
      {children}
    </div>
    {/* Home indicator */}
    <div style={{
      position: 'absolute',
      bottom: 8,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 134,
      height: 5,
      background: '#1a1a1a',
      borderRadius: 3
    }} />
  </div>
);
```

### 瀏覽器視窗外框

```jsx
const BrowserFrame = ({ children, url = "https://example.com", title = "Page" }) => (
  <div style={{
    borderRadius: 12,
    overflow: 'hidden',
    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
    border: '1px solid #e5e5e5'
  }}>
    {/* 標題列 */}
    <div style={{
      background: '#f5f5f5',
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      borderBottom: '1px solid #e5e5e5'
    }}>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#ff5f57' }} />
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#febc2e' }} />
        <div style={{ width: 12, height: 12, borderRadius: '50%', background: '#28c840' }} />
      </div>
      <div style={{
        flex: 1,
        background: '#fff',
        borderRadius: 6,
        padding: '6px 12px',
        fontSize: 13,
        color: '#666',
        border: '1px solid #e0e0e0'
      }}>
        {url}
      </div>
    </div>
    {/* 內容 */}
    <div style={{ background: '#fff' }}>
      {children}
    </div>
  </div>
);
```

---

## 樣板：Tweaks 面板

```jsx
const TweaksPanel = ({ config, onChange, visible }) => {
  if (!visible) return null;
  
  return (
    <div style={{
      position: 'fixed',
      bottom: 20,
      right: 20,
      width: 280,
      background: 'rgba(24, 24, 27, 0.95)',
      backdropFilter: 'blur(12px)',
      borderRadius: 12,
      padding: 16,
      color: '#fff',
      fontSize: 13,
      zIndex: 9999,
      boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      border: '1px solid rgba(255,255,255,0.1)'
    }}>
      <div style={{ fontWeight: 600, marginBottom: 12, fontSize: 14 }}>Tweaks</div>
      
      {Object.entries(config).map(([key, value]) => (
        <div key={key} style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', marginBottom: 4, opacity: 0.7 }}>
            {key}
          </label>
          {typeof value === 'boolean' ? (
            <input
              type="checkbox"
              checked={value}
              onChange={e => onChange({ ...config, [key]: e.target.checked })}
            />
          ) : typeof value === 'number' ? (
            <input
              type="range"
              min="0"
              max="100"
              value={value}
              onChange={e => onChange({ ...config, [key]: Number(e.target.value) })}
              style={{ width: '100%' }}
            />
          ) : value.startsWith('#') ? (
            <input
              type="color"
              value={value}
              onChange={e => onChange({ ...config, [key]: e.target.value })}
            />
          ) : (
            <input
              type="text"
              value={value}
              onChange={e => onChange({ ...config, [key]: e.target.value })}
              style={{
                width: '100%',
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                borderRadius: 4,
                padding: '4px 8px',
                color: '#fff'
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
};
```

---

## 樣板：動畫時間軸引擎

`useTime` hook + `Easing` 函式集 + `interpolate` 工具，組合起來可做 scrubber、play/pause、多段編排：

```jsx
const useTime = (duration = 5000) => {
  const [time, setTime] = React.useState(0);
  const [playing, setPlaying] = React.useState(true);
  const frameRef = React.useRef();
  const startRef = React.useRef();
  
  React.useEffect(() => {
    if (!playing) return;
    const animate = (timestamp) => {
      if (!startRef.current) startRef.current = timestamp;
      const elapsed = (timestamp - startRef.current) % duration;
      setTime(elapsed / duration); // 0 到 1
      frameRef.current = requestAnimationFrame(animate);
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [playing, duration]);
  
  return { time, playing, setPlaying };
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

// 使用範例：
// const { time } = useTime(3000);
// const opacity = interpolate(time, 0, 1);
// const x = interpolate(time, -100, 0, Easing.spring);
```

---

## 樣板：設計畫布

並排顯示多個設計選項進行比較：

```jsx
const DesignCanvas = ({ options, columns = 3 }) => (
  <div style={{
    display: 'grid',
    gridTemplateColumns: `repeat(${columns}, 1fr)`,
    gap: 24,
    padding: 40,
    background: '#f8f9fa',
    minHeight: '100vh'
  }}>
    {options.map((option, i) => (
      <div key={i} style={{
        background: '#fff',
        borderRadius: 12,
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
      }}>
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid #eee',
          fontSize: 13,
          fontWeight: 600,
          color: '#666'
        }}>
          Option {String.fromCharCode(65 + i)}: {option.label}
        </div>
        <div style={{ padding: 16 }}>
          {option.content}
        </div>
      </div>
    ))}
  </div>
);
```

---

## 樣板：Dark Mode Provider

以 Context + `prefers-color-scheme` 初始化：

```jsx
const ThemeContext = React.createContext();

const ThemeProvider = ({ children }) => {
  const [dark, setDark] = React.useState(
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
  
  const theme = dark ? {
    bg: '#0a0a0b',
    surface: '#18181b',
    border: '#27272a',
    text: '#fafafa',
    textMuted: '#a1a1aa',
    primary: '#3b82f6'
  } : {
    bg: '#ffffff',
    surface: '#f4f4f5',
    border: '#e4e4e7',
    text: '#18181b',
    textMuted: '#71717a',
    primary: '#2563eb'
  };
  
  return (
    <ThemeContext.Provider value={{ theme, dark, setDark }}>
      <div style={{ background: theme.bg, color: theme.text, minHeight: '100vh' }}>
        {children}
      </div>
    </ThemeContext.Provider>
  );
};

// 使用：
// const { theme, dark, setDark } = React.useContext(ThemeContext);
```
