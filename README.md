# Gemini AI Generator (Photoshop UXP Plugin)

> 🎨 在 Adobe Photoshop 侧边栏直接调用 Google 官方 **Nano Banana Pro** (`gemini-3-pro-image`) 与 **Nano Banana 2** (`gemini-3-flash-image`) 模型生图，并自动将结果置入当前画板作为独立图层。

---

## 🌟 为什么做这个插件？（性价比优势）

在 Photoshop 里使用 AI 生图通常需要订阅 Adobe 官方的 Firefly 积分服务（每月 $9.99~$19.99+）。调用高阶第三方模型（如 Nano Banana Pro）单次会扣除高达 **40 点生成积分**，月费 $9.99 只能生成 50 张图（约 $0.20/张），且**当月用不完积分直接清零**。

**通过本插件直连 Google 官方 Gemini API：**
* 💰 **单张成本更低**：Google 官方 2K 分辨率约 **$0.134/张**，比 Adobe 折算单价便宜 **30% 以上**。
* ⚡ **纯按量计费（Pay-as-you-go）**：用几张付几张，没有任何按月底噪月租，没有积分清零的焦虑。
* 🔒 **隐私与直连**：本地直接请求 Google 官方端点，不经过任何中转服务器，API Key 仅保存在你的本地 PS 缓存中。

---

## ✨ 核心特性

- **多模型支持**：
  - `gemini-3-pro-image` (Nano Banana Pro)：专业级推理、真实光影逻辑、精准图内文字排版与超高清渲染。
  - `gemini-3-flash-image` (Nano Banana 2)：毫秒级响应、极低成本、适合快速概念发散。
- **分辨率与画幅自由选择**：原生支持 1K、2K、4K 分辨率，以及 `1:1`、`16:9`、`9:16`、`4:3`、`3:2` 等多种比例。
- **一键置入画板**：生成完成后自动通过 Photoshop 内部引擎作为新图层置入当前画布，无需手动下载与拖入。

---

## 🛠️ 前置准备

1. **Photoshop 版本**：Adobe Photoshop 2023 (v24.0) 或更高版本。
2. **Gemini API Key**：前往 [Google AI Studio](https://aistudio.google.com/) 注册并获取 API Key（确保绑定了结算账户以开启高阶图像模型权限）。
3. **Adobe UXP Developer Tool (免费)**：
   * 前往 Adobe 开发者官网下载并安装 [Adobe UXP Developer Tool (UDT)](https://developer.adobe.com/photoshop/uxp/2022/guides/devtool/)。
   * 该工具是 Adobe 官方提供的本地插件调试与加载工具，完全免费。

---

## 🚀 插件加载与使用步骤（只需 3 步）

### 第一步：打开 Photoshop
启动你的 Adobe Photoshop。

### 第二步：使用 UXP Developer Tool 加载插件
1. 启动安装好的 **Adobe UXP Developer Tool**。
2. 确保工具界面右上角显示 Photoshop 处于 **Connected（已连接）** 状态。
3. 点击右上角的 **Add Plugin** 按钮。
4. 在弹出的文件选择框中，找到本项目文件夹中的 `manifest.json`，点击选择。
5. 此时列表中会出现名为 **Gemini AI Generator** 的插件项。
6. 点击该插件右侧的 **•••** 按钮，选择 **Load**。

### 第三步：在 Photoshop 中打开面板
1. 回到 Photoshop 界面。
2. 点击顶部菜单栏：**Plugins（增效工具）** -> **Gemini AI 生图**。
3. Photoshop 侧边栏会自动打开生图面板：
   - 第一次使用时填入你的 **Gemini API Key**（插件会自动保存在本地）。
   - 选择模型、分辨率和比例。
   - 输入你的提示词（Prompt），点击 **生成并置入画板**。
4. 几秒钟后，生成的图片就会直接出现在你当前的画布图层中！

---

## 💡 提示词 (Prompt) 编写小贴士

* **文字精准排版（Nano Banana Pro 核心强项）**：
  * 用英文双引号将你想在画面中呈现的文字括起来，例如：
    > *A vintage diner menu board with warm neon letters reading "NIGHT OWL COFFEE", cinematic bokeh, moody lighting.*
* **空间与光影因果**：
  * 尽可能描述物体的相对位置、光线来源（如 *warm golden hour sunlight from the right*、*soft reflections on glossy marble*）。

---

## ❓ 常见问题排查

1. **报网络错误 / 无法连接 Google API？**
   * Google AI 服务的 API 节点在部分地区受到网络限制。请确保系统处于支持地区的网络节点环境中（如美国、日本、新加坡等）。
2. **报 `400 / 403 / 429` 错误？**
   * **403/400**：检查 API Key 是否正确输入，以及 Google Cloud 绑定的结算账户是否处于启用状态。
   * **429**：请求过于频繁超过了配额限制，请稍候片刻再试。
3. **关闭 Photoshop 后下次如何打开？**
   * 可以在 UXP Developer Tool 中重新点击 **Load**；如果想长期使用免调试加载，也可以在 UDT 中点击 **Package** 打包生成 `.ccx` 双击直接安装进 Photoshop。
