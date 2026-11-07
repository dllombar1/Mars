'use strict';

// End-to-end tests: load the real unpacked extension in /extension into
// headless Chromium and exercise content script, live updates, popup and iframes.
// Run with: npm run test:e2e

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');

let chromium;
try {
  ({ chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright'));
} catch (err) {
  ({ chromium } = require('/opt/node22/lib/node_modules/playwright'));
}

const EXT = path.resolve(__dirname, '..', '..', 'extension');
const WAIT = 10000;

let ctx = null;
let admin = null; // extension page used to read/write chrome.storage.sync
let extId = '';
let server = null;
let baseUrl = '';
let pageCounter = 0;
const routes = new Map();
const openPages = new Set();

// ---------- helpers ----------

function rule(id, find, replace, extra) {
  return Object.assign(
    { id: id, find: find, replace: replace, caseSensitive: false, wholeWord: true, enabled: true },
    extra || {}
  );
}

// Registers an HTML document on the local server and returns its URL.
function serve(html) {
  const p = '/p/' + ++pageCounter + '.html';
  routes.set(p, html);
  return baseUrl + p;
}

async function openPage(html) {
  const page = await ctx.newPage();
  openPages.add(page);
  await page.goto(serve(html));
  return page;
}

async function closeExtraPages() {
  for (const page of openPages) {
    await page.close().catch(() => {});
  }
  openPages.clear();
}

function storageGet(keys) {
  return admin.evaluate(
    (k) =>
      new Promise((resolve, reject) =>
        chrome.storage.sync.get(k, (items) =>
          chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(items)
        )
      ),
    keys === undefined ? null : keys
  );
}

function storageSet(items) {
  return admin.evaluate(
    (obj) =>
      new Promise((resolve, reject) =>
        chrome.storage.sync.set(obj, () =>
          chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve()
        )
      ),
    items
  );
}

function storageClear() {
  return admin.evaluate(
    () =>
      new Promise((resolve, reject) =>
        chrome.storage.sync.clear(() =>
          chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve()
        )
      )
  );
}

async function resetStorage(items) {
  await storageClear();
  await storageSet(Object.assign({ enabled: true }, items || {}));
}

// Polls storage (not a page, so no waitForFunction) until predicate holds.
async function waitStorage(predicate) {
  const deadline = Date.now() + WAIT;
  let items = await storageGet();
  while (!predicate(items) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 100));
    items = await storageGet();
  }
  return items;
}

// Waits until each element's textContent (or document.title for '__title__') matches.
async function assertTexts(page, expected) {
  const ids = Object.keys(expected);
  await page
    .waitForFunction(
      (exp) =>
        Object.keys(exp).every((k) => {
          const el = k === '__title__' ? null : document.getElementById(k);
          const text = k === '__title__' ? document.title : el && el.textContent;
          return text === exp[k];
        }),
      expected,
      { timeout: WAIT }
    )
    .catch(() => {});
  const actual = await page.evaluate(
    (keys) =>
      keys.reduce((out, k) => {
        const el = k === '__title__' ? null : document.getElementById(k);
        out[k] = k === '__title__' ? document.title : el ? el.textContent : null;
        return out;
      }, {}),
    ids
  );
  assert.deepEqual(actual, expected);
}

async function openPopup() {
  const page = await ctx.newPage();
  openPages.add(page);
  await page.goto(`chrome-extension://${extId}/popup/popup.html`);
  return page;
}

// The popup renders rows asynchronously after reading storage.
async function waitPopupRows(popup, count) {
  await popup.waitForFunction((n) => document.querySelectorAll('#rules .rule').length === n, count, {
    timeout: WAIT
  });
}

// ---------- suite ----------

describe('Phrase Replacer extension (Chromium e2e)', () => {
  before(async () => {
    ctx = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: true,
      args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`]
    });
    let [sw] = ctx.serviceWorkers();
    if (!sw) sw = await ctx.waitForEvent('serviceworker', { timeout: WAIT });
    extId = new URL(sw.url()).host;

    const version = ctx.browser() ? ctx.browser().version() : 'unknown';
    console.log(`Chromium ${version}, extension id ${extId}`);

    server = http.createServer((req, res) => {
      const body = routes.get(new URL(req.url, 'http://x').pathname);
      if (body === undefined) {
        res.writeHead(404, { 'content-type': 'text/plain' });
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(body);
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    // Admin page: an extension page (not matched by content scripts) used for storage access.
    admin = await ctx.newPage();
    await admin.goto(`chrome-extension://${extId}/popup/popup.html`);
  }, { timeout: 60000 });

  after(async () => {
    await closeExtraPages();
    if (admin) await admin.close().catch(() => {});
    if (ctx) await ctx.close().catch(() => {});
    if (server) {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    }
  });

  beforeEach(async () => {
    await closeExtraPages();
    await resetStorage({ rules: [] });
  });

  it('1. basic: whole-word, case-insensitive, multiple rules', async () => {
    await resetStorage({
      rules: [
        rule('a', 'hello world', 'goodbye moon'),
        rule('b', 'cat', 'dog')
      ]
    });
    const page = await openPage(
      '<!doctype html><html><head><meta charset="utf-8"><title>t</title></head>' +
        '<body><p id="p">Hello World, my cat sat. concatenate</p></body></html>'
    );
    await assertTexts(page, { p: 'goodbye moon, my dog sat. concatenate' });
  });

  it('2. replaces phrases in nested elements, pre/code and the title', async () => {
    await resetStorage({
      rules: [rule('a', 'apple', 'plum'), rule('b', 'red fox', 'blue wolf')]
    });
    const page = await openPage(
      '<!doctype html><html><head><meta charset="utf-8"><title>The red fox story</title></head><body>' +
        '<h1 id="h1">Apple orchard</h1>' +
        '<div><span id="mix">A red fox <em>saw</em> the apple</span></div>' +
        '<ul><li><span><span id="deep">Deep apple</span></span></li></ul>' +
        '<pre id="pre">apple pie</pre>' +
        '<code id="code">red fox</code>' +
        '<p id="many">apple apple apple</p>' +
        '</body></html>'
    );
    await assertTexts(page, {
      __title__: 'The blue wolf story',
      h1: 'plum orchard',
      mix: 'A blue wolf saw the plum',
      deep: 'Deep plum',
      pre: 'plum pie',
      code: 'blue wolf',
      many: 'plum plum plum'
    });
  });

  it('3. leaves textarea, input, script, style and contenteditable untouched', async () => {
    await resetStorage({ rules: [rule('a', 'apple', 'plum')] });
    const page = await openPage(
      '<!doctype html><html><head><meta charset="utf-8"><title>skip</title></head><body>' +
        '<p id="normal">apple</p>' +
        '<textarea id="ta">apple</textarea>' +
        '<input id="inp" type="text" value="apple">' +
        '<script id="sc">var s = "apple";</script>' +
        '<style id="st">p.x::after { content: "apple"; } /* apple */</style>' +
        '<div id="ce" contenteditable="true">apple</div>' +
        '</body></html>'
    );
    await assertTexts(page, { normal: 'plum' });

    const skipped = await page.evaluate(() => ({
      textarea: document.getElementById('ta').value,
      input: document.getElementById('inp').value,
      script: document.getElementById('sc').textContent,
      style: document.getElementById('st').textContent,
      editable: document.getElementById('ce').textContent
    }));
    assert.deepEqual(skipped, {
      textarea: 'apple',
      input: 'apple',
      script: 'var s = "apple";',
      style: 'p.x::after { content: "apple"; } /* apple */',
      editable: 'apple'
    });
  });

  it('4. replaces content added after load and changed text nodes', async () => {
    await resetStorage({ rules: [rule('a', 'apple', 'plum')] });
    const page = await openPage(
      '<!doctype html><html><head><meta charset="utf-8"><title>dyn</title></head><body>' +
        '<div id="root"></div>' +
        '<p id="tn">nothing</p>' +
        '<script>' +
        'window.addEventListener("load", function () {' +
        '  setTimeout(function () {' +
        '    var p = document.createElement("p");' +
        '    p.id = "late";' +
        '    p.textContent = "apple arrives late";' +
        '    document.getElementById("root").appendChild(p);' +
        '  }, 200);' +
        '});' +
        '</script>' +
        '</body></html>'
    );
    await assertTexts(page, { late: 'plum arrives late' });

    // Change the existing text node's data in place (characterData mutation).
    await page.evaluate(() => {
      document.getElementById('tn').firstChild.nodeValue = 'a fresh apple';
    });
    await assertTexts(page, { tn: 'a fresh plum' });
  });

  it('5. does not loop or re-replace its own edits (cat -> cats, no catss)', async () => {
    await resetStorage({ rules: [rule('a', 'cat', 'cats', { wholeWord: false })] });
    const page = await openPage(
      '<!doctype html><html><head><meta charset="utf-8"><title>loop</title></head><body>' +
        '<p id="first">cat</p><div id="box"></div></body></html>'
    );
    await assertTexts(page, { first: 'cats' });

    await page.evaluate(() => {
      const p = document.createElement('p');
      p.id = 'second';
      p.textContent = 'cat and cat';
      document.body.appendChild(p);
      document.getElementById('box').appendChild(document.createTextNode('more cat'));
    });
    await assertTexts(page, { second: 'cats and cats', box: 'more cats' });

    // Count mutations once settled; a feedback loop would keep producing them.
    await page.evaluate(() => {
      window.__mutations = 0;
      new MutationObserver((records) => {
        window.__mutations += records.length;
      }).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
    });
    // Negative assertion: give a runaway loop time to show itself.
    await new Promise((r) => setTimeout(r, 500));
    const first = await page.evaluate(() => window.__mutations);
    await new Promise((r) => setTimeout(r, 500));
    const second = await page.evaluate(() => window.__mutations);
    assert.equal(second, first, 'page mutations kept growing: possible loop');

    await assertTexts(page, { first: 'cats', second: 'cats and cats', box: 'more cats' });
    const html = await page.content();
    assert.ok(!html.includes('catss'), 'found "catss": rule was re-applied to its own output');
  });

  it('6. live update: rule change, disable (revert) and re-enable without reload', async () => {
    await resetStorage({ rules: [rule('a', 'apple', 'banana')] });
    const page = await openPage(
      '<!doctype html><html><head><meta charset="utf-8"><title>live</title></head><body>' +
        '<p id="p">apple</p></body></html>'
    );
    await assertTexts(page, { p: 'banana' });
    await page.evaluate(() => {
      window.__marker = 42;
    });

    await storageSet({ rules: [rule('a', 'apple', 'cherry')] });
    await assertTexts(page, { p: 'cherry' });

    await storageSet({ enabled: false });
    await assertTexts(page, { p: 'apple' });

    await storageSet({ enabled: true });
    await assertTexts(page, { p: 'cherry' });

    assert.equal(await page.evaluate(() => window.__marker), 42, 'page was reloaded');
  });

  describe('7. popup UI', () => {
    it('adds a rule, autosaves it, and transforms a page loaded afterwards', async () => {
      const popup = await openPopup();
      await waitPopupRows(popup, 0);

      await popup.click('#add');
      const row = popup.locator('#rules .rule').first();
      await row.locator('.find').fill('apple');
      await row.locator('.replace').fill('plum');

      const stored = await waitStorage(
        (s) => Array.isArray(s.rules) && s.rules.some((r) => r.find === 'apple' && r.replace === 'plum')
      );
      assert.equal(stored.rules.length, 1);
      assert.equal(stored.rules[0].find, 'apple');
      assert.equal(stored.rules[0].replace, 'plum');
      assert.equal(stored.rules[0].caseSensitive, false);
      assert.equal(stored.rules[0].wholeWord, true);
      assert.equal(stored.rules[0].enabled, true);
      assert.equal(stored.enabled, true);

      const content = await openPage('<!doctype html><html><head><meta charset="utf-8"><title>c</title></head>' +
        '<body><p id="c">Red apple pie</p></body></html>');
      await assertTexts(content, { c: 'Red plum pie' });
    });

    it('toggles match case and the change applies to pages', async () => {
      await resetStorage({ rules: [rule('a', 'apple', 'plum')] });
      const popup = await openPopup();
      await waitPopupRows(popup, 1);

      await popup.locator('#rules .rule').first().locator('.case').check();
      const stored = await waitStorage((s) => s.rules && s.rules[0].caseSensitive === true);
      assert.equal(stored.rules[0].caseSensitive, true);

      // Reload the popup to confirm the checkbox state was persisted.
      await popup.reload();
      await waitPopupRows(popup, 1);
      assert.equal(await popup.locator('#rules .rule .case').first().isChecked(), true);

      const content = await openPage('<!doctype html><html><head><meta charset="utf-8"><title>c</title></head>' +
        '<body><p id="c">Apple apple</p></body></html>');
      await assertTexts(content, { c: 'Apple plum' });
    });

    it('delete button removes a rule from storage and the list', async () => {
      await resetStorage({ rules: [rule('a', 'apple', 'plum'), rule('b', 'cat', 'dog')] });
      const popup = await openPopup();
      await waitPopupRows(popup, 2);

      await popup.locator('#rules .rule').first().locator('.delete').click();
      const afterFirst = await waitStorage((s) => s.rules && s.rules.length === 1);
      assert.deepEqual(afterFirst.rules.map((r) => r.find), ['cat']);
      await waitPopupRows(popup, 1);

      await popup.locator('#rules .rule').first().locator('.delete').click();
      const afterSecond = await waitStorage((s) => s.rules && s.rules.length === 0);
      assert.deepEqual(afterSecond.rules, []);
      await popup.waitForFunction(() => !document.getElementById('empty').hidden, null, { timeout: WAIT });
    });

    it('global toggle disables replacements on new pages and re-enables them', async () => {
      await resetStorage({ rules: [rule('a', 'apple', 'plum')] });
      const popup = await openPopup();
      await waitPopupRows(popup, 1);

      // #enabled is visually hidden (opacity 0), so click its visible label.
      await popup.click('label.switch');
      const off = await waitStorage((s) => s.enabled === false);
      assert.equal(off.enabled, false);

      const disabled = await openPage('<!doctype html><html><head><meta charset="utf-8"><title>d</title></head>' +
        '<body><p id="d">apple</p></body></html>');
      await assertTexts(disabled, { d: 'apple' });
      await disabled.close();

      await popup.click('label.switch');
      const on = await waitStorage((s) => s.enabled === true);
      assert.equal(on.enabled, true);

      const enabled = await openPage('<!doctype html><html><head><meta charset="utf-8"><title>e</title></head>' +
        '<body><p id="e">apple</p></body></html>');
      await assertTexts(enabled, { e: 'plum' });
    });
  });

  it('8. export fills the JSON box; import appends rules and updates storage', async () => {
    await resetStorage({
      rules: [
        rule('a', 'apple', 'plum'),
        rule('b', 'cat', 'dog', { caseSensitive: true, wholeWord: false })
      ]
    });
    const popup = await openPopup();
    await waitPopupRows(popup, 2);

    await popup.click('#export');
    const exported = JSON.parse(await popup.inputValue('#io'));
    assert.deepEqual(exported, [
      { find: 'apple', replace: 'plum', caseSensitive: false, wholeWord: true, enabled: true },
      { find: 'cat', replace: 'dog', caseSensitive: true, wholeWord: false, enabled: true }
    ]);

    // Invalid JSON is reported and nothing is written.
    await popup.fill('#io', '{not json');
    await popup.click('#import');
    await popup.waitForFunction(
      () => /not valid JSON/.test(document.getElementById('status').textContent),
      null,
      { timeout: WAIT }
    );
    assert.equal((await storageGet('rules')).rules.length, 2);

    await popup.fill('#io', '[{"find":"sun","replace":"moon"}]');
    await popup.click('#import');
    const stored = await waitStorage((s) => s.rules && s.rules.length === 3);
    const added = stored.rules[2];
    assert.equal(added.find, 'sun');
    assert.equal(added.replace, 'moon');
    assert.equal(added.caseSensitive, false);
    assert.equal(added.wholeWord, true);
    assert.equal(added.enabled, true);
    assert.equal(typeof added.id, 'string');
    await popup.waitForFunction(() => document.getElementById('io').value === '', null, { timeout: WAIT });
    await waitPopupRows(popup, 3);

    const content = await openPage('<!doctype html><html><head><meta charset="utf-8"><title>i</title></head>' +
      '<body><p id="i">the sun and an apple</p></body></html>');
    await assertTexts(content, { i: 'the moon and an plum' });
  });

  it('9. replaces text inside a same-origin iframe (all_frames)', async () => {
    await resetStorage({ rules: [rule('a', 'apple', 'plum')] });
    const frameUrl = serve(
      '<!doctype html><html><head><meta charset="utf-8"><title>frame</title></head>' +
        '<body><p id="inner">apple inside</p></body></html>'
    );
    const page = await openPage(
      '<!doctype html><html><head><meta charset="utf-8"><title>outer</title></head><body>' +
        '<p id="outer">apple outside</p>' +
        `<iframe id="fr" src="${frameUrl}"></iframe>` +
        '</body></html>'
    );
    await assertTexts(page, { outer: 'plum outside' });

    const frame = page.frame({ url: frameUrl });
    assert.ok(frame, 'iframe not found');
    await frame.waitForFunction(
      () => document.getElementById('inner') && document.getElementById('inner').textContent === 'plum inside',
      null,
      { timeout: WAIT }
    );
    assert.equal(await frame.textContent('#inner'), 'plum inside');
  });

  it('10. special characters in find are literal; $ patterns in replace are literal', async () => {
    await resetStorage({
      rules: [
        rule('a', 'C++ (v2)', '$1 & more'),
        rule('b', '$5', '$1 & more'),
        rule('c', 'a.b*c', 'X')
      ]
    });
    const page = await openPage(
      '<!doctype html><html><head><meta charset="utf-8"><title>sp</title></head><body>' +
        '<p id="s">Upgrade to C++ (v2) now, costs $5 today. Pattern a.b*c vs axbbc</p>' +
        '</body></html>'
    );
    await assertTexts(page, {
      s: 'Upgrade to $1 & more now, costs $1 & more today. Pattern X vs axbbc'
    });
  });
});
