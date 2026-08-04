# MMD HUD iframe

一个覆盖在 MMD（魅魔岛）聊天页面之上的全屏游戏 HUD，以及一套将 MMD 原生能力安全投影到 sandbox iframe 的 Host / Bridge / Protocol 基础设施。

本项目不重写 MMD 的登录、会话、AI 请求、流式生成、消息持久化、模型或设置。MMD 始终是原生状态源和执行引擎；Vue HUD 通过纯数据 Snapshot、Capability 和经过验证的 NativeAction 与父页面协作。

```text
MMD 原生页面
  → MMD DOM Adapter / MmdNativeBridge
  → HostApp / FrameController / HostSession
  ║  MessagePort Protocol v2
  → HostClient / HudContext
  → Vue Theme：game / bridge-debug / 后续实例
```

---

## 当前状态

- 协议版本：v2；
- NativeAction 契约：67 项；
- 已注册原生 handler：61 项；
- Theme：`game`、`bridge-debug`；
- Host 与 Frame 分别构建为独立 IIFE；
- Frame SFC CSS 注入单一 Frame JS，不需要发布独立 CSS；
- 自动化测试覆盖协议、Host、Frame、Wire、构建注入及部分模型/调试状态；
- 真实 MMD 的完整 handler 回归、移动端、CSP、BFCache 和发布自动化仍需持续验收。

当前行为以源码、测试和本项目文档为准。

---

## 我应该阅读哪份文档？

| 你的目标 | 首选文档 | 适合读者 |
|---|---|---|
| 第一次了解项目，找到正确入口 | 本 README | 所有人 |
| 理解 Host、Frame、Bridge、Protocol 如何运行 | [整体架构与实现](docs/ARCHITECTURE.md) | 架构与基础设施开发者 |
| 理解为什么选择 iframe、MessagePort、Snapshot 和 capability | [架构优点与设计权衡](docs/ARCHITECTURE_RATIONALE.md) | 架构评审者、重构维护者 |
| 只开发一个 HUD 实例或 Theme | [Theme 实例开发指南](docs/THEME_DEVELOPMENT.md) | HUD/前端实例开发者 |
| 为 HUD 增加新的 MMD 原生能力 | [Bridge 原生能力开发指南](docs/BRIDGE_DEVELOPMENT.md) | Bridge、DOM Adapter 开发者 |
| 安装依赖、联调、测试、构建或发布 | [开发、测试与发布](docs/DEVELOPMENT_AND_RELEASE.md) | 开发与发布维护者 |
| 接手技术债务和后续架构优化 | [架构优化路线图](docs/ROADMAP.md) | 后续架构维护者 |

### 推荐阅读路径

#### 我只想开发一个具体 HUD

```text
README
  → docs/THEME_DEVELOPMENT.md
  → 只在需要新增 MMD 原生能力时阅读 docs/BRIDGE_DEVELOPMENT.md
```

#### 我要维护 Host / Frame / Protocol

```text
README
  → docs/ARCHITECTURE.md
  → docs/ARCHITECTURE_RATIONALE.md
  → docs/DEVELOPMENT_AND_RELEASE.md
```

#### 我要新增 MMD 原生动作

```text
README
  → docs/BRIDGE_DEVELOPMENT.md
  → docs/ARCHITECTURE.md
  → 在 bridge-debug 和真实 MMD 中回归
```

#### 我要接手后续优化

```text
README
  → docs/ARCHITECTURE.md
  → docs/ARCHITECTURE_RATIONALE.md
  → docs/ROADMAP.md
```

---

## 不可破坏的边界

无论开发哪个实例或基础设施层，都必须遵守：

1. MMD 是消息、会话、模型、设置和原生面板的唯一真实状态源。
2. selector、DOM reader、observer 和 action handler 只能运行在父页面。
3. iframe Theme 不读取或操作 `window.parent.document`。
4. Theme 不导入 `src/bridge/`、`src/host/` 或 transport 实现。
5. Bridge 不导入 Vue Theme。
6. 跨窗口不传 DOM、函数、事件对象、Vue ref 或 Proxy。
7. 不读取或传输 Cookie、Authorization、登录 token 或 MMD 内部 storage。
8. 全局 `postMessage` 只用于首次握手和转交唯一 MessagePort；业务通信只走端口。
9. Host 与 Frame 的协议版本和 Build ID 必须匹配。
10. 每次 iframe load/reload 都创建新的 bootstrap、channel、MessagePort 和 HostSession。
11. Theme 必须根据最新 capability 决定动作是否可用。
12. MMD 原生状态、AI 文本派生状态和 Theme 纯本地状态必须分开。
13. 保留完整 NativeAction 契约，不通过删类型或宽泛 `any` 绕过问题。

这些原则的实现细节见 [整体架构与实现](docs/ARCHITECTURE.md)，设计理由见 [架构优点与设计权衡](docs/ARCHITECTURE_RATIONALE.md)。

---

## 快速开始

需要 Node.js 和 npm。

```bash
npm ci
```

### 完整 Mock 联调

终端 A：构建 Frame。

```bash
npm run build:frame
```

终端 B：提供构建后的 Frame IIFE。

```bash
node scripts/serve-cors.mjs dist/frame 5273
```

终端 C：启动 Mock MMD + Host。

```bash
npm run dev:host
```

打开：

```text
正式 game：
http://127.0.0.1:5174/

Bridge Debug：
http://127.0.0.1:5174/?theme=bridge-debug
```

> `npm run dev` 只启动 Frame Vite 页面。直接访问它没有父页面 bootstrap、Host、MessagePort 和首 Snapshot，因此会显示连接错误页。完整功能开发请使用上述 5273 + 5174 流程。

更多命令、Build ID、单文件 CSS、浏览器检查和发布步骤见 [开发、测试与发布](docs/DEVELOPMENT_AND_RELEASE.md)。

---

## 目录速览

```text
mmd-hud-iframe/
├─ README.md                         # 项目导航与快速入口
├─ docs/
│  ├─ ARCHITECTURE.md               # 系统如何实现和运行
│  ├─ ARCHITECTURE_RATIONALE.md     # 为什么这样设计
│  ├─ THEME_DEVELOPMENT.md          # 如何写具体 HUD 实例
│  ├─ BRIDGE_DEVELOPMENT.md         # 如何扩展 MMD 原生能力
│  ├─ DEVELOPMENT_AND_RELEASE.md    # 本地开发、测试、构建、发布
│  └─ ROADMAP.md                    # 后续架构优化交接
├─ src/
│  ├─ contracts/                    # Snapshot / Action / Capability / Event
│  ├─ bridge/                       # MMD DOM Adapter 与 NativeBridge
│  ├─ protocol/                     # MessagePort 协议和 runtime decoder
│  ├─ host/                         # 父页面生命周期与 RPC 服务端
│  ├─ frame/                        # iframe 启动和 RPC 客户端
│  ├─ hud/                          # HudContext、共享工具与 Theme
│  └─ dev/                          # Mock MMD
├─ host-dev/                        # Mock MMD + Host 开发页
├─ frame/                           # Frame Vite 开发入口
├─ build/                           # Frame CSS 单文件注入
├─ tests/                           # 协议、Host、Frame 和构建测试
├─ scripts/                         # 本地静态服务等脚本
└─ dist/
   ├─ host/mmd-hud-iframe-host.js
   └─ frame/mmd-hud-iframe-frame.js
```

---

## Theme 与三类界面

当前可选 Theme：

- `game`：正式游戏 HUD；
- `bridge-debug`：完整 Bridge 实验室和消息流调试界面。

Theme 内的功能必须区分：

### 原生镜像

模型、会话、人设、编辑和设置等。数据来自 Snapshot，操作通过 NativeAction，MMD 是唯一真相源。

### AI 文本派生状态

例如从消息中解析 `[好感度=80]`。只读消息文本，在 Theme 内派生，不写回 Snapshot。

### 纯本地功能

例如地图、图鉴、UI 偏好和特效设置。由 Theme 自己管理，不应污染 NativeAction。

具体实现、状态机、异步顺序和测试要求见 [Theme 实例开发指南](docs/THEME_DEVELOPMENT.md)。

---

## 常用验证命令

```bash
npm run typecheck
npm test
npm run build:host
npm run build:frame
npm run build
```

正式发布必须为 Host 与 Frame 使用同一个非 `dev` Build ID：

```bash
MMD_HUD_BUILD_ID=<version-or-commit-sha> npm run build
```

---

## 父页面调试 API

注入成功后可用：

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

重复注入不会创建第二个实例，只会刷新现有 Bridge。加载新的 bundle 或 Theme 时，应完整刷新页面，或先执行 `destroy()` 再重新注入。

---

## 一句话总结

**Bridge 是 MMD DOM 的安全适配层，Host 是父页面与 iframe 的生命周期/RPC 网关，Protocol 是唯一跨窗口边界，HostClient/HudContext 是 Frame 内的远程代理，而 Theme 才是具体 HUD 实例。**
