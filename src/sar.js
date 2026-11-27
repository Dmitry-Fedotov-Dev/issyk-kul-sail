// Поисково-спасательная операция в районе Хан-Тенгри: «дело» о пропавшей группе -- маршрут по дням, связь, улики,
// правда (что случилось и где люди), часы выживания, очки. Только логика: без three.js и DOM -- проверяется тестами.
//
// Основа -- реальные происшествия на Хан-Тенгри и пике Победы (хроники AAC «Accidents», ExplorersWeb, отчёты МЧС КР):
// главные причины гибели -- срывы (чаще на спуске), горная болезнь (отёк лёгких и мозга), лавины (2004: лавина
// с пика Чапаева на Семёновском -- 11 погибших), закрытые трещины на ледниках Иныльчека, непогода и белая мгла,
// обрушение карнизов на гребне Победы, камнепады в кулуарах, переправы через потоки у озера Мерцбахера.
// Поведение потерявшихся (статистика ISRID, Koester «Lost Person Behavior»): в белой мгле и в одиночку люди
// уходят ВНИЗ -- по стоку, по долинам; останавливаются на ночь; находятся чаще всего в 1-4 км от последней точки.
//
// Время операции -- игровые минуты (секунда игры -- минута суток, как и смена дня и ночи в игре).
// Координаты -- мира игры: X -- восток, Y -- север, высота h(X, Y) -- над Иссык-Кулем (1607 м).

export const ASL = 1607;
// детерминированный случайный ряд: у всех участников совместной операции -- одно и то же дело
export const rng = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const codeOf = (seed) => { let s = seed >>> 0, o = ''; for (let i = 0; i < 5; i++) { o += ABC[s & 31]; s >>>= 5; } return o; };
export const seedOf = (code) => { const c = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); if (c.length !== 5) return null; let s = 0; for (let i = 4; i >= 0; i--) { const k = ABC.indexOf(c[i]); if (k < 0) return null; s = (s << 5) | k; } return s >>> 0; };
export const newCode = () => codeOf((Math.random() * 2 ** 25) >>> 0);

// маршруты: настоящие лагеря по OpenStreetMap (src/khanosm.js); точка -- [X, Y, подпись]; участок между точками -- день
export const ROUTES = {
  khanS: { name: 'Хан-Тенгри с юга, по Семёновскому', heli: 0, pts: [[244669, -54951, 'база Южный Иныльчек'], [249160, -50957, 'лагерь 1 · 4200'], [248952, -47762, 'лагерь 2 · 5200'], [249277, -46587, 'лагерь 3 · 5700'], [250360, -46999, 'бивак 6400'], [250910, -47172, 'вершина 7010']] },
  khanN: { name: 'Хан-Тенгри с севера', heli: 1, pts: [[247818, -43295, 'база Северный Иныльчек'], [249433, -44821, 'лагерь 1'], [249046, -45821, 'лагерь 2'], [249277, -46587, 'лагерь 3 · 5700'], [250360, -46999, 'бивак 6400'], [250910, -47172, 'вершина 7010']] },
  pobeda: { name: 'Пик Победы с юга', heli: 0, pts: [[244669, -54951, 'база Южный Иныльчек'], [244461, -62121, 'лагерь 1 · 4600'], [243121, -62878, 'лагерь 2 · 5200'], [242861, -64152, 'лагерь 3 · 5700'], [242903, -64753, 'лагерь 4 · 6400'], [243291, -65606, 'лагерь 5 · 6900'], [247185, -66578, 'вершина 7439']] },
  trek: { name: 'Треккинг к поляне Мерцбахера', heli: 0, pts: [[244669, -54951, 'база Южный Иныльчек'], [239779, -55537, 'стоянка «Дикий»'], [230814, -53767, 'стоянка «Комсомолец»'], [221506, -52211, 'поляна Мерцбахера']] },
};
// связь группы -- сложность дела
export const COMM = [
  { id: 'sat', name: 'Спутниковый трекер', sub: 'последняя точка и SOS известны', k: 1 },
  { id: 'radio', name: 'Рация', sub: 'последний сеанс связи из лагеря', k: 1.5 },
  { id: 'none', name: 'Без связи', sub: 'только план маршрута и контрольный срок', k: 2.2 },
];
const NAMES = [['Айгерим', 1], ['Данияр', 0], ['Ольга', 1], ['Тимур', 0], ['Мария', 1], ['Азамат', 0], ['Анна', 1], ['Руслан', 0], ['Елена', 1], ['Бекзат', 0], ['Сергей', 0], ['Жанна', 1], ['Нурлан', 0], ['Ирина', 1], ['Павел', 0], ['Динара', 1], ['Артём', 0], ['Алина', 1]];
export const gw = (p, m, f) => (p && p.f ? f : m); // слово в роде человека: gw(v, 'найден', 'найдена')
const CITY = ['Бишкек', 'Алматы', 'Новосибирск', 'Москва', 'Каракол', 'Екатеринбург', 'Ташкент', 'Красноярск'];

// ---- рельеф: помощники ----
const grad = (h, X, Y, e = 120) => [(h(X + e, Y) - h(X - e, Y)) / (2 * e), (h(X, Y + e) - h(X, Y - e)) / (2 * e)];
const slopeAt = (h, X, Y) => Math.hypot(...grad(h, X, Y, 25));
// по линии наибольшего ската (как скатывается сорвавшийся или уходит потерявшийся): шаг st, длина L, шум -- блуждание
export function downhill(h, X, Y, L, r, st = 40, noise = 0.35, avoid = null) { const path = [[X, Y]]; let dx = 0, dy = 0;
  for (let s = 0; s < L; s += st) { const [gx, gy] = grad(h, X, Y, 150), g = Math.hypot(gx, gy) || 1e-6; let ux = -gx / g, uy = -gy / g;
    if (avoid) { ux += avoid[0] * 0.6; uy += avoid[1] * 0.6; }
    ux = ux * 0.7 + dx * 0.3 + (r() - 0.5) * noise; uy = uy * 0.7 + dy * 0.3 + (r() - 0.5) * noise; const u = Math.hypot(ux, uy) || 1; dx = ux / u; dy = uy / u;
    const nX = X + dx * st, nY = Y + dy * st; if (h(nX, nY) < 0) break; if (h(nX, nY) > h(X, Y) + st * 0.3 && s > st * 3) break; X = nX; Y = nY; path.push([X, Y]); }
  return path; }
const lerpP = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
const around = (r, P, R) => { const a = r() * 6.283, d = R * (0.3 + 0.7 * r()); return [P[0] + Math.cos(a) * d, P[1] + Math.sin(a) * d]; };

// ---- десять типовых ситуаций: ранг -- сложность поиска (1 -- проще), исходы -- шансы и часы выживания ----
// legs: какие участки маршрута (номера дней) подходят; place -> {victims, clues, zone} -- правда о происшествии.
// часы выживания (tS) -- от момента происшествия: в трещине -- холод, сутки; в снежной пещере -- двое суток и больше;
// отёк лёгких на 5200 без спуска -- часы; засыпанный лавиной без помощи -- полчаса (живы только на поверхности)
const H = 60; // минут в часе
export const SCEN = [
  { id: 'aval', name: 'Лавина на маршруте', rank: 3, routes: ['khanS', 'pobeda'], legs: (n) => [1, 2], n: [2, 3], real: 'Как в 2004 году на Семёновском: лавина с пика Чапаева накрыла лагерь и тропу.',
    place(c, r, h) { const a = c.leg[0], b = c.leg[1], P = lerpP(a, b, 0.3 + 0.5 * r()), [gx, gy] = grad(h, P[0], P[1], 300), g = Math.hypot(gx, gy) || 1, dn = [-gx / g, -gy / g], C = [P[0] + dn[0] * 120, P[1] + dn[1] * 120];
      const V = c.group.map((p, i) => { const surf = i === 0 && r() < 0.45; const Q = [C[0] + dn[0] * (r() - 0.3) * 160 + dn[1] * (r() - 0.5) * 120, C[1] + dn[1] * (r() - 0.3) * 160 - dn[0] * (r() - 0.5) * 120];
        return { ...p, X: Q[0], Y: Q[1], buried: !surf, injured: true, tS: surf ? (14 + r() * 10) * H : (r() < 0.12 ? 3 : 0.5) * H, pose: surf ? 'sit' : 'buried' }; });
      return { victims: V, zone: { X: C[0], Y: C[1], R: 260, kind: 'aval', dir: dn }, cause: 'Сход лавины на подходе к лагерю ' + (c.legIdx + 1),
        clues: [{ k: 'debris', X: C[0], Y: C[1], big: 1, dir: dn, t: 'Свежий лавинный вынос поперёк тропы. Следы группы входят в него — и не выходят' },
          { k: 'pole', X: C[0] + dn[0] * 40 + dn[1] * 30, Y: C[1] + dn[1] * 40 - dn[0] * 30, t: 'Треккинговая палка торчит из лавинного снега. Ищите здесь — лавинным датчиком, низко' },
          { k: 'glove', X: C[0] - dn[0] * 60, Y: C[1] - dn[1] * 60, t: 'Перчатка на краю выноса. Группа шла здесь, когда сошла лавина' }] }; } },
  { id: 'crev', name: 'Падение в трещину', rank: 2, routes: ['khanS', 'khanN', 'pobeda', 'trek'], legs: (n, R) => (R === 'trek' ? [0, 1, 2] : [0, 1]), n: [2, 2], real: 'Закрытые трещины Иныльчека: шли без связки по «простому» леднику.',
    place(c, r, h) { const P = lerpP(c.leg[0], c.leg[1], 0.2 + 0.6 * r()), Q = around(r, P, 90), T = around(r, Q, 50);
      const V = [{ ...c.group[0], X: Q[0], Y: Q[1], injured: true, tS: (16 + r() * 14) * H, pose: 'crev' }, { ...c.group[1], X: T[0], Y: T[1], tS: 70 * H, pose: 'wave', partner: 1 }];
      return { victims: V, zone: { X: Q[0], Y: Q[1], R: 120, kind: 'crev' }, cause: 'Падение в закрытую трещину без связки',
        clues: [{ k: 'tent', X: T[0] + 8, Y: T[1] + 5, big: 1, t: 'Одинокая палатка на леднике в стороне от тропы — кто-то ждёт помощи' },
          { k: 'rope', X: Q[0] + 6, Y: Q[1] - 4, t: 'Конец верёвки уходит в щель во льду. Там кто-то есть' },
          { k: 'pack', X: (P[0] + Q[0]) / 2, Y: (P[1] + Q[1]) / 2, t: 'Брошенный рюкзак: доставали снаряжение для спасения напарника' }] }; } },
  { id: 'hape', name: 'Горная болезнь в лагере', rank: 1, routes: ['khanS', 'khanN', 'pobeda'], legs: (n) => [2, 3].filter((i) => i < n), n: [2, 3], real: 'Отёк лёгких на 5200-5700: без спуска -- часы. Самая частая беда высотных лагерей.',
    place(c, r, h) { const P = c.leg[0], V = c.group.map((p, i) => { const Q = around(r, P, 25); return { ...p, X: Q[0], Y: Q[1], injured: i === 0, tS: i === 0 ? (6 + r() * 6) * H : 50 * H, pose: i === 0 ? 'lie' : 'wave' }; });
      return { victims: V, zone: { X: P[0], Y: P[1], R: 80, kind: 'camp' }, cause: 'Отёк лёгких: остались в лагере ' + (c.legIdx + 1) + ' — спуститься не смогли',
        clues: [{ k: 'tent', X: P[0] + 10, Y: P[1] - 6, big: 1, t: 'Палатки группы в лагере. Рядом никого — все внутри?' },
          { k: 'note', X: P[0] - 5, Y: P[1] + 4, t: `Записка: «${c.group[0].name} задыхается, кашель с хрипом. Сами вниз не дойдём. Ждём»` }] }; } },
  { id: 'fall', name: 'Срыв на спуске', rank: 4, routes: ['khanS', 'khanN', 'pobeda'], legs: (n) => [n - 2, n - 1], n: [2, 2], real: 'Большинство срывов -- на спуске, уставшими, после вершины.',
    place(c, r, h) { const P = lerpP(c.leg[0], c.leg[1], 0.3 + 0.6 * r()), path = downhill(h, P[0], P[1], 400 + r() * 500, r, 30, 0.2), E = path[path.length - 1], mid = path[path.length >> 1];
      const camp = c.leg[0], W = around(r, camp, 30), alive = r() < 0.55;
      const V = [{ ...c.group[0], X: E[0], Y: E[1], injured: true, tS: alive ? (18 + r() * 16) * H : 0, pose: 'lie' }, { ...c.group[1], X: W[0], Y: W[1], tS: 60 * H, pose: 'wave', partner: 1 }];
      return { victims: V, zone: { X: E[0], Y: E[1], R: 200, kind: 'fall' }, path, cause: 'Срыв на спуске: скольжение по склону ' + Math.round(path.length * 30) + ' м',
        clues: [{ k: 'axe', X: path[2][0], Y: path[2][1], t: 'Ледоруб на склоне, ниже гребня. Отсюда — след скольжения вниз' },
          { k: 'track', X: mid[0], Y: mid[1], path: path.slice(2), t: 'Борозда в снегу — человек скользил вниз по склону' },
          { k: 'tent', X: W[0] + 6, Y: W[1], big: 1, t: `${c.group[1].name} в палатке ниже: «${c.group[0].name} сорвал${gw(c.group[0], 'ся', 'ась')} выше по гребню, я спуст${gw(c.group[1], 'ился один', 'илась одна')}»` }] }; } },
  { id: 'white', name: 'Белая мгла: ушли с маршрута', rank: 5, routes: ['khanS', 'khanN', 'pobeda', 'trek'], legs: (n) => [0, 1, 2].filter((i) => i < n), n: [2, 3], real: 'В белой мгле группы уходят вниз по стоку -- в соседнюю долину, за 2-4 км от тропы.',
    place(c, r, h) { const a = c.leg[0], b = c.leg[1], P = lerpP(a, b, 0.4 + 0.4 * r()), dx = b[0] - a[0], dy = b[1] - a[1], d = Math.hypot(dx, dy) || 1, side = r() < 0.5 ? 1 : -1;
      const path = downhill(h, P[0], P[1], 1800 + r() * 2200, r, 60, 0.5, [dy / d * side, -dx / d * side]), E = path[path.length - 1];
      const V = c.group.map((p, i) => { const Q = around(r, E, 12); return { ...p, X: Q[0], Y: Q[1], tS: (40 + r() * 30) * H, pose: i ? 'sit' : 'wave', cave: 1 }; });
      const q = (f) => path[Math.min(path.length - 1, Math.round(path.length * f))];
      return { victims: V, zone: { X: E[0], Y: E[1], R: 300, kind: 'cave' }, path, cause: 'Сбились с пути в белой мгле, ушли вниз по стоку и вырыли снежную пещеру',
        clues: [{ k: 'wand', X: P[0], Y: P[1], t: 'Последняя вешка группы на маршруте. Дальше вешек нет — свернули?' },
          { k: 'track', X: q(0.2)[0], Y: q(0.2)[1], path: path.slice(0, Math.round(path.length * 0.45)), t: 'Цепочка следов уходит с тропы вниз, в сторону' },
          { k: 'wrap', X: q(0.55)[0], Y: q(0.55)[1], t: 'Обёртка от батончика. Шли здесь недавно — вниз по ложбине' },
          { k: 'cave', X: E[0] + 5, Y: E[1] + 3, big: 1, t: 'Вход в снежную пещеру и лыжная палка с лоскутом. Живы?' }] }; } },
  { id: 'cornice', name: 'Обрушение карниза', rank: 4, routes: ['pobeda', 'khanS'], legs: (n) => [n - 2, n - 1], n: [2, 2], real: 'Гребень пика Победы -- километры карнизов; обрыв уносит на другую сторону хребта.',
    place(c, r, h) { const P = lerpP(c.leg[0], c.leg[1], 0.2 + 0.6 * r()), path = downhill(h, P[0] + (r() - 0.5) * 80, P[1] + (r() - 0.5) * 80, 500 + r() * 700, r, 35, 0.15), E = path[path.length - 1], alive = r() < 0.35, W = around(r, P, 15);
      const V = [{ ...c.group[0], X: E[0], Y: E[1], injured: true, tS: alive ? (16 + r() * 10) * H : 0, pose: 'lie' }, { ...c.group[1], X: W[0], Y: W[1], tS: 30 * H, pose: 'sit', partner: 1 }];
      return { victims: V, zone: { X: E[0], Y: E[1], R: 260, kind: 'fall' }, path, cause: 'Обрушение снежного карниза на гребне',
        clues: [{ k: 'cornice', X: P[0], Y: P[1], big: 1, t: 'Свежий скол карниза на гребне. Кто-то ушёл вниз вместе с ним' },
          { k: 'rope', X: W[0] + 4, Y: W[1] - 3, t: 'Обрезанная верёвка на гребне: напарник удержать не смог' },
          { k: 'pack', X: path[path.length >> 1][0], Y: path[path.length >> 1][1], t: 'Рюкзак ниже по склону — лавинный конус под гребнем' }] }; } },
  { id: 'rock', name: 'Камнепад в кулуаре', rank: 2, routes: ['khanS', 'khanN', 'pobeda'], legs: (n) => [1, 2, 3].filter((i) => i < n - 1), n: [2, 3], real: 'Днём, когда оттаивает, кулуары стреляют камнями -- переломы и удары по каскам.',
    place(c, r, h) { const P = lerpP(c.leg[0], c.leg[1], 0.3 + 0.5 * r()), Q = around(r, P, 160), T = around(r, Q, 20);
      const V = c.group.map((p, i) => { const S = i ? around(r, T, 10) : Q; return { ...p, X: S[0], Y: S[1], injured: i === 0, tS: i === 0 ? (26 + r() * 14) * H : 60 * H, pose: i === 0 ? 'lie' : 'wave' }; });
      return { victims: V, zone: { X: Q[0], Y: Q[1], R: 120, kind: 'rock' }, cause: 'Камнепад в кулуаре: перелом ноги',
        clues: [{ k: 'helmet', X: (P[0] + Q[0]) / 2, Y: (P[1] + Q[1]) / 2, t: 'Расколотая каска. Камень попал сверху — человек ранен' },
          { k: 'rocks', X: Q[0] + 15, Y: Q[1] - 10, big: 1, t: 'Свежие камни на снегу — конус камнепада' },
          { k: 'mirror', X: T[0], Y: T[1], t: 'Блик сигнального зеркала! Кто-то подаёт знак' }] }; } },
  { id: 'frost', name: 'Высотный бивак: обморожения', rank: 3, routes: ['pobeda', 'khanS'], legs: (n) => [n - 2], n: [2, 3], real: 'Выше 6000 вертолёт не висит: снять людей -- дело пеших спасателей.',
    place(c, r, h) { const P = c.leg[0], V = c.group.map((p, i) => { const Q = around(r, P, 20); return { ...p, X: Q[0], Y: Q[1], injured: true, tS: (14 + r() * 12) * H, pose: i ? 'sit' : 'lie' }; });
      return { victims: V, zone: { X: P[0], Y: P[1], R: 100, kind: 'camp' }, high: 1, cause: 'Застряли на высотном биваке: обморожения, нет сил спускаться',
        clues: [{ k: 'tent', X: P[0] + 6, Y: P[1] + 6, big: 1, t: 'Палатка на биваке, полузасыпана. Изнутри машут' },
          { k: 'pack', X: P[0] - 60, Y: P[1] - 40, t: 'Брошенный груз ниже бивака: сил нести уже не было' }] }; } },
  { id: 'lost', name: 'Отставший треккер', rank: 3, routes: ['trek'], legs: (n) => [0, 1, 2].filter((i) => i < n), n: [1, 1], real: 'Отстал от группы, пошёл «срезать» -- и ушёл вниз по ложбине. Двигается, пока светло.',
    place(c, r, h) { const P = lerpP(c.leg[0], c.leg[1], 0.2 + 0.6 * r()), path = downhill(h, P[0], P[1], 2500 + r() * 2000, r, 50, 0.6), E = path[path.length - 1];
      const V = [{ ...c.group[0], X: E[0], Y: E[1], tS: (55 + r() * 25) * H, pose: 'wave', walker: 1, path }];
      const q = (f) => path[Math.min(path.length - 1, Math.round(path.length * f))];
      return { victims: V, zone: { X: E[0], Y: E[1], R: 400, kind: 'lost' }, path, cause: 'Отстал от группы и заблудился на морене',
        clues: [{ k: 'pole', X: P[0], Y: P[1], t: 'Треккинговая палка у тропы: здесь отстал от группы' },
          { k: 'wrap', X: q(0.3)[0], Y: q(0.3)[1], t: 'Обёртка от шоколада в стороне от тропы — шёл вниз' },
          { k: 'track', X: q(0.5)[0], Y: q(0.5)[1], path: path.slice(Math.round(path.length * 0.3), Math.round(path.length * 0.75)), t: 'Следы по снежнику вниз по ложбине — человек один' },
          { k: 'bivy', X: q(0.8)[0], Y: q(0.8)[1], t: 'Примятый снег за камнем — здесь ночевал. Утром ушёл дальше вниз' }] }; } },
  { id: 'river', name: 'Переправа у Мерцбахера', rank: 2, routes: ['trek'], legs: (n) => [n - 1], n: [1, 2], real: 'Ледниковые потоки к вечеру вздуваются; прорыв Мерцбахера сносит переправы.',
    place(c, r, h) { const P = lerpP(c.leg[0], c.leg[1], 0.5 + 0.4 * r()), path = downhill(h, P[0], P[1], 600 + r() * 700, r, 40, 0.2), E = path[path.length - 1], alive = r() < 0.7;
      const V = c.group.map((p, i) => { const Q = i ? around(r, P, 40) : E; return { ...p, X: Q[0], Y: Q[1], injured: i === 0, tS: i === 0 ? (alive ? (20 + r() * 12) * H : 0) : 50 * H, pose: i === 0 ? 'lie' : 'wave', partner: i ? 1 : 0 }; });
      return { victims: V, zone: { X: E[0], Y: E[1], R: 200, kind: 'river' }, path, cause: 'Сбило потоком на переправе',
        clues: [{ k: 'pack', X: P[0] + 5, Y: P[1] + 5, t: 'Рюкзак на берегу у переправы — без хозяина' },
          { k: 'rope', X: P[0] - 6, Y: P[1] + 2, t: 'Верёвка натянута через поток и оборвана' },
          { k: 'wrap', X: path[path.length >> 1][0], Y: path[path.length >> 1][1], t: 'Шапка в камнях ниже по течению' }] }; } },
];
// какие ситуации сколько раз уже были -- чтобы чередовать (последние 4 не повторяем)
export function pickScenario(r, diff, recent = []) {
  const want = [[1, 2, 3], [2, 3, 4], [3, 4, 5]][diff], pool = SCEN.filter((s) => !recent.slice(-4).includes(s.id));
  const w = pool.map((s) => (want.includes(s.rank) ? 3 : 1)), sum = w.reduce((a, b) => a + b, 0); let x = r() * sum;
  for (let i = 0; i < pool.length; i++) { x -= w[i]; if (x <= 0) return pool[i]; } return pool[pool.length - 1]; }

// ---- дело: всё, что есть у спасателей, и правда, которую надо раскрыть ----
export function makeCase(code, h, opt = {}) {
  const seed = seedOf(code) ?? 1, r = rng(seed), diff = opt.diff ?? (r() < 0.35 ? 0 : r() < 0.6 ? 1 : 2);
  const sc = opt.scen ? SCEN.find((s) => s.id === opt.scen) : pickScenario(r, diff, opt.recent || []);
  const rid = sc.routes[Math.floor(r() * sc.routes.length)], R = ROUTES[rid], pts = R.pts.map(([X, Y, n]) => ({ X, Y, n, asl: Math.round(h(X, Y) + ASL) }));
  const legsOk = sc.legs(pts.length - 1, rid).filter((i) => i >= 0 && i < pts.length - 1), legIdx = legsOk[Math.floor(r() * legsOk.length)] ?? 0;
  const pool = NAMES.slice(); const nG = sc.n[0] + Math.floor(r() * (sc.n[1] - sc.n[0] + 1));
  const group = []; for (let i = 0; i < nG; i++) { const k = Math.floor(r() * pool.length); const [nm, fem] = pool.splice(k, 1)[0]; group.push({ name: nm, f: fem, age: 24 + Math.floor(r() * 30), city: CITY[Math.floor(r() * CITY.length)], frame: Math.floor(r() * 10) }); }
  const c = { code, seed, diff, comm: COMM[diff], scen: sc.id, scenName: sc.name, real: sc.real, route: rid, routeName: R.name, pts, legIdx, leg: [[pts[legIdx].X, pts[legIdx].Y], [pts[legIdx + 1].X, pts[legIdx + 1].Y]], group };
  const t = sc.place(c, r, h);
  // правда: где люди и сколько осталось жить (минуты от начала операции)
  const since = Math.round((diff === 0 ? 3 + r() * 5 : diff === 1 ? 8 + r() * 10 : 14 + r() * 16) * H); // сколько прошло с происшествия до вызова спасателей
  c.since = since; c.cause = t.cause; c.zone = t.zone; c.high = !!t.high;
  c.clock0 = 7 + Math.floor(r() * 8); // в котором часу случилось
  c.victims = t.victims.map((v, i) => { const w = v.walker ? walkerPos(v, since, c.clock0) : [v.X, v.Y]; return { ...v, id: i, X: Math.round(w[0]), Y: Math.round(w[1]), z: h(w[0], w[1]), alive0: v.tS > since, left: Math.max(0, v.tS - since) }; });
  // жанр: спасать должно быть кого -- если все уже погибли, в 85% дел один держится (часы -- впритык)
  if (!c.victims.some((v) => v.alive0) && r() < 0.85) { const v = c.victims.find((q) => !q.buried) || c.victims[0]; v.alive0 = true; v.left = Math.round((2.5 + r() * 4) * H); v.buried = false; if (v.pose === 'buried') v.pose = 'sit'; }
  // улики: вешки группы вдоль маршрута до места происшествия + особые по ситуации + ложные (старьё других экспедиций)
  const clues = []; const legLen = (i) => Math.hypot(pts[i + 1].X - pts[i].X, pts[i + 1].Y - pts[i].Y);
  for (let i = 0; i <= legIdx; i++) { const L = legLen(i), n = Math.max(1, Math.floor(L / 900)), fmax = i < legIdx ? 1 : 0.3;
    for (let j = 1; j <= n; j++) { const f = (j / (n + 1)) * fmax; if (f <= 0.02) continue; const P = lerpP([pts[i].X, pts[i].Y], [pts[i + 1].X, pts[i + 1].Y], f); clues.push({ k: 'wand', X: P[0] + (r() - 0.5) * 30, Y: P[1] + (r() - 0.5) * 30, t: `Вешка с оранжевой лентой группы — шли здесь (день ${i + 1})`, day: i + 1 }); } }
  for (let i = 1; i <= legIdx; i++) clues.push({ k: 'note', X: pts[i].X + (r() - 0.5) * 30, Y: pts[i].Y + (r() - 0.5) * 30, t: `Запись в журнале лагеря «${pts[i].n}»: «День ${i}, группа ${group[0].name} — все в порядке, идём выше»`, day: i, camp: 1 });
  for (const q of t.clues) clues.push({ ...q, key: 1 });
  const nFake = 1 + Math.floor(r() * 2); for (let i = 0; i < nFake; i++) { const li = Math.floor(r() * (pts.length - 1)), P = around(r, lerpP([pts[li].X, pts[li].Y], [pts[li + 1].X, pts[li + 1].Y], r()), 250);
    clues.push({ k: ['pack', 'tent', 'glove'][Math.floor(r() * 3)], X: P[0], Y: P[1], t: ['Выцветший рюкзак — лежит здесь не первый год. Не наш', 'Рваная старая палатка, вмёрзла в лёд. Это чужая, давняя', 'Старая перчатка, истлевшая. Не по нашему делу'][Math.floor(r() * 3)], fake: 1 }); }
  c.clues = clues.map((q, i) => ({ ...q, id: i, X: Math.round(q.X), Y: Math.round(q.Y), path: q.path ? q.path.map(([x, y]) => [Math.round(x), Math.round(y)]) : null }));
  // зацепка -- хук первой минуты: последняя метка группы уже известна (свидетели, соседняя экспедиция). Без связи --
  // середина следа (остальное ищем), со связью -- конец следа: сразу к месту, где что-то случилось
  { const tr = c.clues.filter((q) => (q.k === 'wand' || q.camp) && !q.key && !q.fake).sort((a, b) => a.day - b.day || (a.camp ? 1 : 0) - (b.camp ? 1 : 0)), q = tr[diff === 2 ? Math.floor(tr.length * 0.55) : tr.length - 1];
    if (q) c.hook = { id: q.id, txt: `${['Альпинисты из соседнего лагеря', 'Носильщики, спускавшиеся вниз,', 'Экипаж утреннего облёта'][Math.floor(r() * 3)]} видели группу ${group[0].name} на маршруте дня ${q.day}: их вешка с оранжевой лентой${q.camp ? ' и запись в журнале лагеря' : ''}. Дальше их никто не видел` }; }
  // что известно на старте -- по связи
  const v0 = c.victims[0], days = pts.length - 1;
  if (diff === 0) { const a = r() * 6.283, d = 60 + r() * 140; c.last = { kind: 'ping', X: Math.round(v0.X + Math.cos(a) * d), Y: Math.round(v0.Y + Math.sin(a) * d), ago: Math.round(since / H), txt: `Трекер ${group[0].name}: SOS ${Math.round(since / H)} ч назад. «${sc.id === 'hape' ? 'Отёк лёгких, не можем спуститься' : sc.id === 'aval' ? 'Лавина! Двое под снегом' : sc.id === 'white' ? 'Потеряли тропу, роем пещеру' : sc.id === 'lost' ? 'Отстал от группы, не знаю где я' : 'Травма, нужен вертолёт'}». Точность трекера — до 200 м` }; }
  else if (diff === 1) { const k = Math.max(0, legIdx); c.last = { kind: 'radio', camp: k, X: pts[k].X, Y: pts[k].Y, ago: Math.round(since / H) + 6, txt: `Последний сеанс связи — ${k ? `вечером дня ${k}, из точки «${pts[k].n}»` : 'с базы, перед выходом'}: «Все в порядке, завтра по плану — ${pts[k + 1].n}». Больше на связь не выходили` }; }
  // без связи: хватились соседи по маршруту -- группа не пришла в следующий лагерь к вечеру того дня (согласуется с календарём дела и временем с происшествия)
  else c.last = { kind: 'none', txt: `Связи у группы не было. Тревогу подняли соседи по маршруту: к вечеру дня ${legIdx + 1} группа не пришла в «${pts[legIdx + 1].n}». Где они — неизвестно: ищите следы по маршруту` };
  c.plan = pts.slice(1).map((p, i) => ({ day: i + 1, from: pts[i].n, to: p.n, asl: p.asl }));
  return c; }

// ---- ход операции ----
// найден ли человек жив: время операции t (мин); найден -- спасатели рядом: время тает втрое медленнее; сброшен
// спасательный набор с дрона (одеяло, рация, грелки) -- +6 часов
export function aliveAt(v, t) { if (!v.alive0) return false; const used = v.foundT !== undefined ? v.foundT + (t - v.foundT) / 3 : t; return used < v.left + (v.kit ? 6 * H : 0); }
// треккер, пока жив и не найден, идёт по ложбине: днём, по 1.5 км/ч, ночью стоит
// t -- минуты от происшествия, clock0 -- час суток, когда оно случилось
export function walkerPos(v, t, clock0) { if (!v.walker || !v.path || v.foundT !== undefined) return [v.X, v.Y]; let m = 0;
  for (let k = 0; k < t; k += 10) { const hr = (clock0 + k / H) % 24; if (hr > 7 && hr < 20) m += 10 * 25; } // 25 м/мин днём
  const L = v.path.length - 1; return v.path[Math.min(L, Math.floor(m / 50))]; }
// вероятность обнаружения на снимке: расстояние, высота над землёй, ночь (тепловизор дрона видит человека, улику -- нет),
// засыпанный лавиной -- только лавинным датчиком, низко (до 60 м над ним) и близко
export function pod(target, d, agl, night, kind = 'drone') {
  if (target.buried) return d < 70 && agl < 60 ? 0.9 : 0;
  const big = target.big ? 1.6 : 1, isPerson = target.name !== undefined, R = (kind === 'heli' ? 170 : 240) * big * (isPerson ? 1.15 : 1);
  let p = Math.max(0, Math.min(1, 1.25 - d / R)); if (night) p *= isPerson ? (kind === 'drone' ? 1 : 0.4) : kind === 'drone' ? 0.35 : 0.15; if (target.cave && isPerson) p *= 0.75; return p; }

// ---- итог: короче операция и меньше жертв -- лучше; найденный живым -- главная награда ----
export function scoreOf(o) {
  const parts = [];
  const add = (v, t) => { if (v) parts.push([t, Math.round(v)]); };
  add(o.saved * 2500, `спасены живыми × ${o.saved}`);
  add(o.aliveFound * 900, `найдены живыми, не эвакуированы × ${o.aliveFound}`);
  add(o.dead * 300, `найдены погибшие × ${o.dead}`);
  add(o.clues * 40, `улики × ${o.clues}`);
  add(Math.max(0, 1800 - o.minutes * 2.5), `время операции ${Math.floor(o.minutes / 60)} ч ${Math.round(o.minutes % 60)} мин`);
  add(-o.rescuerLost * 900, `потери спасателей × ${o.rescuerLost}`);
  add(-o.droneLost * 150, `потеряно дронов × ${o.droneLost}`);
  add(o.heliCrash ? -2000 : 0, 'авария вертолёта');
  for (const [t, v] of o.extra || []) add(v, t);
  const k = o.comm ? o.comm.k : 1, raw = parts.reduce((a, [, v]) => a + v, 0), total = Math.round(Math.max(0, raw) * k);
  const stars = o.saved > 0 && o.saved === o.alive && !o.rescuerLost && !o.heliCrash ? 3 : o.saved > 0 ? 2 : o.dead + o.aliveFound > 0 ? 1 : 0;
  return { parts, k, total, stars }; }
