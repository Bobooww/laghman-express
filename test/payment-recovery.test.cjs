// Offline browser-function regressions. No external requests or checkout creation.
// Run: node --test test/payment-recovery.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const orderHtml = fs.readFileSync(path.join(__dirname, '../order.html'), 'utf8');
const statusHtml = fs.readFileSync(path.join(__dirname, '../order-status.html'), 'utf8');
const token = 'a'.repeat(64);
const otherToken = 'b'.repeat(64);
const statusUrl = `https://laghmanexpress.com/order-status?token=${token}`;
const cloverHref = 'https://www.clover.com/checkout/session-test';
const localKey = 'lx_pending_pay_coney-island';
const lines = [{itemId: 'offline-item', name: 'Offline dish', quantity: 1, modifierIds: []}];
const copy = value => JSON.parse(JSON.stringify(value));
const signature = value => JSON.stringify(value.map(l => [l.itemId, l.quantity, (l.modifierIds || []).slice().sort()]));
const reply = (status, body) => Promise.resolve({status, ok: status >= 200 && status < 300, json: async () => body});
const settle = async () => {for (let i = 0; i < 12; i++) await Promise.resolve();};

test('complete embedded checkout scripts parse', () => {
  for (const html of [orderHtml, statusHtml]) {
    const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
    assert.doesNotThrow(() => new vm.Script(script));
  }
});

function storage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    get length() {return data.size;}, key: i => [...data.keys()][i] ?? null,
    getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)),
    removeItem: k => data.delete(k), dump: () => Object.fromEntries(data),
  };
}
function webLocks() {
  const queues = new Map();
  return {request(name, run) {
    const previous = queues.get(name) || Promise.resolve();
    const next = previous.catch(() => {}).then(() => run({name}));
    queues.set(name, next);
    return next;
  }};
}
function element(id = '') {
  let text = '', html = '';
  return {id, value: '', hidden: false, children: [], _busy: false,
    get textContent() {return text;}, set textContent(v) {text = v; html = String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); this.children = [];},
    get innerHTML() {return html;}, set innerHTML(v) {html = v;},
    disabled: false, appendChild(n) {this.children.push(n); return n;},
    classList: {toggle() {}, add() {}, remove() {}, contains() {return false;}},
    focus() {}, blur() {}, scrollIntoView() {},
  };
}
function baseRuntime(options = {}) {
  const nodes = new Map();
  const get = id => {if (!nodes.has(id)) nodes.set(id, element(id)); return nodes.get(id);};
  const listeners = {}, timers = new Map(), calls = [];
  let timerId = 0;
  const context = {
    console, URL, URLSearchParams, Date, JSON, Promise, AbortController,
    localStorage: options.local || storage(), sessionStorage: options.session || storage(),
    location: {href: options.href || 'https://laghmanexpress.com/order', search: options.search || ''},
    navigator: {language: 'en', locks: options.locks === undefined ? {
      request: (_name, run) => Promise.resolve(run()),
    } : options.locks}, crypto: {randomUUID: () => options.uuid || '11111111-1111-4111-8111-111111111111'},
    setTimeout(fn, delay) {const id = ++timerId; timers.set(id, {fn, delay}); return id;},
    clearTimeout(id) {timers.delete(id);},
    document: {getElementById: get, createElement: () => element(), createTextNode: text => ({textContent: text}),
      activeElement: null, documentElement: {}, addEventListener(name, fn) {listeners[name] = fn;}},
    fetch(url, opts) {calls.push({url, opts, pendingAtSend: context.localStorage.getItem(localKey)});
      return options.fetch ? options.fetch(url, opts, calls.length) : reply(201, {href: cloverHref, statusUrl});},
  };
  context.window = {AbortController, addEventListener(name, fn) {listeners[name] = fn;}};
  vm.createContext(context);
  return {context, nodes, get, listeners, timers, calls};
}
function orderRuntime(options = {}) {
  const runtime = baseRuntime(options), c = runtime.context;
  Object.assign(c, {
    state: {slug: 'coney-island', idem: null, cart: copy(lines), mode: 'pickup', cfg: {}, quoteBusy: false,
      quote: {quoteId: 'offline-quote', menuVersion: 'offline-menu', totalCents: 2068, expiresAt: new Date(Date.now() + 600000).toISOString()}},
    $: runtime.get, money: cents => '$' + (cents / 100).toFixed(2),
    uuid4: () => c.crypto.randomUUID(), API: 'https://offline-api.invalid',
    el: (_tag, _class, text) => {const e = element(); e.textContent = text; return e;},
    orderingPaused: () => false, kitchenIsClosed: () => false,
    kitchen: () => ({tel: '+10000000000', phone: '(000) 000-0000'}),
    requestQuote() {}, handleCartRefusal: () => false, updateHoursNote() {},
    renderCart() {}, updateBar() {}, flashTotals() {}, fetchCfg() {}, closeSheet() {},
    loadCart: () => JSON.parse(c.localStorage.getItem('lx_cart_' + c.state.slug) || '[]'),
  });
  vm.runInContext(orderHtml.slice(orderHtml.indexOf('var STR={'), orderHtml.indexOf('var lang=')), c);
  c.T = c.STR.en;
  const fetchStart = orderHtml.indexOf('function tfetch(');
  vm.runInContext(orderHtml.slice(fetchStart, orderHtml.indexOf('function el(', fetchStart)), c);
  vm.runInContext(orderHtml.slice(orderHtml.indexOf('function syncPayBtn('), orderHtml.indexOf('/* A cart is stored per kitchen')), c);
  runtime.get('cN').value = 'Offline Test'; runtime.get('cP').value = '0000000000'; runtime.get('cE').value = 'offline@example.invalid';
  c.localStorage.setItem('lx_cart_coney-island', JSON.stringify(lines));
  return runtime;
}
function pending(slug = 'coney-island', url = statusUrl) {
  return {slug, key: '11111111-1111-4111-8111-111111111111', statusUrl: url,
    ts: Date.now(), cartSignature: signature(lines), lines: copy(lines), mode: 'pickup'};
}
function statusRuntime(options = {}) {
  const runtime = baseRuntime({href: statusUrl, search: `?token=${token}`, ...options});
  const script = statusHtml.match(/<script>([\s\S]*?)<\/script>/)[1];
  vm.runInContext(script, runtime.context);
  return runtime;
}

test('new checkout persists its guard before POST, stores recovery URL, and keeps cart', async () => {
  const r = orderRuntime(); r.context.startHosted(); await settle();
  assert.equal(r.calls.length, 1);
  assert.equal(JSON.parse(r.calls[0].pendingAtSend).key, r.calls[0].opts.headers['Idempotency-Key']);
  assert.equal(r.context.location.href, cloverHref);
  const p = JSON.parse(r.context.localStorage.getItem(localKey));
  assert.equal(p.statusUrl, statusUrl);
  assert.equal(r.context.sessionStorage.getItem(localKey), null);
  assert.ok(r.context.localStorage.getItem('lx_cart_coney-island'));
  assert.equal(p.customer, undefined);
  assert.equal(p.body, undefined);
});

test('browser Back and repeated Enter check the same payment without another POST', async () => {
  const r = orderRuntime(); r.context.startHosted(); await settle();
  r.context.location.href = 'https://laghmanexpress.com/order';
  r.listeners.pageshow({persisted: true});
  r.get('cE').value = 'changed@example.invalid'; r.context.state.idem = null;
  r.context.startHosted(); r.context.startHosted(); await settle();
  assert.equal(r.calls.length, 1);
  assert.equal(r.context.location.href, statusUrl);
  assert.ok(r.context.localStorage.getItem(localKey));
});

test('actual 12-second timeout keeps a guard; reload replays exact key and payload', async () => {
  const local = storage(), session = storage();
  const first = orderRuntime({local, session, fetch: (_url, opts) => new Promise((_resolve, reject) => {
    opts.signal.addEventListener('abort', () => reject(new Error('offline timeout')));
  })});
  first.context.startHosted();
  const timeout = [...first.timers.values()].find(t => t.delay === 12000);
  assert.ok(timeout); timeout.fn(); await settle();
  const original = first.calls[0].opts;
  assert.ok(local.getItem(localKey));
  assert.equal(first.get('payBtn').textContent, first.context.T.payCheck);
  const second = orderRuntime({local, session, fetch: () => reply(200, {href: cloverHref, statusUrl})});
  second.context.state.cart[0].quantity = 2;
  second.get('cE').value = 'changed@example.invalid';
  second.context.startHosted(); await settle();
  assert.equal(second.calls[0].opts.headers['Idempotency-Key'], original.headers['Idempotency-Key']);
  assert.equal(second.calls[0].opts.body, original.body);
  assert.notEqual(second.context.location.href, cloverHref);
  assert.equal(JSON.parse(local.getItem(localKey)).statusUrl, statusUrl);
  assert.equal(session.getItem(localKey), null);
});

test('timeout before Clover handoff resumes the same active session and keeps its guard', async () => {
  const local = storage(), session = storage();
  let serverCreates = 0;
  const first = orderRuntime({local, session, fetch: () => {
    serverCreates++; return Promise.reject(new Error('offline disconnect after one server session was created'));
  }});
  first.context.startHosted(); await settle();
  const second = orderRuntime({local, session, fetch: () => reply(200, {href: cloverHref, statusUrl,
    checkoutSessionId: 'same-offline-session', expiresAt: new Date(Date.now() + 600000).toISOString()})});
  second.context.startHosted(); await settle();
  assert.equal(second.context.location.href, cloverHref);
  assert.equal(serverCreates, 1);
  assert.equal(first.calls[0].opts.headers['Idempotency-Key'], second.calls[0].opts.headers['Idempotency-Key']);
  assert.equal(first.calls[0].opts.body, second.calls[0].opts.body);
  assert.ok(local.getItem(localKey));
  assert.equal(JSON.parse(local.getItem(localKey)).checkoutSessionId, 'same-offline-session');
});

test('replay cannot resume a session with missing or expired session evidence', async () => {
  for (const evidence of [{}, {checkoutSessionId: 'offline-session', expiresAt: 'invalid'},
    {checkoutSessionId: 'offline-session', expiresAt: new Date(Date.now() - 1000).toISOString()}]) {
    const local = storage(), session = storage();
    const first = orderRuntime({local, session, fetch: () => Promise.reject(new Error('offline timeout'))});
    first.context.startHosted(); await settle();
    const second = orderRuntime({local, session, fetch: () => reply(200, {href: cloverHref, statusUrl, ...evidence})});
    second.context.startHosted(); await settle();
    assert.equal(second.context.location.href, statusUrl);
    assert.ok(local.getItem(localKey));
  }
});

test('late successful response retains the original kitchen guard after kitchen/cart change', async () => {
  let answer;
  const r = orderRuntime({fetch: () => new Promise(resolve => {answer = resolve;})});
  r.context.startHosted();
  r.context.state.slug = 'emmons-ave'; r.context.state.cart = [{...lines[0], quantity: 2}];
  answer(await reply(201, {href: cloverHref, statusUrl})); await settle();
  assert.equal(r.context.location.href, 'https://laghmanexpress.com/order');
  assert.equal(JSON.parse(r.context.localStorage.getItem(localKey)).statusUrl, statusUrl);
  assert.equal(r.context.pendingPayment(), null);
  r.context.state.slug = 'coney-island'; assert.ok(r.context.pendingPayment());
});

test('an old kitchen timeout does not display recovery instructions for the newly selected kitchen', async () => {
  let refuse;
  const r = orderRuntime({fetch: () => new Promise((_resolve, reject) => {refuse = reject;})});
  r.context.startHosted(); r.context.state.slug = 'emmons-ave';
  refuse(new Error('offline timeout')); await settle();
  assert.ok(r.context.localStorage.getItem(localKey));
  assert.equal(r.get('cartErr').textContent, '');
});

test('definite unused checkout refusal is released after the customer switches kitchens', async () => {
  for (const code of ['VALIDATION', 'QUOTE_EXPIRED']) {
    let answer;
    const r = orderRuntime({fetch: () => new Promise(resolve => {answer = resolve;})});
    r.context.startHosted(); r.context.state.slug = 'emmons-ave';
    answer(await reply(409, {code})); await settle();
    assert.equal(r.context.localStorage.getItem(localKey), null);
    assert.equal(r.context.sessionStorage.getItem(localKey), null);
    assert.equal(r.get('cartErr').textContent, '');
  }
});

test('legacy guard with no URL and old timestamp stays guarded without POST', () => {
  const local = storage({lx_pending_pay: JSON.stringify({slug: 'coney-island', statusUrl: '', ts: Date.now() - 86400000})});
  const r = orderRuntime({local}); r.context.startHosted();
  assert.equal(r.calls.length, 0);
  assert.ok(local.getItem(localKey));
  assert.equal(r.get('payBtn').textContent, r.context.T.payCheck);
  assert.equal(r.get('cartErr').textContent, r.context.T.payUnknown);
});

test('malformed success without status URL cannot remove guard or open an untracked session', async () => {
  const r = orderRuntime({fetch: () => reply(201, {href: cloverHref})});
  r.context.startHosted(); await settle();
  assert.equal(r.context.location.href, 'https://laghmanexpress.com/order');
  assert.ok(r.context.localStorage.getItem(localKey));
  assert.ok(r.context.sessionStorage.getItem(localKey));
  r.context.startHosted(); await settle();
  assert.equal(r.calls.length, 2);
  assert.equal(r.calls[0].opts.body, r.calls[1].opts.body);
  assert.equal(r.calls[0].opts.headers['Idempotency-Key'], r.calls[1].opts.headers['Idempotency-Key']);
});

test('uncertain replay refused for expired quote keeps the original payment guard', async () => {
  const local = storage(), session = storage();
  const first = orderRuntime({local, session, fetch: () => Promise.reject(new Error('offline disconnect'))});
  first.context.startHosted(); await settle();
  const second = orderRuntime({local, session, fetch: () => reply(409, {code: 'QUOTE_EXPIRED'})});
  second.context.startHosted(); await settle();
  assert.ok(local.getItem(localKey)); assert.ok(session.getItem(localKey));
  assert.equal(second.get('payBtn').textContent, second.context.T.payCheck);
});

test('definite initial validation refusal releases only that unused checkout key', async () => {
  const r = orderRuntime({fetch: () => reply(400, {code: 'VALIDATION', field: 'customer.email'})});
  r.context.startHosted(); await settle();
  assert.equal(r.context.localStorage.getItem(localKey), null);
  assert.equal(r.context.sessionStorage.getItem(localKey), null);
  assert.equal(r.context.state.idem, null);
  assert.equal(r.get('cE')._err, true);
});

test('private retry details expire without releasing the persistent uncertainty guard', () => {
  const p = pending('coney-island', '');
  const local = storage({[localKey]: JSON.stringify(p)});
  const session = storage({[localKey]: JSON.stringify({key: p.key, ts: Date.now() - 86400001, body: '{}'})});
  const r = orderRuntime({local, session}); r.context.startHosted();
  assert.equal(r.calls.length, 0); assert.ok(local.getItem(localKey)); assert.equal(session.getItem(localKey), null);
});

test('failed persistence refuses to create an unguarded checkout', () => {
  const local = storage();
  const r = orderRuntime({local}); local.setItem = () => {throw new Error('offline quota');}; r.context.startHosted();
  assert.equal(r.calls.length, 0); assert.equal(r.context.sessionStorage.getItem(localKey), null);
});

test('pending guards remain independent across kitchens', async () => {
  const local = storage({'lx_pending_pay_emmons-ave': JSON.stringify(pending('emmons-ave', statusUrl.replace(token, otherToken)))});
  const r = orderRuntime({local}); r.context.startHosted(); await settle();
  assert.ok(local.getItem('lx_pending_pay_emmons-ave')); assert.ok(local.getItem(localKey));
});

test('Web Locks serialize two kitchen tabs so only one checkout key is submitted', async () => {
  const local = storage(), locks = webLocks();
  const first = orderRuntime({local, locks, uuid: '11111111-1111-4111-8111-111111111111'});
  const second = orderRuntime({local, locks, uuid: '22222222-2222-4222-8222-222222222222'});
  await Promise.all([first.context.startHosted(), second.context.startHosted()]); await settle();
  const posts = [...first.calls, ...second.calls];
  assert.equal(posts.length, 1);
  assert.equal(JSON.parse(local.getItem(localKey)).key, posts[0].opts.headers['Idempotency-Key']);
  assert.equal(second.get('payBtn').textContent, second.context.T.payCheck);
});

test('an intervening existing guard is refused instead of overwritten', () => {
  const r = orderRuntime();
  const existing = pending(); r.context.localStorage.setItem(localKey, JSON.stringify(existing));
  const contender = {...existing, key: '22222222-2222-4222-8222-222222222222'};
  const saved = r.context.rememberPaymentRequest(contender, {key: contender.key, ts: Date.now(), body: '{}'});
  assert.equal(saved, false);
  assert.equal(JSON.parse(r.context.localStorage.getItem(localKey)).key, existing.key);
  assert.equal(r.context.sessionStorage.getItem(localKey), null);
});

test('browser without Web Locks refuses new checkout and offers browser or kitchen help', () => {
  const r = orderRuntime({locks: null}); r.context.startHosted();
  assert.equal(r.calls.length, 0);
  assert.equal(r.context.localStorage.getItem(localKey), null);
  assert.equal(r.get('cartErr').textContent, r.context.T.payBrowser);
  assert.equal(r.get('cartErr').children[1].href, 'tel:+10000000000');
});

test('browser without Web Locks can still replay the exact existing key and request', async () => {
  const local = storage(), session = storage();
  const first = orderRuntime({local, session, fetch: () => Promise.reject(new Error('offline timeout'))});
  first.context.startHosted(); await settle();
  const second = orderRuntime({local, session, locks: null, fetch: () => reply(200, {statusUrl})});
  second.context.startHosted(); await settle();
  assert.equal(second.calls.length, 1);
  assert.equal(second.calls[0].opts.headers['Idempotency-Key'], first.calls[0].opts.headers['Idempotency-Key']);
  assert.equal(second.calls[0].opts.body, first.calls[0].opts.body);
  assert.equal(second.context.location.href, statusUrl);
  assert.ok(local.getItem(localKey));
});

test('confirmed paid status clears only matching guard and unchanged submitted cart', async () => {
  const p = pending();
  const otherKey = 'lx_pending_pay_emmons-ave';
  const local = storage({[localKey]: JSON.stringify(p), [otherKey]: JSON.stringify(pending('emmons-ave', statusUrl.replace(token, otherToken))),
    'lx_cart_coney-island': JSON.stringify(lines), 'lx_cart_emmons-ave': JSON.stringify(lines)});
  const session = storage({[localKey]: JSON.stringify({key: p.key, body: '{}', ts: Date.now()})});
  statusRuntime({local, session, fetch: () => reply(200, {status: 'succeeded', locationSlug: 'coney-island'})}); await settle();
  assert.equal(local.getItem(localKey), null); assert.equal(session.getItem(localKey), null);
  assert.equal(local.getItem('lx_cart_coney-island'), null);
  assert.ok(local.getItem(otherKey)); assert.ok(local.getItem('lx_cart_emmons-ave'));
});

test('confirmed legacy paid checkout clears its marked kitchen cart and preserves other kitchens', async () => {
  const local = storage({lx_pending_pay: JSON.stringify({slug: 'coney-island', statusUrl, ts: Date.now()}),
    lx_pay_slug: 'coney-island', 'lx_cart_coney-island': JSON.stringify(lines), 'lx_cart_emmons-ave': JSON.stringify(lines)});
  statusRuntime({local, fetch: () => reply(200, {status: 'paid', locationSlug: 'coney-island'})}); await settle();
  assert.equal(local.getItem('lx_pending_pay'), null);
  assert.equal(local.getItem('lx_cart_coney-island'), null);
  assert.ok(local.getItem('lx_cart_emmons-ave'));
});

test('confirmed payment preserves dishes edited afterward and receipt uses submitted snapshot', async () => {
  const local = storage({[localKey]: JSON.stringify(pending()), 'lx_cart_coney-island': JSON.stringify([{...lines[0], quantity: 2}])});
  const r = statusRuntime({local, fetch: () => reply(200, {status: 'paid', locationSlug: 'coney-island'})}); await settle();
  assert.ok(local.getItem('lx_cart_coney-island')); assert.equal(local.getItem(localKey), null);
  assert.equal(JSON.parse(local.getItem('lx_receipt')).lines[0].quantity, 1);
  assert.match(r.get('card').innerHTML, /Order paid/);
});

test('older paid/failed status link cannot unlock a newer attempt or erase its cart', async () => {
  for (const outcome of ['paid', 'failed']) {
    const p = pending('coney-island', statusUrl.replace(token, otherToken));
    const local = storage({[localKey]: JSON.stringify(p), 'lx_cart_coney-island': JSON.stringify(lines)});
    statusRuntime({local, fetch: () => reply(200, {status: outcome, locationSlug: 'coney-island'})}); await settle();
    assert.ok(local.getItem(localKey)); assert.ok(local.getItem('lx_cart_coney-island'));
  }
});

test('unknown and repeated missing status responses never unlock payment', async () => {
  for (const response of [() => reply(200, {status: 'unknown'}), () => reply(404, {code: 'ORDER_NOT_FOUND'})]) {
    const local = storage({[localKey]: JSON.stringify(pending())});
    const r = statusRuntime({local, fetch: response}); await settle();
    const timer = [...r.timers.values()].find(t => t.delay === 3000);
    if (timer) {timer.fn(); await settle();}
    assert.ok(local.getItem(localKey));
  }
});

test('failed URL hint waits for server confirmation before releasing matching guard', async () => {
  const local = storage({[localKey]: JSON.stringify(pending())});
  const r = statusRuntime({local, search: `?token=${token}&result=failed`, fetch: () => reply(200, {status: 'awaiting_checkout'})}); await settle();
  assert.ok(local.getItem(localKey));
  assert.match(r.get('card').innerHTML, /Confirming/);
});

test('confirmed failed status releases matching guard while retaining cart for a safe retry', async () => {
  const local = storage({[localKey]: JSON.stringify(pending()), 'lx_cart_coney-island': JSON.stringify(lines)});
  statusRuntime({local, fetch: () => reply(200, {status: 'failed', locationSlug: 'coney-island'})}); await settle();
  assert.equal(local.getItem(localKey), null); assert.ok(local.getItem('lx_cart_coney-island'));
});

test('terminal and pending replay responses use status without creating another checkout', async () => {
  for (const [code, body] of [[200, {statusUrl}], [202, {statusUrl, code: 'CHECKOUT_SESSION_PENDING'}],
    [409, {statusUrl, code: 'CHECKOUT_SESSION_FAILED'}]]) {
    const local = storage(), session = storage();
    const first = orderRuntime({local, session, fetch: () => Promise.reject(new Error('offline timeout'))});
    first.context.startHosted(); await settle();
    const second = orderRuntime({local, session, fetch: () => reply(code, body)});
    second.context.startHosted(); await settle();
    assert.equal(second.calls.length, 1);
    assert.equal(second.context.location.href, statusUrl);
    assert.ok(local.getItem(localKey));
  }
});

test('initial provider rejection with an attempt URL goes to authoritative status', async () => {
  const r = orderRuntime({fetch: () => reply(502, {statusUrl, code: 'HOSTED_CHECKOUT_FAILED'})});
  r.context.startHosted(); await settle();
  assert.equal(r.context.location.href, statusUrl);
  assert.equal(JSON.parse(r.context.localStorage.getItem(localKey)).statusUrl, statusUrl);
  assert.equal(r.context.sessionStorage.getItem(localKey), null);
});

test('status URL accepts only the current site recovery route and supports GitHub project prefix', () => {
  const r = orderRuntime();
  assert.equal(r.context.paymentStatusUrl(`https://other.invalid/order-status?token=${token}`), '');
  assert.equal(r.context.paymentStatusUrl(`https://laghmanexpress.com/order?token=${token}`), '');
  assert.equal(r.context.paymentStatusUrl('https://laghmanexpress.com/order-status?token=short'), '');
  r.context.location.href = 'https://bobooww.github.io/laghman-express/order';
  const prefixed = `https://bobooww.github.io/laghman-express/order-status?token=${token}`;
  assert.equal(r.context.paymentStatusUrl(prefixed), prefixed);
  assert.equal(r.context.paymentStatusUrl(`https://bobooww.github.io/order-status?token=${token}`), '');
});
