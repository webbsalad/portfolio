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
  renderCritter();
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
const RADIUS = 48;
let trailFont = "13px JetBrains Mono, monospace";

// ---- starry-sky background + shooting stars (drawn behind the text) ----
let stars = [];
let shooting = [];
let nextShoot = 0;
let starFont = "11px JetBrains Mono, monospace";
let starFontBig = "16px JetBrains Mono, monospace";
const STAR_CHARS = [".", ".", ".", "·", "·", "*", "+", "°"];
const STAR_BIG_CHARS = ["*", "+", "✦", "✶"];

function initStars() {
  const count = Math.round((window.innerWidth * window.innerHeight) / 5200); // denser sky
  stars = [];
  for (let i = 0; i < count; i++) {
    const big = Math.random() < 0.12; // a few larger, brighter stars
    stars.push({
      x: Math.random() * window.innerWidth,
      y: Math.random() * window.innerHeight,
      big,
      ch: big ? STAR_BIG_CHARS[Math.floor(Math.random() * STAR_BIG_CHARS.length)]
              : STAR_CHARS[Math.floor(Math.random() * STAR_CHARS.length)],
      base: (big ? 0.22 : 0.08) + Math.random() * (big ? 0.32 : 0.28),
      tw: Math.random() * Math.PI * 2,
      tws: 0.4 + Math.random() * 1.6,
    });
  }
}

// ---- celestial bodies + clouds (procedural ASCII art, theme-dependent) ----
let clouds = [];
let lastTS = 0;
// small fonts + large char-radius = compact but very dense/voluminous bodies
let bodyFont = "9px JetBrains Mono, monospace";   // moon / sun
let planetFont = "8px JetBrains Mono, monospace"; // planets
let cloudFont = "14px JetBrains Mono, monospace";

// shading ramp: dark (sparse) -> bright (dense)
const RAMP = " .·:-=+*oa%#@@";
function shadeChar(d) { // d = nx^2+ny^2 in [0,1]; nearer center => denser
  const t = Math.max(0, Math.min(1, 1 - d));
  return RAMP[Math.min(RAMP.length - 1, Math.floor(0.35 * RAMP.length + t * 0.65 * RAMP.length))];
}
function lumChar(l) { // l ~ 0..1.25 lighting value -> ramp char
  const t = Math.max(0, Math.min(1, l / 1.25));
  return RAMP[Math.max(2, Math.min(RAMP.length - 1, Math.round(2 + t * (RAMP.length - 3))))];
}
function makeGrid(W, H) {
  const g = [];
  for (let r = 0; r < 2 * H + 1; r++) g.push(new Array(2 * W + 1).fill(" "));
  return g;
}
const gridLines = (g) => g.map((r) => r.join(""));

// chars are ~2x taller than wide, so horizontal radius = 2 * vertical radius
function genMoon(Rv) { // sphere lit from the side so it reads as a slightly turned 3D globe
  const Rh = 2 * Rv, g = makeGrid(Rh, Rv);
  const lx = -0.62, ly = -0.42; // raking light from upper-left -> a turned sphere, not a flat disc
  for (let ry = -Rv; ry <= Rv; ry++) for (let rx = -Rh; rx <= Rh; rx++) {
    const nx = rx / Rh, ny = ry / Rv, d = nx * nx + ny * ny;
    if (d > 1) continue;
    const nz = Math.sqrt(Math.max(0, 1 - d));
    let lum = nx * lx + ny * ly + nz * 0.78;
    lum = Math.max(0.1, lum) * (0.4 + 0.6 * nz); // stronger limb darkening -> rounder, less flat
    g[Rv + ry][Rh + rx] = lumChar(lum);
  }
  const craters = [[-0.35, -0.18, 2], [0.32, 0.12, 2], [0.02, 0.42, 1], [-0.18, 0.44, 1], [0.45, -0.3, 1]];
  for (const [cx, cy, rad] of craters) {
    const ccx = Math.round(cx * Rh), ccy = Math.round(cy * Rv);
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad * 2; dx <= rad * 2; dx++) {
      const gx = Rh + ccx + dx, gy = Rv + ccy + dy;
      if (gy < 0 || gy >= g.length || gx < 0 || gx >= g[0].length || g[gy][gx] === " ") continue;
      const dd = (dx / (rad * 2)) ** 2 + (dy / rad) ** 2;
      if (dd <= 1) g[gy][gx] = dd > 0.5 ? "o" : ".";
    }
  }
  return gridLines(g);
}
function genSun(Rv) { // dense disc + 8 rays
  const pad = 3, Rh = 2 * Rv, W = Rh + 2 * pad, H = Rv + pad, g = makeGrid(W, H);
  for (let ry = -Rv; ry <= Rv; ry++) for (let rx = -Rh; rx <= Rh; rx++) {
    const nx = rx / Rh, ny = ry / Rv, d = nx * nx + ny * ny;
    if (d <= 1) g[H + ry][W + rx] = shadeChar(d);
  }
  const dirs = [[0, -1], [0, 1], [1, 0], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (const [dx, dy] of dirs) for (let s = 1; s <= pad; s++) {
    const rx = Math.round(dx * (Rh + s * 2)), ry = Math.round(dy * (Rv + s));
    const gy = H + ry, gx = W + rx;
    if (gy >= 0 && gy < g.length && gx >= 0 && gx < g[0].length)
      g[gy][gx] = (dx && dy) ? (dx * dy > 0 ? "\\" : "/") : (dx ? "-" : "|");
  }
  return gridLines(g);
}
function genPlanet(Rv, banded) { // lit voluminous sphere, optional bands
  const Rh = 2 * Rv, g = makeGrid(Rh, Rv);
  const lx = -0.4, ly = -0.45;
  for (let ry = -Rv; ry <= Rv; ry++) for (let rx = -Rh; rx <= Rh; rx++) {
    const nx = rx / Rh, ny = ry / Rv, d = nx * nx + ny * ny;
    if (d > 1) continue;
    const nz = Math.sqrt(Math.max(0, 1 - d));
    let lum = Math.max(0.14, nx * lx + ny * ly + nz * 0.92) * (0.5 + 0.5 * nz);
    let ch = lumChar(lum);
    if (banded) { const b = Math.sin(ny * 5 + 0.6); if (b > 0.55) ch = "="; else if (b < -0.55) ch = "~"; }
    g[Rv + ry][Rh + rx] = ch;
  }
  return gridLines(g);
}

function genSaturn(Rv) { // lit sphere + a TILTED ring passing behind (top) and in front (bottom)
  const Rh = 2 * Rv, A = Rh * 1.9, B = Math.max(1.3, Rv * 0.55);
  const t = 0.34, ct = Math.cos(t), st = Math.sin(t);          // ring tilt -> 3D, not flat
  const W = Math.ceil(A) + 1, H = Rv + 3, g = makeGrid(W, H);  // taller grid for the tilted ring
  const lx = -0.4, ly = -0.45;
  const onRing = (rx, ry) => {                                 // test against the rotated ellipse
    const u = rx * ct + ry * st, v = -rx * st + ry * ct;
    return Math.abs((u / A) ** 2 + (v / B) ** 2 - 1) < 0.5;
  };
  for (let ry = -H; ry <= H; ry++) for (let rx = -W; rx <= W; rx++) {
    const sd = (rx / Rh) ** 2 + (ry / Rv) ** 2, inSphere = sd <= 1;
    let ch = " ";
    if (onRing(rx, ry) && ry < 0 && !inSphere) ch = "=";       // ring behind the planet (upper half)
    if (inSphere) {
      const nx = rx / Rh, ny = ry / Rv, nz = Math.sqrt(Math.max(0, 1 - sd));
      ch = lumChar(Math.max(0.14, nx * lx + ny * ly + nz * 0.92) * (0.5 + 0.5 * nz));
    }
    if (onRing(rx, ry) && ry >= 0) ch = "=";                   // ring in front of the planet (lower half)
    g[H + ry][W + rx] = ch;
  }
  return gridLines(g);
}

const MOON = genMoon(8);          // compact but many chars
const SUN = genSun(6);
const PLANET_A = genPlanet(3, true); // tiny gas giant
const SATURN = genSaturn(3);

// several cloud shapes — the original outline one plus newer fuller ones
const CLOUDS = [
  [
    "    .--.    ",
    " .-(    ).  ",
    "(___.__)__) ",
  ],
  [
    "       .--~~~~--.       ",
    "    .-(    ::    )-.    ",
    "   (   ::::::::::   )   ",
    "  (  ::::::::::::::  )  ",
    "   `~--..______..--~'   ",
  ],
  [
    "        .-~~~-.            ",
    "   .--~~       ~~--.       ",
    " (        ::::        )___ ",
    "(   ::::::::::::::::::::   )",
    " `~--...._________....--~' ",
  ],
  [
    "      __      ",
    "   .-~  ~-.   ",
    "  (  ::::  )  ",
    "   `-.__.-'   ",
  ],
];

function initClouds() {
  clouds = [];
  for (let i = 0; i < 5; i++) {
    clouds.push({
      art: CLOUDS[Math.floor(Math.random() * CLOUDS.length)],
      x: Math.random() * window.innerWidth,
      y: 24 + Math.random() * window.innerHeight * 0.55,
      vx: 6 + Math.random() * 16,
      alpha: 0.16 + Math.random() * 0.12,
    });
  }
}

// draw an ASCII-art block char-by-char (no occlusion — it's a muted backdrop)
function blitArt(lines, ox, oy, alpha, font) {
  ctx.font = font;
  const cw = ctx.measureText("M").width, lh = parseInt(font, 10) + 2;
  ctx.fillStyle = `rgba(${fgRGB},${alpha})`;
  for (let r = 0; r < lines.length; r++) {
    const row = lines[r], py = oy + r * lh;
    for (let c = 0; c < row.length; c++) {
      if (row[c] === " ") continue;
      ctx.fillText(row[c], ox + c * cw, py);
    }
  }
}
function artW(lines, font) { ctx.font = font; return lines.reduce((m, l) => Math.max(m, l.length), 0) * ctx.measureText("M").width; }

function drawMoon() { blitArt(MOON, window.innerWidth - artW(MOON, bodyFont) - 46, 36, 0.62, bodyFont); }
function drawSun() { blitArt(SUN, window.innerWidth - artW(SUN, bodyFont) - 42, 30, 0.64, bodyFont); }
function drawPlanets() {
  blitArt(PLANET_A, window.innerWidth * 0.12, window.innerHeight * 0.64, 0.44, planetFont);
  blitArt(SATURN, window.innerWidth * 0.74, window.innerHeight * 0.38, 0.52, planetFont);
}
function drawClouds(now) {
  const dt = lastTS ? Math.min(0.05, (now - lastTS) / 1000) : 0;
  for (const c of clouds) {
    c.x += c.vx * dt;
    if (c.x > window.innerWidth + 40) { c.x = -artW(c.art, cloudFont); c.y = 24 + Math.random() * window.innerHeight * 0.55; }
    blitArt(c.art, c.x, c.y, c.alpha, cloudFont);
  }
}

function resizeFx() {
  const dpr = window.devicePixelRatio || 1;
  fx.width = Math.floor(window.innerWidth * dpr);
  fx.height = Math.floor(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  CELL = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--cell")) || 14;
  ctx.textBaseline = "top";
  trailFont = `${CELL - 1}px JetBrains Mono, monospace`;
  starFont = `${Math.max(9, CELL - 3)}px JetBrains Mono, monospace`;
  starFontBig = `${CELL + 4}px JetBrains Mono, monospace`;
  bodyFont = `${Math.max(8, CELL - 5)}px JetBrains Mono, monospace`;
  planetFont = `${Math.max(7, CELL - 6)}px JetBrains Mono, monospace`;
  cloudFont = `${CELL}px JetBrains Mono, monospace`;
  initStars();
  initClouds();
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

function drawStars(now) {
  const t = now / 1000;
  for (let pass = 0; pass < 2; pass++) {     // pass 0: small, pass 1: big (one font switch each)
    ctx.font = pass ? starFontBig : starFont;
    for (const s of stars) {
      if (!!s.big !== !!pass) continue;
      const a = s.base * (0.5 + 0.5 * Math.sin(s.tw + t * s.tws));
      if (a <= 0.02) continue;
      ctx.fillStyle = `rgba(${fgRGB},${a.toFixed(3)})`;
      ctx.fillText(s.ch, s.x, s.y);
    }
  }
}

function drawShooting(now) {
  if (now >= nextShoot) {
    nextShoot = now + 3500 + Math.random() * 6500;
    const fromLeft = Math.random() < 0.5;
    const startX = fromLeft ? Math.random() * window.innerWidth * 0.35 : window.innerWidth * (0.65 + Math.random() * 0.35);
    const startY = Math.random() * window.innerHeight * 0.45;
    const dir = fromLeft ? 1 : -1;
    const speed = 620 + Math.random() * 340;
    const ang = Math.PI * (0.12 + Math.random() * 0.08); // shallow downward angle
    shooting.push({ x: startX, y: startY, vx: dir * speed * Math.cos(ang), vy: speed * Math.sin(ang) + 240, t0: now, life: 850 + Math.random() * 520 });
  }
  ctx.font = starFont;
  const TAIL = 9;
  for (let i = shooting.length - 1; i >= 0; i--) {
    const s = shooting[i];
    if (now - s.t0 > s.life) { shooting.splice(i, 1); continue; }
    const dt = (now - s.t0) / 1000;
    const hx = s.x + s.vx * dt, hy = s.y + s.vy * dt;
    if (hx < -60 || hx > window.innerWidth + 60 || hy > window.innerHeight + 60) { shooting.splice(i, 1); continue; }
    const head = Math.max(0, 1 - (now - s.t0) / s.life);
    const mag = Math.hypot(s.vx, s.vy), ux = s.vx / mag, uy = s.vy / mag;
    for (let k = 0; k < TAIL; k++) {
      const px = hx - ux * k * CELL * 0.85, py = hy - uy * k * CELL * 0.85;
      const a = head * (1 - k / TAIL);
      if (a <= 0.04) continue;
      const ch = k === 0 ? "*" : (k < 3 ? "+" : (k < 6 ? "·" : "."));
      ctx.fillStyle = `rgba(${fgRGB},${a.toFixed(3)})`;
      ctx.fillText(ch, px, py);
    }
  }
}

function drawTrail(now) {
  ctx.font = trailFont;
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
}

function drawFx() {
  ctx.clearRect(0, 0, fx.width, fx.height);
  const now = performance.now();
  const day = document.documentElement.getAttribute("data-theme") === "light";
  if (day) {
    drawClouds(now);
    drawSun();
  } else {
    drawStars(now);
    drawShooting(now);
    drawMoon();
    drawPlanets();
  }
  drawTrail(now);
  lastTS = now;
  requestAnimationFrame(drawFx);
}

// tiny critter standing on the terminal edge: a little cow by day, a UFO by night.
const COW =
  "   ^__^\n" +
  "   (oo)\\_____\n" +
  "   (__)\\     )~\n" +
  "       ||----w   ~\n" +
  "       ||    ||";
const UFO =
  "    .-~~~-.\n" +
  "  .-(  o  )-.\n" +
  " (___________)\n" +
  "   /  /|\\  \\\n" +
  "  '  ' | '  '";
let critterArt = null;
function renderCritter() {
  if (!critterArt) return;
  const day = document.documentElement.getAttribute("data-theme") === "light";
  critterArt.textContent = day ? COW : UFO;
}
function startCritter() {
  critterArt = document.getElementById("critter-art");
  renderCritter();
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

  startCritter();
  boot();
}

document.addEventListener("DOMContentLoaded", init);
