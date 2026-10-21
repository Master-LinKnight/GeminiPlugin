# Gemini AI 创成式填充与生图 (Photoshop UXP 插件)

> 🪄 **完美平替 Adobe 原生 Generative Fill**：直接在 Photoshop 内圈选选区，调用 Google 官方 **Nano Banana Pro** (`gemini-3-pro-image`) 执行**局部重绘（创成式填充 / 消除 / 替换）**与**全新文生图**，全自动生成无损图层蒙版！

---

## 🌟 为什么用它替代 Adobe 原生创成式填充？

Photoshop 原生创成式填充如果选择第三方高阶模型（如 Google Gemini 系列），单次会扣除 **40 点 Adobe 生成积分**：
* 💸 **昂贵且限次**：每月 $9.99 订阅只有 2,000 点，**只能填充 50 次**（折合约 $0.20/次），月底没用完直接清零！
* 💰 **本插件直连 Google 官方 API**：
  * **单次成本约 $0.134**（2K 分辨率），比 Adobe 便宜 **30% 以上**。
  * **按量计费（Pay-as-you-go）**：充值一次用一年，用几次扣几次，**永远不会月底清零**。
  * **纯本地隐私**：API 请求从本机直接打到 Google 官方服务器，无第三方中转。

---

## 🛠️ 最近版本改动记录 (Changelog)

针对大图卡死、UI 截断以及调试加载等常见问题，插件已进行了全面重构优化：

1. **🔥 超大图/高位深智能优化（彻底解决卡在“推理中”问题）**：
   * **痛点**：对于数千万像素（如 8K RAW、5464×8192 像素）及 16位/通道的专业图像，原生导出数据量可达 80MB~100MB，极易超出 Google 官方 20MB 上限并导致网络挂起卡死。
   * **优化**：在后台自动创建临时画板副本（**原图层与工作状态 100% 不受影响**），自动降转为 8 位通道，并按比例缩放至 Gemini 视觉理解的最佳尺寸（最长边 1536px）。
   * **效果**：数据体积暴降 99%（从 100MB 降至 **300KB ~ 500KB**），上传瞬间完成，推理速度大幅提升。
2. **🎨 界面响应式重构与自适应滚动**：
   * **自定义胶囊分段选项卡**：用纯 CSS 分段控制器替换原生 `<button>`，彻底避开 UXP 原生按钮的控件宽度劫持，保证 **「🪄 局部重绘」** 与 **「🎨 全新生图」** 在任何小窗口下都不换行、不截断。
   * **启用暗色平滑滚动条**：无论窗口多小，都能上下平滑滚动，提示词输入框和操作按钮绝不丢失。
   * **增大默认窗口尺寸**：在 `manifest.json` 中配置了 `preferredFloatingSize: 320x620`，首次弹出即可展现完整面板。
3. **⚡ 新增 API 连通性测试工具**：
   * 在 API Key 输入框右上角新增 **`⚡ 测试连接`** 按钮，可在 2 秒内快速验证 Key 是否正确，以及当前网络是否能打通 Google 官方接口。
4. **⏱️ 超时熔断保护与精准报错引导**：
   * 内置 90 秒自动超时中断保护，并在遇到网络受阻时给出明确的 **TUN / 虚拟网卡代理模式** 引导，告别无限期转圈等待。

---

## 📦 安装与加载方法（三种方式任选其一）

### 方式一：双击 `.ccx` 一键安装（推荐，最省心）

无需配置开发者模式，适合日常直接使用：

1. 打开本项目文件夹，找到已打包好的 **`GeminiAI-Generator.ccx`** 文件。
2. **直接双击它**，Adobe Creative Cloud 客户端会自动弹出安装确认，点击**「安装」**。
3. 打开 Photoshop，在顶部菜单栏选择 **「增效工具 (Plugins)」 -> 「Gemini AI 生图」**，即可直接唤出操作面板。

---

### 方式二：解压即用（直接放进 Photoshop 的 `Plug-ins` 目录）

不需要 Creative Cloud、不需要开发者模式、不需要联网安装，**拷进去重启即用**，适合离线环境和多版本共存。

> 原理：`.ccx` 本质上就是一个 zip 压缩包，Photoshop 会扫描自己目录下的 `Plug-ins` 文件夹，把里面**解压后的插件文件夹**当作插件加载。

#### 第 1 步：把 `.ccx` 解压成文件夹

把 `GeminiAI-Generator.ccx` 复制一份，改后缀为 `.zip`（或直接用解压工具打开），解压后应得到三个文件：

```text
manifest.json
index.html
index.js
```

#### 第 2 步：在 `Plug-ins` 目录里建插件文件夹

**macOS**

```text
/Applications/Adobe Photoshop 2026/Plug-ins/GeminiAI-Generator/
```

1. 退出 Photoshop（`⌘Q`）。
2. 打开「访达 → 应用程序」，找到 `Adobe Photoshop 2026` **文件夹**（不是那个 .app）。
3. 进入其中的 `Plug-ins`，新建文件夹 `GeminiAI-Generator`。
4. 把上一步的 3 个文件拷进去。系统提示无权访问时输入开机密码，或右键 → 显示简介 → 解锁后授权。

**Windows**

```text
C:\Program Files\Adobe\Adobe Photoshop 2026\Plug-ins\GeminiAI-Generator\
```

1. 退出 Photoshop。
2. 打开 `C:\Program Files\Adobe\Adobe Photoshop 2026\Plug-ins`（版本号按你实际安装的改，如 2024 / 2025）。
3. 新建文件夹 `GeminiAI-Generator`，把 3 个文件拷进去。
4. 若提示需要管理员权限，点「继续」；或以**管理员身份**运行资源管理器 / 解压软件。

> ⚠️ **层级一定不能错**：`manifest.json` 必须直接在 `GeminiAI-Generator` 文件夹里，
> **不能**出现 `Plug-ins/GeminiAI-Generator/GeminiAI-Generator/manifest.json` 这种多套一层的情况。

#### 第 3 步：重启 Photoshop

彻底退出后重新打开，顶部菜单 **「增效工具 (Plugins)」→「Gemini AI 生图」** 即可使用。

#### 说明与排错

* 本项目自带的 `install-mac.command`（macOS）和 `install-win.bat`（Windows）就是**自动完成上述步骤**的脚本，双击运行即可，不用手动建文件夹。
* macOS 若双击脚本无反应，先在终端执行 `chmod +x install-mac.command`。
* 这是**版本专属目录**：升级到新的 Photoshop 大版本（如 2026 → 2027）后需要重新拷一次。
* 菜单里找不到插件时依次检查：
  1. Photoshop 版本是否 ≥ 2024（插件要求 25.0+）；
  2. 文件夹层级是否多套了一层；
  3. 是否**完全退出并重启**了 Photoshop（只关窗口不算）。

---

### 方式三：通过 Adobe UXP Developer Tool (UDT) 加载

适合需要查看控制台日志、修改源码或热重载调试的开发者：

1. 下载并安装官方免费的 [Adobe UXP Developer Tool (UDT)](https://developer.adobe.com/photoshop/uxp/2022/guides/devtool/)。
2. **开启 Photoshop 开发者模式（必做）**：
   * **Mac**：打开 Photoshop -> 顶部菜单 `Photoshop` -> `设置 (Settings / 首选项)` -> `增效工具 (Plugins)` -> 勾选 **「启用开发者模式」(Enable Developer Mode)**。
   * **Windows**：`编辑 (Edit)` -> `首选项 (Preferences)` -> `增效工具 (Plugins)` -> 勾选 **「启用开发者模式」**。
   * ⚠️ **勾选后必须彻底重启 Photoshop 才能生效！**
3. **加载插件**：
   * 启动顺序：**先启动 Photoshop**，等待主页加载完毕；**再启动 UDT**。
   * 在 UDT 中点击 **Add Plugin**，选择本项目中的 `manifest.json`。
   * 在插件卡片右侧点击 **Load**（代码修改后点击 **Reload** 即可实时热重载）。

> ❓ **常见报错排查**：
> 若在 UDT 加载时出现 `Load command failed in App with ID PS ... Devtools: Failed to load the devtools plugin`：
> 1. 请确认 Photoshop 设置里的「启用开发者模式」已勾选并已重启 Photoshop。
> 2. 确认 Photoshop 是先开的，UDT 是后开的（左侧显示 Connected 为绿色）。
> 3. 检查 Photoshop 前台是否有未处理的弹窗或对话框。

---

## 🌐 接口与网络环境配置（核心前提）

本插件直接与 Google 官方 API（`generativelanguage.googleapis.com`）通信，数据不经过任何第三方服务器：

1. **获取 Gemini API Key**：
   * 访问 [Google AI Studio (API Keys)](https://aistudio.google.com/app/apikey)。
   * 登录 Google 账号并点击 **Create API key**，复制以 `AIzaSy...` 开头的密钥。
   * 粘贴到插件面板顶部的 `Gemini API Key` 输入框中（插件会自动保存在 PS 本地缓存中，下次启动无需重填）。
2. **网络代理要求（重要）**：
   * 由于国内网络限制，电脑需开启科学上网/代理软件。
   * **强烈建议在代理软件（如 Clash Verge、Surge、Shadowrocket 等）中开启「TUN 模式 / 虚拟网卡增强模式」**。因为 Photoshop 是独立桌面进程，常规仅代理浏览器的系统 HTTP 代理可能无法接管 PS 内部网络请求。
3. **一键自检**：
   * 填入 Key 后，点击右上角的 **`⚡ 测试连接`**。
   * 若提示 `✅ 验证成功！API Key 有效且网络连接顺畅`，即可放心使用！

---

## 🚀 完整功能与操作流程指南

### 1. 🪄 局部重绘 / 选区填充（Inpainting）

像使用原生 Photoshop 创成式填充一样操作：

1. 在 Photoshop 中打开任意一张图片。
2. 使用工具栏的 **套索工具 (L)**、**选框工具 (M)** 或 **主体选择工具**，在画面中圈出目标区域。
3. 切换到插件面板的 **「🪄 局部重绘」** 选项卡：
   * **模型引擎**：默认 `Nano Banana 2.1`（最新，速度与画质平衡）；可选 `Nano Banana 2`（性价比）或 `Nano Banana Pro`（画质极致）。
   * **生成画质**：`4K (超清，默认)`、`2K (平衡)`、`1K (极速)`。
   * **修改提示词 (Prompt)**：用简明准确的语言描述你希望将选区变成什么。
   * **自动应用选区蒙版**：默认勾选。生成的画面会自动作为新图层置入，并**仅保留圈选区域**，其他原图区域不受影响。
4. 点击 **「🪄 立即执行局部重绘」**。
5. 生成完毕后，图层面板会多出一个自带蒙版的图层，你可以随时使用画笔对边缘做羽化和擦除微调。

#### 💡 局部重绘实战 Prompt 示范：
* **消除/修复**：*“消除选区内的路人和垃圾桶，无缝补全背景中原本延伸的石砖路面和树影。”*
* **置入新物体**：*“在选区的草地上放置一只戴太阳镜的金毛幼犬，阳光照射角度与背景自然统一。”*
* **更换服装/配饰**：*“保持模特姿态与发型不变，将选区内的衣服替换为质感高级的黑色复古机车皮夹克。”*

---

### 2. 🎨 全新文生图（Text-to-Image）

直接输入想象，生成高清独立画面并自动置入画布：

1. 切换到插件面板的 **「🎨 全新生图」** 选项卡。
2. 配置参数：
   * **模型引擎**：`Nano Banana 2.1`（默认，最新且性价比高）、`Nano Banana 2`（上一代，极速出图）、`Nano Banana Pro`（细节精细，擅长复杂逻辑和文字排版）。
   * **画面比例**：支持 `1:1`、`16:9`、`9:16`、`4:3`、`3:4`、`3:2`、`2:3` 等主流比例。
   * **画质选择**：`4K`（默认）、`2K`、`1K`。
   * **提示词**：描述画面构图、主体、光影与风格。如需在画面中排版文字，可用英文双引号包裹（如：`A neon sign on a brick wall reading "OPEN 24H"`）。
3. 点击 **「🎨 生成新画面置入画板」**：
   * 若当前未打开文档，插件会自动新建画板并展现新图；
   * 若已有画板，会自动作为新图层居中置入。

---

## 📂 项目结构说明

```text
GeminiPlugin/
├── manifest.json            # UXP 插件清单（声明权限、尺寸与入口）
├── index.html               # 插件 UI 视图（暗色质感、响应式胶囊选项卡）
├── index.js                 # 核心逻辑（选区裁切、API 传输、图层对位与蒙版批处理）
├── GeminiAI-Generator.ccx   # 一键安装包（双击安装，或解压后放进 Plug-ins 目录）
├── install-mac.command      # macOS 一键安装脚本（自动拷贝到 Plug-ins）
├── install-win.bat          # Windows 一键安装脚本（自动拷贝到 Plug-ins）
└── README.md                # 完整使用说明与开发手册
```

---

## 📄 授权与许可

基于 MIT 许可证开源，欢迎自由修改与二次开发。
