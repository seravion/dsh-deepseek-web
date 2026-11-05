# dsh-deepseek-web

给 [DeepSeek Harness](https://github.com/deepseek-ai) 加一个**一键打开 DeepSeek 网页版**的入口。

左侧栏（就是「插件 / 自动化任务 / 扩展管理 / 更多」那一列）多出一行 🌐 **DeepSeek 网页**，点一下，`chat.deepseek.com` 在 Harness 内置浏览器里打开，**并自动切到全屏**占满整个窗口。

> **前提**：DSH 的内置浏览器是会话级的 —— 右侧栏挂在 `SessionProvider` 下，没有会话时打开标签页会直接抛错。所以要先进任意一个会话再点。没有会话时会退化成系统浏览器打开。

---

## 效果

```
┌──────────────┬─────────────────────────────────────┐
│ 🐋 deepseek  │ ⛶  ← 自动切全屏                      │
│              │                                     │
│  ＋ 新会话    │        chat.deepseek.com            │
│              │                                     │
│  🧩 插件      │        （铺满整个窗口）               │
│  🌐 DeepSeek │                                     │
│  ⏰ 自动化任务 │                                     │
└──────────────┴─────────────────────────────────────┘
```

右上角 ⛶ 可以随时切回 45% 侧栏模式，再点一次又铺满。

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
| `main` keyed 槽 | 面板行必须对应一个主面板，注册一个占位面板，否则 `selectPanel(id)` 抛错 |
| `ctx.layout.panelInfo` / `selectPanel` | 拦截选中：**先**把主面板还原（这样会话回到屏上），再打开浏览器 |
| `ctx.sidebarRight.openTab('browser', …)` | 让内置浏览器打开目标网址 |
| `[data-sidebar-right-mode="fullscreen"]` | 点一下面板自己的「显示模式」按钮，切成全屏 |

### 为什么页面不能直接嵌进主面板

试过，不行，这是宿主的两道硬限制：

1. **`<webview>` 需要官方租约** —— Desktop 主进程在 `will-attach-webview` 里校验 `about:blank#<lease>`，没有租约就 `event.preventDefault()`。插件永远拿不到租约，所以自建 webview 一定白屏。
2. **`<iframe>` 被站点拒绝** —— `chat.deepseek.com` 的框架策略不允许被嵌入，浏览器只会给一片空白，连 `error` 事件都不发。

结论：**第三方网页只能放在内置浏览器里**，而内置浏览器是会话级的（没有会话时它的命令直接抛错）。所以顺序很关键 —— 先把主面板还原让会话回到屏上，再去要标签页，否则必抛错退化成系统浏览器。

### 全屏是怎么做到的

右侧栏的 `toggleFullscreen(target)` 需要一个插件拿不到的内部「停靠分栏」对象，所以改用面板自己的显示模式按钮（`data-sidebar-right-mode`）：标签页挂载后短暂轮询该按钮并点击一次。按钮已处于全屏态时属性是 `push`，不会被重复点击。

## 兼容性

- 需要 Harness `>= 0.1.7`
- 桌面版：完整体验（内置浏览器 + 自动全屏 + 登录态保留）
- Web 版：`ui-sidebar-browser` 未启用时退化为系统浏览器
- 无会话时：无法内嵌，退化为系统浏览器

## 开发

```bash
node scripts/smoke-test.mjs   # 假宿主驱动一次点击：断言「先还原主面板 → 再开标签页 → 再切全屏」的顺序
```

`client.js` 是手写的、无构建步骤的模块（Harness 的模块加载器格式），改完直接重启宿主即可。

## License

MIT
