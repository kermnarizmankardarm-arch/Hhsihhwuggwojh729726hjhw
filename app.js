/* ══════════════════════════════════════════════════════════════════════════════
   PROMPT ALCHEMIST — app.js
   ══════════════════════════════════════════════════════════════════════════════

   ███  SECURITY WARNING — READ THIS BEFORE YOU PASTE A SINGLE KEY  ███
   ─────────────────────────────────────────────────────────────────────────────
   This is a STATIC site. It is served straight from GitHub Pages with no
   backend. That means every API key you paste into API_CONFIG below is
   committed to a public repository and is readable by ANYONE who opens this
   page and presses F12. There is no way around that on a static host.

   Therefore:
     • Use THROWAWAY keys with a hard monthly spend cap (ideally $0–$5).
     • For Gemini, add an HTTP-referrer restriction in Google Cloud Console
       limited to your GitHub Pages domain. For OpenAI, restrict by project.
     • Rotate the keys regularly. Assume they are public.
     • For real security, put a free serverless proxy (Cloudflare Worker,
       Vercel Function) in front of the vendors and point `endpoint` at it.
       Then no key ever ships to the browser.

   Users can also press "Key" in the header and supply their own key, which is
   stored ONLY in their browser's localStorage and is tried FIRST.
   ─────────────────────────────────────────────────────────────────────────────

   ─────────────────────────────────────────────────────────────────────────────
   MAP OF THIS FILE
     §0  CONFIG  ·  API keys, models, embedded fallback prompts, tunables
     §1  Utilities, storage, logging
     §2  App state + state machine
     §3  Theme (Daylight Lab) + methodology palette transmutation
     §4  Generative background canvas
     §5  Cursor, pointer glow, scroll progress, parallax, curtain
     §6  Reveal-on-scroll + self-drawing SVG
     §7  Magnetic buttons, ripples, toasts, modal
     §8  ACT II  — methodology cards
     §9  ACT III — upload altar (drop / paste / URL / preprocess)
     §10 RELAY ENGINE — multi-provider rotating API client
     §11 ACT IV  — transmutation overlay (scanner, crucible, ring)
     §12 ACT V   — result rendering (typewriter, highlighter, DNA strip)
     §13 ACT VI  — the archive (localStorage + cookie)
     §14 Footer, debug drawer, keyboard shortcuts, boot
   ─────────────────────────────────────────────────────────────────────────────
   Every tunable you are likely to want to touch lives in §0.
   ══════════════════════════════════════════════════════════════════════════════ */
'use strict';

/* ══════════════════════════════════════════════════════════════════════════════
   §0 — CONFIGURATION
   ══════════════════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────────────────────────
   0.1  API PROVIDERS
   ─────────────────────────────────────────────────────────────────────────────
   • `keys` is an array. Add as many as you like — the relay walks them in
     order and burns (for the session) any that come back rate-limited,
     unauthorised or out of quota.
   • Entries that are empty, whitespace, or still look like a `PASTE_…`
     placeholder are ignored automatically, so you can ship the file as-is.
   • `endpoint` is a function so you can swap in a proxy URL later without
     touching the request code.
   ⚠ Keys pasted here are PUBLIC. See the banner at the top of this file.
   ───────────────────────────────────────────────────────────────────────────── */
const API_CONFIG = {
  gemini: {
    label: 'Gemini',
    model: 'gemini-2.0-flash',                 // ← editable model id
    temperature: 0.9,
    maxTokens: 2048,
    endpoint: (model, key) =>
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    keys: [
      'PASTE_GEMINI_KEY_1',
      'PASTE_GEMINI_KEY_2',
      // 'PASTE_GEMINI_KEY_3',  ← add as many as you like
    ]
  },
  openai: {
    label: 'ChatGPT',
    model: 'gpt-4o-mini',                      // ← editable model id
    temperature: 0.9,
    maxTokens: 2048,
    endpoint: () => 'https://api.openai.com/v1/chat/completions',
    keys: [
      'PASTE_OPENAI_KEY_1',
      'PASTE_OPENAI_KEY_2',
      // 'PASTE_OPENAI_KEY_3',
    ]
  }
};

/* ─────────────────────────────────────────────────────────────────────────────
   0.2  EMBEDDED FALLBACK META-PROMPTS
   ─────────────────────────────────────────────────────────────────────────────
   The app prefers to fetch ./iwp.txt, ./nldp.txt and ./ssp.txt. If that fetch
   fails (file:// origin, 404, offline, CORS) it falls back to the strings
   below so the app never dies. Paste the SAME text you put in the .txt files.

   ⚠ ESCAPE SAFETY: these are template literals. If your meta-prompt contains a
   backtick (`) or the two characters ${ you MUST escape them as \` and \${
   or this file will not parse. When in doubt, leave this as the placeholder —
   the .txt files are the primary source anyway.
   ───────────────────────────────────────────────────────────────────────────── */
const EMBEDDED_PROMPTS = {
  IWP:  `/* ---- PASTE IWP META-PROMPT HERE (fallback) ---- */`,
  NLDP: `/* ---- PASTE NLDP META-PROMPT HERE (fallback) ---- */`,
  SSP:  `/* ---- PASTE SSP META-PROMPT HERE (fallback) ---- */`
};

/* ─────────────────────────────────────────────────────────────────────────────
   0.3  APP TUNABLES
   ───────────────────────────────────────────────────────────────────────────── */
const APP_CONFIG = {
  repoUrl: 'https://github.com/your-name/prompt-alchemist',  // ← your repo

  /* Upload preprocessing */
  maxFileBytes: 15 * 1024 * 1024,   // reject anything bigger
  maxEdge: 1280,                    // downscale longest edge to this
  jpegQuality: 0.85,                // re-encode quality
  thumbEdge: 96,                    // archive thumbnail longest edge
  thumbQuality: 0.6,

  /* Archive */
  archiveKey: 'pa_archive_v1',
  archiveCap: 15,                   // hard cap — FIFO
  archiveMaxBytes: 4 * 1024 * 1024, // total size guard
  uidCookie: 'pa_uid',

  /* Relay */
  requestTimeoutMs: 45000,          // global per-attempt timeout
  backoffMs: [600, 1500],           // retries on 5xx / network
  burnTtlMs: 10 * 60 * 1000,        // a burned key cools down for 10 minutes
  maxFullAttempts: 3,               // safety net against runaway loops

  /* Motion */
  typewriterMs: 25,                 // per-character reveal
  ringSettleMs: 26000,              // progress ring eases to 90% over this
  debugHotkey: ['ctrl', 'shift', 'd']
};

/* Methodology metadata. `file` is fetched from the repo root at runtime. */
const METHODS = {
  IWP: {
    code: 'IWP', file: './iwp.txt', accent: '#ff9a3c',
    name: 'Imperative Weighted Prompting',
    tagline: 'Terse directives, numerically weighted. Maximum control, minimum prose.',
    format: 'iwp'
  },
  NLDP: {
    code: 'NLDP', file: './nldp.txt', accent: '#22d3c5',
    name: 'Natural Language Descriptive Prompting',
    tagline: 'A cinematic paragraph. The image described as a story a camera could shoot.',
    format: 'prose'
  },
  SSP: {
    code: 'SSP', file: './ssp.txt', accent: '#b18cff',
    name: 'Structured Schema Prompting',
    tagline: 'A machine-readable blueprint. Every attribute its own labelled field.',
    format: 'schema'
  }
};

/* Decorative telemetry lines for the transmutation overlay. */
const TELEMETRY = [
  'analysing chromatic range…',
  'isolating key light…',
  'mapping depth cues…',
  'inferring lens & focal length…',
  'distilling mood lexicon…',
  'sampling specular falloff…',
  'tracing edge energy…',
  'reading horizon geometry…',
  'estimating exposure latitude…',
  'segmenting subject from ground…',
  'measuring atmospheric haze…',
  'resolving colour temperature…',
  'weighing compositional mass…',
  'cataloguing surface texture…',
  'collapsing latent description…'
];

/* Appended to the meta-prompt when the first response came back empty/refused. */
const REINFORCE_SUFFIX =
  '\n\n(The previous response was empty. Reply now with the prompt text only — ' +
  'no preamble, no commentary, no code fences.)';


/* ══════════════════════════════════════════════════════════════════════════════
   §1 — UTILITIES, STORAGE, LOGGING
   ══════════════════════════════════════════════════════════════════════════════ */

/** document.querySelector shorthand. */
const $  = (sel, root) => (root || document).querySelector(sel);
/** document.querySelectorAll → real array. */
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const lerp  = (a, b, t) => a + (b - a) * t;
const rand  = (a, b) => a + Math.random() * (b - a);
const pick  = (arr) => arr[(Math.random() * arr.length) | 0];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const escapeHtml = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Cubic ease-out used by the progress ring and most JS-driven tweens. */
const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

/** True when the user asked the OS to reduce motion. */
function prefersReducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch (e) { return false; }
}

/* ── 1.1 Storage with graceful degradation ────────────────────────────────────
   Private-browsing modes throw on access to localStorage/sessionStorage, so
   every touch point is wrapped. `memFallback` keeps the session usable.
   ───────────────────────────────────────────────────────────────────────────── */
const memFallback = { local: new Map(), session: new Map() };

function storageGet(kind, key) {
  try { return window[kind + 'Storage'].getItem(key); }
  catch (e) { return memFallback[kind].has(key) ? memFallback[kind].get(key) : null; }
}
function storageSet(kind, key, value) {
  try { window[kind + 'Storage'].setItem(key, value); return true; }
  catch (e) { memFallback[kind].set(key, value); return false; }
}
function storageRemove(kind, key) {
  try { window[kind + 'Storage'].removeItem(key); }
  catch (e) { memFallback[kind].delete(key); }
}
const localGet = (k) => storageGet('local', k);
const localSet = (k, v) => storageSet('local', k, v);
const sessionGet = (k) => storageGet('session', k);
const sessionSet = (k, v) => storageSet('session', k, v);

/* ── 1.2 Cookies ───────────────────────────────────────────────────────────────
   The archive itself lives in localStorage (multi-megabyte quota, never sent
   over the wire). We ALSO write one tiny cookie holding an anonymous id and the
   entry count, purely so the app has a durable, server-visible marker. Keeping
   it to ~40 bytes means request headers stay lean.
   ───────────────────────────────────────────────────────────────────────────── */
function cookieSet(name, value, maxAgeSec) {
  try {
    document.cookie = `${name}=${encodeURIComponent(value)};path=/;max-age=${maxAgeSec};SameSite=Lax`;
  } catch (e) { /* storage blocked — non-fatal */ }
}
function cookieGet(name) {
  try {
    const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  } catch (e) { return null; }
}
/** Anonymous, non-tracking id — just so the archive has a stable owner tag. */
function ensureUid() {
  let uid = cookieGet(APP_CONFIG.uidCookie) || localGet(APP_CONFIG.uidCookie);
  if (!uid) {
    uid = 'pa-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    localSet(APP_CONFIG.uidCookie, uid);
  }
  cookieSet(APP_CONFIG.uidCookie, uid, 31536000);
  return uid;
}

/* ── 1.3 Byte formatting & relative time ─────────────────────────────────── */
function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return '—';
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
  return (n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 2 : 1) + ' MB';
}
function relativeTime(ts) {
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 45) return 'just now';
  if (s < 90) return 'a minute ago';
  const m = s / 60;
  if (m < 60) return Math.round(m) + ' minutes ago';
  const h = m / 60;
  if (h < 24) return Math.round(h) + (Math.round(h) === 1 ? ' hour ago' : ' hours ago');
  const d = h / 24;
  if (d < 7) return Math.round(d) + (Math.round(d) === 1 ? ' day ago' : ' days ago');
  try { return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); }
  catch (e) { return ''; }
}

/* ── 1.4 Clipboard (async API with a hidden-textarea fallback) ───────────── */
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch (e) { return false; }
}

/* ── 1.5 Markdown fence stripping ────────────────────────────────────────────
   Vision models love to wrap their answer in ```…```. Strip fences and any
   leading "Here is your prompt:" throat-clearing.
   ───────────────────────────────────────────────────────────────────────────── */
function stripFences(raw) {
  if (typeof raw !== 'string') return '';
  let s = raw.replace(/\r\n/g, '\n').trim();

  const OPEN = /^[ \t]*```[a-zA-Z0-9_+-]*[ \t]*\n/;   // a language tag is only a tag before a newline
  const SHUT = /\n?[ \t]*```[ \t]*$/;                  // a closer only counts at the very end
  const INLINE = /^[ \t]*```([\s\S]*)```[ \t]*$/;     // ```content``` all on one line

  // Peel matched pairs from the outside in (handles nested/duplicated fences).
  let guard = 0;
  while (guard++ < 6) {
    const before = s;
    if (INLINE.test(s) && !OPEN.test(s)) {
      const m = INLINE.exec(s);
      if (m && m[1].trim() && !m[1].trim().startsWith('```')) s = m[1].trim();
    }
    if (OPEN.test(s) && SHUT.test(s)) {
      s = s.replace(OPEN, '').replace(SHUT, '').trim();
    } else if (OPEN.test(s)) {
      s = s.replace(OPEN, '').trim();                 // dangling opener
    } else if (SHUT.test(s)) {
      s = s.replace(SHUT, '').trim();                 // dangling closer
    }
    if (s === before) break;
  }
  // A fence stranded on its own line inside the body.
  s = s.replace(/^[ \t]*```[a-zA-Z0-9_+-]*[ \t]*$/gm, '');
  return s.trim();
}

/** Never print a key. Show only its index and last four characters. */
function maskKey(key) {
  const s = String(key || '');
  return s.length ? '••••' + s.slice(-4) : '(empty)';
}


/* ══════════════════════════════════════════════════════════════════════════════
   §2 — APP STATE + STATE MACHINE
   ══════════════════════════════════════════════════════════════════════════════
   One plain object holds everything the UI can be in. `setPhase()` is the only
   writer of `state.phase`, so the button/overlay behaviour stays consistent.
   ══════════════════════════════════════════════════════════════════════════════ */
const state = {
  phase: 'idle',            // idle → ready → working → done
  method: null,             // 'IWP' | 'NLDP' | 'SSP'
  metaPrompts: {},          // method → text (fetched or embedded)
  metaSource: {},           // method → 'file' | 'embedded'
  image: {                  // the optimised, transmission-ready image
    dataUrl: null, base64: null, mimeType: 'image/jpeg',
    bytes: 0, origBytes: 0, origName: 'image', width: 0, height: 0,
    bitmap: null            // HTMLCanvasElement for the crucible effect
  },
  result: { text: '', provider: null, latency: 0, format: 'prose', entryId: null },
  archive: [],
  theme: 'dark',
  debugOpen: false,
  forceProvider: 'auto',
  ownKeys: { gemini: '', openai: '' },
  suffixEnabled: true,
  suffixText: '',
  reduced: false,
  bootAt: 0
};

function setPhase(next) {
  state.phase = next;
  const btn = $('#transmuteBtn');
  if (btn) {
    btn.classList.toggle('is-busy', next === 'working');
    btn.setAttribute('aria-busy', next === 'working' ? 'true' : 'false');
  }
  updateTransmuteHint();
}

function updateTransmuteHint() {
  const hint = $('#transmuteHint');
  if (!hint) return;
  const m = state.method ? METHODS[state.method].code : null;
  const i = !!state.image.dataUrl;
  if (state.phase === 'working') { hint.textContent = 'Transmutation in flight…'; return; }
  if (m && i) hint.textContent = `Ready — ${METHODS[m].name} · ${formatBytes(state.image.bytes)}`;
  else if (!m && i) hint.textContent = 'Pick a methodology above to begin.';
  else if (m && !i) hint.textContent = 'Add a reference image to begin.';
  else hint.textContent = 'Choose a methodology and an image to begin.';
}


/* ══════════════════════════════════════════════════════════════════════════════
   §3 — THEME (DAYLIGHT LAB) + METHODOLOGY PALETTE TRANSMUTATION
   ══════════════════════════════════════════════════════════════════════════════ */
const THEME_KEY = 'pa_theme_v1';

function applyTheme(theme, animate) {
  state.theme = theme;
  const root = document.documentElement;
  if (animate) {
    root.classList.add('theming');
    setTimeout(() => root.classList.remove('theming'), 520);
  }
  root.setAttribute('data-theme', theme);
  localSet(THEME_KEY, theme);
  const btn = $('#themeBtn');
  if (btn) {
    const isLight = theme === 'light';
    btn.setAttribute('aria-pressed', String(isLight));
    btn.setAttribute('aria-label', isLight ? 'Switch to Obsidian theme' : 'Switch to Daylight Lab theme');
  }
  const meta = $('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'light' ? '#f6f2ea' : '#07070A');
  // Recolour the particle field on the next frame.
  if (typeof Bg !== 'undefined' && Bg.readPalette) Bg.readPalette();
}

function initTheme() {
  const saved = localGet(THEME_KEY);
  let theme = saved;
  if (!theme) {
    try { theme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'; }
    catch (e) { theme = 'dark'; }
  }
  applyTheme(theme, false);

  const btn = $('#themeBtn');
  if (btn) btn.addEventListener('click', () => {
    applyTheme(state.theme === 'dark' ? 'light' : 'dark', true);
    toast(state.theme === 'light' ? 'Daylight Lab engaged.' : 'Back to the obsidian lab.', 'ok');
  });

  // Follow the OS only if the user has not made a manual choice yet.
  try {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
      if (!localGet(THEME_KEY)) applyTheme(e.matches ? 'light' : 'dark', true);
    });
  } catch (e) { /* older Safari */ }
}

/* Methodology selection paints the whole document via CSS custom properties. */
function applyMethodTheme(code) {
  const root = document.documentElement;
  const prev = root.getAttribute('data-method');
  root.setAttribute('data-method', code || 'none');
  $$('.method-card').forEach((card) => {
    const isSel = card.dataset.method === code;
    card.classList.toggle('selected', isSel);
    card.setAttribute('aria-checked', String(isSel));
    card.tabIndex = isSel ? 0 : -1;
  });
  if (prev && prev !== code && prev !== 'none') {
    toast(`Transmuted to ${METHODS[code].code} — ${METHODS[code].name}.`, 'ok');
  }
  if (typeof Bg !== 'undefined' && Bg.readPalette) Bg.readPalette();
}


/* ══════════════════════════════════════════════════════════════════════════════
   §4 — GENERATIVE BACKGROUND CANVAS
   ══════════════════════════════════════════════════════════════════════════════
   A slow field of luminous particles joined by faint threads. The field reacts
   to pointer proximity and velocity, drifts harder while you scroll, and lerps
   its palette toward the active methodology accent. DPR is capped at 2 and the
   particle count scales with viewport area so phones stay at 60fps.
   ══════════════════════════════════════════════════════════════════════════════ */
const Bg = (() => {
  const cv = () => $('#bgCanvas');
  let ctx = null, w = 0, h = 0, dpr = 1, particles = [], raf = 0, running = false;
  let pointer = { x: -9999, y: -9999, vx: 0, vy: 0, active: false };
  let scrollBoost = 0, scrollDir = 1;
  // Palette targets + current (lerped) values, all 0..1 RGB.
  let target = { a: [1, .6, .24], b: [1, .37, .23], ink: [.92, .92, .95], bg: [.027, .027, .04] };
  let cur = { a: [1, .6, .24], b: [1, .37, .23], ink: [.92, .92, .95], bg: [.027, .027, .04] };

  function hexToRgb01(hex) {
    const s = String(hex || '').replace('#', '');
    if (s.length !== 6) return [1, 1, 1];
    return [parseInt(s.slice(0, 2), 16) / 255, parseInt(s.slice(2, 4), 16) / 255, parseInt(s.slice(4, 6), 16) / 255];
  }
  function cssColorToRgb01(str) {
    // getComputedStyle returns rgb()/rgba() or a hex for registered @property colours.
    const m = String(str).match(/-?[\d.]+/g);
    if (m && m.length >= 3) return [clamp(+m[0] / 255, 0, 1), clamp(+m[1] / 255, 0, 1), clamp(+m[2] / 255, 0, 1)];
    return hexToRgb01(str);
  }
  const rgba = (c, a) => `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${a})`;

  function readPalette() {
    // Guarded: readPalette can be called before the first paint, and must never
    // throw (a missing palette simply keeps the previous colours).
    if (typeof getComputedStyle !== 'function' || !document.documentElement) return;
    let cs;
    try { cs = getComputedStyle(document.documentElement); } catch (e) { return; }
    target.a = cssColorToRgb01(cs.getPropertyValue('--accent'));
    target.b = cssColorToRgb01(cs.getPropertyValue('--accent-2'));
    target.ink = cssColorToRgb01(cs.getPropertyValue('--text'));
    target.bg = cssColorToRgb01(cs.getPropertyValue('--bg'));
  }

  function spawn() {
    const area = w * h;
    const count = clamp(Math.round(area / 15500), 34, 150);
    particles = new Array(count).fill(0).map(() => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: rand(-0.16, 0.16), vy: rand(-0.16, 0.16),
      r: rand(0.7, 2.1), phase: Math.random() * Math.PI * 2,
      speed: rand(0.6, 1.5), mix: Math.random()
    }));
  }

  function resize() {
    const c = cv(); if (!c) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = window.innerWidth; h = window.innerHeight;
    c.width = Math.floor(w * dpr); c.height = Math.floor(h * dpr);
    c.style.width = w + 'px'; c.style.height = h + 'px';
    ctx = c.getContext('2d', { alpha: true });
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!particles.length || Math.abs(particles.length - clamp(Math.round(w * h / 15500), 34, 150)) > 24) spawn();
  }

  function frame() {
    if (!running || !ctx) return;
    raf = requestAnimationFrame(frame);

    // Palette drift
    for (const k of ['a', 'b', 'ink', 'bg']) for (let i = 0; i < 3; i++) cur[k][i] = lerp(cur[k][i], target[k][i], 0.04);

    ctx.clearRect(0, 0, w, h);
    scrollBoost *= 0.94;

    const linkDist = w < 700 ? 96 : 128;
    const linkDist2 = linkDist * linkDist;

    // Threads first (cheaper visual layer), particles on top.
    ctx.lineWidth = 1;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      for (let j = i + 1; j < particles.length; j++) {
        const q = particles[j];
        const dx = p.x - q.x, dy = p.y - q.y, d2 = dx * dx + dy * dy;
        if (d2 > linkDist2) continue;
        const a = (1 - d2 / linkDist2) * 0.16;
        const c = p.mix > 0.5 ? cur.a : cur.b;
        ctx.strokeStyle = rgba(c, a);
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
      }
    }

    for (const p of particles) {
      // Organic drift
      p.phase += 0.006 * p.speed;
      const boost = 1 + scrollBoost * 2.2;
      p.x += (p.vx + Math.cos(p.phase) * 0.06) * boost * p.speed;
      p.y += (p.vy + Math.sin(p.phase) * 0.05) * boost * p.speed + scrollBoost * scrollDir * 0.9 * p.speed;

      // Pointer repulsion + a little velocity kick
      if (pointer.active) {
        const dx = p.x - pointer.x, dy = p.y - pointer.y, d2 = dx * dx + dy * dy;
        if (d2 < 26000 && d2 > 0.01) {
          const d = Math.sqrt(d2), f = (1 - d / 161) * 0.85;
          p.x += (dx / d) * f * 2.4 + pointer.vx * 0.012 * f;
          p.y += (dy / d) * f * 2.4 + pointer.vy * 0.012 * f;
        }
      }

      // Wrap
      if (p.x < -20) p.x = w + 20; else if (p.x > w + 20) p.x = -20;
      if (p.y < -20) p.y = h + 20; else if (p.y > h + 20) p.y = -20;

      const pulse = 0.55 + 0.45 * Math.sin(p.phase * 1.7);
      const c = p.mix > 0.5 ? cur.a : cur.ink;
      ctx.fillStyle = rgba(c, 0.10 + 0.30 * pulse);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }

    pointer.vx *= 0.9; pointer.vy *= 0.9;
  }

  function start() {
    if (running) return;
    running = true; raf = requestAnimationFrame(frame);
  }
  function stop() { running = false; cancelAnimationFrame(raf); }

  function init() {
    const c = cv(); if (!c) return;
    readPalette();
    // Seed `cur` from `target` so the first frame is already correct.
    for (const k of ['a', 'b', 'ink', 'bg']) cur[k] = target[k].slice();
    resize();

    window.addEventListener('resize', () => { resize(); }, { passive: true });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      pointer.vx = e.clientX - pointer.x; pointer.vy = e.clientY - pointer.y;
      pointer.x = e.clientX; pointer.y = e.clientY; pointer.active = true;
    }, { passive: true });
    window.addEventListener('pointerleave', () => { pointer.active = false; }, { passive: true });
    // Device tilt gives phones something to react to.
    window.addEventListener('deviceorientation', (e) => {
      if (e.gamma == null || e.beta == null) return;
      pointer.x = (0.5 + clamp(e.gamma, -45, 45) / 90) * w;
      pointer.y = (0.5 + clamp(e.beta - 45, -45, 45) / 90) * h;
      pointer.active = true;
    }, { passive: true });

    if (prefersReducedMotion()) {
      // Draw a single static frame and never animate.
      running = true;
      requestAnimationFrame(() => { frame(); stop(); });
    } else {
      start();
      // Pause when the tab is hidden — saves battery, nothing visible changes.
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) stop(); else start();
      });
    }
  }

  /** Called by the scroll handler: scrolling agitates the field. */
  function agitate(dir, amount) { scrollDir = dir; scrollBoost = clamp(scrollBoost + amount, 0, 1); }

  return { init, resize, readPalette, agitate, start, stop };
})();


/* ══════════════════════════════════════════════════════════════════════════════
   §5 — CURSOR, POINTER GLOW, SCROLL PROGRESS, PARALLAX, CURTAIN
   ══════════════════════════════════════════════════════════════════════════════ */
function initCursor() {
  // Only for devices that can actually hover with a fine pointer.
  let fine = false;
  try { fine = window.matchMedia('(pointer:fine) and (hover:hover)').matches; } catch (e) { fine = false; }
  if (!fine || prefersReducedMotion()) {
    document.body.classList.add('no-glow');
    return;
  }
  document.body.classList.add('cursor-on');
  const dot = $('#cursorDot'), ring = $('#cursorRing'), glow = $('#pointerGlow');
  let mx = window.innerWidth / 2, my = window.innerHeight / 2, rx = mx, ry = my, gx = mx, gy = my;

  window.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    mx = e.clientX; my = e.clientY;
  }, { passive: true });
  document.addEventListener('pointerdown', () => document.body.classList.add('ring-down'));
  document.addEventListener('pointerup',   () => document.body.classList.remove('ring-down'));

  // Scale the ring when hovering anything interactive.
  const hot = 'a,button,input,textarea,select,[role="button"],[role="radio"],[tabindex]:not([tabindex="-1"]),.ar-card,.method-card';
  document.addEventListener('pointerover', (e) => {
    document.body.classList.toggle('ring-hot', !!e.target.closest(hot));
  }, { passive: true });

  (function tick() {
    rx = lerp(rx, mx, 0.18); ry = lerp(ry, my, 0.18);
    gx = lerp(gx, mx, 0.07); gy = lerp(gy, my, 0.07);
    if (dot)  dot.style.transform  = `translate3d(${mx}px,${my}px,0)`;
    if (ring) ring.style.transform = `translate3d(${rx}px,${ry}px,0)`;
    if (glow) glow.style.transform = `translate3d(${gx}px,${gy}px,0)`;
    requestAnimationFrame(tick);
  })();
}

function initScrollChrome() {
  const bar = $('#scrollProgress');
  const head = $('#siteHead');
  const cue = $('#scrollCue');
  const hero = $('#forge');
  const title = $('#heroTitle');
  let lastY = window.scrollY, ticking = false, cueHidden = false;

  function onFrame() {
    ticking = false;
    const y = window.scrollY;
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    if (bar) bar.style.setProperty('--p', clamp(y / max, 0, 1).toFixed(4));
    if (head) head.classList.toggle('scrolled', y > 24);
    if (cue && !cueHidden && y > 40) { cue.classList.add('faded'); cueHidden = true; }

    // Gentle hero parallax — transform only, so it stays on the compositor.
    if (title && y < window.innerHeight * 1.2) {
      title.style.transform = `translate3d(0,${(y * -0.12).toFixed(1)}px,0)`;
      title.style.opacity = String(clamp(1 - y / (window.innerHeight * 0.75), 0, 1));
    }
    if (hero && y < window.innerHeight * 1.2) {
      const stats = $('.hero-stats', hero);
      if (stats) stats.style.transform = `translate3d(0,${(y * -0.05).toFixed(1)}px,0)`;
    }

    // Feed the background field.
    const dy = y - lastY;
    if (Math.abs(dy) > 1) Bg.agitate(dy > 0 ? 1 : -1, Math.min(0.55, Math.abs(dy) / 260));
    lastY = y;
  }
  window.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(onFrame); }
  }, { passive: true });
  onFrame();

  if (cue) cue.addEventListener('click', () => {
    const next = $('#method');
    if (next) scrollToEl(next, 'start');
  });
}

function initCurtain() {
  const c = $('#curtain');
  if (!c) return;
  if (prefersReducedMotion()) { c.classList.add('gone'); return; }
  const kill = () => c.classList.add('gone');
  setTimeout(kill, 1250);
}

/** Kinetic title: split into characters, each with its own delay. */
function initHeroTitle() {
  const el = $('#heroTitle');
  if (!el) return;
  const text = el.textContent.trim();
  el.textContent = '';
  el.setAttribute('aria-label', text);
  const frag = document.createDocumentFragment();
  let i = 0;
  for (const ch of text) {
    const wrap = document.createElement('span');
    wrap.className = 'ch' + (ch === ' ' ? ' sp' : '');
    wrap.setAttribute('aria-hidden', 'true');
    if (ch !== ' ') {
      const inner = document.createElement('span');
      inner.textContent = ch;
      inner.style.setProperty('--d', (120 + i * 42) + 'ms');
      wrap.appendChild(inner);
      i++;
    }
    frag.appendChild(wrap);
  }
  el.appendChild(frag);
}


/* ══════════════════════════════════════════════════════════════════════════════
   §6 — REVEAL ON SCROLL + SELF-DRAWING SVG
   ══════════════════════════════════════════════════════════════════════════════ */
function measureStrokes(root) {
  // stroke-dasharray needs a real length per path for the draw-on effect.
  $$('path,line,circle,rect,polyline,ellipse', root || document).forEach((el) => {
    if (el.dataset.len) return;
    let len = 300;
    try {
      if (typeof el.getTotalLength === 'function' && el.tagName.toLowerCase() !== 'rect') {
        len = el.getTotalLength();
      } else if (el.tagName.toLowerCase() === 'rect') {
        const w = parseFloat(el.getAttribute('width')) || 0;
        const h = parseFloat(el.getAttribute('height')) || 0;
        len = 2 * (w + h);
      }
    } catch (e) { len = 300; }
    if (!Number.isFinite(len) || len <= 0) len = 300;
    el.dataset.len = Math.ceil(len);
    el.style.setProperty('--len', Math.ceil(len));
  });
}

function initReveal() {
  measureStrokes(document);

  const targets = $$('[data-reveal], .method-card, .archive-empty, .foot-steps, .dropzone');
  if (!('IntersectionObserver' in window) || prefersReducedMotion()) {
    targets.forEach((t) => t.classList.add('in-view'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('in-view');
      io.unobserve(entry.target);
    });
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
  targets.forEach((t) => io.observe(t));

  // Stagger the cards' glyph strokes so they draw in sequence.
  $$('.method-card .g-draw > *').forEach((el, i) => {
    el.style.setProperty('--dd', (i * 110) + 'ms');
  });
}


/* ══════════════════════════════════════════════════════════════════════════════
   §7 — MAGNETIC BUTTONS, RIPPLES, TOASTS, MODAL
   ══════════════════════════════════════════════════════════════════════════════ */
function initMagnetic() {
  if (prefersReducedMotion()) return;
  let fine = false;
  try { fine = window.matchMedia('(pointer:fine) and (hover:hover)').matches; } catch (e) { fine = false; }
  if (!fine) return;

  $$('.magnetic').forEach((el) => {
    const RADIUS = 130, PULL = 0.32;
    let raf = 0, tx = 0, ty = 0, cx = 0, cy = 0, hot = false;

    const loop = () => {
      cx = lerp(cx, tx, 0.16); cy = lerp(cy, ty, 0.16);
      el.style.transform = `translate3d(${cx.toFixed(2)}px,${cy.toFixed(2)}px,0)`;
      if (Math.abs(cx - tx) > 0.05 || Math.abs(cy - ty) > 0.05 || hot) raf = requestAnimationFrame(loop);
      else { raf = 0; el.style.transform = ''; }
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };

    el.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return;
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy);
      hot = d < RADIUS + r.width / 2;
      if (hot) { tx = dx * PULL; ty = dy * PULL * 0.7; } else { tx = 0; ty = 0; }
      kick();
    }, { passive: true });
    el.addEventListener('pointerleave', () => { tx = 0; ty = 0; hot = false; kick(); });
  });
}

/** Liquid ripple on press — spawns a radial burst from the click point. */
function initRipples() {
  document.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('.btn');
    if (!btn || prefersReducedMotion()) return;
    const r = btn.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2.2;
    const el = document.createElement('span');
    el.className = 'ripple';
    el.style.width = el.style.height = size + 'px';
    el.style.left = (e.clientX - r.left) + 'px';
    el.style.top = (e.clientY - r.top) + 'px';
    btn.appendChild(el);
    setTimeout(() => el.remove(), 640);
  }, { passive: true });
}

/* ── 7.1 Toasts ─────────────────────────────────────────────────────────────── */
function toast(message, kind, actionLabel, onAction, ttl) {
  const stack = $('#toastStack');
  if (!stack) return null;
  const el = document.createElement('div');
  el.className = 'toast ' + (kind || '');
  el.innerHTML = '<span class="t-dot" aria-hidden="true"></span><span class="t-msg"></span>';
  $('.t-msg', el).textContent = message;
  if (actionLabel && typeof onAction === 'function') {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = actionLabel;
    b.addEventListener('click', () => { onAction(); dismiss(); });
    el.appendChild(b);
  }
  stack.appendChild(el);
  // Keep the stack short.
  while (stack.children.length > 4) stack.firstElementChild.remove();
  let done = false;
  function dismiss() {
    if (done) return;
    done = true;
    el.classList.add('out');
    setTimeout(() => el.remove(), 340);
  }
  setTimeout(dismiss, ttl || (actionLabel ? 6500 : 3600));
  return { dismiss };
}

/* ── 7.2 Modal (replaces confirm/alert everywhere) ─────────────────────────── */
function confirmDialog({ title, body, confirmLabel = 'Confirm', danger = true }) {
  return new Promise((resolve) => {
    const back = $('#modalBackdrop');
    if (!back) { resolve(true); return; }
    $('#modalTitle').textContent = title;
    $('#modalBody').textContent = body;
    const ok = $('#modalConfirm'), no = $('#modalCancel');
    ok.textContent = confirmLabel;
    ok.classList.toggle('btn-danger', !!danger);
    back.hidden = false;
    ok.focus();

    let settled = false;
    const finish = (val) => {
      if (settled) return;
      settled = true;
      back.hidden = true;
      ok.removeEventListener('click', onOk);
      no.removeEventListener('click', onNo);
      document.removeEventListener('keydown', onKey);
      resolve(val);
    };
    function onOk() { finish(true); }
    function onNo() { finish(false); }
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
      if (e.key === 'Tab') { // simple focus trap
        const f = [ok, no].filter(Boolean);
        const i = f.indexOf(document.activeElement);
        e.preventDefault();
        f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
      }
    }
    ok.addEventListener('click', onOk);
    no.addEventListener('click', onNo);
    document.addEventListener('keydown', onKey);
    back.addEventListener('pointerdown', (e) => { if (e.target === back) finish(false); }, { once: true });
  });
}


/* ── Scroll helper: tolerant of environments without scrollIntoView ───────── */
function scrollToEl(el, block) {
  if (!el || typeof el.scrollIntoView !== 'function') return;
  try { el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: block || 'start' }); }
  catch (e) { /* some browsers reject the options object — nothing to do */ }
}


/* ══════════════════════════════════════════════════════════════════════════════
   §8 — ACT II · METHODOLOGY CARDS
   ══════════════════════════════════════════════════════════════════════════════
   • 3D tilt + specular highlight tracking the pointer
   • radiogroup semantics with a roving tabindex
   • selecting a card fetches its meta-prompt .txt and transmutes the palette
   ══════════════════════════════════════════════════════════════════════════════ */
const METHOD_SELECT_KEY = 'pa_method_v1';

async function loadMetaPrompt(code) {
  if (state.metaPrompts[code]) return { text: state.metaPrompts[code], source: state.metaSource[code] };

  const file = METHODS[code].file;
  const cacheKey = 'pa_meta_' + code;
  const cached = sessionGet(cacheKey);
  if (cached) {
    state.metaPrompts[code] = cached;
    state.metaSource[code] = 'file (session cache)';
    return { text: cached, source: state.metaSource[code] };
  }

  try {
    const res = await fetch(file, { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + file);
    const text = (await res.text()).trim();
    if (!text) throw new Error('empty file ' + file);
    state.metaPrompts[code] = text;
    state.metaSource[code] = 'file';
    sessionSet(cacheKey, text);   // never fetched twice in a session
    return { text, source: 'file' };
  } catch (err) {
    // file:// origin, 404, offline, CORS — fall back silently but noisily in console.
    console.warn(`[Alchemist] Could not load ${file} (${err && err.message}). Using the embedded fallback.`);
    const fallback = EMBEDDED_PROMPTS[code] || '';
    state.metaPrompts[code] = fallback;
    state.metaSource[code] = 'embedded';
    return { text: fallback, source: 'embedded' };
  }
}

function flashCardStatus(card, text) {
  const s = $('[data-loaded]', card);
  if (!s) return;
  s.textContent = text;
  s.classList.add('show');
  clearTimeout(s._t);
  s._t = setTimeout(() => s.classList.remove('show'), 4200);
}

async function selectMethod(code, { scroll = false, announce = true } = {}) {
  const card = $(`.method-card[data-method="${code}"]`);
  if (!card) return;
  applyMethodTheme(code);
  state.method = code;
  localSet(METHOD_SELECT_KEY, code);
  updateTransmuteHint();

  if (scroll) scrollToEl(card, 'center');
  if (announce) card.focus({ preventScroll: true });

  const { source } = await loadMetaPrompt(code);
  const bytes = (state.metaPrompts[code] || '').length;
  flashCardStatus(card, source === 'file'
    ? `meta-prompt loaded · ${formatBytes(bytes)}`
    : `using embedded fallback · ${formatBytes(bytes)}`);
  if (source !== 'file') {
    toast(`${code}: ${METHODS[code].file} could not be fetched — the embedded fallback is in use.`, 'err', null, null, 6000);
  }
}

function initMethodCards() {
  const grid = $('#methodGrid');
  if (!grid) return;
  const cards = $$('.method-card', grid);

  // Per-card accent so CSS can reference var(--c) before any selection exists.
  cards.forEach((card) => {
    card.style.setProperty('--card-accent', card.dataset.accent);
    card.style.setProperty('--c', card.dataset.accent);
  });

  /* ── 3D tilt + specular highlight ────────────────────────────────────────── */
  if (!prefersReducedMotion()) {
    cards.forEach((card) => {
      const MAX = 8;
      let raf = 0;
      const apply = (rx, ry, mx, my) => {
        card.style.transition = 'transform 120ms linear, border-color 700ms cubic-bezier(.22,.61,.36,1), box-shadow 700ms cubic-bezier(.22,.61,.36,1)';
        card.style.transform = `perspective(1100px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateZ(6px)`;
        card.style.setProperty('--mx', mx + '%');
        card.style.setProperty('--my', my + '%');
      };
      card.addEventListener('pointermove', (e) => {
        if (e.pointerType === 'touch') return;
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0;
          const r = card.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width;
          const py = (e.clientY - r.top) / r.height;
          apply((0.5 - py) * MAX * 2, (px - 0.5) * MAX * 2, px * 100, py * 100);
        });
      }, { passive: true });
      card.addEventListener('pointerleave', () => {
        card.style.transition = '';
        card.style.transform = '';
      });
    });
  }

  /* ── Selection (pointer) ─────────────────────────────────────────────────── */
  cards.forEach((card) => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.mc-more')) return;   // the explainer toggle is not a selection
      selectMethod(card.dataset.method);
    });
  });

  /* ── Keyboard: radiogroup with a roving tabindex ─────────────────────────── */
  grid.addEventListener('keydown', (e) => {
    const current = cards.indexOf(document.activeElement);
    if (current < 0) return;
    let next = -1;
    switch (e.key) {
      case 'ArrowRight': case 'ArrowDown': next = (current + 1) % cards.length; break;
      case 'ArrowLeft':  case 'ArrowUp':   next = (current - 1 + cards.length) % cards.length; break;
      case 'Home': next = 0; break;
      case 'End':  next = cards.length - 1; break;
      case 'Enter': case ' ':
        e.preventDefault(); selectMethod(cards[current].dataset.method); return;
      default: return;
    }
    e.preventDefault();
    cards.forEach((c, i) => { c.tabIndex = i === next ? 0 : -1; });
    cards[next].focus();
  });

  /* ── "What is this?" expanders ───────────────────────────────────────────── */
  $$('.mc-more').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const body = document.getElementById(btn.getAttribute('aria-controls'));
      const open = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!open));
      if (body) body.hidden = open;
    });
  });

  // Restore the last choice (but do not steal focus or scroll on boot).
  const saved = localGet(METHOD_SELECT_KEY);
  if (saved && METHODS[saved]) {
    applyMethodTheme(saved);
    state.method = saved;
    loadMetaPrompt(saved).then(({ source }) => {
      const card = $(`.method-card[data-method="${saved}"]`);
      if (card) flashCardStatus(card, source === 'file' ? 'meta-prompt cached' : 'embedded fallback in use');
    }).catch(() => {});
  }
}


/* ══════════════════════════════════════════════════════════════════════════════
   §9 — ACT III · THE UPLOAD ALTAR
   ══════════════════════════════════════════════════════════════════════════════
   Accepts drag-and-drop, click-to-browse, clipboard paste and image URLs.
   Every image is re-drawn through a canvas: that normalises EXIF orientation,
   downscales the longest edge to ~1280px and re-encodes to JPEG ~0.85 so the
   payload sent to the vision model stays small.
   ══════════════════════════════════════════════════════════════════════════════ */
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/bmp'];

function showUploadError(msg) {
  const box = $('#uploadError');
  if (!box) return;
  box.textContent = msg;
  box.hidden = false;
  clearTimeout(box._t);
  box._t = setTimeout(() => { box.hidden = true; }, 9000);
}
function clearUploadError() {
  const box = $('#uploadError');
  if (box) box.hidden = true;
}

/** Reject early with a clear, non-alert message. Returns an error string or null. */
function validateFile(file) {
  if (!file) return 'No file received.';
  const type = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();
  const looksImage = ACCEPTED.includes(type) || /^image\//.test(type) ||
    /\.(jpe?g|png|webp|avif|gif|bmp)$/.test(name);
  if (!looksImage) return `“${file.name || 'that file'}” is not an image. JPG, PNG, WebP, AVIF, GIF or BMP, please.`;
  if (/\.heic$|\.heif$/.test(name) || /heic|heif/.test(type))
    return 'HEIC is not decodable in most browsers. Export the photo as JPG or PNG first.';
  if (file.size > APP_CONFIG.maxFileBytes)
    return `That image is ${formatBytes(file.size)} — over the ${formatBytes(APP_CONFIG.maxFileBytes)} limit. Resize it, or drop a smaller export.`;
  if (file.size === 0) return 'That file is empty.';
  return null;
}

/** Draw any image source into a canvas, honouring EXIF orientation where supported. */
async function drawToCanvas(source) {
  // createImageBitmap handles orientation + decode off the main thread when available.
  let drawable = source;
  let intrinsic = { width: source.naturalWidth || source.width, height: source.naturalHeight || source.height };
  try {
    if (typeof createImageBitmap === 'function' && source instanceof Blob) {
      try {
        drawable = await createImageBitmap(source, { imageOrientation: 'from-image' });
        intrinsic = { width: drawable.width, height: drawable.height };
      } catch (e) {
        drawable = await createImageBitmap(source);
        intrinsic = { width: drawable.width, height: drawable.height };
      }
    }
  } catch (e) { /* fall through to the <img> path */ }

  if (!intrinsic.width || !intrinsic.height) throw new Error('Could not read the image dimensions.');

  const scale = Math.min(1, APP_CONFIG.maxEdge / Math.max(intrinsic.width, intrinsic.height));
  const w = Math.max(1, Math.round(intrinsic.width * scale));
  const h = Math.max(1, Math.round(intrinsic.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const c = canvas.getContext('2d', { alpha: false });
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.fillStyle = '#0b0b11';
  c.fillRect(0, 0, w, h);
  c.drawImage(drawable, 0, 0, w, h);
  if (drawable.close) { try { drawable.close(); } catch (e) {} }
  return { canvas, width: w, height: h, sourceWidth: intrinsic.width, sourceHeight: intrinsic.height };
}

/** Load a File/Blob into an HTMLImageElement (fallback decode path). */
function blobToImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('The browser could not decode that image.')); };
    img.src = url;
  });
}

function dataUrlParts(dataUrl) {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(dataUrl || '');
  return m ? { mimeType: m[1], base64: m[2] } : { mimeType: 'image/jpeg', base64: '' };
}
function approxDataUrlBytes(dataUrl) {
  const p = dataUrlParts(dataUrl);
  return Math.round(p.base64.length * 0.75);
}

/** The whole ingest pipeline: validate → decode → downscale → encode → preview. */
async function ingestBlob(blob, displayName) {
  clearUploadError();
  const err = validateFile({ name: displayName || blob.name || 'image', type: blob.type, size: blob.size });
  if (err) { showUploadError(err); shakeDropzone(); return null; }

  let drawn;
  try {
    drawn = await drawToCanvas(blob);
  } catch (e1) {
    // Second chance through an <img> element (covers some AVIF/edge cases).
    try {
      const img = await blobToImage(blob);
      drawn = await drawToCanvas(img);
    } catch (e2) {
      showUploadError('That image could not be decoded. Try re-saving it as a JPG or PNG.');
      shakeDropzone();
      return null;
    }
  }

  let dataUrl;
  try {
    dataUrl = drawn.canvas.toDataURL('image/jpeg', APP_CONFIG.jpegQuality);
  } catch (e) {
    showUploadError('The canvas could not be encoded (this can happen with unusual colour profiles).');
    shakeDropzone();
    return null;
  }

  const bytes = approxDataUrlBytes(dataUrl);
  const parts = dataUrlParts(dataUrl);
  state.image = {
    dataUrl, base64: parts.base64, mimeType: parts.mimeType,
    bytes, origBytes: blob.size || bytes,
    origName: displayName || blob.name || 'reference image',
    width: drawn.width, height: drawn.height,
    bitmap: drawn.canvas
  };

  paintPreview();
  // An image on the altar never counts as "ready" until a methodology exists.
  setPhase(state.method ? 'ready' : 'idle');
  return state.image;
}

function paintPreview() {
  const dz = $('#dropzone'), figure = $('#dzPreview'), canvas = $('#dzCanvas');
  if (!dz || !figure || !canvas || !state.image.bitmap) return;

  canvas.width = state.image.bitmap.width;
  canvas.height = state.image.bitmap.height;
  canvas.getContext('2d').drawImage(state.image.bitmap, 0, 0);

  $('#dzMetaName').textContent = state.image.origName;
  const ratio = state.image.origBytes ? (state.image.bytes / state.image.origBytes) : 1;
  $('#dzMetaSize').textContent = ratio < 0.97
    ? `${formatBytes(state.image.origBytes)} → ${formatBytes(state.image.bytes)} — optimised for transmission`
    : `${formatBytes(state.image.bytes)} · ${state.image.width}×${state.image.height}`;

  dz.classList.add('has-image');
  figure.hidden = false;
  dz.setAttribute('aria-label', `Reference image loaded: ${state.image.origName}. Press Replace to choose another, or Remove to clear.`);

  // Pixel-dissolve reveal: a scanline wipe plus a brief blocky pass.
  if (!prefersReducedMotion()) {
    const scan = $('#dzScan');
    if (scan) {
      scan.classList.remove('run');
      void scan.offsetWidth;          // force reflow so the animation restarts
      scan.classList.add('run');
      setTimeout(() => scan.classList.remove('run'), 1000);
    }
    pixelateIn(canvas, state.image.bitmap, 460);
  }
}

/** Paints the image in from coarse blocks to full detail — a shader-like reveal. */
function pixelateIn(targetCanvas, sourceCanvas, durationMs) {
  const c = targetCanvas.getContext('2d');
  const w = targetCanvas.width, h = targetCanvas.height;
  const t0 = performance.now();
  const steps = 9;
  let i = 0;
  (function step() {
    const block = Math.max(1, Math.round(48 * Math.pow(1 - i / steps, 2.2)) + 1);
    if (block > 1) {
      const sw = Math.max(1, Math.round(w / block)), sh = Math.max(1, Math.round(h / block));
      c.imageSmoothingEnabled = false;
      c.drawImage(sourceCanvas, 0, 0, sw, sh);
      c.drawImage(targetCanvas, 0, 0, sw, sh, 0, 0, w, h);
      c.imageSmoothingEnabled = true;
    } else {
      c.drawImage(sourceCanvas, 0, 0, w, h);
    }
    i++;
    if (i <= steps && performance.now() - t0 < durationMs) requestAnimationFrame(step);
    else c.drawImage(sourceCanvas, 0, 0, w, h);
  })();
}

function shakeDropzone() {
  const dz = $('#dropzone');
  if (!dz) return;
  dz.classList.remove('flash'); void dz.offsetWidth; dz.classList.add('flash');
  setTimeout(() => dz.classList.remove('flash'), 500);
  dz.focus({ preventScroll: true });
}

function clearImage() {
  state.image = { dataUrl: null, base64: null, mimeType: 'image/jpeg', bytes: 0, origBytes: 0,
                  origName: 'image', width: 0, height: 0, bitmap: null };
  const dz = $('#dropzone'), figure = $('#dzPreview'), input = $('#fileInput');
  if (figure) figure.hidden = true;
  if (dz) { dz.classList.remove('has-image'); dz.setAttribute('aria-label',
    'Upload an image. Drag and drop, click to browse, or paste from the clipboard.'); }
  if (input) input.value = '';
  clearUploadError();
  setPhase(state.method ? 'idle' : 'idle');
  updateTransmuteHint();
  toast('Reference image cleared.');
}

async function ingestFromUrl(rawUrl) {
  let url;
  try { url = new URL(rawUrl.trim(), location.href); }
  catch (e) { showUploadError('That does not look like a valid URL.'); return; }
  if (!/^https?:$/.test(url.protocol)) { showUploadError('Only http and https URLs can be fetched.'); return; }

  const btn = $('#urlFetchBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Fetching…'; }
  const note = $('#urlNote');
  try {
    const res = await fetch(url.href, { mode: 'cors', credentials: 'omit' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct && !ct.startsWith('image/')) throw new Error('That URL did not return an image (it returned ' + ct + ').');
    const blob = await res.blob();
    const name = decodeURIComponent((url.pathname.split('/').pop() || 'image')).slice(0, 60) || 'image';
    const ok = await ingestBlob(blob, name);
    if (ok) toast('Fetched and optimised.', 'ok');
  } catch (e) {
    showUploadError('Could not fetch that URL — the host is probably blocking cross-origin reads. ' +
      'Right-click the image, save it, then drop the file in.');
    if (note) note.textContent = 'Tip: hosts without an Access-Control-Allow-Origin header cannot be read from a browser. Downloading the file always works.';
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Fetch'; }
  }
}

function initAltar() {
  const dz = $('#dropzone'), input = $('#fileInput');
  if (!dz || !input) return;

  const openPicker = () => input.click();
  dz.addEventListener('click', (e) => {
    if (e.target.closest('.dz-actions')) return;
    openPicker();
  });
  dz.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPicker(); }
  });
  input.addEventListener('change', () => {
    const f = input.files && input.files[0];
    if (f) ingestBlob(f, f.name);
  });

  $('#replaceBtn').addEventListener('click', (e) => { e.stopPropagation(); openPicker(); });
  $('#removeBtn').addEventListener('click', (e) => { e.stopPropagation(); clearImage(); });

  /* ── Drag & drop ─────────────────────────────────────────────────────────── */
  let dragDepth = 0;
  const hasFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
  ['dragenter', 'dragover'].forEach((type) => {
    dz.addEventListener(type, (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (type === 'dragenter') dragDepth++;
      e.dataTransfer.dropEffect = 'copy';
      dz.classList.add('dragover');
    });
  });
  dz.addEventListener('dragleave', (e) => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) dz.classList.remove('dragover');
  });
  dz.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth = 0;
    dz.classList.remove('dragover');
    const files = Array.from(e.dataTransfer.files || []);
    const first = files.find((f) => /^image\//.test(f.type)) || files[0];
    if (!first) { showUploadError('Nothing to read in that drop.'); return; }
    if (files.length > 1) toast(`${files.length} files dropped — using the first image.`, 'err');
    ingestBlob(first, first.name);
  });

  // Stop the browser from navigating away when a file misses the dropzone.
  ['dragover', 'drop'].forEach((type) => {
    window.addEventListener(type, (e) => {
      if (e.target === dz || dz.contains(e.target)) return;
      e.preventDefault();
      if (type === 'drop' && e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        const f = Array.from(e.dataTransfer.files).find((x) => /^image\//.test(x.type));
        if (f) ingestBlob(f, f.name);
      }
    });
  });

  /* ── Clipboard paste (the "I found it on the internet" path) ─────────────── */
  document.addEventListener('paste', (e) => {
    const dt = e.clipboardData;
    if (!dt) return;
    const item = Array.from(dt.items || []).find((i) => i.kind === 'file' && /^image\//.test(i.type || ''));
    if (item) {
      const file = item.getAsFile();
      if (file) { e.preventDefault(); ingestBlob(file, 'pasted image'); return; }
    }
    // Pasted URL text → try to fetch it.
    const text = (dt.getData('text') || '').trim();
    if (/^https?:\/\/\S+/i.test(text) && /\.(jpe?g|png|webp|avif|gif|bmp)(\?|#|$)/i.test(text)) {
      e.preventDefault();
      const field = $('#urlInput');
      if (field) field.value = text;
      ingestFromUrl(text);
    }
  });

  /* ── URL form ────────────────────────────────────────────────────────────── */
  const form = $('#urlForm');
  if (form) form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = $('#urlInput').value;
    if (!v.trim()) { showUploadError('Paste an image URL first.'); return; }
    ingestFromUrl(v);
  });
}


/* ══════════════════════════════════════════════════════════════════════════════
   §10 — THE RELAY ENGINE
   ══════════════════════════════════════════════════════════════════════════════
   A provider-agnostic client that:
     1. picks a provider at random (only among those with usable keys),
     2. walks that provider's key table sequentially from index 0,
     3. classifies every failure (burn / retry / payload-bug),
     4. fails over to the other provider when a table is exhausted,
     5. and always hands back one plain string.

   Keys are never logged — only `key #3 (••••abcd)`.
   ══════════════════════════════════════════════════════════════════════════════ */
const OWN_KEYS_STORAGE = 'pa_own_keys_v1';
const BURN_STORAGE = 'pa_burned_v1';

/** Error classes so the UI can react to *why* something failed. */
class RelayError extends Error {
  constructor(message, code, detail) {
    super(message);
    this.name = 'RelayError';
    this.code = code;          // 'exhausted' | 'payload' | 'cancelled' | 'no-keys' | 'empty'
    this.detail = detail || {};
  }
}

const Relay = (() => {
  /* ── 10.1 Key hygiene ─────────────────────────────────────────────────────── */
  const isPlaceholder = (k) => /^\s*PASTE[_-]/i.test(k) || /^\s*(your|replace|xxx|todo)/i.test(k);
  const usable = (k) => typeof k === 'string' && k.trim().length > 0 && !isPlaceholder(k);

  /** Repo keys for a provider, with dead entries filtered out. */
  function repoKeys(provider) {
    const list = (API_CONFIG[provider] && API_CONFIG[provider].keys) || [];
    return list.filter(usable);
  }

  /* ── 10.2 Session burn list ───────────────────────────────────────────────
     In-memory Set for the fast path + a sessionStorage timestamp map so a page
     reload inside the cooldown does not resurrect a dead key.
     ─────────────────────────────────────────────────────────────────────── */
  const burned = new Set();

  function loadBurned() {
    burned.clear();
    let map = {};
    try { map = JSON.parse(sessionGet(BURN_STORAGE) || '{}'); } catch (e) { map = {}; }
    const now = Date.now();
    let changed = false;
    Object.keys(map).forEach((k) => {
      if (now - map[k] > APP_CONFIG.burnTtlMs) { delete map[k]; changed = true; }
      else burned.add(k);
    });
    if (changed) sessionSet(BURN_STORAGE, JSON.stringify(map));
    return map;
  }
  function burn(provider, index, reason) {
    const id = `${provider}:${index}`;
    burned.add(id);
    let map = {};
    try { map = JSON.parse(sessionGet(BURN_STORAGE) || '{}'); } catch (e) { map = {}; }
    map[id] = Date.now();
    sessionSet(BURN_STORAGE, JSON.stringify(map));
    logLine(`burned ${provider} key #${index} (${reason}) — cooling for ${Math.round(APP_CONFIG.burnTtlMs / 60000)} min`, 'bad');
    updateHealthChip();
  }
  const isBurned = (provider, index) => burned.has(`${provider}:${index}`);

  /* ── 10.3 "Use my own key" ────────────────────────────────────────────────
     Stored only in this browser. Own keys are prepended, so they are always
     tried before any repository key.
     ─────────────────────────────────────────────────────────────────────── */
  function ownKeys() {
    try { return JSON.parse(localGet(OWN_KEYS_STORAGE) || '{}') || {}; }
    catch (e) { return {}; }
  }
  function saveOwnKeys(obj) {
    state.ownKeys = obj || {};
    localSet(OWN_KEYS_STORAGE, JSON.stringify(state.ownKeys));
    updateHealthChip();
  }

  /** The full, ordered key table for a provider: [own?, ...repo], minus burned. */
  function keyTable(provider) {
    const own = (ownKeys()[provider] || '').trim();
    const table = [];
    if (usable(own)) table.push({ key: own, origin: 'own', index: 'own' });
    repoKeys(provider).forEach((k, i) => table.push({ key: k, origin: 'repo', index: i }));
    return table.filter((entry) =>
      entry.origin === 'own' ? !isBurned(provider, 'own') : !isBurned(provider, entry.index));
  }
  function hasUsableKey(provider) { return keyTable(provider).length > 0; }
  function totalChannels() {
    return ['gemini', 'openai'].reduce((n, p) => {
      const own = usable((ownKeys()[p] || '').trim()) ? 1 : 0;
      return n + own + repoKeys(p).length;
    }, 0);
  }
  function healthyChannels() {
    return ['gemini', 'openai'].reduce((n, p) => n + keyTable(p).length, 0);
  }

  /* ── 10.4 Debug log ─────────────────────────────────────────────────────── */
  const logBuffer = [];
  function logLine(msg, kind) {
    const t = new Date().toTimeString().slice(0, 8);
    const line = { t, msg, kind: kind || '' };
    logBuffer.push(line);
    if (logBuffer.length > 300) logBuffer.shift();
    const tag = kind === 'bad' ? '✗' : kind === 'ok' ? '✓' : '·';
    console.log(`%c[relay ${t}]%c ${tag} ${msg}`,
      'color:#888', kind === 'bad' ? 'color:#ff7a72' : kind === 'ok' ? 'color:#5fd39a' : 'color:#ff9a3c');
    if (typeof renderDebugLog === 'function') renderDebugLog();
  }

  /* ── 10.5 Payload adapters ────────────────────────────────────────────────
     One function per vendor. Both take the same inputs and return the exact
     body that vendor expects.
     ─────────────────────────────────────────────────────────────────────── */
  function buildPayload(provider, key, { imageBase64, mimeType, metaPrompt }) {
    const cfg = API_CONFIG[provider];
    if (provider === 'gemini') {
      return {
        url: cfg.endpoint(cfg.model, key),
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { text: metaPrompt },
              { inline_data: { mime_type: mimeType, data: imageBase64 } }
            ]
          }],
          generationConfig: {
            temperature: cfg.temperature,
            maxOutputTokens: cfg.maxTokens,
            topP: 0.95
          }
        })
      };
    }
    // openai
    return {
      url: cfg.endpoint(cfg.model, key),
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key
      },
      body: JSON.stringify({
        model: cfg.model,
        temperature: cfg.temperature,
        max_tokens: cfg.maxTokens,
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: metaPrompt },
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: 'high' } }
          ]
        }]
      })
    };
  }

  /* ── 10.6 Response normalisers — both return one plain string ───────────── */
  function parseGemini(json) {
    const cand = json && json.candidates && json.candidates[0];
    if (!cand) {
      const fb = json && json.promptFeedback;
      const reason = fb && fb.blockReason ? fb.blockReason : 'no candidates returned';
      return { text: '', note: 'Gemini returned ' + reason };
    }
    const finish = cand.finishReason || '';
    if (finish && finish !== 'STOP' && finish !== 'MAX_TOKENS') {
      return { text: '', note: 'Gemini stopped: ' + finish };
    }
    const parts = (cand.content && cand.content.parts) || [];
    return { text: parts.map((p) => p.text || '').join(''), note: finish === 'MAX_TOKENS' ? 'truncated' : '' };
  }
  function parseOpenai(json) {
    const choice = json && json.choices && json.choices[0];
    if (!choice) return { text: '', note: 'no choices returned' };
    const msg = choice.message || {};
    if (typeof msg.content === 'string') return { text: msg.content, note: '' };
    if (Array.isArray(msg.content)) {
      return { text: msg.content.map((c) => (c && c.text) || '').join(''), note: '' };
    }
    return { text: '', note: choice.finish_reason ? 'stopped: ' + choice.finish_reason : '' };
  }

  /* ── 10.7 Failure classification ──────────────────────────────────────────
     burn  → the key is dead for this session, advance immediately
     retry → the server/network hiccuped, try the same key again after a pause
     fatal → the payload itself is wrong; do NOT burn the key, surface the bug
     empty → the model answered with nothing usable
     ─────────────────────────────────────────────────────────────────────── */
  function classify(status, bodyText) {
    const s = Number(status) || 0;
    const body = String(bodyText || '').toLowerCase();
    // Quota / auth signals win over the status code: Gemini and OpenAI both
    // report exhausted quota or bad keys with a 400, and that IS a dead key.
    if (/resource_exhausted|insufficient_quota|quota exceeded|rate.?limit|exceeded your current quota|billing|invalid[ _-]?api[ _-]?key|api key not valid|incorrect api key|unauthor|permission_denied/
        .test(body)) return 'burn';
    if (s === 429 || s === 401 || s === 402 || s === 403) return 'burn';
    if (s === 400 || s === 404 || s === 422) return 'fatal';   // our payload is wrong, not the key
    if (s >= 500) return 'retry';
    if (/context_length_exceeded|invalid_request_error|invalid json|unknown model|model_not_found/.test(body)) return 'fatal';
    if (s >= 200 && s < 300) return 'ok';
    return 'retry';
  }

  /* ── 10.8 One HTTP attempt against one key ─────────────────────────────── */
  async function attemptOnce(provider, entry, payload, { signal, onStatus }) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(new Error('timeout')), APP_CONFIG.requestTimeoutMs);
    const onOuterAbort = () => ac.abort(new Error('cancelled'));
    if (signal) {
      if (signal.aborted) { clearTimeout(timer); throw new RelayError('Cancelled.', 'cancelled'); }
      signal.addEventListener('abort', onOuterAbort, { once: true });
    }
    const started = performance.now();
    try {
      const res = await fetch(payload.url, {
        method: payload.method,
        headers: payload.headers,
        body: payload.body,
        signal: ac.signal
      });
      const latency = Math.round(performance.now() - started);
      const text = await res.text();
      const label = entry.origin === 'own' ? 'own key' : `key #${entry.index}`;
      logLine(`${provider} ${label} (${maskKey(entry.key)}) → HTTP ${res.status} · ${latency}ms`,
        res.ok ? 'ok' : 'bad');
      if (onStatus) onStatus({ provider, status: res.status, latency });
      return { ok: res.ok, status: res.status, body: text, latency };
    } catch (err) {
      const latency = Math.round(performance.now() - started);
      const cancelled = (signal && signal.aborted) ||
        (err && /cancel/i.test(String(err.message || err.name || '')));
      if (cancelled) throw new RelayError('Transmutation cancelled.', 'cancelled');
      const timedOut = err && /timeout/i.test(String(err.message || ''));
      logLine(`${provider} ${entry.origin === 'own' ? 'own key' : 'key #' + entry.index} → ` +
              `${timedOut ? 'timeout' : 'network error'} after ${latency}ms`, 'bad');
      return { ok: false, status: 0, body: timedOut ? 'timeout' : 'network error: ' + (err && err.message), latency, network: true };
    } finally {
      clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onOuterAbort);
    }
  }

  /** Try one key, with the 5xx/timeout retry-and-backoff rule applied. */
  async function tryKey(provider, entry, payload, opts) {
    let attemptResult = await attemptOnce(provider, entry, payload, opts);

    let kind = attemptResult.ok ? 'ok' : classify(attemptResult.status, attemptResult.body);

    if (kind === 'retry') {
      for (let b = 0; b < APP_CONFIG.backoffMs.length; b++) {
        const wait = APP_CONFIG.backoffMs[b];
        logLine(`${provider} retrying same key in ${wait}ms (attempt ${b + 2})`, 'info');
        if (opts.onStatus) opts.onStatus({ provider, status: attemptResult.status, backoff: wait });
        await sleep(wait);
        attemptResult = await attemptOnce(provider, entry, payload, opts);
        kind = attemptResult.ok ? 'ok' : classify(attemptResult.status, attemptResult.body);
        if (kind !== 'retry') break;
      }
    }
    return { kind, result: attemptResult };
  }

  /** Walk one provider's whole key table, sequentially from index 0. */
  async function walkProvider(provider, metaPrompt, image, opts) {
    const table = keyTable(provider);
    if (!table.length) {
      logLine(`${provider} skipped — no usable keys`, 'info');
      return null;
    }
    logLine(`walking ${provider}: ${table.length} key(s) available`, 'info');

    for (let i = 0; i < table.length; i++) {
      const entry = table[i];
      if (opts.signal && opts.signal.aborted) throw new RelayError('Transmutation cancelled.', 'cancelled');

      const payload = buildPayload(provider, entry.key, {
        imageBase64: image.base64,
        mimeType: image.mimeType,
        metaPrompt
      });
      if (opts.onStatus) opts.onStatus({ provider, keyIndex: i, total: table.length });

      const { kind, result } = await tryKey(provider, entry, payload, opts);

      if (kind === 'ok') {
        let parsed;
        try { parsed = provider === 'gemini' ? parseGemini(JSON.parse(result.body)) : parseOpenai(JSON.parse(result.body)); }
        catch (e) {
          return { kind: 'fatal', provider, entry, status: result.status, latency: result.latency,
                   message: `${API_CONFIG[provider].label} replied with something that was not JSON.` };
        }
        const text = stripFences(parsed.text || '');
        if (!text) {
          logLine(`${provider} key #${entry.index} answered empty (${parsed.note || 'no text'})`, 'bad');
          return { kind: 'empty', provider, entry, latency: result.latency, note: parsed.note };
        }
        return { kind: 'ok', provider, entry, text, latency: result.latency, status: result.status, note: parsed.note };
      }

      if (kind === 'burn') {
        burn(provider, entry.index, `HTTP ${result.status}`);
        continue;                                  // advance to the next key immediately
      }
      if (kind === 'fatal') {
        // A payload bug, not a key problem: do not burn, surface it loudly.
        let detail = result.body;
        try { detail = JSON.stringify(JSON.parse(result.body)).slice(0, 400); } catch (e) { detail = String(detail).slice(0, 400); }
        logLine(`${provider} rejected the payload (HTTP ${result.status}) — this is a request bug, key not burned`, 'bad');
        return { kind: 'fatal', provider, entry, status: result.status, latency: result.latency, message: detail };
      }
      // 'retry' exhausted → advance to the next key
      logLine(`${provider} key #${entry.index} still failing after retries — advancing`, 'bad');
    }
    return null;   // table exhausted
  }

  /* ── 10.9 The public entry point ──────────────────────────────────────────
     requestPrompt({ imageBase64, mimeType, metaPrompt }) → { text, provider, … }
     ─────────────────────────────────────────────────────────────────────── */
  async function requestPrompt(input, opts = {}) {
    const image = {
      base64: input.imageBase64 || (input.image && input.image.base64) || '',
      mimeType: input.mimeType || (input.image && input.image.mimeType) || 'image/jpeg'
    };
    if (!image.base64) throw new RelayError('No image data to send.', 'payload');

    const forced = opts.forceProvider || state.forceProvider || 'auto';
    const providers = ['gemini', 'openai'].filter((p) => hasUsableKey(p));
    if (!providers.length) {
      throw new RelayError('No usable API keys configured.', 'no-keys',
        { hint: 'Add keys to API_CONFIG in app.js, or press “Key” in the header and paste your own.' });
    }

    // Random provider choice, equal probability — unless one side has no keys,
    // or the developer has forced a provider (which still allows failover).
    let order;
    if (forced !== 'auto' && providers.includes(forced)) {
      order = [forced].concat(providers.filter((p) => p !== forced));
    } else {
      order = providers.slice().sort(() => Math.random() - 0.5);
    }
    logLine(`providers in play: ${order.join(', ')}${forced !== 'auto' ? ` (forced: ${forced})` : ''}`, 'info');

    const attempts = [];
    let reinforce = false;
    let guard = 0;

    while (guard++ < APP_CONFIG.maxFullAttempts) {
      let allFatal = true;

      for (const provider of order) {
        if (opts.signal && opts.signal.aborted) throw new RelayError('Transmutation cancelled.', 'cancelled');

        const metaPrompt = reinforce ? input.metaPrompt + REINFORCE_SUFFIX : input.metaPrompt;
        const outcome = await walkProvider(provider, metaPrompt, image, opts);
        if (!outcome) continue;                       // this provider is exhausted → fail over

        if (outcome.kind === 'ok') {
          logLine(`forged via ${provider} (${API_CONFIG[provider].label}) in ${outcome.latency}ms`, 'ok');
          return {
            text: outcome.text,
            provider: provider,
            providerLabel: API_CONFIG[provider].label,
            model: API_CONFIG[provider].model,
            latency: outcome.latency,
            keyOrigin: outcome.entry.origin,
            note: outcome.note || ''
          };
        }
        if (outcome.kind === 'empty') {
          // The model answered with nothing. Reinforce once and try again.
          if (!reinforce) {
            reinforce = true;
            logLine('empty response — retrying once with a reinforced instruction', 'info');
            if (opts.onStatus) opts.onStatus({ provider, reinforce: true });
            allFatal = false;
            break;
          }
          attempts.push({ provider, kind: 'empty' });
          continue;
        }
        if (outcome.kind === 'fatal') {
          attempts.push({ provider, kind: 'fatal', status: outcome.status, message: outcome.message });
          // A malformed payload will fail identically everywhere — stop now.
          throw new RelayError(
            `${API_CONFIG[provider].label} rejected the request (HTTP ${outcome.status}). This is a payload/config problem, not a key problem.`,
            'payload', { status: outcome.status, body: outcome.message });
        }
        allFatal = false;
      }

      if (!allFatal && reinforce && guard < APP_CONFIG.maxFullAttempts) continue;
      break;
    }

    logLine('all channels exhausted', 'bad');
    throw new RelayError('All channels saturated.', 'exhausted', { attempts });
  }

  return {
    requestPrompt, logLine, logBuffer,
    repoKeys, keyTable, hasUsableKey, totalChannels, healthyChannels,
    ownKeys, saveOwnKeys, isBurned, burned,
    // exported for testing
    _internal: { classify, stripFences, buildPayload, parseGemini, parseOpenai, usable, isPlaceholder }
  };
})();


/* ══════════════════════════════════════════════════════════════════════════════
   §10b — CHANNEL HEALTH + "USE MY OWN KEY" PANEL
   ══════════════════════════════════════════════════════════════════════════════ */
function updateHealthChip() {
  const healthy = Relay.healthyChannels();
  const total = Relay.totalChannels();
  const text = total === 0
    ? 'no channels configured'
    : `${healthy} of ${total} channel${total === 1 ? '' : 's'} live`;
  ['#healthChipText', '#healthChipFootText'].forEach((sel) => {
    const el = $(sel);
    if (el) el.textContent = text;
  });
  ['#healthChip', '#healthChipFoot'].forEach((sel) => {
    const chip = $(sel);
    if (!chip) return;
    const dot = $('.hc-dot', chip);
    if (dot) dot.classList.toggle('down', healthy === 0);
  });
  const stat = $('#statChannels');
  if (stat) stat.textContent = String(total);
  const dd = $('#ddKeys');
  if (dd) {
    const parts = ['gemini', 'openai'].map((p) => `${p} ${Relay.keyTable(p).length}/${Relay.repoKeys(p).length + (Relay.ownKeys()[p] ? 1 : 0)}`);
    dd.textContent = 'keys: ' + parts.join(' · ') + (Relay.burned.size ? ` · ${Relay.burned.size} cooling` : '');
  }
}

function initKeysPanel() {
  const back = $('#keysBackdrop');
  if (!back) return;
  const g = $('#ownGemini'), o = $('#ownOpenai');

  // Hydrate from storage.
  const own = Relay.ownKeys();
  state.ownKeys = { gemini: own.gemini || '', openai: own.openai || '' };
  g.value = state.ownKeys.gemini;
  o.value = state.ownKeys.openai;

  const open = () => {
    g.value = state.ownKeys.gemini; o.value = state.ownKeys.openai;
    back.hidden = false;
    g.focus();
  };
  const close = () => { back.hidden = true; };

  $('#keysBtn').addEventListener('click', open);
  const foot = $('#footKeysBtn');
  if (foot) foot.addEventListener('click', open);
  $('#keysClose').addEventListener('click', close);
  back.addEventListener('pointerdown', (e) => { if (e.target === back) close(); });

  $('#keysSave').addEventListener('click', () => {
    const next = { gemini: g.value.trim(), openai: o.value.trim() };
    // Forget the burned flag for a provider whose own key just changed.
    ['gemini', 'openai'].forEach((p) => {
      if (next[p] !== state.ownKeys[p]) Relay.burned.delete(`${p}:own`);
    });
    saveOwnKeysPublic(next);
    close();
    toast(next.gemini || next.openai ? 'Your keys are saved in this browser.' : 'No personal keys stored.', 'ok');
  });

  $('#keysClear').addEventListener('click', async () => {
    const yes = await confirmDialog({
      title: 'Forget your keys?',
      body: 'This removes your personal Gemini and OpenAI keys from this browser. Repository keys are unaffected.',
      confirmLabel: 'Forget them'
    });
    if (!yes) return;
    saveOwnKeysPublic({ gemini: '', openai: '' });
    g.value = ''; o.value = '';
    close();
    toast('Personal keys forgotten.', 'ok');
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !back.hidden) close();
  });
}
function saveOwnKeysPublic(next) {
  Relay.saveOwnKeys(next);
  updateHealthChip();
}


/* ══════════════════════════════════════════════════════════════════════════════
   §11 — ACT IV · TRANSMUTATION OVERLAY
   ══════════════════════════════════════════════════════════════════════════════
   The showpiece. The image lifts to centre stage, a luminous scanner sweeps it,
   corner reticles drift, pseudo-telemetry scrolls, and the picture appears to
   disintegrate into particles that spiral into a glowing crucible while the
   chosen methodology's glyph turns behind it.
   ══════════════════════════════════════════════════════════════════════════════ */
let transmuteAbort = null;
let ringRaf = 0;
let crucibleRaf = 0;
let telemetryTimer = 0;

/** Decorative "analysis" brackets scattered over the image. */
function seedBrackets() {
  const g = $('#ovBracketGroup');
  if (!g) return;
  g.innerHTML = '';
  const n = 5;
  for (let i = 0; i < n; i++) {
    const w = rand(18, 62), h = rand(14, 54);
    const x = rand(4, 96 - w), y = rand(4, 96 - h);
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('x', x.toFixed(1)); r.setAttribute('y', y.toFixed(1));
    r.setAttribute('width', w.toFixed(1)); r.setAttribute('height', h.toFixed(1));
    r.style.animationDelay = (i * 0.36).toFixed(2) + 's';
    g.appendChild(r);
  }
}

/** The methodology glyph, re-used as a slowly rotating backdrop. */
function paintOverlayGlyph(code) {
  const host = $('#ovGlyph');
  if (!host) return;
  const src = $(`.method-card[data-method="${code}"] .mc-glyph`);
  host.innerHTML = src ? src.innerHTML : '';
}

function startTelemetry() {
  const host = $('#ovTelemetry');
  if (!host) return;
  const reduced = prefersReducedMotion();
  const push = () => {
    const line = pick(TELEMETRY);
    host.textContent = (host.textContent ? host.textContent.split('\n').slice(-3).join('\n') + '\n' : '') + line;
  };
  host.textContent = '';
  push();
  if (reduced) return;
  telemetryTimer = setInterval(push, 780);
}
function stopTelemetry() { clearInterval(telemetryTimer); telemetryTimer = 0; }

/* ── 11.1 The crucible: image → particles → glowing core ─────────────────── */
const Crucible = (() => {
  let cv = null, ctx = null, parts = [], running = false, w = 0, h = 0, cx = 0, cy = 0, t = 0;
  let accent = [255, 154, 60];

  function seedFromImage(imgCanvas) {
    parts = [];
    if (!imgCanvas) return;
    const sample = document.createElement('canvas');
    const sw = 64, sh = Math.max(1, Math.round(64 * (imgCanvas.height / imgCanvas.width)));
    sample.width = sw; sample.height = sh;
    const sc = sample.getContext('2d');
    sc.drawImage(imgCanvas, 0, 0, sw, sh);
    let data = null;
    try { data = sc.getImageData(0, 0, sw, sh).data; } catch (e) { data = null; }

    const count = sw * sh;
    for (let i = 0; i < count; i++) {
      const px = (i % sw) / sw, py = ((i / sw) | 0) / sh;
      let r = 190, g = 170, b = 150;
      if (data) { r = data[i * 4]; g = data[i * 4 + 1]; b = data[i * 4 + 2]; }
      // Start each particle somewhere across the stage, biased toward the image area.
      parts.push({
        x: lerp(w * 0.2, w * 0.8, px) + rand(-30, 30),
        y: lerp(h * 0.18, h * 0.62, py) + rand(-30, 30),
        vx: rand(-0.5, 0.5), vy: rand(-0.5, 0.5),
        r: rand(0.8, 2.4), life: 1, spin: rand(-0.05, 0.05),
        col: [r, g, b], orbit: rand(0.6, 1.5), seed: Math.random() * 6.28
      });
    }
  }

  function resize() {
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    w = cv.clientWidth || window.innerWidth;
    h = cv.clientHeight || window.innerHeight;
    cv.width = Math.floor(w * dpr); cv.height = Math.floor(h * dpr);
    ctx = cv.getContext('2d');
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx = w / 2; cy = h * 0.44;
  }

  function readAccent() {
    if (typeof getComputedStyle !== 'function') return;
    const cs = getComputedStyle(document.documentElement);
    const m = cs.getPropertyValue('--accent').match(/-?[\d.]+/g);
    if (m && m.length >= 3) accent = [+m[0], +m[1], +m[2]];
  }

  function frame() {
    if (!running || !ctx) return;
    crucibleRaf = requestAnimationFrame(frame);
    t += 0.016;
    ctx.clearRect(0, 0, w, h);

    // Core glow
    const pulse = 0.72 + 0.28 * Math.sin(t * 2.1);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, 130 * pulse);
    grad.addColorStop(0, `rgba(${accent[0]},${accent[1]},${accent[2]},0.55)`);
    grad.addColorStop(0.35, `rgba(${accent[0]},${accent[1]},${accent[2]},0.14)`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, 130 * pulse, 0, Math.PI * 2); ctx.fill();

    // Particles spiralling inward
    for (const p of parts) {
      const dx = cx - p.x, dy = cy - p.y;
      const d = Math.hypot(dx, dy) || 1;
      const pull = 0.0016 * (1 + 260 / d);
      p.vx += dx * pull - dy * 0.0012 * p.orbit;
      p.vy += dy * pull + dx * 0.0012 * p.orbit;
      p.vx *= 0.985; p.vy *= 0.985;
      p.x += p.vx; p.y += p.vy;
      p.life = clamp(d / 260, 0.06, 1);

      const fade = 0.14 + 0.5 * p.life;
      const col = p.col;
      ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${fade.toFixed(3)})`;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.5 + p.life), 0, Math.PI * 2); ctx.fill();
    }
  }

  function start(imgCanvas) {
    cv = $('#ovCrucible');
    if (!cv) return;
    readAccent();
    resize();
    seedFromImage(imgCanvas);
    if (prefersReducedMotion()) return;
    running = true;
    crucibleRaf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(crucibleRaf);
    parts = [];
    if (ctx && cv) ctx.clearRect(0, 0, cv.width, cv.height);
  }
  return { start, stop, resize };
})();

/* ── 11.2 The progress ring — honest-ish ─────────────────────────────────── */
function startRing() {
  const fg = $('#ringFg'), pct = $('#ringPct');
  const set = (v) => {
    const p = clamp(v, 0, 1);
    if (fg) fg.style.setProperty('--ring', p.toFixed(4));
    if (pct) pct.textContent = Math.round(p * 100) + '%';
  };
  set(0);
  if (prefersReducedMotion()) {
    // No fake progress: just show an indeterminate state.
    if (pct) pct.textContent = '···';
    return { finish: () => set(1) };
  }
  const t0 = performance.now();
  let done = false;
  (function tick() {
    if (done) return;
    const e = easeOutCubic((performance.now() - t0) / APP_CONFIG.ringSettleMs);
    set(e * 0.9);
    ringRaf = requestAnimationFrame(tick);
  })();
  return {
    finish() { done = true; cancelAnimationFrame(ringRaf); set(1); }
  };
}

/* ── 11.3 Overlay lifecycle ──────────────────────────────────────────────── */
function openOverlay() {
  const ov = $('#transmuteOverlay');
  if (!ov) return;
  const img = $('#ovImage');
  if (img && state.image.dataUrl) img.src = state.image.dataUrl;
  paintOverlayGlyph(state.method || 'IWP');
  seedBrackets();
  ov.hidden = false;
  document.body.classList.add('transmuting');
  const title = document.title;
  document.title = '⚗️ Transmuting…';
  ov._prevTitle = title;
  $('#cancelBtn').focus({ preventScroll: true });

  startTelemetry();
  Crucible.start(state.image.bitmap);
  window.addEventListener('resize', Crucible.resize);

  // Disintegrate the still image once the particle field is alive.
  const still = $('#ovImage');
  if (still && !prefersReducedMotion()) {
    setTimeout(() => { still.style.transition = 'opacity 1600ms cubic-bezier(.16,1,.3,1)'; still.style.opacity = '0.12'; }, 1500);
  }
}

function closeOverlay() {
  const ov = $('#transmuteOverlay');
  stopTelemetry();
  Crucible.stop();
  window.removeEventListener('resize', Crucible.resize);
  cancelAnimationFrame(ringRaf);
  document.body.classList.remove('transmuting');
  if (ov) {
    ov.hidden = true;
    if (ov._prevTitle) document.title = ov._prevTitle;
    const still = $('#ovImage');
    if (still) { still.style.opacity = ''; still.style.transition = ''; }
  }
}

function setOverlayStatus(text) {
  const el = $('#ovStatus');
  if (el && text != null) el.textContent = text;
}

/* ── 11.4 The transmutation itself ───────────────────────────────────────── */
async function runTransmutation({ reuseImage = true, forcedMethod = null } = {}) {
  if (state.phase === 'working') return;

  // Validation first — nudge the missing piece rather than blocking silently.
  const missing = [];
  if (!state.method) missing.push('method');
  if (!state.image.dataUrl) missing.push('image');
  if (missing.length) {
    if (missing.includes('method') && missing.includes('image')) {
      toast('Two things are missing: choose a methodology and add a reference image.', 'err', null, null, 5200);
      const grid = $('#methodGrid');
      if (grid) { grid.classList.remove('nudge'); void grid.offsetWidth; grid.classList.add('nudge'); }
      shakeDropzone();
    } else if (missing.includes('method')) {
      toast('Choose a methodology first — the forge needs to know how to read the image.', 'err');
      const grid = $('#methodGrid');
      if (grid) {
        grid.classList.remove('nudge'); void grid.offsetWidth; grid.classList.add('nudge');
        scrollToEl(grid, 'center');
      }
    } else {
      toast('Add a reference image first.', 'err');
      shakeDropzone();
      scrollToEl($('#altar'), 'center');
    }
    return;
  }

  const method = forcedMethod || state.method;
  const { text: metaPrompt, source } = await loadMetaPrompt(method);
  if (!metaPrompt || !metaPrompt.trim()) {
    toast(`The ${method} meta-prompt is empty. Paste your text into ${METHODS[method].file} (or the embedded fallback).`, 'err', null, null, 7000);
    return;
  }
  if (source === 'embedded' && /PASTE .*META-PROMPT/.test(metaPrompt)) {
    toast(`The ${method} meta-prompt has not been pasted yet — replace ${METHODS[method].file} or the embedded fallback in app.js.`, 'err', null, null, 8000);
    return;
  }

  setPhase('working');
  openOverlay();
  setOverlayStatus('Choosing a channel…');
  const ring = startRing();

  transmuteAbort = new AbortController();
  const started = performance.now();

  try {
    const res = await Relay.requestPrompt({
      imageBase64: state.image.base64,
      mimeType: state.image.mimeType,
      metaPrompt
    }, {
      signal: transmuteAbort.signal,
      onStatus: (info) => {
        if (info.reinforce) { setOverlayStatus('First answer was empty — reinforcing…'); return; }
        if (info.backoff) { setOverlayStatus(`Channel busy — retrying in ${info.backoff}ms…`); return; }
        if (info.status && info.status >= 400) { setOverlayStatus('Rotating to the next key…'); return; }
        if (info.total) { setOverlayStatus(`Reading the image via ${API_CONFIG[info.provider].label}…`); return; }
      }
    });

    ring.finish();
    const wall = Math.round(performance.now() - started);
    setOverlayStatus(`Distilled via ${res.providerLabel} · ${(res.latency / 1000).toFixed(1)}s`);
    await sleep(prefersReducedMotion() ? 120 : 620);
    closeOverlay();

    renderResult({ text: res.text, provider: res.providerLabel, model: res.model, latency: wall, method });
    updateHealthChip();
  } catch (err) {
    ring.finish();
    closeOverlay();
    setPhase('ready');
    handleRelayFailure(err);
  } finally {
    transmuteAbort = null;
  }
}

/** One place that turns every RelayError into a calm, actionable message. */
function handleRelayFailure(err) {
  const code = err && err.code;
  if (code === 'cancelled') { toast('Transmutation cancelled. The image is still on the altar.', 'err'); return; }
  if (code === 'no-keys') {
    toast('No usable API keys yet. Press “Key” in the header to add your own.', 'err',
      'Add a key', () => $('#keysBtn').click(), 9000);
    return;
  }
  if (code === 'payload') {
    const detail = (err.detail && err.detail.body) ? String(err.detail.body).slice(0, 220) : '';
    toast('The request was rejected as malformed — check the model id and payload in app.js.' +
      (detail ? ' (' + detail + ')' : ''), 'err', null, null, 11000);
    console.error('[Alchemist] payload error', err);
    return;
  }
  // exhausted
  toast('All channels saturated — the forge is cooling. Try again shortly.', 'err',
    'Retry', () => runTransmutation(), 10000);
}

function initTransmute() {
  const btn = $('#transmuteBtn');
  if (btn) btn.addEventListener('click', () => runTransmutation());
  const hero = $('#heroCta');
  if (hero) hero.addEventListener('click', () => {
    const target = state.method ? $('#altar') : $('#method');
    if (target) scrollToEl(target, 'start');
  });
  $('#cancelBtn').addEventListener('click', () => {
    if (transmuteAbort) {
      try { transmuteAbort.abort(); } catch (e) {}
    }
    closeOverlay();
    setPhase('ready');
    toast('Transmutation cancelled.', 'err');
  });
}


/* ══════════════════════════════════════════════════════════════════════════════
   §12 — ACT V · THE ARTIFACT
   ══════════════════════════════════════════════════════════════════════════════
   The returned prompt decrypts into place, then re-renders according to the
   methodology that produced it:
     IWP  → weighted tokens become chips, saturation proportional to weight
     NLDP → justified prose with a drop cap
     SSP  → pretty-printed JSON/YAML/key-value with hand-rolled highlighting
            and collapsible sections
   ══════════════════════════════════════════════════════════════════════════════ */
const DEFAULT_SUFFIX =
  'Preserve the facial identity of the attached reference photo with high fidelity; ' +
  'apply the style, lighting, mood and composition described above.';

let typewriterTimer = 0;
let typewriterSkip = null;

/* ── 12.1 Format detection ────────────────────────────────────────────────── */
function detectFormat(text, method) {
  const t = (text || '').trim();
  if (/^\{[\s\S]*\}$/.test(t) || /^\[[\s\S]*\]$/.test(t)) {
    try { JSON.parse(t); return 'json'; } catch (e) { /* not strict JSON — keep looking */ }
  }
  const lines = t.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length >= 3) {
    const kv = lines.filter((l) => /^["']?[A-Za-z][\w .&/-]{0,40}["']?\s*[:=]\s*\S/.test(l)).length;
    if (kv / lines.length >= 0.6) return 'kv';
  }
  if (/\([^)]{0,24}:\s*-?\d+(?:\.\d+)?\s*\)/.test(t) && t.length < 900) return 'iwp';
  if (method === 'IWP') return 'iwp';
  return 'prose';
}

/* ── 12.2 Hand-written syntax highlighter ─────────────────────────────────── */
function highlightJson(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i];

    if (ch === '"') {                                   // string or key
      let j = i + 1, s = '"';
      while (j < n) {
        if (src[j] === '\\') { s += src[j] + (src[j + 1] || ''); j += 2; continue; }
        s += src[j];
        if (src[j] === '"') { j++; break; }
        j++;
      }
      let k = j;
      while (k < n && /\s/.test(src[k])) k++;
      const cls = src[k] === ':' ? 'tk-key' : 'tk-str';
      out.push(`<span class="${cls}">${escapeHtml(s)}</span>`);
      i = j;
      continue;
    }
    if (/[-\d]/.test(ch) && /[-\d.]/.test(src.slice(i, i + 1))) {
      const m = /^-?\d+(\.\d+)?([eE][+-]?\d+)?/.exec(src.slice(i));
      if (m) { out.push(`<span class="tk-num">${escapeHtml(m[0])}</span>`); i += m[0].length; continue; }
    }
    const word = /^[A-Za-z]+/.exec(src.slice(i));
    if (word && ['true', 'false', 'null'].includes(word[0])) {
      const cls = word[0] === 'null' ? 'tk-null' : 'tk-bool';
      out.push(`<span class="${cls}">${word[0]}</span>`);
      i += word[0].length;
      continue;
    }
    if (ch === '\n') { out.push('\n'); i++; continue; }
    if ('{}[],:'.includes(ch)) { out.push(`<span class="tk-punc">${ch}</span>`); i++; continue; }
    out.push(escapeHtml(ch));
    i++;
  }
  return out.join('');
}

/** Pretty-print JSON, or normalise loose "key: value" text into a JSON-ish block. */
function prettySchema(text) {
  const t = (text || '').trim();
  try {
    const parsed = JSON.parse(t);
    return { body: JSON.stringify(parsed, null, 2), strict: true };
  } catch (e) { /* fall through */ }

  const lines = t.split('\n');
  const rebuilt = [];
  let objectish = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { rebuilt.push(''); continue; }
    const m = /^["']?([A-Za-z][\w .&/-]{0,48})["']?\s*[:=]\s*(.+)$/.exec(line);
    if (m) {
      objectish = true;
      let val = m[2].replace(/[,;]$/, '').trim();
      if (!/^(".*"|'.*'|\[.*\]|\{.*\}|-?\d+(\.\d+)?|true|false|null)$/.test(val)) {
        val = JSON.stringify(val);
      }
      rebuilt.push(`  ${JSON.stringify(m[1].trim())}: ${val}`);
    } else {
      rebuilt.push('  ' + JSON.stringify(line));
    }
  }
  if (!objectish) return { body: t, strict: false };
  return { body: '{\n' + rebuilt.filter((l) => l !== '').join(',\n') + '\n}', strict: false };
}

/** Wrap a pretty-printed schema in collapsible top-level sections. */
function renderSchema(body) {
  const lines = body.split('\n');
  const html = lines.map((line, idx) => {
    const indent = line.length - line.trimStart().length;
    const isOpen = /[{[]\s*$/.test(line.trim());
    let inner = highlightJson(line);
    if (isOpen) {
      inner = `<span class="tk-fold" data-fold="${idx}" role="button" tabindex="0" aria-expanded="true" title="Collapse this section">−</span> ` + inner;
    }
    return `<span class="ln" data-i="${idx}" data-indent="${indent}">${inner || '&nbsp;'}</span>`;
  }).join('\n');
  return html;
}

function wireFolding(container) {
  $$('.tk-fold', container).forEach((fold) => {
    const activate = () => {
      const start = parseInt(fold.dataset.fold, 10);
      const open = fold.getAttribute('aria-expanded') === 'true';
      const lines = $$('.ln', container);
      const startIndent = parseInt(lines[start] ? lines[start].dataset.indent : '0', 10);
      let end = lines.length;
      for (let i = start + 1; i < lines.length; i++) {
        if (parseInt(lines[i].dataset.indent, 10) <= startIndent) { end = i; break; }
      }
      for (let i = start + 1; i < end; i++) lines[i].classList.toggle('tk-hidden', open);
      fold.setAttribute('aria-expanded', String(!open));
      fold.textContent = open ? '+' : '−';
      // Hide the ellipsis marker that replaces a collapsed block.
      const marker = $(`.tk-ellipsis[data-for="${start}"]`, container);
      if (marker) marker.classList.toggle('tk-hidden', !open);
    };
    fold.addEventListener('click', activate);
    fold.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
    });
  });
}

/** IWP: "(term:1.4)" becomes a chip whose saturation tracks the weight. */
function renderIwp(text) {
  const lines = text.split('\n');
  return lines.map((line) => {
    if (!line.trim()) return '<span class="ln">&nbsp;</span>';
    const re = /([^(,]+?)\s*\(\s*(-?\d+(?:\.\d+)?)\s*\)/g;
    let html = '', last = 0, m, any = false;
    while ((m = re.exec(line)) !== null) {
      any = true;
      html += escapeHtml(line.slice(last, m.index));
      const w = parseFloat(m[2]);
      const neg = w < 0;
      const sat = clamp(Math.abs(w) / 2, 0.12, 1.6);
      html += `<span class="iwp-chip${neg ? ' neg' : ''}" style="--w:${sat.toFixed(2)}">` +
              `${escapeHtml(m[1].trim())}<b>${w > 0 ? '' : '−'}${Math.abs(w).toFixed(1)}</b></span>`;
      last = m.index + m[0].length;
    }
    html += escapeHtml(line.slice(last));
    if (!any) html = escapeHtml(line);
    return `<span class="iwp-line">${html}</span>`;
  }).join('');
}

/* ── 12.3 Prompt DNA — a deterministic fingerprint of the token mix ───────── */
function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function renderDna(text) {
  const host = $('#acDna');
  if (!host) return;
  host.innerHTML = '';
  const N = 28;
  const seg = Math.max(1, Math.ceil(text.length / N));
  for (let i = 0; i < N; i++) {
    const slice = text.slice(i * seg, (i + 1) * seg);
    const h = hash32(slice || String(i));
    const digits = (slice.match(/\d/g) || []).length;
    const letters = (slice.match(/[A-Za-z]/g) || []).length;
    const punct = (slice.match(/[:,{}[\]()]/g) || []).length;
    const mix = letters ? punct / letters : 0;
    const bar = document.createElement('i');
    const hueShift = (h % 60) - 30;
    bar.style.setProperty('--n', (0.6 + (h % 90) / 60).toFixed(2));
    bar.style.setProperty('--c',
      `color-mix(in srgb, var(--accent) ${clamp(28 + mix * 260 + digits * 12, 18, 100).toFixed(0)}%, var(--accent-2) ${hueShift > 0 ? hueShift * 2 : 0}%)`);
    bar.title = `segment ${i + 1} · ${slice.length} chars`;
    host.appendChild(bar);
  }
}

/* ── 12.4 The decrypt typewriter ─────────────────────────────────────────── */
function typewrite(host, text, caret, done) {
  clearInterval(typewriterTimer);
  const reduced = prefersReducedMotion();
  if (reduced) { host.textContent = text; if (caret) caret.hidden = true; done && done(); return; }

  const GLYPHS = '▚▞░▒█∷⌁⋔⧗⊹≡§¤∆◊⟡⌬⏣';
  let i = 0;
  const LOOKAHEAD = 16;
  if (caret) caret.hidden = false;

  typewriterSkip = () => {
    clearInterval(typewriterTimer);
    typewriterTimer = 0;
    host.textContent = text;
    if (caret) caret.hidden = true;
    typewriterSkip = null;
    done && done();
  };

  typewriterTimer = setInterval(() => {
    i++;
    if (i >= text.length) { typewriterSkip && typewriterSkip(); return; }
    let s = text.slice(0, i);
    const tail = Math.min(LOOKAHEAD, text.length - i);
    for (let k = 0; k < tail; k++) {
      const ch = text[i + k];
      s += (ch === ' ' || ch === '\n') ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0];
    }
    host.textContent = s;
  }, APP_CONFIG.typewriterMs);
}

/* ── 12.5 Put a result on screen ─────────────────────────────────────────── */
function renderResult({ text, provider, model, latency, method }) {
  const card = $('#artifactCard');
  const host = $('#acText');
  const caret = $('#acCaret');
  if (!card || !host) return;

  const clean = stripFences(text);
  state.result.text = clean;
  state.result.provider = provider;
  state.result.latency = latency;
  state.result.method = method;
  state.result.format = detectFormat(clean, method);

  card.hidden = false;
  $('#acBadge').textContent = METHODS[method] ? METHODS[method].code : method;
  $('#acProv').textContent = `forged via ${provider}${model ? ' · ' + model : ''} · ${(latency / 1000).toFixed(1)}s`;
  $('#artifactLede').textContent =
    `${METHODS[method] ? METHODS[method].name : method} · ${state.result.format.toUpperCase()} · ` +
    `${clean.length.toLocaleString()} characters. Copy it, download it, or re-forge it another way.`;
  scrollToEl(card, 'center');

  // Format-aware classes (prose gets the drop cap, schema gets the mono grid).
  host.className = 'ac-text' +
    (state.result.format === 'prose' ? ' is-prose' : '') +
    (state.result.format === 'json' || state.result.format === 'kv' ? ' is-json' : '');

  const finish = () => {
    // Swap the raw decrypt for the rich, format-aware render.
    if (state.result.format === 'json' || state.result.format === 'kv') {
      const pretty = prettySchema(clean);
      host.innerHTML = renderSchema(pretty.body);
      wireFolding(host);
      state.result.text = pretty.strict ? pretty.body : clean;
    } else if (state.result.format === 'iwp') {
      host.innerHTML = renderIwp(clean);
    } else {
      host.innerHTML = escapeHtml(clean);
    }
    renderDna(clean);
    if (caret) caret.hidden = true;
  };

  typewrite(host, clean, caret, finish);
  setPhase('done');

  // Persist to the archive (fire and forget — never block the UI on storage).
  archiveAdd({ text: clean, method, provider, latency }).catch((e) => {
    console.warn('[Alchemist] archive write failed', e);
  });
}

/* ── 12.6 Suffix handling ────────────────────────────────────────────────── */
function composedText() {
  const base = (state.result.text || '').trim();
  if (!base) return '';
  if (!state.suffixEnabled) return base;
  const suffix = ($('#suffixText') ? $('#suffixText').value : state.suffixText).trim();
  return suffix ? `${base}\n\n${suffix}` : base;
}

async function copyWithFeedback(btn, text, label) {
  const ok = await copyText(text);
  if (!btn) return ok;
  const lab = $('.b-label', btn) || btn;
  const original = lab.textContent;
  if (ok) {
    btn.classList.add('copied');
    lab.textContent = 'Copied';
    toast(label || 'Copied to the clipboard.', 'ok');
    setTimeout(() => { btn.classList.remove('copied'); lab.textContent = original; }, 1800);
  } else {
    toast('The clipboard refused. Select the text and copy manually.', 'err');
  }
  return ok;
}

function initArtifactActions() {
  const body = $('#acBody');
  // Tap anywhere in the artifact to skip the decrypt animation.
  if (body) body.addEventListener('click', () => { if (typewriterSkip) typewriterSkip(); });

  $('#copyBtn').addEventListener('click', (e) => copyWithFeedback(e.currentTarget, composedText(), 'Prompt copied.'));

  $('#downloadBtn').addEventListener('click', async () => {
    const text = composedText();
    if (!text) return;
    const name = `prompt-${(state.result.method || 'artifact').toLowerCase()}-${Date.now().toString(36)}.txt`;
    try {
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast(`Saved as ${name}.`, 'ok');
    } catch (e) {
      toast('This browser blocked the download — use Copy instead.', 'err');
    }
  });

  $('#regenBtn').addEventListener('click', () => runTransmutation());

  /* "Other method" — keeps the image, swaps the meta-prompt. */
  const swapBtn = $('#swapMethodBtn'), menu = $('#swapMenu');
  const closeMenu = () => { if (menu) { menu.hidden = true; swapBtn.setAttribute('aria-expanded', 'false'); } };
  swapBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = menu.hidden;
    menu.hidden = !open;
    swapBtn.setAttribute('aria-expanded', String(open));
    if (open) {
      const r = swapBtn.getBoundingClientRect();
      const card = $('#artifactCard').getBoundingClientRect();
      menu.style.left = clamp(r.left - card.left, 0, card.width - 250) + 'px';
      menu.style.top = (r.bottom - card.top + 6) + 'px';
      const first = $('button', menu);
      if (first) first.focus();
    }
  });
  document.addEventListener('click', (e) => {
    if (!menu.hidden && !menu.contains(e.target) && e.target !== swapBtn) closeMenu();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) closeMenu(); });
  $$('[data-swap]', menu).forEach((b) => {
    b.addEventListener('click', () => {
      const code = b.dataset.swap;
      closeMenu();
      selectMethod(code).then(() => runTransmutation({ forcedMethod: code }));
    });
  });

  $('#shareBtn').addEventListener('click', async (e) => {
    const text = composedText();
    if (!text) return;
    const payload = {
      title: 'Prompt Alchemist artifact',
      text: text.slice(0, 1800)
    };
    try {
      if (navigator.share) { await navigator.share(payload); toast('Shared.', 'ok'); return; }
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      // fall through to clipboard
    }
    await copyWithFeedback(e.currentTarget, text, 'Sharing is unavailable here — the prompt was copied instead.');
  });

  /* Coaching panel */
  const suffix = $('#suffixText'), toggle = $('#suffixToggle');
  state.suffixText = localGet('pa_suffix_v1') || DEFAULT_SUFFIX;
  if (suffix) suffix.value = state.suffixText;
  if (toggle) {
    const saved = localGet('pa_suffix_on_v1');
    toggle.checked = saved === null ? true : saved === '1';
    state.suffixEnabled = toggle.checked;
    toggle.addEventListener('change', () => {
      state.suffixEnabled = toggle.checked;
      localSet('pa_suffix_on_v1', toggle.checked ? '1' : '0');
    });
  }
  if (suffix) suffix.addEventListener('input', () => {
    state.suffixText = suffix.value;
    localSet('pa_suffix_v1', suffix.value);
  });
  $('#resetSuffixBtn').addEventListener('click', () => {
    if (suffix) { suffix.value = DEFAULT_SUFFIX; state.suffixText = DEFAULT_SUFFIX; localSet('pa_suffix_v1', DEFAULT_SUFFIX); }
    toast('Suffix reset to the default wording.');
  });
  $('#copySuffixBtn').addEventListener('click', (e) => {
    const prev = state.suffixEnabled;
    state.suffixEnabled = true;
    copyWithFeedback(e.currentTarget, composedText(), 'Prompt + identity-lock suffix copied.');
    state.suffixEnabled = prev;
  });
}


/* ══════════════════════════════════════════════════════════════════════════════
   §13 — ACT VI · THE ARCHIVE
   ══════════════════════════════════════════════════════════════════════════════
   STORAGE DESIGN (and why):
     • localStorage is the primary store. It is multi-megabyte (cookies are
       ~4KB per entry and get attached to every HTTP request), it is never sent
       over the network, and it survives reloads. Single versioned key:
       `pa_archive_v1`.
     • We ALSO write one tiny cookie, `pa_uid`, holding an anonymous id and the
       entry count — enough to satisfy "there is a cookie" without bloating
       request headers or leaking prompt text into them.
     • Everything is wrapped in try/catch: private-browsing modes throw, and the
       app must keep working with an in-memory archive.
   ══════════════════════════════════════════════════════════════════════════════ */
function archiveLoad() {
  let list = [];
  try { list = JSON.parse(localGet(APP_CONFIG.archiveKey) || '[]'); } catch (e) { list = []; }
  if (!Array.isArray(list)) list = [];
  // Defensive: never let a corrupted entry break the rail.
  state.archive = list
    .filter((e) => e && typeof e === 'object' && typeof e.promptText === 'string')
    .slice(0, APP_CONFIG.archiveCap);
  return state.archive;
}

function archivePersist() {
  const json = JSON.stringify(state.archive);
  const ok = localSet(APP_CONFIG.archiveKey, json);
  cookieSet(APP_CONFIG.uidCookie, `${ensureUid()}.${state.archive.length}`, 31536000);
  const stat = $('#statForged');
  if (stat) stat.textContent = String(state.archive.length);
  if (!ok) console.warn('[Alchemist] localStorage refused the archive write — running in memory only.');
  return json.length;
}

/** Shrink the archive until the serialised size fits the guard. */
function enforceSizeGuard() {
  let json = JSON.stringify(state.archive);
  while (json.length > APP_CONFIG.archiveMaxBytes && state.archive.length > 1) {
    state.archive.pop();                       // oldest goes first
    json = JSON.stringify(state.archive);
  }
  return json.length;
}

/** 96px JPEG thumbnail — visually rich, storage-cheap. */
function makeThumbnail(sourceCanvas) {
  if (!sourceCanvas) return '';
  const scale = APP_CONFIG.thumbEdge / Math.max(sourceCanvas.width, sourceCanvas.height);
  const w = Math.max(1, Math.round(sourceCanvas.width * scale));
  const h = Math.max(1, Math.round(sourceCanvas.height * scale));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(sourceCanvas, 0, 0, w, h);
  try { return c.toDataURL('image/jpeg', APP_CONFIG.thumbQuality); }
  catch (e) { return ''; }
}

async function archiveAdd({ text, method, provider, latency }) {
  const entry = {
    id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    timestamp: Date.now(),
    methodology: method,
    providerUsed: provider || null,
    latency: latency || 0,
    promptText: text,
    thumbnailDataURL: makeThumbnail(state.image.bitmap),
    imageDataURL: state.image.dataUrl || null,   // lets "forge again" reuse the image
    imageName: state.image.origName || 'reference image'
  };
  state.archive.unshift(entry);
  while (state.archive.length > APP_CONFIG.archiveCap) state.archive.pop();  // hard cap, FIFO
  enforceSizeGuard();
  archivePersist();
  renderArchive();
  state.result.entryId = entry.id;
  return entry;
}

function archiveRemove(id) {
  const idx = state.archive.findIndex((e) => e.id === id);
  if (idx < 0) return null;
  const [entry] = state.archive.splice(idx, 1);
  archivePersist();
  renderArchive();
  return { entry, idx };
}

function archiveClear() {
  state.archive = [];
  archivePersist();
  renderArchive();
}

function methodColor(code) {
  const light = state.theme === 'light';
  const map = light
    ? { IWP: '#c2601a', NLDP: '#0f8f86', SSP: '#6f4bd8' }
    : { IWP: '#ff9a3c', NLDP: '#22d3c5', SSP: '#b18cff' };
  return map[code] || map.IWP;
}

function renderArchive() {
  const rail = $('#archiveRail'), empty = $('#archiveEmpty'), count = $('#archiveCount');
  if (!rail) return;
  if (count) count.textContent = `${state.archive.length} / ${APP_CONFIG.archiveCap}`;
  const stat = $('#statForged');
  if (stat) stat.textContent = String(state.archive.length);

  rail.innerHTML = '';
  if (!state.archive.length) {
    rail.hidden = true;
    if (empty) empty.hidden = false;
    return;
  }
  if (empty) empty.hidden = true;
  rail.hidden = false;

  state.archive.forEach((entry, i) => {
    const card = document.createElement('article');
    card.className = 'ar-card';
    card.setAttribute('role', 'listitem');
    card.tabIndex = 0;
    card.style.setProperty('--c', methodColor(entry.methodology));
    card.style.animationDelay = Math.min(i * 45, 400) + 'ms';
    card.setAttribute('aria-label',
      `${entry.methodology} prompt, ${relativeTime(entry.timestamp)}. Open to read it.`);

    const thumb = entry.thumbnailDataURL
      ? `<img class="ar-thumb" src="${entry.thumbnailDataURL}" alt="">`
      : `<div class="ar-thumb" aria-hidden="true"></div>`;

    card.innerHTML = `${thumb}
      <div class="ar-body">
        <div class="ar-top">
          <span class="ar-badge">${escapeHtml(entry.methodology)}</span>
          <span class="ar-time" data-ts="${entry.timestamp}">${relativeTime(entry.timestamp)}</span>
        </div>
        <p class="ar-prev">${escapeHtml(entry.promptText.slice(0, 150))}</p>
        <button class="ar-del" type="button" aria-label="Delete this entry">Delete</button>
      </div>`;

    card.addEventListener('click', (e) => {
      if (e.target.closest('.ar-del')) return;
      openViewer(entry);
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openViewer(entry); }
    });
    $('.ar-del', card).addEventListener('click', (e) => {
      e.stopPropagation();
      const removed = archiveRemove(entry.id);
      if (!removed) return;
      toast('Entry deleted.', 'err', 'Undo', () => {
        state.archive.splice(Math.min(removed.idx, state.archive.length), 0, removed.entry);
        while (state.archive.length > APP_CONFIG.archiveCap) state.archive.pop();
        archivePersist();
        renderArchive();
        toast('Restored.', 'ok');
      });
    });

    rail.appendChild(card);
  });
}

/* ── 13.1 Archive viewer ─────────────────────────────────────────────────── */
let viewerEntry = null;

function openViewer(entry) {
  viewerEntry = entry;
  const back = $('#viewerBackdrop');
  $('#viewerTitle').textContent = `${entry.methodology} artifact`;
  $('#viewerMeta').textContent =
    `${relativeTime(entry.timestamp)} · ${entry.providerUsed || 'unknown channel'} · ` +
    `${(entry.latency / 1000).toFixed(1)}s · ${entry.promptText.length.toLocaleString()} chars`;
  const img = $('#viewerThumb');
  if (entry.thumbnailDataURL) { img.src = entry.thumbnailDataURL; img.hidden = false; }
  else img.hidden = true;

  const body = $('#viewerBody');
  const fmt = detectFormat(entry.promptText, entry.methodology);
  if (fmt === 'json' || fmt === 'kv') {
    body.innerHTML = renderSchema(prettySchema(entry.promptText).body);
    wireFolding(body);
  } else if (fmt === 'iwp') {
    body.innerHTML = renderIwp(entry.promptText);
  } else {
    body.textContent = entry.promptText;
  }

  const reuse = $('#viewerReuse');
  reuse.hidden = !entry.imageDataURL;
  reuse.textContent = entry.imageDataURL ? 'Forge again with this image' : 'Image not stored';

  back.hidden = false;
  $('#viewerClose').focus();
}
function closeViewer() {
  const back = $('#viewerBackdrop');
  if (back) back.hidden = true;
  viewerEntry = null;
}

function initArchive() {
  archiveLoad();
  renderArchive();

  $('#clearArchiveBtn').addEventListener('click', async () => {
    if (!state.archive.length) { toast('The archive is already empty.'); return; }
    const yes = await confirmDialog({
      title: 'Clear the archive?',
      body: `This deletes all ${state.archive.length} stored prompt${state.archive.length === 1 ? '' : 's'} from this browser. It cannot be undone.`,
      confirmLabel: 'Delete everything'
    });
    if (!yes) return;
    const snapshot = state.archive.slice();
    archiveClear();
    toast('Archive cleared.', 'err', 'Undo', () => {
      state.archive = snapshot.slice(0, APP_CONFIG.archiveCap);
      archivePersist();
      renderArchive();
      toast('Archive restored.', 'ok');
    }, 9000);
  });

  $('#viewerClose').addEventListener('click', closeViewer);
  $('#viewerBackdrop').addEventListener('pointerdown', (e) => {
    if (e.target === e.currentTarget) closeViewer();
  });
  $('#viewerCopy').addEventListener('click', (e) => {
    if (viewerEntry) copyWithFeedback(e.currentTarget, viewerEntry.promptText, 'Prompt copied.');
  });
  $('#viewerReuse').addEventListener('click', async () => {
    if (!viewerEntry || !viewerEntry.imageDataURL) return;
    closeViewer();
    // Rebuild the stored image and push it back through the normal pipeline.
    try {
      const img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = viewerEntry.imageDataURL; });
      const drawn = await drawToCanvas(img);
      const blob = await new Promise((res) => drawn.canvas.toBlob(res, 'image/jpeg', APP_CONFIG.jpegQuality));
      if (blob) await ingestBlob(blob, viewerEntry.imageName || 'archive image');
      scrollToEl($('#altar'), 'center');
      toast('Image restored to the altar. Pick a methodology and transmute.', 'ok');
    } catch (e) {
      toast('That stored image could not be restored.', 'err');
    }
  });

  // Keep relative timestamps honest.
  setInterval(() => {
    $$('.ar-time[data-ts]').forEach((el) => { el.textContent = relativeTime(parseInt(el.dataset.ts, 10)); });
  }, 30000);
}


/* ══════════════════════════════════════════════════════════════════════════════
   §14 — FOOTER, DEBUG DRAWER, SHORTCUTS, BOOT
   ══════════════════════════════════════════════════════════════════════════════ */
function initFooter() {
  const y = $('#footYear');
  if (y) y.textContent = `© ${new Date().getFullYear()} Prompt Alchemist`;
  const link = $('#repoLink');
  if (link && APP_CONFIG.repoUrl) link.href = APP_CONFIG.repoUrl;
}

/* ── 14.1 Debug drawer (Ctrl+Shift+D) ────────────────────────────────────── */
function renderDebugLog() {
  const body = $('#ddBody');
  if (!body || !state.debugOpen) return;
  const frag = document.createDocumentFragment();
  Relay.logBuffer.slice(-160).forEach((l) => {
    const row = document.createElement('div');
    row.className = 'dd-line ' + (l.kind || 'info');
    row.innerHTML = `<span class="t">${escapeHtml(l.t)}</span><span>${escapeHtml(l.msg)}</span>`;
    frag.appendChild(row);
  });
  body.innerHTML = '';
  body.appendChild(frag);
  body.scrollTop = body.scrollHeight;
}
function toggleDebug(force) {
  const d = $('#debugDrawer');
  if (!d) return;
  state.debugOpen = force == null ? !state.debugOpen : !!force;
  d.hidden = !state.debugOpen;
  if (state.debugOpen) { renderDebugLog(); updateHealthChip(); }
}
function initDebugDrawer() {
  $('#ddClose').addEventListener('click', () => toggleDebug(false));
  $('#ddClear').addEventListener('click', () => {
    Relay.logBuffer.length = 0;
    renderDebugLog();
  });
  $('#ddForce').addEventListener('change', (e) => {
    state.forceProvider = e.target.value;
    Relay.logLine(`provider forced to: ${e.target.value}`, 'info');
  });
}

/* ── 14.2 Global keyboard shortcuts ─────────────────────────────────────── */
function initShortcuts() {
  document.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();

    // Ctrl/Cmd+Shift+D → relay log
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && k === 'd') {
      e.preventDefault();
      toggleDebug();
      return;
    }
    // Esc closes whatever is on top
    if (e.key === 'Escape') {
      if (!$('#viewerBackdrop').hidden) { closeViewer(); return; }
      if (!$('#keysBackdrop').hidden) { $('#keysBackdrop').hidden = true; return; }
      if (!$('#transmuteOverlay').hidden && transmuteAbort) { $('#cancelBtn').click(); return; }
    }
    // Ignore shortcuts while typing
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || e.target.isContentEditable) return;

    if (k === 'c' && state.result.text && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      copyText(composedText()).then((ok) => toast(ok ? 'Prompt copied.' : 'Copy failed.', ok ? 'ok' : 'err'));
    }
    if (k === 't' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      runTransmutation();
    }
  });
}

/* ── 14.3 Never let a rejection escape ──────────────────────────────────── */
function initErrorGuards() {
  window.addEventListener('error', (e) => {
    console.warn('[Alchemist] caught error:', e.message);
  });
  window.addEventListener('unhandledrejection', (e) => {
    e.preventDefault();
    console.warn('[Alchemist] caught rejection:', e.reason);
  });
}

/* ── 14.4 Boot ──────────────────────────────────────────────────────────── */
function boot() {
  state.bootAt = performance.now();
  state.reduced = prefersReducedMotion();

  /* Each subsystem is isolated: if one throws (an unusual browser, a blocked
     API, an extension mutating the DOM) the rest of the site still works. */
  const safe = (name, fn) => {
    try { fn(); }
    catch (err) { console.warn(`[Alchemist] ${name} failed to start:`, err && err.message ? err.message : err); }
  };

  initErrorGuards();
  safe('hero title', initHeroTitle);
  safe('theme', initTheme);
  safe('cursor', initCursor);
  safe('background', () => Bg.init());
  safe('scroll chrome', initScrollChrome);
  safe('curtain', initCurtain);
  safe('reveal', initReveal);
  safe('magnetic buttons', initMagnetic);
  safe('ripples', initRipples);
  safe('methodology cards', initMethodCards);
  safe('upload altar', initAltar);
  safe('key panel', initKeysPanel);
  safe('transmute', initTransmute);
  safe('artifact actions', initArtifactActions);
  safe('archive', initArchive);
  safe('footer', initFooter);
  safe('debug drawer', initDebugDrawer);
  safe('shortcuts', initShortcuts);
  safe('health chip', updateHealthChip);
  setPhase(state.method ? 'ready' : 'idle');

  // Warn (once, gently) if the repo is shipping with no usable keys.
  if (Relay.totalChannels() === 0) {
    setTimeout(() => toast('No API keys configured yet — press “Key” in the header to add your own.', 'err',
      'Add a key', () => $('#keysBtn').click(), 9000), 1400);
  }

  console.log(
    '%c⚗ Prompt Alchemist ready%c\n' +
    '  Ctrl+Shift+D → relay log\n' +
    '  C → copy artifact · T → transmute\n' +
    `  ${Relay.healthyChannels()}/${Relay.totalChannels()} channels live`,
    'color:#ff9a3c;font-weight:700', 'color:#888'
  );
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
}


/* ══════════════════════════════════════════════════════════════════════════════
   §15 — TEST SURFACE
   Exposed so the relay logic can be exercised headlessly (see tests/relay.test.mjs).
   Harmless in the browser; nothing here runs unless you call it.
   ══════════════════════════════════════════════════════════════════════════════ */
const Alchemist = {
  state, API_CONFIG, APP_CONFIG, METHODS, EMBEDDED_PROMPTS, Relay,
  stripFences, maskKey, scrollToEl, classifyStatus: Relay._internal.classify,
  detectFormat, prettySchema, highlightJson, renderIwp, formatBytes, relativeTime,
  hasUsableKey: Relay.hasUsableKey, keyTable: Relay.keyTable,
  runTransmutation, renderResult, archiveAdd, archiveLoad
};
if (typeof globalThis !== 'undefined') globalThis.Alchemist = Alchemist;
