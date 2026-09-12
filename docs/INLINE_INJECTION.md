# 内嵌正则注入构建

项目支持生成适配 MMD 正则导入格式的内嵌注入 JSON，不依赖 GitHub/CDN 链接。

## 构建

必须使用非 `dev` Build ID：

```bash
MMD_HUD_BUILD_ID=inline-20260806 npm run build:inline
# 預設載入 bridge-debug；正式 HUD 加 MMD_HUD_INLINE_THEME=game
```

PowerShell：

```powershell
$env:MMD_HUD_BUILD_ID="inline-20260806"
npm run build:inline
```

默认启动 `bridge-debug`。如需启动 `game`，在构建前设置 `$env:MMD_HUD_INLINE_THEME="game"`；切回调试台则设置为 `"bridge-debug"`。此选项只改变启动配置，当前 Frame 仍包含两个 Theme，不会按实例裁剪依赖。两种导出都保留安全字符串编码、130 条规则上限和源码还原校验。

脚本会依次：

```text
typecheck → build:host → build:frame → build:inline:rules
```

## 输出文件

输出目录：

```text
dist/inline/
├─ mmd-hud-iframe-inline.json
├─ mmd-hud-iframe-inline.txt
└─ mmd-hud-iframe-inline-manifest.json
```

### 导入 JSON

`mmd-hud-iframe-inline.json` 使用平台现有格式，并将第一段注入占位符直接写入 `statusbar`：

```json
{
  "pageDepth": 2,
  "statusbar": "【MMD HUD 内嵌注入 001】",
  "beginning": "第一句话",
  "regex_scripts": [
    {
      "id": -1,
      "replaceString": "...【MMD HUD 内嵌注入 002】",
      "scriptName": "MMD HUD 内嵌注入 001",
      "findRegex": "【MMD HUD 内嵌注入 001】"
    }
  ]
}
```

`statusbar` 的注入文本上限为 200 字，因此不再把全部占位符放入 `statusbar`，也不再需要手动复制单独的正文。每条规则会在自身替换代码末尾追加下一条占位符，形成链式注入：

```text
statusbar → 001 → 002 → 003 → …… → 最后一条启动规则
```

每条规则的 `replaceString` 控制在 19,000 字符以内，为平台 20,000 字符限制预留余量。整个导出最多 130 条规则（包含启动规则），超限时构建失败，不写出新的导入文件。最后一条规则是启动片段，不再追加下一条占位符。

源码使用安全 JavaScript 字符串字面量分块：通过 JSON 编码保留引号、反斜杠及 Unicode，将 `$` 转义为 `\x24`，避免 MMD 的 `String.replace` 把 `$&`、`$$`、`$'` 等解释为替换模板；将 `<` 和 Unicode 行分隔符转义，避免提前结束 HTML script 标签或破坏脚本语法。分块按转义后的实际长度计算，不使用 Base64。

生成器会分别使用字符串替换和回调替换展开规则，并连续执行两次，验证 Host、Frame、Build ID 和 Theme 精确还原。每次执行首段都会重置源码收集状态，防止重复注入累积旧代码。该校验不代替真实 MMD 中的运行验收。

## 运行机制

每个规则片段都是一个独立的 `<script>`，先在父页面收集 Host/Frame 源码。最后一个启动片段：

1. 设置 `frameScriptSource` 配置；
2. 启动 Host IIFE；
3. Host 在父页面运行 Bridge；
4. Host 创建 `sandbox="allow-scripts allow-downloads"` iframe；
5. Frame IIFE 只在 iframe 的 srcdoc Realm 执行；
6. 业务通信仍使用唯一 MessagePort。

因此它不是把 Frame 直接执行在 MMD 父页面，仍然遵守 Host、Frame、Bridge 和 Protocol 的 Realm 边界。

## 限制

- 必须按占位符顺序拼接；
- 每条平台规则不能超过 20,000 字符，构建脚本使用 19,000 字符安全上限；总规则数最多 130 条；
- 每次构建必须使用新的非 `dev` Build ID；
- 需要重新导入 JSON 才能更新规则；
- 如果平台阻止页面内 `<script>` 替换内容执行，则该平台的正则注入机制不适合此方案。
