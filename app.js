/* Мои финансы — оболочка приложения и личные финансы. Данные только в localStorage этого браузера. */
var KEY = 'finance-local-v1';
function blank() { return { app: 'finance-local', version: 2, accounts: [], tx: [], rules: Core.DEFAULT_RULES.map(function (r) { return r.slice(); }), rates: { USD: '', EUR: '', CNY: '' }, holdings: [], risk: null, invest: {}, ui: { hide: false, theme: 'auto', banner: true } }; }
function load() { try { var s = JSON.parse(localStorage.getItem(KEY)); if (s && s.app === 'finance-local') { var b = blank(); for (var k in b) if (s[k] === undefined) s[k] = b[k]; for (k in b.ui) if (s.ui[k] === undefined) s.ui[k] = b.ui[k]; s.version = 2; return s; } } catch (e) {} return blank(); }
var S = load();
function save() { localStorage.setItem(KEY, JSON.stringify(S)); }
function $(s, r) { return (r || document).querySelector(s); }
function $$(s, r) { return Array.from((r || document).querySelectorAll(s)); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
var SYM = { RUB: '₽', USD: '$', EUR: '€', CNY: '¥' };
function fmt(n, cur, dec) { if (n == null || !isFinite(n)) return '—'; var d = dec == null ? 2 : dec; return n.toLocaleString('ru-RU', { minimumFractionDigits: d, maximumFractionDigits: d }) + (cur ? '\u00a0' + (SYM[cur] || cur) : ''); }
function money(n, cur, dec) { var s = fmt(n, cur, dec); return S.ui.hide ? '<span class="mask" aria-label="скрыто">' + s + '</span>' : s; }
function signed(n, cur) { return (n > 0 ? '+' : n < 0 ? '−' : '') + money(Math.abs(n), cur); }
function pct(x, d) { return x == null || !isFinite(x) ? '—' : (x > 0 ? '+' : '') + (x * 100).toFixed(d == null ? 1 : d) + '%'; }
function pctp(x) { return x == null || !isFinite(x) ? '—' : (x * 100).toFixed(1) + '%'; }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function haptic() { try { navigator.vibrate && navigator.vibrate(8); } catch (e) {} }
function toast(m) { var t = document.createElement('div'); t.className = 'toast'; t.textContent = m; $('#toasts').appendChild(t); setTimeout(function () { t.remove(); }, 3200); }
function acc(id) { return S.accounts.find(function (a) { return a.id === id; }); }
function ensureAccount(name, cur, type) { var a = S.accounts.find(function (x) { return x.name === name; }); if (!a) { a = { id: uid(), name: name, currency: cur || 'RUB', type: type || 'bank', start: 0, manual: null }; S.accounts.push(a); } return a; }
function balance(a) { if (a.manual != null && a.manual !== '') return +a.manual; return (+a.start || 0) + S.tx.filter(function (t) { return t.accountId === a.id; }).reduce(function (s, t) { return s + t.amount; }, 0); }
function toRUB(v, cur) { if (cur === 'RUB') return v; var r = +S.rates[cur]; return r ? v * r : null; }
function ym(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2); }
function addTx(list, a) {
  var keys = {}; S.tx.forEach(function (t) { keys[t.accountId + t.date + t.amount.toFixed(2) + t.description] = 1; }); var n = 0;
  list.forEach(function (t) { var k = a.id + t.date + t.amount.toFixed(2) + t.description; if (keys[k]) return; keys[k] = 1; n++;
    S.tx.push({ id: uid(), accountId: a.id, date: t.date, amount: t.amount, currency: t.currency || a.currency, description: t.description, category: Core.categorize(t, S.rules), demo: t.demo || undefined }); });
  return n;
}
function monthlySurplus() {
  var m = Core.monthly(S.tx, 'RUB'), now = new Date(), res = [];
  for (var i = 1; i <= 3; i++) { var k = ym(new Date(now.getFullYear(), now.getMonth() - i, 1)); if (m[k]) res.push(m[k]); }
  if (!res.length) return null; var inc = Core.mean(res.map(function (x) { return x.inc; })), exp = Core.mean(res.map(function (x) { return x.exp; }));
  return { inc: inc, exp: exp, surplus: inc - exp, months: res.length };
}
function totals() { var byCur = {}, tot = 0, miss = false; S.accounts.forEach(function (a) { var b = balance(a); byCur[a.currency] = (byCur[a.currency] || 0) + b; }); Object.keys(byCur).forEach(function (c) { var v = toRUB(byCur[c], c); if (v == null) miss = true; else tot += v; }); return { byCur: byCur, rub: tot, miss: miss }; }
/* ---- категории: эмодзи и цвета ---- */
var CAT = { 'Продукты': ['🛒', '#2f9e44'], 'Кафе и рестораны': ['☕', '#e8590c'], 'Транспорт': ['🚕', '#f59f00'], 'Связь и интернет': ['📱', '#1098ad'], 'ЖКХ': ['🏠', '#5c7cfa'], 'Здоровье': ['💊', '#e64980'], 'Подписки и развлечения': ['🎬', '#7048e8'], 'Одежда и товары': ['🛍️', '#d6336c'], 'Переводы': ['🔁', '#868e96'], 'Зарплата': ['💰', '#12a150'], 'Проценты и кэшбэк': ['🎁', '#0ca678'], 'Прочие доходы': ['➕', '#12a150'], 'Прочее': ['•', '#868e96'] };
function cat(c) { var m = CAT[c]; if (m) return m; var h = 0; for (var i = 0; i < (c || '').length; i++) h = (h * 31 + c.charCodeAt(i)) >>> 0; return ['🏷️', Charts.PAL[h % Charts.PAL.length]]; }
function ava(c) { var m = cat(c); return '<span class="ava" style="background:' + m[1] + '22" aria-hidden="true">' + m[0] + '</span>'; }
var ACC_BG = { bank: 'linear-gradient(135deg,#3d5afe,#5f7bff)', cash: 'linear-gradient(135deg,#12a150,#38c172)', crypto: 'linear-gradient(135deg,#f59f00,#ff922b)', broker: 'linear-gradient(135deg,#7048e8,#9775fa)', other: 'linear-gradient(135deg,#495057,#868e96)' };
var ACC_IC = { bank: '💳', cash: '💵', crypto: '🪙', broker: '📊', other: '👛' };
/* ---- bottom sheet ---- */
var _sheetClose = null;
function openSheet(title, html, mount, onClose) { $('#sheetTitle').textContent = title; $('#sheetBody').innerHTML = html; $('#sheetBody').scrollTop = 0; var w = $('#sheetWrap'); w.classList.add('open'); w.setAttribute('aria-hidden', 'false'); _sheetClose = onClose || null; if (mount) mount($('#sheetBody')); setTimeout(function () { var f = $('#sheetBody [autofocus]'); if (f && innerWidth >= 900) f.focus(); }, 300); }
function closeSheet() { var w = $('#sheetWrap'); w.classList.remove('open'); w.setAttribute('aria-hidden', 'true'); if (_sheetClose) { var f = _sheetClose; _sheetClose = null; f(); } }
$('#backdrop').onclick = closeSheet; $('#sheetX').onclick = closeSheet; document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });
(function () { var sy = null, sh = $('#sheet'); sh.addEventListener('touchstart', function (e) { if ($('#sheetBody').scrollTop <= 0) sy = e.touches[0].clientY; }, { passive: true }); sh.addEventListener('touchmove', function (e) { if (sy == null) return; var dy = e.touches[0].clientY - sy; if (dy > 0) sh.style.transform = 'translateY(' + dy + 'px)'; }, { passive: true }); sh.addEventListener('touchend', function (e) { if (sy == null) return; var dy = e.changedTouches[0].clientY - sy; sh.style.transform = ''; sy = null; if (dy > 90) closeSheet(); }); })();
/* ---- навигация ---- */
var VIEW = 'home', TITLES = { home: 'Главная', ops: 'Операции', invest: 'Инвестиции', ideas: 'Идеи', more: 'Ещё' }, RENDER = {};
function go(v) { VIEW = v; $$('.nav button').forEach(function (b) { var on = b.dataset.view === v; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); }); $$('.view').forEach(function (s) { s.classList.toggle('on', s.id === 'v-' + v); }); $('#title').textContent = TITLES[v];
  $('#fab').classList.toggle('hidden', !(v === 'home' || v === 'ops') || !hasData()); $('#banner').classList.toggle('hidden', !(v === 'invest' || v === 'ideas') || S.ui.banner === false); if (RENDER[v]) RENDER[v](); window.scrollTo(0, 0); }
$$('.nav button').forEach(function (b) { b.onclick = function () { haptic(); go(b.dataset.view); }; });
$('#fab').onclick = function () { haptic(); txSheet(); };
$('#bannerX').onclick = function () { S.ui.banner = false; save(); $('#banner').classList.add('hidden'); };
$('#hideBtn').onclick = function () { S.ui.hide = !S.ui.hide; save(); $('#hideBtn').textContent = S.ui.hide ? '🙈' : '👁'; renderAll(); };
function applyTheme() { document.documentElement.dataset.theme = S.ui.theme; }
$('#themeBtn').onclick = function () { var order = ['auto', 'light', 'dark'], dark = matchMedia('(prefers-color-scheme: dark)').matches; S.ui.theme = S.ui.theme === 'auto' ? (dark ? 'light' : 'dark') : S.ui.theme === 'dark' ? 'light' : 'dark'; save(); applyTheme(); toast(S.ui.theme === 'dark' ? 'Тёмная тема' : 'Светлая тема'); };
function hasData() { return S.accounts.length > 0 || S.tx.length > 0; }
function renderAll() { Object.keys(RENDER).forEach(function (k) { if (k === VIEW) try { RENDER[k](); } catch (e) { console.error(k, e); } }); $('#fab').classList.toggle('hidden', !(VIEW === 'home' || VIEW === 'ops') || !hasData()); }
/* ================= Главная ================= */
function onboarding() { return '<div class="empty"><div class="big">👋</div><h2>Добро пожаловать!</h2><p class="muted">Приложение работает полностью в вашем браузере — данные никуда не отправляются. С чего начнём?</p><div class="opts">' +
  '<button class="opt" data-act="import"><span class="ava">📥</span><span><b>Загрузить выписку</b><br><span class="muted">CSV Сбера, Т‑Банка, Альфы, OFX, JSON</span></span></button>' +
  '<button class="opt" data-act="manual"><span class="ava">✍️</span><span><b>Добавить вручную</b><br><span class="muted">Создать счёт и первую операцию</span></span></button>' +
  '<button class="opt" data-act="demo"><span class="ava">🎲</span><span><b>Посмотреть демо</b><br><span class="muted">Вымышленные данные, можно удалить в «Ещё»</span></span></button></div></div>'; }
function bindActs(root) { $$('[data-act]', root).forEach(function (b) { b.onclick = function () { haptic(); var a = b.dataset.act; if (a === 'import') importSheet(); else if (a === 'demo') loadDemo(); else if (a === 'manual') { if (!S.accounts.length) { ensureAccount('Основная карта', 'RUB', 'bank'); save(); } txSheet(); } else if (a === 'quotes') { go('invest'); window.Invest && Invest.refresh(); } else if (a === 'acc') accountSheet(); else if (a === 'allops') go('ops'); }; }); }
function renderHome() {
  var el = $('#v-home'); if (!hasData()) { el.innerHTML = onboarding(); bindActs(el); return; }
  var T = totals(), now = new Date(), cm = ym(now), mon = Core.monthly(S.tx, 'RUB'), x = mon[cm] || { inc: 0, exp: 0 }, pm = mon[ym(new Date(now.getFullYear(), now.getMonth() - 1, 1))] || { inc: 0, exp: 0 };
  var cats = {}; S.tx.forEach(function (t) { if (t.amount < 0 && t.date.slice(0, 7) === cm && t.currency === 'RUB') cats[t.category] = (cats[t.category] || 0) - t.amount; });
  var top = Object.keys(cats).map(function (k) { return { name: k, value: cats[k], color: cat(k)[1] }; }).sort(function (a, b) { return b.value - a.value; });
  var last = S.tx.slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; }).slice(0, 5);
  var mx = Math.max(x.inc, x.exp, 1), dExp = pm.exp ? x.exp / pm.exp - 1 : null;
  el.innerHTML = '<div class="cols"><div>' +
    '<div class="hero"><div class="label">Всего на счетах <button class="icon-btn sm eye" id="eye2" aria-label="Скрыть/показать суммы">' + (S.ui.hide ? '🙈' : '👁') + '</button></div><div class="amount">' + money(T.rub, 'RUB') + '</div><div class="sub">' + Object.keys(T.byCur).map(function (c) { return money(T.byCur[c], c); }).join(' · ') + (T.miss ? ' · задайте курсы в «Ещё»' : '') + '</div></div>' +
    '<div class="quick"><button data-q="add"><span>➕</span><span>Операция</span></button><button data-act="import"><span>📥</span><span>Импорт</span></button><button data-act="quotes"><span>🔄</span><span>Котировки</span></button></div>' +
    '<div class="sec-title"><h3>Счета</h3><button class="link" data-act="acc">Все</button></div><div class="hscroll" role="list">' + S.accounts.map(function (a) { return '<button class="acc-card" role="listitem" data-acc="' + a.id + '" style="background:' + (ACC_BG[a.type] || ACC_BG.other) + '"><span class="t">' + (ACC_IC[a.type] || '👛') + ' ' + esc(a.name) + '</span><span class="b">' + money(balance(a), a.currency) + '</span></button>'; }).join('') + '<button class="acc-card add" data-act="acc">＋ Счёт</button></div>' +
    '<div class="card"><h3>Этот месяц</h3><div class="stat2"><div><div class="muted">Доходы</div><div class="v pos">' + money(x.inc, 'RUB', 0) + '</div><div class="bar"><i style="width:' + (x.inc / mx * 100) + '%;background:var(--pos)"></i></div></div><div><div class="muted">Расходы</div><div class="v neg">' + money(x.exp, 'RUB', 0) + '</div><div class="bar"><i style="width:' + (x.exp / mx * 100) + '%;background:var(--neg)"></i></div></div></div>' +
    '<p class="muted small" style="margin:12px 0 0">Итог месяца: <b class="' + (x.inc - x.exp >= 0 ? 'pos' : 'neg') + '">' + signed(x.inc - x.exp, 'RUB') + '</b>' + (dExp != null ? ' · расходы ' + (dExp > 0 ? 'выше' : 'ниже') + ' прошлого месяца на ' + pctp(Math.abs(dExp)) : '') + '</p></div>' +
    '</div><div>' +
    '<div class="card"><h3>Куда уходят деньги</h3>' + (top.length ? '<div class="donutbox">' + Charts.ring(top.slice(0, 6), S.ui.hide ? '' : fmt(x.exp / 1000, '', 0) + 'k') + '<div class="legend">' + top.slice(0, 3).map(function (c) { return '<div><i style="background:' + c.color + '"></i>' + cat(c.name)[0] + ' ' + esc(c.name) + '<b style="margin-left:auto">' + money(c.value, 'RUB', 0) + '</b></div>'; }).join('') + '</div></div>' : '<p class="muted">В этом месяце расходов пока нет.</p>') + '</div>' +
    '<div class="card"><h3>По месяцам</h3>' + monthChart(mon) + '</div>' +
    '<div class="sec-title"><h3>Последние операции</h3><button class="link" data-act="allops">Все</button></div><div class="list">' + last.map(txRow).join('') + '</div></div></div>';
  bindActs(el); $('[data-q=add]', el).onclick = function () { haptic(); txSheet(); }; $('#eye2').onclick = function () { $('#hideBtn').click(); };
  $$('[data-acc]', el).forEach(function (b) { b.onclick = function () { accountSheet(b.dataset.acc); }; }); bindTxRows(el);
}
function monthChart(mon) { var now = new Date(), ms = []; for (var i = 5; i >= 0; i--) ms.push(ym(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  return Charts.bars(ms.map(function (m) { return ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'][+m.slice(5) - 1]; }), [{ name: 'Доходы', color: 'var(--pos)', data: ms.map(function (m) { return (mon[m] || {}).inc || 0; }) }, { name: 'Расходы', color: 'var(--neg)', data: ms.map(function (m) { return (mon[m] || {}).exp || 0; }) }]); }
function txRow(t) { var a = acc(t.accountId) || {}; return '<button class="item" data-tx="' + t.id + '">' + ava(t.category) + '<span class="mid"><span class="t1">' + esc(t.description || t.category) + '</span><span class="t2">' + esc(t.category) + ' · ' + esc(a.name || '') + '</span></span><span class="amt ' + (t.amount > 0 ? 'pos' : '') + '">' + signed(t.amount, t.currency) + '</span></button>'; }
function bindTxRows(root) { $$('[data-tx]', root).forEach(function (b) { b.onclick = function () { haptic(); txSheet(S.tx.find(function (t) { return t.id === b.dataset.tx; })); }; }); }
/* ================= Операции ================= */
var F = { q: '', period: 'all', acc: '', cat: '', from: '', to: '' }, PERIODS = { all: 'Всё время', month: 'Этот месяц', prev: 'Прошлый месяц', d90: '90 дней', custom: 'Период…' };
function periodRange() { var n = new Date(); if (F.period === 'month') return [ym(n) + '-01', '9999']; if (F.period === 'prev') { var p = ym(new Date(n.getFullYear(), n.getMonth() - 1, 1)); return [p + '-01', p + '-31']; } if (F.period === 'd90') return [new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10), '9999']; if (F.period === 'custom') return [F.from || '0000', F.to || '9999']; return ['0000', '9999']; }
function filtered() { var r = periodRange(), q = F.q.toLowerCase(); return S.tx.filter(function (t) { return t.date >= r[0] && t.date <= r[1] && (!F.acc || t.accountId === F.acc) && (!F.cat || t.category === F.cat) && (!q || (t.description + ' ' + t.category + ' ' + t.amount).toLowerCase().indexOf(q) >= 0); }).sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; }); }
function dayLabel(d) { var t = new Date().toISOString().slice(0, 10), y = new Date(Date.now() - 864e5).toISOString().slice(0, 10); if (d === t) return 'Сегодня'; if (d === y) return 'Вчера'; return new Date(d + 'T12:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short', year: d.slice(0, 4) === t.slice(0, 4) ? undefined : 'numeric' }); }
function renderOps() {
  var el = $('#v-ops'); if (!hasData()) { el.innerHTML = onboarding(); bindActs(el); return; }
  var list = filtered(), groups = [], cur = null, shown = 0;
  list.forEach(function (t) { if (shown >= 400) return; if (!cur || cur.d !== t.date) { cur = { d: t.date, items: [], sum: 0 }; groups.push(cur); } cur.items.push(t); cur.sum += t.currency === 'RUB' ? t.amount : 0; shown++; });
  var inc = list.reduce(function (s, t) { return s + (t.amount > 0 && t.currency === 'RUB' ? t.amount : 0); }, 0), exp = list.reduce(function (s, t) { return s + (t.amount < 0 && t.currency === 'RUB' ? -t.amount : 0); }, 0);
  var focused = document.activeElement && document.activeElement.id === 'opsQ';
  el.innerHTML = '<div class="searchbar"><label class="search"><span aria-hidden="true">🔍</span><input id="opsQ" type="search" placeholder="Поиск по операциям" aria-label="Поиск по операциям" value="' + esc(F.q) + '"></label><div class="chips">' +
    '<button class="chip' + (F.period !== 'all' ? ' on' : '') + '" data-f="period">📅 ' + PERIODS[F.period] + '</button><button class="chip' + (F.acc ? ' on' : '') + '" data-f="acc">💳 ' + esc(F.acc ? (acc(F.acc) || {}).name : 'Все счета') + '</button><button class="chip' + (F.cat ? ' on' : '') + '" data-f="cat">🏷️ ' + esc(F.cat || 'Категории') + '</button>' + (F.period !== 'all' || F.acc || F.cat || F.q ? '<button class="chip" data-f="reset">✕ Сбросить</button>' : '') + '</div></div>' +
    '<div class="card stat2"><div><div class="muted">Поступления</div><div class="v pos">' + money(inc, 'RUB', 0) + '</div></div><div><div class="muted">Траты</div><div class="v neg">' + money(exp, 'RUB', 0) + '</div></div></div>' +
    (groups.length ? groups.map(function (g) { return '<div class="day"><span>' + dayLabel(g.d) + '</span><span>' + (g.sum ? signed(g.sum, 'RUB') : '') + '</span></div><div class="list">' + g.items.map(txRow).join('') + '</div>'; }).join('') : '<div class="empty"><div class="big">🔎</div><p class="muted">Ничего не найдено</p></div>') + (list.length > 400 ? '<p class="muted">Показаны первые 400 из ' + list.length + '. Уточните фильтр.</p>' : '');
  var q = $('#opsQ'); q.oninput = function () { F.q = q.value; renderOps(); var n = $('#opsQ'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); }; if (focused) q.focus();
  $$('[data-f]', el).forEach(function (b) { b.onclick = function () { haptic(); var f = b.dataset.f; if (f === 'reset') { F = { q: '', period: 'all', acc: '', cat: '', from: '', to: '' }; renderOps(); } else filterSheet(f); }; });
  bindTxRows(el);
}
function cats() { return Array.from(new Set(S.rules.map(function (r) { return r[0]; }).concat(S.tx.map(function (t) { return t.category; })).concat(['Прочие доходы', 'Прочее']))).filter(Boolean); }
function filterSheet(kind) {
  var opts = kind === 'period' ? Object.keys(PERIODS).map(function (k) { return [k, PERIODS[k]]; }) : kind === 'acc' ? [['', 'Все счета']].concat(S.accounts.map(function (a) { return [a.id, a.name]; })) : [['', 'Все категории']].concat(cats().map(function (c) { return [c, cat(c)[0] + ' ' + c]; }));
  openSheet(kind === 'period' ? 'Период' : kind === 'acc' ? 'Счёт' : 'Категория', '<div class="list">' + opts.map(function (o) { return '<button class="item" data-v="' + esc(o[0]) + '"><span class="mid t1">' + esc(o[1]) + '</span>' + (F[kind] === o[0] ? '<b style="color:var(--accent)">✓</b>' : '') + '</button>'; }).join('') + '</div>' + (kind === 'period' ? '<div class="row2" style="margin-top:12px"><div class="field"><label for="pf">С</label><input type="date" id="pf" value="' + F.from + '"></div><div class="field"><label for="pt">По</label><input type="date" id="pt" value="' + F.to + '"></div></div><button class="btn block" id="pApply">Применить период</button>' : ''),
    function (b) { $$('[data-v]', b).forEach(function (x) { x.onclick = function () { if (x.dataset.v === 'custom') return; F[kind] = x.dataset.v; closeSheet(); renderOps(); }; }); var ap = $('#pApply', b); if (ap) ap.onclick = function () { F.period = 'custom'; F.from = $('#pf').value; F.to = $('#pt').value; closeSheet(); renderOps(); }; });
}
/* ---- добавление / редактирование операции ---- */
function txSheet(t) {
  if (!S.accounts.length) { ensureAccount('Основная карта', 'RUB', 'bank'); save(); }
  var isNew = !t, sign = t ? (t.amount >= 0 ? 1 : -1) : -1, chosen = t ? t.category : '';
  function grid() { return cats().filter(function (c) { return sign > 0 ? /доход|Зарплата|Проценты|Переводы/.test(c) || c === chosen : !/Зарплата|Прочие доходы|Проценты/.test(c) || c === chosen; }).map(function (c) { return '<button type="button" data-c="' + esc(c) + '" class="' + (c === chosen ? 'on' : '') + '" aria-pressed="' + (c === chosen) + '"><span class="ava" style="background:' + cat(c)[1] + '22;flex:0 0 40px;width:40px;height:40px">' + cat(c)[0] + '</span>' + esc(c) + '</button>'; }).join(''); }
  openSheet(isNew ? 'Новая операция' : 'Операция', '<div class="seg" role="tablist"><button data-s="-1" class="' + (sign < 0 ? 'on' : '') + '">Расход</button><button data-s="1" class="' + (sign > 0 ? 'on' : '') + '">Доход</button></div>' +
    '<input class="bigamt" id="tAmt" inputmode="decimal" placeholder="0 ₽" aria-label="Сумма" autofocus value="' + (t ? String(Math.abs(t.amount)).replace('.', ',') : '') + '">' +
    '<div class="field"><label for="tDesc">Описание</label><input id="tDesc" placeholder="Например, Пятерочка" value="' + esc(t ? t.description : '') + '"></div>' +
    '<div class="field"><label>Категория</label><div class="catgrid" id="tCats">' + grid() + '</div></div>' +
    '<div class="row2"><div class="field"><label for="tDate">Дата</label><input type="date" id="tDate" value="' + (t ? t.date : new Date().toISOString().slice(0, 10)) + '"></div><div class="field"><label for="tAcc">Счёт</label><select id="tAcc">' + S.accounts.map(function (a) { return '<option value="' + a.id + '"' + (t && t.accountId === a.id ? ' selected' : '') + '>' + esc(a.name) + '</option>'; }).join('') + '</select></div></div>' +
    '<button class="btn block" id="tSave">' + (isNew ? 'Добавить' : 'Сохранить') + '</button>' + (isNew ? '' : '<div style="height:8px"></div><button class="btn danger block" id="tDel">Удалить операцию</button>'),
    function (b) {
      function bindCats() { $$('[data-c]', b).forEach(function (x) { x.onclick = function () { haptic(); chosen = x.dataset.c; $$('[data-c]', b).forEach(function (y) { y.classList.toggle('on', y === x); y.setAttribute('aria-pressed', y === x); }); }; }); } bindCats();
      $$('[data-s]', b).forEach(function (x) { x.onclick = function () { sign = +x.dataset.s; $$('[data-s]', b).forEach(function (y) { y.classList.toggle('on', y === x); }); $('#tCats').innerHTML = grid(); bindCats(); }; });
      $('#tSave').onclick = function () { var v = Math.abs(Core.parseAmount($('#tAmt').value)); if (!v) { toast('Введите сумму'); return; } var a = acc($('#tAcc').value), desc = $('#tDesc').value.trim(), amount = sign * v;
        var c = chosen || Core.categorize({ description: desc, amount: amount, category: '' }, S.rules);
        if (isNew) S.tx.push({ id: uid(), accountId: a.id, date: $('#tDate').value, amount: amount, currency: a.currency, description: desc, category: c }); else { t.amount = amount; t.description = desc; t.category = c; t.date = $('#tDate').value || t.date; t.accountId = a.id; t.currency = a.currency; }
        save(); haptic(); closeSheet(); renderAll(); toast(isNew ? 'Операция добавлена' : 'Сохранено'); };
      var d = $('#tDel'); if (d) d.onclick = function () { if (!confirm('Удалить операцию?')) return; S.tx = S.tx.filter(function (x) { return x !== t; }); save(); closeSheet(); renderAll(); toast('Удалено'); };
    });
}
/* ================= Ещё ================= */
function renderMore() {
  var el = $('#v-more'), item = function (act, ic, t, s) { return '<button class="item" data-m="' + act + '"><span class="ava" style="background:var(--accent-2)">' + ic + '</span><span class="mid"><span class="t1">' + t + '</span><span class="t2">' + s + '</span></span><span class="muted">›</span></button>'; };
  el.innerHTML = '<div class="cols"><div><div class="sec-title"><h3>Данные</h3></div><div class="list">' + item('import', '📥', 'Импорт выписки', 'CSV, OFX/QFX, JSON') + item('acc', '💳', 'Счета и кошельки', S.accounts.length + ' шт.') + item('rules', '🏷️', 'Категории и правила', 'Автокатегоризация по словам') + item('rates', '💱', 'Курсы валют', 'Ручные или ЦБ РФ') + '</div>' +
    '<div class="sec-title"><h3>Резервная копия</h3></div><div class="list">' + item('export', '💾', 'Экспорт в JSON', 'Сохранить все данные в файл') + item('restore', '♻️', 'Восстановить из файла', 'Заменит текущие данные') + '</div></div><div>' +
    '<div class="sec-title"><h3>Оформление</h3></div><div class="card"><div class="seg" id="thSeg"><button data-t="auto">Авто</button><button data-t="light">Светлая</button><button data-t="dark">Тёмная</button></div><label class="item" style="padding:0;min-height:48px;border:0"><span class="mid">Скрывать суммы</span><input type="checkbox" id="hideChk" style="width:24px;min-height:24px"' + (S.ui.hide ? ' checked' : '') + '></label></div>' +
    '<div class="sec-title"><h3>Демо и очистка</h3></div><div class="list">' + item('demo', '🎲', 'Загрузить демо‑данные', 'Вымышленные операции и портфель') + item('demodel', '🧹', 'Удалить демо‑данные', 'Только помеченные «демо»') + item('clear', '🗑️', 'Удалить все данные', 'Безвозвратно, сначала сделайте экспорт') + '</div>' +
    '<div class="card" style="margin-top:16px"><h3>🔒 Конфиденциальность</h3><p class="muted">Все данные хранятся только в этом браузере. Сеть используется только для публичных котировок (MOEX, ЦБ РФ, CoinGecko) по вашему действию; в запросах — только тикеры. Нет аналитики и трекеров.</p></div></div></div><input type="file" id="restoreFile" accept=".json" hidden>';
  $$('#thSeg button').forEach(function (b) { b.classList.toggle('on', b.dataset.t === S.ui.theme); b.onclick = function () { S.ui.theme = b.dataset.t; save(); applyTheme(); renderMore(); }; });
  $('#hideChk').onchange = function () { $('#hideBtn').click(); };
  $('#restoreFile').onchange = function () { var f = this.files[0]; f && f.arrayBuffer().then(function (b) { importBuffer(f.name, b, '', 'RUB'); }); };
  $$('[data-m]', el).forEach(function (b) { b.onclick = function () { haptic(); ({ import: importSheet, acc: function () { accountSheet(); }, rules: rulesSheet, rates: ratesSheet, export: exportJSON, restore: function () { $('#restoreFile').click(); }, demo: loadDemo, demodel: deleteDemo, clear: clearAll })[b.dataset.m](); }; });
}
function importSheet() {
  openSheet('Импорт выписки', '<p class="muted">Файлы обрабатываются только в вашем браузере. Поддерживаются CSV Сбера, Т‑Банка, Альфы и др. (разделитель «;»/«,», UTF‑8/Windows‑1251), OFX/QFX и JSON.</p>' +
    '<div class="field"><label for="iAcc">В какой счёт</label><select id="iAcc"><option value="">Новый счёт по имени файла</option>' + S.accounts.map(function (a) { return '<option value="' + a.id + '">' + esc(a.name) + '</option>'; }).join('') + '</select></div>' +
    '<div class="field"><label for="iCur">Валюта по умолчанию</label><input id="iCur" value="RUB"></div><label class="btn block" for="iFile">📂 Выбрать файлы</label><input type="file" id="iFile" multiple accept=".csv,.txt,.ofx,.qfx,.json" hidden>' +
    '<details style="margin-top:12px"><summary>Как выгрузить выписку из банка</summary><p class="muted small"><b>Т‑Банк:</b> веб‑версия → Операции → период → Выгрузить → CSV/OFX.<br><b>Сбер:</b> СберБанк Онлайн (веб) → карта/счёт → Выписки и справки; если есть только Excel — сохраните как CSV.<br><b>Альфа:</b> Альфа‑Онлайн → Счёт → Выписка → CSV/Excel.<br>Нужны колонки «Дата» и «Сумма» (или «Приход»/«Расход»).</p></details>',
    function (b) { $('#iFile', b).onchange = function () { var accId = $('#iAcc').value, cur = $('#iCur').value.trim().toUpperCase() || 'RUB'; Array.from(this.files).forEach(function (f) { f.arrayBuffer().then(function (buf) { importBuffer(f.name, buf, accId, cur); }); }); closeSheet(); }; });
}
function importBuffer(name, buf, accId, cur) {
  try { var r = Core.parseFile(name, buf);
    if (r.backup) { if (confirm('Это резервная копия. Заменить все текущие данные?')) { S = r.backup; var b = blank(); for (var k in b) if (S[k] === undefined) S[k] = b[k]; for (k in b.ui) if (S.ui[k] === undefined) S.ui[k] = b.ui[k]; save(); applyTheme(); renderAll(); toast('Резервная копия восстановлена'); } return; }
    var a = accId ? acc(accId) : ensureAccount(name.replace(/\.[^.]+$/, ''), r.currency || cur, 'bank'), n = addTx(r.transactions, a); save(); go(VIEW === 'more' ? 'ops' : VIEW);
    toast('✔ ' + name + ': ' + r.format + ', добавлено ' + n + ' из ' + r.transactions.length + (r.transactions.length - n ? ' (дубликаты пропущены)' : ''));
  } catch (e) { toast('✖ ' + name + ': ' + e.message); }
}
function accountSheet(focusId) {
  var a = focusId && acc(focusId);
  if (a) { openSheet(a.name, '<div class="hero" style="background:' + (ACC_BG[a.type] || ACC_BG.other) + '"><div class="label">' + (ACC_IC[a.type] || '') + ' Баланс</div><div class="amount">' + money(balance(a), a.currency) + '</div><div class="sub">' + S.tx.filter(function (t) { return t.accountId === a.id; }).length + ' операций</div></div>' +
      '<div class="field"><label for="eN">Название</label><input id="eN" value="' + esc(a.name) + '"></div><div class="row2"><div class="field"><label for="eC">Валюта</label><input id="eC" value="' + esc(a.currency) + '"></div><div class="field"><label for="eT">Тип</label><select id="eT">' + Object.keys(ACC_IC).map(function (k) { return '<option value="' + k + '"' + (a.type === k ? ' selected' : '') + '>' + ACC_IC[k] + ' ' + { bank: 'Карта/счёт', cash: 'Наличные', crypto: 'Крипто', broker: 'Брокерский', other: 'Другое' }[k] + '</option>'; }).join('') + '</select></div></div>' +
      '<div class="row2"><div class="field"><label for="eS">Начальный баланс</label><input id="eS" inputmode="decimal" value="' + (a.start || 0) + '"></div><div class="field"><label for="eM">Ручной баланс</label><input id="eM" inputmode="decimal" placeholder="авто" value="' + (a.manual == null ? '' : a.manual) + '"></div></div><p class="muted small">Ручной баланс заменяет расчёт по операциям — удобно для наличных и крипты.</p>' +
      '<button class="btn block" id="eSave">Сохранить</button><div style="height:8px"></div><button class="btn sec block" id="eOps">Операции счёта</button><div style="height:8px"></div><button class="btn danger block" id="eDel">Удалить счёт и операции</button>',
      function () { $('#eSave').onclick = function () { a.name = $('#eN').value.trim() || a.name; a.currency = $('#eC').value.trim().toUpperCase() || 'RUB'; a.type = $('#eT').value; a.start = Core.parseAmount($('#eS').value) || 0; a.manual = $('#eM').value === '' ? null : Core.parseAmount($('#eM').value); save(); closeSheet(); renderAll(); toast('Счёт сохранён'); };
        $('#eOps').onclick = function () { F = { q: '', period: 'all', acc: a.id, cat: '', from: '', to: '' }; closeSheet(); go('ops'); };
        $('#eDel').onclick = function () { if (!confirm('Удалить счёт «' + a.name + '» и все его операции?')) return; S.accounts = S.accounts.filter(function (x) { return x !== a; }); S.tx = S.tx.filter(function (t) { return t.accountId !== a.id; }); save(); closeSheet(); renderAll(); toast('Счёт удалён'); }; }); return; }
  openSheet('Счета и кошельки', '<div class="list">' + S.accounts.map(function (x) { return '<button class="item" data-a="' + x.id + '"><span class="ava" style="background:var(--accent-2)">' + (ACC_IC[x.type] || '👛') + '</span><span class="mid"><span class="t1">' + esc(x.name) + '</span><span class="t2">' + x.currency + (x.manual != null ? ' · ручной баланс' : '') + '</span></span><span class="amt">' + money(balance(x), x.currency) + '</span></button>'; }).join('') + '</div>' +
    '<h3 style="margin-top:16px">Новый счёт</h3><div class="field"><input id="nN" placeholder="Название, напр. Наличные"></div><div class="row2"><select id="nT" aria-label="Тип"><option value="bank">💳 Карта/счёт</option><option value="cash">💵 Наличные</option><option value="crypto">🪙 Крипто</option><option value="broker">📊 Брокерский</option><option value="other">👛 Другое</option></select><input id="nC" value="RUB" aria-label="Валюта"></div><div style="height:8px"></div><div class="row2"><input id="nS" inputmode="decimal" placeholder="Нач. баланс" aria-label="Начальный баланс"><input id="nM" inputmode="decimal" placeholder="Ручной баланс" aria-label="Ручной баланс"></div><div style="height:12px"></div><button class="btn block" id="nAdd">Создать счёт</button>',
    function (b) { $$('[data-a]', b).forEach(function (x) { x.onclick = function () { accountSheet(x.dataset.a); }; });
      $('#nAdd').onclick = function () { var n = $('#nN').value.trim(); if (!n) { toast('Введите название'); return; } S.accounts.push({ id: uid(), name: n, type: $('#nT').value, currency: $('#nC').value.trim().toUpperCase() || 'RUB', start: Core.parseAmount($('#nS').value) || 0, manual: $('#nM').value === '' ? null : Core.parseAmount($('#nM').value) }); save(); closeSheet(); renderAll(); toast('Счёт создан'); }; });
}
function rulesSheet() { openSheet('Категории и правила', '<p class="muted small">Формат: <code>Категория: слово1, слово2</code> — по правилу в строке. Ищется подстрока в описании без учёта регистра; первое совпадение побеждает.</p><textarea id="rT" rows="14">' + esc(S.rules.map(function (r) { return r[0] + ': ' + r[1]; }).join('\n')) + '</textarea><div style="height:12px"></div><button class="btn block" id="rS">Сохранить правила</button><div style="height:8px"></div><button class="btn sec block" id="rR">Применить ко всем операциям</button>',
  function () { function parse() { S.rules = $('#rT').value.split('\n').map(function (l) { var i = l.indexOf(':'); return i > 0 ? [l.slice(0, i).trim(), l.slice(i + 1).trim()] : null; }).filter(Boolean); save(); }
    $('#rS').onclick = function () { parse(); closeSheet(); toast('Правила сохранены'); }; $('#rR').onclick = function () { parse(); S.tx.forEach(function (t) { t.category = Core.categorize({ description: t.description, amount: t.amount, category: '' }, S.rules); }); save(); closeSheet(); renderAll(); toast('Категории обновлены'); }; }); }
function ratesSheet() { openSheet('Курсы валют к ₽', Object.keys(S.rates).map(function (c) { return '<div class="field"><label for="r_' + c + '">' + c + '</label><input id="r_' + c + '" data-c="' + c + '" inputmode="decimal" value="' + S.rates[c] + '"></div>'; }).join('') + '<div class="row2"><input id="rNew" placeholder="Код, напр. BTC" aria-label="Новая валюта"><button class="btn sec" id="rAdd">＋ Валюта</button></div><div style="height:12px"></div><button class="btn block" id="rSave">Сохранить</button><div style="height:8px"></div><button class="btn sec block" id="rCbr">Подставить курсы ЦБ РФ</button><p class="muted small">Курсы ЦБ — публичный запрос к cbr-xml-daily.ru, ваши данные не передаются.</p>',
  function (b) { function put() { $$('[data-c]', b).forEach(function (i) { S.rates[i.dataset.c] = Core.parseAmount(i.value) || ''; }); save(); }
    $('#rSave').onclick = function () { put(); closeSheet(); renderAll(); toast('Курсы сохранены'); }; $('#rAdd').onclick = function () { put(); var c = $('#rNew').value.trim().toUpperCase(); if (c) { S.rates[c] = ''; save(); ratesSheet(); } };
    $('#rCbr').onclick = function () { put(); Market.cbr().then(function (v) { Object.keys(S.rates).forEach(function (c) { if (v[c]) S.rates[c] = +(v[c].Value / v[c].Nominal).toFixed(4); }); save(); ratesSheet(); renderAll(); toast('Курсы ЦБ подставлены'); }).catch(function (e) { toast('Не удалось: ' + e.message); }); }; }); }
function exportJSON() { var b = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' }), a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = 'finance-backup-' + new Date().toISOString().slice(0, 10) + '.json'; a.click(); toast('Файл резервной копии сохранён'); }
function clearAll() { if (!confirm('Удалить ВСЕ данные из браузера? Сначала сделайте экспорт.')) return; localStorage.removeItem(KEY); localStorage.removeItem('finance-market-cache'); S = blank(); save(); applyTheme(); go('home'); toast('Данные удалены'); }
function deleteDemo() { var ids = S.accounts.filter(function (a) { return a.demo; }).map(function (a) { return a.id; }); S.accounts = S.accounts.filter(function (a) { return !a.demo; }); S.tx = S.tx.filter(function (t) { return ids.indexOf(t.accountId) < 0; }); S.holdings = S.holdings.filter(function (h) { return !h.demo; }); save(); renderAll(); toast('Демо‑данные удалены'); }
function loadDemo() {
  var a = ensureAccount('Демо: карта', 'RUB', 'bank'); a.demo = true; a.start = 50000; addTx(window.DEMO_TX.map(function (t) { return Object.assign({ demo: true }, t); }), a);
  var c = ensureAccount('Демо: наличные', 'RUB', 'cash'); c.demo = true; c.manual = 15000;
  var k = ensureAccount('Демо: USDT', 'USD', 'crypto'); k.demo = true; k.manual = 500; if (!S.rates.USD) S.rates.USD = 90;
  if (!S.holdings.length) S.holdings = [{ id: uid(), kind: 'share', ticker: 'SBER', qty: 100, buy: 250, demo: true }, { id: uid(), kind: 'share', ticker: 'LKOH', qty: 3, buy: 6500, demo: true }, { id: uid(), kind: 'etf', ticker: 'TMOS', qty: 3000, buy: 6, demo: true }, { id: uid(), kind: 'bond', ticker: 'SU26238RMFS4', qty: 10, buy: 600, demo: true }, { id: uid(), kind: 'crypto', ticker: 'bitcoin', qty: 0.01, buy: 6000000, demo: true }, { id: uid(), kind: 'cash', ticker: 'Фонд денежного рынка', qty: 1, buy: 100000, demo: true }];
  save(); go(VIEW); toast('Демо‑данные загружены (вымышленные)');
}
RENDER.home = renderHome; RENDER.ops = renderOps; RENDER.more = renderMore;
applyTheme(); $('#hideBtn').textContent = S.ui.hide ? '🙈' : '👁';
