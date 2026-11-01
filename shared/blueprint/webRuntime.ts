/**
 * Browser code embedded verbatim in exported web components: a small WebGL viewer with no dependencies.
 * It reads `DESIGN` (see exportWebComponent) and uses the same clip rules as the Studio viewport.
 */
export const WEB_VIEWER_RUNTIME = String.raw`
function decode(b64) {
  var s = atob(b64), bytes = new Uint8Array(s.length);
  for (var i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return new Float32Array(bytes.buffer);
}
function perspective(fov, aspect, near, far) {
  var f = 1 / Math.tan(fov / 2), nf = 1 / (near - far);
  return [f / aspect,0,0,0, 0,f,0,0, 0,0,(far + near) * nf,-1, 0,0,2 * far * near * nf,0];
}
function lookAt(e, c, u) {
  var z = norm([e[0]-c[0], e[1]-c[1], e[2]-c[2]]), x = norm(cross(u, z)), y = cross(z, x);
  return [x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0,
    -dot(x,e),-dot(y,e),-dot(z,e),1];
}
function mul(a, b) {
  var o = new Array(16);
  for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++)
    o[c*4+r] = a[r]*b[c*4] + a[4+r]*b[c*4+1] + a[8+r]*b[c*4+2] + a[12+r]*b[c*4+3];
  return o;
}
function cross(a, b) { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
function dot(a, b) { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
function norm(a) { var l = Math.sqrt(dot(a,a)) || 1; return [a[0]/l,a[1]/l,a[2]/l]; }
function rotation(deg) {
  var r = Math.PI/180, cx=Math.cos(deg.x*r), sx=Math.sin(deg.x*r), cy=Math.cos(deg.y*r), sy=Math.sin(deg.y*r), cz=Math.cos(deg.z*r), sz=Math.sin(deg.z*r);
  return [cz*cy, sz*cy, -sy, 0,
    cz*sy*sx-sz*cx, sz*sy*sx+cz*cx, cy*sx, 0,
    cz*sy*cx+sz*sx, sz*sy*cx-cz*sx, cy*cx, 0,
    0,0,0,1];
}
function phaseOf(clip, t) {
  var u = (t % clip.durationSeconds) / clip.durationSeconds;
  var tri = u < 0.5 ? u * 2 : 2 - u * 2;
  return tri * tri * (3 - 2 * tri);
}

var VS = 'attribute vec3 p;attribute vec3 n;uniform mat4 vp;uniform mat4 m;varying vec3 vn;varying vec3 vw;' +
  'void main(){vec4 w=m*vec4(p,1.);vw=w.xyz;vn=mat3(m[0].xyz,m[1].xyz,m[2].xyz)*n;gl_Position=vp*w;}';
var FS = 'precision mediump float;uniform vec3 c;uniform vec3 eye;uniform float metal;uniform float rough;varying vec3 vn;varying vec3 vw;' +
  'void main(){vec3 N=normalize(vn);vec3 V=normalize(eye-vw);vec3 L=normalize(vec3(.45,-.6,.75));vec3 H=normalize(L+V);' +
  'float d=max(dot(N,L),0.);float hemi=.5+.5*N.z;float s=pow(max(dot(N,H),0.),mix(90.,12.,rough))*mix(.25,.9,metal)*(1.-rough*.7);' +
  'vec3 col=c*(.34+.3*hemi+.62*d)+vec3(s);gl_FragColor=vec4(pow(col,vec3(.92)),1.);}';

var CSS = ':host{display:block;position:relative;min-height:240px;background:#fff;font:14px system-ui,sans-serif;color:#1f2430}' +
  'canvas{position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab}' +
  '.bar{position:absolute;left:10px;bottom:10px;display:flex;flex-wrap:wrap;gap:6px;align-items:center}' +
  'button{min-height:36px;padding:4px 12px;border:1px solid #1f2430;border-radius:8px;background:#fff;font:600 13px system-ui,sans-serif;cursor:pointer;color:inherit}' +
  'button[aria-pressed=true]{background:#1f2430;color:#fff}' +
  '.none{position:absolute;inset:0;display:grid;place-content:center;padding:16px;text-align:center}';

function Viewer(host) {
  var root = host.attachShadow({ mode: 'open' });
  root.innerHTML = '<style>' + CSS + '</style><canvas part="canvas" role="img"></canvas><div class="bar" part="controls"></div>';
  var canvas = root.querySelector('canvas');
  canvas.setAttribute('aria-label', 'Interactive 3D model of ' + DESIGN.name);
  var bar = root.querySelector('.bar');
  var gl = canvas.getContext('webgl', { antialias: true, preserveDrawingBuffer: true });
  if (!gl) {
    var none = document.createElement('p');
    none.className = 'none';
    none.textContent = '3D preview needs WebGL. ' + DESIGN.name + ': ' + DESIGN.dimensions.width + ' x ' + DESIGN.dimensions.depth + ' x ' + DESIGN.dimensions.height + ' mm';
    root.appendChild(none);
    canvas.remove();
    return;
  }
  function shader(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
  var prog = gl.createProgram();
  gl.attachShader(prog, shader(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  gl.enable(gl.DEPTH_TEST);
  gl.enable(gl.CULL_FACE);
  var U = {};
  ['vp','m','c','eye','metal','rough'].forEach(function (u) { U[u] = gl.getUniformLocation(prog, u); });
  var aP = gl.getAttribLocation(prog, 'p'), aN = gl.getAttribLocation(prog, 'n');
  gl.enableVertexAttribArray(aP);
  gl.enableVertexAttribArray(aN);

  var min = [Infinity,Infinity,Infinity], max = [-Infinity,-Infinity,-Infinity];
  var parts = DESIGN.parts.map(function (part) {
    var pos = decode(part.positions), nor = decode(part.normals);
    for (var i = 0; i < pos.length; i++) { var k = i % 3; if (pos[i] < min[k]) min[k] = pos[i]; if (pos[i] > max[k]) max[k] = pos[i]; }
    var pb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, pb); gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
    var nb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, nb); gl.bufferData(gl.ARRAY_BUFFER, nor, gl.STATIC_DRAW);
    var cx = 0, cy = 0, cz = 0, n = pos.length / 3;
    for (var j = 0; j < pos.length; j += 3) { cx += pos[j]; cy += pos[j+1]; cz += pos[j+2]; }
    return { src: part, pb: pb, nb: nb, center: [cx/n, cy/n, cz/n] };
  });
  var target = [(min[0]+max[0])/2, (min[1]+max[1])/2, (min[2]+max[2])/2];
  var radius = Math.sqrt(Math.pow(max[0]-min[0],2)+Math.pow(max[1]-min[1],2)+Math.pow(max[2]-min[2],2)) / 2 || 1;
  var state = { yaw: -0.65, pitch: 0.5, dist: radius * 3, spin: !!DESIGN.interaction.turntable, explode: 0, clip: null, start: 0 };
  var reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) state.spin = false;

  function button(label, onClick) {
    var b = document.createElement('button');
    b.type = 'button'; b.textContent = label; b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', function () { onClick(b); kick(); });
    bar.appendChild(b);
    return b;
  }
  if (DESIGN.interaction.turntable) {
    var spinBtn = button('Spin', function (b) { state.spin = !state.spin; b.setAttribute('aria-pressed', String(state.spin)); });
    spinBtn.setAttribute('aria-pressed', String(state.spin));
  }
  if (DESIGN.interaction.explodedView && parts.length > 1) {
    button('Exploded view', function (b) { state.explode = state.explode ? 0 : 1; b.setAttribute('aria-pressed', String(!!state.explode)); });
  }
  DESIGN.animations.forEach(function (clip) {
    button(clip.name, function (b) {
      var on = state.clip !== clip;
      state.clip = on ? clip : null;
      state.start = performance.now();
      Array.prototype.forEach.call(bar.querySelectorAll('button[data-clip]'), function (o) { o.setAttribute('aria-pressed', 'false'); });
      b.setAttribute('aria-pressed', String(on));
    }).setAttribute('data-clip', clip.name);
  });

  var drag = null;
  canvas.addEventListener('pointerdown', function (e) { drag = [e.clientX, e.clientY]; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', function (e) {
    if (!drag) return;
    state.yaw -= (e.clientX - drag[0]) * 0.008;
    state.pitch = Math.max(-1.45, Math.min(1.45, state.pitch + (e.clientY - drag[1]) * 0.008));
    drag = [e.clientX, e.clientY];
    kick();
  });
  canvas.addEventListener('pointerup', function () { drag = null; });
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    state.dist = Math.max(radius * 1.2, Math.min(radius * 8, state.dist * (e.deltaY > 0 ? 1.1 : 0.9)));
    kick();
  }, { passive: false });

  var running = false, last = 0, shown = 0;
  function kick() { if (!running) { running = true; last = performance.now(); requestAnimationFrame(frame); } }
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (state.spin && !drag) state.yaw += dt * 0.5;
    shown += (state.explode - shown) * Math.min(1, dt * 7);
    draw(now);
    var settling = Math.abs(state.explode - shown) > 0.001;
    if (state.spin || state.clip || settling) requestAnimationFrame(frame); else running = false;
  }
  function draw(now) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    var eye = [
      target[0] + state.dist * Math.cos(state.pitch) * Math.sin(state.yaw),
      target[1] - state.dist * Math.cos(state.pitch) * Math.cos(state.yaw),
      target[2] + state.dist * Math.sin(state.pitch),
    ];
    var vp = mul(perspective(0.7, w / h, radius * 0.05, radius * 30), lookAt(eye, target, [0,0,1]));
    gl.uniformMatrix4fv(U.vp, false, vp);
    gl.uniform3fv(U.eye, eye);
    var phase = state.clip ? phaseOf(state.clip, (now - state.start) / 1000) : 0;
    parts.forEach(function (part) {
      var off = { x: 0, y: 0, z: 0 }, rot = { x: 0, y: 0, z: 0 };
      if (state.clip) state.clip.tracks.forEach(function (t) {
        if (t.componentId !== part.src.id) return;
        (t.property === 'translate' ? off : rot)[t.axis] += t.from + (t.to - t.from) * phase;
      });
      var ex = shown * 0.6;
      var tx = off.x + (part.center[0] - target[0]) * ex, ty = off.y + (part.center[1] - target[1]) * ex, tz = off.z + (part.center[2] - target[2]) * ex;
      var r = rotation(rot), o = part.src.rest;
      // Spin about the part's own origin, then apply the offset.
      var pivot = [1,0,0,0, 0,1,0,0, 0,0,1,0, o.x,o.y,o.z,1], back = [1,0,0,0, 0,1,0,0, 0,0,1,0, -o.x,-o.y,-o.z,1], move = [1,0,0,0, 0,1,0,0, 0,0,1,0, tx,ty,tz,1];
      gl.uniformMatrix4fv(U.m, false, mul(move, mul(pivot, mul(r, back))));
      gl.uniform3fv(U.c, part.src.color);
      gl.uniform1f(U.metal, part.src.metal);
      gl.uniform1f(U.rough, part.src.rough);
      gl.bindBuffer(gl.ARRAY_BUFFER, part.pb); gl.vertexAttribPointer(aP, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, part.nb); gl.vertexAttribPointer(aN, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.TRIANGLES, 0, part.src.count);
    });
  }
  if (window.ResizeObserver) new ResizeObserver(kick).observe(host);
  else window.addEventListener('resize', kick);
  kick();
}

if (!customElements.get('vdraw-model')) {
  customElements.define('vdraw-model', class extends HTMLElement {
    connectedCallback() { if (!this.shadowRoot) new Viewer(this); }
  });
}
`;
