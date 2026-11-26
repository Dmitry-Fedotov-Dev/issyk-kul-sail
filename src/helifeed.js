// Сводка операции -- одно место для всех текстов вертолётного режима (как сводка ходов в «Цивилизации»):
//  * свёрнута -- одна строка: свежее сообщение (6 с, подсвечено), иначе текущая задача; активная задача (кто-то ждёт
//    помощи, тикает таймер) -- мигающая точка; значок -- сколько непрочитанного;
//  * касание -- разворачивается: полный текст задачи и лента событий со временем, листается; касание шапки -- свернуть;
//  * повтор того же текста за 30 с не плодит строки -- у старой растёт счётчик «×N».
// Полётные тревоги («ЗЕМЛЯ!», порыв) сюда не идут -- они остаются чипом у приборов: это не новости, а реакция.
export function makeFeed({ $, host, clock }) {
  const el = document.createElement('div'); el.id = 'hfeed'; el.className = 'hud'; el.hidden = true;
  el.innerHTML = '<div class="hd"><i class="dot"></i><span class="tx"></span><b class="n" hidden></b><span class="ex">▾</span></div><div class="ls"></div>'; host.appendChild(el);
  const st = { items: [], task: null, open: false, fresh: null, freshT: 0, unread: 0, key: '' };
  const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  el.addEventListener('pointerdown', (e) => { e.stopPropagation(); }, true);
  el.addEventListener('click', (e) => { e.stopPropagation(); if (st.open && e.target.closest('.ls')) return; toggle(); });
  function toggle(v = !st.open) { st.open = v; el.classList.toggle('open', v); if (v) { st.unread = 0; st.fresh = null; for (const it of st.items) it.read = true; } render(true); }
  // событие: текст (можно с html-разметкой из доверенных мест кода), уровень: 0 -- инфо, 1 -- важно, 2 -- срочно
  function push(text, lvl = 0) { if (!text) return; const now = performance.now(), t = clock ? clock() : '';
    const same = st.items.find((it) => it.text === text && now - it.at < 30000); if (same) { same.n++; same.at = now; same.t = t; same.read = st.open; st.items.splice(st.items.indexOf(same), 1); st.items.unshift(same); }
    else { st.items.unshift({ text, lvl, t, at: now, n: 1, read: st.open }); if (st.items.length > 60) st.items.pop(); }
    if (!st.open) { st.unread = st.items.filter((it) => !it.read).length; st.fresh = st.items[0]; st.freshT = lvl >= 1 ? 8 : 6; } render(true); return true; }
  // задача: { title, text, active } -- закреплена сверху; смена задачи -- тоже событие в ленте
  function task(tk) { const key = tk ? tk.title + '|' + tk.text.slice(0, 40) : ''; const changed = (tk && tk.title) !== (st.task && st.task.title); st.task = tk;
    if (changed && tk) push(`<b>${esc(tk.title)}.</b> ${esc(tk.text)}`, 1); else if (key !== st.key) render(true); st.key = key; }
  let lastHd = '', lastLs = '';
  function render(force) { el.hidden = !st.task && !st.items.length;
    const f = st.fresh && st.freshT > 0 ? st.fresh : null, tk = st.task, act = !!(tk && tk.active);
    const hd = st.open ? `<b>Сводка операции</b> · ${st.items.length}` : f ? f.text + (f.n > 1 ? ` <small>×${f.n}</small>` : '') : tk ? `<b>${esc(tk.title)}.</b> ${esc(tk.text)}` : st.items[0] ? st.items[0].text : '';
    el.classList.toggle('new', !!f); el.classList.toggle('act', act && !f);
    if (hd !== lastHd || force) { el.querySelector('.tx').innerHTML = hd; lastHd = hd; }
    const nb = el.querySelector('.n'); nb.hidden = !st.unread || st.open; nb.textContent = st.unread;
    if (!st.open) return;
    const ls = (tk ? `<div class="pin${act ? ' act' : ''}"><i class="dot"></i><b>${esc(tk.title)}</b><br>${esc(tk.text)}</div>` : '') +
      st.items.map((it) => `<div class="it l${it.lvl}"><span class="tm">${it.t}</span> ${it.text}${it.n > 1 ? ` <small>×${it.n}</small>` : ''}</div>`).join('');
    if (ls !== lastLs) { el.querySelector('.ls').innerHTML = ls; lastLs = ls; } }
  function tick(dt) { if (st.freshT > 0) { st.freshT -= dt; if (st.freshT <= 0) { st.fresh = null; render(true); } } }
  function clear() { st.items = []; st.task = null; st.open = false; st.fresh = null; st.unread = 0; st.key = ''; lastHd = lastLs = ''; el.classList.remove('open', 'new', 'act'); el.hidden = true; }
  return { el, push, task, tick, clear, toggle, get open() { return st.open; }, get items() { return st.items; } };
}

export const FEED_CSS = `
#hfeed{left:50%;top:44px;transform:translateX(-50%);pointer-events:auto;cursor:pointer;width:min(560px,calc(100vw - 400px));min-width:240px;background:rgba(6,18,40,.6);border-radius:10px;font-size:clamp(12px,3.4vw,14px);line-height:1.3;text-shadow:none;z-index:5}
#hfeed .hd{display:flex;align-items:center;gap:7px;padding:5px 10px;min-height:22px}
#hfeed .tx{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#hfeed .tx b,#hfeed .pin b{color:#ffb07a}
#hfeed .dot{flex:none;width:7px;height:7px;border-radius:50%;background:rgba(255,255,255,.35)}#hfeed.act .hd .dot,#hfeed .pin.act .dot{background:#ff8a2a;animation:fdot 1s ease-in-out infinite}
#hfeed.new{box-shadow:0 0 0 1.5px #ffd27a inset}#hfeed.new .hd .dot{background:#ffd27a}
@keyframes fdot{50%{opacity:.25;transform:scale(.7)}}
#hfeed .n{flex:none;min-width:18px;height:18px;border-radius:9px;background:#ff8a2a;color:#1b0e00;font-size:11px;text-align:center;line-height:18px;padding:0 4px}
#hfeed .ex{flex:none;opacity:.6;font-size:11px;transition:transform .2s}#hfeed.open .ex{transform:rotate(180deg)}
#hfeed .ls{display:none;max-height:min(52vh,420px);overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;padding:0 10px 8px;border-top:1px solid rgba(255,255,255,.12)}
#hfeed.open{background:rgba(6,18,40,.9)}#hfeed.open .ls{display:block}#hfeed.open .hd .tx{white-space:normal}
#hfeed .pin{padding:7px 0 7px;border-bottom:1px solid rgba(255,255,255,.12);display:block}#hfeed .pin .dot{display:inline-block;margin-right:6px;vertical-align:middle}
#hfeed .it{padding:5px 0;border-bottom:1px solid rgba(255,255,255,.07)}#hfeed .it.l1{color:#fff}#hfeed .it.l0{color:#d5def0}#hfeed .it.l2{color:#ffd27a}
#hfeed .tm{color:#8fa3c4;font-size:11px;margin-right:4px;font-variant-numeric:tabular-nums}#hfeed small{color:#ffd27a}
`;
