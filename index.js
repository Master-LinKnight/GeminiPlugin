const { app, core, action } = require('photoshop');
const fs = require('uxp').storage.localFileSystem;
const formats = require('uxp').storage.formats;

// 元素引用
const apiKeyInput = document.getElementById('apiKey');
const statusDiv = document.getElementById('status');

// Tabs
const tabInpaintBtn = document.getElementById('tabInpaintBtn');
const tabT2IBtn = document.getElementById('tabT2IBtn');
const tabInpaint = document.getElementById('tabInpaint');
const tabT2I = document.getElementById('tabT2I');

// 创成式填充 (Inpaint) 控件
const inpaintModelSelect = document.getElementById('inpaintModelSelect');
const inpaintResSelect = document.getElementById('inpaintResSelect');
const inpaintPrompt = document.getElementById('inpaintPrompt');
const autoMaskCheckbox = document.getElementById('autoMaskCheckbox');
const inpaintBtn = document.getElementById('inpaintBtn');

// 文生图 (T2I) 控件
const t2iModelSelect = document.getElementById('t2iModelSelect');
const t2iResSelect = document.getElementById('t2iResSelect');
const t2iAspectSelect = document.getElementById('t2iAspectSelect');
const t2iPrompt = document.getElementById('t2iPrompt');
const t2iBtn = document.getElementById('t2iBtn');

// 1. 初始化：读取本地保存的 API Key
const savedKey = window.localStorage.getItem('gemini_api_key');
if (savedKey) {
  apiKeyInput.value = savedKey;
}

// 2. Tab 切换逻辑
tabInpaintBtn.addEventListener('click', () => {
  tabInpaintBtn.classList.add('active');
  tabT2IBtn.classList.remove('active');
  tabInpaint.classList.add('active');
  tabT2I.classList.remove('active');
});

tabT2IBtn.addEventListener('click', () => {
  tabT2IBtn.classList.add('active');
  tabInpaintBtn.classList.remove('active');
  tabT2I.classList.add('active');
  tabInpaint.classList.remove('active');
});

function setStatus(text, isError = false) {
  statusDiv.innerText = text;
  statusDiv.style.color = isError ? '#ff6b6b' : '#69db7c';
}

// 安全的分块 ArrayBuffer 转 Base64（避免大图栈溢出）
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// 检测当前文档是否有活动选区
function hasActiveSelection(doc) {
  try {
    return !!(doc && doc.selection && doc.selection.bounds && doc.selection.bounds.width > 0 && doc.selection.bounds.height > 0);
  } catch (e) {
    return false;
  }
}

// ==========================================
// 功能一：创成式填充 (Generative Fill / 局部重绘)
// ==========================================
inpaintBtn.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  const prompt = inpaintPrompt.value.trim();
  const model = inpaintModelSelect.value;
  const resolution = inpaintResSelect.value;
  const shouldApplyMask = autoMaskCheckbox.checked;

  if (!apiKey) return setStatus('请输入有效的 Gemini API Key！', true);
  if (!prompt) return setStatus('请输入填充/修改提示词！', true);

  if (app.documents.length === 0) {
    return setStatus('请先在 Photoshop 中打开一张图片或新建画板！', true);
  }

  const activeDoc = app.activeDocument;
  const hasSelection = hasActiveSelection(activeDoc);

  window.localStorage.setItem('gemini_api_key', apiKey);
  inpaintBtn.disabled = true;

  try {
    setStatus('正在捕获当前画板并准备图像数据...');

    // 1. 导出当前文档可见内容为临时 PNG
    const tempFolder = await fs.getTemporaryFolder();
    const inputTempFile = await tempFolder.createFile("ps_inpaint_doc_input.png", { overwrite: true });

    await core.executeAsModal(async () => {
      await activeDoc.saveAs.png(inputTempFile, {
        compression: 6,
        interlaced: false
      }, true); // asCopy = true，不破坏当前文档图层状态
    }, { commandName: "导出画板用于创成式填充" });

    // 2. 读取图片并编码为 Base64
    const inputBuffer = await inputTempFile.read({ format: formats.binary });
    const base64Input = arrayBufferToBase64(inputBuffer);

    // 3. 构建多模态 Inpainting 增强提示词
    let systemInstruction = "";
    if (hasSelection) {
      systemInstruction =
        `Task: Professional Photoshop Generative Fill (Inpainting).\n` +
        `Context: The user has lassoed or selected a specific region in this image to replace or fill.\n` +
        `Fill instruction: "${prompt}".\n` +
        `Requirements: Seamlessly generate the requested elements in the region. Ensure perfect match with the surrounding lighting, shadow angles, optical perspective, camera depth of field, and image resolution. Untouched background areas must remain completely faithful and consistent.`;
    } else {
      systemInstruction =
        `Task: Professional Photoshop Image Modification.\n` +
        `Instruction: "${prompt}".\n` +
        `Requirements: Modify the image according to the instruction while maintaining photorealism, style consistency, and high fidelity.`;
    }

    setStatus(`正在向 ${model} 发起创成式填充推理...`);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const payload = {
      contents: [{
        parts: [
          {
            inlineData: {
              mimeType: "image/png",
              data: base64Input
            }
          },
          { text: systemInstruction }
        ]
      }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: {
          imageSize: resolution
        }
      }
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const errMsg = errData.error?.message || `HTTP ${res.status}: ${res.statusText}`;
      throw new Error(errMsg);
    }

    const data = await res.json();
    let base64Output = null;

    const parts = data.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        base64Output = part.inlineData.data;
        break;
      }
    }

    if (!base64Output) {
      throw new Error('API 返回成功，但未解析到填充图像数据。');
    }

    setStatus('填充完成，正在置入画板并构建图层蒙版...');

    // 4. 将返回的图像保存到临时文件
    const outTempFile = await tempFolder.createFile("ps_inpaint_result.png", { overwrite: true });
    await outTempFile.write(base64ToArrayBuffer(base64Output), { format: formats.binary });

    // 5. 置入新图层并自动赋予选区蒙版
    const fileToken = fs.createSessionToken(outTempFile);
    await core.executeAsModal(async () => {
      // 置入图片
      await action.batchPlay([
        {
          _obj: "placeEvent",
          ID: 1,
          null: {
            _path: fileToken,
            _kind: "local"
          },
          freeTransformCenterState: {
            _enum: "quadCenterState",
            _value: "QCSAverage"
          },
          offset: {
            _obj: "offset",
            horizontal: { _unit: "pixelsUnit", _value: 0 },
            vertical: { _unit: "pixelsUnit", _value: 0 }
          },
          linked: false
        }
      ], {});

      // 如果之前存在选区并且勾选了自动蒙版，给新图层添加选区蒙版
      if (hasSelection && shouldApplyMask) {
        try {
          await action.batchPlay([
            {
              _obj: "make",
              new: { _class: "channel" },
              at: [{ _ref: "channel", _enum: "channel", _value: "mask" }],
              using: { _enum: "userMaskEnabled", _value: "revealSelection" }
            }
          ], { synchronousExecution: true, dialogMode: "no" });
        } catch (mErr) {
          console.warn("[Mask creation note]", mErr);
        }
      }
    }, { commandName: "执行创成式填充" });

    setStatus('✨ 创成式填充成功！新图层已置入（自带选区蒙版，可随时用画笔微调）。');
  } catch (err) {
    console.error('[Inpaint Error]', err);
    setStatus(`填充失败: ${err.message}`, true);
  } finally {
    inpaintBtn.disabled = false;
  }
});

// ==========================================
// 功能二：全新文生图 (Text-to-Image)
// ==========================================
t2iBtn.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  const prompt = t2iPrompt.value.trim();
  const model = t2iModelSelect.value;
  const aspectRatio = t2iAspectSelect.value;
  const resolution = t2iResSelect.value;

  if (!apiKey) return setStatus('请输入有效的 Gemini API Key！', true);
  if (!prompt) return setStatus('请输入生成提示词 (Prompt)！', true);

  window.localStorage.setItem('gemini_api_key', apiKey);
  t2iBtn.disabled = true;
  setStatus(`正在请求 ${model} 生成全新画面...`);

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const payload = {
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: {
          aspectRatio: aspectRatio,
          imageSize: resolution
        }
      }
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      const errMsg = errData.error?.message || `HTTP ${res.status}: ${res.statusText}`;
      throw new Error(errMsg);
    }

    const data = await res.json();
    let base64Image = null;

    const parts = data.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        base64Image = part.inlineData.data;
        break;
      }
    }

    if (!base64Image) {
      throw new Error('未在模型响应中找到有效的图像数据。');
    }

    setStatus('生图完成，正在置入画板...');

    const tempFolder = await fs.getTemporaryFolder();
    const tempFile = await tempFolder.createFile("gemini_t2i_output.png", { overwrite: true });
    await tempFile.write(base64ToArrayBuffer(base64Image), { format: formats.binary });

    const token = fs.createSessionToken(tempFile);
    await core.executeAsModal(async () => {
      if (app.documents.length === 0) {
        await app.open(tempFile);
      } else {
        await action.batchPlay([
          {
            _obj: "placeEvent",
            ID: 1,
            null: {
              _path: token,
              _kind: "local"
            },
            freeTransformCenterState: {
              _enum: "quadCenterState",
              _value: "QCSAverage"
            },
            offset: {
              _obj: "offset",
              horizontal: { _unit: "pixelsUnit", _value: 0 },
              vertical: { _unit: "pixelsUnit", _value: 0 }
            },
            linked: false
          }
        ], {});
      }
    }, { commandName: "置入全新 AI 图像" });

    setStatus('✨ 新图片已成功置入画布！');
  } catch (err) {
    console.error('[T2I Error]', err);
    setStatus(`调用失败: ${err.message}`, true);
  } finally {
    t2iBtn.disabled = false;
  }
});
