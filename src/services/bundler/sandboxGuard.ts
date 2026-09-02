export const SANDBOX_GUARD_PREAMBLE = `
(function() {
  function trap(name) {
    var err = function() { throw new Error('SecurityError: ' + name + ' is disabled here.'); };
    return new Proxy(err, {
      get: function(_target, prop) {
        if (prop === Symbol.toPrimitive || prop === 'toString' || prop === 'valueOf') {
          return function() { return '[SecurityDisabled: ' + name + ']'; };
        }
        throw err();
      },
      apply: function() { throw err(); },
      construct: function() { throw err(); },
      set: function() { throw err(); },
      defineProperty: function() { throw err(); },
      deleteProperty: function() { throw err(); }
    });
  }
  var BLOCKED = ['indexedDB','fetch','caches','importScripts','XMLHttpRequest','WebSocket','EventSource','BroadcastChannel','Worker','SharedWorker','openDatabase'];
  function lock(target, name) {
    if (!target) return;
    try {
      Object.defineProperty(target, name, {
        get: function() { return trap(name); },
        set: function() { throw new Error('SecurityError: Modifying ' + name + ' is disabled here.'); },
        configurable: false,
        enumerable: false
      });
    } catch (_) {}
  }
  BLOCKED.forEach(function(name) {
    if (typeof self !== 'undefined') lock(self, name);
    if (typeof globalThis !== 'undefined') lock(globalThis, name);
    if (typeof WorkerGlobalScope !== 'undefined' && WorkerGlobalScope.prototype) lock(WorkerGlobalScope.prototype, name);
    if (typeof DedicatedWorkerGlobalScope !== 'undefined' && DedicatedWorkerGlobalScope.prototype) lock(DedicatedWorkerGlobalScope.prototype, name);
  });
  if (typeof navigator !== 'undefined' && navigator) {
    lock(navigator, 'serviceWorker');
    lock(navigator, 'sendBeacon'); // closes the beacon-exfiltration gap the old sandbox missed
  }
})();
`;
