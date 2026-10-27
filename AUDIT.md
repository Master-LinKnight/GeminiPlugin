# 代码审计报告 · GeminiPlugin

> 项目：Gemini AI 创成式填充与生图（Photoshop UXP 插件）
> 版本：`1.1.0` ｜ 提交：`57b5ed0` ｜ 分支：默认分支 ｜ 工作区状态：干净
> 审计日期：2026-10-27
> 审计范围：`manifest.json`、`index.html`、`index.js`、`README.md`、`LICENSE`、`.gitignore`、`GeminiAI-Generator.ccx`、Git 历史

---

## 1. 结论摘要

| 维度 | 评价 |
|---|---|
| 可运行性 | ✅ 语法、清单、DOM 绑定、打包产物全部校验通过 |
| 可安装性 | ✅ `.ccx` 结构合法，`manifest.json` 位于压缩包根目录 |
| 安全性 | ⚠️ API Key 明文存储且拼在 URL 中；权限声明范围过宽 |
| 出图质量 | ⚠️ 蒙版实际为矩形（套索形状丢失）、无羽化；大图先降采样再请求 4K |
| 稳定性 | ⚠️ 文生图缺少画板切换保护；无 429/5xx 重试；安全拦截未透出原因 |
| 工程化 | ⚠️ 无构建脚本、无 CHANGELOG、无 CI；两处逻辑重复约 60 行 |
| 代码质量 | ✅ 无死代码、无 TODO 残留、注释清晰、命名一致 |

**一句话**：核心难点（大图体积控制、8 位转换、坐标精确对位、UXP 模态事务）都处理正确，是一个能实际投入使用的插件；主要短板是**文档宣称与实现之间的差距**、**密钥与权限的安全姿势**，以及**缺失构建/发布工程化**。

问题总计 **19 项**：P0 高危 3 项、P1 中危 7 项、P2 低危 9 项，另有 4 项能力增强建议。

---

## 2. 已验证项（均实际执行）

| # | 检查项 | 方法 | 结果 |
|---|---|---|---|
| 1 | JS 语法 | `node --check docs/index.js` | ✅ 通过 |
| 2 | 清单 JSON 合法性 | `JSON.parse(manifest.json)` | ✅ 通过 |
| 3 | UI ↔ 逻辑元素绑定 | 交叉比对 `getElementById` 与 HTML `id` | ✅ 17 个 ID，无缺失、无冗余 |
| 4 | 打包产物与源码一致性 | 比对 `.ccx` 内三个文件字节数 | ✅ 完全一致（无过期包） |
| 5 | 压缩包完整性 | `unzip -t` | ✅ 三个条目均 OK |
| 6 | 打包层级 | `unzip -Z1` 检查根目录 | ✅ `manifest.json` 在根目录，无多余嵌套 |
| 7 | 模型 ID 有效性 | 比对 Google 官方 deprecations 表 | ✅ 三个模型均为 GA 且在服务期 |
| 8 | 硬编码密钥 | 正则扫描 `AIza…` / `sk-…` | ✅ 未发现 |
| 9 | 死代码 | 声明符号引用计数（85 处） | ✅ 无孤立代码 |
| 10 | TODO/FIXME 残留 | `grep -rn "TODO\|FIXME\|XXX"` | ✅ 无 |
| 11 | `.gitignore` 覆盖 | 人工核对 | ✅ 已排除 `*.ccx`、`.DS_Store`、`node_modules/` |
| 12 | 体积 | `wc -c` / `gzip` | ✅ 总计 28.7 KB；`index.js` 19.5 KB → gzip 6.1 KB |

### 模型 ID 核对结果（依据 Google 官方弃用表，2026-10-22 更新）

| UI 中使用的 ID | 官方状态 | 备注 |
|---|---|---|
| `gemini-nano-banana-2.1` | GA，2026-10-06 发布，**无停服日期** | 当前推荐默认项，选择正确 |
| `gemini-3.1-flash-image` | GA，2026-05-28 发布，无停服日期 | 官方推荐替代为 `gemini-nano-banana-2.1` |
| `gemini-3-pro-image` | GA，2026-05-28 发布，无停服日期 | 与 `-preview` 版不同，写法正确 |

> 补充：官方另有 `gemini-3.1-flash-lite-image`（Nano Banana 2 Lite，支持 0.5K/1K/2K/4K，成本更低），可作为"极速/省钱"档位补充。

---

## 3. 架构与数据流

```
index.html（面板 UI，312 行）
    │  click 事件 / 17 个元素引用
    ▼
index.js（528 行，零第三方依赖）
    │
    ├─ 公共层
    │   ├─ arrayBufferToBase64 / base64ToArrayBuffer（分块，防栈溢出）
    │   ├─ getSelectionRect / expandRect（选区读取与外扩 15%）
    │   ├─ exportRegionToJpeg（executeAsModal：duplicate → 8bit → crop → ≤1536 → JPEG q9）
    │   └─ placeImageIntoRect（executeAsModal：placeEvent → resize/translate → 选区蒙版）
    │
    ├─ 功能一：局部重绘
    │   选区 → 外扩裁剪 → 降采样 → base64 → POST generateContent
    │        → 解析 inlineData → 落临时 PNG → 精确回贴 + revealSelection 蒙版
    │
    └─ 功能二：文生图
        prompt → POST generateContent（aspectRatio + imageSize）
              → 解析 inlineData → 落临时 PNG → placeEvent（居中）或 app.open
```

### 设计上值得肯定的三点

1. **临时副本机制**：`duplicate → 处理 → closeWithoutSaving`，原画板图层与历史 100% 不受影响；
2. **体积控制**：自动转 8 位 + 长边限制 1536，规避 Gemini 单请求 20 MB 上限与大图卡死；
3. **模态事务分离**：网络请求放在 `executeAsModal` 之外，避免长时间占用 Photoshop 模态锁。

---

## 4. 问题清单

### P0 — 高危（影响正确性 / 安全性）

#### P0-1 · 选区蒙版实际为矩形，套索/主体选择形状会丢失

- **位置**：`index.js:204-226`（重点 `index.js:207-214`）
- **现象**：`placeEvent` 执行后 Photoshop 通常会清空选区，代码随即用 `getSelectionRect()` 得到的**矩形 bounds** 兜底重建选区，再据此生成蒙版。
- **影响**：用套索、主体选择、魔棒圈出的不规则区域，最终蒙版一律退化为外接矩形。README 第 3 行、第 166 行宣称"全自动生成无损图层蒙版""仅保留圈选区域"，与实现不符。这是本插件作为"创成式填充平替"最核心的可信度问题。
- **建议修法**：在导出步骤之前把真实选区存入通道，置入完成后从通道恢复：

```js
// 导出入参前（executeAsModal 内）
await action.batchPlay([{
  _obj: "make", new: { _class: "channel" },
  at: [{ _ref: "channel", _enum: "channel", _value: "mask" }],
  using: { _enum: "userMaskEnabled", _value: "revealSelection" }
}], { synchronousExecution: true });

// ……置入完成后，用该通道恢复真实选区再建蒙版
await action.batchPlay([{
  _obj: "set", _target: [{ _ref: "channel", _property: "selection" }],
  to: { _ref: "channel", _name: "Alpha 1" }
}], { synchronousExecution: true });
await doc.selection.load(channel, constants.SelectionType.REPLACE);
doc.selection.deselect();
```

#### P0-2 · API Key 明文落盘 + 拼在 URL 查询参数

- **位置**：`index.js:244`、`index.js:329`、`index.js:435`（URL 拼 key）；`index.js:31`、`253`、`295`、`430`（`localStorage` 明文存储）
- **现象**：请求形如 `...?key=AIzaSy...`，且 Key 以明文写入 `window.localStorage`。
- **影响**：URL 会被代理日志、崩溃转储、系统网络诊断记录下来；明文存储意味着任何读取 UXP 缓存目录的进程都能拿到。
- **建议修法**：

```js
headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey }
```

  并在 UI 上提示"Key 保存在本地 Photoshop 缓存"，或改用系统钥匙串（如后续引入 Node 能力）。

#### P0-3 · 权限声明范围过宽

- **位置**：`manifest.json:39` `network.domains: "all"`；`manifest.json:41` `localFileSystem: "fullAccess"`
- **影响**：插件实际只需要访问一个域名、只写临时目录，却申请了"全部网络"与"完全文件系统"权限，放大攻击面，也会增加上架/审核与用户信任成本。
- **建议修法**：

```json
"requiredPermissions": {
  "network": { "domains": ["https://generativelanguage.googleapis.com"] }
}
```

  `localFileSystem` 若仅使用 `fs.getTemporaryFolder()`，可整段移除。

---

### P1 — 中危（影响出图质量与稳定性）

#### P1-1 · 蒙版无羽化，接缝硬切

- **位置**：`index.js:215-222`（`revealSelection`）
- **现象**：蒙版 1 px 硬边；外扩的 15% 上下文（`SEL_PADDING_RATIO`）被完全遮掉，模型重绘的过渡信息被丢弃。
- **影响**：选区边界容易出现明暗、纹理、色温跳变，与"无缝融合"的预期不符。
- **建议**：对蒙版做 1–4 px 高斯模糊（`layer.applyGaussianBlur()` 或对通道执行 `gaussianBlur`），或让外扩区保留 40%–60% 可见度。

#### P1-2 · 输入先降到 1536，却请求 4K 输出

- **位置**：`index.js:79`（`MAX_MODEL_DIM = 1536`）、`index.js:131-134`、`index.html:245`（默认选中 4K）
- **影响**：大画布上的原始细节在送模型前已丢失，4K 输出对 1536 输入本质是上采样；且 4K 单价约为 2K 的 1.8 倍（$0.24 vs $0.134），属于"多花钱、无收益"。
- **建议**：按目标矩形尺寸自适应请求档位（≤2K 区域请求 2K），或把 `MAX_MODEL_DIM` 提至 2048/3072 仅对超大图降采样。

#### P1-3 · 文生图缺少画板切换保护

- **位置**：`index.js:488-513`（对比局部重绘的 `index.js:151-153` 已有 `id` 校验）
- **影响**：90 秒等待期间若用户切换文档，新图会被置入**错误的画板**。
- **建议**：置入前记录 `app.activeDocument.id` 并校验，不一致则中止并提示。

#### P1-4 · 安全拦截/无图响应时错误信息不可用

- **位置**：`index.js:378`、`index.js:477`
- **现象**：统一抛"未解析到图像数据"。
- **影响**：实际是 `promptFeedback.blockReason` 或 `finishReason` 触发安全拦截时，用户会误判为插件 bug。
- **建议**：解析并拼接 `promptFeedback.blockReason`、`candidates[0].finishReason`、`safetyRatings` 后再抛错。

#### P1-5 · 无 429/5xx 重试

- **位置**：两处 `fetch`（`index.js:353`、`index.js:452`）
- **影响**：图像模型限流较常见，当前遇 429 直接失败，用户需手动重试并承担一次失败等待。
- **建议**：对 429/500/503 做指数退避重试 2 次（间隔 2s/4s）。

#### P1-6 · 定时器未在 `finally` 中清理

- **位置**：`index.js:241-247`、`351-359`、`450-458`
- **现象**：`clearTimeout` 只在正常路径调用；`testKeyBtn` 抛异常时会遗留一个 12 秒定时器。
- **建议**：改为 `try { ... } finally { clearTimeout(timer); }`。

#### P1-7 · 操作结束后未清除选区

- **位置**：`index.js:412-414`（`finally` 前）
- **影响**：走矩形兜底路径时会残留一块矩形选区，用户后续操作会被"莫名选中"。
- **建议**：流程末尾调用 `doc.selection.deselect()`（配合 P0-1，在蒙版建立后清除）。

---

### P2 — 低危（工程化与可维护性）

| 编号 | 问题 | 位置 | 建议 |
|---|---|---|---|
| P2-1 | 两个功能函数中约 60 行"请求 + 响应解析 + 错误映射"逻辑几乎逐字重复 | `index.js:329-380` vs `435-479` | 抽出 `callGeminiImage({ model, parts, imageConfig })` |
| P2-2 | 模型下拉列表在 HTML 写两遍、README 再写一遍，共三处易漂移 | `index.html:236-240`、`270-274`；`README.md:163`、`183` | 用 JS 常量数组统一渲染选项 |
| P2-3 | 无 `package.json` / 构建脚本 / CHANGELOG / CI / lint | 仓库根目录 | 增加 `npm run build`（`zip -X -q -9`）与 `CHANGELOG.md` |
| P2-4 | 版本号需手动同步 `manifest.json`，易漏改 | `manifest.json:5` | 构建脚本中校验并自动注入版本 |
| P2-5 | manifest 未声明 `icons`，面板显示默认图标 | `manifest.json` | 补充 23×23 / 46×46 PNG 图标 |
| P2-6 | UI 全中文硬编码，但清单声明了 `en-US` 标签 | `manifest.json:18-22`；`index.html` 全文 | 统一改为单一语言，或引入 i18n 字典 |
| P2-7 | Tab 使用 `<div>` + click，无 `role="tab"`、无键盘可达性 | `index.html:222-223` | 补 `role`/`tabindex`/`keydown` |
| P2-8 | README 成本文案"约 $0.134（2K）"与界面默认选中的 4K（$0.24）不一致 | `README.md:12` vs `index.html:245` | 校正文案，或将默认档位改为 2K |
| P2-9 | 用户提示词以 `"${prompt}"` 直接内插进指令串，含引号会破坏指令框架 | `index.js:313-325` | 改用 `<<< >>>` 等定界符包裹，或作为独立 part 传入 |
| P2-10 | Git 提交信息质量偏弱（3 个 `update` / `Create`） | Git 历史 | 统一采用 Conventional Commits（已有 `5c43d55` 作为范例） |

---

## 5. 能力增强建议（非缺陷）

1. **新增低成本档位**：`gemini-3.1-flash-lite-image`（0.5K/1K/2K/4K），适合快速试稿。
2. **多轮迭代编辑**：当前每次请求独立，无法"继续修改同一张结果"；可把上一轮 `contents` 带入实现对话式修改。
3. **提示词与几何的一致性**：指令中称"选区大致位于裁剪图中央"（`index.js:316-319`），但 `expandRect`（`index.js:98-105`）在选区贴边时只会单侧外扩，实际选区可能位于角落，应改为按真实偏移描述。
4. **成本预估**：根据档位与模型在按钮旁显示预估单价，避免用户误用 4K。

---

## 6. 修复优先级路线图

| 阶段 | 内容 | 预估改动量 |
|---|---|---|
| 第 1 步 | P0-1 真选区蒙版（通道存/恢复）+ P1-1 羽化 + P1-7 清除选区 | 约 40 行，单文件 |
| 第 2 步 | P0-2 Key 改走 `x-goog-api-key` + P0-3 收窄权限 | 约 10 行 + 清单 1 处 |
| 第 3 步 | P1-3 文生图防串文档（约 5 行）、P1-4 拦截原因透出、P1-5 重试 | 约 30 行 |
| 第 4 步 | P1-2 分辨率自适应、P2-1 抽取公共请求函数 | 约 60 行重构 |
| 第 5 步 | P2-3/P2-4 构建脚本与版本校验、P2-5 图标、CHANGELOG | 新增文件 |
| 第 6 步 | 文档校正（README 成本、模型列表、蒙版描述） | 文档 |

> 建议第 1、2 步完成后发布 `1.1.1`，第 3、4 步完成后发布 `1.2.0`。

---

## 7. 附录：复现方法

```bash
# 语法与清单
node --check docs/index.js
node -e "JSON.parse(require('fs').readFileSync('docs/manifest.json','utf8'))"

# UI ↔ 逻辑绑定交叉校验
node -e '
const fs=require("fs");
const js=fs.readFileSync("docs/index.js","utf8"), html=fs.readFileSync("docs/index.html","utf8");
const used=[...js.matchAll(/getElementById\(.([^\x27]+)./g)].map(m=>m[1]);
const defined=[...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1]);
console.log("缺失:", used.filter(u=>!defined.includes(u)));
'

# 打包产物
unzip -t GeminiAI-Generator.ccx
unzip -Z1 GeminiAI-Generator.ccx | grep -c '^manifest.json$'

# 密钥与裸留
grep -rEn 'AIza[0-9A-Za-z_-]{10,}|sk-[A-Za-z0-9]{16,}' --include='*.js' --include='*.html' --include='*.json' .
grep -rn 'TODO\|FIXME\|XXX' docs/index.js docs/index.html
```

模型有效性依据：<https://ai.google.dev/gemini-api/docs/deprecations>

---

## 8. 免责说明

本报告基于**静态代码审查**与官方文档比对，未在 Photoshop 运行时实际执行插件。凡是涉及 Photoshop 实际行为的判断（如 `placeEvent` 是否清空选区、`layer.bounds` 返回值形态），均已在文中标注为「通常 / 依据官方行为」，建议在真机上以 P0-1 的验证用例复核后再定稿。
