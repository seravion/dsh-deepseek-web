# dsh-deepseek-web

给 [DeepSeek Harness](https://github.com/deepseek-ai) 加一个**一键打开 DeepSeek 网页版**的入口。

左侧栏（就是「插件 / 自动化任务 / 扩展管理 / 更多」那一列）多出一行 🌐 **DeepSeek 网页**，点一下，`chat.deepseek.com` 直接在 Harness 内置浏览器的右侧栏打开 —— 不开新窗口、不打断当前会话。

> 桌面版走 Electron `<webview>`，DeepSeek 官网页面的 `X-Frame-Options` 拦截不生效，能正常登录和使用；
> 纯 Web 版（浏览器里跑 dsh web）受同源策略限制，会自动退化成「新标签页打开」。

---

## 效果

```
┌──────────────┬───────────────────────────┬─────────────┐
│ 🐋 deepseek  │                           │             │
│              │                           │  chat.      │
│  ＋ 新会话    │        当前会话            │  deepseek   │
│              │                           │  .com       │
│  🧩 插件      │                           │             │
│  🌐 DeepSeek │  ← 点这里                 │  ← 右侧打开  │
│  ⏰ 自动化任务 │                           │             │
│  ...         │                           │             │
└──────────────┴───────────────────────────┴─────────────┘
```

## 安装

### 方式一：直接从 GitHub 装（现在就能用）

1. 打开 Harness → 左侧「插件」→「添加插件」
2. 输入框粘贴仓库地址：

```
https://github.com/seravion/dsh-deepseek-web
```

3. 安装完成后重启 Harness

### 方式二：npm（发布后）

```bash
pnpm add dsh-deepseek-web
```

装完同样需要重启。

### 方式三：本地目录

下载本仓库，然后在「添加插件」里粘贴文件夹的绝对路径。

### 方式四：手动写进 profile

编辑 `$DSH_HOME/profiles/desktop/package.json`（Windows 一般在 `C:\Users\<你>\.dsh\profiles\desktop\`）：

```jsonc
{
  "dependencies": {
    "dsh-deepseek-web": "link:/绝对路径/dsh-deepseek-web"
  },
  "dsh": {
    "profile": {
      "bundles": [
        // ...原有条目
        "dsh-deepseek-web"
      ]
    }
  }
}
```

然后在同一目录执行 `pnpm install`，重启 Harness。

---

## 它到底做了什么

只用了 Harness 官方公开的客户端扩展点，没有 DOM 注入、没有 hack 宿主私有实现：

| 用到的面 | 用途 |
|---|---|
| `sidebar.panellist` 槽（list） | 注册左侧栏那一行 + 地球图标 |
| `main` keyed 槽 | 面板行必须对应一个主面板，注册一个占位面板，否则 `selectPanel(id)` 会抛错 |
| `ctx.layout.panelInfo` / `selectPanel` | 拦截选中：打开网页后把中间栏原样还回去 |
| `ctx.sidebarRight.openTab('browser', { params: { url } })` | 在右侧栏内置浏览器里打开 |

**为什么不是普通的按钮？**
`sidebar.panellist` 是「面板行」而不是普通按钮 —— 宿主的点击逻辑写死为 `selectPanel(id)`，插件无法改写。所以这里选择了官方支持的组合：注册主面板 + 拦截选中。好处是还原动作和选中在同一个同步通知里完成，React 还没重绘就已经切回去了，**当前会话不会卸载**，滚动位置也不会丢。

如果哪天右侧浏览器不可用（例如 Web 版没开浏览器），会自动 `window.open` 兜底；再不行，占位面板上还有一个手动按钮。

## 兼容性

- 需要 Harness `>= 0.1.7`
- 桌面版：完整体验（内置浏览器 + 保留登录态）
- Web 版：需要 profile 里启用 `ui-sidebar-browser`，否则退化为新标签页

## 开发

```bash
node scripts/smoke-test.mjs   # 用假宿主驱动一次点击，断言 URL 与还原行为
```

`client.js` 是手写的、无构建步骤的模块（Harness 的模块加载器格式），改完直接重启宿主即可。

## License

MIT
