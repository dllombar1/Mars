/*
 * Phrase Replacer content script.
 * Runs after src/replacer.js (classic script). Uses the global
 * window.PhraseReplacer.compileRules / replaceText for all matching.
 */
(function () {
  'use strict';

  if (window.__phraseReplacerContentLoaded) return;
  window.__phraseReplacerContentLoaded = true;

  var PR = window.PhraseReplacer;
  if (!PR || typeof PR.compileRules !== 'function' || typeof PR.replaceText !== 'function') {
    return;
  }

  var TEXT_NODE = 3;
  var ELEMENT_NODE = 1;
  var OBSERVE_OPTIONS = { childList: true, subtree: true, characterData: true };
  var PRUNE_MIN = 1000;

  // Ancestor tags whose text is never touched (compared upper-cased, so SVG <style> matches too).
  var SKIP_TAGS = {
    SCRIPT: true,
    STYLE: true,
    NOSCRIPT: true,
    TEXTAREA: true,
    INPUT: true,
    SELECT: true,
    OPTION: true,
    TEMPLATE: true,
    IFRAME: true
  };

  var state = { enabled: true, rules: [] };
  var compiled = null;

  // Text nodes we changed. The WeakMap holds the originals; the Set gives us iteration.
  var tracked = new Set();
  var records = new WeakMap(); // Text -> { original: string, applied: string }
  var pruneAt = PRUNE_MIN;

  var titleRecord = null; // { original: string, applied: string } for document.title

  var observer = new MutationObserver(onMutations);

  function isSkipped(node) {
    var el = node.parentNode;
    while (el && el.nodeType === ELEMENT_NODE) {
      if (SKIP_TAGS[String(el.nodeName).toUpperCase()] || el.isContentEditable) return true;
      el = el.parentNode;
    }
    return false;
  }

  function inBody(node) {
    var body = document.body;
    return !!body && body.contains(node);
  }

  function applyToText(node) {
    if (!node.isConnected || !inBody(node) || isSkipped(node)) return;

    var value = node.nodeValue;
    if (!value) return;

    var rec = records.get(node);
    if (rec && value === rec.applied) return; // our own edit, nothing new

    var out = PR.replaceText(value, compiled);
    if (out === null || out === value) {
      if (rec) {
        records.delete(node);
        tracked.delete(node);
      }
      return;
    }

    // Value differs from what we last applied (or is new): this is the page's new original.
    records.set(node, { original: value, applied: out });
    tracked.add(node);
    node.nodeValue = out;
  }

  function applyToSubtree(top) {
    if (top.nodeType === TEXT_NODE) {
      applyToText(top);
      return;
    }
    if (top.nodeType !== ELEMENT_NODE || !top.isConnected) return;

    // Collect first so we never mutate while the walker is iterating.
    var walker = document.createTreeWalker(top, NodeFilter.SHOW_TEXT, null);
    var list = [];
    var n;
    while ((n = walker.nextNode())) list.push(n);
    for (var i = 0; i < list.length; i++) applyToText(list[i]);
  }

  function applyToTitle() {
    var title = document.title;
    if (titleRecord && title === titleRecord.applied) return;

    var out = PR.replaceText(title, compiled);
    if (out === null || out === title) {
      titleRecord = null;
      return;
    }
    titleRecord = { original: title, applied: out };
    document.title = out;
  }

  // Disconnect while we write, then observe again so our own edits are not re-processed.
  function runPaused(fn) {
    observer.disconnect();
    try {
      fn();
    } finally {
      if (compiled) observer.observe(document.documentElement, OBSERVE_OPTIONS);
    }
  }

  function pruneTracked() {
    if (tracked.size < pruneAt) return;
    tracked.forEach(function (node) {
      if (!node.isConnected) tracked.delete(node);
    });
    pruneAt = Math.max(PRUNE_MIN, tracked.size * 2);
  }

  function onMutations(mutations) {
    if (!compiled) return;

    var queue = new Set();
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      if (m.type === 'characterData') {
        queue.add(m.target);
      } else {
        for (var j = 0; j < m.addedNodes.length; j++) queue.add(m.addedNodes[j]);
      }
    }

    runPaused(function () {
      pruneTracked();
      queue.forEach(function (node) {
        applyToSubtree(node);
      });
      applyToTitle();
    });
  }

  function applyAll() {
    if (!compiled) return;
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', applyAll, { once: true });
      return;
    }
    runPaused(function () {
      applyToSubtree(document.body);
      applyToTitle();
    });
  }

  // Restore everything we changed, if the page has not changed it since.
  function revertAll() {
    tracked.forEach(function (node) {
      var rec = records.get(node);
      if (rec && node.isConnected && node.nodeValue === rec.applied) {
        node.nodeValue = rec.original;
      }
    });
    tracked.clear();
    records = new WeakMap();

    if (titleRecord && document.title === titleRecord.applied) {
      document.title = titleRecord.original;
    }
    titleRecord = null;
  }

  function normEnabled(v) {
    return typeof v === 'boolean' ? v : true;
  }

  function normRules(v) {
    return Array.isArray(v) ? v : [];
  }

  function onStorageChanged(changes, area) {
    if (area !== 'sync') return;

    var hasEnabled = Object.prototype.hasOwnProperty.call(changes, 'enabled');
    var hasRules = Object.prototype.hasOwnProperty.call(changes, 'rules');
    if (!hasEnabled && !hasRules) return;

    if (hasEnabled) state.enabled = normEnabled(changes.enabled.newValue);
    if (hasRules) state.rules = normRules(changes.rules.newValue);

    observer.disconnect();
    revertAll();
    compiled = state.enabled ? PR.compileRules(state.rules) : null;
    if (compiled) {
      observer.observe(document.documentElement, OBSERVE_OPTIONS);
      applyAll();
    }
  }

  chrome.storage.sync.get(['enabled', 'rules'], function (res) {
    if (chrome.runtime && chrome.runtime.lastError) {
      // Fall back to defaults (enabled, no rules).
      res = {};
    }
    res = res || {};
    state.enabled = normEnabled(res.enabled);
    state.rules = normRules(res.rules);

    compiled = state.enabled ? PR.compileRules(state.rules) : null;
    if (compiled) observer.observe(document.documentElement, OBSERVE_OPTIONS);

    chrome.storage.onChanged.addListener(onStorageChanged);
    applyAll();
  });
})();
