# 修复日志

本文件记录在真实 MMD Bridge 联调过程中发现并解决的问题。日期使用北京时间（UTC+8）。

---

## 2026-08-05 — Bridge Debug 确认 payload 无法克隆

### 问题现象

在 `bridge-debug` 中执行 `rollbackMessage`：

1. 选择目标消息；
2. 点击执行动作；
3. 安全确认界面无法正常打开；
4. 浏览器控制台抛出：

```text
DataCloneError: Failed to execute 'structuredClone' on 'Window': #<Object> could not be cloned.
```

### 影响范围

问题发生在 Bridge Debug 的安全确认流程中，不是 `rollbackMessage` 原生 handler 本身。

任何同时满足以下条件的动作都可能受影响：

- 需要安全确认；
- payload 是非空对象；
- 从 Bridge Debug 动作目录入口执行。

删除消息和删除会话的 token 二次确认路径也存在同类风险。

### 根因

`PayloadForm` 发出的普通 payload 对象被父组件保存到 Vue 深层 `ref` 后，会转换为 reactive `Proxy`。

安全确认流程随后直接执行：

```ts
structuredClone(payload.value)
```

浏览器结构化克隆算法不支持 JavaScript Proxy，因此在动作进入 `HostClient`、`MessagePort` 和原生 Bridge 之前就抛出 `DataCloneError`。

`rollbackMessage` 的 payload 本身只有：

```ts
{ messageId: string }
```

其中没有混入 DOM、Event、Window 或函数。错误信息中的 `Window` 表示调用的是 `window.structuredClone()`，不表示 payload 包含 Window 对象。

### 修复

修改：

- `src/hud/themes/bridge-debug/BridgeDebugHud.vue`

将首次安全确认和 token 二次确认中的两处直接 `structuredClone()`，改为使用项目已有的 `cloneDebugValue()`：

```ts
cloneDebugValue(payload)
```

该工具会先通过 Vue `toRaw()` 移除 reactive Proxy 身份，再执行结构化克隆。

修复覆盖：

1. `rollbackMessage` 等普通安全确认动作；
2. `deleteMessage`、`deleteConversation` 的 token 二次确认路径。

### 回归测试

新增：

- `src/hud/themes/bridge-debug/utils/cloneDebugValue.test.ts`

测试覆盖：

- reactive `{ messageId }` payload 可以安全克隆；
- reactive `{ messageId, confirmationToken }` payload 可以安全克隆；
- 克隆结果不是 Vue Proxy；
- 克隆结果仍可通过浏览器 `structuredClone()`。

验证结果：

```text
TypeScript/Vue 类型检查：通过
测试文件：12 passed
测试用例：46 passed
Host 构建：通过
Frame 构建：通过
```

### 测试发布

测试发布仓库：

```text
https://github.com/Godcount10/mmd-hud-iframe-release
```

不可变 Release Commit：

```text
8b506f853b2581e51fd19498dba43918dd3d9687
```

Build ID：

```text
rollback-proxy-fix-20260805
```

产物 SHA-256：

```text
Host:  400b5b67952703b5de317475a2b695410752620518b5e984f9d9c811dca1f1b9
Frame: aef9fd56f1bcb958ddd2e2efabc1c6a356be5e22e4e7ae466ea36ec93c91ae39
```

### 真实环境复测重点

- 选择 `rollbackMessage` 和目标消息；
- 点击执行后安全确认弹窗应正常打开；
- 控制台不再出现 `DataCloneError`；
- 确认后动作应进入 Bridge 原生 handler；
- 对消息删除和会话删除重复验证 token 二次确认路径。

---

## 2026-08-06 — `renameConversation` 真实弹窗标题 selector 过时

### 问题现象

真实 MMD 中执行 `renameConversation` 时：

- HUD payload 已正确包含 `title: "123"`；
- 原生会话备注弹窗正常出现；
- 输入框没有被写入标题；
- Bridge 返回：

```text
PLATFORM_CHANGED: 编辑按钮未打开唯一且新出现的会话备注弹窗
```

### 根因

真实 DOM 使用：

```html
<uni-view class="confirm-edit-scope">
  <uni-view class="confirm-edit-title">聊天记录备注</uni-view>
  <uni-view class="input-scope">
    <uni-input>
      <input class="uni-input-input" maxlength="140">
    </uni-input>
  </uni-view>
  <uni-view class="confirm-edit-bottom">
    <uni-view class="cancel-btn">取消</uni-view>
    <uni-view class="ok-btn">确定</uni-view>
  </uni-view>
</uni-view>
```

Bridge 原先使用：

```ts
conversationRenameTitle: '.confirm-title'
```

但 `.confirm-title` 属于通用删除确认框，真实重命名框的标题 class 是 `.confirm-edit-title`。因此重命名弹窗结构校验无法读取标题，弹窗被判定为无效，Bridge 在写入标题之前提前返回 `PLATFORM_CHANGED`。

### 修复

修改：

- `src/bridge/mmd/selectors.ts`
- `src/bridge/mmd/morePanels.test.ts`
- `src/dev/mockMmd.ts`

将专用重命名标题 selector 改为：

```ts
conversationRenameTitle: '.confirm-edit-title'
```

删除确认框继续使用通用的 `.confirm-title`，没有全局改动。

同时将测试夹具和 Mock MMD 的真实重命名 DOM class 对齐，避免测试继续使用错误的旧结构。

### 人工测试重点

1. 重新加载最新 Host/Frame bundle；
2. 选择 `renameConversation`；
3. 选择目标会话并输入新标题；
4. 点击 HUD 安全确认；
5. 原生弹窗应自动填入新标题并自动点击“确定”；
6. ActionResult 应返回 `ok: true`，`data.phase: "renamed"`；
7. Snapshot 中目标会话标题应更新。

---

## 2026-08-06 — Bridge Debug 会话删除确认按钮始终禁用

### 问题现象

在 `bridge-debug` 中执行 `requestDeleteConversation` 后：

1. 原生 MMD 删除确认框正常出现；
2. `deleteConversation` capability 正确变为 available；
3. 切换到 `deleteConversation` 后，HUD 仍显示会话对象选择器；
4. 无论选择哪个会话，执行按钮都保持禁用。

### 根因

HUD 的 `readConfirmation()` 只按当前 `selectedAction` 处理 `deleteMessage` 和 `deleteConversation`，没有处理第一阶段动作 `requestDeleteConversation` 返回的 `confirmation-required`。

因此：

```text
原生确认框存在
→ deleteConversation capability = available
→ HUD 未保存 confirmation token
→ executor.pendingConfirmation = null
```

同时，`conversation-delete` 的 PayloadForm 虽然显示会话下拉框，但它的 payload builder 只返回 `confirmPayload`，不会使用用户选择的对象。由于 pending token 没有建立，`confirmPayload` 始终是 `undefined`，所以选择任何对象都不能改变最终 payload。

底层 Bridge、协议和原生 `deleteConversation` handler 的 token、TTL、稳定引用、dialog identity 与删除后列表校验逻辑保持不变。

### 修复

修改：

- `src/hud/themes/bridge-debug/BridgeDebugHud.vue`
- `src/hud/themes/bridge-debug/components/PayloadForm.vue`
- `src/hud/themes/bridge-debug/utils/pendingConfirmation.ts`

主要调整：

1. 新增 `pendingConfirmationFromResult()`，根据返回的 `result.action` 解析两阶段确认结果；
2. 将 `requestDeleteConversation` 的 `confirmation-required` 转换为：
   - `kind: 'conversation-delete'`；
   - `action: 'deleteConversation'`；
   - 包含 `conversationId`、`fingerprint`、`index` 和 `confirmationToken` 的 pending payload；
3. `conversation-delete` 不再显示对象选择器；
4. 有 token 时显示只读目标信息；
5. 没有 token 时显示“请先执行请求删除会话”的明确提示；
6. disabled 原因不再显示泛化的“请选择完整的当前快照 payload”，而是提示先完成第一阶段请求。

### 回归测试

新增或扩展：

- `src/hud/themes/bridge-debug/utils/pendingConfirmation.test.ts`
- `src/hud/themes/bridge-debug/components/PayloadForm.test.ts`

覆盖：

- `requestDeleteConversation` 正确生成 `deleteConversation` pending token；
- 已完成或失败的其他结果不会错误创建 pending confirmation；
- `deleteConversation` 没有 token 时不显示对象选择器；
- `deleteConversation` 有 token 时只使用 pending payload；
- 选择器不能覆盖 token 对应的目标。
