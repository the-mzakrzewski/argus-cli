// HTML page rendered in the browser after the OAuth loopback callback (`argus login`).
export function callbackPage(success: boolean, title: string, message: string): string {
    const accent = success ? '#4ade80' : '#f87171'
    const mark = success
        ? '<path class="mark" d="M15 25.5l6.5 6.5L34 19"/>'
        : '<path class="mark" d="M17.5 17.5l13 13m0-13l-13 13"/>'
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ARGUS CLI — ${title}</title>
<style>
:root{color-scheme:dark}
*{margin:0;box-sizing:border-box}
body{min-height:100vh;display:grid;place-items:center;padding:24px;background:#0a0a0a;background-image:radial-gradient(640px 320px at 50% -10%,${accent}14,transparent 70%);font-family:ui-monospace,'SF Mono',SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace;color:#e5e5e5}
main{width:100%;max-width:26rem;background:#171717;border:1px solid #262626;border-radius:12px;padding:40px 36px;text-align:center;animation:rise .5s cubic-bezier(.22,1,.36,1) both}
.brand{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:32px;animation:fade .6s .05s both}
.brand span{font-size:13px;letter-spacing:.35em;color:#a3a3a3}
.brand em{font-style:normal;font-size:10px;letter-spacing:.15em;color:#737373;border:1px solid #333;border-radius:4px;padding:2px 6px}
svg{display:block;margin:0 auto 24px;color:${accent}}
.ring{stroke-dasharray:139;stroke-dashoffset:139;animation:draw .6s .15s ease-out forwards}
.mark{stroke-dasharray:40;stroke-dashoffset:40;animation:draw .35s .6s ease-out forwards}
h1{font-size:20px;font-weight:600;letter-spacing:-.01em;animation:fade .6s .25s both}
p{margin-top:12px;font-size:13px;line-height:1.7;color:#a3a3a3;animation:fade .6s .35s both}
.prompt{margin-top:28px;padding-top:20px;border-top:1px solid #262626;font-size:12px;color:#525252;animation:fade .6s .45s both}
.prompt b{font-weight:400;color:${accent}}
@keyframes rise{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:none}}
@keyframes fade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes draw{to{stroke-dashoffset:0}}
@media (prefers-reduced-motion:reduce){*{animation:none!important}.ring,.mark{stroke-dashoffset:0}}
</style>
</head>
<body>
<main>
<div class="brand"><span>ARGUS</span><em>CLI</em></div>
<svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
<circle class="ring" cx="24" cy="24" r="22"/>
${mark}
</svg>
<h1>${title}</h1>
<p>${message}</p>
<p class="prompt">$ argus login <b>${success ? '✓' : '✗'}</b></p>
</main>
</body>
</html>`
}
