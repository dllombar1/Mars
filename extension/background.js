// MV3 service worker. Seeds default storage values on first install.
chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason !== 'install') return;

  chrome.storage.sync.get(['rules', 'enabled'], function (items) {
    if (chrome.runtime.lastError) {
      console.error('Phrase Replacer: could not read storage', chrome.runtime.lastError.message);
      return;
    }

    var defaults = {};
    if (items.rules === undefined) defaults.rules = [];
    if (items.enabled === undefined) defaults.enabled = true;
    if (Object.keys(defaults).length === 0) return;

    chrome.storage.sync.set(defaults, function () {
      if (chrome.runtime.lastError) {
        console.error('Phrase Replacer: could not write defaults', chrome.runtime.lastError.message);
      }
    });
  });
});
