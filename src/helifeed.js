// Сводка операции -- одно место для всех текстов вертолётного режима (как сводка ходов в «Цивилизации»).
// Источник событий -- сам режим (push/task); сводка только показывает и ничего в деле не меняет.
// Важность: 1 -- критично (гибель, потеря спасателя, «меньше часа», темнота), 2 -- текущая задача, 3 -- находка,
// 4 -- сведения, 5 -- мелочь. Свёрнута -- одна строка, по порядку: непрочитанное критичное (держится, пока не прочитали, но
// не дольше 2 мин) > свежее сообщение (подсвечено 5-8 с, мелочь не вытесняет важное) > текущая задача.
// Анимация не постоянная: новое -- короткая подсветка, критичное -- три вспышки рамки, задача -- три вспышки точки.
// Касание -- раскрыть: задача целиком и лента событий со временем и цветом важности, листается, высота -- по экрану;
// «✕ свернуть» или касание шапки -- свернуть (критичное считается прочитанным).
// Повтор того же текста за 30 с не плодит строки -- у старой растёт «×N».
export const PRI = { CRIT: 1, TASK: 2, FIND: 3, INFO: 4, MINOR: 5 };
export function makeFeed({ $, host, clock }) {
  const el = document.createElement('div'); el.id = 'hfeed'; el.className = 'hud'; el.hidden = true;
  el.innerHTML = '<div class="hd"><i class="dot"></i><span class="tx"></span><b class="n" hidden></b><span class="ex">▾</span></div><div class="ls"></div>'; host.appendChild(el);
  const st = { items: [], task: null, open: false, fresh: null, freshT: 0, unread: 0, key: '', seq: 0 };
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  el.addEventListener('pointerdown', (e) => { e.stopPropagation(); }, true);
  el.addEventListener('click', (e) => { e.stopPropagation(); if (st.open && e.target.closest('.ls')) return; toggle(); });
  function toggle(v = !st.open) { st.open = v; el.classList.toggle('open', v); if (v) { st.unread = 0; st.fresh = null; for (const it of st.items) it.read = true; } render(true); }
  // событие: текст (html из доверенных мест кода), важность 1..5
  function push(text, pri = PRI.INFO) { if (!text) return true; const now = performance.now(), t = clock ? clock() : '';
    const same = st.items.find((it) => it.text === text && now - it.at < 30000); let it;
    if (same) { it = same; it.n++; it.at = now; it.t = t; it.read = st.open; st.items.splice(st.items.indexOf(same), 1); st.items.unshift(it); }
    else { it = { id: ++st.seq, text, pri, t, at: now, n: 1, read: st.open }; st.items.unshift(it); if (st.items.length > 80) st.items.pop(); }
    if (!st.open) { st.unread = st.items.filter((q) => !q.read).length; if (!st.fresh || it.pri <= st.fresh.pri || st.freshT <= 0) { st.fresh = it; st.freshT = it.pri <= 3 ? 8 : 5; } }
    el.classList.remove('flash'); void el.offsetWidth; if (pri === PRI.CRIT) el.classList.add('flash'); render(true); return true; }
  // задача: { title, text, active } -- закреплена сверху; смена задачи -- тоже событие в ленте (важность 2)
  function task(tk) { const key = tk ? tk.title + '|' + tk.text : ''; const changed = (tk && tk.title) !== (st.task && st.task.title), act0 = !!(st.task && st.task.active); st.task = tk;
    if (changed && tk) push(`<b>${esc(tk.title)}.</b> ${esc(tk.text)}`, PRI.TASK); else if (key !== st.key) render(true);
    if (tk && tk.active && !act0) { const d = el.querySelector('.hd .dot'); d.classList.remove('blink'); void d.offsetWidth; d.classList.add('blink'); } st.key = key; }
  const crit = () => st.items.find((q) => q.pri === PRI.CRIT && !q.read && performance.now() - q.at < 120000);
  let lastHd = '', lastLs = '';
  function render(force) { el.hidden = !st.task && !st.items.length;
    const c = crit(), f = st.fresh && st.freshT > 0 ? st.fresh : null, show = c || f, tk = st.task;
    const hd = st.open ? `<b>Сводка операции</b> · ${st.items.length}<span class="cl">✕ свернуть</span>` : show ? show.text + (show.n > 1 ? ` <small>×${show.n}</small>` : '') : tk ? `<b>${esc(tk.title)}.</b> ${esc(tk.text)}` : st.items[0] ? st.items[0].text : '';
    el.classList.toggle('new', !!show && !st.open); el.classList.toggle('crit', !!c && !st.open); el.classList.toggle('act', !!(tk && tk.active) && !show);
    if (hd !== lastHd || force) { el.querySelector('.tx').innerHTML = hd; lastHd = hd; }
    const nb = el.querySelector('.n'); nb.hidden = !st.unread || st.open; nb.textContent = st.unread; nb.classList.toggle('c', !!c);
    if (!st.open) return;
    const ls = (tk ? `<div class="pin${tk.active ? ' act' : ''}"><i class="dot"></i><b>${esc(tk.title)}</b><br>${esc(tk.text)}</div>` : '') +
      st.items.map((it) => `<div class="it p${it.pri}"><span class="tm">${it.t}</span> ${it.text}${it.n > 1 ? ` <small>×${it.n}</small>` : ''}</div>`).join('');
    if (ls !== lastLs || force) { el.querySelector('.ls').innerHTML = ls; lastLs = ls; } }
  function tick(dt) { if (st.freshT > 0) { st.freshT -= dt; if (st.freshT <= 0) { st.fresh = null; render(true); } } }
  function clear() { st.items = []; st.task = null; st.open = false; st.fresh = null; st.unread = 0; st.key = ''; lastHd = lastLs = ''; el.classList.remove('open', 'new', 'act', 'crit', 'flash'); el.hidden = true; }
  return { el, push, task, tick, clear, toggle, get open() { return st.open; }, get items() { return st.items; }, get top() { const c = crit(); return c || (st.fresh && st.freshT > 0 ? st.fresh : null); } };
}

export const FEED_CSS = `
#hfeed{left:50%;top:44px;transform:translateX(-50%);pointer-events:auto;cursor:pointer;width:min(560px,calc(100vw - 400px));min-width:240px;background:rgba(6,18,40,.6);border-radius:10px;font-size:clamp(12px,3.4vw,14px);line-height:1.3;text-shadow:none;z-index:5;border-left:3px solid transparent}
#hfeed .hd{display:flex;align-items:center;gap:7px;padding:5px 10px;min-height:22px}
#hfeed .tx{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#hfeed .tx b,#hfeed .pin b{color:#ffb07a}
#hfeed .dot{flex:none;width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.35)}#hfeed.act .hd .dot,#hfeed .pin.act .dot{background:#ff8a2a}
#hfeed .dot.blink{animation:fdot .5s ease-in-out 6 alternate}@keyframes fdot{to{opacity:.2;transform:scale(.6)}}
#hfeed.new{border-left-color:#ffd27a}#hfeed.new .hd .dot{background:#ffd27a}
#hfeed.crit{border-left-color:#ff4a3a;background:rgba(60,10,6,.72)}#hfeed.crit .hd .dot{background:#ff4a3a}
#hfeed.flash{animation:fcrit .45s ease-in-out 6 alternate}@keyframes fcrit{to{box-shadow:0 0 0 2px #ff4a3a}}
#hfeed .n{flex:none;min-width:18px;height:18px;border-radius:9px;background:#ff8a2a;color:#1b0e00;font-size:11px;text-align:center;line-height:18px;padding:0 4px}#hfeed .n.c{background:#ff4a3a;color:#fff}
#hfeed .ex{flex:none;opacity:.6;font-size:11px}#hfeed.open .ex{display:none}
#hfeed .cl{float:right;font-weight:600;font-size:12px;color:#cfe0ff;background:rgba(255,255,255,.1);border-radius:8px;padding:2px 8px;margin-left:8px}
#hfeed .ls{display:none;max-height:min(calc(100vh - 260px),460px);overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:0 10px 8px;border-top:1px solid rgba(255,255,255,.12)}
@media (max-height:440px){#hfeed .ls{max-height:calc(100vh - 150px)}}
#hfeed.open{background:rgba(6,18,40,.92)}#hfeed.open .ls{display:block}#hfeed.open .hd .tx{white-space:normal}
#hfeed .pin{padding:7px 0;border-bottom:1px solid rgba(255,255,255,.12);display:block}#hfeed .pin .dot{display:inline-block;margin-right:6px;vertical-align:middle}
#hfeed .it{padding:5px 0 5px 8px;border-bottom:1px solid rgba(255,255,255,.07);border-left:3px solid transparent;margin-left:-4px}
#hfeed .it.p1{border-left-color:#ff4a3a;color:#ffd6d0}#hfeed .it.p2{border-left-color:#ff8a2a}#hfeed .it.p3{border-left-color:#ffd27a;color:#fff}#hfeed .it.p4{color:#d5def0}#hfeed .it.p5{color:#a9b8d4;font-size:.92em}
#hfeed .tm{color:#8fa3c4;font-size:11px;margin-right:4px;font-variant-numeric:tabular-nums}#hfeed small{color:#ffd27a}
`;
