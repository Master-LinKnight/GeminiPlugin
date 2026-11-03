# Gemini AI Generator for Photoshop · v1.2.0

A Photoshop UXP panel that talks directly to Google Gemini image models. Select, type, generate — no Adobe credits involved.

First public release.

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

- The Fill layer mask uses the selection's **bounding rectangle**; irregular selections need manual edge cleanup
- Reference images are prompt-level guidance, not ControlNet-style structural control
- Fixed 90-second request timeout; large images at 4K may need a retry on slow networks
- Input sent to the model is scaled to **1536px** on the long edge to stay under the API payload limit

## Verification

```
File      GeminiAI-Generator.ccx
Size      11167 bytes
SHA-256   3f516f5632b620855755c1eedf84b6b7336d85941427a8d231244c3d621378d0
SHA-1     1cd8877cb94529a9d312dfdc414998244063d46b
```

MIT License
