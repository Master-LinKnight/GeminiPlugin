# Gemini AI Generator for Photoshop · v1.2.9

A Photoshop UXP panel that talks directly to Google Gemini image models. Select, type, generate — no Adobe credits involved.

## What's new in 1.2.9

**Fixed: every button stopped responding.** On-device log showed `index.js:47 TypeError: Cannot read properties of null (reading 'trim')` during panel load. In UXP, `input.value` is `null` (not `''`) until it's set, so the new load-time `.trim()` threw and aborted the whole script — no listeners were ever attached.

- Added `textOf()` (null → `''`); all key/prompt reads use it.
- Wrapped the key-restore block in try/catch; UI init still runs after all listeners, so one failure can't take the buttons down.
- Version badge at the bottom shows `v1.2.9`.

## What's new in 1.2.8

**The API-key state is now visible without clicking.** Opening the panel shows a hint under the key field: an orange *"尚未填写 API Key"* when empty, or a gray *"已载入本地保存的 API Key"* when a cached key was restored — so it's always clear whether the field is actually empty.

Clicking any action with an empty key shows the red inline error **and scrolls the panel back to the top**, because previously the message could be rendered outside the visible area (the panel was scrolled down to the button), which looked exactly like "no prompt".

Logs now include `savedKeyLen` at load and `keyLen` on every click.

## What's new in 1.2.7

**Root cause found from the UXP log.** The on-device log showed that (a) button clicks work, and (b) `getBoundingClientRect()` returns zeros while the panel is being created, so 1.2.6's runtime measurement never ran.

1.2.7 fixes the spacing for real:

- `<label>` replaced with `<div class="label">` — this bypasses the host stylesheet's label rules, which are the main source of the gap and cannot be overridden with `!important`.
- Measurement now retries after layout (6 passes, 250ms+) **and runs again on every button click**, when the panel is definitely laid out.
- Falls back to `offsetTop`/`offsetHeight` when rects are zero, and finally to `position: relative + top` (a paint offset that works regardless of host margin rules).
- Click logs now include the API-key and prompt lengths, so we can tell whether an empty-key test actually had an empty field.

## What's new in 1.2.6

**Spacing is measured at runtime instead of fought with CSS.** UXP's default label/input spacing can't be reliably overridden with `!important`, so the panel now measures the real gap between each label and its control on load and corrects it (negative margin → label margin → relative offset, in that order). A version badge at the bottom of the panel (`v1.2.6`) confirms which build Photoshop actually loaded, and init/click/spacing details are logged to the UXP log for on-device diagnosis.

## What's new in 1.2.5

**Empty API key now tells you** — clicking *Test connection*, *Run generative fill* or *Generate image* with no key:

- turns the key field's border red and shows an inline red message under it (wording differs per action),
- focuses the field and scrolls it into view,
- also reports in the status line,
- and clears as soon as you start typing.

**Label/input spacing tightened** — UXP adds default margins to `label` and native `input`/`textarea`, which pushed every label far from its control. Those are reset now (`margin: 0 !important`), so the rhythm is the one we define: 4px from label to control, 16px between fields.

## What's new in 1.2.4

**Primary button is blue again** — UXP renders native `<button>` backgrounds from the host theme, so our `background` was covered: it showed up as a gray face with a thin blue ring. The CTA is now a div-based button with the intended blue (`#1473e6`, hover `#0d66d0`, active `#0b5bbf`), a proper gray "busy" state, and a guard against double clicks. The reference-image buttons moved to the same approach so they match the dark panel.

## What's new in 1.2.3

**Dropdowns and spacing reworked** — the panel finally reads as clean groups instead of one cramped column:

- **Wider panel**: 420×760 floating, 400×700 docked, 340×520 minimum.
- **Native `<select>` replaced with a custom picker**: UXP renders native selects with ~38px of built-in padding that CSS cannot shrink, which made every label look far from its control and the next label look too close. The pickers are now 32px tall, drawn with the panel's dark styling (hover highlight, blue selected item, caret).
- **Spacing rhythm**: label → control is 4px, control → next label is 16px, so each field reads as one group.
- `controlValue()` reads `value` with a `data-value` fallback, so switching to custom controls can never silently pass an empty model/resolution to the API.

## What's new in 1.2.2

**Panel layout rebuilt** — the panel no longer feels cramped, and nothing truncates when it is docked narrow:

- Model / quality now sit side by side and **wrap to a single column automatically** when the panel gets narrow, so the selects always show the full name instead of "Nano Banana…".
- Default size is **360×680** (docked 340 wide, minimum 280), up from 320×620 / 260.
- Consistent 30px inputs, 5px radii, a taller prompt box, and a larger primary button.
- Shorter copy: model options are `Nano Banana 2.1 / 2 / Pro` with a one-line legend, and hints are trimmed.
- Status text wraps by word, so long errors no longer leave a lone punctuation mark on its own line.

## What's new in 1.2.1

**Layer mask now actually works** — the Fill result layer carries a real layer mask, exactly like Adobe Generative Fill, instead of silently having none:

- Fixed the mask-creation action descriptor (`at` must be a reference object, not an array). The previous form was rejected by Photoshop and the error was swallowed, so no mask was ever created.
- The layer is now masked with the **real selection shape** (lasso / subject / magic wand, including feather), not its bounding rectangle. The selection is stashed into a temporary alpha channel before the model request (placing an image clears the live selection) and restored afterwards.
- The temporary channel is always removed and the composite channel is re-selected, so the document stays clean and the canvas never flips to a black-and-white channel view.
- The new layer is named **生成式填充 / Generative Fill**.
- Mask creation is verified by reading the layer back; if it ever fails, the panel says so instead of reporting success.

**Installable `.ccx`** — the package now contains the panel icons declared in `manifest.json`. Without them the Creative Cloud installer unpacks the files but never registers the plugin, so it never appears in Photoshop. Verified by installing the package through Adobe's own `UnifiedPluginInstallerAgent` (it shows up as *Enabled* for Photoshop 2026). Note: that installer prints `status = -190` even when it succeeds — check the extension list, not the exit message.

## Features

**🪄 Generative Fill** — Select any region, describe the result. The plugin crops that area (plus a small context margin), sends it to Gemini, and places the result back as a precisely aligned new layer with a selection-derived layer mask. Your original document and history stay untouched — all processing happens on a temporary copy.

**🎨 Text to Image** — Describe a scene and get a high-resolution image placed as a new layer. Aspect ratios `1:1 / 16:9 / 9:16 / 4:3 / 3:4 / 3:2 / 2:3`; quality `1K / 2K / 4K`.

**🖼 Reference Image (optional)** — Attach a JPG / PNG / WebP (≤ 8 MB) as subject, style or palette guidance in both modes. The reference is sent as a separate image part and is explicitly instructed to guide — not to be copied. Leave it empty and behaviour is identical to plain prompting.

## Models

| Panel name | Model ID |
|---|---|
| Nano Banana 2.1 (default) | `gemini-nano-banana-2.1` |
| Nano Banana 2 | `gemini-3.1-flash-image` |
| Nano Banana Pro | `gemini-3-pro-image` |

## Requirements

- Photoshop **25.0+** (Windows / macOS)
- A Gemini API key — [Google AI Studio](https://aistudio.google.com/app/apikey), free to create
- Network access to `generativelanguage.googleapis.com`

> Photoshop is a separate desktop process, so a browser-only proxy usually won't apply. Enable **TUN mode** in your proxy client. Use the built-in **⚡ Test connection** button to verify before generating.

## Install

1. **Double-click** `GeminiAI-Generator.ccx` → confirm in Creative Cloud → restart Photoshop → **Plugins ▸ Gemini AI Generator**
2. **Offline**: unzip the three files into `<Photoshop>/Plug-ins/GeminiAI-Generator/` (manifest must sit directly in that folder)
3. **Developers**: USP Developer Tool → Add Plugin → `docs/manifest.json`

## First run

Paste your `AIzaSy...` key (stored locally), hit **⚡ Test connection**, then pick a mode and generate.

## Pricing

Pay-as-you-go, billed by Google. Roughly **$0.134** per 2K image and **$0.24** per 4K. The panel defaults to 4K — switch to 2K to cut cost by ~45%. Check Google's official pricing for current rates.

## Permissions

- `network` — access the Gemini API
- `localFileSystem` — read the reference image you pick manually (nothing else is scanned or uploaded)

## Known limitations

- Reference images are prompt-level guidance, not ControlNet-style structural control
- Fixed 90-second request timeout; large images at 4K may need a retry on slow networks
- Input sent to the model is scaled to **1536px** on the long edge to stay under the API payload limit

## Verification

```
File      GeminiAI-Generator.ccx
Size      22073 bytes
SHA-256   2c521a2a4ef5c4153af30c151b71fe3afa867a7bb92b2e25648aa98d064bdc3a
SHA-1     6d607cd0a848e7f2eee46d06bff9f69ac2fa57a7
```

MIT License
