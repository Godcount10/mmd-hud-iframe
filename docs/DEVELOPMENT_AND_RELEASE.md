# 开发、测试与发布

本文面向需要安装依赖、运行 Mock、验证构建或发布产物的开发者和维护者。

系统原理见 [整体架构与实现](ARCHITECTURE.md)，实例规则见 [Theme 实例开发指南](THEME_DEVELOPMENT.md)。

---

## 1. 环境与安装

需要 Node.js 和 npm。

```bash
npm ci
```

项目包含 package-lock.json，推荐使用 npm ci，而不是依赖已有 node_modules。

---

## 2. 本地开发入口

### 2.1 完整 Mock 联调

Host Mock 加载 5273 上已经构建的 Frame IIFE，因此需要三个终端。

#### 终端 A：构建 Frame

```bash
npm run build:frame
```

开发 Build ID 默认是 dev，与 Host Dev 一致。

#### 终端 B：提供 Frame JS

```bash
node scripts/serve-cors.mjs dist/frame 5273
```

地址：

```text
http://127.0.0.1:5273/mmd-hud-iframe-frame.js
```

#### 终端 C：启动 Mock MMD + Host

```bash
npm run dev:host
```

打开：

```text
game：
http://127.0.0.1:5174/

bridge-debug：
http://127.0.0.1:5174/?theme=bridge-debug
```

Host 页面在 5174，Frame 脚本来自 5273，Frame document 本身是 opaque sandbox srcdoc。这比两个普通跨 origin 页面更接近生产架构。

### 2.2 npm run dev 的用途

```bash
npm run dev
```

在 127.0.0.1:5173 启动 `frame/index.html`，但直接访问没有：

- iframe.name bootstrap；
- 父页面 Host；
- MessagePort；
- 首 Snapshot。

因此它会显示连接错误页，而不是独立 HUD playground。

---

## 3. Mock 能验证什么

可以验证：

- bootstrap、handshake 和 MessagePort；
- Snapshot 与 capability；
- 消息发送和模拟流式输出；
- 多数模型、会话、编辑、人设和补充设定流程；
- hide/show/reload/destroy；
- Theme 响应式状态；
- 部分异步 panel rows 和 toggle 行为。

不能替代：

- 真实 MMD DOM 和中文文案；
- 真实动画与事件时序；
- AI provider；
- 生产 CSP；
- MMD 路由和 BFCache；
- 真实移动端软键盘、safe-area 和权限策略。

---

## 4. 浏览器联调清单

### 连接与协议

- [ ] Console 无异常；
- [ ] Frame JS 200，CORS 正常；
- [ ] 首 Snapshot 前 Theme 不挂载；
- [ ] Host/Frame Build ID 一致；
- [ ] reload 后创建新 channel，旧请求不回流；
- [ ] malformed/旧 Frame 消息不会改变当前 Theme。

### 原生动作

- [ ] 发送成功后才清空草稿；
- [ ] 流式输出来自 Snapshot；
- [ ] capability 不可用时显示 reason；
- [ ] open/close 重复调用保持幂等；
- [ ] 本地关闭不遗留原生 panel；
- [ ] stale target 安全失败；
- [ ] destructive flow 执行两阶段确认。

### 生命周期

- [ ] hide 后父页面显示“打开 HUD”；
- [ ] show 后 Theme 和特效恢复；
- [ ] destroy 后 iframe、恢复按钮、observer、timer 和 port 清理；
- [ ] 浏览器 visibilitychange；
- [ ] Frame reload；
- [ ] 页面导航、pagehide 和 BFCache（真实环境）。

### 视觉与设备

- [ ] 390×844；
- [ ] 横屏；
- [ ] 桌面宽屏；
- [ ] safe-area；
- [ ] 软键盘；
- [ ] prefers-reduced-motion；
- [ ] WebGL/Canvas 失败降级；
- [ ] GPU/RAF 资源卸载和恢复；
- [ ] storage 被拒绝时仍能运行。

---

## 5. 测试与构建命令

```bash
npm run typecheck
npm test
npm run test:watch
npm run build:host
npm run build:frame
npm run build
```

`npm run build` 执行：

```text
typecheck → build:host → build:frame
```

测试覆盖持续以测试目录和 Vitest 输出为准，不在文档中固定易过时的测试数量。

主要覆盖方向：

- handshake action 集合；
- malformed control/payload fail closed；
- capability 完整性；
- bootstrap round-trip 和 URL 限制；
- 首 Snapshot ready 门禁；
- invoke request/result/action 关联；
- stale channel；
- duplicate request ID；
- Wire 净化；
- stable reference 和两阶段删除；
- Frame CSS 注入；
- 部分模型 resolver、调试 payload 和特效设置。

明显待补见 [架构优化路线图](ROADMAP.md)。

---

## 6. Build ID

Host 与 Frame 必须使用同一 Build ID。

PowerShell：

```powershell
$env:MMD_HUD_BUILD_ID="<version-or-commit-sha>"
npm run build
```

Git Bash：

```bash
MMD_HUD_BUILD_ID=<version-or-commit-sha> npm run build
```

开发缺省值为 dev。正式发布禁止使用 dev；当前自动门禁仍属于路线图 P0，发布人员必须人工检查。

---

## 7. Frame 单文件 CSS 构建

最终产物：

```text
dist/host/mmd-hud-iframe-host.js
dist/frame/mmd-hud-iframe-frame.js
```

Frame 样式来源：

1. Theme 主 CSS 通过 `?inline` 导入，由 frame/main.ts 创建 style；
2. Vue SFC style 由 Vite 汇总，再由 `build/frameCssInjection.ts` 注入入口 IIFE。

构建注入器：

- 收集并排序 CSS asset；
- 要求恰好一个 Frame entry chunk；
- 安装带 `data-mmd-hud-frame-styles` 标记的 style；
- 避免同 document 重复注入；
- 安全序列化 CSS，包括 U+2028/U+2029；
- 删除最终 bundle 中独立 CSS asset。

构建后应确认：

```text
dist/frame/ 仅包含 mmd-hud-iframe-frame.js
```

不需要 frameCssUrl 或第三个发布资产。

---

## 8. 发布仓库

当前相邻 release 仓库：

```text
../mmd-hud-iframe-release/
├─ host/mmd-hud-iframe-host.js
├─ frame/mmd-hud-iframe-frame.js
├─ manifest.json
└─ README.md
```

Host 与 Frame 必须来自：

- 同一次源码状态；
- 同一次构建；
- 同一个 Build ID；
- 同一个不可变 release commit。

---

## 9. 发布前流程

1. 确认源码 Git 工作树和目标 commit；
2. 选择唯一非 dev Build ID（版本或源码 commit）；
3. 如需要，更新 package version/lockfile；
4. npm ci；
5. npm run typecheck；
6. npm test；
7. 用同一 MMD_HUD_BUILD_ID 执行 npm run build；
8. 检查 Host/Frame 中 Build ID；
9. 验证 dist/frame 只有 Frame JS；
10. 确认第三方库和资产已打入 bundle，不依赖运行时组件 CDN；
11. 复制两个产物到 release 仓库；
12. 更新 manifest buildId、version、themes；
13. 更新 release README；
14. 检查 release diff；
15. 提交并 push release 仓库；
16. 使用 release commit 完整 SHA 的 jsDelivr URL；
17. 在真实 MMD 执行 bridge-debug 和目标 Theme 冒烟。

当前 release copy、manifest、checksum 和 CI 仍是人工流程；自动化方案见 [架构优化路线图](ROADMAP.md)。

---

## 10. MMD 注入

### game

```html
<script>
window.__MMD_HUD_IFRAME_CONFIG__ = {
  frameScriptUrl: 'https://cdn.jsdelivr.net/gh/<user>/<release-repo>@<immutable-commit-sha>/frame/mmd-hud-iframe-frame.js',
  theme: 'game'
}
</script>
<script src="https://cdn.jsdelivr.net/gh/<user>/<release-repo>@<immutable-commit-sha>/host/mmd-hud-iframe-host.js"></script>
```

### bridge-debug

```html
<script>
window.__MMD_HUD_IFRAME_CONFIG__ = {
  frameScriptUrl: 'https://cdn.jsdelivr.net/gh/<user>/<release-repo>@<immutable-commit-sha>/frame/mmd-hud-iframe-frame.js',
  theme: 'bridge-debug'
}
</script>
<script src="https://cdn.jsdelivr.net/gh/<user>/<release-repo>@<immutable-commit-sha>/host/mmd-hud-iframe-host.js"></script>
```

规则：

- 不使用 @main 或浮动 tag；
- Host/Frame 不跨 commit；
- Frame URL 生产只允许 HTTPS；本地仅 loopback HTTP；
- frameScriptUrl 当前无 hostname allowlist，配置必须来自可信注入；
- 父页面 CSP 必须允许 Frame script；
- Frame sandbox 使用 allow-scripts、allow-downloads，allow 属性包含 clipboard-write；
- Frame CSS 已进入 Frame JS。

---

## 11. 重复注入与更新

注入成功后全局 API：

```js
__MMD_HUD_IFRAME__.getSnapshot()
__MMD_HUD_IFRAME__.getThemeId()
__MMD_HUD_IFRAME__.getFrameScriptUrl()
__MMD_HUD_IFRAME__.refresh()
__MMD_HUD_IFRAME__.hide()
__MMD_HUD_IFRAME__.show()
__MMD_HUD_IFRAME__.reloadFrame()
__MMD_HUD_IFRAME__.destroy()
```

重复注入不会创建第二实例，只会 refresh。加载新 bundle 或新 Theme：

```text
完整刷新页面
或 destroy() 后重新注入
```

仅 reloadFrame 不会下载新的 Host bundle；是否获取新 Frame 还受 URL 和缓存策略影响，因此正式更新应使用新的不可变 commit URL。

---

## 12. bridge-debug 导出安全

默认导出会脱敏：

- confirmation token；
- HTTP(S) link/avatar；
- text/html/identity/subtitle/preview。

完整导出可能包含聊天正文、用户人设、设定补充和分享链接，必须二次确认，不应公开上传。

---

## 13. 发布验收清单

- [ ] typecheck 通过；
- [ ] tests 通过；
- [ ] Host build 通过；
- [ ] Frame build 通过；
- [ ] Build ID 非 dev；
- [ ] Host/Frame Build ID 一致；
- [ ] Frame 目录只有单 JS；
- [ ] manifest 与产物一致；
- [ ] release 工作树只包含预期文件；
- [ ] release commit 已 push；
- [ ] 注入 URL 使用完整不可变 SHA；
- [ ] bridge-debug 冒烟通过；
- [ ] 目标 Theme 实际依赖动作在真实 MMD 通过。
