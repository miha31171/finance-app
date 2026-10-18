/* Самописные SVG-графики без библиотек */
var Charts = (function () {
  function f(n) { return Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : Math.abs(n) >= 1e3 ? (n / 1e3).toFixed(0) + 'k' : n.toFixed(Math.abs(n) < 10 ? 2 : 0); }
  var W = 760, H = 260, L = 50, B = 24, T = 10, R = 10;
  function frame(min, max, labels) {
    var s = '', i; for (i = 0; i <= 4; i++) { var v = min + (max - min) * i / 4, y = H - B - (H - B - T) * i / 4; s += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y + '" y2="' + y + '" stroke="#eee"/><text x="' + (L - 4) + '" y="' + (y + 4) + '" text-anchor="end">' + f(v) + '</text>'; }
    var step = Math.max(1, Math.ceil(labels.length / 10));
    labels.forEach(function (l, i) { if (i % step) return; var x = L + (W - L - R) * (labels.length > 1 ? i / (labels.length - 1) : .5); s += '<text x="' + x + '" y="' + (H - 6) + '" text-anchor="middle">' + l + '</text>'; });
    return s;
  }
  /* series: [{data:[num|null], color, width, dash}], bands: [{lo:[],hi:[],color}] */
  function line(labels, series, bands, legend) {
    var all = []; series.concat((bands || []).map(function (b) { return { data: b.lo.concat(b.hi) }; })).forEach(function (s) { s.data.forEach(function (v) { if (v != null && isFinite(v)) all.push(v); }); });
    if (!all.length) return '<p class="muted">Нет данных для графика</p>';
    var min = Math.min.apply(null, all), max = Math.max.apply(null, all); if (min === max) { min -= 1; max += 1; } var pad = (max - min) * .05; min -= pad; max += pad;
    var n = labels.length; function X(i) { return L + (W - L - R) * (n > 1 ? i / (n - 1) : .5); } function Y(v) { return H - B - (H - B - T) * (v - min) / (max - min); }
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%">' + frame(min, max, labels);
    (bands || []).forEach(function (b) { var p = b.hi.map(function (v, i) { return X(i) + ',' + Y(v); }).concat(b.lo.map(function (v, i) { return X(i) + ',' + Y(v); }).reverse()); s += '<polygon points="' + p.join(' ') + '" fill="' + b.color + '" stroke="none"/>'; });
    series.forEach(function (se) { var d = '', pen = false; se.data.forEach(function (v, i) { if (v == null || !isFinite(v)) { pen = false; return; } d += (pen ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); pen = true; }); s += '<path d="' + d + '" fill="none" stroke="' + se.color + '" stroke-width="' + (se.width || 1.5) + '"' + (se.dash ? ' stroke-dasharray="4 3"' : '') + '/>'; });
    s += '</svg>'; if (legend) s += '<div class="muted">' + legend.map(function (l) { return '<span style="color:' + l[1] + '">■</span> ' + l[0]; }).join(' &nbsp; ') + '</div>';
    return s;
  }
  function bars(labels, groups) { /* groups: [{name,color,data}] */
    var all = [0]; groups.forEach(function (g) { all = all.concat(g.data); }); var max = Math.max.apply(null, all) || 1, n = labels.length, gw = (W - L - R) / Math.max(n, 1), bw = gw * .8 / groups.length;
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%">' + frame(0, max, []);
    labels.forEach(function (l, i) { groups.forEach(function (g, k) { var v = g.data[i] || 0, h = (H - B - T) * v / max, x = L + gw * i + gw * .1 + bw * k; s += '<rect x="' + x + '" y="' + (H - B - h) + '" width="' + (bw - 1) + '" height="' + h + '" fill="' + g.color + '"><title>' + g.name + ': ' + v.toFixed(0) + '</title></rect>'; }); s += '<text x="' + (L + gw * i + gw / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + l + '</text>'; });
    return s + '</svg><div class="muted">' + groups.map(function (g) { return '<span style="color:' + g.color + '">■</span> ' + g.name; }).join(' &nbsp; ') + '</div>';
  }
  var PAL = ['#3b5bdb', '#f08c00', '#2f9e44', '#c92a2a', '#7048e8', '#1098ad', '#e64980', '#868e96', '#5c940d', '#d9480f'];
  function donut(items) { /* [{name,value}] */
    var tot = items.reduce(function (a, b) { return a + Math.max(0, b.value); }, 0); if (!tot) return '<p class="muted">Нет данных</p>';
    var a0 = -Math.PI / 2, s = '<svg viewBox="0 0 220 220" width="220" style="float:left;margin-right:12px">', leg = '';
    items.forEach(function (it, i) { var fr = Math.max(0, it.value) / tot, a1 = a0 + fr * 2 * Math.PI, c = PAL[i % PAL.length];
      if (fr >= .9999) s += '<circle cx="110" cy="110" r="90" fill="' + c + '"/>'; else s += '<path d="M110 110 L' + (110 + 90 * Math.cos(a0)) + ' ' + (110 + 90 * Math.sin(a0)) + ' A90 90 0 ' + (fr > .5 ? 1 : 0) + ' 1 ' + (110 + 90 * Math.cos(a1)) + ' ' + (110 + 90 * Math.sin(a1)) + 'Z" fill="' + c + '"/>';
      leg += '<div><span style="color:' + c + '">■</span> ' + it.name + ' — ' + (fr * 100).toFixed(1) + '%</div>'; a0 = a1; });
    return s + '<circle cx="110" cy="110" r="50" fill="#fff"/></svg>' + leg + '<div style="clear:both"></div>';
  }
  return { line: line, bars: bars, donut: donut, PAL: PAL };
})();
