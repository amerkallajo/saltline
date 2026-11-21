// Shared by the viewmodels, dedicated server and hosted rooms. Times are milliseconds.
(() => {
  'use strict';
  const rules = Object.freeze({
    rifle: Object.freeze({ magSize: 30, reserve: 120, rpm: 720, interval: 78, reload: 2240, emptyReload: 2720, damage: 26, range: 300 }),
    pistol: Object.freeze({ magSize: 15, reserve: 60, rpm: 420, interval: 130, reload: 1500, emptyReload: 1900, damage: 34, range: 120 }),
    sniper: Object.freeze({ magSize: 5, reserve: 20, rpm: 60, interval: 950, reload: 2700, emptyReload: 3200, damage: 85, range: 420 }),
  });
  if (typeof module === 'object') module.exports = rules;
  else window.SaltlineWeaponRules = rules;
})();
