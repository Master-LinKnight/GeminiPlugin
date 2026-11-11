const { app, core, action, constants } = require('photoshop');
const fs = require('uxp').storage.localFileSystem;
const formats = require('uxp').storage.formats;

// 元素引用
const apiKeyInput = document.getElementById('apiKey');
const apiKeyError = document.getElementById('apiKeyError');
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

// UXP 里 <input> 的 value 在没赋值前可能是 null（不是 ''），
// 直接 .trim() 会抛 TypeError 并中断整个脚本，所以统一走这里取字符串。
function textOf(el) {
  if (!el) return '';
  const v = el.value;
  return typeof v === 'string' ? v.trim() : '';
}

// 1. 初始化：读取本地保存的 API Key（整段容错，绝不允许它中断后续事件绑定）
try {
  const savedKey = window.localStorage.getItem('gemini_api_key');
  if (savedKey) {
    apiKeyInput.value = savedKey;
  }
  apiKeyInput.addEventListener('input', clearApiKeyError);
  apiKeyInput.addEventListener('change', clearApiKeyError);
  const initialKey = textOf(apiKeyInput);
  console.log('[Gemini] load | savedKeyLen=' + (savedKey ? savedKey.length : 0) +
    ' inputLen=' + initialKey.length);

  // 打开面板时直接给出 Key 状态，不用等用户点按钮
  if (!initialKey) {
    showApiKeyHint('尚未填写 API Key，填写后才能生成或测试连接。', 'warn');
  } else {
    showApiKeyHint('已载入本地保存的 API Key（要更换请清空后重新填写）。', 'info');
  }
} catch (keyInitErr) {
  console.warn('[Gemini] key init failed', keyInitErr);
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

// 主按钮用 div 绘制（原生 <button> 的背景会被 UXP 主题覆盖成灰色），
// 这里统一维护「忙碌 / 禁用」状态，并阻止重复点击。
function setButtonBusy(btn, busy) {
  if (!btn) return;
  btn.disabled = !!busy;
  if (busy) {
    btn.classList.add('is-disabled');
  } else {
    btn.classList.remove('is-disabled');
  }
}

// API Key 为空的就地提示：红框 + 输入框下方红字 + 底部状态，避免提示藏在面板最底部看不到
function showApiKeyHint(message, kind) {
  console.log('[Gemini] api key hint: ' + message);
  if (apiKeyError) {
    apiKeyError.innerText = message;
    apiKeyError.style.display = 'block';
    apiKeyError.classList.remove('warn');
    apiKeyError.classList.remove('info');
    apiKeyError.classList.add(kind === 'info' ? 'info' : 'warn');
  }
}

function showApiKeyError(message) {
  console.log('[Gemini] empty API key -> inline prompt');
  if (apiKeyError) {
    apiKeyError.innerText = message;
    apiKeyError.style.display = 'block';
    apiKeyError.classList.remove('warn');
    apiKeyError.classList.remove('info');
  }
  if (apiKeyInput) {
    apiKeyInput.classList.add('input-invalid');
    try { apiKeyInput.focus(); } catch (e) { /* ignore */ }
    // 面板可能正滚在底部，必须把视线拉回输入框，否则提示看不见
    try {
      if (typeof apiKeyInput.scrollIntoView === 'function') apiKeyInput.scrollIntoView(true);
    } catch (e) { /* ignore */ }
    try {
      if (document.body) document.body.scrollTop = 0;
      if (document.documentElement) document.documentElement.scrollTop = 0;
    } catch (e) { /* ignore */ }
  }
  setStatus(message, true);
}

function clearApiKeyError() {
  if (apiKeyError) {
    apiKeyError.style.display = 'none';
    apiKeyError.classList.remove('warn');
    apiKeyError.classList.remove('info');
  }
  if (apiKeyInput) apiKeyInput.classList.remove('input-invalid');
}

// ==========================================
// 自定义下拉
// UXP 的原生 <select> 自带很高的内边距（约 38px），CSS 压不下去，
// 视觉上会「标签离控件远、控件离下一个标签近」，所以改成 div 绘制，
// 选中值写在 data-value 上，业务代码统一用 controlValue() 读取。
// ==========================================
function controlValue(el) {
  if (!el) return '';
  if (typeof el.value === 'string' && el.value) return el.value;
  return typeof el.getAttribute === 'function' ? (el.getAttribute('data-value') || '') : '';
}

function setupPickers() {
  if (typeof document.querySelectorAll !== 'function') return;
  const wraps = document.querySelectorAll('.picker-wrap');
  if (!wraps || !wraps.length) return;

  const hasClass = (el, name) => !!(el && el.classList && el.classList.contains(name));

  const closeAll = (except) => {
    for (let i = 0; i < wraps.length; i++) {
      if (wraps[i] !== except) wraps[i].classList.remove('open');
    }
  };

  for (let i = 0; i < wraps.length; i++) {
    (function (wrap) {
      const picker = wrap.querySelector('.picker');
      const menu = wrap.querySelector('.picker-menu');
      const valueEl = wrap.querySelector('.picker-value');
      if (!picker || !menu || !valueEl) return;

      const optionEls = menu.querySelectorAll('.picker-option');

      function apply(value) {
        let label = '';
        for (let k = 0; k < optionEls.length; k++) {
          const on = optionEls[k].getAttribute('data-value') === value;
          if (on) {
            label = optionEls[k].textContent;
            optionEls[k].classList.add('selected');
          } else {
            optionEls[k].classList.remove('selected');
          }
        }
        picker.setAttribute('data-value', value);
        picker.value = value; // 兼容旧代码的 .value 读取
        valueEl.textContent = label || value;
      }

      const initial = picker.getAttribute('data-value') ||
        (optionEls[0] ? optionEls[0].getAttribute('data-value') : '');
      apply(initial);

      picker.addEventListener('click', () => {
        const wasOpen = wrap.classList.contains('open');
        closeAll(wrap);
        if (wasOpen) {
          wrap.classList.remove('open');
        } else {
          wrap.classList.add('open');
        }
      });

      menu.addEventListener('click', (e) => {
        let node = e.target;
        while (node && node !== menu && !hasClass(node, 'picker-option')) {
          node = node.parentNode;
        }
        if (!node || node === menu) return;
        apply(node.getAttribute('data-value'));
        wrap.classList.remove('open');
      });
    })(wraps[i]);
  }

  // 点击面板其它地方收起所有下拉
  document.addEventListener('click', (e) => {
    let node = e.target;
    while (node && !hasClass(node, 'picker-wrap')) {
      node = node.parentNode;
    }
    if (!node) closeAll(null);
  });
}

// UXP 里 <label> 和原生控件带一套覆盖不掉的宿主样式，而且面板刚创建时
// getBoundingClientRect() 还全是 0（布局没就绪）。所以这里：
//   1) 用 div.label 代替 <label>，绕开宿主标签样式；
//   2) 布局就绪后再测量（rect 不行就用 offsetTop 兜底），分多次重试；
//   3) 量到真实间距后用负 margin / 相对定位校正到 4px。
function measureGap(label, control) {
  try {
    const lr = label.getBoundingClientRect();
    const cr = control.getBoundingClientRect();
    if (lr && cr && lr.height > 0 && cr.height > 0) {
      return {
        gap: Math.round(cr.top - lr.bottom),
        how: 'rect',
        labelH: Math.round(lr.height),
        ctrlH: Math.round(cr.height)
      };
    }
  } catch (e) { /* ignore */ }
  try {
    const lh = label.offsetHeight;
    const ch = control.offsetHeight;
    if (lh > 0 && ch > 0) {
      return {
        gap: Math.round(control.offsetTop - (label.offsetTop + lh)),
        how: 'offset',
        labelH: lh,
        ctrlH: ch
      };
    }
  } catch (e) { /* ignore */ }
  return null;
}

function normalizeFieldSpacing(attempt) {
  attempt = attempt || 0;
  if (typeof document.querySelectorAll !== 'function') return;
  const fields = document.querySelectorAll('.field');
  if (attempt === 0) {
    let bw = '?', bh = '?';
    try {
      bw = document.body ? document.body.offsetWidth : '?';
      bh = document.body ? document.body.offsetHeight : '?';
    } catch (e) { /* ignore */ }
    console.log('[Gemini] layout body=' + bw + 'x' + bh + ' fields=' + (fields ? fields.length : 0));
  }
  let measured = 0;
  for (let i = 0; fields && i < fields.length; i++) {
    const field = fields[i];
    if (!field.querySelector) continue;
    const label = field.querySelector('.label');
    const control = field.querySelector('input, textarea, .picker');
    if (!label || !control) continue;
    if (control.getAttribute && control.getAttribute('data-spacing') === '1') continue;

    const m = measureGap(label, control);
    if (!m) continue;
    measured++;
    console.log('[Gemini] spacing(' + m.how + '): ' + (label.innerText || '') +
      ' gap=' + m.gap + ' labelH=' + m.labelH + ' ctrlH=' + m.ctrlH);

    if (m.gap > 8) {
      // 第一步：控件负 margin
      control.style.marginTop = (-(m.gap - 4)) + 'px';
      const m2 = measureGap(label, control);
      const gap2 = m2 ? m2.gap : m.gap;
      console.log('[Gemini] after control margin gap=' + gap2);

      if (gap2 > 8) {
        // 第二步：标签 margin-bottom
        label.style.marginBottom = (4 - (gap2 - 4)) + 'px';
        const m3 = measureGap(label, control);
        const gap3 = m3 ? m3.gap : gap2;
        console.log('[Gemini] after label margin gap=' + gap3);

        if (gap3 > 8) {
          // 第三步：相对定位（绘制层位移，任何宿主都生效）
          control.style.position = 'relative';
          control.style.top = (-(gap3 - 4)) + 'px';
          console.log('[Gemini] fallback relative top=' + (-(gap3 - 4)));
        }
      }
    }
    control.setAttribute('data-spacing', '1');
  }
  console.log('[Gemini] spacing pass ' + attempt + ' measured=' + measured);
  if (measured === 0 && attempt < 6) {
    setTimeout(function () { normalizeFieldSpacing(attempt + 1); }, 250 + attempt * 350);
  }
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

// ==========================================
// 图层蒙版：先保住真实选区，再按选区形状建蒙版
// ==========================================
const TMP_MASK_CHANNEL_PREFIX = "GeminiFillMask";

// 把真实选区（套索 / 主体选择 / 魔棒的不规则形状与羽化）固化为临时 Alpha 通道。
// placeEvent 会清掉当前选区，所以必须在发起模型请求之前就先存下来，
// 否则蒙版只能退化成选区的外接矩形（旧版本的 P0 缺陷）。
async function stashSelectionToChannel() {
  const name = `${TMP_MASK_CHANNEL_PREFIX}_${Date.now()}`;
  await action.batchPlay([{
    _obj: "duplicate",
    _target: [{ _ref: "channel", _property: "selection" }],
    name
  }], { synchronousExecution: true });
  return name;
}

// 把通道内容还原成选区
async function restoreSelectionFromChannel(name) {
  await action.batchPlay([{
    _obj: "set",
    _target: [{ _ref: "channel", _property: "selection" }],
    to: { _ref: "channel", _name: name }
  }], { synchronousExecution: true });
}

// 删除临时通道（尽力而为，失败不影响出图结果）
async function removeMaskChannel(docId, name) {
  await action.batchPlay([{
    _obj: "delete",
    _target: [{ _ref: "channel", _name: name }, { _ref: "document", _id: docId }]
  }], { synchronousExecution: true });
}

// 切回复合（RGB）通道：复制/加载通道后 Photoshop 可能把当前通道切到 Alpha，
// 画布会变成黑白蒙版视图，切回来才不会让用户以为图坏了。
async function selectCompositeChannel() {
  try {
    await action.batchPlay([{
      _obj: "select",
      _target: [{ _ref: "channel", _enum: "channel", _value: "RGB" }],
      makeVisible: false
    }], { synchronousExecution: true });
  } catch (e) {
    console.warn("[Select composite channel note]", e);
  }
}

// 等价于菜单「图层 > 图层蒙版 > 显示选区」。
// 注意：at 必须写成引用对象而不是数组，否则 Photoshop 会静默拒绝执行。
async function revealSelectionMask() {
  await action.batchPlay([{
    _obj: "make",
    new: { _class: "channel" },
    at: { _ref: "channel", _enum: "channel", _value: "mask" },
    using: { _enum: "userMaskEnabled", _value: "revealSelection" },
    _options: { dialogOptions: "silent" }
  }], { synchronousExecution: true });
}

// 读取当前图层是否真的带上了图层蒙版（用于校验，避免"以为加了其实没加"）。
// 返回 true / false / null（null = 无法确认，不据此误报失败）。
async function currentLayerHasMask() {
  // 方案一：读图层的 hasUserMask 属性
  try {
    const [desc] = await action.batchPlay([{
      _obj: "get",
      _target: [{ _ref: "layer", _enum: "ordinal", _value: "targetEnum" }],
      _options: { dialogOptions: "silent" }
    }], { synchronousExecution: true });
    const info = (desc && desc.layer) || desc || {};
    if (info.hasUserMask === true) return true;
    if (info.hasUserMask === false) return false;
  } catch (e) {
    console.warn("[Mask verify note]", e);
  }

  // 方案二：直接问 Photoshop 要「当前图层的蒙版通道」。
  // 没有蒙版时这个引用无法解析，会直接报错，所以成功即代表蒙版存在。
  try {
    await action.batchPlay([{
      _obj: "get",
      _target: [{ _ref: "channel", _enum: "channel", _value: "mask" }],
      _options: { dialogOptions: "silent" }
    }], { synchronousExecution: true });
    return true;
  } catch (e) {
    // 两个方案都给不出结论，返回 null
  }
  return null;
}

// 将返回的图片置入画板，精确缩放/移动到目标矩形，并按真实选区形状创建图层蒙版。
// maskPlan = { rect, channelName } 或 null（null 表示不加蒙版）
async function placeImageIntoRect(tempFile, rect, expectedDocId, maskPlan) {
  const token = fs.createSessionToken(tempFile);
  const result = { fitted: true, maskApplied: false, maskError: null };

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

    // 和 Adobe 创成式填充保持一致的图层命名，方便在图层面板里一眼辨认
    if (layer) {
      try {
        layer.name = '生成式填充';
      } catch (nameErr) {
        console.warn("[Rename layer note]", nameErr);
      }
    }

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
        result.fitted = false;
        console.warn("[Fit placement note]", fitErr);
      }
    }

    if (!maskPlan) return;

    if (!layer) {
      result.maskError = new Error("未找到刚置入的图层");
      return;
    }

    // 1) 优先从临时通道还原真实选区形状（套索 / 主体选择 / 羽化都能保留）
    let selectionReady = false;
    if (maskPlan.channelName) {
      try {
        await restoreSelectionFromChannel(maskPlan.channelName);
        await selectCompositeChannel();
        selectionReady = true;
      } catch (restoreErr) {
        console.warn("[Restore selection note]", restoreErr);
      }
    }

    // 2) 通道不可用时，退回选区外接矩形（形状会退化，但不至于没有蒙版）
    if (!selectionReady && maskPlan.rect) {
      try {
        await doc.selection.selectRectangle({
          top: maskPlan.rect.top,
          left: maskPlan.rect.left,
          bottom: maskPlan.rect.bottom,
          right: maskPlan.rect.right
        });
        selectionReady = true;
      } catch (rectErr) {
        console.warn("[Restore rectangle note]", rectErr);
      }
    }

    if (!selectionReady) {
      result.maskError = new Error("选区恢复失败");
      return;
    }

    // 3) 确保置入层是当前图层，再按选区建蒙版
    try {
      doc.activeLayers = [layer];
    } catch (e) {
      // 已经是当前图层时会抛错，忽略即可
    }

    try {
      await revealSelectionMask();
    } catch (maskErr) {
      result.maskError = maskErr;
      console.warn("[Mask creation note]", maskErr);
    }

    result.maskApplied = await currentLayerHasMask();
    console.log("[Mask] applied =", result.maskApplied,
      result.maskError ? `error = ${result.maskError.message}` : "");
  }, { commandName: "置入 AI 重绘图层" });

  return result;
}

// ==========================================
// API Key 连通性测试
// ==========================================
testKeyBtn.addEventListener('click', async () => {
  console.log('[Gemini] click: test | keyLen=' + textOf(apiKeyInput).length);
  try { normalizeFieldSpacing(0); } catch (e) { }
  const apiKey = textOf(apiKeyInput);
  if (!apiKey) return showApiKeyError('API Key 不能为空，请先填写再测试连接。');

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
  console.log('[Gemini] click: inpaint | keyLen=' + textOf(apiKeyInput).length + ' promptLen=' + textOf(inpaintPrompt).length);
  try { normalizeFieldSpacing(0); } catch (e) { }
  if (inpaintBtn.disabled) return;
  const apiKey = textOf(apiKeyInput);
  const prompt = textOf(inpaintPrompt);
  const model = controlValue(inpaintModelSelect);
  const resolution = controlValue(inpaintResSelect);
  const shouldApplyMask = autoMaskCheckbox.checked;

  if (!apiKey) return showApiKeyError('API Key 不能为空，请先填写再执行局部重绘。');
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
  setButtonBusy(inpaintBtn, true);

  // 置入图片会清掉当前选区，套索/主体选择的形状就没了。
  // 所以在请求模型之前，先把真实选区存进一个临时 Alpha 通道，回来后再还原。
  let maskChannel = null;

  try {
    if (hasSelection && shouldApplyMask) {
      setStatus('正在保留选区形状...');
      try {
        await core.executeAsModal(async () => {
          maskChannel = await stashSelectionToChannel();
          await selectCompositeChannel();
        }, { commandName: "保留选区形状" });
      } catch (stashErr) {
        console.warn("[Stash selection note]", stashErr);
        maskChannel = null; // 失败则退回矩形蒙版，不阻断主流程
      }
    }

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

    setStatus(hasSelection && shouldApplyMask
      ? '填充完成，正在置入画板并构建图层蒙版...'
      : '填充完成，正在置入画板...');

    // 4. 将返回的图像保存到临时文件
    const outTempFile = await tempFolder.createFile("ps_inpaint_result.png", { overwrite: true });
    await outTempFile.write(base64ToArrayBuffer(base64Output), { format: formats.binary });

    // 5. 精确回贴到目标矩形，并用真实选区形状创建图层蒙版
    const placement = await placeImageIntoRect(
      outTempFile,
      targetRect,
      activeDoc.id,
      hasSelection && shouldApplyMask
        ? { rect: selectionRect, channelName: maskChannel }
        : null
    );

    if (!placement.fitted) {
      setStatus('⚠️ 图层已置入，但自动对位失败，请手动缩放/移动该图层。', true);
    } else if (hasSelection && shouldApplyMask && placement.maskApplied === false) {
      setStatus(
        `⚠️ 图层已置入，但蒙版创建失败${placement.maskError ? '：' + placement.maskError.message : ''}。` +
        '可手动执行「图层 > 图层蒙版 > 显示选区」补救。',
        true
      );
    } else if (hasSelection && shouldApplyMask) {
      setStatus('✨ 局部重绘成功！新图层已精确对位，并按选区形状生成蒙版。');
    } else {
      setStatus('✨ 局部重绘成功！新图层已精确对位置入。');
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
    // 无论成功失败，都清掉临时通道，不在用户文档里留垃圾
    if (maskChannel) {
      try {
        await core.executeAsModal(async () => {
          await removeMaskChannel(activeDoc.id, maskChannel);
        }, { commandName: "清理临时选区通道" });
      } catch (cleanErr) {
        console.warn("[Remove mask channel note]", cleanErr);
      }
      maskChannel = null;
    }
    setButtonBusy(inpaintBtn, false);
  }
});

// ==========================================
// 功能二：全新文生图 (Text-to-Image)
// ==========================================
t2iBtn.addEventListener('click', async () => {
  console.log('[Gemini] click: t2i | keyLen=' + textOf(apiKeyInput).length + ' promptLen=' + textOf(t2iPrompt).length);
  try { normalizeFieldSpacing(0); } catch (e) { }
  if (t2iBtn.disabled) return;
  const apiKey = textOf(apiKeyInput);
  const prompt = textOf(t2iPrompt);
  const model = controlValue(t2iModelSelect);
  const aspectRatio = controlValue(t2iAspectSelect);
  const resolution = controlValue(t2iResSelect);

  if (!apiKey) return showApiKeyError('API Key 不能为空，请先填写再生成画面。');
  if (!prompt) return setStatus('请输入生成提示词 (Prompt)！', true);

  window.localStorage.setItem('gemini_api_key', apiKey);
  setButtonBusy(t2iBtn, true);
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
    setButtonBusy(t2iBtn, false);
  }
});

// ==========================================
// 初始化：放在所有事件绑定之后，且整体 try/catch，
// 保证纯样式初始化出问题时不会影响按钮功能。
// ==========================================
try {
  setupPickers();
  normalizeFieldSpacing();
  console.log('[Gemini] plugin ready (' + (typeof app !== 'undefined' ? 'PS' : 'unknown') + ')');
} catch (initErr) {
  console.warn('[Gemini] UI init failed', initErr);
}
