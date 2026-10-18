/* Ядро: парсеры выписок, категоризация, финансовая математика. Работает в браузере и в Node. */
(function (root) {
'use strict';
var C = {};
C.decode = function (buf) {
  var u8 = new Uint8Array(buf);
  if (u8[0] === 0xEF && u8[1] === 0xBB && u8[2] === 0xBF) u8 = u8.subarray(3);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(u8); }
  catch (e) { return new TextDecoder('windows-1251').decode(u8); }
};
C.parseAmount = function (s) {
  if (typeof s === 'number') return s;
  if (s == null) return NaN;
  s = String(s).replace(/[\s\u00a0\u202f]/g, '').replace(/[^\d,.\-+−]/g, '').replace('−', '-');
  if (!s) return NaN;
  if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else s = s.replace(',', '.');
  return parseFloat(s);
};
C.parseDate = function (s) {
  if (!s) return null; s = String(s).trim(); var m;
  if ((m = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})/))) { var y = +m[3]; if (y < 100) y += 2000; return y + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2); }
  if ((m = s.match(/^(\d{4})-?(\d{2})-?(\d{2})/))) return m[1] + '-' + m[2] + '-' + m[3];
  return null;
};
C.splitCSV = function (text, d) {
  var rows = [], row = [], f = '', q = false;
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === d) { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); f = ''; if (row.some(function (x) { return x.trim(); })) rows.push(row); row = []; }
    else f += c;
  }
  row.push(f); if (row.some(function (x) { return x.trim(); })) rows.push(row);
  return rows;
};
C.detectDelimiter = function (text) {
  var lines = text.split(/\r?\n/).slice(0, 10).join('\n'), best = ',', bc = -1;
  [';', ',', '\t'].forEach(function (d) { var n = C.splitCSV(lines, d).reduce(function (a, r) { return a + r.length; }, 0); if (n > bc) { bc = n; best = d; } });
  return best;
};
var MAP = {
  date: ['дата операции', 'дата', 'date', 'дата платежа', 'дата проводки'],
  amount: ['сумма операции', 'сумма в валюте счета', 'сумма платежа', 'сумма', 'amount'],
  income: ['приход', 'поступление', 'зачисление'], expense: ['расход', 'списание'],
  currency: ['валюта операции', 'валюта счета', 'валюта', 'currency'],
  description: ['описание операции', 'описание', 'назначение', 'description', 'контрагент', 'name'],
  category: ['категория', 'category'], status: ['статус', 'status']
};
function findCol(h, keys) { for (var k = 0; k < keys.length; k++) for (var i = 0; i < h.length; i++) if (h[i] === keys[k]) return i; for (k = 0; k < keys.length; k++) for (i = 0; i < h.length; i++) if (h[i].indexOf(keys[k]) === 0) return i; return -1; }
C.parseCSV = function (text) {
  var d = C.detectDelimiter(text), rows = C.splitCSV(text, d), hi = -1, h;
  for (var i = 0; i < Math.min(rows.length, 30); i++) { var hh = rows[i].map(function (x) { return x.trim().toLowerCase().replace(/ё/g, 'е'); }); if (findCol(hh, MAP.date) >= 0 && (findCol(hh, MAP.amount) >= 0 || findCol(hh, MAP.income) >= 0)) { hi = i; h = hh; break; } }
  if (hi < 0) throw new Error('Не найдена строка заголовков (нужны колонки «Дата» и «Сумма»/«Приход»/«Расход»)');
  var col = {}; Object.keys(MAP).forEach(function (k) { col[k] = findCol(h.map(function (x) { return x.replace(/е/g, 'е'); }), MAP[k].map(function (x) { return x.replace(/ё/g, 'е'); })); });
  var out = [];
  rows.slice(hi + 1).forEach(function (r) {
    var date = C.parseDate(r[col.date]); if (!date) return;
    if (col.status >= 0 && /fail|отклон|отмен/i.test(r[col.status] || '')) return;
    var amt;
    if (col.amount >= 0) amt = C.parseAmount(r[col.amount]);
    else { var inc = C.parseAmount(r[col.income]) || 0, exp = C.parseAmount(r[col.expense]) || 0; amt = inc - Math.abs(exp); }
    if (isNaN(amt)) return;
    out.push({ date: date, amount: amt, currency: col.currency >= 0 ? (r[col.currency] || '').trim().toUpperCase().replace('RUR', 'RUB') || null : null,
      description: col.description >= 0 ? (r[col.description] || '').trim() : '', category: col.category >= 0 ? (r[col.category] || '').trim() : '' });
  });
  return { delimiter: d, transactions: out };
};
C.parseOFX = function (text) {
  var cur = (text.match(/<CURDEF>\s*([A-Z]{3})/) || [])[1] || null, acct = (text.match(/<ACCTID>\s*([^<\r\n]+)/) || [])[1];
  var out = [], re = /<STMTTRN>([\s\S]*?)(<\/STMTTRN>|(?=<STMTTRN>)|(?=<\/BANKTRANLIST>))/gi, m;
  function g(b, t) { var x = b.match(new RegExp('<' + t + '>\\s*([^<\\r\\n]*)', 'i')); return x ? x[1].trim() : ''; }
  while ((m = re.exec(text))) { var b = m[1], a = C.parseAmount(g(b, 'TRNAMT')), dt = C.parseDate(g(b, 'DTPOSTED')); if (!dt || isNaN(a)) continue;
    out.push({ date: dt, amount: a, currency: cur, description: [g(b, 'NAME'), g(b, 'MEMO')].filter(Boolean).join(' — '), category: '' }); }
  return { currency: cur, account: acct, transactions: out };
};
C.parseJSON = function (text) {
  var j = JSON.parse(text);
  if (j && j.app === 'finance-local') return { backup: j };
  var arr = Array.isArray(j) ? j : (j.transactions || []);
  return { transactions: arr.map(function (t) { return { date: C.parseDate(t.date), amount: C.parseAmount(t.amount), currency: t.currency || null, description: t.description || t.desc || '', category: t.category || '' }; }).filter(function (t) { return t.date && !isNaN(t.amount); }) };
};
C.parseFile = function (name, buf) {
  var text = C.decode(buf), n = name.toLowerCase();
  if (/\.(ofx|qfx)$/.test(n) || /<OFX>/i.test(text)) return Object.assign({ format: 'OFX' }, C.parseOFX(text));
  if (/\.json$/.test(n) || /^\s*[\[{]/.test(text)) return Object.assign({ format: 'JSON' }, C.parseJSON(text));
  return Object.assign({ format: 'CSV' }, C.parseCSV(text));
};
C.DEFAULT_RULES = [
  ['Продукты', 'пятерочка, перекресток, магнит, ашан, лента, вкусвилл, дикси, азбука вкуса, metro, супермаркет, продукты, самокат'],
  ['Кафе и рестораны', 'кафе, ресторан, кофе, coffee, макдоналдс, вкусно и точка, kfc, бургер, шоколадница, яндекс еда, delivery club, пицца'],
  ['Транспорт', 'метро, такси, яндекс go, uber, ситимобил, тройка, ржд, аэрофлот, азс, лукойл, газпромнефть, роснефть, парковка'],
  ['Связь и интернет', 'мтс, билайн, мегафон, теле2, ростелеком, интернет'],
  ['ЖКХ', 'жкх, квартплата, мосэнерго, электроэнергия, водоканал, управляющая'],
  ['Здоровье', 'аптека, клиника, стоматолог, медси, инвитро, гемотест'],
  ['Подписки и развлечения', 'кинопоиск, ivi, okko, spotify, яндекс плюс, кино, театр, steam, playstation'],
  ['Одежда и товары', 'ozon, озон, wildberries, вайлдберриз, lamoda, спортмастер, леруа, ikea, dns, м.видео, эльдорадо'],
  ['Переводы', 'перевод, сбп'],
  ['Зарплата', 'зарплата, заработная, аванс, salary'],
  ['Проценты и кэшбэк', 'проценты, кэшбэк, cashback, капитализация']
];
C.categorize = function (t, rules) {
  var d = (t.description || '').toLowerCase().replace(/ё/g, 'е');
  for (var i = 0; i < rules.length; i++) { var ws = rules[i][1].split(',').map(function (w) { return w.trim().toLowerCase().replace(/ё/g, 'е'); }).filter(Boolean);
    for (var k = 0; k < ws.length; k++) if (d.indexOf(ws[k]) >= 0) return rules[i][0]; }
  return t.category || (t.amount > 0 ? 'Прочие доходы' : 'Прочее');
};
C.monthly = function (txs, cur) {
  var m = {}; txs.forEach(function (t) { if (cur && t.currency !== cur) return; if (t.category === 'Переводы между счетами') return; var k = t.date.slice(0, 7); m[k] = m[k] || { inc: 0, exp: 0 }; if (t.amount > 0) m[k].inc += t.amount; else m[k].exp -= t.amount; });
  return m;
};
/* ---- инвестиционная математика ---- */
C.returns = function (p) { var r = []; for (var i = 1; i < p.length; i++) if (p[i - 1] > 0) r.push(Math.log(p[i] / p[i - 1])); return r; };
C.mean = function (a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : 0; };
C.std = function (a) { var m = C.mean(a); return a.length > 1 ? Math.sqrt(a.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / (a.length - 1)) : 0; };
C.maxDrawdown = function (p) { var pk = -Infinity, md = 0; p.forEach(function (x) { pk = Math.max(pk, x); md = Math.min(md, x / pk - 1); }); return md; };
C.sma = function (p, n) { return p.map(function (_, i) { if (i < n - 1) return null; var s = 0; for (var k = i - n + 1; k <= i; k++) s += p[k]; return s / n; }); };
/* статистика по ряду дневных цен: годовая доходность (лог->простая), волатильность, просадка, моментум */
C.stats = function (p, perYear) {
  perYear = perYear || 252; var r = C.returns(p), mu = C.mean(r), sd = C.std(r);
  function mom(n) { return p.length > n ? p[p.length - 1] / p[p.length - 1 - n] - 1 : null; }
  var s200 = C.sma(p, Math.min(200, p.length)), s50 = C.sma(p, Math.min(50, p.length));
  return { n: p.length, annRet: Math.exp(mu * perYear) - 1, annVol: sd * Math.sqrt(perYear), mdd: C.maxDrawdown(p),
    mom1m: mom(Math.round(perYear / 12)), mom3m: mom(Math.round(perYear / 4)), mom6m: mom(Math.round(perYear / 2)), mom12m: mom(perYear - 1),
    aboveSma200: p[p.length - 1] > s200[s200.length - 1], sma50over200: s50[s50.length - 1] > s200[s200.length - 1], muD: mu, sdD: sd };
};
C.rng = function (seed) { var s = seed >>> 0 || 1; return function () { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; };
C.gauss = function (rnd) { var u = 0, v = 0; while (u === 0) u = rnd(); v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
/* Монте-Карло: геометрическое броуновское движение по месяцам, взносы ежемесячно */
C.monteCarlo = function (o) {
  var rnd = C.rng(o.seed || 42), months = o.months, paths = o.paths || 2000, muM = Math.log(1 + o.annRet) / 12, sdM = o.annVol / Math.sqrt(12);
  var res = []; for (var m = 0; m <= months; m++) res.push([]);
  for (var p = 0; p < paths; p++) { var v = o.start; res[0].push(v); for (m = 1; m <= months; m++) { v = v * Math.exp(muM - sdM * sdM / 2 + sdM * C.gauss(rnd)) + (o.monthly || 0); res[m].push(v); } }
  function q(a, x) { var i = (a.length - 1) * x, lo = Math.floor(i); return a[lo] + (a[Math.min(lo + 1, a.length - 1)] - a[lo]) * (i - lo); }
  return res.map(function (a, m) { a.sort(function (x, y) { return x - y; }); return { m: m, p5: q(a, .05), p25: q(a, .25), p50: q(a, .5), p75: q(a, .75), p95: q(a, .95), invested: o.start + (o.monthly || 0) * m }; });
};
C.riskProfile = function (ans) { var s = ans.reduce(function (a, b) { return a + (+b || 0); }, 0); return s <= 5 ? { key: 'cons', name: 'Консервативный', maxVol: .18, eq: .2, bonds: .7, cash: .1, crypto: 0 } : s <= 10 ? { key: 'mod', name: 'Умеренный', maxVol: .32, eq: .5, bonds: .4, cash: .05, crypto: .05 } : { key: 'agg', name: 'Агрессивный', maxVol: 1, eq: .75, bonds: .15, cash: 0, crypto: .1 }; };
/* Скоринг идеи: прозрачная формула */
C.score = function (s, profile) {
  var mom = (s.mom6m || 0) * .5 + (s.mom3m || 0) * .3 + (s.mom12m || 0) * .2;
  var volPenalty = profile.key === 'cons' ? 1.5 : profile.key === 'mod' ? 0.8 : 0.3;
  return mom - volPenalty * s.annVol * 0.5 + 0.5 * s.mdd * (profile.key === 'agg' ? 0.3 : 1) + (s.aboveSma200 ? .05 : -.05) + (s.divYield ? s.divYield * (profile.key === 'agg' ? .5 : 1.5) : 0);
};
C.rebalance = function (holdings, target) { /* holdings: {cls: value}, target: {cls: share} */
  var tot = Object.keys(holdings).reduce(function (a, k) { return a + holdings[k]; }, 0);
  return Object.keys(target).map(function (k) { var cur = holdings[k] || 0, want = tot * target[k]; return { cls: k, cur: cur, curShare: tot ? cur / tot : 0, target: target[k], diff: want - cur }; });
};
if (typeof module !== 'undefined') module.exports = C; else root.Core = C;
})(this);
