'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { escapeRegExp, compileRules, replaceText } = require('../../extension/src/replacer.js');

// Build a rule object with the storage schema defaults.
function rule(find, replace, opts) {
  return Object.assign(
    {
      id: 'r_test_' + Math.random().toString(36).slice(2, 8),
      find: find,
      replace: replace,
      caseSensitive: false,
      wholeWord: false,
      enabled: true
    },
    opts || {}
  );
}

// Compile and apply in one step.
function run(text, rules) {
  return replaceText(text, compileRules(rules));
}

// ---------------------------------------------------------------- escapeRegExp

test('escapeRegExp escapes every regex metacharacter', () => {
  assert.equal(escapeRegExp('a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o'),
    'a\\.b\\*c\\+d\\?e\\^f\\$g\\{h\\}i\\(j\\)k\\|l\\[m\\]n\\\\o');
});

test('escapeRegExp output matches the input literally', () => {
  const samples = ['C++', 'a.b', '$5 (off)', '[x]', '{1,2}', 'a|b', 'back\\slash', 'x*', '^start', 'end$', '-', '/slash/'];
  for (const s of samples) {
    const m = new RegExp(escapeRegExp(s), 'u').exec('prefix ' + s + ' suffix');
    assert.ok(m, `escaped ${JSON.stringify(s)} should match itself`);
    assert.equal(m[0], s);
  }
});

test('escapeRegExp output is valid under the u flag', () => {
  const s = 'a-b/c.d [e] {f} (g) h|i j\\k';
  assert.doesNotThrow(() => new RegExp(escapeRegExp(s), 'gu'));
});

// ---------------------------------------------------------------- basic

test('basic replace', () => {
  assert.equal(run('the cat sat', [rule('cat', 'dog')]), 'the dog sat');
});

test('replaces every occurrence', () => {
  assert.equal(run('red fish, blue fish', [rule('fish', 'cow')]), 'red cow, blue cow');
});

test('returns null when nothing matches', () => {
  assert.equal(run('no animals here', [rule('cat', 'dog')]), null);
});

test('returns null when the replacement leaves text unchanged', () => {
  assert.equal(run('cat', [rule('cat', 'cat')]), null);
});

test('returns null for empty text', () => {
  assert.equal(run('', [rule('cat', 'dog')]), null);
});

test('replaceText returns null when compiled is null', () => {
  assert.equal(replaceText('cat', null), null);
});

test('replaceText returns null for non-string text', () => {
  assert.equal(replaceText(undefined, compileRules([rule('a', 'b')])), null);
});

test('compiled rules can be reused across calls', () => {
  const compiled = compileRules([rule('cat', 'dog')]);
  assert.equal(replaceText('cat one', compiled), 'dog one');
  assert.equal(replaceText('cat two', compiled), 'dog two');
  assert.equal(replaceText('cat cat', compiled), 'dog dog');
});

test('compileRules does not mutate input rules', () => {
  const rules = [rule('  cat  ', 'dog', { caseSensitive: true, wholeWord: true })];
  const snapshot = JSON.stringify(rules);
  compileRules(rules);
  assert.equal(JSON.stringify(rules), snapshot);
});

// ---------------------------------------------------------------- compileRules null cases

test('compileRules returns null for no rules', () => {
  assert.equal(compileRules([]), null);
});

test('compileRules returns null for non-array input', () => {
  assert.equal(compileRules(undefined), null);
  assert.equal(compileRules(null), null);
  assert.equal(compileRules('cat'), null);
});

test('compileRules returns null when all rules are disabled', () => {
  assert.equal(compileRules([rule('cat', 'dog', { enabled: false })]), null);
});

test('compileRules returns null when all rules have empty or whitespace find', () => {
  assert.equal(compileRules([rule('', 'x'), rule('   ', 'x'), rule('\t\n', 'x')]), null);
});

test('compileRules skips null and malformed entries', () => {
  assert.equal(compileRules([null, undefined, 'cat', 42, { replace: 'x' }, { find: 5, replace: 'x' }, { find: 'a' }]), null);
});

test('compileRules returns non-null when at least one usable rule remains', () => {
  assert.notEqual(compileRules([rule('', 'x'), rule('cat', 'dog')]), null);
});

// ---------------------------------------------------------------- multiple rules

test('multiple rules apply in one text', () => {
  assert.equal(run('a b c', [rule('a', '1'), rule('b', '2'), rule('c', '3')]), '1 2 3');
});

test('rule order does not matter for non-overlapping rules', () => {
  assert.equal(run('a b c', [rule('c', '3'), rule('b', '2'), rule('a', '1')]), '1 2 3');
});

// ---------------------------------------------------------------- case sensitivity

test('matching is case-insensitive by default', () => {
  assert.equal(run('Cat CAT cat', [rule('cat', 'dog')]), 'dog dog dog');
});

test('caseSensitive true only matches exact case', () => {
  assert.equal(run('Cat cat CAT', [rule('cat', 'dog', { caseSensitive: true })]), 'Cat dog CAT');
});

test('missing caseSensitive defaults to case-insensitive', () => {
  const r = rule('cat', 'dog');
  delete r.caseSensitive;
  assert.equal(run('CAT', [r]), 'dog');
});

test('case-insensitive matching works for non-ASCII letters', () => {
  assert.equal(run('crème BRÛLÉE', [rule('Crème Brûlée', 'dessert')]), 'dessert');
});

// ---------------------------------------------------------------- whole word

test('wholeWord true does not match inside a longer word', () => {
  assert.equal(run('concatenate', [rule('cat', 'dog', { wholeWord: true })]), null);
});

test('wholeWord true matches standalone word and ignores surrounding punctuation', () => {
  assert.equal(
    run('cat concatenate cats cat. (cat) cat\'s', [rule('cat', 'dog', { wholeWord: true })]),
    "dog concatenate cats dog. (dog) dog's"
  );
});

test('wholeWord false matches inside a longer word', () => {
  assert.equal(run('concatenate', [rule('cat', 'dog', { wholeWord: false })]), 'condogenate');
});

test('wholeWord treats underscore and digits as word characters', () => {
  assert.equal(run('cat_x', [rule('cat', 'dog', { wholeWord: true })]), null);
  assert.equal(run('cat1', [rule('cat', 'dog', { wholeWord: true })]), null);
});

test('wholeWord matches at start and end of text', () => {
  assert.equal(run('cat', [rule('cat', 'dog', { wholeWord: true })]), 'dog');
});

test('wholeWord applies to multi-word phrases', () => {
  assert.equal(
    run('New York Newark New York.', [rule('New York', 'NY', { wholeWord: true })]),
    'NY Newark NY.'
  );
});

test('missing wholeWord defaults to false', () => {
  const r = rule('cat', 'dog');
  delete r.wholeWord;
  assert.equal(run('concatenate', [r]), 'condogenate');
});

// ---------------------------------------------------------------- regex special characters

test('C++ matches literally', () => {
  assert.equal(run('I like C++ and C.', [rule('C++', 'C#')]), 'I like C# and C.');
});

test('a.b matches only the literal dot', () => {
  assert.equal(run('a.b axb', [rule('a.b', 'X')]), 'X axb');
});

test('$5 (off) matches literally', () => {
  assert.equal(run('Only $5 (off) today, not 5 off', [rule('$5 (off)', 'SALE')]), 'Only SALE today, not 5 off');
});

test('brackets, braces and pipes match literally', () => {
  assert.equal(run('[x] {1,2} a|b', [rule('[x]', 'X'), rule('{1,2}', 'Y'), rule('a|b', 'Z')]), 'X Y Z');
});

test('backslash matches literally', () => {
  assert.equal(run('C:\\temp', [rule('C:\\temp', 'D:\\data')]), 'D:\\data');
});

// ---------------------------------------------------------------- replacement is literal

test('$1 in replacement is inserted literally', () => {
  assert.equal(run('price', [rule('price', '$1 cost')]), '$1 cost');
});

test('$& in replacement is inserted literally', () => {
  assert.equal(run('x', [rule('x', '[$&]')]), '[$&]');
});

test('$$, $` and $\' in replacement are inserted literally', () => {
  assert.equal(run('x', [rule('x', "$$ $` $'")]), "$$ $` $'");
});

test('$<name> in replacement is inserted literally', () => {
  assert.equal(run('x', [rule('x', '$<name>')]), '$<name>');
});

// ---------------------------------------------------------------- no re-scan / no chaining

test('replacement is not re-scanned (cat -> cats does not loop)', () => {
  assert.equal(run('cat cat', [rule('cat', 'cats')]), 'cats cats');
});

test('replacement that contains the find is not re-applied', () => {
  assert.equal(run('ab', [rule('a', 'aa')]), 'aab');
});

test('rules do not chain (A -> B, B -> C on "A B" gives "B C")', () => {
  assert.equal(run('A B', [rule('A', 'B'), rule('B', 'C')]), 'B C');
});

test('rules do not chain regardless of rule order', () => {
  assert.equal(run('A B', [rule('B', 'C'), rule('A', 'B')]), 'B C');
});

// ---------------------------------------------------------------- overlap resolution

test('overlapping rules at the same position prefer the longest match', () => {
  assert.equal(run('New York', [rule('New', 'X'), rule('New York', 'Y')]), 'Y');
});

test('longest-match preference does not depend on rule order', () => {
  assert.equal(run('New York', [rule('New York', 'Y'), rule('New', 'X')]), 'Y');
});

test('same-length ties go to the first rule in order', () => {
  assert.equal(run('x', [rule('x', '1'), rule('X', '2')]), '1');
  assert.equal(run('x', [rule('X', '2'), rule('x', '1')]), '2');
});

test('earliest match wins even when a later-starting rule would be longer', () => {
  // "a b" starts at 0 and "b c" starts at 2; the earlier one must win.
  assert.equal(run('a b c', [rule('b c', 'X'), rule('a b', 'Y')]), 'Y c');
});

test('after a match is consumed, overlapping text is not replaced', () => {
  assert.equal(run('abcd', [rule('abc', 'X'), rule('bcd', 'Y')]), 'Xd');
});

test('a rule that matched earlier text still applies to later text', () => {
  assert.equal(run('ab xb', [rule('ab', '1'), rule('b', '2')]), '1 x2');
});

// ---------------------------------------------------------------- enabled / ignored rules

test('disabled rules are ignored', () => {
  assert.equal(
    run('cat dog', [rule('cat', 'CAT', { enabled: false }), rule('dog', 'DOG')]),
    'cat DOG'
  );
});

test('a rule with enabled false is ignored even if it would match first', () => {
  assert.equal(run('cat', [rule('cat', 'X', { enabled: false })]), null);
});

test('empty find is ignored and does not insert the replacement', () => {
  assert.equal(run('x', [rule('', 'Z'), rule('x', 'y')]), 'y');
});

test('whitespace-only find is ignored', () => {
  assert.equal(run('x  ', [rule('   ', 'Z'), rule('x', 'y')]), 'y  ');
});

test('non-string replace makes a rule unusable', () => {
  assert.equal(compileRules([{ find: 'cat', replace: null }]), null);
});

// ---------------------------------------------------------------- whitespace in find

test('whitespace in find matches a single space', () => {
  assert.equal(run('foo bar', [rule('foo bar', 'X')]), 'X');
});

test('whitespace in find matches any run of spaces', () => {
  assert.equal(run('foo    bar', [rule('foo bar', 'X')]), 'X');
});

test('whitespace in find matches tabs and newlines', () => {
  assert.equal(run('foo\tbar', [rule('foo bar', 'X')]), 'X');
  assert.equal(run('foo\nbar', [rule('foo bar', 'X')]), 'X');
  assert.equal(run('foo \r\n  bar', [rule('foo bar', 'X')]), 'X');
});

test('whitespace in find matches across a line break in the page', () => {
  assert.equal(run('Please\nturn off\nthe lights', [rule('turn off the lights', 'X')]), 'Please\nX');
});

test('leading and trailing whitespace in find is trimmed', () => {
  assert.equal(run('a foo bar b', [rule('   foo bar  ', 'X')]), 'a X b');
});

test('whitespace in find does not match when words are not separated', () => {
  assert.equal(run('foobar', [rule('foo bar', 'X')]), null);
});

test('whitespace in find does not match without any whitespace', () => {
  assert.equal(run('foo-bar', [rule('foo bar', 'X')]), null);
});

// ---------------------------------------------------------------- unicode

test('wholeWord works with accented letters (café)', () => {
  assert.equal(run('café au lait', [rule('café', 'coffee', { wholeWord: true })]), 'coffee au lait');
  assert.equal(run('le café.', [rule('café', 'coffee', { wholeWord: true })]), 'le coffee.');
});

test('wholeWord does not match "café" inside "cafés" or "caféine"', () => {
  assert.equal(run('cafés', [rule('café', 'coffee', { wholeWord: true })]), null);
  assert.equal(run('caféine', [rule('café', 'coffee', { wholeWord: true })]), null);
});

test('wholeWord does not match "naïve" inside "naïveté"', () => {
  assert.equal(run('naïveté', [rule('naïve', 'simple', { wholeWord: true })]), null);
});

test('wholeWord matches "naïve" as a standalone word', () => {
  assert.equal(run('a naïve idea', [rule('naïve', 'simple', { wholeWord: true })]), 'a simple idea');
});

test('wholeWord treats non-ASCII letters as word characters', () => {
  assert.equal(run('Zürich', [rule('Zurich', 'X', { wholeWord: true })]), null);
  assert.equal(run('Zürich', [rule('Zür', 'X', { wholeWord: true })]), null);
});

test('non-ASCII phrases are replaced', () => {
  assert.equal(run('東京に行く', [rule('東京', 'Tokyo')]), 'Tokyoに行く');
  assert.equal(run('Ça va? Ça va!', [rule('Ça va', 'Bon')]), 'Bon? Bon!');
});

test('non-ASCII phrase with wholeWord respects CJK boundaries as non-letters only where applicable', () => {
  // Chinese characters are letters (\p{L}), so a match inside a longer run is rejected.
  assert.equal(run('東京都', [rule('東京', 'Tokyo', { wholeWord: true })]), null);
  assert.equal(run('東京 都', [rule('東京', 'Tokyo', { wholeWord: true })]), 'Tokyo 都');
});

test('emoji and symbols in find match literally', () => {
  assert.equal(run('I ❤️ it', [rule('❤️', 'love')]), 'I love it');
  assert.equal(run('5€ or $5', [rule('€', 'EUR')]), '5EUR or $5');
});

// ---------------------------------------------------------------- empty replace

test('empty replace deletes the phrase', () => {
  assert.equal(run('remove-me! keep', [rule('remove-me', '')]), '! keep');
});

test('empty replace deletes every occurrence', () => {
  assert.equal(run('a-b-c', [rule('-', '')]), 'abc');
});

test('empty replace of an entire text returns empty string', () => {
  assert.equal(run('cat', [rule('cat', '')]), '');
});

// ---------------------------------------------------------------- misc behaviour

test('replacement can change length in both directions', () => {
  assert.equal(run('s l', [rule('s', 'longer'), rule('l', 's')]), 'longer s');
});

test('results are correct across many matches in a large text', () => {
  const words = [];
  for (let i = 0; i < 20000; i++) words.push(i % 3 === 0 ? 'foo' : 'bar');
  const text = words.join(' ');
  const out = run(text, [rule('foo', 'X', { wholeWord: true }), rule('bar', 'Y', { wholeWord: true })]);
  const expected = [];
  for (let i = 0; i < 20000; i++) expected.push(i % 3 === 0 ? 'X' : 'Y');
  assert.equal(out, expected.join(' '));
});

test('many rules on a large text complete quickly', () => {
  const rules = [];
  for (let i = 0; i < 50; i++) rules.push(rule('word' + i, 'W' + i));
  const parts = [];
  for (let i = 0; i < 5000; i++) parts.push('word' + (i % 60) + ' filler text');
  const text = parts.join('\n');
  const start = Date.now();
  const out = run(text, rules);
  const elapsed = Date.now() - start;
  const expected = parts.map((p) => p.replace(/^word(\d+)/, 'W$1')).join('\n');
  assert.equal(out, expected);
  assert.ok(elapsed < 5000, `took ${elapsed}ms`);
});

// ---------------------------------------------------------------- browser global

test('loads as a classic browser script and exposes window.PhraseReplacer', () => {
  const file = path.join(__dirname, '..', '..', 'extension', 'src', 'replacer.js');
  const code = fs.readFileSync(file, 'utf8');
  const sandbox = { window: {} };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'replacer.js' });
  const api = sandbox.PhraseReplacer;
  assert.equal(typeof api.escapeRegExp, 'function');
  assert.equal(typeof api.compileRules, 'function');
  assert.equal(typeof api.replaceText, 'function');
  const compiled = api.compileRules([{ find: 'cat', replace: 'dog', caseSensitive: false, wholeWord: true, enabled: true }]);
  assert.equal(api.replaceText('Cat concatenate', compiled), 'dog concatenate');
});

test('require() exports exactly the three API functions', () => {
  assert.deepEqual(Object.keys(require('../../extension/src/replacer.js')).sort(),
    ['compileRules', 'escapeRegExp', 'replaceText']);
});
