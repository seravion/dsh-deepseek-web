# dsh-deepseek-web

给 [DeepSeek Harness](https://github.com/deepseek-ai) 加一个**一键打开 DeepSeek 网页版**的入口。

左侧栏（就是「插件 / 自动化任务 / 扩展管理 / 更多」那一列）多出一行 🌐 **DeepSeek 网页**，点一下，`chat.deepseek.com` 直接**占满中间整栏**打开 —— 和「插件」页面一样的全局面板，全宽、**不需要先选中任何会话**。

> 桌面版走 Electron `<webview>`，DeepSeek 官网页面的 `X-Frame-Options` 拦不住，能正常登录和使用；
> 纯 Web 版（浏览器里跑 dsh web）退化成 `<iframe>`，若站点拒绝嵌入，工具栏的 ↗ 按钮会改用系统浏览器打开。

---

## 效果

```
┌──────────────┬─────────────────────────────────────┐
│ 🐋 deepseek  │ 🌐 chat.deepseek.com            ↗  │
│              ├─────────────────────────────────────┤
│  ＋ 新会话    │                                     │
│              │           chat.deepseek.com         │
│  🧩 插件      │                                     │
│  🌐 DeepSeek │          （占满中间整栏）             │
│  ⏰ 自动化任务 │                                     │
│  ...         │                                     │
└──────────────┴─────────────────────────────────────┘
```

点「新会话」或任意会话即可切回去，面板不占用会话状态。

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
| `main` keyed 槽 | 注册一个全局面板（key 与行的 id 相同），面板里渲染网页 |

**为什么不是「打开右侧栏浏览器」？**
最初确实那么做过，有两个硬伤，都是宿主设计决定的，补不了：

1. **右侧栏固定占视口 45%**（最大 70%），它就是设计成「和会话并排」的；
2. **右侧栏挂在 `SessionProvider` 下** —— 没有选中会话时，`ctx.sidebarRight.openTab()` 会直接抛错（官方文档原话：*"with no Session on screen … they throw"*）。

所以改成「全局面板」：和「插件」页面同一个机制，全宽、与会话完全无关，点会话就切回去。

面板内部优先用 Electron `<webview>`（主窗口启用了该标签，和内置浏览器用的是同一个元素），因此**不受网站 `X-Frame-Options` 影响**；没有 webview 的环境退化成 `<iframe>`；页面加载失败时显示一个 ↗ 按钮走系统浏览器。

## 兼容性

- 需要 Harness `>= 0.1.7`
- 桌面版：完整体验（`<webview>` + 独立持久化登录态）
- Web 版：`<iframe>`，站点若拒绝嵌入则用系统浏览器

## 开发

```bash
node scripts/smoke-test.mjs   # 用假宿主加载插件，断言注册的行与面板、且不劫持选中
```

`client.js` 是手写的、无构建步骤的模块（Harness 的模块加载器格式），改完直接重启宿主即可。

## License

MIT
