// Вода на лодке -- не по сценарию, а по причине. На палубе лежит сетка 48x20 ячеек (вдоль x поперёк) с двумя величинами:
//   film -- слой текущей воды: появляется ТОЛЬКО там, куда вода реально попала (волна выше борта в этой точке, брызги
//           от удара именно здесь), течёт под уклон -- по крену к подветренному борту, по дифференту к корме или носу --
//           и уходит за борт;
//   damp -- влажность поверхности: остаётся после воды и медленно сохнет (на солнце и ветру быстрее).
// Борт мокрый до той высоты, до которой в этом месте недавно доставала вода, и сохнет сверху вниз.
import * as THREE from 'three';

export const DW = { NI: 48, NJ: 20, ST: [0.14, 0.28, 0.42, 0.58, 0.74, 0.9] };
export function makeDeckWater() {
  const { NI, NJ } = DW, n = NI * NJ, film = new Float32Array(n), tmp = new Float32Array(n), damp = new Float32Array(n);
  const data = new Uint8Array(n * 4), tex = new THREE.DataTexture(data, NI, NJ, THREE.RGBAFormat); tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.needsUpdate = true;
  const hline = new Float32Array(12).fill(0.08), hdata = new Uint8Array(6 * 2 * 4), hullTex = new THREE.DataTexture(hdata, 6, 2, THREE.RGBAFormat); hullTex.minFilter = hullTex.magFilter = THREE.LinearFilter; hullTex.needsUpdate = true;
  const at = (i, j) => (i < 0 || j < 0 || i >= NI || j >= NJ ? 0 : film[j * NI + i]);
  return { tex, hullTex, film, damp,
    // s: 0 нос .. 1 корма; u: 0 левый борт .. 1 правый; amount -- условные сантиметры воды
    add(s, u, amount, rad = 1.5) { const ci = s * NI, cj = u * NJ, r = Math.ceil(rad * 2);
      for (let j = Math.max(0, Math.floor(cj - r)); j <= Math.min(NJ - 1, cj + r); j++) for (let i = Math.max(0, Math.floor(ci - r)); i <= Math.min(NI - 1, ci + r); i++) {
        const d2 = ((i + 0.5 - ci) ** 2 + (j + 0.5 - cj) ** 2) / (rad * rad); film[j * NI + i] = Math.min(1.5, film[j * NI + i] + amount * Math.exp(-d2)); } },
    // уровень воды у борта на станции k (0..5), side -1/+1, в местных координатах лодки (y)
    hull(k, side, yWater) { const q = (side < 0 ? 0 : 6) + k; if (yWater + 0.04 > hline[q]) hline[q] = Math.min(1.0, yWater + 0.04); },
    step(dt, phi, pitch, sun, wind, soak) {
      // течение: поперёк -- по крену (phi>0: правый борт ниже), вдоль -- по дифференту плюс лёгкий снос к корме
      const vj = Math.sin(phi) * 9.5 * dt, vi = (Math.sin(pitch) * 14 + 1.2) * dt, drain = Math.exp(-dt * 0.3);
      for (let j = 0; j < NJ; j++) for (let i = 0; i < NI; i++) { const x = i - vi, y = j - vj, i0 = Math.floor(x), j0 = Math.floor(y), fx = x - i0, fy = y - j0;
        tmp[j * NI + i] = ((at(i0, j0) * (1 - fx) + at(i0 + 1, j0) * fx) * (1 - fy) + (at(i0, j0 + 1) * (1 - fx) + at(i0 + 1, j0 + 1) * fx) * fy) * drain; }
      const dry = Math.exp(-dt / (55 - 30 * sun - Math.min(15, wind)));
      for (let j = 0; j < NJ; j++) for (let i = 0; i < NI; i++) { const q = j * NI + i;
        // растекание: вода расползается к соседям
        const sp = 0.25 * ((i ? tmp[q - 1] : 0) + (i < NI - 1 ? tmp[q + 1] : 0) + (j ? tmp[q - NI] : 0) + (j < NJ - 1 ? tmp[q + NI] : 0));
        const f = film[q] = soak ? 1 : tmp[q] + (sp - tmp[q]) * Math.min(1, dt * 6);
        const d = damp[q] = Math.max(damp[q] * dry, Math.min(1, f * 5));
        data[q * 4] = Math.min(255, f * 255); data[q * 4 + 1] = d * 255; }
      tex.needsUpdate = true;
      const hd = Math.exp(-dt / 9); // борт сохнет сверху вниз
      for (let q = 0; q < 12; q++) { hline[q] = soak ? 1 : 0.08 + (hline[q] - 0.08) * hd; hdata[q * 4] = Math.min(255, (hline[q] / 1.1) * 255); }
      hullTex.needsUpdate = true; } };
}
