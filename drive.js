/* ═══════════════════════════════════════════════════════════════
   FAN GUYS BOOKS — Google Drive + email helpers
   The app never signs in to Google. A small script that lives in
   YOUR Google account (script.google.com) does the Drive work; this
   file only talks to it. The script's link and key are saved on
   this phone only — never in this code.
═══════════════════════════════════════════════════════════════ */
var FGBDrive = (function () {
  var K_URL = 'fgb-drive-url', K_KEY = 'fgb-drive-key', K_FOLDERS = 'fgb-folders', K_BILL = 'fgb-billto';
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function json(k, fb) { try { var v = JSON.parse(get(k)); return v == null ? fb : v; } catch (e) { return fb; } }

  /* ── connection ── */
  function url() { return (get(K_URL) || '').trim(); }
  function key() {
    var k = get(K_KEY);
    if (!k) {
      var a = new Uint8Array(18); (window.crypto || window.msCrypto).getRandomValues(a);
      k = Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
      set(K_KEY, k);
    }
    return k;
  }
  function connected() { return /^https:\/\/script\.google(usercontent)?\.com\//.test(url()); }
  function setUrl(u) { set(K_URL, String(u || '').trim()); }

  /* The script you paste into script.google.com. Your key is filled in here, on your phone. */
  function scriptText() {
    return [
      "// Fan Guys Books — Drive helper. Lives in your Google account.",
      "// It only works when the app sends this exact key:",
      "var KEY = '" + key() + "';",
      "",
      "function doPost(e) {",
      "  var out;",
      "  try {",
      "    var d = JSON.parse(e.postData.contents);",
      "    if (d.key !== KEY) throw new Error('Wrong key');",
      "    if (d.action === 'ping') out = { ok: true, who: Session.getActiveUser().getEmail() };",
      "    else if (d.action === 'folder') out = folderInfo(jobFolder(d.year, d.job));",
      "    else if (d.action === 'upload') {",
      "      var f = jobFolder(d.year, d.job);",
      "      var old = f.getFilesByName(d.fileName);",
      "      while (old.hasNext()) old.next().setTrashed(true);",
      "      var blob = Utilities.newBlob(Utilities.base64Decode(d.base64), d.mime || 'application/pdf', d.fileName);",
      "      var file = f.createFile(blob);",
      "      out = folderInfo(f); out.fileUrl = file.getUrl();",
      "    } else throw new Error('Unknown action');",
      "  } catch (err) { out = { ok: false, error: String(err && err.message || err) }; }",
      "  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);",
      "}",
      "",
      "// Year folder at the top of your Drive (uses yours if it's already there)",
      "function yearFolder(year) {",
      "  var name = String(year);",
      "  var it = DriveApp.getRootFolder().getFoldersByName(name);",
      "  return it.hasNext() ? it.next() : DriveApp.getRootFolder().createFolder(name);",
      "}",
      "// Job folder inside the year folder (uses one you made by hand if the name matches)",
      "function jobFolder(year, job) {",
      "  var y = yearFolder(year), it = y.getFoldersByName(job);",
      "  var f = it.hasNext() ? it.next() : y.createFolder(job);",
      "  try { f.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (e) {}",
      "  return f;",
      "}",
      "function folderInfo(f) { return { ok: true, folderId: f.getId(), folderUrl: f.getUrl() }; }",
      "",
      "// Run this once from the editor so Google asks you to allow Drive access.",
      "function allowDrive() { DriveApp.getRootFolder().getName(); }"
    ].join('\n');
  }

  function call(payload) {
    if (!connected()) return Promise.reject(new Error('Google Drive is not connected yet. Go to More → Google Drive.'));
    payload.key = key();
    return fetch(url(), { method: 'POST', body: JSON.stringify(payload), redirect: 'follow' })
      .then(function (r) { if (!r.ok) throw new Error('Drive script answered ' + r.status); return r.json(); })
      .then(function (d) { if (!d || !d.ok) throw new Error((d && d.error) || 'Drive script failed'); return d; });
  }
  function ping() { return call({ action: 'ping' }); }

  /* ── job folders ── */
  function yearOf(job) {
    var m = String(job && job.name || '').match(/^(\d{4})[-\s]/);
    if (m) return +m[1];
    if (job && job.startDate && /^\d{4}/.test(job.startDate)) return +job.startDate.slice(0, 4);
    return new Date().getFullYear();
  }
  function folderName(job) { return String(job && job.name || 'Job').replace(/[\/\\]/g, '-').trim() || 'Job'; }
  function savedFolder(job) { var m = json(K_FOLDERS, {}); return m[job.id] || null; }
  function remember(job, d) {
    var m = json(K_FOLDERS, {});
    m[job.id] = { url: d.folderUrl, id: d.folderId, name: folderName(job), year: yearOf(job) };
    set(K_FOLDERS, JSON.stringify(m));
    return m[job.id];
  }
  /* Make (or find) the job folder. A renamed report gets its folder looked up again. */
  function ensureFolder(job) {
    var f = savedFolder(job);
    if (f && f.name === folderName(job) && f.year === yearOf(job)) return Promise.resolve(f);
    return call({ action: 'folder', year: yearOf(job), job: folderName(job) }).then(function (d) { return remember(job, d); });
  }
  function blobToBase64(blob) {
    return new Promise(function (res, rej) {
      var r = new FileReader();
      r.onload = function () { res(String(r.result).split(',')[1] || ''); };
      r.onerror = function () { rej(new Error('Could not read the PDF')); };
      r.readAsDataURL(blob);
    });
  }
  function upload(job, blob, fileName) {
    return blobToBase64(blob).then(function (b64) {
      return call({ action: 'upload', year: yearOf(job), job: folderName(job), fileName: fileName, base64: b64, mime: 'application/pdf' });
    }).then(function (d) { remember(job, d); return d; });
  }

  /* ── bill-to contacts ── */
  var DEFAULT_MSG = 'Hi,\n\nHere is the invoice and the job photos for {job}:\n{link}\n\nInvoice total: {total}\n\nThanks,\nFan Guys';
  function billTo() {
    var list = json(K_BILL, null);
    if (!Array.isArray(list) || !list.length) {
      list = [{ id: 'gfy', name: 'Vivid Air (GFY)', to: '', cc: '', subject: 'Invoice {job}', message: DEFAULT_MSG }];
    }
    return list;
  }
  function saveBillTo(list) { set(K_BILL, JSON.stringify(list)); }
  function fill(t, v) { return String(t || '').replace(/\{(job|link|total)\}/g, function (_, k) { return v[k] || ''; }); }
  function mailto(contact, vals) {
    var body = fill(contact.message || DEFAULT_MSG, vals).replace(/\n{3,}/g, '\n\n');
    var q = ['subject=' + encodeURIComponent(fill(contact.subject || 'Invoice {job}', vals)), 'body=' + encodeURIComponent(body)];
    if (contact.cc) q.unshift('cc=' + encodeURIComponent(contact.cc.replace(/\s+/g, '')));
    return 'mailto:' + encodeURIComponent(String(contact.to || '').replace(/\s+/g, '')).replace(/%2C/g, ',').replace(/%40/g, '@') + '?' + q.join('&');
  }

  /* ── one small sheet used for choosing and for progress ── */
  function sheet(html) {
    var ov = document.createElement('div');
    ov.className = 'fgb-sheet';
    ov.innerHTML = '<div class="fgb-sheet-card" role="dialog" aria-modal="true">' + html + '</div>';
    document.body.appendChild(ov);
    return { el: ov, close: function () { if (ov.parentNode) ov.parentNode.removeChild(ov); },
             set: function (h) { ov.firstChild.innerHTML = h; } };
  }
  function esc(s) { return String(s || '').replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function chooseContact() {
    var list = billTo();
    if (list.length === 1) return Promise.resolve(list[0]);
    return new Promise(function (res) {
      var s = sheet('<h2>Bill to</h2>' + list.map(function (c, i) {
        return '<button class="fgb-opt" data-i="' + i + '">' + esc(c.name) + '<small>' + esc(c.to || 'No email yet') + '</small></button>';
      }).join('') + '<button class="fgb-cancel">Cancel</button>');
      s.el.addEventListener('click', function (e) {
        var b = e.target.closest('button'); if (!b) return;
        s.close(); res(b.classList.contains('fgb-cancel') ? null : list[+b.getAttribute('data-i')]);
      });
    });
  }

  /* ── Email invoice: PDF → job folder → Spark ── */
  function emailInvoice(job, total, makeBlob) {
    return chooseContact().then(function (c) {
      if (!c) return;
      if (!String(c.to || '').trim()) { alert('Add the email addresses for ' + c.name + ' first: More → Bill to.'); return; }
      var fileName = (folderName(job) + ' Invoice.pdf').replace(/\s+/g, ' ');
      var vals = { job: folderName(job), total: total, link: '' };
      if (!connected()) {
        var s0 = sheet('<h2>Email invoice</h2><p>Google Drive isn\'t connected, so the email won\'t have a link. Connect it in More → Google Drive.</p>' +
          '<a class="fgb-go" href="' + esc(mailto(c, vals)) + '">Open email</a><button class="fgb-cancel">Cancel</button>');
        s0.el.addEventListener('click', function (e) { if (e.target.closest('a,.fgb-cancel')) setTimeout(s0.close, 300); });
        return;
      }
      var s = sheet('<div class="fgb-fan" aria-hidden="true"></div><h2>Saving to Google Drive</h2><p>' + esc(folderName(job)) + '</p>');
      return makeBlob().then(function (blob) { return upload(job, blob, fileName); }).then(function (d) {
        vals.link = d.folderUrl;
        s.set('<div class="fgb-done" aria-hidden="true">✓</div><h2>Saved to the job folder</h2><p>' + esc(fileName) + '</p>' +
          '<a class="fgb-go" href="' + esc(mailto(c, vals)) + '">Open email to ' + esc(c.name) + '</a>' +
          '<button class="fgb-cancel">Close</button>');
        s.el.addEventListener('click', function (e) { if (e.target.closest('a,.fgb-cancel')) setTimeout(s.close, 300); });
      }).catch(function (err) {
        s.set('<h2>Couldn\'t save to Drive</h2><p>' + esc(err.message) + '</p>' +
          '<a class="fgb-go" href="' + esc(mailto(c, vals)) + '">Open email without the link</a><button class="fgb-cancel">Close</button>');
        s.el.addEventListener('click', function (e) { if (e.target.closest('a,.fgb-cancel')) setTimeout(s.close, 300); });
      });
    });
  }

  /* ── Open job folder (makes it first if needed) ── */
  function openFolder(job) {
    var f = savedFolder(job);
    if (f && f.name === folderName(job)) { window.open(f.url, '_blank'); return; }
    var s = sheet('<div class="fgb-fan" aria-hidden="true"></div><h2>Finding the job folder</h2><p>' + esc(folderName(job)) + '</p>');
    ensureFolder(job).then(function (d) {
      s.set('<h2>Job folder is ready</h2><p>' + esc(folderName(job)) + '</p><a class="fgb-go" href="' + esc(d.url) + '" target="_blank" rel="noopener">Open in Google Drive</a><button class="fgb-cancel">Close</button>');
      s.el.addEventListener('click', function (e) { if (e.target.closest('a,.fgb-cancel')) setTimeout(s.close, 300); });
    }).catch(function (err) {
      s.set('<h2>Couldn\'t reach Drive</h2><p>' + esc(err.message) + '</p><button class="fgb-cancel">Close</button>');
      s.el.addEventListener('click', function (e) { if (e.target.closest('.fgb-cancel')) s.close(); });
    });
  }

  /* ── Settings screens ── */
  function editBillTo(onDone) {
    var list = billTo().map(function (c) { return Object.assign({}, c); });
    var s = sheet('');
    function draw() {
      s.set('<h2>Bill to</h2><p>Who gets your invoices. Saved on this phone only.</p>' +
        list.map(function (c, i) {
          return '<fieldset class="fgb-contact" data-i="' + i + '">' +
            '<label>Name<input data-f="name" value="' + esc(c.name) + '" autocomplete="organization"></label>' +
            '<label>Send to (two emails, comma between)<input data-f="to" type="email" multiple inputmode="email" value="' + esc(c.to) + '" placeholder="name@company.com, name2@company.com"></label>' +
            '<label>Copy to (optional)<input data-f="cc" type="email" multiple inputmode="email" value="' + esc(c.cc) + '"></label>' +
            '<label>Subject<input data-f="subject" value="' + esc(c.subject) + '"></label>' +
            '<label>Message<textarea data-f="message" rows="6">' + esc(c.message) + '</textarea></label>' +
            '<p class="fgb-hint">{job} becomes the report name, {link} the job folder link, {total} the invoice total.</p>' +
            (list.length > 1 ? '<button class="fgb-remove" data-i="' + i + '">Remove ' + esc(c.name) + '</button>' : '') +
            '</fieldset>';
        }).join('') +
        '<button class="fgb-add">Add another company</button>' +
        '<button class="fgb-go fgb-save">Save</button><button class="fgb-cancel">Cancel</button>');
    }
    function readForm() {
      Array.prototype.forEach.call(s.el.querySelectorAll('.fgb-contact'), function (fs) {
        var c = list[+fs.getAttribute('data-i')];
        Array.prototype.forEach.call(fs.querySelectorAll('[data-f]'), function (inp) { c[inp.getAttribute('data-f')] = inp.value; });
      });
    }
    draw();
    s.el.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.classList.contains('fgb-add')) { readForm(); list.push({ id: 'c' + Date.now(), name: 'Other company', to: '', cc: '', subject: 'Invoice {job}', message: DEFAULT_MSG }); draw(); }
      else if (b.classList.contains('fgb-remove')) { readForm(); list.splice(+b.getAttribute('data-i'), 1); draw(); }
      else if (b.classList.contains('fgb-save')) { readForm(); saveBillTo(list); s.close(); if (onDone) onDone(); }
      else if (b.classList.contains('fgb-cancel')) s.close();
    });
  }
  function setupDrive(onDone) {
    var s = sheet('');
    function draw(msg) {
      s.set('<h2>Google Drive</h2>' +
        (connected() ? '<p class="fgb-ok">Connected. Invoices save into your year and job folders.</p>' : '<p>One-time setup, about 10 minutes. Your Drive stays yours: a small script in your own Google account does the saving.</p>') +
        '<ol class="fgb-steps">' +
        '<li><b>Copy the script.</b><button class="fgb-copy">Copy script</button></li>' +
        '<li><b>Open Google Apps Script</b> and tap New project. Delete what\'s there and paste.<a class="fgb-link" href="https://script.google.com/home" target="_blank" rel="noopener">Open script.google.com</a></li>' +
        '<li><b>Allow Drive:</b> pick <i>allowDrive</i> in the function menu, tap Run, and approve.</li>' +
        '<li><b>Deploy:</b> Deploy → New deployment → Web app. Execute as: Me. Who has access: Anyone. Copy the Web app URL.</li>' +
        '<li><b>Paste the URL here:</b><input class="fgb-url" inputmode="url" placeholder="https://script.google.com/macros/s/…/exec" value="' + esc(url()) + '"></li>' +
        '</ol>' + (msg ? '<p class="fgb-msg">' + esc(msg) + '</p>' : '') +
        '<button class="fgb-go fgb-test">Save and test</button><button class="fgb-cancel">Close</button>');
    }
    draw();
    s.el.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.classList.contains('fgb-copy')) {
        var t = scriptText();
        (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(function () { b.textContent = 'Copied'; })
          .catch(function () { window.prompt('Select all and copy:', t); });
      } else if (b.classList.contains('fgb-test')) {
        setUrl(s.el.querySelector('.fgb-url').value);
        if (!connected()) { draw('That link should start with https://script.google.com/'); return; }
        b.textContent = 'Testing…';
        ping().then(function (d) { draw('Works. Connected to ' + (d.who || 'your Google account') + '.'); if (onDone) onDone(); })
          .catch(function (err) { draw('Not working yet: ' + err.message + '. Check step 4: Execute as Me, access Anyone.'); });
      } else if (b.classList.contains('fgb-cancel')) { s.close(); if (onDone) onDone(); }
    });
  }

  return {
    editBillTo: editBillTo, setupDrive: setupDrive,
    connected: connected, url: url, setUrl: setUrl, key: key, scriptText: scriptText, ping: ping,
    yearOf: yearOf, folderName: folderName, ensureFolder: ensureFolder, savedFolder: savedFolder,
    billTo: billTo, saveBillTo: saveBillTo, mailto: mailto, emailInvoice: emailInvoice, openFolder: openFolder,
    sheet: sheet, esc: esc
  };
})();
