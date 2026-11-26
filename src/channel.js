// Канал сборки по адресу страницы: релиз (issyk-sail.openline.one) -- только законченное; бета (beta.*, localhost, файл, ?beta) -- всё.
// Код у обоих один, ветки разные: main -- релиз, beta -- разработка. Недоделанные режимы в релизе просто не показываются в меню.
export const BETA = (() => { try { const h = location.hostname; return !/(^|\.)openline\.one$/.test(h) || /^beta\./.test(h) || new URLSearchParams(location.search).has('beta'); } catch (e) { return true; } })();
// что видно только в бете
export const BETA_ONLY = new Set(['jet', 'heli', 'river']); // river -- сплав по Чон-Ак-Суу (каякерский режим)
export const BETA_ACH = new Set(['k_river', 'k_clean']); // достижения скрытых режимов внутри видимых групп
export const shown = (id) => BETA || !BETA_ONLY.has(id) && !BETA_ACH.has(id);
