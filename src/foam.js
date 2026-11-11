// Рисунок пены, общий для воды и следа. Настоящая пена -- это сеть: пузыри лопаются изнутри, и остаются тонкие белые
// перемычки между круглыми «окнами». Такую сеть даёт ячеистый шум (расстояние до границы ячейки), взятый в трёх
// масштабах и слегка искривлённый течением. Прежний рисунок строился на решётчатом шуме и давал квадратные пятна.
// Мелкие масштабы плавно гаснут, когда становятся меньше пикселя, -- иначе вдали пена рябит отдельными точками.
export const FOAM_GLSL = /* glsl */`
vec2 fh2(vec2 p){ vec3 q=fract(vec3(p.xyx)*vec3(.1031,.1030,.0973)); q+=dot(q,q.yzx+33.33); return fract((q.xx+q.yz)*q.zy); }
float fvn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*f*(f*(f*6.-15.)+10.); float a=fh2(i).x, b=fh2(i+vec2(1,0)).x, c=fh2(i+vec2(0,1)).x, d=fh2(i+vec2(1,1)).x; return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }
// 0 на границе ячеек, растёт к их центрам
float fcell(vec2 p, float t){ vec2 i=floor(p), f=fract(p); float d1=9., d2=9.;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){ vec2 g=vec2(float(x),float(y)), h=fh2(i+g); h=0.5+0.38*sin(t*0.6+6.2831*h); float d=length(g+h-f); if(d<d1){ d2=d1; d1=d; } else if(d<d2) d2=d; }
  return d2-d1; }
// плотность рисунка 0..1: 1 -- перемычка пены, 0 -- окно
float foamTex(vec2 o, float t){ float px=length(fwidth(o));
  vec2 w=o+(vec2(fvn(o*0.55+t*0.06), fvn(o*0.55+7.3-t*0.05))-0.5)*1.5;
  float a=1.-smoothstep(0.02,0.30,fcell(w*1.15,t)), r=a*0.62;
  float k2=1.-smoothstep(0.10,0.45,px*3.4); if(k2>0.01) r+=(1.-smoothstep(0.02,0.34,fcell(w*3.4+11.,t*1.3)))*0.42*k2; else r+=0.16;
  #ifndef LOW
  float k3=1.-smoothstep(0.10,0.45,px*9.5); if(k3>0.01) r+=(1.-smoothstep(0.03,0.40,fcell(w*9.5+3.,t*1.7)))*0.22*k3; else r+=0.08;
  #endif
  return r; }
`;
