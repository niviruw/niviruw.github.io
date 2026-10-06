// Interactive 3D view of a recovered two-camera pose: camera frustums with their photos, the body point
// cloud and a floor grid. It orbits slowly on its own until you drag or zoom; double-click to reset (which also
// restarts the orbit). The orbit pauses off-screen and is off for prefers-reduced-motion. three.js is
// loaded only when the figure scrolls into view; until then (or without WebGL) the static image shows.
// data-scenes maps state names to scene.json files; the root's data-state picks which one is shown, so the
// page can switch states (e.g. before/after bundle adjustment) without reloading the viewer. Changing
// data-scenes (e.g. to another example) loads the new files on demand; loaded scenes are cached.
// Add ?view to the page URL to show the current view and a button to copy it.
(function () {
  var root = document.querySelector('.pose-viewer');
  if (!root) return;
  // 'three' resolves through the import map in the page head (OrbitControls imports it by that name)
  var THREE_URL = 'three';
  var ORBIT_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js';
  var FT = 3.28084;
  var sceneUrls = JSON.parse(root.dataset.scenes);

  function start() {
    var probe = document.createElement('canvas');
    if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) return;
    var names = Object.keys(sceneUrls);
    Promise.all([import(THREE_URL), import(ORBIT_URL)].concat(names.map(function (n) {
      return fetch(sceneUrls[n]).then(function (r) { return r.json(); });
    }))).then(function (m) {
      var data = {};
      names.forEach(function (n, i) { data[sceneUrls[n]] = m[2 + i]; });
      build(m[0], m[1].OrbitControls, data);
    }).catch(function () {});
  }

  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      if (es.some(function (e) { return e.isIntersecting; })) { io.disconnect(); start(); }
    }, { rootMargin: '300px' });
    io.observe(root);
  } else {
    start();
  }

  function isDark() {
    var t = document.documentElement.getAttribute('data-theme');
    return t ? t === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function build(THREE, OrbitControls, allData) {
    var canvas = document.createElement('canvas');
    canvas.setAttribute('aria-label', 'Interactive 3D view of the recovered cameras and the person');
    root.insertBefore(canvas, root.firstChild);
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(36, 1.6, 0.05, 200);
    var controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.minDistance = 2;
    controls.maxDistance = 30;
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var autoWanted = !reduceMotion, onScreen = true;
    controls.autoRotateSpeed = 2.5;
    function syncAuto() { controls.autoRotate = autoWanted && onScreen; render(); }
    controls.addEventListener('start', function () { autoWanted = false; syncAuto(); });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { onScreen = es[es.length - 1].isIntersecting; syncAuto(); }).observe(canvas);
    }

    var loader = new THREE.TextureLoader();
    var themed = [];  // { m: material, light, dark }
    var labels = [];  // { sprite, text }
    var grids = [];
    var greyPoints = [];
    function themedColour(mat, light, dark) { themed.push({ m: mat, light: light, dark: dark }); return mat; }

    // scene.json: camera-1 axes with y flipped to point up; flip z too so the frame stays right-handed
    function fix(p) { return [p[0], p[1], -p[2]]; }

    function makeState(data, url) {
      var base = url.replace(/[^/]*$/, '');
      var group = new THREE.Group();
      var body = data.body.map(fix);
      var cams = data.cams.map(function (c) {
        return { name: c.name, height: c.height_ft, image: c.image, apex: fix(c.apex), corners: c.corners.map(fix) };
      });
      var fy = data.floor_y;
      var centre = body.reduce(function (a, p) { return [a[0] + p[0], a[1] + p[1], a[2] + p[2]]; }, [0, 0, 0])
        .map(function (v) { return v / body.length; });

      // floor grid covering the scene (0.5 m cells)
      var xs = body.map(function (p) { return p[0]; }).concat(cams.map(function (c) { return c.apex[0]; }));
      var zs = body.map(function (p) { return p[2]; }).concat(cams.map(function (c) { return c.apex[2]; }));
      var span = Math.max(Math.max.apply(null, xs) - Math.min.apply(null, xs), Math.max.apply(null, zs) - Math.min.apply(null, zs));
      var size = Math.ceil((span + 3) / 0.5) * 0.5;
      var grid = new THREE.GridHelper(size, size / 0.5);
      grid.position.set((Math.max.apply(null, xs) + Math.min.apply(null, xs)) / 2, fy,
        (Math.max.apply(null, zs) + Math.min.apply(null, zs)) / 2);
      group.add(grid);
      grids.push(grid);

      var pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.Float32BufferAttribute([].concat.apply([], body), 3));
      // per-point colours sampled from the photos (sRGB in scene.json; three.js works in linear colour)
      var hasColours = Array.isArray(data.colors) && data.colors.length === body.length;
      if (hasColours) {
        var col = new THREE.Color(), lin = [];
        data.colors.forEach(function (c) { col.setRGB(c[0] / 255, c[1] / 255, c[2] / 255, THREE.SRGBColorSpace); lin.push(col.r, col.g, col.b); });
        pg.setAttribute('color', new THREE.Float32BufferAttribute(lin, 3));
      }
      var pointMat = new THREE.PointsMaterial({ size: hasColours ? 0.035 : 0.025, vertexColors: hasColours });
      if (!hasColours) greyPoints.push(pointMat);
      group.add(new THREE.Points(pg, pointMat));

      cams.forEach(function (cam, i) {
        var light = i ? 0xeb6834 : 0x2a78d6, dark = i ? 0xd95926 : 0x3987e5;
        var A = new THREE.Vector3().fromArray(cam.apex);
        var C = cam.corners.map(function (p) { return new THREE.Vector3().fromArray(p); });  // TL, TR, BR, BL
        var pts = [];
        C.forEach(function (c, k) { pts.push(A, c, c, C[(k + 1) % 4]); });
        group.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts),
          themedColour(new THREE.LineBasicMaterial(), light, dark)));
        var q = new THREE.BufferGeometry();
        q.setAttribute('position', new THREE.Float32BufferAttribute(
          [].concat(C[3].toArray(), C[2].toArray(), C[1].toArray(), C[0].toArray()), 3));
        q.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
        q.setIndex([0, 1, 2, 0, 2, 3]);
        var tex = loader.load(base + cam.image, function () { render(); });
        tex.colorSpace = THREE.SRGBColorSpace;
        group.add(new THREE.Mesh(q, new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })));
        var dot = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), themedColour(new THREE.MeshBasicMaterial(), light, dark));
        dot.position.copy(A);
        group.add(dot);
        var foot = new THREE.Vector3(A.x, fy, A.z);
        var drop = new THREE.Line(new THREE.BufferGeometry().setFromPoints([foot, A]),
          themedColour(new THREE.LineDashedMaterial({ dashSize: 0.08, gapSize: 0.06 }), light, dark));
        drop.computeLineDistances();
        group.add(drop);
        var s = new THREE.Sprite(new THREE.SpriteMaterial({ depthTest: false, transparent: true }));
        s.position.set(A.x, fy - 0.4, A.z);
        s.renderOrder = 10;
        s.scale.set(2.4, 2.4 * 160 / 512, 1);
        group.add(s);
        labels.push({ sprite: s, text: cam.name + '\n' + cam.height.toFixed(1) + ' ft high' });
      });

      scene.add(group);
      // what must stay in view: the body (camera frustums and labels may go out of frame at some angles)
      var keep = body.filter(function (_, k) { return k % 10 === 0; }).map(function (p) { return new THREE.Vector3().fromArray(p); });
      var sphere = new THREE.Box3().setFromPoints(keep).getBoundingSphere(new THREE.Sphere());
      // tighten the box's sphere to the farthest kept point from its centre
      sphere.radius = Math.sqrt(Math.max.apply(null, keep.map(function (v) { return v.distanceToSquared(sphere.center); })));
      return { group: group, cams: cams, fy: fy, target: new THREE.Vector3(centre[0], centre[1], centre[2]), sphere: sphere };
    }

    var states = {};  // by scene.json URL
    Object.keys(allData).forEach(function (url) { states[url] = makeState(allData[url], url); });
    function current() {
      return states[sceneUrls[root.dataset.state]] || states[sceneUrls[Object.keys(sceneUrls)[0]]];
    }
    function showState() {
      var cur = current();
      Object.keys(states).forEach(function (u) { states[u].group.visible = states[u] === cur; });
      render();
    }
    // a new set of scenes (another example): load what isn't cached, then show it from the default view
    function changeScenes() {
      sceneUrls = JSON.parse(root.dataset.scenes);
      Object.keys(states).forEach(function (u) { states[u].group.visible = false; });
      var missing = Object.keys(sceneUrls).map(function (n) { return sceneUrls[n]; })
        .filter(function (u) { return !states[u]; });
      Promise.all(missing.map(function (u) {
        return fetch(u).then(function (r) { return r.json(); }).then(function (d) { states[u] = makeState(d, u); });
      })).then(function () { applyTheme(); showState(); reset(); });
    }

    function paintLabels(ink) {
      var font = getComputedStyle(document.body).fontFamily;
      labels.forEach(function (l) {
        var c = document.createElement('canvas');
        c.width = 512; c.height = 160;
        var x = c.getContext('2d');
        x.fillStyle = ink;
        x.font = '48px ' + font;
        x.textAlign = 'center';
        l.text.split('\n').forEach(function (t, k) { x.fillText(t, 256, 60 + k * 58); });
        if (l.sprite.material.map) l.sprite.material.map.dispose();
        var t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        l.sprite.material.map = t;
        l.sprite.material.needsUpdate = true;
      });
    }

    function applyTheme() {
      var dark = isDark();
      var gridCol = new THREE.Color(dark ? 0x3a3833 : 0xd6d2c8);
      grids.forEach(function (g) {
        [].concat(g.material).forEach(function (m) { m.color = gridCol; m.vertexColors = false; m.needsUpdate = true; });
      });
      greyPoints.forEach(function (m) { m.color.set(dark ? 0xa19f98 : 0x8f8d87); });
      themed.forEach(function (t) { t.m.color.set(dark ? t.dark : t.light); });
      paintLabels(getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || (dark ? '#e9e6df' : '#000'));
      render();
    }

    // starting view: from camera 1's side, looking down at the middle of the scene. Camera 1 is the same in
    // every state, so the view stays put when switching states.
    var DEFAULT = root.dataset.view ? JSON.parse(root.dataset.view) : null;
    function reset() {
      if (DEFAULT) {
        camera.position.fromArray(DEFAULT.position);
        controls.target.fromArray(DEFAULT.target);
      } else {
        var st = current(), target = st.target;
        var c1 = new THREE.Vector3().fromArray(st.cams[0].apex).sub(target).setY(0).normalize()
          .applyAxisAngle(new THREE.Vector3(0, 1, 0), 0.6);
        // distance at which the body's bounding sphere fits the narrower field of view with room around it, so the
        // person stays in frame from every angle of the orbit
        var aspect = canvas.clientWidth / Math.max(1, canvas.clientHeight) || camera.aspect;
        var vfov = THREE.MathUtils.degToRad(camera.fov);
        var hfov = 2 * Math.atan(Math.tan(vfov / 2) * aspect);
        var d = 1.6 * st.sphere.radius / Math.sin(Math.min(vfov, hfov) / 2);
        // ...but orbit outside the cameras, so a camera's photo never sits between the viewer and the body
        var ring = Math.max.apply(null, st.cams.map(function (c) {
          return Math.hypot(c.apex[0] - st.sphere.center.x, c.apex[2] - st.sphere.center.z);
        }));
        d = Math.max(d, (ring + 0.6) / Math.cos(0.38));
        var mid = st.sphere.center.clone();
        camera.position.copy(mid).addScaledVector(c1, d * Math.cos(0.38)).add(new THREE.Vector3(0, d * Math.sin(0.38), 0));
        controls.target.copy(mid);
      }
      controls.update();
      autoWanted = !reduceMotion;
      syncAuto();
    }

    var frame = 0;
    function render() {
      if (frame) return;
      frame = requestAnimationFrame(function () {
        frame = 0;
        var w = canvas.clientWidth, h = canvas.clientHeight;
        if (canvas.width !== Math.round(w * renderer.getPixelRatio())) {
          renderer.setSize(w, h, false);
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
        }
        if (controls.update()) render();
        renderer.render(scene, camera);
        if (readout) readout.textContent = describe().text;
      });
    }
    controls.addEventListener('change', render);
    canvas.addEventListener('dblclick', reset);
    if (window.ResizeObserver) new ResizeObserver(render).observe(canvas);
    new MutationObserver(applyTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
    new MutationObserver(showState).observe(root, { attributes: true, attributeFilter: ['data-state'] });
    new MutationObserver(changeScenes).observe(root, { attributes: true, attributeFilter: ['data-scenes'] });

    // ?view: show the current view and a button to copy it (used to choose the starting view)
    var readout = null;
    if (/[?&]view\b/.test(location.search)) {
      var panel = document.createElement('div');
      panel.className = 'pose-viewer-readout';
      readout = document.createElement('pre');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Copy view';
      btn.addEventListener('click', function () {
        var txt = JSON.stringify(describe().json);
        (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () {
          btn.textContent = 'Copied';
        }, function () { readout.textContent = txt; }).then(function () {
          setTimeout(function () { btn.textContent = 'Copy view'; }, 1500);
        });
      });
      panel.appendChild(readout);
      panel.appendChild(btn);
      root.appendChild(panel);
    }
    function describe() {
      var st = current();
      var off = camera.position.clone().sub(controls.target);
      var dist = off.length();
      var down = Math.asin(off.y / dist) * 180 / Math.PI;
      var c1 = new THREE.Vector3().fromArray(st.cams[0].apex).sub(st.target).setY(0).normalize();
      var c2 = new THREE.Vector3().fromArray(st.cams[1].apex).sub(st.target).setY(0).normalize();
      var h = off.clone().setY(0).normalize();
      var around = Math.acos(Math.max(-1, Math.min(1, h.dot(c1)))) * 180 / Math.PI;
      if (Math.sign(c1.clone().cross(h).y) !== (Math.sign(c1.clone().cross(c2).y) || 1)) around = -around;
      var json = {
        position: camera.position.toArray().map(function (v) { return +v.toFixed(3); }),
        target: controls.target.toArray().map(function (v) { return +v.toFixed(3); })
      };
      return {
        json: json,
        text: 'eye ' + ((camera.position.y - st.fy) * FT).toFixed(1) + ' ft high, ' + (dist * FT).toFixed(1) + ' ft from target\n' +
          'looking down ' + down.toFixed(0) + '°, ' + around.toFixed(0) + '° around from camera 1 towards camera 2'
      };
    }

    root.classList.add('is-live');
    applyTheme();
    showState();
    reset();
  }
})();
