/* ======================================================================
   TEOCALLI PX7 — fondo 3D: planeta de cristal líquido con galaxia azul
   y cinta de hebras de cristal con esferas. Todo procedural (sin archivos
   externos), nítido a cualquier resolución.
   Si algo falla, se llama a window.__px7Fallback() (motor de partículas).
   ====================================================================== */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

(function () {
  'use strict';
  var QS = location.search;
  function fail(why) {
    console.warn('[px7] orbe no disponible:', why);
    if (window.__px7Fallback) window.__px7Fallback(true);
  }
  if (window.__px7Fell || /[?&](particles|engine)/.test(QS)) return;                       // el respaldo ya arrancó por demora

  try {
    var canvas = document.getElementById('bg');
    var UA = navigator.userAgent || '';
    var COARSE = window.matchMedia('(pointer: coarse)').matches;
    var PHONE = /Android.+Mobile|iPhone|iPod|Windows Phone/i.test(UA) || Math.min(screen.width, screen.height) < 600;
    var MOBILE = PHONE || COARSE;
    var REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var compactMQ = window.matchMedia('(max-width: 960px), (max-aspect-ratio: 1/1)');

    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
    var CAMZ = 9;
    camera.position.set(0, 0, CAMZ);

    var system = new THREE.Group(), floatG = new THREE.Group(), blobHolder = new THREE.Group(), ringRoot = new THREE.Group();
    scene.add(system); system.add(floatG); floatG.add(blobHolder); floatG.add(ringRoot);

    /* ---------------- GLSL compartido ---------------- */
    var NOISE = [
      'vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}',
      'vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}',
      'vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}',
      'vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}',
      'float snoise(vec3 v){',
      ' const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);',
      ' vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);',
      ' vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);',
      ' vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;',
      ' i=mod289(i);',
      ' vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));',
      ' float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;',
      ' vec4 j=p-49.*floor(p*ns.z*ns.z);',
      ' vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);',
      ' vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);',
      ' vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);',
      ' vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));',
      ' vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;',
      ' vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);',
      ' vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));',
      ' p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;',
      ' vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;',
      ' return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));',
      '}',
      'uniform float uTime;uniform float uAmp;',
      'float wobble(vec3 d){return snoise(d*1.1+vec3(uTime*.30,uTime*.21,-uTime*.26))*uAmp+snoise(d*2.3-vec3(uTime*.42))*uAmp*.3;}'
    ].join('\n');

    var U = { uTime: { value: 0 }, uAmp: { value: 0.07 }, uR: { value: 1 } };

    /* ---------------- planeta (blob) ---------------- */
    var blobMat = new THREE.ShaderMaterial({
      uniforms: U,
      vertexShader: [
        NOISE,
        'uniform float uR;varying vec3 vN;varying vec3 vV;varying vec2 vQ;',
        'void main(){',
        ' vec3 d=normalize(position);float L0=length(position);',
        ' vec3 p=position+d*wobble(d)*L0;',
        ' vec3 t1=normalize(cross(d,vec3(0.,1.,.001)));vec3 t2=cross(d,t1);float e=.02;',
        ' vec3 d1=normalize(d+t1*e),d2=normalize(d+t2*e);',
        ' vec3 p1=position+d*0.;p1=d1*L0+d1*wobble(d1)*L0;vec3 p2=d2*L0+d2*wobble(d2)*L0;',
        ' vec3 n=normalize(cross(p1-p,p2-p));if(dot(n,normal)<0.)n=-n;',
        ' vN=normalize(normalMatrix*mix(normal,n,.85));',
        ' vec4 mv=modelViewMatrix*vec4(p,1.);',
        ' vec4 c=modelViewMatrix*vec4(0.,0.,0.,1.);',
        ' float rv=length(modelViewMatrix*vec4(uR,0.,0.,0.));',
        ' vQ=(mv.xy-c.xy)/rv;vV=normalize(-mv.xyz);',
        ' gl_Position=projectionMatrix*mv;}'
      ].join('\n'),
      fragmentShader: [
        NOISE,
        'varying vec3 vN;varying vec3 vV;varying vec2 vQ;',
        'float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}',
        'float stars(vec2 q,float scale,float thr){',
        ' vec2 g=q*scale;vec2 id=floor(g);vec2 f=fract(g)-.5;',
        ' float h=hash(id);if(h<thr)return 0.;',
        ' vec2 o=vec2(hash(id+3.1),hash(id+7.7))-.5;',
        ' float d=length(f-o*.6);',
        ' float tw=.65+.35*sin(uTime*(1.2+h*3.)+h*40.);',
        ' return smoothstep(.09,0.,d)*tw*(.5+h*.9);}',
        'void main(){',
        ' vec3 n=normalize(vN);vec3 v=normalize(vV);',
        ' float r=length(vQ);',
        ' float a=uTime*.16+sin(uTime*.45)*(1.-smoothstep(0.,1.,r))*.55;',
        ' float ca=cos(a),sa=sin(a);vec2 q=mat2(ca,sa,-sa,ca)*vQ;',
        ' q+=.022*vec2(snoise(vec3(q*3.,uTime*.35)),snoise(vec3(q*3.+7.3,uTime*.35)));',
        ' float rr=length(q);float th=atan(q.y,q.x);',
        /* galaxia: fondo azul profundo, brazos espirales, polvo, estrellas */
        ' vec3 deep=vec3(.004,.02,.12);vec3 mid=vec3(.03,.24,.95);vec3 hi=vec3(.35,.82,1.);',
        ' float sp=th*2.+log(rr+.05)*-5.2+uTime*.0;',
        ' float arms=pow(.5+.5*cos(sp),2.2);',
        ' arms*=smoothstep(1.05,.12,rr)*smoothstep(.0,.2,rr);',
        ' float dust=snoise(vec3(q*4.2,3.+uTime*.05))*.5+.5;',
        ' float dust2=snoise(vec3(q*9.,11.))*.5+.5;',
        ' vec3 col=deep+mid*arms*(.55+.7*dust)+hi*pow(arms,3.)*.55*dust2;',
        ' col+=mid*.22*exp(-rr*rr*3.2);',
        ' float st=stars(q,34.,.80)+stars(q+.37,70.,.86)*.8+stars(q-.21,130.,.9)*.7;',
        ' col+=vec3(.75,.9,1.)*st*smoothstep(1.,.2,rr)*1.25;',
        /* núcleo que respira */
        ' col+=vec3(.55,.85,1.)*exp(-rr*rr*18.)*(.55+.2*sin(uTime*1.3));',
        ' col+=vec3(.9,.97,1.)*exp(-rr*rr*120.)*.9;',
        /* piel de cristal */
        ' float fres=pow(1.-clamp(dot(n,v),0.,1.),3.);',
        ' col+=vec3(.1,.55,1.)*fres*.7;',
        ' vec3 L1=normalize(vec3(.35,.7,.6));vec3 L2=normalize(vec3(-.7,-.2,.6));',
        ' col+=vec3(.8,.95,1.)*pow(max(dot(reflect(-L1,n),v),0.),70.)*.55;',
        ' col+=vec3(.4,.8,1.)*pow(max(dot(reflect(-L2,n),v),0.),30.)*.35;',
        ' gl_FragColor=vec4(col*1.1,1.);}'
      ].join('\n')
    });
    var blobDetail = MOBILE ? 48 : 72;
    blobHolder.add(new THREE.Mesh(new THREE.IcosahedronGeometry(1, blobDetail), blobMat));

    /* ---------------- cinta de hebras de cristal ---------------- */
    function glass(edge, body, glint) {
      return new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        vertexShader: 'varying vec3 vN;varying vec3 vV;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}',
        fragmentShader: [
          'varying vec3 vN;varying vec3 vV;',
          'void main(){',
          ' vec3 n=normalize(vN);if(!gl_FrontFacing)n=-n;vec3 v=normalize(vV);',
          ' float f=1.-abs(dot(n,v));',
          ' vec3 col=vec3(.08,.38,1.)*' + body.toFixed(3) + '+vec3(.22,.72,1.)*pow(f,2.4)*' + edge.toFixed(3) + ';',
          ' vec3 L1=normalize(vec3(.35,.7,.6));vec3 L2=normalize(vec3(-.6,-.35,.7));',
          ' float s1=pow(max(dot(reflect(-L1,n),v),0.),90.);float s2=pow(max(dot(reflect(-L2,n),v),0.),40.);',
          ' float caustic=pow(max(dot(n,-L1),0.),6.)*.35;',
          ' col+=vec3(.85,.97,1.)*(s1*' + glint.toFixed(3) + '+s2*.35)+vec3(.3,.8,1.)*caustic;',
          ' gl_FragColor=vec4(col,1.);}'
        ].join('\n')
      });
    }
    var strandMat = glass(0.85, 0.10, 1.2), beadMat = glass(1.25, 0.06, 2.6);
    var beadGeo = new THREE.SphereGeometry(1, MOBILE ? 28 : 44, MOBILE ? 18 : 30);
    ringRoot.rotation.set(-1.34, -0.12, -0.56);

    var seed = 7;
    function rnd() { seed = seed * 16807 % 2147483647; return (seed - 1) / 2147483646; }
    var strands = [];
    for (var i = 0; i < 16; i++) {
      var k = i / 15 - 0.5, R = 1.6 + k * 0.5 + (rnd() - .5) * .04;
      var tilt = new THREE.Group();
      tilt.rotation.x = k * 0.20 + (rnd() - .5) * .04; tilt.rotation.y = k * 0.07;
      var spin = new THREE.Group(); tilt.add(spin); ringRoot.add(tilt);
      var tube = 0.0035 + rnd() * 0.004;
      spin.add(new THREE.Mesh(new THREE.TorusGeometry(R, tube, 8, MOBILE ? 420 : 640), strandMat));
      var nb = 3 + Math.floor(rnd() * 5);
      for (var b = 0; b < nb; b++) {
        var ang = rnd() * Math.PI * 2, sc = 0.022 + rnd() * 0.038; if (rnd() < .18) sc *= 1.6;
        var m = new THREE.Mesh(beadGeo, beadMat); m.position.set(Math.cos(ang) * R, Math.sin(ang) * R, 0); m.scale.setScalar(sc); spin.add(m);
      }
      if (i % 3 === 0) {
        for (var mb = 0; mb < 26; mb++) {
          var a2 = mb / 26 * Math.PI * 2, s2 = 0.008 + rnd() * 0.008;
          var mm = new THREE.Mesh(beadGeo, beadMat); mm.position.set(Math.cos(a2) * R, Math.sin(a2) * R, 0); mm.scale.setScalar(s2); spin.add(mm);
        }
      }
      strands.push({ g: spin, sp: (0.09 + rnd() * 0.13) * (i % 2 === 0 ? 1.2 : 1) });
    }

    /* ---------------- post-proceso: brillo suave ---------------- */
    var composer = null, bloom = null, useBloom = true;
    function makeComposer(w, h, pr) {
      var rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: MOBILE ? 2 : 4 });
      composer = new EffectComposer(renderer, rt);
      composer.setPixelRatio(1);
      composer.addPass(new RenderPass(scene, camera));
      bloom = new UnrealBloomPass(new THREE.Vector2(Math.max(1, w * pr * .5), Math.max(1, h * pr * .5)), 0.38, 0.45, 0.88);
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
    }

    /* ---------------- tamaño y colocación según el layout ---------------- */
    var W = 0, H = 0, PR = 1, want = { x: 0, y: 0, u: 100 }, cur = null, dirty = true;
    var forcedPR = /[?&]dpr=([\d.]+)/.exec(QS);
    var maxPR = forcedPR ? parseFloat(forcedPR[1]) : Math.min(window.devicePixelRatio || 1, MOBILE ? 2.5 : 2);

    function resize() {
      W = window.innerWidth; H = window.innerHeight;
      renderer.setPixelRatio(PR); renderer.setSize(W, H, false);
      camera.aspect = W / H; camera.updateProjectionMatrix();
      if (composer) { composer.dispose && composer.dispose(); }
      makeComposer(W, H, PR);
      dirty = true;
    }
    function freeRect() {
      var x0 = 0, x1 = W, y0 = 0, y1 = H;
      if (!compactMQ.matches) {
        var l = document.querySelector('.list'), ab = document.querySelector('.about');
        var lr = l && l.getBoundingClientRect(), ar = ab && ab.offsetParent !== null && ab.getBoundingClientRect();
        x0 = lr && lr.width ? lr.right + 28 : W * .27;
        x1 = ar && ar.width ? ar.left - 28 : W * .72;
        y0 = H * .06; y1 = H * .94;
      } else {
        var sh = document.querySelector('.sheet'), r = sh ? sh.getBoundingClientRect() : { width: W, height: 0, top: H, left: 0 };
        if (r.width < W * .7 && r.height > H * .8) { x1 = r.left; y0 = H * .05; y1 = H * .95 }
        else {
          y0 = Math.min(64, H * .12);
          var q = document.querySelector('.mq'), qr = q && q.offsetParent !== null ? q.getBoundingClientRect() : null;
          if (qr) y0 = Math.max(y0, qr.bottom + 8);
          y1 = r.top;
        }
      }
      y1 = Math.max(y1, y0 + 120); x1 = Math.max(x1, x0 + 120);
      return { x0: x0, x1: x1, y0: y0, y1: y1 };
    }
    function layout() {
      var f = freeRect(), fw = f.x1 - f.x0, fh = f.y1 - f.y0;
      var u = Math.min(fw / (2 * 2.25), fh / (2 * 1.32));    // píxeles por unidad: la cinta cabe en el hueco
      u = Math.min(u, H * .34);
      want.x = (f.x0 + f.x1) / 2; want.y = (f.y0 + f.y1) / 2; want.u = Math.max(u, 38);
      dirty = false;
    }
    window.addEventListener('resize', function () { resize(); });
    window.addEventListener('orientationchange', function () { setTimeout(resize, 250); });
    if (window.visualViewport) window.visualViewport.addEventListener('resize', function () { dirty = true; });
    var sheetEl = document.querySelector('.sheet');
    if (window.ResizeObserver && sheetEl) new ResizeObserver(function () { dirty = true; }).observe(sheetEl);
    if (compactMQ.addEventListener) compactMQ.addEventListener('change', function () { dirty = true; });

    /* ---------------- interacción ---------------- */
    var tg = { x: 0, y: 0 }, ptr = { x: 0, y: 0 }, near = 0, nearS = 0, pulse = 0, cx = 0, cy = 0, lastInput = 0;
    function setPtr(x, y) {
      tg.x = Math.max(-1, Math.min(1, x / W * 2 - 1)); tg.y = Math.max(-1, Math.min(1, y / H * 2 - 1));
      ptr.x = x; ptr.y = y; lastInput = performance.now();
    }
    window.addEventListener('pointermove', function (e) { setPtr(e.clientX, e.clientY); }, { passive: true });
    window.addEventListener('touchmove', function (e) { var t = e.touches[0]; if (t) setPtr(t.clientX, t.clientY); }, { passive: true });
    window.addEventListener('pointerdown', function (e) { setPtr(e.clientX, e.clientY); pulse = 1; }, { passive: true });
    document.addEventListener('pointerleave', function () { tg.x = 0; tg.y = 0; ptr.x = -9999; }, { passive: true });
    window.addEventListener('deviceorientation', function (e) {
      if (e.gamma == null) return;
      tg.x = Math.max(-1, Math.min(1, e.gamma / 30)); tg.y = Math.max(-1, Math.min(1, ((e.beta || 45) - 45) / 30)); lastInput = performance.now();
    }, { passive: true });

    /* ---------------- bucle ---------------- */
    PR = maxPR; resize();
    var clock = performance.now(), t = 0, frames = 0, accDt = 0, govN = 0, shown = false;
    var speedK = REDUCE ? 0.15 : 1, noGov = /[?&]nogov/.test(QS);

    renderer.setAnimationLoop(function (now) {
      var dt = Math.min(0.05, (now - clock) / 1000); clock = now; if (dt <= 0) return;
      t += dt * speedK;

      if (!REDUCE && now - lastInput > 3500) {                    // piloto automático suave
        tg.x = Math.sin(t * .4) * .55; tg.y = Math.cos(t * .31) * .35; ptr.x = -9999;
      }
      if (dirty) layout();
      if (!cur) cur = { x: want.x, y: want.y, u: want.u };
      var kk = 1 - Math.pow(.9, dt * 60);
      cur.x += (want.x - cur.x) * kk; cur.y += (want.y - cur.y) * kk; cur.u += (want.u - cur.u) * kk;

      var dist = Math.hypot(ptr.x - cur.x, ptr.y - cur.y);
      near = Math.max(0, 1 - dist / (cur.u * 2.4));
      cx += (tg.x - cx) * .05; cy += (tg.y - cy) * .05; nearS += (near - nearS) * .05; pulse *= .94;

      U.uTime.value = t * (1 + nearS * .7);
      U.uAmp.value = .065 + nearS * .06 + pulse * .1;

      var upp = 2 * Math.tan(camera.fov * Math.PI / 360) * CAMZ / H;      // unidades de mundo por píxel
      system.scale.setScalar(cur.u * upp);
      system.position.set((cur.x - W / 2) * upp, -(cur.y - H / 2) * upp, 0);
      system.rotation.y = cx * .36; system.rotation.x = cy * .24;
      floatG.position.y = Math.sin(t * .7) * .05;
      blobHolder.rotation.y = Math.sin(t * .25) * .25; blobHolder.rotation.z += dt * .04 * speedK;
      blobHolder.scale.setScalar(1 + nearS * .035 + pulse * .05);
      var boost = 1 + nearS * 1.1 + pulse * 2;
      for (var s = 0; s < strands.length; s++) strands[s].g.rotation.z += dt * strands[s].sp * boost * speedK;

      if (useBloom) composer.render(); else renderer.render(scene, camera);

      if (!shown) { shown = true; canvas.style.opacity = 1; window.__orbOK = true; document.documentElement.classList.add('orb-on'); }

      /* gobernador: si el equipo va lento, baja la resolución poco a poco */
      frames++;
      if (!noGov && frames > 40) {
        accDt += dt; govN++;
        if (govN >= 70) {
          var avg = accDt / govN; accDt = 0; govN = 0;
          if (avg > 0.030) {
            if (PR > 1.25) { PR = Math.max(1, PR - .5); resize(); }
            else if (useBloom) { useBloom = false; }
          }
        }
      }
    });
    canvas.style.transition = 'opacity 1.2s ease'; canvas.style.opacity = 0;
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); fail('contexto perdido'); });
  } catch (e) {
    fail(e && e.message);
  }
})();
