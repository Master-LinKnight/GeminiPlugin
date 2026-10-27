const { app, core, action, constants } = require('photoshop');
const fs = require('uxp').storage.localFileSystem;
const formats = require('uxp').storage.formats;

// 元素引用
const apiKeyInput = document.getElementById('apiKey');
const testKeyBtn = document.getElementById('testKeyBtn');
const statusDiv = document.getElementById('status');

// Tabs
const tabInpaintBtn = document.getElementById('tabInpaintBtn');
const tabT2IBtn = document.getElementById('tabT2IBtn');
const tabInpaint = document.getElementById('tabInpaint');
const tabT2I = document.getElementById('tabT2I');

// 局部重绘 (Inpaint) 控件
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

// 参考图（可选）控件
const inpaintRefBtn = document.getElementById('inpaintRefBtn');
const inpaintRefName = document.getElementById('inpaintRefName');
const inpaintRefClear = document.getElementById('inpaintRefClear');
const t2iRefBtn = document.getElementById('t2iRefBtn');
const t2iRefName = document.getElementById('t2iRefName');
const t2iRefClear = document.getElementById('t2iRefClear');

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

// ==========================================
// 参考图（可选）
// ==========================================
const REF_MAX_BYTES = 8 * 1024 * 1024; // 8MB，预留 base64 膨胀与主图的空间
const REF_MIME_BY_EXT = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp'
};
const refImages = { inpaint: null, t2i: null };

function formatSize(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return Math.round(bytes / 1024) + ' KB';
}

function renderRef(tab) {
  const ref = refImages[tab];
  const nameEl = tab === 'inpaint' ? inpaintRefName : t2iRefName;
  const clearEl = tab === 'inpaint' ? inpaintRefClear : t2iRefClear;

  if (ref) {
    nameEl.innerText = `${ref.name}（${formatSize(ref.bytes)}）`;
    nameEl.classList.add('has-file');
    clearEl.style.display = '';
  } else {
    nameEl.innerText = '未选择';
    nameEl.classList.remove('has-file');
    clearEl.style.display = 'none';
  }
}

// 读取参考图为 base64；返回 null 表示用户取消或校验失败
async function pickRefImage(tab) {
  try {
    const file = await fs.getFileForOpening({ types: ['jpg', 'jpeg', 'png', 'webp'] });
    if (!file) return null; // 用户取消选择

    const ext = (file.name.split('.').pop() || '').toLowerCase();
    const mimeType = REF_MIME_BY_EXT[ext];
    if (!mimeType) {
      setStatus('不支持的参考图格式，请使用 JPG / PNG / WebP。', true);
      return null;
    }

    const buffer = await file.read({ format: formats.binary });
    const bytes = buffer.byteLength;
    if (bytes > REF_MAX_BYTES) {
      setStatus(`参考图过大（${formatSize(bytes)}），请压缩到 ${formatSize(REF_MAX_BYTES)} 以内。`, true);
      return null;
    }

    refImages[tab] = {
      name: file.name,
      mimeType,
      bytes,
      base64: arrayBufferToBase64(buffer)
    };
    renderRef(tab);
    setStatus(`已选择参考图：${file.name}（${formatSize(bytes)}）`);
    return refImages[tab];
  } catch (e) {
    console.error('[Pick reference image error]', e);
    setStatus(`读取参考图失败: ${e.message}`, true);
    return null;
  }
}

inpaintRefBtn.addEventListener('click', () => pickRefImage('inpaint'));
t2iRefBtn.addEventListener('click', () => pickRefImage('t2i'));

inpaintRefClear.addEventListener('click', () => {
  refImages.inpaint = null;
  renderRef('inpaint');
  setStatus('已清除参考图，恢复纯选区重绘模式。');
});

t2iRefClear.addEventListener('click', () => {
  refImages.t2i = null;
  renderRef('t2i');
  setStatus('已清除参考图。');
});

// ==========================================
// 选区与置入几何工具
// ==========================================
const MAX_MODEL_DIM = 1536;   // 送模型的最长边
const SEL_PADDING_RATIO = 0.15; // 选区外扩比例（用于边缘融合）
const SEL_PADDING_MIN = 32;   // 选区外扩最小像素

// 读取当前选区矩形，无选区返回 null
function getSelectionRect(doc) {
  try {
    const b = doc && doc.selection && doc.selection.bounds;
    if (!b) return null;
    const width = b.right - b.left;
    const height = b.bottom - b.top;
    if (!(width > 0) || !(height > 0)) return null;
    return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width, height };
  } catch (e) {
    return null;
  }
}

// 选区外扩一圈作为融合上下文，并限制在画布内
function expandRect(rect, docW, docH) {
  const pad = Math.max(SEL_PADDING_MIN, Math.round(Math.max(rect.width, rect.height) * SEL_PADDING_RATIO));
  const left = Math.max(0, Math.floor(rect.left - pad));
  const top = Math.max(0, Math.floor(rect.top - pad));
  const right = Math.min(docW, Math.ceil(rect.right + pad));
  const bottom = Math.min(docH, Math.ceil(rect.bottom + pad));
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

// 复制画板 -> 转 8 位 -> 裁切到目标矩形 -> 智能缩放 -> 导出 JPEG（原画板不受影响）
async function exportRegionToJpeg(activeDoc, rect, file) {
  await core.executeAsModal(async () => {
    const dupDoc = await activeDoc.duplicate("temp_gemini_region.psd", true);
    try {
      try {
        await action.batchPlay([{
          _obj: "convertMode",
          to: { _obj: "mode", _enum: "mode", _value: "RGBColor" },
          bitsPerChannel: 8
        }], { synchronousExecution: true });
      } catch (e) {
        console.warn("[Convert mode note]", e);
      }

      await dupDoc.crop({
        top: rect.top,
        left: rect.left,
        bottom: rect.bottom,
        right: rect.right
      });

      const w = dupDoc.width;
      const h = dupDoc.height;
      if (w > MAX_MODEL_DIM || h > MAX_MODEL_DIM) {
        const scale = MAX_MODEL_DIM / Math.max(w, h);
        await dupDoc.resizeImage(Math.round(w * scale), Math.round(h * scale));
      }

      await dupDoc.saveAs.jpg(file, { quality: 9 }, true);
    } finally {
      await dupDoc.closeWithoutSaving();
    }
  }, { commandName: "裁切并优化重绘区域" });
}

// 将返回的图片置入画板，并精确缩放/移动到目标矩形后再加选区蒙版
// maskRect 为 null 表示不加蒙版；否则用该矩形兜底恢复选区
async function placeImageIntoRect(tempFile, rect, expectedDocId, maskRect) {
  const token = fs.createSessionToken(tempFile);
  let fitted = true;

  await core.executeAsModal(async () => {
    const targetDoc = app.activeDocument;
    if (expectedDocId != null && (!targetDoc || targetDoc.id !== expectedDocId)) {
      throw new Error('生成期间画板被切换，为避免误置入已取消操作，请回到原画板后重试。');
    }

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

    const doc = app.activeDocument;
    const layer = doc.activeLayers && doc.activeLayers[0];

    // 关键：把置入层拉伸到裁切矩形，保证像素与选区坐标严格对齐
    if (layer && rect) {
      try {
        let b = layer.bounds;
        const curW = b.right - b.left;
        const curH = b.bottom - b.top;
        if (curW > 0 && curH > 0) {
          const scaleX = (rect.width / curW) * 100;
          const scaleY = (rect.height / curH) * 100;
          if (Math.abs(scaleX - 100) > 0.05 || Math.abs(scaleY - 100) > 0.05) {
            await layer.resize(scaleX, scaleY, constants.AnchorPosition.TOPLEFT);
            b = layer.bounds;
          }
          const dx = rect.left - b.left;
          const dy = rect.top - b.top;
          if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01) {
            await layer.translate(dx, dy);
          }
        }
      } catch (fitErr) {
        fitted = false;
        console.warn("[Fit placement note]", fitErr);
      }
    }

    if (maskRect) {
      try {
        // 置入过程中选区若被清除，用原选区范围兜底恢复，保证蒙版仍然正确
        if (!getSelectionRect(doc)) {
          await doc.selection.selectRectangle({
            top: maskRect.top,
            left: maskRect.left,
            bottom: maskRect.bottom,
            right: maskRect.right
          });
        }
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
  }, { commandName: "置入 AI 重绘图层" });

  return fitted;
}

// ==========================================
// API Key 连通性测试
// ==========================================
testKeyBtn.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) return setStatus('请先输入 Gemini API Key！', true);

  setStatus('正在测试 Google Gemini 接口连通性...');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);

  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error?.message || `HTTP ${res.status}`);
    }
    window.localStorage.setItem('gemini_api_key', apiKey);
    setStatus('✅ 验证成功！API Key 有效且网络连接顺畅。');
  } catch (err) {
    console.error('[Test Connection Error]', err);
    let msg = err.message;
    if (err.name === 'AbortError') {
      msg = '连接超时（12秒）。请检查代理工具是否开启了「增强模式 / TUN 虚拟网卡模式」。';
    } else if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      msg = '网络无法直连 Google 服务器。请检查科学上网/代理工具是否开启全局或 TUN 模式。';
    }
    setStatus(`❌ 连通性测试失败: ${msg}`, true);
  }
});

// ==========================================
// 功能一：局部重绘 / 创成式填充 (Inpainting)
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
  const docW = Math.floor(activeDoc.width);
  const docH = Math.floor(activeDoc.height);

  // 有选区：只裁「选区 + 外扩边距」送模型；无选区：退回整画布
  const selectionRect = getSelectionRect(activeDoc);
  const hasSelection = !!selectionRect;
  const targetRect = hasSelection
    ? expandRect(selectionRect, docW, docH)
    : { left: 0, top: 0, right: docW, bottom: docH, width: docW, height: docH };

  window.localStorage.setItem('gemini_api_key', apiKey);
  inpaintBtn.disabled = true;

  try {
    setStatus(hasSelection ? '正在裁切选区并优化图像...' : '正在优化画板图像...');

    const tempFolder = await fs.getTemporaryFolder();
    const inputTempFile = await tempFolder.createFile("ps_inpaint_doc_input.jpg", { overwrite: true });

    // 1. 复制画板 -> 转 8 位 -> 裁切到目标矩形 -> 智能缩放（原画板 100% 不受影响）
    await exportRegionToJpeg(activeDoc, targetRect, inputTempFile);

    // 2. 读取优化后的图片并编码为 Base64
    const inputBuffer = await inputTempFile.read({ format: formats.binary });
    const base64Input = arrayBufferToBase64(inputBuffer);
    const sizeKb = Math.round(inputBuffer.byteLength / 1024);

    // 3. 构建多模态 Inpainting 增强提示词
    const refImage = refImages.inpaint;
    const refNote = refImage
      ? `\nReference: a SECOND image is attached and is ONLY a style / subject / color-palette reference. The FIRST image is the one to edit. Do not copy the reference's composition, framing, background or camera angle.\n`
      : '';

    let systemInstruction = "";
    if (hasSelection) {
      systemInstruction =
        `Task: Professional Photoshop Generative Fill (Inpainting).\n` +
        `Context: This image is a cropped region (${targetRect.width}x${targetRect.height}px) taken from a larger photo. The user's selected area is roughly the central part of this crop; the surrounding border is context provided only for seamless blending.\n` +
        `Fill instruction: "${prompt}".\n` +
        refNote +
        `Requirements: Modify only the central selected area. Keep the outer border pixels as close to the original as possible, and make the new content blend seamlessly with the surrounding lighting, shadow direction, optical perspective, camera depth of field and grain. Return the exact same framing and aspect ratio as the input crop.`;
    } else {
      systemInstruction =
        `Task: Professional Photoshop Image Modification.\n` +
        `Instruction: "${prompt}".\n` +
        refNote +
        `Requirements: Modify the image according to the instruction while maintaining photorealism, style consistency, and high fidelity. Return the exact same framing and aspect ratio as the input image.`;
    }

    setStatus(`区域已优化 (${targetRect.width}x${targetRect.height} / ${sizeKb}KB)${refImage ? ' + 参考图' : ''}，正在向 ${model} 发起创意图层推理...`);

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const requestParts = [
      {
        inlineData: {
          mimeType: "image/jpeg",
          data: base64Input
        }
      }
    ];
    // 参考图必须排在待编辑图之后，并在提示词中明确"第一张是要改的"
    if (refImage) {
      requestParts.push({
        inlineData: {
          mimeType: refImage.mimeType,
          data: refImage.base64
        }
      });
    }
    requestParts.push({ text: systemInstruction });

    const payload = {
      contents: [{
        parts: requestParts
      }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: {
          imageSize: resolution
        }
      }
    };

    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), 90000); // 90秒超时

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutTimer);

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

    // 5. 精确回贴到裁切矩形（保证蒙版坐标对齐），并自动赋予选区蒙版
    const fitted = await placeImageIntoRect(
      outTempFile,
      targetRect,
      activeDoc.id,
      hasSelection && shouldApplyMask ? selectionRect : null
    );

    if (!fitted) {
      setStatus('⚠️ 图层已置入，但自动对位失败，请手动缩放/移动该图层。', true);
    } else {
      setStatus(hasSelection && shouldApplyMask
        ? '✨ 局部重绘成功！新图层已精确对位，并自带选区蒙版。'
        : '✨ 局部重绘成功！新图层已精确对位置入。');
    }
  } catch (err) {
    console.error('[Inpaint Error]', err);
    let msg = err.message;
    if (err.name === 'AbortError') {
      msg = '请求超时（90秒）。请检查代理工具是否开启了全局或 TUN 虚拟网卡模式。';
    } else if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      msg = '网络无法直连 Google 官方接口。请检查代理工具是否已开启 TUN 增强模式。';
    }
    setStatus(`重绘失败: ${msg}`, true);
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
  setStatus(`正在请求 ${model} 生成全新画面${refImages.t2i ? '（含参考图）' : ''}...`);

  try {
    const refImage = refImages.t2i;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    // 参考图作为额外的图像 part 传入，并明确要求"生成新画面"而不是"修图"
    const textPart = refImage
      ? `A reference image is attached. Use it ONLY as guidance for subject, style, mood and color palette, then generate a brand-new image that follows the instruction below. Do not copy the reference's exact composition or simply retouch it.\n\nInstruction: ${prompt}`
      : prompt;

    const requestParts = [];
    if (refImage) {
      requestParts.push({
        inlineData: {
          mimeType: refImage.mimeType,
          data: refImage.base64
        }
      });
    }
    requestParts.push({ text: textPart });

    const payload = {
      contents: [{
        parts: requestParts
      }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: {
          aspectRatio: aspectRatio,
          imageSize: resolution
        }
      }
    };

    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), 90000);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutTimer);

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
    let msg = err.message;
    if (err.name === 'AbortError') {
      msg = '请求超时（90秒）。请检查代理工具是否开启了全局或 TUN 虚拟网卡模式。';
    } else if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
      msg = '网络无法直连 Google 官方接口。请检查代理工具是否已开启 TUN 增强模式。';
    }
    setStatus(`调用失败: ${msg}`, true);
  } finally {
    t2iBtn.disabled = false;
  }
});
