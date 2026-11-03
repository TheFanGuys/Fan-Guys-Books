/* ═══════════════════════════════════════════════════════════════
   FAN GUYS BOOKS — shared helpers used by invoices.html and ledger.html
   Both pages live in one app, so they share one storage on the phone.
   No business data is ever stored in this file or in the repo.
═══════════════════════════════════════════════════════════════ */
var FGB = (function () {
  var INV_DB = 'fg-v9';                 // Invoices: {jobs, receipts}
  var LED_YEAR = /^fg_j_(\d{4})$/;      // Ledger: one key per year
  var LED_CUSTS = 'fg_c';
  var MAILBOX = 'fg_bridge_inv2led';
  var PIN = 'fgb-pin';
  var UNLOCK = 'fg-unlocked';           // shared 8-hour unlock window
  var UNLOCK_MS = 8 * 60 * 60 * 1000;

  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function json(k, fb) { try { var v = JSON.parse(get(k)); return v == null ? fb : v; } catch (e) { return fb; } }

  /* ── Passcode (one for the whole app) ── */
  function pin() { return get(PIN) || '7264'; }
  function setPin(p) { set(PIN, p); }
  function isUnlocked() { return (Date.now() - parseInt(get(UNLOCK) || '0', 10)) < UNLOCK_MS; }
  function markUnlocked() { set(UNLOCK, String(Date.now())); }

  /* ── Receipt photos live in IndexedDB ── */
  function idb() {
    return new Promise(function (res) {
      try {
        var rq = indexedDB.open('fg-images', 1);
        rq.onupgradeneeded = function () { rq.result.createObjectStore('imgs'); };
        rq.onsuccess = function () { res(rq.result); };
        rq.onerror = function () { res(null); };
      } catch (e) { res(null); }
    });
  }
  function allImages() {
    return idb().then(function (db) {
      if (!db) return {};
      return new Promise(function (res) {
        var out = {};
        try {
          var cur = db.transaction('imgs', 'readonly').objectStore('imgs').openCursor();
          cur.onsuccess = function (e) { var c = e.target.result; if (c) { out[c.key] = c.value; c.continue(); } else res(out); };
          cur.onerror = function () { res(out); };
        } catch (e) { res(out); }
      });
    });
  }
  function putImages(map) {
    var ids = Object.keys(map || {});
    if (!ids.length) return Promise.resolve();
    return idb().then(function (db) {
      if (!db) return;
      return new Promise(function (res) {
        try {
          var tx = db.transaction('imgs', 'readwrite'), st = tx.objectStore('imgs');
          ids.forEach(function (id) { st.put(map[id], id); });
          tx.oncomplete = res; tx.onerror = res;
        } catch (e) { res(); }
      });
    });
  }

  /* ── Ledger reading ── */
  function ledgerYears() {
    var out = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i), m = k && k.match(LED_YEAR);
        if (m) { var v = json(k, []); if (Array.isArray(v)) out[m[1]] = v; }
      }
    } catch (e) {}
    return out;
  }
  /* Ids of invoice reports that are already in the Ledger */
  function sentIds() {
    var s = {}, ys = ledgerYears();
    Object.keys(ys).forEach(function (y) { ys[y].forEach(function (j) { if (j && j.srcId) s[j.srcId] = 1; }); });
    return s;
  }
  /* A report's job number, from a name like "2026-30 Wesco Phoenix" */
  function jobNoOf(name) {
    var m = String(name || '').trim().match(/^([0-9][0-9\-\/.]*[0-9]|[0-9]+)\s+(.+)$/);
    return m ? m[1] : '';
  }
  /* Is this report in the Ledger? Linked by id, or a ledger job with the same job number
     (jobs you typed into the Ledger yourself before the two apps were connected). */
  function ledgerIndex() {
    var idx = { src: {}, ids: {} }, ys = ledgerYears();
    Object.keys(ys).forEach(function (y) { ys[y].forEach(function (j) {
      if (!j) return; if (j.srcId) idx.src[j.srcId] = 1; if (j.id) idx.ids[String(j.id)] = 1;
    }); });
    return idx;
  }
  function inLedger(job, idx) {
    idx = idx || ledgerIndex();
    if (!job) return false;
    if (idx.src[job.id]) return true;
    var no = jobNoOf(job.name);
    return !!(no && idx.ids[no]);
  }

  /* ── Smart customer matching ──
     "2026-30 Wesco Phoenix" → Wesco. Learns from your corrections:
     if you change an imported customer and save, that name maps there from then on. */
  var ALIAS = 'fgb-cust-alias';
  function norm(s) {
    return String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ')
      .replace(/\b(inc|llc|co|corp|company|the)\b/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function restAfter(raw, custNorm) {
    var words = norm(raw).split(' '), cw = custNorm.split(' ');
    for (var i = 0; i + cw.length <= words.length; i++) {
      if (words.slice(i, i + cw.length).join(' ') === custNorm) { words.splice(i, cw.length); break; }
    }
    return words.join(' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }
  function matchCustomer(name, list) {
    var raw = String(name || '').trim();
    list = (list || []).filter(function (c) { return c && c !== 'Custom...'; });
    if (!raw) return { customer: '', custom: '', rest: '', how: 'none' };
    var n = norm(raw), aliases = json(ALIAS, {});
    if (aliases[n] && list.indexOf(aliases[n]) >= 0) return { customer: aliases[n], custom: '', rest: '', how: 'learned' };
    var exact = list.filter(function (c) { return norm(c) === n; })[0];
    if (exact) return { customer: exact, custom: '', rest: '', how: 'exact' };
    var best = null;
    list.forEach(function (c) {
      var nc = norm(c);
      if (nc && (' ' + n + ' ').indexOf(' ' + nc + ' ') >= 0 && (!best || nc.length > norm(best).length)) best = c;
    });
    if (best) return { customer: best, custom: '', rest: restAfter(raw, norm(best)), how: 'contains' };
    var fw = n.split(' ')[0];
    var cands = list.filter(function (c) { return norm(c).split(' ')[0] === fw; });
    if (fw.length >= 4 && cands.length === 1) return { customer: cands[0], custom: '', rest: restAfter(raw, fw), how: 'first-word' };
    return { customer: 'Custom...', custom: raw, rest: '', how: 'new' };
  }
  function learnAlias(incoming, chosen) {
    if (!incoming || !chosen || chosen === 'Custom...') return;
    var a = json(ALIAS, {}), k = norm(incoming);
    if (!k || norm(chosen) === k) return;
    a[k] = chosen; set(ALIAS, JSON.stringify(a));
  }

  /* ── Send to Ledger: drop the jobs in the shared mailbox, then open the Ledger ── */
  function sendToLedger(ledgerJobs) {
    var payload = { _fanguys_bridge: 'invoice->ledger', v: 1, exportedAt: new Date().toISOString(), jobs: ledgerJobs };
    if (!set(MAILBOX, JSON.stringify(payload))) { alert('Could not save the transfer on this phone. Nothing was sent.'); return; }
    try { sessionStorage.setItem('fgb-burst', '1'); } catch (e) {}
    location.href = 'ledger.html?import=1';
  }

  /* ── One backup file for everything ── */
  function backupName() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return 'FanGuys-Books-' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '.json';
  }
  function markBackedUp() {
    var t = new Date().toISOString();
    set('fg-last-backup', t); set('fg_last_backup', t);
    var b = document.getElementById('backup-nag'); if (b) b.style.display = 'none';
  }
  function backup() {
    return allImages().then(function (images) {
      var inv = json(INV_DB, { jobs: [], receipts: [] });
      var years = {};
      var ys = ledgerYears();
      Object.keys(ys).forEach(function (y) { if (ys[y].length) years[y] = ys[y]; });
      var content = JSON.stringify({
        app: 'Fan Guys Books', v: 1, exportedAt: new Date().toISOString(),
        invoice: { jobs: inv.jobs || [], receipts: inv.receipts || [], images: images },
        ledger: { years: years, customers: json(LED_CUSTS, []), aliases: json(ALIAS, {}) },
        settings: { billTo: json('fgb-billto', null), folders: json('fgb-folders', null), driveUrl: get('fgb-drive-url'), driveKey: get('fgb-drive-key'), emailed: json('fgb-emailed', null) }
      });
      var name = backupName(), file = null;
      try { file = new File([content], name, { type: 'application/json' }); } catch (e) {}
      if (file && navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
        return navigator.share({ files: [file] }).then(markBackedUp).catch(function (err) {
          if (err && err.name === 'AbortError') return;
          download(content, name);
        });
      }
      download(content, name);
    });
  }
  function download(content, name) {
    try {
      var url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
      var a = document.createElement('a'); a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      markBackedUp();
    } catch (e) { alert('Could not create the backup file.'); }
  }

  /* ── Restore helpers (merge only: nothing is ever deleted) ── */
  function mergeInvoice(part) {
    var db = json(INV_DB, { jobs: [], receipts: [] });
    db.jobs = db.jobs || []; db.receipts = db.receipts || [];
    var r = { jAdded: 0, jUpd: 0, rAdded: 0, rUpd: 0 }, imgs = {};
    (part.jobs || []).forEach(function (j) {
      if (!j || !j.id) return;
      var i = db.jobs.findIndex(function (x) { return x.id === j.id; });
      if (i >= 0) { db.jobs[i] = j; r.jUpd++; } else { db.jobs.push(j); r.jAdded++; }
    });
    (part.receipts || []).forEach(function (x) {
      if (!x || !x.id) return;
      if (x.image && typeof x.image === 'string' && x.image.indexOf('data:') === 0) { imgs[x.id] = x.image; delete x.image; }
      var i = db.receipts.findIndex(function (y) { return y.id === x.id; });
      if (i >= 0) { db.receipts[i] = x; r.rUpd++; } else { db.receipts.push(x); r.rAdded++; }
    });
    if (part.images && typeof part.images === 'object') Object.keys(part.images).forEach(function (id) { imgs[id] = part.images[id]; });
    if (!set(INV_DB, JSON.stringify(db))) return Promise.reject(new Error('save'));
    return putImages(imgs).then(function () { return r; });
  }
  function mergeLedger(part) {
    var r = { added: 0, skipped: 0 };
    Object.keys(part.years || {}).forEach(function (y) {
      var incoming = part.years[y]; if (!Array.isArray(incoming) || !incoming.length) return;
      var key = 'fg_j_' + y, existing = json(key, []); if (!Array.isArray(existing)) existing = [];
      var have = {}; existing.forEach(function (j) { have[j.id] = 1; });
      incoming.forEach(function (j) {
        if (have[j.id]) { r.skipped++; return; }
        if (!j.year) j.year = parseInt(y, 10);
        existing.push(j); have[j.id] = 1; r.added++;
      });
      existing.sort(function (a, b) {
        var na = parseInt((String(a.id).match(/-(\d+)$/) || [0, 0])[1], 10);
        var nb = parseInt((String(b.id).match(/-(\d+)$/) || [0, 0])[1], 10);
        return na - nb;
      });
      set(key, JSON.stringify(existing));
    });
    if (Array.isArray(part.customers) && part.customers.length) {
      var cs = json(LED_CUSTS, null);
      if (Array.isArray(cs)) {
        part.customers.forEach(function (c) { if (cs.indexOf(c) < 0) cs.push(c); });
        set(LED_CUSTS, JSON.stringify(cs));
      } else set(LED_CUSTS, JSON.stringify(part.customers));
    }
    if (part.aliases && typeof part.aliases === 'object') {
      var al = json(ALIAS, {});
      Object.keys(part.aliases).forEach(function (k) { if (!al[k]) al[k] = part.aliases[k]; });
      set(ALIAS, JSON.stringify(al));
    }
    set('fg_seeded_v1', 'restored');
    return r;
  }
  function isBooksBackup(d) { return !!(d && d.app === 'Fan Guys Books' && (d.invoice || d.ledger)); }

  /* ── The Airflow fan: spins at this month's pace ──
     pace = this month ÷ your average month. 1 = a normal month. */
  function fan(opts) {
    var pace = Math.max(0.15, Math.min(3, opts.pace || 1));
    var secs = Math.max(1.6, Math.min(16, 7 / pace));
    var burst = false; try { burst = sessionStorage.getItem('fgb-burst') === '1'; sessionStorage.removeItem('fgb-burst'); } catch (e) {}
    var blades = '';
    for (var i = 0; i < 8; i++) blades += '<path d="M104 106 L97 20 Q110 11 123 20 L116 106 Z" transform="rotate(' + (i * 45) + ' 110 110)"/>';
    var el = document.createElement('section');
    el.className = 'fgb-hero';
    el.innerHTML =
      '<svg class="fgb-air" viewBox="0 0 390 230" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
        '<path d="M60 130 C 50 175, 80 200, 58 230"/><path d="M120 150 C 110 190, 140 210, 116 230"/>' +
        '<path d="M270 150 C 280 190, 250 210, 274 230"/><path d="M330 130 C 340 175, 310 200, 332 230"/></svg>' +
      '<svg class="fgb-fan-svg" viewBox="0 0 220 220" role="img" aria-label="Fan spinning at ' + (pace >= 1.15 ? 'a fast' : pace <= 0.85 ? 'a slow' : 'a normal') + ' pace">' +
        '<g class="fgb-blades' + (burst ? ' burst' : '') + '" style="animation-duration:' + secs.toFixed(2) + 's">' + blades + '</g>' +
        '<circle cx="110" cy="110" r="24" class="hub"/><circle cx="110" cy="110" r="9" class="cap"/></svg>' +
      '<div class="fgb-hero-num">' + opts.amount + '</div>' +
      '<div class="fgb-hero-sub">' + opts.label + '</div>';
    if (burst) setTimeout(function () { var g = el.querySelector('.fgb-blades'); if (g) g.classList.remove('burst'); }, 1800);
    return el;
  }
  function spinUp() { try { sessionStorage.setItem('fgb-burst', '1'); } catch (e) {} }

  /* What kind of backup file is this? Works for all three: Books, old Invoice Pro, old Ledger Pro */
  function detect(d) {
    if (isBooksBackup(d)) return 'books';
    if (d && !Array.isArray(d) && (d.app === 'Invoice Pro' || Array.isArray(d.receipts))) return 'invoice';
    if (d && (d.app === 'Ledger Pro' || (d.years && typeof d.years === 'object') || Array.isArray(d))) return 'ledger';
    return null;
  }
  function parseLoose(text) {
    if (!text) return null;
    var t = String(text).trim().replace(/[“”„″]/g, '"').replace(/[‘’‛′]/g, "'").replace(/ /g, ' ');
    var i = t.search(/[\{\[]/); if (i > 0) t = t.slice(i);
    try { return JSON.parse(t); } catch (e) { return null; }
  }
  /* Restore any backup into the shared storage. Adds what's missing, never deletes. */
  function restoreAny(d) {
    var kind = detect(d);
    if (!kind) { alert('That file is not a Fan Guys backup.'); return; }
    var label = { books: 'Fan Guys Books', invoice: 'Invoice Pro', ledger: 'Ledger Pro' }[kind];
    if (!confirm('Restore this ' + label + ' backup?\n\nAdds anything missing and updates matching invoice reports.\nNothing is deleted.')) return;
    var invPart = kind === 'books' ? d.invoice : kind === 'invoice' ? d : null;
    var ledPart = kind === 'books' ? d.ledger : null;
    if (kind === 'books' && d.settings) {   // sending settings: fill in only what this phone doesn't have yet
      var st = d.settings;
      if (st.billTo && !get('fgb-billto')) set('fgb-billto', JSON.stringify(st.billTo));
      if (st.folders && !get('fgb-folders')) set('fgb-folders', JSON.stringify(st.folders));
      if (st.driveUrl && !get('fgb-drive-url')) set('fgb-drive-url', st.driveUrl);
      if (st.driveKey && !get('fgb-drive-key')) set('fgb-drive-key', st.driveKey);
      if (st.emailed && !get('fgb-emailed')) set('fgb-emailed', JSON.stringify(st.emailed));
    }
    if (kind === 'ledger') {
      ledPart = Array.isArray(d) ? { years: {} } : d;
      if (Array.isArray(d)) d.forEach(function (j) {
        var y = j.year || (String(j.id || '').match(/^(\d{4})/) || [])[1]; if (!y) return;
        (ledPart.years[y] = ledPart.years[y] || []).push(j);
      });
      if (!ledPart.years && Array.isArray(d.jobs)) { ledPart = { years: {} }; ledPart.years[d.year || (d.jobs[0] && d.jobs[0].year)] = d.jobs; }
    }
    var msg = [];
    var p = invPart ? mergeInvoice(invPart) : Promise.resolve(null);
    p.then(function (ri) {
      if (ri) msg.push('Invoice reports: ' + ri.jAdded + ' added, ' + ri.jUpd + ' updated.\nReceipts: ' + ri.rAdded + ' added, ' + ri.rUpd + ' updated.');
      if (ledPart) { var rl = mergeLedger(ledPart); msg.push('Ledger jobs: ' + rl.added + ' added, ' + rl.skipped + ' already there.'); }
      alert('Restore complete.\n\n' + msg.join('\n\n') + '\n\nNothing was deleted.');
      location.reload();
    }).catch(function () { alert('COULD NOT SAVE. The phone refused to store the restore, so nothing changed.'); });
  }

  return {
    pin: pin, setPin: setPin, isUnlocked: isUnlocked, markUnlocked: markUnlocked,
    sentIds: sentIds, sendToLedger: sendToLedger,
    ledgerIndex: ledgerIndex, inLedger: inLedger, jobNoOf: jobNoOf,
    matchCustomer: matchCustomer, learnAlias: learnAlias, fan: fan, spinUp: spinUp,
    backup: backup, markBackedUp: markBackedUp,
    mergeInvoice: mergeInvoice, mergeLedger: mergeLedger, isBooksBackup: isBooksBackup,
    detect: detect, parseLoose: parseLoose, restoreAny: restoreAny
  };
})();
