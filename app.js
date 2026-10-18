/* Личные финансы: состояние в localStorage, никаких сетевых запросов */
var KEY = 'finance-local-v1';
var S = load();
function blank() { return { app: 'finance-local', version: 1, accounts: [], tx: [], rules: Core.DEFAULT_RULES.map(function (r) { return r.slice(); }), rates: { USD: '', EUR: '', CNY: '' }, holdings: [], risk: null, invest: {} }; }
function load() { try { var s = JSON.parse(localStorage.getItem(KEY)); if (s && s.app === 'finance-local') { var b = blank(); for (var k in b) if (s[k] === undefined) s[k] = b[k]; return s; } } catch (e) {} return blank(); }
function save() { localStorage.setItem(KEY, JSON.stringify(S)); }
function $(s, r) { return (r || document).querySelector(s); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
function fmt(n, cur) { if (n == null || !isFinite(n)) return '—'; return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + (cur ? ' ' + ({ RUB: '₽', USD: '$', EUR: '€' }[cur] || cur) : ''); }
function pct(x) { return x == null || !isFinite(x) ? '—' : (x * 100).toFixed(1) + '%'; }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function toast(m) { var t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove('show'); }, 3500); }
function acc(id) { return S.accounts.find(function (a) { return a.id === id; }); }
function ensureAccount(name, cur, type) { var a = S.accounts.find(function (x) { return x.name === name; }); if (!a) { a = { id: uid(), name: name, currency: cur || 'RUB', type: type || 'bank', start: 0, manual: null }; S.accounts.push(a); } return a; }
function balance(a) { if (a.manual != null && a.manual !== '') return +a.manual; return (+a.start || 0) + S.tx.filter(function (t) { return t.accountId === a.id; }).reduce(function (s, t) { return s + t.amount; }, 0); }
function toRUB(v, cur) { if (cur === 'RUB') return v; var r = +S.rates[cur]; return r ? v * r : null; }
function addTx(list, a) {
  var keys = {}; S.tx.forEach(function (t) { keys[t.accountId + t.date + t.amount.toFixed(2) + t.description] = 1; }); var n = 0;
  list.forEach(function (t) { var k = a.id + t.date + t.amount.toFixed(2) + t.description; if (keys[k]) return; keys[k] = 1; n++;
    S.tx.push({ id: uid(), accountId: a.id, date: t.date, amount: t.amount, currency: t.currency || a.currency, description: t.description, category: Core.categorize(t, S.rules), demo: t.demo || undefined }); });
  return n;
}
/* Средний ежемесячный профицит (₽) за последние 3 полных месяца — используется в инвест-рекомендациях */
function monthlySurplus() {
  var m = Core.monthly(S.tx, 'RUB'), now = new Date(), res = [];
  for (var i = 1; i <= 3; i++) { var d = new Date(now.getFullYear(), now.getMonth() - i, 1), k = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); if (m[k]) res.push(m[k]); }
  if (!res.length) return null; var inc = Core.mean(res.map(function (x) { return x.inc; })), exp = Core.mean(res.map(function (x) { return x.exp; }));
  return { inc: inc, exp: exp, surplus: inc - exp, months: res.length };
}
function ym(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); }

function renderOverview() {
  var byCur = {}, rows = S.accounts.map(function (a) { var b = balance(a); byCur[a.currency] = (byCur[a.currency] || 0) + b;
    return '<tr><td>' + esc(a.name) + (a.demo ? ' <span class="demo">демо</span>' : '') + '</td><td>' + esc(a.type) + '</td><td class="num">' + fmt(b, a.currency) + '</td></tr>'; }).join('');
  var totRub = 0, miss = false; Object.keys(byCur).forEach(function (c) { var v = toRUB(byCur[c], c); if (v == null) miss = true; else totRub += v; });
  var ht = $('#hdrTotal'); if (ht) ht.textContent = S.accounts.length ? fmt(totRub, 'RUB') : '';
  var now = new Date(), cm = ym(now), pm = ym(new Date(now.getFullYear(), now.getMonth() - 1, 1)), mon = Core.monthly(S.tx, 'RUB');
  var cats = {}; S.tx.forEach(function (t) { if (t.amount < 0 && t.date.slice(0, 7) === cm && t.currency === 'RUB') cats[t.category] = (cats[t.category] || 0) - t.amount; });
  var top = Object.keys(cats).map(function (k) { return { name: k, value: cats[k] }; }).sort(function (a, b) { return b.value - a.value; });
  var months = []; for (var i = 11; i >= 0; i--) months.push(ym(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  function sm(k) { var x = mon[k] || { inc: 0, exp: 0 }; return '<div class="big pos">+' + fmt(x.inc, 'RUB') + '</div><div class="big neg">−' + fmt(x.exp, 'RUB') + '</div><div>Итог: <b class="' + (x.inc - x.exp >= 0 ? 'pos' : 'neg') + '">' + fmt(x.inc - x.exp, 'RUB') + '</b></div>'; }
  $('#overview').innerHTML = '<div class="grid"><div class="card"><h3>Баланс по валютам</h3>' + (Object.keys(byCur).map(function (c) { return '<div class="big">' + fmt(byCur[c], c) + '</div>'; }).join('') || '<p class="muted">Нет счетов. Импортируйте выписку или <a href="#" id="ovDemo">загрузите демо-данные</a>.</p>') +
    '<div class="muted">Всего в ₽ (по ручным курсам): <b>' + fmt(totRub, 'RUB') + '</b>' + (miss ? ' — для части валют не задан курс (Настройки)' : '') + '</div></div>' +
    '<div class="card"><h3>Этот месяц (' + cm + ')</h3>' + sm(cm) + '</div><div class="card"><h3>Прошлый месяц (' + pm + ')</h3>' + sm(pm) + '</div></div>' +
    '<div class="card"><h3>Доходы и расходы по месяцам (₽)</h3>' + Charts.bars(months.map(function (m) { return m.slice(5) + '.' + m.slice(2, 4); }), [{ name: 'Доходы', color: '#2f9e44', data: months.map(function (m) { return (mon[m] || {}).inc || 0; }) }, { name: 'Расходы', color: '#c92a2a', data: months.map(function (m) { return (mon[m] || {}).exp || 0; }) }]) + '</div>' +
    '<div class="grid"><div class="card"><h3>Топ категорий расходов за месяц</h3>' + Charts.donut(top.slice(0, 8)) + '</div><div class="card"><h3>Счета</h3><table>' + rows + '</table></div></div>';
  var d = $('#ovDemo'); if (d) d.onclick = function (e) { e.preventDefault(); loadDemo(); };
}
function renderTx() {
  var el = $('#tx'), q = el._q || { s: '', a: '', c: '', from: '', to: '' };
  var cats = Array.from(new Set(S.tx.map(function (t) { return t.category; }).concat(S.rules.map(function (r) { return r[0]; })))).sort();
  var list = S.tx.filter(function (t) { return (!q.s || (t.description + ' ' + t.category).toLowerCase().indexOf(q.s.toLowerCase()) >= 0) && (!q.a || t.accountId === q.a) && (!q.c || t.category === q.c) && (!q.from || t.date >= q.from) && (!q.to || t.date <= q.to); }).sort(function (a, b) { return b.date < a.date ? -1 : b.date > a.date ? 1 : 0; });
  var accOpts = S.accounts.map(function (a) { return '<option value="' + a.id + '">' + esc(a.name) + '</option>'; }).join('');
  el.innerHTML = '<div class="card"><h3>Добавить операцию</h3><div class="row"><input type="date" id="nDate" value="' + new Date().toISOString().slice(0, 10) + '"><select id="nAcc">' + accOpts + '</select><input id="nAmt" placeholder="Сумма (− расход)" size="12"><input id="nDesc" placeholder="Описание" size="28"><input id="nCat" list="catList" placeholder="Категория (авто)"><button id="nAdd">Добавить</button></div><datalist id="catList">' + cats.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + '</datalist></div>' +
    '<div class="card"><div class="row"><input id="fS" placeholder="Поиск…" value="' + esc(q.s) + '"><select id="fA"><option value="">Все счета</option>' + accOpts + '</select><select id="fC"><option value="">Все категории</option>' + cats.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + '</select>с <input type="date" id="fF" value="' + q.from + '"> по <input type="date" id="fT" value="' + q.to + '"><span class="muted">Найдено: ' + list.length + ', сумма: ' + fmt(list.reduce(function (s, t) { return s + t.amount; }, 0)) + '</span></div>' +
    '<table><tr><th>Дата</th><th>Счёт</th><th>Описание</th><th>Категория</th><th class="num">Сумма</th><th></th></tr>' + list.slice(0, 500).map(function (t) { var a = acc(t.accountId) || {}; return '<tr data-id="' + t.id + '"><td>' + t.date + '</td><td>' + esc(a.name) + '</td><td>' + esc(t.description) + '</td><td><input class="ecat" list="catList" value="' + esc(t.category) + '" size="16"></td><td class="num ' + (t.amount < 0 ? 'neg' : 'pos') + '">' + fmt(t.amount, t.currency) + '</td><td><button class="sec edit">✎</button> <button class="sec del">✕</button></td></tr>'; }).join('') + '</table>' + (list.length > 500 ? '<p class="muted">Показаны первые 500</p>' : '') + '</div>';
  $('#fA').value = q.a; $('#fC').value = q.c;
  function upd() { el._q = { s: $('#fS').value, a: $('#fA').value, c: $('#fC').value, from: $('#fF').value, to: $('#fT').value }; renderTx(); var i = $('#fS'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  $('#fS').oninput = upd; ['#fA', '#fC', '#fF', '#fT'].forEach(function (s) { $(s).onchange = upd; });
  $('#nAdd').onclick = function () { if (!S.accounts.length) ensureAccount('Наличные', 'RUB', 'cash'); var a = acc($('#nAcc').value) || S.accounts[0], amt = Core.parseAmount($('#nAmt').value), t = { date: $('#nDate').value, amount: amt, description: $('#nDesc').value, category: '' };
    if (!t.date || isNaN(amt)) return toast('Укажите дату и сумму'); S.tx.push({ id: uid(), accountId: a.id, date: t.date, amount: amt, currency: a.currency, description: t.description, category: $('#nCat').value || Core.categorize(t, S.rules) }); save(); renderAll(); toast('Добавлено'); };
  el.querySelectorAll('tr[data-id]').forEach(function (tr) { var t = S.tx.find(function (x) { return x.id === tr.dataset.id; });
    tr.querySelector('.ecat').onchange = function () { t.category = this.value; save(); };
    tr.querySelector('.del').onclick = function () { if (confirm('Удалить операцию?')) { S.tx = S.tx.filter(function (x) { return x !== t; }); save(); renderAll(); } };
    tr.querySelector('.edit').onclick = function () { var d = prompt('Дата (ГГГГ-ММ-ДД)', t.date); if (d == null) return; var a = prompt('Сумма', t.amount); if (a == null) return; var s = prompt('Описание', t.description); if (s == null) return; t.date = Core.parseDate(d) || t.date; t.amount = Core.parseAmount(a); t.description = s; save(); renderAll(); }; });
}
function renderAccounts() {
  $('#accounts').innerHTML = '<div class="card"><h3>Новый счёт / кошелёк</h3><div class="row"><input id="aName" placeholder="Название"><select id="aType"><option value="bank">Банковский счёт/карта</option><option value="cash">Наличные</option><option value="crypto">Криптокошелёк</option><option value="broker">Брокерский</option><option value="other">Другое</option></select><input id="aCur" value="RUB" size="5" placeholder="Валюта"><input id="aStart" placeholder="Нач. баланс" size="10"><input id="aMan" placeholder="Ручной баланс (необяз.)" size="16"><button id="aAdd">Создать</button></div><p class="muted">«Ручной баланс» заменяет расчёт по операциям — удобно для наличных и крипты (валюта, напр. BTC, USDT).</p></div>' +
    '<div class="card"><table><tr><th>Название</th><th>Тип</th><th>Валюта</th><th>Нач. баланс</th><th>Ручной баланс</th><th>Операций</th><th class="num">Баланс</th><th></th></tr>' + S.accounts.map(function (a) { return '<tr data-id="' + a.id + '"><td><input class="n" value="' + esc(a.name) + '"></td><td>' + esc(a.type) + '</td><td><input class="c" value="' + esc(a.currency) + '" size="5"></td><td><input class="s" value="' + (a.start || 0) + '" size="9"></td><td><input class="m" value="' + (a.manual == null ? '' : a.manual) + '" size="9"></td><td>' + S.tx.filter(function (t) { return t.accountId === a.id; }).length + '</td><td class="num">' + fmt(balance(a), a.currency) + '</td><td><button class="danger del">Удалить</button></td></tr>'; }).join('') + '</table></div>';
  $('#aAdd').onclick = function () { var n = $('#aName').value.trim(); if (!n) return toast('Введите название'); S.accounts.push({ id: uid(), name: n, type: $('#aType').value, currency: $('#aCur').value.trim().toUpperCase() || 'RUB', start: Core.parseAmount($('#aStart').value) || 0, manual: $('#aMan').value === '' ? null : Core.parseAmount($('#aMan').value) }); save(); renderAll(); };
  $('#accounts').querySelectorAll('tr[data-id]').forEach(function (tr) { var a = acc(tr.dataset.id);
    tr.querySelector('.n').onchange = function () { a.name = this.value; save(); renderAll(); }; tr.querySelector('.c').onchange = function () { a.currency = this.value.toUpperCase(); save(); renderAll(); };
    tr.querySelector('.s').onchange = function () { a.start = Core.parseAmount(this.value) || 0; save(); renderAll(); }; tr.querySelector('.m').onchange = function () { a.manual = this.value === '' ? null : Core.parseAmount(this.value); save(); renderAll(); };
    tr.querySelector('.del').onclick = function () { if (confirm('Удалить счёт и все его операции?')) { S.accounts = S.accounts.filter(function (x) { return x !== a; }); S.tx = S.tx.filter(function (t) { return t.accountId !== a.id; }); save(); renderAll(); } }; });
}
function renderImport() {
  $('#import').innerHTML = '<div class="card"><h3>Импорт выписки</h3><p>Поддерживаются CSV (Сбер, Т‑Банк/Тинькофф, Альфа и др.; разделитель «;» или «,»; кодировки UTF‑8 и Windows‑1251), OFX/QFX и простой JSON. Файлы обрабатываются только в вашем браузере.</p>' +
    '<div class="row">Счёт: <select id="iAcc"><option value="">— новый счёт по имени файла —</option>' + S.accounts.map(function (a) { return '<option value="' + a.id + '">' + esc(a.name) + '</option>'; }).join('') + '</select> Валюта по умолчанию: <input id="iCur" value="RUB" size="5"><input type="file" id="iFile" multiple accept=".csv,.txt,.ofx,.qfx,.json"></div><div id="iLog" class="muted"></div></div>' +
    '<div class="card"><h3>Демо</h3><button id="iDemo" class="sec">Загрузить демо-данные (вымышленные)</button> <span class="muted">Добавит счета с пометкой «демо». Примеры файлов — в папке <code>samples/</code>.</span></div>';
  $('#iDemo').onclick = loadDemo;
  $('#iFile').onchange = function () { Array.from(this.files).forEach(function (f) { f.arrayBuffer().then(function (buf) { importBuffer(f.name, buf, $('#iAcc').value, $('#iCur').value.trim().toUpperCase() || 'RUB'); }); }); };
}
function importBuffer(name, buf, accId, cur) {
  var log = $('#iLog');
  try { var r = Core.parseFile(name, buf);
    if (r.backup) { if (confirm('Это резервная копия. Заменить все текущие данные?')) { S = r.backup; var b = blank(); for (var k in b) if (S[k] === undefined) S[k] = b[k]; save(); renderAll(); toast('Резервная копия восстановлена'); } return; }
    var a = accId ? acc(accId) : ensureAccount(name.replace(/\.[^.]+$/, ''), r.currency || cur, 'bank'); var n = addTx(r.transactions, a); save(); renderAll();
    $('#iLog').innerHTML += '<div>✔ ' + esc(name) + ': формат ' + r.format + (r.delimiter ? ' (разделитель «' + (r.delimiter === '\t' ? 'TAB' : r.delimiter) + '»)' : '') + ', найдено ' + r.transactions.length + ', добавлено ' + n + ' (дубликаты пропущены) → «' + esc(a.name) + '»</div>';
  } catch (e) { $('#iLog').innerHTML += '<div class="neg">✖ ' + esc(name) + ': ' + esc(e.message) + '</div>'; }
}
function loadDemo() {
  var a = ensureAccount('Демо: карта (вымышленные данные)', 'RUB', 'bank'); a.demo = true; a.start = 50000;
  addTx(window.DEMO_TX.map(function (t) { return Object.assign({ demo: true }, t); }), a);
  var c = ensureAccount('Демо: наличные', 'RUB', 'cash'); c.demo = true; c.manual = 15000;
  var k = ensureAccount('Демо: крипто USDT', 'USD', 'crypto'); k.demo = true; k.manual = 500;
  if (!S.rates.USD) S.rates.USD = 90;
  if (!S.holdings.length) S.holdings = [{ id: uid(), kind: 'share', ticker: 'SBER', qty: 100, buy: 250, demo: true }, { id: uid(), kind: 'share', ticker: 'LKOH', qty: 3, buy: 6500, demo: true }, { id: uid(), kind: 'bond', ticker: 'SU26238RMFS4', qty: 10, buy: 600, demo: true }, { id: uid(), kind: 'crypto', ticker: 'bitcoin', qty: 0.01, buy: 6000000, demo: true }, { id: uid(), kind: 'cash', ticker: 'Вклад/фонд денежного рынка', qty: 1, buy: 100000, demo: true }];
  save(); renderAll(); toast('Демо-данные загружены (вымышленные)');
}
function renderSettings() {
  $('#settings').innerHTML = '<div class="grid"><div class="card"><h3>Ручные курсы к ₽</h3>' + Object.keys(S.rates).map(function (c) { return '<div class="row">' + c + ' = <input data-c="' + c + '" class="rate" value="' + S.rates[c] + '" size="8"> ₽</div>'; }).join('') + '<div class="row"><input id="rNew" placeholder="Код валюты, напр. BTC" size="14"><button class="sec" id="rAdd">+ валюта</button></div><button class="sec" id="rCbr">Подставить курсы ЦБ (публичный запрос к cbr-xml-daily.ru)</button><p class="muted">Курсы используются только для пересчёта итога в ₽. Запрос к ЦБ — только по нажатию, без передачи ваших данных.</p></div>' +
    '<div class="card"><h3>Резервная копия</h3><button id="sExp">Экспорт в JSON</button> <label class="sec" style="padding:6px">Восстановить: <input type="file" id="sImp" accept=".json"></label><br><br><button class="sec" id="sRecat">Переразметить категории по правилам</button><br><br><button class="danger" id="sClear">Удалить все данные</button> <button class="sec" id="sDemoDel">Удалить только демо</button></div></div>' +
    '<div class="card"><h3>Правила автокатегоризации</h3><p class="muted">Формат: <code>Категория: слово1, слово2</code> — по одному правилу в строке. Поиск подстроки в описании без учёта регистра; первое совпадение побеждает.</p><textarea id="sRules" rows="14" style="width:100%">' + esc(S.rules.map(function (r) { return r[0] + ': ' + r[1]; }).join('\n')) + '</textarea><button id="sSave">Сохранить правила</button></div>';
  $('#settings').querySelectorAll('.rate').forEach(function (i) { i.onchange = function () { S.rates[i.dataset.c] = Core.parseAmount(i.value) || ''; save(); renderOverview(); }; });
  $('#rAdd').onclick = function () { var c = $('#rNew').value.trim().toUpperCase(); if (c) { S.rates[c] = ''; save(); renderSettings(); } };
  $('#rCbr').onclick = function () { (window.Market ? Market.cbr() : Promise.reject(new Error('нет модуля'))).then(function (v) { Object.keys(S.rates).forEach(function (c) { if (v[c]) S.rates[c] = +(v[c].Value / v[c].Nominal).toFixed(4); }); save(); renderSettings(); renderOverview(); toast('Курсы ЦБ подставлены'); }).catch(function (e) { toast('Не удалось: ' + e.message); }); };
  $('#sExp').onclick = function () { var b = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'finance-backup-' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); };
  $('#sImp').onchange = function () { var f = this.files[0]; f && f.arrayBuffer().then(function (b) { importBuffer(f.name, b, '', 'RUB'); }); };
  $('#sClear').onclick = function () { if (confirm('Удалить ВСЕ данные из браузера? Сначала сделайте экспорт.')) { localStorage.removeItem(KEY); localStorage.removeItem('finance-market-cache'); S = blank(); save(); renderAll(); toast('Данные удалены'); } };
  $('#sDemoDel').onclick = function () { var ids = S.accounts.filter(function (a) { return a.demo; }).map(function (a) { return a.id; }); S.accounts = S.accounts.filter(function (a) { return !a.demo; }); S.tx = S.tx.filter(function (t) { return ids.indexOf(t.accountId) < 0; }); S.holdings = S.holdings.filter(function (h) { return !h.demo; }); save(); renderAll(); };
  $('#sSave').onclick = function () { S.rules = $('#sRules').value.split('\n').map(function (l) { var i = l.indexOf(':'); return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : null; }).filter(Boolean); save(); toast('Правила сохранены'); };
  $('#sRecat').onclick = function () { S.tx.forEach(function (t) { t.category = Core.categorize({ description: t.description, amount: t.amount, category: '' }, S.rules); }); save(); renderAll(); toast('Категории обновлены'); };
}
var RENDER = { overview: renderOverview, tx: renderTx, accounts: renderAccounts, import: renderImport, settings: renderSettings };
function renderAll() { Object.keys(RENDER).forEach(function (k) { try { RENDER[k](); } catch (e) { console.error(k, e); } }); }
document.querySelectorAll('#tabs button').forEach(function (b) { b.onclick = function () { document.querySelectorAll('#tabs button,.tab').forEach(function (x) { x.classList.remove('on'); }); b.classList.add('on'); $('#' + b.dataset.tab).classList.add('on'); $('#disclaimer').classList.toggle('hidden', ['market', 'portfolio', 'forecast', 'ideas'].indexOf(b.dataset.tab) < 0); if (RENDER[b.dataset.tab] && b.dataset.tab !== 'tx') RENDER[b.dataset.tab](); }; });
renderAll();

/* ---- мобильные улучшения: таблицы -> карточки (data-label), сворачиваемые секции, перерисовка графиков при повороте ---- */
function enhance(root) {
  (root || document).querySelectorAll('table').forEach(function (t) { var hr = t.rows[0]; if (!hr || !hr.querySelector('th')) return; var labels = Array.from(hr.cells).map(function (c) { return c.textContent.trim(); });
    t.classList.add('cards'); Array.from(t.rows).slice(1).forEach(function (r) { Array.from(r.cells).forEach(function (c, i) { if (!c.hasAttribute('data-label')) c.setAttribute('data-label', labels[i] || ''); if (c.classList.contains('why') || /Почему|Описание|Действие/.test(labels[i] || '')) c.classList.add('wide'); }); }); });
}
var COLL = JSON.parse(localStorage.getItem('finance-ui-collapsed') || '{}');
document.addEventListener('click', function (e) { var h = e.target.closest && e.target.closest('.card>h3'); if (!h) return; var c = h.parentNode, k = h.textContent.replace(/[\d\s().,:%₽-]+$/, '').slice(0, 40); c.classList.toggle('collapsed'); COLL[k] = c.classList.contains('collapsed'); localStorage.setItem('finance-ui-collapsed', JSON.stringify(COLL)); });
function applyCollapsed() { document.querySelectorAll('.card>h3').forEach(function (h) { var k = h.textContent.replace(/[\d\s().,:%₽-]+$/, '').slice(0, 40); if (COLL[k] || (COLL[k] === undefined && innerWidth < 720 && /^(Добавить|Новый счёт|Правила)/.test(k))) h.parentNode.classList.add('collapsed'); }); }
new MutationObserver(function () { enhance(); applyCollapsed(); }).observe(document.querySelector('main'), { childList: true, subtree: true });
enhance(); applyCollapsed();
var _wasMobile = innerWidth < 720; addEventListener('resize', function () { var m = innerWidth < 720; if (m !== _wasMobile) { _wasMobile = m; renderAll(); } });
document.querySelectorAll('#tabs button').forEach(function (b) { b.addEventListener('click', function () { window.scrollTo(0, 0); }); });
