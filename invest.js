/* Инвестиции: публичные котировки (только чтение), портфель, прогноз, идеи. Никакие личные данные не отправляются. */
var Market = (function () {
  var CK = 'finance-market-cache', cache = {}; try { cache = JSON.parse(localStorage.getItem(CK)) || {}; } catch (e) {}
  function put(k, d, src) { cache[k] = { ts: Date.now(), d: d, src: src || 'live' }; try { localStorage.setItem(CK, JSON.stringify(cache)); } catch (e) { cache = {}; cache[k] = { ts: Date.now(), d: d }; localStorage.setItem(CK, JSON.stringify(cache)); } }
  /* GET без cookies и без каких-либо параметров пользователя; при ошибке — последний кэш */
  function get(url, key, ttlH, transform) {
    var c = cache[key]; if (c && c.src !== 'manual' && Date.now() - c.ts < (ttlH || 6) * 3600e3) return Promise.resolve(c.d);
    return fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (j) { var d = transform(j); if (d == null || (Array.isArray(d) && !d.length)) throw new Error('пустой ответ'); put(key, d); return d; })
      .catch(function (e) { if (c) { c.stale = true; return c.d; } throw e; });
  }
  function rows(block) { return block.data.map(function (r) { var o = {}; block.columns.forEach(function (c, i) { o[c] = r[i]; }); return o; }); }
  function from(days) { return new Date(Date.now() - days * 864e5).toISOString().slice(0, 10); }
  var M = 'https://iss.moex.com/iss/engines/stock/markets/';
  return {
    cache: cache, put: put, age: function (k) { return cache[k] ? cache[k] : null; },
    cbr: function () { return get('https://www.cbr-xml-daily.ru/daily_json.js', 'cbr', 6, function (j) { return j.Valute; }); },
    /* ряд дневных закрытий [[date, close]] */
    history: function (kind, t) {
      if (cache['manual:' + t]) return Promise.resolve(cache['manual:' + t].d);
      if (kind === 'crypto') return get('https://api.coingecko.com/api/v3/coins/' + encodeURIComponent(t) + '/market_chart?vs_currency=rub&days=365&interval=daily', 'h:' + t, 6, function (j) { return j.prices.map(function (p) { return [new Date(p[0]).toISOString().slice(0, 10), p[1]]; }); });
      var mk = kind === 'index' ? 'index' : 'shares';
      return get(M + mk + '/securities/' + encodeURIComponent(t) + '/candles.json?interval=24&iss.meta=off&candles.columns=begin,close&from=' + from(380), 'h:' + t, 6, function (j) { return j.candles.data.map(function (r) { return [r[0].slice(0, 10), r[1]]; }); });
    },
    bonds: function () { return get(M + 'bonds/boards/TQOB/securities.json?iss.meta=off&iss.only=securities,marketdata&securities.columns=SECID,SHORTNAME,MATDATE,COUPONPERCENT,FACEVALUE,PREVPRICE,FACEUNIT&marketdata.columns=SECID,LAST,YIELD,DURATION', 'bonds', 6, function (j) {
      var md = {}; rows(j.marketdata).forEach(function (r) { md[r.SECID] = r; }); return rows(j.securities).map(function (s) { var m = md[s.SECID] || {}; return { secid: s.SECID, name: s.SHORTNAME, mat: s.MATDATE, coupon: s.COUPONPERCENT, face: s.FACEVALUE, unit: s.FACEUNIT, pricePct: m.LAST || s.PREVPRICE, yield: m.YIELD, duration: m.DURATION }; }); }); },
    /* ручной импорт CSV: date;ticker;close */
    importPrices: function (text) { var rs = Core.splitCSV(text, Core.detectDelimiter(text)), by = {}, n = 0;
      rs.forEach(function (r) { var d = Core.parseDate(r[0]), v = Core.parseAmount(r[2]); if (!d || isNaN(v) || !r[1]) return; var t = r[1].trim(); (by[t] = by[t] || []).push([d, v]); n++; });
      Object.keys(by).forEach(function (t) { put('manual:' + t, by[t].sort(function (a, b) { return a[0] < b[0] ? -1 : 1; }), 'manual'); }); return { tickers: Object.keys(by), rows: n }; }
  };
})();

var Invest = (function () {
  var UNIVERSE = {
    share: [['SBER', 'Сбербанк'], ['GAZP', 'Газпром'], ['LKOH', 'Лукойл'], ['ROSN', 'Роснефть'], ['NVTK', 'Новатэк'], ['GMKN', 'Норникель'], ['YDEX', 'Яндекс'], ['TATN', 'Татнефть'], ['MGNT', 'Магнит'], ['PLZL', 'Полюс'], ['CHMF', 'Северсталь'], ['NLMK', 'НЛМК'], ['MTSS', 'МТС'], ['MOEX', 'Мосбиржа'], ['T', 'Т-Технологии'], ['VTBR', 'ВТБ'], ['ALRS', 'Алроса'], ['PHOR', 'ФосАгро'], ['SNGSP', 'Сургутнефтегаз-п'], ['X5', 'X5']],
    etf: [['TMOS', 'БПИФ на индекс Мосбиржи (Т)'], ['SBMX', 'БПИФ на индекс Мосбиржи (Сбер)'], ['TGLD', 'БПИФ на золото (Т)'], ['SBGB', 'БПИФ гособлигации (Сбер)'], ['LQDT', 'Фонд ликвидности (ВИМ)'], ['TBRU', 'БПИФ облигации (Т)']],
    crypto: [['bitcoin', 'Bitcoin'], ['ethereum', 'Ethereum'], ['solana', 'Solana'], ['the-open-network', 'Toncoin']]
  };
  var KIND = { share: 'Акции', etf: 'Фонды (БПИФ)', bond: 'Облигации', crypto: 'Криптовалюта', cash: 'Кэш/вклады', index: 'Индекс' };
  var stats = {}, bondsList = null, log = [];
  /* точек в году по факту (MOEX торгует и в выходные с 2025 г.) */
  function perYear(h) { var d = (new Date(h[h.length - 1][0]) - new Date(h[0][0])) / 3.156e10; return d > 0.2 ? Math.round((h.length - 1) / d) : 252; }
  function last(h) { return h && h.length ? h[h.length - 1][1] : null; }
  function loadOne(kind, t, name) { return Market.history(kind, t).then(function (h) { var s = Core.stats(h.map(function (x) { return x[1]; }), perYear(h)); s.kind = kind; s.t = t; s.name = name || t; s.h = h; s.price = last(h); s.asOf = h[h.length - 1][0]; var c = Market.age('h:' + t); s.src = cache2src(t); stats[t] = s; return s; }).catch(function (e) { log.push(t + ': ' + e.message); return null; }); }
  function cache2src(t) { var m = Market.age('manual:' + t); if (m) return 'ручной CSV'; var c = Market.age('h:' + t); return c ? (c.stale ? 'кэш от ' + new Date(c.ts).toLocaleString('ru-RU') : 'онлайн, ' + new Date(c.ts).toLocaleTimeString('ru-RU')) : '—'; }
  function seq(tasks) { return tasks.reduce(function (p, f) { return p.then(function (acc) { return f().then(function (r) { acc.push(r); return acc; }); }); }, Promise.resolve([])); }
  function loadAll(progress) {
    log = []; var tasks = [function () { return loadOne('index', 'IMOEX', 'Индекс Мосбиржи'); }];
    ['share', 'etf'].forEach(function (k) { UNIVERSE[k].forEach(function (u) { tasks.push(function () { return loadOne(k, u[0], u[1]); }); }); });
    UNIVERSE.crypto.forEach(function (u) { tasks.push(function () { return loadOne('crypto', u[0], u[1]); }); });
    S.holdings.forEach(function (h) { if (h.kind !== 'cash' && h.kind !== 'bond' && !stats[h.ticker]) tasks.push(function () { return loadOne(h.kind, h.ticker); }); });
    tasks.push(function () { return Market.bonds().then(function (b) { bondsList = b; }).catch(function (e) { log.push('ОФЗ: ' + e.message); }); });
    var i = 0; return seq(tasks.map(function (f) { return function () { return f().then(function (r) { progress && progress(++i, tasks.length); return r; }); }; }));
  }
  function holdingValue(h) {
    if (h.kind === 'cash') return { price: +h.buy, value: +h.buy * +h.qty };
    if (h.kind === 'bond') { var b = (bondsList || []).find(function (x) { return x.secid === h.ticker; }); if (!b || !b.pricePct) return { price: null, value: null }; var p = b.pricePct / 100 * b.face; return { price: p, value: p * h.qty, bond: b }; }
    var s = stats[h.ticker]; return s ? { price: s.price, value: s.price * h.qty, s: s } : { price: null, value: null };
  }
  /* ---------- Рынок ---------- */
  function renderMarket() {
    var el = $('#market'), idx = stats.IMOEX;
    var tbl = function (kind) { return '<table><tr><th>Инструмент</th><th class="num">Цена</th><th class="num">1 мес</th><th class="num">3 мес</th><th class="num">12 мес</th><th class="num">Волат.</th><th class="num">Макс. просадка</th><th>Тренд</th><th class="muted">Источник</th></tr>' +
      Object.keys(stats).map(function (k) { return stats[k]; }).filter(function (s) { return s.kind === kind; }).map(function (s) { return '<tr><td><a href="#" class="pick" data-t="' + esc(s.t) + '">' + esc(s.name) + '</a> <span class="muted">' + esc(s.t) + '</span></td><td class="num">' + fmt(s.price) + '</td>' + [s.mom1m, s.mom3m, s.mom12m].map(function (v) { return '<td class="num ' + (v >= 0 ? 'pos' : 'neg') + '">' + pct(v) + '</td>'; }).join('') + '<td class="num">' + pct(s.annVol) + '</td><td class="num neg">' + pct(s.mdd) + '</td><td>' + (s.aboveSma200 ? '↑ выше SMA200' : '↓ ниже SMA200') + '</td><td class="muted">' + esc(s.src) + '</td></tr>'; }).join('') + '</table>'; };
    var sel = el._sel || 'IMOEX', ss = stats[sel];
    var chart = ss ? (function () { var p = ss.h.map(function (x) { return x[1]; }); return '<h3>' + esc(ss.name) + ': цена и скользящие средние</h3>' + Charts.line(ss.h.map(function (x) { return x[0].slice(5); }), [{ data: p, color: '#1d2b4f' }, { data: Core.sma(p, 50), color: '#f08c00', dash: 1 }, { data: Core.sma(p, 200), color: '#c92a2a', dash: 1 }], null, [['Цена', '#1d2b4f'], ['SMA50', '#f08c00'], ['SMA200', '#c92a2a']]) + '<p class="muted">Если SMA50 выше SMA200 и цена выше SMA200 — восходящий тренд (технический индикатор, не сигнал к сделке).</p>'; })() : '';
    var bonds = (bondsList || []).filter(function (b) { return b.yield && b.unit === 'SUR'; }).sort(function (a, b) { return a.mat < b.mat ? -1 : 1; });
    el.innerHTML = '<div class="card"><div class="row"><button id="mLoad">Обновить котировки</button><span id="mProg" class="muted"></span></div><p class="muted">Данные: MOEX ISS (акции, БПИФ, ОФЗ, IMOEX), ЦБ РФ через cbr-xml-daily.ru (валюты), CoinGecko (крипто). Запросы только на чтение публичных котировок; ваши данные не передаются. При недоступности сети используется последний кэш. Возможна задержка данных MOEX (бесплатный доступ ~15 мин).</p>' +
      '<div class="row">Ручной импорт цен (CSV «дата;тикер;цена»): <input type="file" id="mCsv" accept=".csv,.txt"> <span class="muted">напр. samples/ПРИМЕР_prices.csv</span></div>' + (log.length ? '<div class="neg muted">Ошибки: ' + esc(log.join('; ')) + '</div>' : '') + '</div>' +
      (idx ? '<div class="grid"><div class="card"><h3>IMOEX</h3><div class="big">' + fmt(idx.price) + '</div><div>12 мес: <b class="' + (idx.mom12m >= 0 ? 'pos' : 'neg') + '">' + pct(idx.mom12m) + '</b>, волатильность ' + pct(idx.annVol) + '</div><div class="muted">на ' + idx.asOf + '</div></div><div class="card" id="mFx"><h3>Курсы ЦБ</h3>…</div></div>' : '') +
      '<div class="card">' + chart + '</div><div class="card"><h3>Акции</h3>' + tbl('share') + '</div><div class="card"><h3>Фонды</h3>' + tbl('etf') + '</div><div class="card"><h3>Криптовалюта (в ₽)</h3>' + tbl('crypto') + '</div>' +
      '<div class="card"><h3>ОФЗ (рублёвые)</h3><table><tr><th>Выпуск</th><th>Погашение</th><th class="num">Купон</th><th class="num">Цена, %</th><th class="num">Доходность</th><th class="num">Дюрация, дн</th></tr>' + bonds.map(function (b) { return '<tr><td>' + esc(b.name) + ' <span class="muted">' + b.secid + '</span></td><td>' + b.mat + '</td><td class="num">' + (b.coupon || 0).toFixed(2) + '%</td><td class="num">' + fmt(b.pricePct) + '</td><td class="num">' + (+b.yield).toFixed(2) + '%</td><td class="num">' + (b.duration || '—') + '</td></tr>'; }).join('') + '</table></div>';
    $('#mLoad').onclick = function () { $('#mLoad').disabled = true; loadAll(function (i, n) { $('#mProg').textContent = 'Загрузка ' + i + '/' + n; }).then(function () { renderInvestAll(); toast('Котировки обновлены'); }); };
    $('#mCsv').onchange = function () { var f = this.files[0]; f && f.arrayBuffer().then(function (b) { var r = Market.importPrices(Core.decode(b)); toast('Импортировано ' + r.rows + ' цен: ' + r.tickers.join(', ')); r.tickers.forEach(function (t) { delete stats[t]; }); Promise.all(r.tickers.map(function (t) { return loadOne(t === 'IMOEX' ? 'index' : 'share', t, t); })).then(renderInvestAll); }); };
    el.querySelectorAll('.pick').forEach(function (a) { a.onclick = function (e) { e.preventDefault(); el._sel = a.dataset.t; renderMarket(); }; });
    if ($('#mFx')) Market.cbr().then(function (v) { $('#mFx').innerHTML = '<h3>Курсы ЦБ</h3>' + ['USD', 'EUR', 'CNY'].map(function (c) { return v[c] ? '<div>' + c + ': <b>' + fmt(v[c].Value / v[c].Nominal) + ' ₽</b></div>' : ''; }).join(''); }).catch(function () { $('#mFx').innerHTML = '<h3>Курсы ЦБ</h3><p class="muted">недоступно</p>'; });
  }
  /* ---------- Портфель ---------- */
  function portfolio() { var items = S.holdings.map(function (h) { var v = holdingValue(h); return Object.assign({ h: h, cost: h.qty * h.buy }, v); }), tot = items.reduce(function (a, b) { return a + (b.value || 0); }, 0); return { items: items, total: tot }; }
  function renderPortfolio() {
    var P = portfolio(), byKind = {}; P.items.forEach(function (i) { byKind[i.h.kind] = (byKind[i.h.kind] || 0) + (i.value || 0); });
    var cost = P.items.reduce(function (a, b) { return a + (b.value != null ? b.cost : 0); }, 0);
    $('#portfolio').innerHTML = '<div class="card"><h3>Добавить позицию</h3><div class="row"><select id="pKind"><option value="share">Акция</option><option value="etf">Фонд (БПИФ)</option><option value="bond">Облигация (ISIN/SECID, ОФЗ)</option><option value="crypto">Крипто (id CoinGecko: bitcoin)</option><option value="cash">Кэш/вклад (сумма в «цене»)</option></select><input id="pT" placeholder="Тикер, напр. SBER" size="14"><input id="pQ" placeholder="Кол-во" size="8"><input id="pB" placeholder="Цена покупки, ₽" size="12"><button id="pAdd">Добавить</button></div><p class="muted">Для облигаций цена — в рублях за 1 бумагу. Все значения — в рублях. Позиции хранятся только в браузере.</p></div>' +
      '<div class="grid"><div class="card"><h3>Стоимость портфеля</h3><div class="big">' + fmt(P.total, 'RUB') + '</div><div>Вложено: ' + fmt(cost, 'RUB') + '</div><div>P&amp;L: <b class="' + (P.total - cost >= 0 ? 'pos' : 'neg') + '">' + fmt(P.total - cost, 'RUB') + ' (' + pct(cost ? P.total / cost - 1 : null) + ')</b></div>' + (P.items.some(function (i) { return i.value == null; }) ? '<p class="neg muted">Для части позиций нет котировок — нажмите «Обновить котировки» на вкладке «Рынок».</p>' : '') + '</div>' +
      '<div class="card"><h3>Распределение по классам</h3>' + Charts.donut(Object.keys(byKind).map(function (k) { return { name: KIND[k], value: byKind[k] }; })) + '</div></div>' +
      '<div class="card"><table><tr><th>Класс</th><th>Инструмент</th><th class="num">Кол-во</th><th class="num">Цена покупки</th><th class="num">Тек. цена</th><th class="num">Стоимость</th><th class="num">P&amp;L</th><th class="num">Доля</th><th></th></tr>' + P.items.map(function (i) { var pl = i.value != null ? i.value - i.cost : null; return '<tr><td>' + KIND[i.h.kind] + (i.h.demo ? ' <span class="demo">демо</span>' : '') + '</td><td>' + esc(i.h.ticker) + '</td><td class="num">' + i.h.qty + '</td><td class="num">' + fmt(+i.h.buy) + '</td><td class="num">' + fmt(i.price) + '</td><td class="num">' + fmt(i.value) + '</td><td class="num ' + (pl >= 0 ? 'pos' : 'neg') + '">' + fmt(pl) + ' (' + pct(pl != null && i.cost ? pl / i.cost : null) + ')</td><td class="num">' + pct(P.total ? (i.value || 0) / P.total : null) + '</td><td><button class="sec pdel" data-id="' + i.h.id + '">✕</button></td></tr>'; }).join('') + '</table></div>';
    $('#pAdd').onclick = function () { var k = $('#pKind').value, t = $('#pT').value.trim(), q = Core.parseAmount($('#pQ').value), b = Core.parseAmount($('#pB').value); if (!t || isNaN(q) || isNaN(b)) return toast('Заполните тикер, количество и цену'); S.holdings.push({ id: uid(), kind: k, ticker: k === 'crypto' ? t.toLowerCase() : k === 'cash' ? t : t.toUpperCase(), qty: q, buy: b }); save();
      var p = (k === 'bond' && !bondsList) ? Market.bonds().then(function (x) { bondsList = x; }) : (k === 'share' || k === 'etf' || k === 'crypto') ? loadOne(k, k === 'crypto' ? t.toLowerCase() : t.toUpperCase()) : Promise.resolve(); p.catch(function () {}).then(renderInvestAll); };
    $('#portfolio').querySelectorAll('.pdel').forEach(function (b) { b.onclick = function () { S.holdings = S.holdings.filter(function (h) { return h.id !== b.dataset.id; }); save(); renderInvestAll(); }; });
  }
  /* Оценка доходности/риска портфеля: ряд стоимости рисковой части по общим датам + фикс. доходность облигаций/кэша */
  function portfolioParams() {
    var P = portfolio(), risky = P.items.filter(function (i) { return i.s && i.value; }), fixed = P.items.filter(function (i) { return !i.s && i.value; });
    var riskyVal = risky.reduce(function (a, b) { return a + b.value; }, 0), fixedVal = fixed.reduce(function (a, b) { return a + b.value; }, 0), tot = riskyVal + fixedVal;
    var fixedRet = fixedVal ? fixed.reduce(function (a, i) { return a + i.value * ((i.bond && i.bond.yield ? i.bond.yield : (S.invest.cashRate || 12)) / 100); }, 0) / fixedVal : 0;
    var rr = 0, rv = 0, note = '';
    if (risky.length) { var maps = risky.map(function (i) { var m = {}; i.s.h.forEach(function (x) { m[x[0]] = x[1]; }); return m; }); var dates = Object.keys(maps[0]).filter(function (d) { return maps.every(function (m) { return m[d] != null; }); }).sort();
      if (dates.length > 30) { var ser = dates.map(function (d) { return risky.reduce(function (a, i, k) { return a + i.h.qty * maps[k][d]; }, 0); }); var st = Core.stats(ser, perYear(dates.map(function (d, i) { return [d, ser[i]]; }))); rr = st.annRet; rv = st.annVol; note = 'по ' + dates.length + ' общим торговым дням'; }
      else { rr = risky.reduce(function (a, i) { return a + i.value * i.s.annRet; }, 0) / riskyVal; rv = risky.reduce(function (a, i) { return a + i.value * i.s.annVol; }, 0) / riskyVal; note = 'средневзвешенно (мало общих дат, корреляции не учтены — риск завышен)'; } }
    var w = tot ? riskyVal / tot : 0; return { total: tot, annRet: w * rr + (1 - w) * fixedRet, annVol: w * rv + (1 - w) * 0.03, riskyShare: w, note: note, fixedRet: fixedRet, rr: rr, rv: rv };
  }
  /* ---------- Прогноз ---------- */
  function renderForecast() {
    var el = $('#forecast'), pp = portfolioParams(), f = el._f || {}, ms = monthlySurplus();
    var o = { start: f.start != null ? f.start : Math.round(pp.total || 100000), monthly: f.monthly != null ? f.monthly : Math.max(0, Math.round(ms && ms.surplus > 0 ? ms.surplus * .5 : 10000)), years: f.years || 5, annRet: f.annRet != null ? f.annRet : +(pp.annRet * 100 || 10).toFixed(1), annVol: f.annVol != null ? f.annVol : +(pp.annVol * 100 || 15).toFixed(1) };
    var cap = function (x, a, b) { return Math.max(a, Math.min(b, x)); };
    var mc = Core.monteCarlo({ start: o.start, monthly: o.monthly, months: o.years * 12, annRet: cap(o.annRet, -90, 300) / 100, annVol: cap(o.annVol, 0, 300) / 100, paths: 3000, seed: 7 });
    var end = mc[mc.length - 1], lab = mc.map(function (x) { return x.m % 12 === 0 ? 'год ' + x.m / 12 : ''; });
    el.innerHTML = '<div class="card"><h3>Монте‑Карло прогноз стоимости портфеля</h3><div class="row">Старт, ₽ <input id="fS" value="' + o.start + '" size="10"> Взнос в мес, ₽ <input id="fM" value="' + o.monthly + '" size="8"> Горизонт, лет <input id="fY" value="' + o.years + '" size="3"> Ожид. доходность, %/год <input id="fR" value="' + o.annRet + '" size="5"> Волатильность, %/год <input id="fV" value="' + o.annVol + '" size="5"> <button id="fGo">Пересчитать</button></div>' +
      '<p class="muted">По умолчанию параметры взяты из истории вашего портфеля за ~1 год (' + esc(pp.note || 'нет данных — использованы 10%/15%') + '; облигации — по текущей доходности к погашению, кэш — ' + (S.invest.cashRate || 12) + '%). Один год истории — очень мало: смело подставляйте свои, более консервативные допущения.</p>' +
      Charts.line(lab, [{ data: mc.map(function (x) { return x.p50; }), color: '#3b5bdb', width: 2 }, { data: mc.map(function (x) { return x.invested; }), color: '#868e96', dash: 1 }], [{ lo: mc.map(function (x) { return x.p5; }), hi: mc.map(function (x) { return x.p95; }), color: '#3b5bdb22' }, { lo: mc.map(function (x) { return x.p25; }), hi: mc.map(function (x) { return x.p75; }), color: '#3b5bdb44' }], [['Медиана', '#3b5bdb'], ['50% сценариев (25–75 перц.)', '#3b5bdb88'], ['90% сценариев (5–95 перц.)', '#3b5bdb33'], ['Внесено', '#868e96']]) +
      '<div class="grid"><div><b>Через ' + o.years + ' лет:</b><br>пессимистично (5%): ' + fmt(end.p5, 'RUB') + '<br>медиана: <b>' + fmt(end.p50, 'RUB') + '</b><br>оптимистично (95%): ' + fmt(end.p95, 'RUB') + '<br>внесено всего: ' + fmt(end.invested, 'RUB') + '</div><div class="muted"><b>Как считается.</b> 3000 случайных сценариев: каждый месяц стоимость умножается на exp(μ − σ²/2 + σ·Z), где μ, σ — месячные доходность и волатильность из введённых годовых, Z — нормальная случайная величина; затем добавляется взнос. Модель не учитывает инфляцию, налоги, комиссии, «толстые хвосты» и смену рыночных режимов. Это <b>не гарантия</b>: реальный результат может выйти за любые границы.</div></div></div>' +
      '<div class="card"><h3>Историческая оценка инструментов</h3><p class="muted">Годовая доходность = exp(среднее лог‑доходностей × 252) − 1 за доступный период; волатильность = σ дневных лог‑доходностей × √252; просадка — максимальное падение от пика.</p>' + compareTable() + '</div>';
    $('#fGo').onclick = function () { el._f = { start: Core.parseAmount($('#fS').value), monthly: Core.parseAmount($('#fM').value), years: Math.max(1, Math.min(40, parseInt($('#fY').value) || 5)), annRet: Core.parseAmount($('#fR').value), annVol: Core.parseAmount($('#fV').value) }; renderForecast(); };
  }
  function compareTable() { var arr = Object.keys(stats).map(function (k) { return stats[k]; }); if (!arr.length) return '<p class="muted">Загрузите котировки на вкладке «Рынок».</p>';
    return '<table><tr><th>Инструмент</th><th>Класс</th><th class="num">Доходн. (год.)</th><th class="num">Волат.</th><th class="num">Доходн./волат.</th><th class="num">Макс. просадка</th></tr>' + arr.sort(function (a, b) { return b.annRet / (b.annVol || 1) - a.annRet / (a.annVol || 1); }).map(function (s) { return '<tr><td>' + esc(s.name) + '</td><td>' + KIND[s.kind] + '</td><td class="num ' + (s.annRet >= 0 ? 'pos' : 'neg') + '">' + pct(s.annRet) + '</td><td class="num">' + pct(s.annVol) + '</td><td class="num">' + (s.annRet / (s.annVol || 1)).toFixed(2) + '</td><td class="num neg">' + pct(s.mdd) + '</td></tr>'; }).join('') + '</table>'; }
  /* ---------- Идеи и рекомендации ---------- */
  var Q = [['Горизонт инвестиций', [['до 1 года', 0], ['1–3 года', 1], ['3–7 лет', 2], ['более 7 лет', 3]]], ['Ваша реакция на падение портфеля на 20%', [['продам всё', 0], ['продам часть', 1], ['ничего не буду делать', 2], ['докуплю', 3]]], ['Цель', [['сохранить деньги', 0], ['обогнать инфляцию', 1], ['рост капитала', 2], ['максимальный рост', 3]]], ['Опыт инвестирования', [['нет', 0], ['вклады/облигации', 1], ['акции/фонды', 2], ['активная торговля', 3]]], ['Есть ли подушка безопасности 3–6 мес. расходов?', [['нет', 0], ['частично', 1], ['да', 2], ['да, с запасом', 3]]]];
  function why(s, prof) { var r = []; if (s.mom6m != null) r.push('6 мес: ' + pct(s.mom6m) + (s.mom6m > 0 ? ' (положительный моментум)' : ' (отрицательный моментум)')); r.push('волатильность ' + pct(s.annVol) + (s.annVol <= prof.maxVol ? ' — в пределах вашего профиля (≤' + pct(prof.maxVol) + ')' : ' — выше вашего профиля')); r.push('макс. просадка за период ' + pct(s.mdd)); r.push(s.aboveSma200 ? 'цена выше 200‑дневной средней (тренд вверх)' : 'цена ниже 200‑дневной средней (тренд вниз)'); return r.join('; ') + '.'; }
  function renderIdeas() {
    var el = $('#ideas'), prof = S.risk ? Core.riskProfile(S.risk) : null, ms = monthlySurplus(), P = portfolio();
    var q = '<div class="card"><h3>1. Риск‑профиль (анкета)</h3>' + Q.map(function (x, i) { return '<div class="row"><b style="min-width:320px">' + x[0] + '</b><select class="rq" data-i="' + i + '">' + x[1].map(function (o) { return '<option value="' + o[1] + '">' + o[0] + '</option>'; }).join('') + '</select></div>'; }).join('') + '<button id="rqGo">Определить профиль</button> ' + (prof ? '<b>Ваш профиль: ' + prof.name + '</b> — ориентир: акции/фонды ' + pct(prof.eq) + ', облигации ' + pct(prof.bonds) + ', кэш ' + pct(prof.cash) + ', крипто ' + pct(prof.crypto) + '; лимит волатильности идей ' + pct(prof.maxVol) : '<span class="muted">Пройдите анкету, чтобы фильтровать идеи.</span>') + '<p class="muted">Баллы суммируются: ≤5 — консервативный, 6–10 — умеренный, >10 — агрессивный. Ориентиры распределения — упрощённые учебные шаблоны.</p></div>';
    prof = prof || Core.riskProfile([1, 1, 1, 1, 1]);
    /* сбережения */
    var cashAcc = S.accounts.reduce(function (a, x) { var v = toRUB(balance(x), x.currency); return a + (v > 0 && x.type !== 'broker' && x.type !== 'crypto' ? v : 0); }, 0), recs = [];
    if (ms) { var rate = ms.inc ? ms.surplus / ms.inc : 0; recs.push('Средние доходы ' + fmt(ms.inc, 'RUB') + ', расходы ' + fmt(ms.exp, 'RUB') + ' в месяц (последние ' + ms.months + ' мес.), норма сбережений <b>' + pct(rate) + '</b>.');
      var cushion = ms.exp * 6; if (cashAcc < ms.exp * 3) recs.push('⚠️ Подушка безопасности: на счетах ~' + fmt(cashAcc, 'RUB') + ' — меньше 3 месяцев расходов. Разумно сначала накопить ' + fmt(ms.exp * 3, 'RUB') + '–' + fmt(cushion, 'RUB') + ' на вкладе/накопительном счёте или в фонде денежного рынка, и только потом инвестировать.');
      else recs.push('✔ Подушка: ~' + fmt(cashAcc, 'RUB') + ' ≈ ' + (cashAcc / ms.exp).toFixed(1) + ' мес. расходов.');
      if (ms.surplus > 0) recs.push('Ориентир для регулярных инвестиций: <b>' + fmt(ms.surplus * .5, 'RUB') + '–' + fmt(ms.surplus * .7, 'RUB') + ' в месяц</b> (50–70% среднего профицита, остальное — резерв на крупные траты).'); else recs.push('⚠️ Расходы превышают доходы — инвестировать из текущего потока сейчас не из чего; начните с бюджета (вкладка «Обзор» → топ категорий).');
    } else recs.push('Нет данных о доходах/расходах в ₽ за последние месяцы — импортируйте выписки, чтобы получить оценку суммы для инвестирования.');
    /* диверсификация и ребалансировка */
    if (P.total) { P.items.forEach(function (i) { if (i.value / P.total > .25 && i.h.kind !== 'cash') recs.push('⚠️ Концентрация: ' + esc(i.h.ticker) + ' занимает ' + pct(i.value / P.total) + ' портфеля (>25%). Для снижения специфического риска доля одной бумаги обычно ограничивается 5–15%.'); });
      var cls = { 'Акции/фонды': 0, 'Облигации': 0, 'Кэш': 0, 'Крипто': 0 }; P.items.forEach(function (i) { var k = i.h.kind === 'share' || i.h.kind === 'etf' ? 'Акции/фонды' : i.h.kind === 'bond' ? 'Облигации' : i.h.kind === 'crypto' ? 'Крипто' : 'Кэш'; cls[k] += i.value || 0; });
      var rb = Core.rebalance(cls, { 'Акции/фонды': prof.eq, 'Облигации': prof.bonds, 'Кэш': prof.cash, 'Крипто': prof.crypto });
      var rbt = '<table><tr><th>Класс</th><th class="num">Сейчас</th><th class="num">Доля</th><th class="num">Цель</th><th class="num">Действие для ребалансировки</th></tr>' + rb.map(function (r) { return '<tr><td>' + r.cls + '</td><td class="num">' + fmt(r.cur) + '</td><td class="num">' + pct(r.curShare) + '</td><td class="num">' + pct(r.target) + '</td><td class="num ' + (r.diff >= 0 ? 'pos' : 'neg') + '">' + (Math.abs(r.diff) < P.total * .02 ? 'в норме' : (r.diff > 0 ? 'докупить на ' : 'сократить на ') + fmt(Math.abs(r.diff), 'RUB')) + '</td></tr>'; }).join('') + '</table><p class="muted">Отклонение до 2% от портфеля считается нормой. Ребалансировать удобнее новыми взносами, а не продажами (меньше налогов и комиссий).</p>';
      var kinds = Object.keys(cls).filter(function (k) { return cls[k] > 0; }).length; if (kinds < 2) recs.push('⚠️ Портфель состоит из одного класса активов — диверсификация по классам (акции + облигации) снижает колебания.');
    }
    /* скринер */
    var arr = Object.keys(stats).map(function (k) { return stats[k]; }).filter(function (s) { return s.kind !== 'index' && s.n > 60; });
    arr.forEach(function (s) { s.score = Core.score(s, prof); });
    var ok = arr.filter(function (s) { return s.annVol <= prof.maxVol && (s.kind !== 'crypto' || prof.crypto > 0); }).sort(function (a, b) { return b.score - a.score; });
    var rej = arr.filter(function (s) { return ok.indexOf(s) < 0; });
    function ideasTbl(kind, n) { var l = ok.filter(function (s) { return s.kind === kind; }).slice(0, n); return l.length ? '<table><tr><th>#</th><th>Идея</th><th class="num">Балл</th><th>Почему в списке</th></tr>' + l.map(function (s, i) { return '<tr><td>' + (i + 1) + '</td><td><b>' + esc(s.name) + '</b><br><span class="muted">' + esc(s.t) + ' · ' + fmt(s.price) + ' ₽</span></td><td class="num">' + s.score.toFixed(2) + '</td><td class="why">' + why(s, prof) + '</td></tr>'; }).join('') + '</table>' : '<p class="muted">Нет подходящих под профиль (или котировки не загружены).</p>'; }
    var bonds = (bondsList || []).filter(function (b) { return b.yield && b.unit === 'SUR' && b.secid.indexOf('SU') === 0; }), today = new Date();
    function yrs(b) { return (new Date(b.mat) - today) / 3.156e10; }
    var bucket = prof.key === 'cons' ? [0.5, 3] : prof.key === 'mod' ? [1, 7] : [3, 20];
    var bsel = bonds.filter(function (b) { var y = yrs(b); return y >= bucket[0] && y <= bucket[1]; }).sort(function (a, b) { return b.yield - a.yield; }).slice(0, 5);
    el.innerHTML = q + '<div class="card"><h3>2. Личные финансы → инвестиции</h3><ul>' + recs.map(function (r) { return '<li>' + r + '</li>'; }).join('') + '</ul>' + (rbt || '') + '</div>' +
      '<div class="card"><h3>3. Скринер идей (живые данные) — профиль: ' + prof.name + '</h3><p class="muted"><b>Формула балла:</b> моментум (0.5×6м + 0.3×3м + 0.2×12м) − k×волатильность/2 + просадка×(0.5 или 0.15) ± 0.05 за положение относительно SMA200; k = 1.5 (конс.), 0.8 (умер.), 0.3 (агр.). Отсекаются инструменты с волатильностью выше лимита профиля. Моментум — исторический факт, а не прогноз. Дивидендная доходность в бесплатном ISS API не доступна и в балле не учитывается — проверяйте дивиденды отдельно.</p>' +
      '<h4>Акции Мосбиржи</h4>' + ideasTbl('share', 5) + '<h4>Фонды (БПИФ)</h4>' + ideasTbl('etf', 3) + '<h4>ОФЗ (срок ' + bucket[0] + '–' + bucket[1] + ' лет под ваш профиль, по доходности к погашению)</h4>' +
      (bsel.length ? '<table><tr><th>Выпуск</th><th>Погашение</th><th class="num">Доходность</th><th>Почему</th></tr>' + bsel.map(function (b) { return '<tr><td><b>' + esc(b.name) + '</b> <span class="muted">' + b.secid + '</span></td><td>' + b.mat + '</td><td class="num">' + (+b.yield).toFixed(2) + '%</td><td class="why">Гособлигация (минимальный кредитный риск в ₽); до погашения ' + yrs(b).toFixed(1) + ' лет; купон ' + (b.coupon || 0).toFixed(2) + '%. Если держать до погашения, доходность близка к указанной (до налога); при досрочной продаже цена может измениться при изменении ставок' + (yrs(b) > 5 ? ' — у длинных выпусков это изменение сильнее' : '') + '.</td></tr>'; }).join('') + '</table>' : '<p class="muted">Загрузите котировки ОФЗ на вкладке «Рынок».</p>') +
      (prof.crypto > 0 ? '<h4>Криптовалюта (не более ' + pct(prof.crypto) + ' портфеля)</h4>' + ideasTbl('crypto', 2) : '<h4>Криптовалюта</h4><p class="muted">Для консервативного профиля не предлагается (высокая волатильность).</p>') +
      (rej.length ? '<details><summary class="muted">Отсеяно по профилю: ' + rej.length + '</summary><p class="muted">' + rej.map(function (s) { return esc(s.name) + ' (волат. ' + pct(s.annVol) + ')'; }).join(', ') + '</p></details>' : '') + '</div>' +
      '<div class="card"><h3>4. Сравнение инструментов</h3>' + compareTable() + '</div><div class="card disc">Это образовательная аналитика на основе публичных исторических данных и простых правил. Она не учитывает вашу полную финансовую ситуацию, налоги, комиссии и не является индивидуальной инвестиционной рекомендацией. Перед решением изучите эмитента и при необходимости обратитесь к лицензированному консультанту.</div>';
    if (S.risk) el.querySelectorAll('.rq').forEach(function (s) { s.value = S.risk[s.dataset.i]; });
    $('#rqGo').onclick = function () { S.risk = Array.from(el.querySelectorAll('.rq')).map(function (s) { return +s.value; }); save(); renderIdeas(); toast('Профиль: ' + Core.riskProfile(S.risk).name); };
  }
  function renderInvestAll() { [renderMarket, renderPortfolio, renderForecast, renderIdeas].forEach(function (f) { try { f(); } catch (e) { console.error(e); } }); }
  /* стартуем с кэша (без сети); сеть — по кнопке «Обновить котировки» */
  function fromCache() { var names = {}; Object.keys(UNIVERSE).forEach(function (k) { UNIVERSE[k].forEach(function (u) { names[u[0]] = [k, u[1]]; }); }); names.IMOEX = ['index', 'Индекс Мосбиржи'];
    S.holdings.forEach(function (h) { if (!names[h.ticker] && h.kind !== 'cash' && h.kind !== 'bond') names[h.ticker] = [h.kind, h.ticker]; });
    var ps = Object.keys(names).filter(function (t) { return Market.age('h:' + t) || Market.age('manual:' + t); }).map(function (t) { return loadOne(names[t][0], t, names[t][1]); });
    if (Market.age('bonds')) ps.push(Market.bonds().then(function (b) { bondsList = b; }).catch(function () {}));
    return Promise.all(ps); }
  RENDER.market = renderMarket; RENDER.portfolio = renderPortfolio; RENDER.forecast = renderForecast; RENDER.ideas = renderIdeas;
  var origAll = renderAll; renderAll = function () { origAll(); renderInvestAll(); };
  fromCache().then(renderInvestAll);
  return { loadAll: loadAll, stats: stats, portfolioParams: portfolioParams, render: renderInvestAll };
})();
