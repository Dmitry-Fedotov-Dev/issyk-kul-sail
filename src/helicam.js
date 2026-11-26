// Фотоаппарат с телеобъективом -- вид из-под носа Ми-8 (бортовой фотограф у блистера). Заменяет в вертолёте подзорную трубу:
//  * зум 1× (как глаз) .. 24× (как труба): щипок, колесо, ползунок справа; обзор -- тянуть по экрану (на зуме -- медленнее);
//  * спуск -- круглая кнопка (или 📷 / F): вспышка, звук затвора, миниатюра кадра улетает в дело;
//  * что попало в кадр -- решает режим (onShot): чем больше зум, тем дальше «видно», но сквозь склон -- нет;
//  * дальномер -- до рельефа в центре кадра; на большом зуме кадр дрожит от болтанки машины (держите висение ровно).
// Вертолёт при этом летит как обычно: джойстик и ▲▼ работают, автомат висения держит место.
import * as THREE from 'three';

export const VF_CSS = `
#vf{position:fixed;inset:0;pointer-events:none;z-index:4}
#vf .cr{position:absolute;width:34px;height:34px;border:2px solid rgba(255,255,255,.8)}#vf .c0{left:10%;top:14%;border-right:0;border-bottom:0}#vf .c1{right:10%;top:14%;border-left:0;border-bottom:0}#vf .c2{left:10%;bottom:18%;border-right:0;border-top:0}#vf .c3{right:10%;bottom:18%;border-left:0;border-top:0}
#vf .x0{position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px;border:1.5px solid rgba(255,255,255,.75);border-radius:50%}
#vf .inf{position:absolute;left:50%;top:calc(50% + 22px);transform:translateX(-50%);font:700 13px var(--ui);color:#fff;background:rgba(0,0,0,.4);border-radius:8px;padding:2px 10px;white-space:nowrap}
#vf .zm{position:absolute;right:calc(14px + env(safe-area-inset-right,0px));top:24%;height:38%;width:44px;pointer-events:auto;touch-action:none;display:flex;flex-direction:column;align-items:center;gap:6px}
#vf .zm input{writing-mode:vertical-lr;direction:rtl;flex:1;width:28px;accent-color:#ff8a2a}#vf .zm b{font:800 13px var(--ui);color:#fff;text-shadow:0 1px 4px #000}
#vf .sh{position:absolute;pointer-events:auto;touch-action:none;width:72px;height:72px;border-radius:50%;border:4px solid #fff;background:rgba(255,255,255,.25);right:calc(14px + clamp(54px,15vw,62px) + 22px + env(safe-area-inset-right,0px));bottom:calc(36px + env(safe-area-inset-bottom,0px))}
#vf .sh:active,#vf .sh.go{background:#ffd24a}body:not(.touchdev) #vf .sh{right:24px;bottom:24px}
#vf .cl{position:absolute;pointer-events:auto;right:calc(14px + env(safe-area-inset-right,0px));top:max(10px,env(safe-area-inset-top,0px));width:40px;height:40px;border-radius:50%;border:1px solid rgba(255,255,255,.5);background:rgba(0,0,0,.4);color:#fff;font:400 18px var(--ui)}
#vf .hp{position:absolute;left:50%;bottom:24%;transform:translateX(-50%);font:600 12px/1.4 var(--ui);color:#fff;text-align:center;background:rgba(0,0,0,.45);border-radius:8px;padding:4px 10px;width:max-content;max-width:80vw}
#vf .fl{position:absolute;inset:0;background:#fff;opacity:0}
#vf .th{position:absolute;left:50%;top:50%;width:160px;height:100px;margin:-50px 0 0 -80px;border:3px solid #fff;box-shadow:0 4px 14px rgba(0,0,0,.5);opacity:0;background-size:cover}
#vf .th.go{animation:vfth 1.1s ease-in forwards}@keyframes vfth{0%{opacity:1;transform:scale(1.4)}35%{opacity:1;transform:scale(1)}100%{opacity:0;transform:translate(-40vw,40vh) scale(.25)}}
@media (max-height:440px){#vf .zm{top:64px;height:32%}#vf .c0,#vf .c1{top:18%}#vf .c2,#vf .c3{bottom:14%}}
body.sarpanel #hfeed,body.sarpanel #hstrip,body.sarpanel #hwarn,body.sarpanel #hhud,body.vf #hradar,body.vf #hwind,body.vf #tools,body.vf #sbtns,body.vf #hland,body.vf #hside,body.vf #hscore,body.vf #hcr{display:none!important}
`;

export function makeViewfinder({ camera, renderer, scene, $, host, H, audio, store, onShot, onClose }) {
  const el = document.createElement('div'); el.id = 'vf'; el.hidden = true;
  el.innerHTML = '<i class="cr c0"></i><i class="cr c1"></i><i class="cr c2"></i><i class="cr c3"></i><i class="x0"></i><div class="inf"></div><div class="zm"><b>24×</b><input type="range" min="0" max="100" value="0"><b>1×</b></div><button class="sh" aria-label="Снимок"></button><button class="cl" aria-label="Закрыть">✕</button><div class="hp" hidden></div><div class="fl"></div><div class="th"></div>';
  host.appendChild(el);
  const s = { on: false, yaw: 0, pitch: -0.3, zoom: 1, zt: 1, still: 0, rng: null }, eye = new THREE.Vector3(), dir = new THREE.Vector3(), tmp = new THREE.Vector3();
  const slider = el.querySelector('input'), stop = (e) => e.stopPropagation();
  for (const q of el.querySelectorAll('.zm,.sh,.cl')) { q.addEventListener('pointerdown', stop); q.addEventListener('wheel', stop); }
  slider.addEventListener('input', () => { s.zt = Math.pow(24, slider.value / 100); });
  el.querySelector('.cl').addEventListener('click', (e) => { e.stopPropagation(); close(); });
  el.querySelector('.sh').addEventListener('click', (e) => { e.stopPropagation(); shoot(); });
  // открыть с направления взгляда (из кабины -- тот же взгляд); закрыть -- вернуть взгляд владельцу (onClose)
  function open(look) { if (s.on) return; s.on = true; el.hidden = false; document.body.classList.add('vf'); s.yaw = look ? look.yaw : 0; s.pitch = look ? look.pitch : -0.3; audio.tick && audio.tick(1800, 0.02);
    if (!store.get('vfHelp')) { store.set('vfHelp', 1); const hp = el.querySelector('.hp'); hp.innerHTML = 'Тяните по экрану — обзор · щипок, колесо или ползунок — зум до 24×<br>Круглая кнопка (или 📷, F) — снимок: всё в кадре уходит в дело с подписями'; hp.hidden = false; setTimeout(() => { hp.hidden = true; }, 7000); } }
  function close() { if (!s.on) return; s.on = false; if (onClose) onClose({ yaw: s.yaw, pitch: s.pitch }); el.hidden = true; document.body.classList.remove('vf'); camera.near = 2.5; camera.fov = 55; camera.updateProjectionMatrix(); }
  // обзор и зум -- вызываются из общего обработчика пальцев/мыши (main.js), как у подзорной трубы
  function pan(dx, dy) { const k = 2 * Math.atan(Math.tan(30 * Math.PI / 180) / s.zoom) / Math.max(240, window.innerHeight); s.yaw -= dx * k; s.pitch = Math.max(-1.45, Math.min(0.5, s.pitch + dy * k)); s.still = 0; }
  function zoomBy(f) { s.zt = Math.max(1, Math.min(24, s.zt * f)); slider.value = String(Math.round(Math.log(s.zt) / Math.log(24) * 100)); }
  const fovDeg = () => 2 * Math.atan(Math.tan(30 * Math.PI / 180) / s.zoom) * 180 / Math.PI;
  // кадр: глаз под носом машины, взгляд -- курс + поворот, тангаж -- свой (горизонт ровный); болтанка -- дрожь, заметная на зуме
  function place(dt, M, hc) { s.zoom += (s.zt - s.zoom) * Math.min(1, dt * 8); s.still += dt;
    M.root.updateMatrixWorld(true); M.root.localToWorld(eye.set(0, 2.9, -9.6)); // тот же глаз, что у вида из кабины
    const jit = (hc.shake * 0.01 + (hc.tb || 0) * 0.012 + 0.0006) * Math.min(1, s.zoom / 6), t = performance.now() / 1000, yaw = (s.abs = hc.th + s.yaw) + Math.sin(t * 7.3) * jit, pit = s.pitch + Math.sin(t * 5.1 + 1) * jit;
    dir.set(Math.sin(yaw) * Math.cos(pit), Math.sin(pit), -Math.cos(yaw) * Math.cos(pit)); camera.position.copy(eye); camera.up.set(0, 1, 0); camera.lookAt(tmp.copy(eye).add(dir));
    camera.fov = fovDeg(); camera.near = 1; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    if ((s.rT = (s.rT || 0) - dt) <= 0) { s.rT = 0.2; s.rng = range(); el.querySelector('.inf').textContent = `📷 ${s.zoom < 1.95 ? s.zoom.toFixed(1) : Math.round(s.zoom)}×${s.rng ? ' · ' + (s.rng >= 1000 ? (s.rng / 1000).toFixed(1) + ' км' : Math.round(s.rng / 10) * 10 + ' м') : ''}`; } }
  // дальномер: луч из центра кадра до рельефа (мир: X, Y, Z над озером)
  function range() { let d = 20; for (let i = 0; i < 80; i++, d *= 1.08) { const x = eye.x + dir.x * d, y = eye.y + dir.y * d, z = eye.z + dir.z * d; if (y < Math.max(0, H(x, -z))) return d; if (d > 30000) break; } return null; }
  // видно ли точку из глаза (склоны не прозрачны): шаги по лучу, последние 8% не проверяем
  function visible(X, Y, Z) { const ex = eye.x, ey = -eye.z, ez = eye.y, L = Math.hypot(X - ex, Y - ey); const n = Math.max(6, Math.min(40, Math.ceil(L / 60)));
    for (let i = 1; i < n; i++) { const k = i / n; if (k > 0.92) break; if (H(ex + (X - ex) * k, ey + (Y - ey) * k) > ez + (Z - ez) * k + 2) return false; } return true; }
  // в кадре ли точка (с полями -- ближе к центру)
  function inFrame(X, Y, Z) { tmp.set(X, Z, -Y).project(camera); return tmp.z < 1 && Math.abs(tmp.x) < 0.8 && Math.abs(tmp.y) < 0.72; }
  // миниатюра кадра: тот же вид в маленькую текстуру и в jpeg (без комикс-обработки -- «фотография»)
  let rt = null, buf = null; const TW = 256, TH = 160;
  function snap() { try { if (!rt) { rt = new THREE.WebGLRenderTarget(TW, TH); rt.texture.colorSpace = THREE.SRGBColorSpace; buf = new Uint8Array(TW * TH * 4); }
      const asp = camera.aspect; camera.aspect = TW / TH; camera.updateProjectionMatrix(); const prev = renderer.getRenderTarget(); renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.readRenderTargetPixels(rt, 0, 0, TW, TH, buf); renderer.setRenderTarget(prev); camera.aspect = asp; camera.updateProjectionMatrix();
      const cv = document.createElement('canvas'); cv.width = TW; cv.height = TH; const x = cv.getContext('2d'), img = x.createImageData(TW, TH); for (let j = 0; j < TH; j++) img.data.set(buf.subarray((TH - 1 - j) * TW * 4, (TH - j) * TW * 4), j * TW * 4); x.putImageData(img, 0, 0); return cv.toDataURL('image/jpeg', 0.72); } catch (e) { return null; } }
  function shoot() { if (!s.on) return; const fl = el.querySelector('.fl'); fl.style.transition = 'none'; fl.style.opacity = '0.85'; void fl.offsetWidth; fl.style.transition = 'opacity .4s'; fl.style.opacity = '0';
    audio.shutter ? audio.shutter() : audio.tick && audio.tick(2400, 0.03); const thumb = snap(), th = el.querySelector('.th'); if (thumb) { th.style.backgroundImage = `url(${thumb})`; th.classList.remove('go'); void th.offsetWidth; th.classList.add('go'); }
    const sh = el.querySelector('.sh'); sh.classList.add('go'); setTimeout(() => sh.classList.remove('go'), 180);
    onShot && onShot({ yaw: s.abs || 0, zoom: s.zoom, eye: { X: eye.x, Y: -eye.z, Z: eye.y }, thumb, range: s.rng, inFrame, visible }); }
  return { snap, get on() { return s.on; }, get zoom() { return s.zoom; }, open, close, toggle(look) { if (s.on) close(); else open(look); }, pan, zoomBy, place, shoot, inFrame, visible, holdStart() {}, holdEnd() {} };
}
