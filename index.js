const { app, core } = require('photoshop');
const fs = require('uxp').storage.localFileSystem;
const formats = require('uxp').storage.formats;

const apiKeyInput = document.getElementById('apiKey');
const modelSelect = document.getElementById('modelSelect');
const aspectRatioSelect = document.getElementById('aspectRatioSelect');
const resSelect = document.getElementById('resSelect');
const promptInput = document.getElementById('prompt');
const generateBtn = document.getElementById('generateBtn');
const statusDiv = document.getElementById('status');

// 初始化：读取本地保存的 API Key
const savedKey = window.localStorage.getItem('gemini_api_key');
if (savedKey) {
  apiKeyInput.value = savedKey;
}

function setStatus(text, isError = false) {
  statusDiv.innerText = text;
  statusDiv.style.color = isError ? '#ff6b6b' : '#69db7c';
}

function base64ToArrayBuffer(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

generateBtn.addEventListener('click', async () => {
  const apiKey = apiKeyInput.value.trim();
  const prompt = promptInput.value.trim();
  const model = modelSelect.value;
  const aspectRatio = aspectRatioSelect.value;
  const resolution = resSelect.value;

  if (!apiKey) {
    return setStatus('请输入有效的 Gemini API Key！', true);
  }
  if (!prompt) {
    return setStatus('请输入生成提示词 (Prompt)！', true);
  }

  // 记住 API Key
  window.localStorage.setItem('gemini_api_key', apiKey);

  generateBtn.disabled = true;
  setStatus(`正在请求 ${model} 生成图片，请稍候...`);

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
      throw new Error('API 返回成功，但未解析到有效的图像数据。');
    }

    setStatus('生图完成，正在置入 Photoshop 画布...');

    // 1. 将 Base64 图片写入 UXP 本地临时文件
    const tempFolder = await fs.getTemporaryFolder();
    const tempFile = await tempFolder.createFile("gemini_ps_generated.png", { overwrite: true });
    const buffer = base64ToArrayBuffer(base64Image);
    await tempFile.write(buffer, { format: formats.binary });

    // 2. 调用 Photoshop 内部执行引擎将临时图片置入画板
    const token = fs.createSessionToken(tempFile);
    await core.executeAsModal(async () => {
      if (app.documents.length === 0) {
        // 若没有打开文档，则直接作为新文档打开
        await app.open(tempFile);
      } else {
        // 置入当前文档作为新图层
        await app.batchPlay([
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
    }, { commandName: "置入 Gemini AI 图像" });

    setStatus('✨ 图片已成功置入 Photoshop 画布！');
  } catch (err) {
    console.error('[GeminiPlugin Error]', err);
    setStatus(`调用失败: ${err.message}`, true);
  } finally {
    generateBtn.disabled = false;
  }
});
