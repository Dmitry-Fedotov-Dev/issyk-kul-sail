// Канал по адресу страницы: основной адрес (issyk-sail.openline.one) и бета (beta.*, localhost, файл, ?beta).
// Пока RELEASE_LIVE = false, основной адрес показывает всё, как раньше: урезанный релиз включается только по решению автора.
const RELEASE_LIVE = false;
const HOST_BETA = (() => { try { const h = location.hostname; return !/(^|\.)openline\.one$/.test(h) || /^beta\./.test(h) || new URLSearchParams(location.search).has('beta'); } catch (e) { return true; } })();
export const BADGE = HOST_BETA && (() => { try { return /^beta\./.test(location.hostname) || new URLSearchParams(location.search).has('beta'); } catch (e) { return false; } })(); // значок «БЕТА» -- только на бета-адресе
export const BETA = HOST_BETA || !RELEASE_LIVE;
// что прячется в урезанном релизе (когда RELEASE_LIVE = true)
export const BETA_ONLY = new Set(['jet', 'heli', 'river']); // river -- сплав по Чон-Ак-Суу (каякерский режим)
export const BETA_ACH = new Set(['k_river', 'k_clean']); // достижения скрытых режимов внутри видимых групп
export const shown = (id) => BETA || !BETA_ONLY.has(id) && !BETA_ACH.has(id);
