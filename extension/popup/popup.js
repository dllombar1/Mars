// Popup UI for Phrase Replacer. Plain script (MV3 forbids inline code),
// Chrome 88 compatible, callback-style chrome.storage calls.
(function () {
  'use strict';

  var enabledEl = document.getElementById('enabled');
  var rulesEl = document.getElementById('rules');
  var emptyEl = document.getElementById('empty');
  var addBtn = document.getElementById('add');
  var exportBtn = document.getElementById('export');
  var importBtn = document.getElementById('import');
  var ioEl = document.getElementById('io');
  var statusEl = document.getElementById('status');
  var template = document.getElementById('rule-template');

  var loaded = false;   // do not write until the initial read succeeded
  var saveTimer = null;

  function genId() {
    return 'r_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  }

  function setStatus(text, isError) {
    statusEl.textContent = text;
    statusEl.classList.toggle('error', !!isError);
  }

  function lastErrorMessage() {
    return chrome.runtime.lastError ? chrome.runtime.lastError.message : '';
  }

  function createRow(rule) {
    var row = template.content.firstElementChild.cloneNode(true);
    row.setAttribute('data-id', rule.id);
    row.querySelector('.find').value = rule.find || '';
    row.querySelector('.replace').value = rule.replace || '';
    row.querySelector('.case').checked = !!rule.caseSensitive;
    row.querySelector('.word').checked = rule.wholeWord !== false;
    row.querySelector('.rule-enabled').checked = rule.enabled !== false;
    return row;
  }

  function readRow(row) {
    return {
      id: row.getAttribute('data-id'),
      find: row.querySelector('.find').value,
      replace: row.querySelector('.replace').value,
      caseSensitive: row.querySelector('.case').checked,
      wholeWord: row.querySelector('.word').checked,
      enabled: row.querySelector('.rule-enabled').checked
    };
  }

  function readRows() {
    return Array.prototype.map.call(rulesEl.querySelectorAll('.rule'), readRow);
  }

  function renderRules(rules) {
    rulesEl.textContent = '';
    rules.forEach(function (rule) {
      rulesEl.appendChild(createRow(rule));
    });
    updateEmpty();
  }

  function updateEmpty() {
    emptyEl.hidden = rulesEl.querySelector('.rule') !== null;
  }

  // Writes the given keys to chrome.storage.sync and reports the outcome in #status.
  function writeStorage(items, okMessage) {
    if (!loaded) {
      setStatus('Not loaded yet, nothing saved.', true);
      return;
    }
    setStatus('Saving...');
    chrome.storage.sync.set(items, function () {
      if (chrome.runtime.lastError) {
        setStatus('Could not save: ' + lastErrorMessage(), true);
        return;
      }
      setStatus(okMessage || 'Saved');
    });
  }

  function saveRules(okMessage) {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    writeStorage({ rules: readRows() }, okMessage);
  }

  // Text edits are debounced; checkboxes, add and delete save immediately.
  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = null;
      saveRules();
    }, 300);
  }

  // ---- Initial load ----
  chrome.storage.sync.get(['enabled', 'rules'], function (items) {
    if (chrome.runtime.lastError) {
      setStatus('Could not load rules: ' + lastErrorMessage(), true);
      renderRules([]);
      return;
    }
    loaded = true;
    enabledEl.checked = items.enabled !== false;
    renderRules(Array.isArray(items.rules) ? items.rules : []);
    setStatus('');
  });

  // ---- Global on/off ----
  enabledEl.addEventListener('change', function () {
    writeStorage({ enabled: enabledEl.checked });
  });

  // ---- Add rule ----
  addBtn.addEventListener('click', function () {
    var row = createRow({
      id: genId(),
      find: '',
      replace: '',
      caseSensitive: false,
      wholeWord: true,
      enabled: true
    });
    rulesEl.appendChild(row);
    updateEmpty();
    row.querySelector('.find').focus();
    saveRules();
  });

  // ---- Delete / edit (event delegation) ----
  rulesEl.addEventListener('click', function (event) {
    var button = event.target.closest('.delete');
    if (!button) return;
    var row = button.closest('.rule');
    if (row) row.parentNode.removeChild(row);
    updateEmpty();
    saveRules();
  });

  rulesEl.addEventListener('input', function (event) {
    if (event.target.matches('input[type="text"]')) scheduleSave();
  });

  rulesEl.addEventListener('change', function (event) {
    if (event.target.matches('input[type="checkbox"]')) saveRules();
  });

  // ---- Export: fill the textarea with the current rules as JSON ----
  exportBtn.addEventListener('click', function () {
    var rules = readRows().map(function (rule) {
      return {
        find: rule.find,
        replace: rule.replace,
        caseSensitive: rule.caseSensitive,
        wholeWord: rule.wholeWord,
        enabled: rule.enabled
      };
    });
    ioEl.value = JSON.stringify(rules, null, 2);
    ioEl.focus();
    ioEl.select();
    setStatus('Exported. Copy the text in the box below.');
  });

  // ---- Import: append rules from the textarea JSON ----
  importBtn.addEventListener('click', function () {
    var parsed;
    try {
      parsed = JSON.parse(ioEl.value);
    } catch (err) {
      setStatus('Import failed: the text is not valid JSON.', true);
      return;
    }

    if (parsed && !Array.isArray(parsed) && Array.isArray(parsed.rules)) {
      parsed = parsed.rules;
    }
    if (!Array.isArray(parsed)) {
      setStatus('Import failed: expected an array of rules.', true);
      return;
    }

    var imported = [];
    for (var i = 0; i < parsed.length; i++) {
      var item = parsed[i];
      if (!item || typeof item !== 'object' || typeof item.find !== 'string') {
        setStatus('Import failed: rule ' + (i + 1) + ' needs a "find" text.', true);
        return;
      }
      imported.push({
        id: genId(),
        find: item.find,
        replace: typeof item.replace === 'string' ? item.replace : '',
        caseSensitive: item.caseSensitive === true,
        wholeWord: item.wholeWord !== false,
        enabled: item.enabled !== false
      });
    }

    renderRules(readRows().concat(imported));
    saveRules('Imported ' + imported.length + ' rule(s).');
    ioEl.value = '';
  });
})();
