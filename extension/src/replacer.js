/*
 * Phrase Replacer - pure matching logic.
 *
 * Works as a classic browser script (exposes window.PhraseReplacer) and via
 * require() in Node. No dependencies, no ES modules. Targets Chrome 88+.
 */
(function (root) {
  'use strict';

  var WORD_CHAR = '\\p{L}\\p{N}_';

  /**
   * Escape every regex metacharacter so the string matches literally.
   * The escaped set is valid under the `u` flag (identity escapes are only
   * permitted for syntax characters).
   */
  function escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function isEnabledRule(rule) {
    return rule.enabled !== false;
  }

  /**
   * Build the regex source for a trimmed find phrase. Internal runs of
   * whitespace match any whitespace run (including newlines).
   */
  function buildSource(find, wholeWord) {
    var body = find
      .split(/\s+/)
      .map(escapeRegExp)
      .join('\\s+');
    if (wholeWord) {
      body = '(?<![' + WORD_CHAR + '])' + body + '(?![' + WORD_CHAR + '])';
    }
    return body;
  }

  /**
   * Turn an array of rule objects into a compiled matcher.
   * Returns an array of { regex, replace } entries in rule order, or null if
   * no usable rule remains (missing/invalid/disabled/empty-find rules are
   * dropped).
   */
  function compileRules(rules) {
    if (!Array.isArray(rules)) return null;
    var compiled = [];
    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      if (!rule || typeof rule !== 'object') continue;
      if (!isEnabledRule(rule)) continue;
      if (typeof rule.find !== 'string' || typeof rule.replace !== 'string') continue;

      var find = rule.find.trim();
      if (find === '') continue;

      var flags = 'gu';
      if (rule.caseSensitive !== true) flags += 'i';

      var regex;
      try {
        regex = new RegExp(buildSource(find, rule.wholeWord === true), flags);
      } catch (e) {
        continue;
      }
      compiled.push({ regex: regex, replace: rule.replace });
    }
    return compiled.length ? compiled : null;
  }

  /**
   * Replace all matches in `text` in a single left-to-right pass.
   *
   * At each position the EARLIEST match across all rules wins; ties are broken
   * by the LONGEST match, then by rule order. Replacement text is inserted
   * literally and never re-scanned, so rules do not chain.
   *
   * Returns the new string, or null if nothing changed.
   */
  function replaceText(text, compiled) {
    if (typeof text !== 'string' || !compiled || !compiled.length) return null;

    // Cached next match per rule: { index, length } or null when exhausted.
    var next = new Array(compiled.length);
    var searched = new Array(compiled.length);
    var i;
    for (i = 0; i < compiled.length; i++) {
      next[i] = null;
      searched[i] = false;
    }

    var out = '';
    var pos = 0;
    var changed = false;

    for (;;) {
      var bestIdx = -1;
      var bestStart = 0;
      var bestLen = 0;

      for (i = 0; i < compiled.length; i++) {
        // Refresh the cached match if it is behind the current position.
        if (!searched[i] || (next[i] && next[i].index < pos)) {
          searched[i] = true;
          var re = compiled[i].regex;
          re.lastIndex = pos;
          var m = re.exec(text);
          next[i] = m ? { index: m.index, length: m[0].length } : null;
        }
        var cand = next[i];
        if (!cand) continue;
        if (
          bestIdx === -1 ||
          cand.index < bestStart ||
          (cand.index === bestStart && cand.length > bestLen)
        ) {
          bestIdx = i;
          bestStart = cand.index;
          bestLen = cand.length;
        }
      }

      if (bestIdx === -1) break;

      // bestLen is always > 0: find is trimmed and non-empty, and lookarounds
      // are zero-width, so every match consumes at least one character.
      out += text.slice(pos, bestStart) + compiled[bestIdx].replace;
      pos = bestStart + bestLen;
      changed = true;
      // Matches of the winning rule that start before pos are now stale; the
      // refresh check above handles that on the next iteration.
      next[bestIdx] = null;
      searched[bestIdx] = false;
    }

    if (!changed) return null;
    out += text.slice(pos);
    return out === text ? null : out;
  }

  var api = {
    escapeRegExp: escapeRegExp,
    compileRules: compileRules,
    replaceText: replaceText
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.PhraseReplacer = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
