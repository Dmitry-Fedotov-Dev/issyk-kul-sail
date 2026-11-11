// Комикс-обработка кадра: чернильные контуры у объектов и рисованная подача цвета.
// Сцена рисуется во внеэкранный буфер с картой глубины, затем один проход по экрану:
//   - контур ставится там, где глубина меняется скачком (силуэт объекта, гребень хребта на фоне неба, кромка берега).
//     Берётся вторая разность глубины, а не первая: на ровной наклонной поверхности она равна нулю, поэтому склоны и
//     палуба не зарисовываются. Линия сглажена, так что отдельное сглаживание краёв (MSAA) больше не нужно --
//     это экономит видеопамять: вместо четырёх копий кадра хранится одна;
//   - внутри объектов тушью подчёркиваются резкие перепады яркости (швы паруса, окна, пена на палубе);
//   - тени слегка заштрихованы, цвет чуть плотнее.
// Вода, брызги и небо глубину не пишут, поэтому остаются чистыми: волны не обводятся.
import * as THREE from 'three';

export function postSupported() { try { const c = document.createElement('canvas'), gl = c.getContext('webgl2'); return !!gl && !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float')); } catch (e) { return false; } }

export function makePost(renderer) {
  const depth = new THREE.DepthTexture(4, 4); depth.type = THREE.UnsignedIntType;
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthTexture: depth, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, stencilBuffer: false });
  const u = { tC: { value: rt.texture }, tD: { value: depth }, uPx: { value: new THREE.Vector2(1, 1) }, uNF: { value: new THREE.Vector2(0.5, 3e5) }, uK: { value: 1 }, uInk: { value: 1 }, uSunP: { value: new THREE.Vector3(0.5, 0.5, 0) } };
  const mat = new THREE.ShaderMaterial({ uniforms: u, depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.,1.); }',
    fragmentShader: `precision highp float; uniform sampler2D tC, tD; uniform vec2 uPx, uNF; uniform float uK, uInk; uniform vec3 uSunP; varying vec2 vUv;
float Z(vec2 uv){ float d=texture2D(tD,uv).x; return uNF.x*uNF.y/(uNF.y-d*(uNF.y-uNF.x)); }
float L(vec2 uv){ vec3 c=texture2D(tC,uv).rgb; c=c/(1.+c); return dot(c,vec3(0.3,0.59,0.11)); }
void main(){ vec3 col=texture2D(tC,vUv).rgb; float zc=Z(vUv), solid=step(zc,uNF.y*0.9);
  // толщина линии: вблизи жирнее, вдали тоньше (иначе дальний берег и горы тонут в туши)
  float nearK=1.-smoothstep(40.,2500.,zc); vec2 o=uPx*uK*mix(0.9,1.7,nearK);
  float zl=Z(vUv-vec2(o.x,0.)), zr=Z(vUv+vec2(o.x,0.)), zu=Z(vUv+vec2(0.,o.y)), zd=Z(vUv-vec2(0.,o.y));
  float zm=min(zc,min(min(zl,zr),min(zu,zd)));
  float lap=(abs(zl+zr-2.*zc)+abs(zu+zd-2.*zc))/zm;
  // порог растёт с расстоянием: вдали буфер глубины грубеет, и без этого появились бы ложные штрихи
  float t0=0.03+zm/2.5e6, edge=smoothstep(t0,t0*2.6,lap);
  float ink=edge*mix(0.55,0.95,1.-smoothstep(300.,8000.,zm));
  if(solid>0.5){ // рисованные детали внутри объекта
    float a=L(vUv-vec2(o.x,0.)), b=L(vUv+vec2(o.x,0.)), c2=L(vUv+vec2(0.,o.y)), d=L(vUv-vec2(0.,o.y));
    float g=length(vec2(a-b,c2-d)); ink=max(ink, smoothstep(0.10,0.26,g)*0.5*nearK);
    // штриховка в тенях
    float lum=L(vUv), h=step(0.55,fract((gl_FragCoord.x+gl_FragCoord.y)/(5.*uK)));
    col*=1.-0.22*h*smoothstep(0.16,0.05,lum)*nearK; }
  col=mix(vec3(dot(col,vec3(0.3,0.59,0.11))),col,1.12);              // цвет плотнее
  col=mix(col, vec3(0.012,0.016,0.03), ink*uInk);
  // Солнце в кадре: засветка объектива. Ореол, лучи, большое кольцо-гало и цепочка бликов-кругов по линии от солнца
  // через центр кадра. Если солнце закрыто парусом или горой (по карте глубины), блики гаснут, остаётся слабый ореол.
  if(uSunP.z>0.003){ vec2 sp=uSunP.xy, asp=vec2(uPx.y/uPx.x,1.), dv=(vUv-sp)*asp; float len=length(dv), an=atan(dv.y,dv.x);
    float open=(sp.x>0.&&sp.x<1.&&sp.y>0.&&sp.y<1.) ? step(uNF.y*0.9, Z(sp)) : 1., A=uSunP.z*(0.12+0.88*open);
    vec3 warm=vec3(1.,0.93,0.78), fl=warm*(exp(-len*3.2)*0.20+exp(-len*10.)*0.5+exp(-len*40.)*3.);
    fl+=warm*(pow(abs(sin(an*4.+0.4)),14.)*0.22+pow(abs(sin(an*7.-1.1)),22.)*0.14)*exp(-len*2.6);          // лучи
    fl+=vec3(1.,0.85,0.6)*exp(-pow((len-0.34)/0.014,2.))*0.16+vec3(0.6,0.8,1.)*exp(-pow((len-0.365)/0.012,2.))*0.12; // гало
    vec2 ax=vec2(0.5)-sp;                                                                                 // блики по оси
    for(int i=0;i<6;i++){ float k=float(i), t=0.38+k*0.33, r=(i==2||i==5)?0.115:(0.028+0.017*k); vec2 q=(vUv-(sp+ax*t))*asp; float dq=length(q)/r;
      vec3 tint=i==1?vec3(0.5,1.,0.7):i==3?vec3(1.,0.6,0.45):i==4?vec3(0.55,0.7,1.):vec3(1.,0.9,0.7);
      fl+=tint*((1.-smoothstep(0.8,1.,dq))*0.10+exp(-pow((dq-0.93)/0.06,2.))*0.14)*open; }
    col+=fl*A; col+=warm*0.03*A; }
  gl_FragColor=vec4(col,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}` });
  const scene = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); quad.frustumCulled = false; scene.add(quad);
  let ok = true, checked = false; const size = new THREE.Vector2();
  return { get ok() { return ok; }, setSun(x, y, a) { u.uSunP.value.set(x, y, a); },
    resize() { renderer.getDrawingBufferSize(size); rt.setSize(Math.max(2, size.x), Math.max(2, size.y)); u.uPx.value.set(1 / size.x, 1 / size.y); u.uK.value = Math.max(0.75, size.y / 720); checked = false; },
    render(sc, camera) {
      if (!ok) { renderer.render(sc, camera); return; }
      renderer.setRenderTarget(rt); renderer.render(sc, camera);
      if (!checked) { checked = true; const gl = renderer.getContext(); if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { ok = false; renderer.setRenderTarget(null); rt.dispose(); renderer.render(sc, camera); return; } } // устройство не умеет такой буфер -- рисуем напрямую
      renderer.setRenderTarget(null); u.uNF.value.set(camera.near, camera.far); renderer.render(scene, cam); } };
}
