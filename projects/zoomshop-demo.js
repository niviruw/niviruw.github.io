// Live ZoomShop editor: click to select a depth layer, then scale it.
// Scaling X and Y of points in a depth range is the same as scaling their image coordinates
// about the image center, so each render is a forward splat with a depth test plus a hole fill.
(function () {
  var FEATHER = 0.04; // disparity width over which the edit fades out at the edges of the selection

  function loadImage(src) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = reject;
      img.src = src;
    });
  }

  function pixels(img) {
    var c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    var ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, c.width, c.height).data;
  }

  // Push-pull hole filling: average valid pixels into a pyramid, then fill holes from coarser levels.
  function pushPull(rgb, w, W, H) {
    var levels = [{ rgb: rgb, w: w, W: W, H: H }];
    while (levels[levels.length - 1].W > 1 || levels[levels.length - 1].H > 1) {
      var p = levels[levels.length - 1];
      var nW = Math.max(1, Math.ceil(p.W / 2)), nH = Math.max(1, Math.ceil(p.H / 2));
      var nrgb = new Float32Array(nW * nH * 3), nw = new Float32Array(nW * nH);
      for (var y = 0; y < p.H; y++) {
        for (var x = 0; x < p.W; x++) {
          var i = y * p.W + x, wi = p.w[i];
          if (!wi) continue;
          var j = (y >> 1) * nW + (x >> 1);
          nw[j] += wi;
          nrgb[j * 3] += p.rgb[i * 3] * wi;
          nrgb[j * 3 + 1] += p.rgb[i * 3 + 1] * wi;
          nrgb[j * 3 + 2] += p.rgb[i * 3 + 2] * wi;
        }
      }
      for (var k = 0; k < nW * nH; k++) {
        if (nw[k]) { nrgb[k * 3] /= nw[k]; nrgb[k * 3 + 1] /= nw[k]; nrgb[k * 3 + 2] /= nw[k]; nw[k] = Math.min(1, nw[k]); }
      }
      levels.push({ rgb: nrgb, w: nw, W: nW, H: nH });
    }
    // Pull: fill holes by bilinearly sampling the coarser level (avoids blocky patches)
    for (var l = levels.length - 2; l >= 0; l--) {
      var f = levels[l], c = levels[l + 1];
      for (var yy = 0; yy < f.H; yy++) {
        var sy = Math.min(c.H - 1, Math.max(0, (yy + 0.5) / 2 - 0.5));
        var y0 = Math.floor(sy), y1 = Math.min(c.H - 1, y0 + 1), ty = sy - y0;
        for (var xx = 0; xx < f.W; xx++) {
          var a = yy * f.W + xx, fw = f.w[a];
          if (fw >= 1) continue;
          var sx = Math.min(c.W - 1, Math.max(0, (xx + 0.5) / 2 - 0.5));
          var x0 = Math.floor(sx), x1 = Math.min(c.W - 1, x0 + 1), tx = sx - x0;
          var i00 = (y0 * c.W + x0) * 3, i01 = (y0 * c.W + x1) * 3, i10 = (y1 * c.W + x0) * 3, i11 = (y1 * c.W + x1) * 3;
          for (var ch = 0; ch < 3; ch++) {
            var top = c.rgb[i00 + ch] * (1 - tx) + c.rgb[i01 + ch] * tx;
            var bot = c.rgb[i10 + ch] * (1 - tx) + c.rgb[i11 + ch] * tx;
            f.rgb[a * 3 + ch] = f.rgb[a * 3 + ch] * fw + (top * (1 - ty) + bot * ty) * (1 - fw);
          }
          f.w[a] = 1;
        }
      }
    }
  }

  window.createZoomShop = function (canvas) {
    var ctx = canvas.getContext('2d');
    var W = 0, H = 0, src = null, disp = null, out = null, zbuf = null, rgb = null, wgt = null, sel = null;
    var state = { dq: 0.1, tol: 0.1, scale: 1.5, showSel: false, original: false };
    var pending = false;

    function weight(d) {
      var dist = Math.abs(d - state.dq) - state.tol;
      if (dist <= 0) return 1;
      return dist >= FEATHER ? 0 : 1 - dist / FEATHER;
    }

    function render() {
      pending = false;
      if (!src) return;
      if (state.original) {
        out.data.set(src);
        ctx.putImageData(out, 0, 0);
        return;
      }
      var cx = W / 2, cy = H / 2;
      zbuf.fill(-1);
      wgt.fill(0);
      sel.fill(0);
      // Per-level lookup: weight for each of the 256 disparity values
      var wl = new Float32Array(256);
      for (var q = 0; q < 256; q++) wl[q] = weight(q / 255);
      for (var y = 0; y < H; y++) {
        for (var x = 0; x < W; x++) {
          var i = y * W + x, dq = disp[i * 4], d = dq / 255, wi = wl[dq];
          var s = 1 + (state.scale - 1) * wi;
          var x0 = Math.floor(cx + s * (x - cx)), x1 = Math.floor(cx + s * (x + 1 - cx)) - 1;
          var y0 = Math.floor(cy + s * (y - cy)), y1 = Math.floor(cy + s * (y + 1 - cy)) - 1;
          if (x1 < x0) x1 = x0;
          if (y1 < y0) y1 = y0;
          if (x0 < 0) x0 = 0;
          if (y0 < 0) y0 = 0;
          if (x1 >= W) x1 = W - 1;
          if (y1 >= H) y1 = H - 1;
          for (var ty = y0; ty <= y1; ty++) {
            for (var tx = x0; tx <= x1; tx++) {
              var j = ty * W + tx;
              if (d <= zbuf[j]) continue; // larger disparity = nearer
              zbuf[j] = d;
              rgb[j * 3] = src[i * 4];
              rgb[j * 3 + 1] = src[i * 4 + 1];
              rgb[j * 3 + 2] = src[i * 4 + 2];
              wgt[j] = 1;
              sel[j] = wi > 0.5 ? 1 : 0;
            }
          }
        }
      }
      pushPull(rgb, wgt, W, H);
      var o = out.data;
      for (var k = 0; k < W * H; k++) {
        var r = rgb[k * 3], g = rgb[k * 3 + 1], b = rgb[k * 3 + 2];
        if (state.showSel && sel[k]) { r = r * 0.6; g = g * 0.6 + 255 * 0.4; b = b * 0.6; }
        o[k * 4] = r; o[k * 4 + 1] = g; o[k * 4 + 2] = b; o[k * 4 + 3] = 255;
      }
      ctx.putImageData(out, 0, 0);
    }

    function request() {
      if (!pending) { pending = true; requestAnimationFrame(render); }
    }

    var loadId = 0;
    return {
      load: function (imageUrl, dispUrl) {
        var id = ++loadId;
        return Promise.all([loadImage(imageUrl), loadImage(dispUrl)]).then(function (imgs) {
          if (id !== loadId) return; // a newer scene was requested while this one loaded
          W = imgs[0].naturalWidth; H = imgs[0].naturalHeight;
          canvas.width = W; canvas.height = H;
          src = pixels(imgs[0]);
          disp = pixels(imgs[1]);
          out = ctx.createImageData(W, H);
          zbuf = new Float32Array(W * H).fill(-1);
          rgb = new Float32Array(W * H * 3);
          wgt = new Float32Array(W * H);
          sel = new Uint8Array(W * H);
          request();
        });
      },
      // Select the depth of whatever is visible at a point given in [0, 1] canvas coordinates.
      // With fromSource, read the unedited depth map instead (used for presets).
      pick: function (fx, fy, fromSource) {
        if (!disp) return;
        var x = Math.min(W - 1, Math.max(0, Math.floor(fx * W)));
        var y = Math.min(H - 1, Math.max(0, Math.floor(fy * H)));
        var i = y * W + x;
        state.dq = !fromSource && !state.original && zbuf[i] >= 0 ? zbuf[i] : disp[i * 4] / 255;
        request();
      },
      set: function (key, value) { state[key] = value; request(); }
    };
  };
})();
