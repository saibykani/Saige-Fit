// Web-only global CSS, injected once. Imported by *.web.tsx files only (never bundled for Android).
let done = false;
export function injectWebGlobal() {
  if (done || typeof document === 'undefined') return;
  done = true;
  const css = `
*, *::before, *::after { box-sizing: border-box; }
html, body { height: 100%; margin: 0; background: #07080A; overscroll-behavior: none; -webkit-text-size-adjust: 100%; }
#root, body > div:first-child { height: 100%; }
@media (prefers-color-scheme: light) { html, body { background: #F4F6F1; } }
::selection { background: rgba(198,255,61,0.35); color: inherit; }
* { scrollbar-width: thin; scrollbar-color: rgba(128,136,146,0.45) transparent; }
*::-webkit-scrollbar { width: 10px; height: 10px; }
*::-webkit-scrollbar-track { background: transparent; }
*::-webkit-scrollbar-thumb { background: rgba(128,136,146,0.38); border-radius: 10px; border: 2px solid transparent; background-clip: content-box; }
*::-webkit-scrollbar-thumb:hover { background: rgba(128,136,146,0.65); background-clip: content-box; border: 2px solid transparent; }
:focus { outline: none; }
:focus-visible { outline: 2px solid #C6FF3D; outline-offset: 2px; border-radius: 8px; }
[role="button"], [role="link"], [role="tab"], a, button { cursor: pointer; transition: opacity .15s ease, background-color .15s ease, filter .15s ease; }
[role="button"]:hover, [role="link"]:hover { filter: brightness(1.08); }
[role="button"]:active { filter: brightness(0.95); }
[data-saige-nav] { transition: background-color .15s ease; cursor: pointer; }
[data-saige-nav]:hover { background-color: rgba(128,136,146,0.14) !important; }
input, textarea { transition: border-color .15s ease, box-shadow .15s ease; }
`;
  const el = document.createElement('style');
  el.setAttribute('data-saige-global', '1');
  el.textContent = css;
  document.head.appendChild(el);
}
