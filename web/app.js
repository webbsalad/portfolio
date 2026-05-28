/* ============================================================
   ascii-port — frontend
   ============================================================ */
"use strict";

const $ = (id) => document.getElementById(id);
const out = $("output");
const panel = $("panel");
const viewport = $("viewport");
const typed = $("typed");
const caret = $("caret");

// command line is driven by a JS buffer (not a focused input) so typing always
// works regardless of focus state.
let buffer = "";
function setBuffer(v) { buffer = v; typed.textContent = v; }
const cwdEl = $("cwd");
const crumbEl = $("breadcrumb");
const modal = $("modal");
const modalName = $("modal-name");
const modalBody = $("modal-body");
const modalActions = $("modal-actions");

const SECTIONS = {
  about: "about", обо: "about", me: "about", "о-себе": "about",
  "3-course": "3-course", works: "3-course", work: "3-course",
  university: "3-course", уни: "3-course", вуз: "3-course", учеба: "3-course",
  projects: "projects", проекты: "projects", proj: "projects",
};
const SECTION_LABEL = {
  about: "обо мне", "3-course": "вузовские работы", projects: "проекты",
};

/* ---------- block-letter banner ---------- */
const GLYPHS = {
  A: [" ███ ", "█   █", "█████", "█   █", "█   █"],
  M: ["█   █", "██ ██", "█ █ █", "█   █", "█   █"],
  N: ["█   █", "██  █", "█ █ █", "█  ██", "█   █"],
  O: [" ███ ", "█   █", "█   █", "█   █", " ███ "],
  R: ["████ ", "█   █", "████ ", "█  █ ", "█   █"],
  S: [" ████", "█    ", " ███ ", "    █", "████ "],
  U: ["█   █", "█   █", "█   █", "█   █", " ███ "],
  V: ["█   █", "█   █", "█   █", " █ █ ", "  █  "],
  " ": ["     ", "     ", "     ", "     ", "     "],
};
function banner(text) {
  const rows = ["", "", "", "", ""];
  for (const ch of text.toUpperCase()) {
    const g = GLYPHS[ch] || GLYPHS[" "];
    for (let r = 0; r < 5; r++) rows[r] += g[r] + " ";
  }
  return rows.join("\n");
}

/* ---------- output helpers ---------- */
function printLine(html, cls) {
  const div = document.createElement("div");
  div.className = "line" + (cls ? " " + cls : "");
  div.innerHTML = html;
  out.appendChild(div);
  scrollBottom();
  return div;
}
function printNode(node) { out.appendChild(node); scrollBottom(); }
function scrollBottom() { viewport.scrollTop = viewport.scrollHeight; }
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
// clickable command chip: clicking runs `command` as if typed
function cmdLink(label, command) {
  return `<span class="cmd-link" data-cmd="${esc(command || label)}">${esc(label)}</span>`;
}

/* ---------- API ---------- */
async function api(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error((await r.text()) || r.statusText);
  return r.json();
}

/* ---------- ascii rendering ---------- */
function asciiPre(data, mono, cls) {
  const pre = document.createElement("pre");
  pre.className = "ascii-art" + (mono ? " mono" : "") + (cls ? " " + cls : "");
  if (mono || !data.color) {
    pre.textContent = data.lines.map((l) => (typeof l === "string" ? l : l.map((r) => r.t).join(""))).join("\n");
    return pre;
  }
  data.lines.forEach((runs, i) => {
    if (i) pre.appendChild(document.createTextNode("\n"));
    if (typeof runs === "string") { pre.appendChild(document.createTextNode(runs)); return; }
    for (const run of runs) {
      const span = document.createElement("span");
      span.textContent = run.t;
      if (run.c) span.style.color = run.c;
      pre.appendChild(span);
    }
  });
  return pre;
}

/* ============================================================
   STATE
   ============================================================ */
const state = { panelOpen: false, section: null, path: [], entries: [], sel: 0 };
const history = [];
let histIdx = -1;
let modalOriginal = null;
let modalReopen = null; // for mono toggle

/* ============================================================
   MIDNIGHT-COMMANDER PANEL
   ============================================================ */
function relPath() { return state.path.join("/"); }

function showPanel() { state.panelOpen = true; panel.hidden = false; out.hidden = true; }
function closePanel() {
  state.panelOpen = false; panel.hidden = true; out.hidden = false;
  state.section = null; state.path = []; state.entries = [];
  cwdEl.textContent = "~"; crumbEl.textContent = "";
  scrollBottom();
}

async function openPanel(section, segs = []) {
  state.section = section; state.path = segs.slice();
  showPanel();
  await loadDir();
}

async function loadDir(selectName) {
  try {
    const data = await api(`/api/tree?section=${encodeURIComponent(state.section)}&path=${encodeURIComponent(relPath())}`);
    const list = data.entries || [];
    state.entries = [];
    if (state.section) state.entries.push({ name: "..", dir: true, up: true });
    for (const e of list) state.entries.push(e);
    let idx = -1;
    if (selectName) idx = state.entries.findIndex((e) => !e.up && e.name === selectName);
    state.sel = idx >= 0 ? idx : (state.entries.length > 1 ? 1 : 0);
    renderPanel();
  } catch (err) {
    closePanel();
    printLine(`<span class="dim">ls:</span> ${esc(err.message)}`, "err");
  }
}

const TAG = { dir: "DIR", text: "TXT", image: "IMG", pdf: "PDF", binary: "BIN" };
function fmtSize(n) {
  if (!n) return "";
  if (n < 1024) return n + " B";
  if (n < 1048576) return (n / 1024).toFixed(1) + " K";
  return (n / 1048576).toFixed(1) + " M";
}

function renderPanel() {
  const crumb = "/" + [SECTION_LABEL[state.section] ? state.section : state.section, ...state.path].join("/");
  cwdEl.textContent = "/" + state.section + (state.path.length ? "/" + relPath() : "");
  crumbEl.textContent = cwdEl.textContent;

  panel.innerHTML = "";
  const head = document.createElement("div");
  head.className = "panel-head";
  head.innerHTML = `<span class="crumb">${esc(crumb)}</span><span>${SECTION_LABEL[state.section] || ""}</span>`;
  panel.appendChild(head);

  const listEl = document.createElement("div");
  listEl.className = "panel-list";
  state.entries.forEach((e, i) => {
    const row = document.createElement("div");
    row.className = "row" + (e.dir ? " dir" : "") + (i === state.sel ? " sel" : "");
    row.dataset.index = i;
    const tag = e.up ? "↩" : (e.dir ? "DIR" : (TAG[e.kind] || "BIN"));
    const arrow = e.dir ? "▸ " : "  ";
    row.innerHTML =
      `<span class="tag">${tag}</span>` +
      `<span class="nm">${arrow}${esc(e.name)}</span>` +
      `<span class="meta">${e.dir ? "" : fmtSize(e.size)}</span>`;
    listEl.appendChild(row);
  });
  panel.appendChild(listEl);

  const foot = document.createElement("div");
  foot.className = "panel-foot";
  const cur = state.entries[state.sel];
  const what = cur ? (cur.up ? "вверх" : (cur.dir ? "папка" : (TAG[cur.kind] || "файл"))) : "";
  foot.innerHTML =
    `<span>${state.entries.length - (state.section ? 1 : 0)} элем.</span>` +
    `<span>${cur ? esc(cur.name) + " · " + what : ""}</span>` +
    `<span>→ открыть · ← назад · Esc выход</span>`;
  panel.appendChild(foot);

  const sel = listEl.children[state.sel];
  if (sel) sel.scrollIntoView({ block: "nearest" });
}

function moveSel(d) {
  if (!state.entries.length) return;
  state.sel = Math.max(0, Math.min(state.entries.length - 1, state.sel + d));
  renderPanel();
}
function setSel(i) { state.sel = Math.max(0, Math.min(state.entries.length - 1, i)); renderPanel(); }

function panelUp() {
  if (state.path.length) { const left = state.path.pop(); loadDir(left); } // re-select the folder we came from
  else closePanel();
}

function openSelected() {
  const e = state.entries[state.sel];
  if (!e) return;
  if (e.up) { panelUp(); return; }
  if (e.dir) { state.path.push(e.name); loadDir(); return; }
  const p = state.path.concat(e.name).join("/");
  openFile(state.section, p, e);
}

/* ============================================================
   VIEWERS
   ============================================================ */
function openModal(name) {
  modalName.textContent = name;
  modalBody.innerHTML = "";
  modalActions.innerHTML = "";
  modalOriginal = null;
  modalReopen = null;
  modal.hidden = false;
}
function closeModal() { modal.hidden = true; modalBody.innerHTML = ""; modalReopen = null; }

function actionBtn(label, fn) {
  const b = document.createElement("button");
  b.className = "btn";
  b.textContent = label;
  b.addEventListener("click", fn);
  modalActions.appendChild(b);
  return b;
}

async function openFile(section, path, entry) {
  const kind = entry.kind;
  if (kind === "text") return openText(section, path, entry.name);
  if (kind === "image") return openImage(section, path, entry.name);
  if (kind === "pdf") return openPdf(section, path, entry.name);
  return openBinary(section, path, entry.name);
}

async function openText(section, path, name) {
  try {
    const data = await api(`/api/file?section=${encodeURIComponent(section)}&path=${encodeURIComponent(path)}`);
    openModal(name);
    const div = document.createElement("div");
    div.className = "text";
    div.textContent = data.content || "(пусто)";
    modalBody.appendChild(div);
    if (data.truncated) {
      const t = document.createElement("div");
      t.className = "dim";
      t.textContent = "— файл обрезан для просмотра —";
      modalBody.appendChild(t);
    }
    const url = `/api/original?section=${encodeURIComponent(section)}&path=${encodeURIComponent(path)}`;
    modalOriginal = url;
    actionBtn("[ открыть оригинал ]  o", () => window.open(url, "_blank"));
    actionBtn("[ скачать ]", () => window.open(url + "&download=1", "_blank"));
  } catch (err) { openModal(name); modalBody.innerHTML = `<div class="text">ошибка: ${esc(err.message)}</div>`; }
}

async function openImage(section, path, name) {
  const locked = section === "about"; // фото «обо мне» — всегда ASCII-фильтр
  const url = `/api/original?section=${encodeURIComponent(section)}&path=${encodeURIComponent(path)}`;
  let mono = false;
  const toggle = async () => { mono = !mono; await render(); };
  async function render() {
    const w = window.innerWidth < 700 ? 80 : 150;
    const data = await api(`/api/ascii?section=${encodeURIComponent(section)}&path=${encodeURIComponent(path)}&width=${w}${mono ? "&mono=1" : ""}`);
    openModal(name + "  (ascii)");
    modalBody.appendChild(asciiPre(data, mono));
    actionBtn(mono ? "[ цвет ]  m" : "[ моно ]  m", toggle);
    if (!locked) {
      modalOriginal = url;
      actionBtn("[ открыть оригинал ]  o", () => window.open(url, "_blank"));
      actionBtn("[ скачать ]", () => window.open(url + "&download=1", "_blank"));
    } else {
      const s = document.createElement("span");
      s.className = "dim";
      s.textContent = "оригинал скрыт — только ascii";
      modalActions.appendChild(s);
    }
    modalReopen = toggle;
  }
  try { await render(); }
  catch (err) { openModal(name); modalBody.innerHTML = `<div class="text">ошибка: ${esc(err.message)}</div>`; }
}

function openPdf(section, path, name) {
  const url = `/api/original?section=${encodeURIComponent(section)}&path=${encodeURIComponent(path)}`;
  openModal(name);
  const f = document.createElement("iframe");
  f.src = url;
  f.style.width = "min(90vw, 900px)";
  f.style.height = "75vh";
  f.style.border = "0";
  f.style.background = "#fff";
  modalBody.appendChild(f);
  modalOriginal = url;
  actionBtn("[ открыть оригинал ]  o", () => window.open(url, "_blank"));
  actionBtn("[ скачать ]", () => window.open(url + "&download=1", "_blank"));
}

function openBinary(section, path, name) {
  const url = `/api/original?section=${encodeURIComponent(section)}&path=${encodeURIComponent(path)}`;
  openModal(name);
  modalBody.innerHTML = `<div class="text dim">предпросмотр этого типа файла недоступен.</div>`;
  modalOriginal = url;
  actionBtn("[ открыть оригинал ]  o", () => window.open(url, "_blank"));
  actionBtn("[ скачать ]", () => window.open(url + "&download=1", "_blank"));
}

/* ============================================================
   ABOUT COMPOSITE
   ============================================================ */
// compact about used on the landing page (portrait + first txt as bio)
async function showAbout() {
  const wrap = document.createElement("div");
  wrap.className = "about";
  const port = document.createElement("div");
  port.className = "portrait";
  port.textContent = "загрузка портрета…";
  const bio = document.createElement("div");
  bio.className = "bio";
  bio.textContent = "загрузка…";
  wrap.appendChild(port);
  wrap.appendChild(bio);
  printNode(wrap);

  try {
    const a = await api(`/api/ascii?section=about&path=me.jpg&width=58`);
    port.innerHTML = "";
    port.appendChild(asciiPre(a, false));
  } catch { port.textContent = "[нет фото]"; }

  try {
    let txtName = "about.txt";
    try {
      const tree = await api(`/api/tree?section=about&path=`);
      const txts = tree.entries.filter((e) => !e.dir && e.kind === "text");
      txts.sort((a, b) => (fileOrder(a.name) - fileOrder(b.name)) || a.name.localeCompare(b.name, "ru"));
      if (txts[0]) txtName = txts[0].name;
    } catch {}
    const f = await api(`/api/file?section=about&path=${encodeURIComponent(txtName)}`);
    const lines = (f.content || "").split("\n");
    bio.innerHTML = "";
    const name = lines.find((l) => l.trim()) || "обо мне";
    const h = document.createElement("h2");
    h.textContent = name.trim();
    bio.appendChild(h);
    const rest = document.createElement("div");
    rest.className = "text";
    rest.textContent = lines.slice(lines.indexOf(name) + 1).join("\n").trim();
    bio.appendChild(rest);
    const hint = document.createElement("div");
    hint.className = "faint";
    hint.style.marginTop = "8px";
    hint.innerHTML = `${cmdLink("about")} — полная страница · ${cmdLink("open 3-course")} · ${cmdLink("open projects")} · ${cmdLink("help")}`;
    bio.appendChild(hint);
  } catch { bio.textContent = "[нет данных]"; }
}

// order: leading number in filename, then name
function fileOrder(name) { const m = name.match(/^\s*(\d+)/); return m ? parseInt(m[1], 10) : 1e9; }
function cleanTitle(name) {
  let t = name.replace(/\.[^.]+$/, "");        // drop extension
  t = t.replace(/^\s*\d+\s*[._)\-]*\s*/, "");   // drop leading number + separator
  t = t.replace(/[_\-]+/g, " ").trim();
  return (t || name).toUpperCase();
}

// full about page: every .txt in about/ as a numbered block, ordered by number
async function showAboutFull() {
  out.innerHTML = "";
  printLine(banner("ROMAN"), "banner");
  printLine(`<span class="dim">обо мне // полная информация</span>`);
  printLine("");

  const wrap = document.createElement("div");
  wrap.className = "about";
  const port = document.createElement("div");
  port.className = "portrait";
  port.textContent = "…";
  wrap.appendChild(port);
  printNode(wrap);
  try {
    const a = await api(`/api/ascii?section=about&path=me.jpg&width=64`);
    port.innerHTML = ""; port.appendChild(asciiPre(a, false));
  } catch { port.textContent = "[нет фото]"; }

  let txts = [];
  try {
    const tree = await api(`/api/tree?section=about&path=`);
    txts = tree.entries.filter((e) => !e.dir && e.kind === "text");
  } catch {}
  txts.sort((a, b) => (fileOrder(a.name) - fileOrder(b.name)) || a.name.localeCompare(b.name, "ru"));

  let i = 1;
  for (const f of txts) {
    const block = document.createElement("div");
    block.className = "ab-block";
    const num = String(i).padStart(2, "0");
    block.innerHTML =
      `<div class="ab-head"><span class="ab-num">[${num}]</span> ${esc(cleanTitle(f.name))}` +
      `<span class="ab-file">${esc(f.name)}</span></div>`;
    const body = document.createElement("div");
    body.className = "ab-body text";
    body.textContent = "…";
    block.appendChild(body);
    printNode(block);
    try {
      const data = await api(`/api/file?section=about&path=${encodeURIComponent(f.name)}`);
      body.textContent = (data.content || "").trim() || "(пусто)";
    } catch (err) { body.textContent = "ошибка: " + err.message; }
    i++;
  }
  if (!txts.length) printLine(`<span class="dim">в разделе about нет .txt файлов</span>`);
  printLine("");
  printLine(`<span class="faint">новые .txt в dock/about (порядок — по числовому префиксу: <b>1.about.txt</b>, <b>2.contacts.txt</b>) · ${cmdLink("home")} — на главную · ${cmdLink("open 3-course")} · ${cmdLink("open projects")}</span>`);
}

/* ============================================================
   COMMANDS
   ============================================================ */
function resolveSection(arg) { return arg ? SECTIONS[arg.toLowerCase()] : null; }

const HELP = [
  ["help", "показать это сообщение"],
  ["about", "полная страница обо мне (все .txt блоками)"],
  ["home", "вернуться на главную"],
  ["open <раздел>", "открыть раздел: about · 3-course · projects"],
  ["ls [раздел]", "список файлов"],
  ["cd <раздел|..>", "перейти / на уровень вверх"],
  ["cat <файл>", "показать текстовый файл"],
  ["theme [light|dark]", "переключить тему (или клавиша t)"],
  ["clear", "очистить экран"],
  ["sync", "статус синхронизации с github"],
];

function cmdHelp() {
  const g = document.createElement("div");
  g.className = "help-grid";
  for (const [c, d] of HELP) {
    const a = document.createElement("div"); a.className = "c"; a.textContent = c;
    if (/^[a-zа-яё?]+$/i.test(c)) { a.classList.add("cmd-link"); a.dataset.cmd = c; } // bare command, runnable as-is
    const b = document.createElement("div"); b.className = "dim"; b.textContent = d;
    g.appendChild(a); g.appendChild(b);
  }
  printNode(g);
  printLine(`<span class="faint">в файловом менеджере: ↑↓ выбор · →/⏎ открыть · ←/⌫ назад · Esc выход · m моно/цвет</span>`);
}

async function cmdLs(arg) {
  // capture current panel location before ensureTerminal clears it
  const inPanel = state.panelOpen;
  const curSection = state.section, curPath = relPath();
  const sec = resolveSection(arg);
  ensureTerminal();
  if (sec) {
    const data = await api(`/api/tree?section=${encodeURIComponent(sec)}&path=`);
    printLine(`<span class="dim">${sec}/</span>`, "");
    for (const e of data.entries) printLine(`${e.dir ? "▸ " : "  "}${esc(e.name)}`, e.dir ? "bright" : "");
    return;
  }
  if (inPanel) {
    const data = await api(`/api/tree?section=${encodeURIComponent(curSection)}&path=${encodeURIComponent(curPath)}`);
    printLine(`<span class="dim">/${esc(curSection)}${curPath ? "/" + esc(curPath) : ""}</span>`, "");
    for (const e of data.entries) printLine(`${e.dir ? "▸ " : "  "}${esc(e.name)}`, e.dir ? "bright" : "");
    return;
  }
  printLine("разделы:", "dim");
  for (const k of ["about", "3-course", "projects"])
    printLine(`▸ <b>${k}</b> <span class="dim">— ${SECTION_LABEL[k]}</span>`, "");
}

function ensureTerminal() { if (state.panelOpen) closePanel(); }

function runCommand(raw) {
  const line = raw.trim();
  printLine(`<span class="dim">roman@portfolio:${esc(cwdEl.textContent)}$</span> ${esc(line)}`, "cmd-echo");
  if (!line) return;
  const parts = line.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const arg = parts.slice(1).join(" ");

  switch (cmd) {
    case "help": case "?": case "помощь": ensureTerminal(); cmdHelp(); break;
    case "about": case "whoami": ensureTerminal(); showAboutFull(); break;
    case "home": case "главная": ensureTerminal(); landing(); break;
    case "ls": case "dir": cmdLs(arg).catch((e) => { ensureTerminal(); printLine(esc(e.message), "err"); }); break;
    case "open": case "o": {
      const sec = resolveSection(arg);
      if (sec) { openPanel(sec); break; }
      if (state.panelOpen && arg) {
        const e = state.entries.find((x) => x.name.toLowerCase() === arg.toLowerCase());
        if (e) { state.sel = state.entries.indexOf(e); openSelected(); }
        else printLine(`open: «${esc(arg)}» не найдено`, "err");
      } else printLine("open: укажите раздел (about · 3-course · projects) или файл", "err");
      break;
    }
    case "cd": {
      if (arg === ".." ) { if (state.panelOpen) panelUp(); break; }
      const sec = resolveSection(arg);
      if (sec) openPanel(sec);
      else if (arg === "~" || arg === "/") closePanel();
      else if (state.panelOpen) {
        const e = state.entries.find((x) => x.dir && !x.up && x.name.toLowerCase() === arg.toLowerCase());
        if (e) { state.path.push(e.name); loadDir(); }
        else printLine(`cd: нет папки «${esc(arg)}»`, "err");
      } else printLine("cd: неизвестный раздел", "err");
      break;
    }
    case "cat": case "less": {
      if (state.panelOpen && arg) {
        const e = state.entries.find((x) => !x.dir && x.name.toLowerCase() === arg.toLowerCase());
        if (e) openFile(state.section, state.path.concat(e.name).join("/"), e);
        else printLine(`cat: нет файла «${esc(arg)}»`, "err");
      } else printLine("cat: откройте раздел и укажите файл", "err");
      break;
    }
    case "theme": setTheme(arg === "light" || arg === "dark" ? arg : null); break;
    case "clear": case "cls": ensureTerminal(); out.innerHTML = ""; break;
    case "sync":
      ensureTerminal();
      printLine(`раздел <b>3-course</b> синхронизируется с github.com/webbsalad/3-course каждые 5 минут.`, "dim");
      break;
    case "exit": case "q": if (state.panelOpen) closePanel(); break;
    default:
      ensureTerminal();
      printLine(`${esc(cmd)}: команда не найдена. наберите <b>help</b>.`, "err");
  }
}

function submitCommand() {
  const v = buffer;
  if (v.trim()) { history.push(v); if (history.length > 100) history.shift(); }
  histIdx = history.length;
  setBuffer("");
  runCommand(v);
}

/* ============================================================
   THEME + CLOCK
   ============================================================ */
function setTheme(t) {
  const cur = document.documentElement.getAttribute("data-theme");
  const next = t || (cur === "dark" ? "light" : "dark");
  document.documentElement.setAttribute("data-theme", next);
  try { localStorage.setItem("ap-theme", next); } catch {}
  refreshFxColor();
}
function initTheme() {
  let t = "dark";
  try { t = localStorage.getItem("ap-theme") || "dark"; } catch {}
  document.documentElement.setAttribute("data-theme", t);
}
function tickClock() {
  const d = new Date();
  $("clock").textContent = d.toTimeString().slice(0, 8);
}

/* ============================================================
   CUSTOM CURSOR + ASCII FX TRAIL
   ============================================================ */
const cursorEl = $("cursor");
const fx = $("fx");
const ctx = fx.getContext("2d");
let CELL = 14;
let fgRGB = "232,232,230";
const DENS = [".", ":", "*", "#", "@"];
let trail = [];
const LIFE = 430;
const RADIUS = 80;

function resizeFx() {
  const dpr = window.devicePixelRatio || 1;
  fx.width = Math.floor(window.innerWidth * dpr);
  fx.height = Math.floor(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  CELL = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--cell")) || 14;
  ctx.font = `${CELL - 1}px ${"JetBrains Mono, monospace"}`;
  ctx.textBaseline = "top";
}
function refreshFxColor() {
  const hex = getComputedStyle(document.documentElement).getPropertyValue("--fg").trim();
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (m) fgRGB = `${parseInt(m[1], 16)},${parseInt(m[2], 16)},${parseInt(m[3], 16)}`;
}

let lastX = -1, lastY = -1;
function onMove(x, y) {
  lastX = x; lastY = y;
  cursorEl.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
  cursorEl.classList.remove("hidden");
  trail.push({ x, y, t: performance.now() });
  if (trail.length > 40) trail.shift();
}

function drawFx() {
  ctx.clearRect(0, 0, fx.width, fx.height);
  const now = performance.now();
  trail = trail.filter((p) => now - p.t < LIFE);
  for (const p of trail) {
    const recency = 1 - (now - p.t) / LIFE;
    const reff = RADIUS * (0.45 + 0.55 * recency);
    const cells = Math.ceil(reff / CELL);
    const gcx = Math.round(p.x / CELL);
    const gcy = Math.round(p.y / CELL);
    for (let gy = gcy - cells; gy <= gcy + cells; gy++) {
      for (let gx = gcx - cells; gx <= gcx + cells; gx++) {
        const px = gx * CELL, py = gy * CELL;
        const dx = px - p.x, dy = py - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist > reff) continue;
        const inten = recency * (1 - dist / reff);
        if (inten < 0.1) continue;
        const ch = DENS[Math.min(DENS.length - 1, Math.floor(inten * DENS.length))];
        ctx.fillStyle = `rgba(${fgRGB},${Math.min(0.8, inten).toFixed(3)})`;
        ctx.fillText(ch, px, py);
      }
    }
  }
  requestAnimationFrame(drawFx);
}

/* ============================================================
   GLOBAL KEY HANDLING
   ============================================================ */
function onKey(e) {
  // modal first
  if (!modal.hidden) {
    const k = e.key.toLowerCase();
    if (e.key === "Escape") { closeModal(); e.preventDefault(); }
    else if ((k === "o" || k === "щ") && modalOriginal) { window.open(modalOriginal, "_blank"); e.preventDefault(); }
    else if ((k === "m" || k === "ь") && modalReopen) { modalReopen(); e.preventDefault(); }
    return;
  }

  const empty = buffer.length === 0;

  // panel navigation
  if (state.panelOpen) {
    switch (e.key) {
      case "ArrowUp": moveSel(-1); e.preventDefault(); return;
      case "ArrowDown": moveSel(1); e.preventDefault(); return;
      case "PageUp": moveSel(-12); e.preventDefault(); return;
      case "PageDown": moveSel(12); e.preventDefault(); return;
      case "Home": setSel(0); e.preventDefault(); return;
      case "End": setSel(state.entries.length - 1); e.preventDefault(); return;
      case "ArrowRight": if (empty) { openSelected(); e.preventDefault(); } return;
      case "ArrowLeft": if (empty) { panelUp(); e.preventDefault(); } return;
      case "Escape": closePanel(); e.preventDefault(); return;
    }
  } else {
    if (e.key === "ArrowUp" && history.length) {
      histIdx = Math.max(0, histIdx - 1); setBuffer(history[histIdx] || ""); e.preventDefault(); return;
    }
    if (e.key === "ArrowDown" && history.length) {
      histIdx = Math.min(history.length, histIdx + 1); setBuffer(history[histIdx] || ""); e.preventDefault(); return;
    }
  }

  // shared command-line editing (works in both modes)
  if (e.key === "Enter") {
    if (state.panelOpen && empty) openSelected();
    else submitCommand();
    e.preventDefault(); return;
  }
  if (e.key === "Backspace") {
    if (!empty) setBuffer(buffer.slice(0, -1));
    else if (state.panelOpen) panelUp();
    e.preventDefault(); return;
  }
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    setBuffer(buffer + e.key); e.preventDefault(); return;
  }
}

/* ============================================================
   INIT
   ============================================================ */
async function landing() {
  out.innerHTML = "";
  printLine(banner("ROMAN"), "banner");
  printLine(banner("SUVOROV"), "banner");
  printLine(`<span class="dim">go developer · РГПУ им. Герцена · ascii-portfolio v1.0</span>`);
  printLine(`<span class="faint">наберите ${cmdLink("help")} или нажмите: ${cmdLink("about")} · ${cmdLink("open 3-course")} · ${cmdLink("open projects")}</span>`);
  printLine("");
  await showAbout();
}
const boot = landing;

function init() {
  initTheme();
  resizeFx();
  refreshFxColor();
  requestAnimationFrame(drawFx);

  tickClock();
  setInterval(tickClock, 1000);

  document.addEventListener("keydown", onKey, true);
  $("theme-btn").addEventListener("click", () => setTheme(null));
  $("modal-close").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  // panel mouse support — single click opens (folders descend, files open)
  panel.addEventListener("click", (e) => {
    const row = e.target.closest(".row");
    if (!row) return;
    state.sel = +row.dataset.index;
    renderPanel();
    openSelected();
  });

  // clickable command chips in terminal output (about / open ... / help / home)
  out.addEventListener("click", (e) => {
    const el = e.target.closest("[data-cmd]");
    if (el) runCommand(el.dataset.cmd);
  });

  // cursor / fx
  window.addEventListener("mousemove", (e) => onMove(e.clientX, e.clientY));
  window.addEventListener("mouseout", (e) => { if (!e.relatedTarget) cursorEl.classList.add("hidden"); });
  window.addEventListener("mouseover", (e) => {
    cursorEl.classList.toggle("link", !!e.target.closest("button, .btn, .row, a, #theme-btn, .cmd-link"));
  });
  window.addEventListener("resize", resizeFx);

  boot();
}

document.addEventListener("DOMContentLoaded", init);
