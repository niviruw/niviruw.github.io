// Minimal WebGL point cloud viewer: drag to orbit, scroll/pinch to zoom, double-click to reset.
// Point files: uint32 count, float32 framing radius, then count*3 int16 positions (normalized to [-1, 1]),
// then count*3 uint8 colors.
(function () {
  var VS = [
    'attribute vec3 pos;',
    'attribute vec3 col;',
    'uniform mat4 mvp;',
    'uniform float size;',
    'varying vec3 vCol;',
    'void main() {',
    '  gl_Position = mvp * vec4(pos, 1.0);',
    '  gl_PointSize = size / gl_Position.w;',
    '  vCol = col;',
    '}'
  ].join('\n');
  var FS = [
    'precision mediump float;',
    'varying vec3 vCol;',
    'void main() { gl_FragColor = vec4(vCol, 1.0); }'
  ].join('\n');

  function mul(a, b) {
    var o = new Float32Array(16);
    for (var c = 0; c < 4; c++)
      for (var r = 0; r < 4; r++)
        o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
  }
  function perspective(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  }
  function rotY(a) { var c = Math.cos(a), s = Math.sin(a); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); }
  function rotX(a) { var c = Math.cos(a), s = Math.sin(a); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); }
  function translateZ(z) { return new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, z, 1]); }

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  }

  window.createPointViewer = function (canvas) {
    var gl = canvas.getContext('webgl', { antialias: true, premultipliedAlpha: false });
    if (!gl) return null;

    var prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    gl.useProgram(prog);
    var aPos = gl.getAttribLocation(prog, 'pos');
    var aCol = gl.getAttribLocation(prog, 'col');
    var uMvp = gl.getUniformLocation(prog, 'mvp');
    var uSize = gl.getUniformLocation(prog, 'size');
    var posBuf = gl.createBuffer(), colBuf = gl.createBuffer();
    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);

    var count = 0, cache = {}, current = null;
    var DEFAULT = { yaw: 0, pitch: 0, dist: 2.6 };
    var yaw = DEFAULT.yaw, pitch = DEFAULT.pitch, dist = DEFAULT.dist, minDist = 0.3, maxDist = 8;
    var auto = true, t0 = performance.now(), frame = null;

    function resize() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
    }

    function draw() {
      frame = null;
      resize();
      if (auto) yaw = Math.sin((performance.now() - t0) / 2500) * 0.6;
      var aspect = canvas.width / Math.max(1, canvas.height);
      var model = mul(rotX(pitch), rotY(yaw));
      var mvp = mul(perspective(0.7, aspect, 0.1, 20), mul(translateZ(-dist), model));
      gl.uniformMatrix4fv(uMvp, false, mvp);
      gl.uniform1f(uSize, 2.2 * Math.min(window.devicePixelRatio || 1, 2) * DEFAULT.dist * (canvas.height / 500));
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      if (count) gl.drawArrays(gl.POINTS, 0, count);
      if (auto) request();
    }
    function request() { if (!frame) frame = requestAnimationFrame(draw); }

    function upload(buf) {
      var view = new DataView(buf);
      var n = view.getUint32(0, true), fit = view.getFloat32(4, true);
      var pos = new Int16Array(buf, 8, n * 3);
      var col = new Uint8Array(buf, 8 + n * 6, n * 3);
      // Frame the bulk of the points: distance so the fit radius fills most of the view
      DEFAULT.dist = fit / Math.tan(0.35) * 1.15;
      minDist = DEFAULT.dist * 0.2; maxDist = DEFAULT.dist * 4;
      if (auto) dist = DEFAULT.dist;
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 3, gl.SHORT, true, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, colBuf);
      gl.bufferData(gl.ARRAY_BUFFER, col, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(aCol);
      gl.vertexAttribPointer(aCol, 3, gl.UNSIGNED_BYTE, true, 0, 0);
      count = n;
      request();
    }

    // Drag to orbit, pinch or scroll to zoom
    var pointers = {}, lastPinch = 0;
    function stopAuto() { auto = false; }
    canvas.addEventListener('pointerdown', function (e) {
      canvas.setPointerCapture(e.pointerId);
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      stopAuto();
    });
    canvas.addEventListener('pointermove', function (e) {
      var p = pointers[e.pointerId];
      if (!p) return;
      var ids = Object.keys(pointers);
      if (ids.length === 1) {
        yaw += (e.clientX - p.x) * 0.008;
        pitch = Math.max(-1.4, Math.min(1.4, pitch + (e.clientY - p.y) * 0.008));
      }
      p.x = e.clientX; p.y = e.clientY;
      if (ids.length === 2) {
        var a = pointers[ids[0]], b = pointers[ids[1]];
        var d = Math.hypot(a.x - b.x, a.y - b.y);
        if (lastPinch) dist = Math.max(minDist, Math.min(maxDist, dist * lastPinch / d));
        lastPinch = d;
      }
      request();
    });
    function up(e) { delete pointers[e.pointerId]; lastPinch = 0; }
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      stopAuto();
      dist = Math.max(minDist, Math.min(maxDist, dist * Math.exp(e.deltaY * 0.001)));
      request();
    }, { passive: false });
    canvas.addEventListener('dblclick', function () {
      yaw = DEFAULT.yaw; pitch = DEFAULT.pitch; dist = DEFAULT.dist;
      auto = true; t0 = performance.now();
      request();
    });
    if (window.ResizeObserver) new ResizeObserver(request).observe(canvas);

    return {
      load: function (url) {
        current = url;
        count = 0;
        request();
        var p = cache[url] || (cache[url] = fetch(url).then(function (r) {
          if (!r.ok) throw new Error(r.status);
          return r.arrayBuffer();
        }));
        return p.then(function (buf) { if (current === url) upload(buf); });
      },
      prefetch: function (url) {
        if (!cache[url]) cache[url] = fetch(url).then(function (r) { return r.arrayBuffer(); });
      }
    };
  };
})();
