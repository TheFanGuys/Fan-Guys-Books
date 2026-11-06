
(function(){
'use strict';

/* ═══════════════════════════════════════════════════
   MINI STATE MANAGER
   render() diffs and re-renders only what changes
═══════════════════════════════════════════════════ */
var _state = {};
var _root  = document.getElementById('app');
var _view  = null; // current view function

function setState(patch) {
  Object.assign(_state, typeof patch === 'function' ? patch(_state) : patch);
  render();
}

function getState() { return _state; }

function setView(viewFn) {
  _view = viewFn;
  render();
}

function render() {
  if (!_view) return;
  var el = _view(_state);
  if (!el) return;
  _root.innerHTML = '';
  _root.appendChild(el);
}

/* ═══════════════════════════════════════════════════
   DOM HELPERS
═══════════════════════════════════════════════════ */
function el(tag, attrs, children) {
  var e = document.createElement(tag);
  if (attrs) {
    Object.keys(attrs).forEach(function(k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'className')      { e.className = v; }
      else if (k === 'style')     { Object.assign(e.style, v); }
      else if (k === 'onClick')   { e.addEventListener('click', v); }
      else if (k === 'onChange')  { e.addEventListener('input', v); }
      else if (k === 'onInput')   { e.addEventListener('input', v); }
      else if (k.startsWith('on')){ e.addEventListener(k.slice(2).toLowerCase(), v); }
      else if (k === 'htmlFor')   { e.htmlFor = v; }
      else if (k === 'value' && (tag==='input'||tag==='select'||tag==='textarea')) { e.value = v; }
      else if (k === 'checked')   { e.checked = v; }
      else if (k === 'src')       { e.src = v; }
      else if (k === 'alt')       { e.alt = v; }
      else if (k === 'type')      { e.type = v; }
      else if (k === 'placeholder'){ e.placeholder = v; }
      else if (k === 'accept')    { e.accept = v; }
      else if (k === 'capture')   { e.setAttribute('capture', v); }
      else if (k === 'autoFocus') { setTimeout(function(){e.focus();}, 80); }
      else if (k === 'href')      { e.href = v; }
      else if (k === 'download')  { e.download = v; }
      else                        { e.setAttribute(k, v); }
    });
  }
  if (children) {
    (Array.isArray(children) ? children : [children]).forEach(function(c) {
      if (c == null || c === false) return;
      if (typeof c === 'string' || typeof c === 'number') {
        e.appendChild(document.createTextNode(String(c)));
      } else if (c instanceof Node) {
        e.appendChild(c);
      }
    });
  }
  return e;
}

function div(attrs, children) { return el('div', attrs, children); }
function btn(attrs, children) { return el('button', attrs, children); }
function span(attrs, txt)     { return el('span', attrs, txt == null ? [] : [txt]); }
function inp(attrs)            { return el('input', attrs); }
function sel(attrs, options)  { return el('select', attrs, options); }
function img(attrs)           { return el('img', attrs); }
function txt(s)               { return document.createTextNode(String(s||'')); }

/* ═══════════════════════════════════════════════════
   CONSTANTS & HELPERS
═══════════════════════════════════════════════════ */
var CATS = ['Meals & Food','Fuel & Gas','Tools & Equipment','Lodging / Hotel',
  'Parts & Materials','Materials','Parking & Tolls','Vehicle / Rental',
  'Labor','Airfare','Shipping','Other'];
var PAY  = ['Cash','Credit Card','Debit Card','Check','Company Card'];
/* Wire colors: labor red, hotel blue, airfare white, rental black, fuel orange, material green */
var CAT_DOT = {
  'Meals & Food':'#7A4E2D','Fuel & Gas':'#D9782D','Tools & Equipment':'#8A9099',
  'Lodging / Hotel':'#2F5FB3','Parts & Materials':'#2E8B57','Materials':'#2E8B57',
  'Parking & Tolls':'#8A9099','Vehicle / Rental':'#15181C','Labor':'#C8322B',
  'Airfare':'#F7F7F2','Shipping':'#8A9099','Other':'#8A9099'
};
var CAT_SHORT = {'Meals & Food':'Meals','Fuel & Gas':'Fuel','Tools & Equipment':'Tools','Lodging / Hotel':'Hotel',
  'Parts & Materials':'Material','Materials':'Material','Parking & Tolls':'Parking','Vehicle / Rental':'Rental',
  'Labor':'Labor','Airfare':'Airfare','Shipping':'Shipping','Other':'Other'};
function wireTags(recs){
  var by={}, order=[];
  recs.forEach(function(r){ var k=CAT_SHORT[r.category]||'Other'; if(!(k in by)){by[k]={amt:0,color:CAT_DOT[r.category]||'#8A9099'};order.push(k);} by[k].amt+=(+r.amount||0); });
  order.sort(function(a,b){ return by[b].amt-by[a].amt; });
  var w=div({className:'wires'});
  order.forEach(function(k){
    var t=span({className:'wire'}); var bar=document.createElement('i'); bar.style.background=by[k].color;
    if(by[k].color==='#F7F7F2') bar.style.boxShadow='inset 0 0 0 1px #9aa0a6';
    t.appendChild(bar); t.appendChild(txt(k+' '+money(by[k].amt).replace(/\.00$/,''))); w.appendChild(t);
  });
  return w;
}

function uid()   { return Date.now().toString(36)+Math.random().toString(36).slice(2); }
function money(n){ return '$'+(+(n||0)).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g,','); }
function fmtD(s) { if(!s)return''; var p=s.split('-'); return p[1]+'/'+p[2]+'/'+p[0]; }
function today() { return new Date().toISOString().split('T')[0]; }

/* ═══════════════════════════════════════════════════
   LOCAL DB
═══════════════════════════════════════════════════ */
var DB = 'fg-v9';
function dbGet(){ try{ return JSON.parse(localStorage.getItem(DB)||'null')||{jobs:[],receipts:[]};} catch(e){ return{jobs:[],receipts:[]};} }
function dbSave(d){ try{ localStorage.setItem(DB,JSON.stringify(d)); return true; } catch(e){ return false; } }

/* ═══════════════════════════════════════════════════
   RECEIPT PHOTOS  →  IndexedDB (localStorage is far too small)
   IMG = in-memory cache for this session (receiptId -> dataURL)
═══════════════════════════════════════════════════ */
var IMG = {};
var _idb = null;
function idbOpen(){
  return new Promise(function(res){
    if(_idb) return res(_idb);
    try{
      var rq = indexedDB.open('fg-images', 1);
      rq.onupgradeneeded = function(){ rq.result.createObjectStore('imgs'); };
      rq.onsuccess = function(){ _idb = rq.result; res(_idb); };
      rq.onerror = function(){ res(null); };
    }catch(e){ res(null); }
  });
}
function idbPutImg(id, url){
  return idbOpen().then(function(db){ if(!db) return; return new Promise(function(res){
    try{ var tx=db.transaction('imgs','readwrite'); tx.objectStore('imgs').put(url,id); tx.oncomplete=res; tx.onerror=res; }catch(e){res();}
  });});
}
function idbDelImg(id){
  return idbOpen().then(function(db){ if(!db) return; return new Promise(function(res){
    try{ var tx=db.transaction('imgs','readwrite'); tx.objectStore('imgs').delete(id); tx.oncomplete=res; tx.onerror=res; }catch(e){res();}
  });});
}
function idbLoadAll(){
  return idbOpen().then(function(db){ if(!db) return {}; return new Promise(function(res){
    try{
      var out={}, st=db.transaction('imgs','readonly').objectStore('imgs'), cur=st.openCursor();
      cur.onsuccess=function(e){ var c=e.target.result; if(c){ out[c.key]=c.value; c.continue(); } else res(out); };
      cur.onerror=function(){ res(out); };
    }catch(e){ res({}); }
  });});
}
/* Ask iOS to keep this data instead of treating it as disposable cache. */
function requestPersistence(){
  try{
    if (navigator.storage && navigator.storage.persist){
      navigator.storage.persisted().then(function(already){
        if(!already) navigator.storage.persist();
      }).catch(function(){});
    }
  }catch(e){}
}

var LAST_BACKUP_KEY='fg-last-backup';
function markBackedUp(){
  try{ localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString()); }catch(e){}
  var b=document.getElementById('backup-nag'); if(b) b.style.display='none';
}
function daysSinceBackup(){
  var last=null; try{ last=localStorage.getItem(LAST_BACKUP_KEY); }catch(e){}
  if(!last) return 999;
  return Math.floor((Date.now()-new Date(last).getTime())/86400000);
}
function backupFilename(){
  var d=new Date(), p=function(n){return (n<10?'0':'')+n;};
  return 'FanGuys-Invoice-'+d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'.json';
}
function doFullBackup(){ return FGB.backup(); }
function _oldInvoiceBackup(){
  var db=dbGet();
  var content=JSON.stringify(Object.assign({app:'Invoice Pro',v:2,exportedAt:new Date().toISOString()}, db, {images:IMG}), null, 2);
  var name=backupFilename(), file=null;
  try{ file=new File([content],name,{type:'application/json'}); }catch(e){}
  if (file && navigator.canShare && navigator.canShare({files:[file]}) && navigator.share){
    navigator.share({files:[file]})
      .then(function(){ markBackedUp(); })
      .catch(function(err){ if(err && err.name==='AbortError') return; downloadBackup(content,name); });
    return;
  }
  downloadBackup(content,name);
}
function downloadBackup(content,name){
  try{
    var blob=new Blob([content],{type:'application/json'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a'); a.href=url; a.download=name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){URL.revokeObjectURL(url);},2000);
    markBackedUp();
  }catch(e){ alert('Could not create the backup file.'); }
}

// Load photos into RAM and migrate any old photos still sitting in localStorage.
function initImages(){
  return idbLoadAll().then(function(loaded){
    IMG = loaded || {};
    var db = dbGet(), moved=0;
    (db.receipts||[]).forEach(function(r){
      if(r.image && typeof r.image==='string' && r.image.indexOf('data:')===0){
        IMG[r.id]=r.image; idbPutImg(r.id, r.image); delete r.image; moved++;
      }
    });
    if(moved>0){ dbSave(db); }   // reclaims the full localStorage
    return moved;
  });
}

/* ═══════════════════════════════════════════════════
   RECEIPT SCAN
   Primary: Claude Vision API (works in Claude.ai artifacts
   and GitHub Pages — uses the anthropic-dangerous-direct-browser-calls header)
   Fallback: sets today's date, user fills vendor/amount manually
═══════════════════════════════════════════════════ */
/* ═══════════════════════════════════════════════════
   RECEIPT SCANNER — Apple Vision / Live Text
   Uses iOS built-in OCR (same as Live Text in Camera)
   No API key, no internet, works offline, instant.
   Falls back to pattern matching on extracted text.
═══════════════════════════════════════════════════ */

// Vendor keyword map — auto-detect category and clean up vendor name
var VENDOR_MAP = [
  // Gas stations
  {words:['shell','shells'],        vendor:'Shell',          cat:'Fuel & Gas'},
  {words:['chevron'],               vendor:'Chevron',        cat:'Fuel & Gas'},
  {words:['exxon'],                 vendor:'Exxon',          cat:'Fuel & Gas'},
  {words:['mobil'],                 vendor:'Mobil',          cat:'Fuel & Gas'},
  {words:['bp ','b.p.','british petroleum'], vendor:'BP',   cat:'Fuel & Gas'},
  {words:['circle k'],              vendor:'Circle K',       cat:'Fuel & Gas'},
  {words:['speedway'],              vendor:'Speedway',       cat:'Fuel & Gas'},
  {words:['pilot','flying j'],      vendor:'Pilot/Flying J', cat:'Fuel & Gas'},
  {words:['loves ','loves'],      vendor:"Love's",         cat:'Fuel & Gas'},
  {words:['kwik trip','kwik star'], vendor:'Kwik Trip',      cat:'Fuel & Gas'},
  {words:['caseys','caseys'],     vendor:"Casey's",        cat:'Fuel & Gas'},
  {words:['quiktrip','quick trip'], vendor:'QuikTrip',       cat:'Fuel & Gas'},
  {words:['valero'],                vendor:'Valero',         cat:'Fuel & Gas'},
  {words:['marathon'],              vendor:'Marathon',       cat:'Fuel & Gas'},
  {words:['sunoco'],                vendor:'Sunoco',         cat:'Fuel & Gas'},
  {words:['gulf '],                 vendor:'Gulf',           cat:'Fuel & Gas'},
  // Hardware / electrical supply
  {words:['home depot','the home depot'], vendor:'Home Depot', cat:'Tools & Equipment'},
  {words:['lowes','lowes'],       vendor:"Lowe's",         cat:'Tools & Equipment'},
  {words:['menards'],               vendor:'Menards',        cat:'Tools & Equipment'},
  {words:['ace hardware'],          vendor:'Ace Hardware',   cat:'Tools & Equipment'},
  {words:['true value'],            vendor:'True Value',     cat:'Tools & Equipment'},
  {words:['fastenal'],              vendor:'Fastenal',       cat:'Parts & Materials'},
  {words:['grainger'],              vendor:'Grainger',       cat:'Parts & Materials'},
  {words:['rexel'],                 vendor:'Rexel',          cat:'Parts & Materials'},
  {words:['wesco'],                 vendor:'Wesco',          cat:'Parts & Materials'},
  {words:['graybar'],               vendor:'Graybar',        cat:'Parts & Materials'},
  {words:['anixter'],               vendor:'Anixter',        cat:'Parts & Materials'},
  {words:['nesco'],                 vendor:'NESCO',          cat:'Parts & Materials'},
  {words:['city electric'],         vendor:'City Electric',  cat:'Parts & Materials'},
  {words:['amazon'],                vendor:'Amazon',         cat:'Parts & Materials'},
  // Meals
  {words:['mcdonald'],              vendor:"McDonald's",     cat:'Meals & Food'},
  {words:['subway'],                vendor:'Subway',         cat:'Meals & Food'},
  {words:['wendys','wendys'],     vendor:"Wendy's",        cat:'Meals & Food'},
  {words:['burger king'],           vendor:'Burger King',    cat:'Meals & Food'},
  {words:['taco bell'],             vendor:'Taco Bell',      cat:'Meals & Food'},
  {words:['chick-fil-a','chick fil a'], vendor:'Chick-fil-A', cat:'Meals & Food'},
  {words:['chipotle'],              vendor:'Chipotle',       cat:'Meals & Food'},
  {words:['dominos','dominos'],   vendor:"Domino's",       cat:'Meals & Food'},
  {words:['pizza hut'],             vendor:'Pizza Hut',      cat:'Meals & Food'},
  {words:['starbucks'],             vendor:'Starbucks',      cat:'Meals & Food'},
  {words:['dunkin'],                vendor:'Dunkin',         cat:'Meals & Food'},
  {words:['chilis','chilis'],     vendor:"Chili's",        cat:'Meals & Food'},
  {words:['applebee'],              vendor:"Applebee's",     cat:'Meals & Food'},
  {words:['dennys','dennys'],     vendor:"Denny's",        cat:'Meals & Food'},
  {words:['ihop'],                  vendor:'IHOP',           cat:'Meals & Food'},
  {words:['cracker barrel'],        vendor:'Cracker Barrel', cat:'Meals & Food'},
  {words:['waffle house'],          vendor:'Waffle House',   cat:'Meals & Food'},
  {words:['popeyes','popeyes'],   vendor:"Popeye's",       cat:'Meals & Food'},
  {words:['sonic drive'],           vendor:'Sonic',          cat:'Meals & Food'},
  {words:['panera'],                vendor:'Panera Bread',   cat:'Meals & Food'},
  {words:['olive garden'],          vendor:'Olive Garden',   cat:'Meals & Food'},
  {words:['texas roadhouse'],       vendor:'Texas Roadhouse',cat:'Meals & Food'},
  // Lodging
  {words:['marriott'],              vendor:'Marriott',       cat:'Lodging / Hotel'},
  {words:['hilton'],                vendor:'Hilton',         cat:'Lodging / Hotel'},
  {words:['hampton inn'],           vendor:'Hampton Inn',    cat:'Lodging / Hotel'},
  {words:['holiday inn'],           vendor:'Holiday Inn',    cat:'Lodging / Hotel'},
  {words:['best western'],          vendor:'Best Western',   cat:'Lodging / Hotel'},
  {words:['motel 6','motel6'],      vendor:'Motel 6',        cat:'Lodging / Hotel'},
  {words:['days inn'],              vendor:'Days Inn',       cat:'Lodging / Hotel'},
  {words:['super 8'],               vendor:'Super 8',        cat:'Lodging / Hotel'},
  {words:['comfort inn'],           vendor:'Comfort Inn',    cat:'Lodging / Hotel'},
  {words:['la quinta'],             vendor:'La Quinta',      cat:'Lodging / Hotel'},
  {words:['hyatt'],                 vendor:'Hyatt',          cat:'Lodging / Hotel'},
  {words:['courtyard'],             vendor:'Courtyard',      cat:'Lodging / Hotel'},
  {words:['residence inn'],         vendor:'Residence Inn',  cat:'Lodging / Hotel'},
  {words:['home2 suites','home 2 suites','home2mkt','home2'], vendor:'Home2 Suites by Hilton', cat:'Lodging / Hotel'},
  {words:['homewood suites'],       vendor:'Homewood Suites',cat:'Lodging / Hotel'},
  {words:['staybridge'],            vendor:'Staybridge Suites', cat:'Lodging / Hotel'},
  {words:['candlewood'],            vendor:'Candlewood Suites', cat:'Lodging / Hotel'},
  {words:['extended stay'],         vendor:'Extended Stay',  cat:'Lodging / Hotel'},
  // Rental / transport
  {words:['enterprise rent'],       vendor:'Enterprise',     cat:'Vehicle / Rental'},
  {words:['hertz'],                 vendor:'Hertz',          cat:'Vehicle / Rental'},
  {words:['avis'],                  vendor:'Avis',           cat:'Vehicle / Rental'},
  {words:['budget rent','budget car'], vendor:'Budget',      cat:'Vehicle / Rental'},
  {words:['national car'],          vendor:'National Car Rental', cat:'Vehicle / Rental'},
  {words:['united airlines','united air'], vendor:'United Airlines', cat:'Airfare'},
  {words:['american airlines'],     vendor:'American Airlines', cat:'Airfare'},
  {words:['delta air'],             vendor:'Delta Airlines', cat:'Airfare'},
  {words:['southwest airlines'],    vendor:'Southwest Airlines', cat:'Airfare'},
  // Parking
  {words:['parking'],               vendor:'Parking',        cat:'Parking & Tolls'},
  {words:['tollway','toll road','e-zpass','ez pass'], vendor:'Toll', cat:'Parking & Tolls'},
  // General
  {words:['walmart','wal-mart'],    vendor:'Walmart',        cat:'Other'},
  {words:['target'],                vendor:'Target',         cat:'Other'},
  {words:['costco'],                vendor:'Costco',         cat:'Other'},
  {words:['uhaul','u-haul'],        vendor:'U-Haul',         cat:'Vehicle / Rental'},
];

function matchVendor(text) {
  var lower = text.toLowerCase();
  for (var i=0; i<VENDOR_MAP.length; i++) {
    var entry = VENDOR_MAP[i];
    for (var j=0; j<entry.words.length; j++) {
      if (lower.indexOf(entry.words[j]) > -1) {
        return { vendor: entry.vendor, cat: entry.cat };
      }
    }
  }
  return null;
}

function parseReceiptText(lines) {
  var result = { vendor:'', amount:0, date:'', category:'' };
  var allText = lines.join(' ');

  // ── VENDOR
  var km = matchVendor(allText);
  if (km) {
    result.vendor = km.vendor;
    result.category = km.cat;
  } else {
    for (var vi=0; vi<Math.min(lines.length,8); vi++) {
      var vl = lines[vi].trim();
      if (vl.length > 2 && /[a-zA-Z]{2}/.test(vl) && !/^(name|address|date|room|page|ref)/i.test(vl)) {
        result.vendor = vl.replace(/[^a-zA-Z0-9 '&.-]/g,'').trim().slice(0,40);
        break;
      }
    }
  }

  // ── AMOUNT: handles regular receipts AND hotel folios (payment shown in parentheses)
  var totalAmount = 0, largestPos = 0, largestCredit = 0;
  for (var ai=0; ai<lines.length; ai++) {
    var al = lines[ai];
    // Positive dollar amounts
    var posM = al.match(/[^(]\$?(\d{1,5}\.\d{2})/g);
    if (posM) {
      posM.forEach(function(a) {
        var v = parseFloat(a.replace(/[$,]/g,''));
        if (!isNaN(v) && v > 1) {
          if (v > largestPos) largestPos = v;
          if (/(rate|charged|total charge|total amount|total due|total paid|folio total)/i.test(al) && v > totalAmount) {
            totalAmount = v;
          }
        }
      });
    }
    // Credit amounts in parens: ($872.57) — hotel payment to card
    var credM = al.match(/\(\$?([\d,]+\.\d{2})\)/g);
    if (credM) {
      credM.forEach(function(a) {
        var v = parseFloat(a.replace(/[()$,]/g,''));
        if (!isNaN(v) && v > largestCredit) largestCredit = v;
      });
    }
  }
  result.amount = totalAmount > 0 ? totalAmount : (largestCredit > largestPos ? largestCredit : largestPos);

  // ── DATE: MM/DD/YY, MM/DD/YYYY, YYYY-MM-DD, Month DD YYYY
  var mos = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
  for (var di=0; di<lines.length; di++) {
    var dl = lines[di], dm;
    dm = dl.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
    if (dm) { result.date = dm[3]+'-'+dm[1].padStart(2,'0')+'-'+dm[2].padStart(2,'0'); break; }
    dm = dl.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2})(?!\d)/);
    if (dm) { var yr=parseInt(dm[3]); result.date=(yr<=50?'20':'19')+(yr<10?'0'+yr:''+yr)+'-'+dm[1].padStart(2,'0')+'-'+dm[2].padStart(2,'0'); break; }
    dm = dl.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (dm) { result.date = dm[1]+'-'+dm[2].padStart(2,'0')+'-'+dm[3].padStart(2,'0'); break; }
    dm = dl.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{4})/i);
    if (dm) { result.date = dm[3]+'-'+(mos[dm[1].slice(0,3).toLowerCase()]||'01')+'-'+dm[2].padStart(2,'0'); break; }
  }

  return result;
}

/* Google retires models every so often (gemini-1.5 already died on us).
   So: try a list, remember what worked, and if they ALL fail, say so plainly
   instead of failing silently. Scanning is a convenience — never a blocker. */
var GEMINI_MODELS = ['gemini-2.5-flash','gemini-flash-latest','gemini-2.0-flash','gemini-1.5-flash'];
function geminiModelOrder(){
  var good=null; try{ good=localStorage.getItem('fg-gemini-model'); }catch(e){}
  if(good && GEMINI_MODELS.indexOf(good)>0){
    return [good].concat(GEMINI_MODELS.filter(function(m){return m!==good;}));
  }
  return GEMINI_MODELS.slice();
}

function scanReceipt(b64url) {
  var KEY = localStorage.getItem('fg-gemini-key')||'';
  var base64 = b64url.replace(/^data:image\/\w+;base64,/,'');
  var blank = { vendor:'', amount:0, date:today(), category:'' };

  if (!KEY) return Promise.resolve(blank);

  var body = JSON.stringify({
    contents:[{parts:[
      {inline_data:{mime_type:'image/jpeg', data:base64}},
      {text:'Read this receipt image and type out every line of text you can see, exactly as printed on the receipt. Include the store name, every item, prices, subtotal, tax, and total. Output ONLY the text lines, one per line, nothing else. Do not summarize or explain.'}
    ]}],
    generationConfig:{maxOutputTokens:800, temperature:0}
  });

  var models = geminiModelOrder();
  var lastStatus = 0;

  function tryModel(i){
    if (i >= models.length){
      // Every model failed. Tell him once, plainly, so he knows it's not his fault.
      if (lastStatus === 400 || lastStatus === 403){
        alert('Receipt scanning is not working.\n\nYour Gemini API key looks invalid or expired.\nSettings \u2192 Gemini API Key to update it.\n\nYou can still add this receipt by hand.');
      } else if (lastStatus === 404){
        alert('Receipt scanning is not working.\n\nGoogle appears to have retired these AI models. Nothing is wrong with your data or your app.\n\nYou can still add receipts by hand.');
      } else if (lastStatus === 429){
        alert('Receipt scanning hit Google\u2019s free-tier limit for now.\n\nTry again later, or add this receipt by hand.');
      }
      return Promise.resolve(blank);
    }
    return fetch('https://generativelanguage.googleapis.com/v1beta/models/'+models[i]+':generateContent?key='+KEY, {
      method:'POST', headers:{'Content-Type':'application/json'}, body: body
    })
    .then(function(r){
      if(!r.ok){ lastStatus = r.status; throw new Error('HTTP '+r.status); }
      return r.json();
    })
    .then(function(d){
      var raw = ((d.candidates&&d.candidates[0]&&d.candidates[0].content&&
        d.candidates[0].content.parts&&d.candidates[0].content.parts[0]&&
        d.candidates[0].content.parts[0].text)||'');
      if (!raw.trim()) return blank;
      try{ localStorage.setItem('fg-gemini-model', models[i]); }catch(e){}   // remember the winner
      var lines = raw.split(/\r?\n/).map(function(l){ return l.trim(); }).filter(Boolean);
      return parseReceiptText(lines);
    })
    .catch(function(err){
      console.log('Scan failed on '+models[i]+':', err.message);
      return tryModel(i+1);          // next model
    });
  }
  return tryModel(0);
}

function showCropTool(dataUrl, onCrop, onSkip) {
  var overlay = div({className:'crop-overlay'});

  // Header
  var header = div({className:'crop-header'});
  var skipBtn = btn({});  skipBtn.textContent = 'Skip';
  var titleSpan = document.createElement('span'); titleSpan.textContent = 'Crop Receipt';
  var useBtn = btn({});   useBtn.textContent = 'Use';
  useBtn.style.fontWeight = '600';
  header.appendChild(skipBtn);
  header.appendChild(titleSpan);
  header.appendChild(useBtn);
  overlay.appendChild(header);

  // Canvas area
  var wrap = div({className:'crop-canvas-wrap'});
  var canvas = document.createElement('canvas');
  canvas.style.cssText = 'max-width:100%;max-height:100%;display:block;touch-action:none';
  wrap.appendChild(canvas);

  var hint = div({className:'crop-hint'});
  hint.textContent = 'Drag corners to crop';
  wrap.appendChild(hint);
  overlay.appendChild(wrap);
  document.body.appendChild(overlay);

  var img2 = new Image();
  img2.onload = function() {
    // Size canvas to fit screen
    var maxW = window.innerWidth;
    var maxH = window.innerHeight - 52 - 60;
    var scale = Math.min(maxW / img2.width, maxH / img2.height, 1);
    var cw = Math.round(img2.width * scale);
    var ch = Math.round(img2.height * scale);
    canvas.width  = cw;
    canvas.height = ch;
    var ctx = canvas.getContext('2d');

    // Crop rect (in canvas px) — start at 10% inset
    var pad = Math.min(cw, ch) * 0.08;
    var crop = { x: pad, y: pad, w: cw - pad*2, h: ch - pad*2 };

    function drawAll() {
      ctx.clearRect(0, 0, cw, ch);
      ctx.drawImage(img2, 0, 0, cw, ch);
      // Darken outside crop
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, cw, crop.y);                             // top
      ctx.fillRect(0, crop.y+crop.h, cw, ch-crop.y-crop.h);      // bottom
      ctx.fillRect(0, crop.y, crop.x, crop.h);                   // left
      ctx.fillRect(crop.x+crop.w, crop.y, cw-crop.x-crop.w, crop.h); // right
      // Border
      ctx.strokeStyle = '#00AEEF';
      ctx.lineWidth = 2;
      ctx.strokeRect(crop.x, crop.y, crop.w, crop.h);
      // Corner handles
      var hs = 10;
      ctx.fillStyle = '#00AEEF';
      [[crop.x,crop.y],[crop.x+crop.w,crop.y],[crop.x,crop.y+crop.h],[crop.x+crop.w,crop.y+crop.h]].forEach(function(pt){
        ctx.fillRect(pt[0]-hs/2, pt[1]-hs/2, hs, hs);
      });
      // Grid lines (rule of thirds)
      ctx.strokeStyle = 'rgba(255,255,255,.2)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(crop.x+crop.w/3, crop.y); ctx.lineTo(crop.x+crop.w/3, crop.y+crop.h);
      ctx.moveTo(crop.x+crop.w*2/3, crop.y); ctx.lineTo(crop.x+crop.w*2/3, crop.y+crop.h);
      ctx.moveTo(crop.x, crop.y+crop.h/3); ctx.lineTo(crop.x+crop.w, crop.y+crop.h/3);
      ctx.moveTo(crop.x, crop.y+crop.h*2/3); ctx.lineTo(crop.x+crop.w, crop.y+crop.h*2/3);
      ctx.stroke();
    }
    drawAll();

    // Touch/mouse drag handling
    var dragging = null; // 'tl','tr','bl','br','move'
    var dragStart = null;
    var cropStart = null;
    var THRESH = 28;

    function getPos(e) {
      var r = canvas.getBoundingClientRect();
      var touch = e.touches ? e.touches[0] : e;
      return { x: touch.clientX - r.left, y: touch.clientY - r.top };
    }

    function whichHandle(pos) {
      var corners = {
        tl:{x:crop.x, y:crop.y},
        tr:{x:crop.x+crop.w, y:crop.y},
        bl:{x:crop.x, y:crop.y+crop.h},
        br:{x:crop.x+crop.w, y:crop.y+crop.h}
      };
      var closest = null, minD = THRESH;
      Object.keys(corners).forEach(function(k){
        var dx=pos.x-corners[k].x, dy=pos.y-corners[k].y;
        var d=Math.sqrt(dx*dx+dy*dy);
        if(d<minD){minD=d;closest=k;}
      });
      return closest;
    }

    function onDown(e) {
      e.preventDefault();
      var pos = getPos(e);
      var h = whichHandle(pos);
      if (h) {
        dragging = h;
      } else if (pos.x>crop.x&&pos.x<crop.x+crop.w&&pos.y>crop.y&&pos.y<crop.y+crop.h) {
        dragging = 'move';
      }
      dragStart  = pos;
      cropStart  = {x:crop.x,y:crop.y,w:crop.w,h:crop.h};
    }

    function onMove(e) {
      if (!dragging) return;
      e.preventDefault();
      var pos = getPos(e);
      var dx = pos.x - dragStart.x;
      var dy = pos.y - dragStart.y;
      var MIN = 40;
      if (dragging === 'move') {
        crop.x = Math.max(0, Math.min(cw-crop.w, cropStart.x+dx));
        crop.y = Math.max(0, Math.min(ch-crop.h, cropStart.y+dy));
      } else if (dragging === 'tl') {
        var nx=Math.max(0,Math.min(cropStart.x+crop.w-MIN,cropStart.x+dx));
        var ny=Math.max(0,Math.min(cropStart.y+crop.h-MIN,cropStart.y+dy));
        crop.w+=crop.x-nx; crop.h+=crop.y-ny; crop.x=nx; crop.y=ny;
      } else if (dragging === 'tr') {
        crop.y=Math.max(0,Math.min(cropStart.y+crop.h-MIN,cropStart.y+dy));
        crop.h=cropStart.h-(crop.y-cropStart.y);
        crop.w=Math.max(MIN,Math.min(cw-crop.x,cropStart.w+dx));
      } else if (dragging === 'bl') {
        crop.x=Math.max(0,Math.min(cropStart.x+crop.w-MIN,cropStart.x+dx));
        crop.w+=cropStart.x-crop.x;
        crop.h=Math.max(MIN,Math.min(ch-crop.y,cropStart.h+dy));
      } else if (dragging === 'br') {
        crop.w=Math.max(MIN,Math.min(cw-crop.x,cropStart.w+dx));
        crop.h=Math.max(MIN,Math.min(ch-crop.y,cropStart.h+dy));
      }
      drawAll();
    }

    function onUp() { dragging = null; }

    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseup', onUp);
    canvas.addEventListener('touchstart', onDown, {passive:false});
    canvas.addEventListener('touchmove', onMove, {passive:false});
    canvas.addEventListener('touchend', onUp);

    // Auto-crop button action
    useBtn.addEventListener('click', function() {
      // Extract cropped region at original resolution
      var scaleX = img2.width  / cw;
      var scaleY = img2.height / ch;
      var out = document.createElement('canvas');
      out.width  = Math.round(crop.w * scaleX);
      out.height = Math.round(crop.h * scaleY);
      out.getContext('2d').drawImage(img2,
        crop.x*scaleX, crop.y*scaleY, crop.w*scaleX, crop.h*scaleY,
        0, 0, out.width, out.height);
      overlay.remove();
      onCrop(out.toDataURL('image/jpeg', 0.88));
    });

    skipBtn.addEventListener('click', function() {
      overlay.remove();
      onSkip(dataUrl);
    });
  };
  img2.src = dataUrl;
}

/* ═══════════════════════════════════════════════════
   IMAGE PREP (resize + crop white borders)
═══════════════════════════════════════════════════ */
function prepImage(dataUrl) {
  return new Promise(function(resolve){
    var img2=new Image();
    img2.onload=function(){
      var MAX=1100, sc=Math.min(1,MAX/Math.max(img2.width,img2.height));
      var W=Math.round(img2.width*sc), H=Math.round(img2.height*sc);
      var c=document.createElement('canvas'); c.width=W; c.height=H;
      var ctx=c.getContext('2d'); ctx.drawImage(img2,0,0,W,H);
      var px=ctx.getImageData(0,0,W,H).data;
      var x0=W,y0=H,x1=0,y1=0,found=false;
      for(var y=0;y<H;y++) for(var x=0;x<W;x++){
        var i=(y*W+x)*4;
        if(!(px[i]>230&&px[i+1]>230&&px[i+2]>230)){
          if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; found=true;
        }
      }
      if(!found||(x1-x0)<40||(y1-y0)<40){resolve(c.toDataURL('image/jpeg',.82));return;}
      var p=12; x0=Math.max(0,x0-p); y0=Math.max(0,y0-p); x1=Math.min(W,x1+p); y1=Math.min(H,y1+p);
      var o=document.createElement('canvas'); o.width=x1-x0; o.height=y1-y0;
      o.getContext('2d').drawImage(c,x0,y0,x1-x0,y1-y0,0,0,x1-x0,y1-y0);
      resolve(o.toDataURL('image/jpeg',.82));
    };
    img2.onerror=function(){resolve(dataUrl);};
    img2.src=dataUrl;
  });
}

/* ═══════════════════════════════════════════════════
   PDF EXPORT (jsPDF inlined via CDN script tag in head)
═══════════════════════════════════════════════════ */
function buildPDF(job, receipts, opts) {
  var jsPDF = window.jspdf && window.jspdf.jsPDF;
  if (!jsPDF) { return Promise.reject(new Error('PDF library failed to load.')); }
  return new Promise(function(resolve, reject) {
    try {
      var doc = new jsPDF({unit:'mm', format:'letter'});
      var PW=215.9, PH=279.4, M=15, y=M;
      var tot = receipts.reduce(function(s,r){return s+r.amount;},0);
      var rim = receipts.filter(function(r){return r.reimbursable;}).reduce(function(s,r){return s+r.amount;},0);
      var sorted = receipts.slice().sort(function(a,b){return b.date.localeCompare(a.date);});

      // ── helper: draw a horizontal line
      function hline(yy, lm, rr, thick) {
        doc.setDrawColor(180,185,192);
        doc.setLineWidth(thick||0.25);
        doc.line(lm||M, yy, rr||(PW-M), yy);
      }
      // ── helper: bordered cell text
      function cell(txt, x, yy, w, h, opts) {
        var align = (opts&&opts.align)||'left';
        var bold  = (opts&&opts.bold);
        var bg    = (opts&&opts.bg);
        var color = (opts&&opts.color)||[45,50,58];
        if (bg) { doc.setFillColor(bg[0],bg[1],bg[2]); doc.rect(x,yy,w,h,'F'); }
        doc.setTextColor(color[0],color[1],color[2]);
        doc.setFont('helvetica', bold?'bold':'normal');
        var tx = align==='right' ? x+w-1.5 : align==='center' ? x+w/2 : x+1.5;
        doc.text(String(txt||''), tx, yy+h*0.65, {align:align});
      }

      // ════ PAGE 1 — Report Summary ════

      // ── Header — logo + report info (light, print/ink friendly) ──
      var logoW=40, logoH=logoW*383/560;
      try { doc.addImage('data:image/jpeg;base64,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AREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREB//Z', 'JPEG', M, 6, logoW, logoH); } catch(e) {}
      doc.setTextColor(0,140,200); doc.setFontSize(8); doc.setFont('helvetica','bold');
      doc.text('FIELD RECEIPT REPORT', PW-M, 12, {align:'right'});
      doc.setTextColor(20,22,26); doc.setFontSize(13); doc.setFont('helvetica','bold');
      doc.text(job.name, PW-M, 19, {align:'right'});
      doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(110,115,122);
      var dr = '';
      if (job.startDate) dr = fmtD(job.startDate)+(job.endDate?' - '+fmtD(job.endDate):'');
      if (job.location && dr) dr = job.location+'  |  '+dr;
      else if (job.location) dr = job.location;
      if (dr) doc.text(dr, PW-M, 24, {align:'right'});
      doc.text('Generated: '+fmtD(today()), PW-M, 28, {align:'right'});
      doc.setDrawColor(31,95,191); doc.setLineWidth(0.6); doc.line(M, 36, PW-M, 36);
      y = 42;

      // Report title + summary block
      doc.setFontSize(11); doc.setFont('helvetica','bold'); doc.setTextColor(20,22,26);
      doc.text(job.name, M, y); y+=5;
      doc.setFontSize(8); doc.setFont('helvetica','normal'); doc.setTextColor(80,85,92);
      if (dr) { doc.text('From: '+fmtD(job.startDate||'')+'  To: '+fmtD(job.endDate||job.startDate||''), M, y); y+=4; }
      doc.text('Total receipts: '+receipts.length, M, y); y+=4;
      doc.setFont('helvetica','bold'); doc.setTextColor(20,22,26);
      doc.text('Grand Total: '+money(tot), M, y); y+=4;
      doc.text('Grand Total (Reimbursable): '+money(rim), M, y); y+=8;

      // ── Receipt table ──
      var cols = [
        {label:'Date',         x:M,     w:28,  align:'center'},
        {label:'Name',         x:M+28,  w:42,  align:'center'},
        {label:'Price',        x:M+70,  w:24,  align:'center'},
        {label:'Currency',     x:M+94,  w:20,  align:'center'},
        {label:'Category',     x:M+114, w:38,  align:'center'},
        {label:'Reimbursable', x:M+152, w:22,  align:'center'},
        {label:'Reimb. Amt',   x:M+174, w:18,  align:'center'},
      ];
      var rowH = 8;

      // Table header row
      doc.setFontSize(7.5);
      cols.forEach(function(c) {
        cell(c.label, c.x, y, c.w, rowH, {
          bg:[30,30,30], color:[0,174,239], bold:true, align:'center'
        });
        doc.setDrawColor(60,60,60); doc.setLineWidth(0.3);
        doc.rect(c.x, y, c.w, rowH);
      });
      y += rowH;

      // Data rows
      doc.setFontSize(7);
      sorted.forEach(function(r, i) {
        if (y + rowH > PH-M) { doc.addPage(); y=M; }
        var rowBg = i%2===0 ? [255,255,255] : [245,247,250];
        var isReimb = r.reimbursable ? 'Yes' : 'No';
        var reimbAmt = r.reimbursable ? money(r.amount) : '';
        var rowData = [
          fmtD(r.date)||'',
          (r.vendor||'').slice(0,22),
          r.amount.toFixed(2),
          'USD',
          (r.category||'').slice(0,18),
          isReimb,
          reimbAmt
        ];
        cols.forEach(function(c, ci) {
          cell(rowData[ci], c.x, y, c.w, rowH, {
            bg: rowBg, align:'center'
          });
          doc.setDrawColor(200,205,210); doc.setLineWidth(0.2);
          doc.rect(c.x, y, c.w, rowH);
        });
        y += rowH;
      });

      // Total row
      if (y + rowH > PH-M) { doc.addPage(); y=M; }
      var totBg = [20,20,20];
      cell('', M, y, cols[0].w+cols[1].w+cols[2].w, rowH, {bg:totBg});
      cell(money(tot), M+cols[0].w+cols[1].w, y, cols[2].w+cols[3].w, rowH, {
        bg:totBg, color:[0,174,239], bold:true, align:'center'
      });
      cell('', M+cols[0].w+cols[1].w+cols[2].w+cols[3].w, y, cols[4].w+cols[5].w, rowH, {bg:totBg});
      cell(money(rim), M+cols[0].w+cols[1].w+cols[2].w+cols[3].w+cols[4].w+cols[5].w, y, cols[6].w, rowH, {
        bg:totBg, color:[0,174,239], bold:true, align:'center'
      });
      doc.setDrawColor(60,60,60); doc.setLineWidth(0.3);
      doc.rect(M, y, PW-M*2, rowH);
      y += rowH + 10;

      // Footer line on page 1
      doc.setFontSize(7); doc.setFont('helvetica','italic'); doc.setTextColor(160,165,170);
      doc.text('This report is generated by Invoice Pro', PW/2, PH-10, {align:'center'});

      // ════ PHOTOS — 4 per page in a 2×2 grid ════
      var imgs = sorted.filter(function(r){return IMG[r.id];});
      if (imgs.length) {
        doc.addPage();
        // Photo page header
        doc.setFillColor(10,10,10); doc.rect(0,0,PW,16,'F');
        doc.setTextColor(0,174,239); doc.setFontSize(11); doc.setFont('helvetica','bold');
        doc.text('Receipt Photos — '+job.name, M, 11);

        var imgW = (PW - M*2 - 8) / 2;  // 2 columns with gap
        var imgH = 75;                    // height of each photo cell
        var lblH = 10;                    // label height below photo
        var cellH = imgH + lblH + 4;
        var gapX = 8, gapY = 6;
        var startY = 22;
        var px = [M, M + imgW + gapX];   // x positions for col 0 and col 1

        imgs.forEach(function(r, idx) {
          var col = idx % 2;
          var row = Math.floor(idx / 2) % 2;
          // New page every 4 images
          if (idx > 0 && idx % 4 === 0) {
            doc.addPage();
            doc.setFillColor(10,10,10); doc.rect(0,0,PW,16,'F');
            doc.setTextColor(0,174,239); doc.setFontSize(11); doc.setFont('helvetica','bold');
            doc.text('Receipt Photos (continued)', M, 11);
          }
          var cx2 = px[col];
          var cy = startY + (Math.floor((idx%4)/2)) * (cellH + gapY);

          // Photo box border
          doc.setDrawColor(200,205,210); doc.setLineWidth(0.3);
          doc.rect(cx2, cy, imgW, imgH);

          // Image
          try {
            doc.addImage(IMG[r.id], 'JPEG', cx2, cy, imgW, imgH, '', 'FAST');
          } catch(e) {
            doc.setFillColor(240,242,245); doc.rect(cx2, cy, imgW, imgH, 'F');
            doc.setFontSize(7); doc.setTextColor(160,165,170);
            doc.text('Photo unavailable', cx2+imgW/2, cy+imgH/2, {align:'center'});
          }

          // Label below photo
          doc.setFillColor(245,247,250); doc.rect(cx2, cy+imgH, imgW, lblH, 'F');
          doc.setDrawColor(200,205,210); doc.rect(cx2, cy+imgH, imgW, lblH);
          doc.setFontSize(6.5); doc.setFont('helvetica','bold'); doc.setTextColor(40,45,52);
          var lbl = (r.vendor||'').slice(0,24);
          doc.text(lbl, cx2+imgW/2, cy+imgH+4, {align:'center'});
          doc.setFont('helvetica','normal'); doc.setTextColor(100,105,112);
          doc.text(fmtD(r.date)+'  '+money(r.amount), cx2+imgW/2, cy+imgH+8, {align:'center'});
        });

        // Footer on last page
        doc.setFontSize(7); doc.setFont('helvetica','italic'); doc.setTextColor(160,165,170);
        doc.text('Fan Guys', PW/2, PH-10, {align:'center'});
      }

      if (opts && opts.blob) { resolve(doc.output('blob')); return; }
      doc.save('FanGuys-'+(job.name||'job').replace(/[^a-zA-Z0-9-]/g,'-')+'-'+today()+'.pdf');
      resolve();
    } catch(e){ reject(e); }
  });
}

/* ═══════════════════════════════════════════════════
   SVG ICONS
═══════════════════════════════════════════════════ */
function svgIcon(d, size, color, extra) {
  var s = document.createElementNS('http://www.w3.org/2000/svg','svg');
  s.setAttribute('width',size); s.setAttribute('height',size);
  s.setAttribute('viewBox','0 0 24 24');
  s.setAttribute('fill','none');
  s.setAttribute('stroke',color||'currentColor');
  s.setAttribute('stroke-linecap','round');
  s.setAttribute('stroke-linejoin','round');
  if (Array.isArray(d)) {
    d.forEach(function(item){ s.appendChild(item); });
  } else {
    var p = document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('d',d);
    p.setAttribute('stroke-width', extra||'2');
    s.appendChild(p);
  }
  return s;
}
function mkPath(d,sw){ var p=document.createElementNS('http://www.w3.org/2000/svg','path'); p.setAttribute('d',d); p.setAttribute('stroke-width',sw||'2'); p.setAttribute('stroke-linecap','round'); p.setAttribute('stroke-linejoin','round'); return p; }
function mkCircle(cx,cy,r,sw){ var c=document.createElementNS('http://www.w3.org/2000/svg','circle'); c.setAttribute('cx',cx); c.setAttribute('cy',cy); c.setAttribute('r',r); c.setAttribute('stroke-width',sw||'2'); c.setAttribute('fill','none'); return c; }

var IC = {
  back:   function(s,c){ return svgIcon('M15 19l-7-7 7-7',s,c,'2.2'); },
  plus:   function(s,c){ return svgIcon('M12 5v14M5 12h14',s,c,'2.2'); },
  trash:  function(s,c){ return svgIcon('M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16',s,c,'1.8'); },
  check:  function(s,c){ return svgIcon('M5 13l4 4L19 7',s,c,'2.3'); },
  xmark:  function(s,c){ return svgIcon('M6 18L18 6M6 6l12 12',s,c,'2'); },
  doc:    function(s,c){ return svgIcon('M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8',s,c,'1.8'); },
  dl:     function(s,c){ return svgIcon('M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4',s,c,'1.8'); },
  share:  function(s,c){ return svgIcon('M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13',s,c,'1.8'); },
  menu:   function(s,c){ return svgIcon('M4 6h16M4 12h16M4 18h16',s,c,'2'); },
  search: function(s,c){ return svgIcon([mkCircle(11,11,7,'1.8'),mkPath('M21 21l-4.35-4.35','1.8')],s,c); },
  cam:    function(s,c){ return svgIcon([mkPath('M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z','1.8'),mkCircle(12,13,4,'1.8')],s,c); },
};

/* ═══════════════════════════════════════════════════
   FAN LOGO SVG
═══════════════════════════════════════════════════ */
function makeFan(size, rpm) {
  size = size||52; rpm = rpm||7;
  var dur = (60/rpm).toFixed(1)+'s';
  var ns = 'http://www.w3.org/2000/svg';
  var s = document.createElementNS(ns,'svg');
  s.setAttribute('width',size); s.setAttribute('height',size);
  s.setAttribute('viewBox','0 0 200 200');
  s.style.display='block'; s.style.flexShrink='0';

  var defs = document.createElementNS(ns,'defs');

  function radGrad(id,cx,cy,r,stops){
    var g=document.createElementNS(ns,'radialGradient');
    g.setAttribute('id',id); g.setAttribute('cx',cx); g.setAttribute('cy',cy); g.setAttribute('r',r);
    stops.forEach(function(st){ var e=document.createElementNS(ns,'stop'); e.setAttribute('offset',st[0]); e.setAttribute('stop-color',st[1]); g.appendChild(e); });
    return g;
  }
  var fid = 'f'+Math.random().toString(36).slice(2,6); // unique IDs
  defs.appendChild(radGrad(fid+'h','36%','26%','74%',[['0%','#f2f4f8'],['46%','#bec6d2'],['100%','#4c5260']]));
  defs.appendChild(radGrad(fid+'b','24%','18%','82%',[['0%','#eaecf0'],['52%','#a8b2c2'],['100%','#5a6270']]));
  var filt=document.createElementNS(ns,'filter'); filt.setAttribute('id',fid+'s');
  var drop=document.createElementNS(ns,'feDropShadow');
  drop.setAttribute('dx','0'); drop.setAttribute('dy','1.5'); drop.setAttribute('stdDeviation','3.5');
  drop.setAttribute('flood-color','#000'); drop.setAttribute('flood-opacity','0.55');
  filt.appendChild(drop); defs.appendChild(filt);
  s.appendChild(defs);

  var g=document.createElementNS(ns,'g');
  g.style.transformOrigin='100px 100px';
  g.style.animation='fSpin '+dur+' linear infinite';

  [0,72,144,216,288].forEach(function(a){
    var gg=document.createElementNS(ns,'g');
    gg.setAttribute('transform','rotate('+a+',100,100)');
    var blade=document.createElementNS(ns,'path');
    blade.setAttribute('d','M100,98 C92,80 88,55 100,28 C112,55 108,80 100,98Z');
    blade.setAttribute('fill','url(#'+fid+'b)');
    blade.setAttribute('filter','url(#'+fid+'s)');
    blade.setAttribute('transform','rotate(-18,100,100)');
    gg.appendChild(blade);
    g.appendChild(gg);
  });

  function circle(cx,cy,r,fill,filt2){
    var c=document.createElementNS(ns,'circle');
    c.setAttribute('cx',cx); c.setAttribute('cy',cy); c.setAttribute('r',r);
    c.setAttribute('fill',fill);
    if(filt2) c.setAttribute('filter','url(#'+filt2+')');
    return c;
  }
  g.appendChild(circle(100,100,13,'url(#'+fid+'h)',fid+'s'));
  g.appendChild(circle(100,100,5.8,'#17181c',null));
  g.appendChild(circle(100,100,2.6,'#080909',null));
  g.appendChild(circle(96.5,96.5,1.3,'rgba(255,255,255,.30)',null));
  s.appendChild(g);
  return s;
}

/* ═══════════════════════════════════════════════════
   REUSABLE UI COMPONENTS
═══════════════════════════════════════════════════ */

function makeNavBar(left, center, right) {
  var bar = div({className:'navbar'}, [left, center, right].filter(Boolean));
  return bar;
}

function makeTabBar(onAdd, onExport) {
  var bar = div({className:'tabbar'});
  function tabBtn(icon, label, action) {
    var b = btn({className:'tab-btn', onClick:action});
    b.appendChild(IC[icon](22,'rgba(255,255,255,.25)'));
    b.appendChild(span(null, label));
    return b;
  }
  bar.appendChild(tabBtn('doc','Reports', function(){}));
  bar.appendChild(tabBtn('dl','Ledger', function(){ location.href='ledger.html'; }));
  bar.appendChild(div({style:{flex:'1'}}));
  bar.appendChild(tabBtn('share','Backup', function(){ FGB.backup(); }));
  bar.appendChild(tabBtn('menu','More', function(){ openSettings(); }));
  var centerBtn = btn({className:'tab-center','aria-label':'Add new item', onClick:onAdd});
  centerBtn.appendChild(IC.plus(26,'#000'));
  bar.appendChild(centerBtn);
  return bar;
}

function makeSearchBar(value, onInput) {
  var bar = div({className:'searchbar'});
  bar.appendChild(IC.search(16,'rgba(255,255,255,.25)'));
  var i = inp({type:'text', placeholder:'Search', value:value||''});
  i.addEventListener('input', function(){ onInput(i.value); });
  bar.appendChild(i);
  return bar;
}

function makeSheet(title, onClose, onAction, actionLabel, bodyFn) {
  var overlay = div({className:'sheet-overlay'});
  var bg = div({className:'sheet-bg'});
  bg.addEventListener('click', onClose);
  var card = div({className:'sheet-card'});
  var pill = div({className:'sheet-pill'}, [div({className:'sheet-pill-inner'})]);
  var nav = div({className:'sheet-nav'});
  var cancelBtn = btn({style:{color:'rgba(255,255,255,.5)'}, onClick:onClose}, ['Cancel']);
  var titleSpan = span({style:{fontSize:'17px',fontWeight:'600',color:'#fff'}}, title);
  var actionBtn = btn({style:{color:'#00AEEF',fontWeight:'600'}, onClick:onAction}, [actionLabel]);
  nav.appendChild(cancelBtn); nav.appendChild(titleSpan); nav.appendChild(actionBtn);
  card.appendChild(pill); card.appendChild(nav);
  var body = div({className:'sheet-body'});
  bodyFn(body);
  card.appendChild(body);
  overlay.appendChild(bg);
  overlay.appendChild(card);
  return overlay;
}

function makeFieldGroup(rows) {
  var g = div({className:'field-group'});
  rows.forEach(function(r){ g.appendChild(r); });
  return g;
}

function makeFieldRow(label, inputEl, isLast, isHalf) {
  var cls = 'field-row'+(isLast?' last':'')+(isHalf?' half':'');
  var row = div({className:cls});
  var lbl = div({className:'field-label'}, [label]);
  row.appendChild(lbl);
  row.appendChild(inputEl);
  return row;
}

function makeInput(placeholder, value, onChange, type) {
  var i = inp({type:type||'text', placeholder:placeholder||'', value:value||''});
  i.addEventListener('input', function(){ onChange(i.value); });
  return i;
}

function makeSelect(options, value, onChange) {
  var s = sel({});
  options.forEach(function(o){
    var opt = document.createElement('option');
    opt.value = o; opt.textContent = o;
    opt.style.background = '#1c1c1e';
    if (o === value) opt.selected = true;
    s.appendChild(opt);
  });
  s.className = 'field-input';
  s.addEventListener('change', function(){ onChange(s.value); });
  return s;
}

function makeToggle(on, onChange) {
  var wrap = div({className:'toggle', style:{background:on?'#00AEEF':'#3a3a3c'}});
  var thumb = div({className:'toggle-thumb', style:{left:on?'23px':'2px'}});
  wrap.appendChild(thumb);
  wrap.addEventListener('click', function(){
    on = !on;
    wrap.style.background = on?'#00AEEF':'#3a3a3c';
    thumb.style.left = on?'23px':'2px';
    onChange(on);
  });
  return wrap;
}

/* ═══════════════════════════════════════════════════
   CITY AUTOCOMPLETE
═══════════════════════════════════════════════════ */
function getSavedCities() {
  try { return JSON.parse(localStorage.getItem('fg-saved-cities')||'[]'); } catch(e){ return []; }
}
function saveCityEntry(city) {
  if (!city || !city.trim()) return;
  var saved = getSavedCities();
  if (saved.indexOf(city) === -1) {
    saved.unshift(city);
    if (saved.length > 50) saved = saved.slice(0,50);
    localStorage.setItem('fg-saved-cities', JSON.stringify(saved));
  }
}

function makeCityInput(placeholder, value, onChange) {
  var wrap = div({className:'city-wrap'});
  var input = document.createElement('input');
  input.type = 'text';
  input.placeholder = placeholder||'City, state or customer';
  input.value = value||'';
  input.className = 'field-input';
  input.style.color = value ? '#fff' : 'rgba(255,255,255,.22)';
  var dropdown = null;
  var debounce = null;

  function closeDropdown() {
    if (dropdown) { dropdown.remove(); dropdown = null; }
  }

  function showSuggestions(results) {
    closeDropdown();
    if (!results.length) return;
    dropdown = div({className:'city-dropdown'});
    dropdown.style.position = 'fixed';
    dropdown.style.zIndex = '9999';
    // Position below the input field
    var rect = input.getBoundingClientRect();
    dropdown.style.left  = rect.left + 'px';
    dropdown.style.top   = (rect.bottom + 2) + 'px';
    dropdown.style.width = rect.width + 'px';
    dropdown.style.borderRadius = '10px';
    results.slice(0,5).forEach(function(city) {
      var opt = div({className:'city-option'}, [city]);
      opt.addEventListener('mousedown', function(e){ e.preventDefault(); });
      opt.addEventListener('click', function() {
        input.value = city;
        input.style.color = '#fff';
        onChange(city);
        saveCityEntry(city);
        closeDropdown();
      });
      dropdown.appendChild(opt);
    });
    document.body.appendChild(dropdown);
  }

  // Large built-in city list — works offline, no API needed
  var CITIES = [
    'Avondale, AZ','Buckeye, AZ','Chandler, AZ','Gilbert, AZ','Glendale, AZ',
    'Goodyear, AZ','Mesa, AZ','Peoria, AZ','Phoenix, AZ','Scottsdale, AZ',
    'Surprise, AZ','Tempe, AZ','Tucson, AZ','Yuma, AZ','Flagstaff, AZ',
    'Tolleson, AZ','Laveen, AZ','Casa Grande, AZ','Prescott, AZ','Kingman, AZ',
    'Anaheim, CA','Bakersfield, CA','Chula Vista, CA','Fontana, CA','Fresno, CA',
    'Irvine, CA','Long Beach, CA','Los Angeles, CA','Modesto, CA','Oakland, CA',
    'Oxnard, CA','Riverside, CA','Sacramento, CA','San Bernardino, CA','San Diego, CA',
    'San Francisco, CA','San Jose, CA','Santa Ana, CA','Stockton, CA','Fremont, CA',
    'Aurora, CO','Colorado Springs, CO','Denver, CO','Fort Collins, CO','Lakewood, CO',
    'Pueblo, CO','Westminster, CO','Arvada, CO','Centennial, CO','Boulder, CO',
    'Bridgeport, CT','Hartford, CT','New Haven, CT','Stamford, CT','Waterbury, CT',
    'Jacksonville, FL','Miami, FL','Orlando, FL','St. Petersburg, FL','Tampa, FL',
    'Tallahassee, FL','Fort Lauderdale, FL','Cape Coral, FL','Hialeah, FL','Pembroke Pines, FL',
    'Atlanta, GA','Augusta, GA','Columbus, GA','Macon, GA','Savannah, GA','Athens, GA',
    'Chicago, IL','Aurora, IL','Joliet, IL','Naperville, IL','Peoria, IL','Rockford, IL',
    'Springfield, IL','Elgin, IL','Indianapolis, IN','Fort Wayne, IN','Evansville, IN',
    'Louisville, KY','Lexington, KY','Bowling Green, KY','Owensboro, KY',
    'Baton Rouge, LA','New Orleans, LA','Shreveport, LA','Lafayette, LA','Lake Charles, LA',
    'Baltimore, MD','Frederick, MD','Rockville, MD','Gaithersburg, MD',
    'Boston, MA','Springfield, MA','Lowell, MA','Cambridge, MA','Worcester, MA',
    'Detroit, MI','Grand Rapids, MI','Lansing, MI','Ann Arbor, MI','Flint, MI','Sterling Heights, MI',
    'Minneapolis, MN','Saint Paul, MN','Rochester, MN','Duluth, MN',
    'Kansas City, MO','Saint Louis, MO','Springfield, MO','Columbia, MO','Independence, MO',
    'Las Vegas, NV','Henderson, NV','Reno, NV','North Las Vegas, NV','Sparks, NV',
    'Albuquerque, NM','Las Cruces, NM','Rio Rancho, NM','Santa Fe, NM',
    'New York, NY','Buffalo, NY','Rochester, NY','Yonkers, NY','Syracuse, NY','Albany, NY',
    'Charlotte, NC','Raleigh, NC','Greensboro, NC','Durham, NC','Winston-Salem, NC','Fayetteville, NC',
    'Columbus, OH','Cleveland, OH','Cincinnati, OH','Toledo, OH','Akron, OH','Dayton, OH',
    'Oklahoma City, OK','Tulsa, OK','Norman, OK','Broken Arrow, OK','Lawton, OK',
    'Portland, OR','Salem, OR','Eugene, OR','Gresham, OR','Hillsboro, OR','Bend, OR',
    'Philadelphia, PA','Pittsburgh, PA','Allentown, PA','Erie, PA','Reading, PA',
    'Memphis, TN','Nashville, TN','Knoxville, TN','Chattanooga, TN','Clarksville, TN',
    'Houston, TX','San Antonio, TX','Dallas, TX','Austin, TX','Fort Worth, TX',
    'El Paso, TX','Arlington, TX','Corpus Christi, TX','Plano, TX','Lubbock, TX',
    'Laredo, TX','Garland, TX','Irving, TX','Amarillo, TX','Grand Prairie, TX',
    'McKinney, TX','Frisco, TX','Pasadena, TX','Brownsville, TX','Waco, TX',
    'Mesquite, TX','Killeen, TX','McAllen, TX','Midland, TX','Odessa, TX',
    'Salt Lake City, UT','West Valley City, UT','Provo, UT','West Jordan, UT','Ogden, UT',
    'Virginia Beach, VA','Norfolk, VA','Chesapeake, VA','Richmond, VA','Newport News, VA',
    'Seattle, WA','Spokane, WA','Tacoma, WA','Vancouver, WA','Bellevue, WA','Kirkland, WA',
    'Milwaukee, WI','Madison, WI','Green Bay, WI','Kenosha, WI','Racine, WI',
    'Cheyenne, WY','Casper, WY',
    'Anchorage, AK','Fairbanks, AK','Juneau, AK',
    'Honolulu, HI','Pearl City, HI','Hilo, HI',
    'Boise, ID','Nampa, ID','Meridian, ID','Idaho Falls, ID',
    'Billings, MT','Missoula, MT','Great Falls, MT',
    'Fargo, ND','Bismarck, ND','Grand Forks, ND',
    'Sioux Falls, SD','Rapid City, SD',
    'Lincoln, NE','Omaha, NE',
    'Wichita, KS','Overland Park, KS','Kansas City, KS','Topeka, KS',
    'Des Moines, IA','Cedar Rapids, IA','Davenport, IA',
    'Little Rock, AR','Fort Smith, AR','Fayetteville, AR',
    'Jackson, MS','Gulfport, MS','Southaven, MS',
    'Birmingham, AL','Montgomery, AL','Huntsville, AL','Mobile, AL',
    'Columbia, SC','Charleston, SC','North Charleston, SC','Greenville, SC',
    'Providence, RI','Cranston, RI','Warwick, RI',
    'Burlington, VT','South Burlington, VT',
    'Manchester, NH','Nashua, NH','Concord, NH',
    'Portland, ME','Lewiston, ME','Bangor, ME',
    'Newark, NJ','Jersey City, NJ','Paterson, NJ','Elizabeth, NJ','Edison, NJ',
    'Wilmington, DE','Dover, DE',
    'Washington, DC'
  ];

  function fetchCities(q) {
    if (q.length < 2) { closeDropdown(); return; }
    var q2 = q.toLowerCase();
    // Combine built-in list + user's saved cities (no duplicates)
    var saved = getSavedCities();
    var all = saved.slice();
    CITIES.forEach(function(c){ if (all.indexOf(c)===-1) all.push(c); });
    var matches = all.filter(function(c){ return c.toLowerCase().indexOf(q2) > -1; });
    // Sort: saved cities first, then starts-with, then contains
    matches.sort(function(a,b){
      var aInSaved = saved.indexOf(a) > -1 ? 0 : 1;
      var bInSaved = saved.indexOf(b) > -1 ? 0 : 1;
      if (aInSaved !== bInSaved) return aInSaved - bInSaved;
      var aS = a.toLowerCase().indexOf(q2)===0 ? 0 : 1;
      var bS = b.toLowerCase().indexOf(q2)===0 ? 0 : 1;
      return aS-bS || a.localeCompare(b);
    });
    showSuggestions(matches);
  }

  input.addEventListener('input', function() {
    var v = input.value;
    input.style.color = v ? '#fff' : 'rgba(255,255,255,.22)';
    onChange(v);
    clearTimeout(debounce);
    debounce = setTimeout(function(){ fetchCities(v); }, 300);
  });
  input.addEventListener('blur', function() {
    setTimeout(closeDropdown, 150);
  });

  wrap.appendChild(input);
  return { wrap:wrap, input:input };
}

/* ═══════════════════════════════════════════════════
   SETTINGS SHEET
═══════════════════════════════════════════════════ */
function settingSection(label) {
  var s = div({style:{margin:'20px 16px 0'}});
  s.appendChild(div({className:'fgb-section'}, label));
  return s;
}
function settingGroup() {
  return div({style:{background:'#1c1c1e',borderRadius:'12px',overflow:'hidden'}});
}
function settingRow(label, value, action, color, last) {
  var row = div({style:{display:'flex',alignItems:'center',justifyContent:'space-between',
    padding:'13px 16px', borderBottom: last?'none':'0.5px solid rgba(255,255,255,.09)',
    cursor:action?'pointer':'default'}});
  row.appendChild(span({style:{fontSize:'16px',color:color||'#fff'}}, label));
  if (value) row.appendChild(span({style:{fontSize:'15px',color:'rgba(255,255,255,.35)'}}, value));
  if (action) row.addEventListener('click', action);
  return row;
}
function settingBtn(label, action, color, last) {
  var b = btn({style:{width:'100%',padding:'13px 16px',background:'none',border:'none',
    color:color||'#00AEEF',fontSize:'16px',textAlign:'left',cursor:'pointer',
    fontFamily:'inherit',display:'block',
    borderBottom:last?'none':'0.5px solid rgba(255,255,255,.09)'}});
  b.textContent = label;
  b.addEventListener('click', action);
  return b;
}

function openSettings() {
  var overlay = div({className:'sheet-overlay'});
  var bg = div({className:'sheet-bg'}); bg.addEventListener('click', close);
  var card = div({className:'sheet-card'});
  card.appendChild(div({className:'sheet-pill'},[div({className:'sheet-pill-inner'})]));
  function close(){ overlay.remove(); }

  var nav = div({className:'sheet-nav'});
  nav.appendChild(div({style:{width:'60px'}}));
  nav.appendChild(span({style:{fontSize:'17px',fontWeight:'600',color:'#fff'}},'Settings'));
  var doneBtn = btn({style:{color:'#00AEEF',fontWeight:'600',fontSize:'17px',
    background:'none',border:'none',cursor:'pointer',width:'60px',textAlign:'right'}});
  doneBtn.textContent='Done'; doneBtn.addEventListener('click',close);
  nav.appendChild(doneBtn);
  card.appendChild(nav);

  var body = div({className:'sheet-body',style:{padding:'0 0 50px'}});

  // ── Sending invoices ──
  var sendSec = settingSection('Sending invoices');
  var sendGrp = settingGroup();
  var bills = FGBDrive.billTo();
  sendGrp.appendChild(settingBtn('Bill to: ' + bills.map(function(c){ return c.name; }).join(', '), function(){ FGBDrive.editBillTo(); }, '#00AEEF', false));
  sendGrp.appendChild(settingBtn(FGBDrive.connected() ? 'Google Drive: connected' : 'Connect Google Drive', function(){ FGBDrive.setupDrive(); }, '#00AEEF', true));
  sendSec.appendChild(sendGrp);
  body.appendChild(sendSec);

  // ── AI Scan ──
  var scanSec = settingSection('AI Receipt Scan');
  var scanGrp = settingGroup();
  var currentKey = localStorage.getItem('fg-gemini-key')||'';
  var statusSpan = span({style:{fontSize:'15px',color:currentKey?'#30d158':'#ff453a'}},
    currentKey?'Active':'Not set');
  var statusRow2 = div({style:{display:'flex',alignItems:'center',justifyContent:'space-between',
    padding:'13px 16px',borderBottom:'0.5px solid rgba(255,255,255,.09)'}});
  statusRow2.appendChild(span({style:{fontSize:'16px',color:'#fff'}},'Scan Status'));
  statusRow2.appendChild(statusSpan);
  scanGrp.appendChild(statusRow2);

  var keyRow = div({style:{padding:'11px 16px',borderBottom:'0.5px solid rgba(255,255,255,.09)'}});
  keyRow.appendChild(div({style:{fontSize:'11px',color:'rgba(255,255,255,.3)',marginBottom:'5px',
    textTransform:'uppercase',letterSpacing:'.3px'}},'Gemini API Key'));
  var keyInp = document.createElement('input');
  keyInp.type='text'; keyInp.placeholder='Paste AIzaSy... key';
  keyInp.value=currentKey;
  keyInp.style.cssText='background:none;border:none;outline:none;color:#fff;font-size:14px;width:100%;font-family:monospace';
  keyRow.appendChild(keyInp);
  scanGrp.appendChild(keyRow);
  scanGrp.appendChild(settingBtn('Save Key', function(){
    var k=keyInp.value.trim();
    if(!k){alert('Paste your key first.');return;}
    localStorage.setItem('fg-gemini-key',k);
    statusSpan.textContent='Active'; statusSpan.style.color='#30d158';
    alert('✓ AI scan active!');
  }, '#00AEEF', false));
  scanGrp.appendChild(settingBtn('Remove Key', function(){
    localStorage.removeItem('fg-gemini-key');
    keyInp.value=''; statusSpan.textContent='Not set'; statusSpan.style.color='#ff453a';
  }, '#ff453a', true));
  scanSec.appendChild(scanGrp);
  scanSec.appendChild(div({style:{fontSize:'12px',color:'rgba(255,255,255,.2)',marginTop:'8px',
    paddingLeft:'4px',lineHeight:'1.6'}},'Free key at aistudio.google.com'));
  body.appendChild(scanSec);

  // ── Passcode ──
  var passSec = settingSection('Passcode');
  var passGrp = settingGroup();
  passGrp.appendChild(settingBtn('Change Passcode', function(){
    var cur = prompt('Enter current passcode:');
    if (cur !== PIN_CODE) { alert('Incorrect passcode.'); return; }
    var n1 = prompt('Enter new 4-digit passcode:');
    if (!n1 || n1.length !== 4 || isNaN(n1)) { alert('Must be 4 digits.'); return; }
    var n2 = prompt('Confirm new passcode:');
    if (n1 !== n2) { alert('Passcodes do not match.'); return; }
    PIN_CODE = n1;
    FGB.setPin(n1);
    alert('✓ Passcode changed!');
  }, '#00AEEF', false));
  passGrp.appendChild(settingBtn('Forgot Passcode — Reset', function(){
    if (!window.confirm('This will reset your passcode to 7264. Your jobs and receipts will NOT be deleted. Continue?')) return;
    PIN_CODE = '7264';
    localStorage.removeItem('fgb-pin');
    localStorage.removeItem(PIN_KEY);
    alert('Passcode reset to 7264. Change it again in Settings anytime.');
  }, '#ff9f0a', true));
  passSec.appendChild(passGrp);
  passSec.appendChild(div({style:{fontSize:'12px',color:'rgba(255,255,255,.2)',marginTop:'8px',
    paddingLeft:'4px',lineHeight:'1.6'}},'Open on any phone: thefanguys.github.io/Fan-Guys-Books'));
  body.appendChild(passSec);

  // ── Data ──
  var dataSec = settingSection('Data');
  var dataGrp = settingGroup();

  // Storage-used readout (photos live in IndexedDB now, so there's lots of room)
  var usageWrap = div({style:{padding:'13px 16px',borderBottom:'0.5px solid rgba(255,255,255,.09)'}});
  var usageL1 = div({style:{fontSize:'14px',fontWeight:'700',color:'#fff'}}, ['Storage used: …']);
  var barOuter = div({style:{height:'6px',background:'rgba(255,255,255,.1)',borderRadius:'3px',margin:'9px 0 6px',overflow:'hidden',display:'none'}});
  var barInner = div({style:{height:'100%',width:'0%',background:'#30d158',borderRadius:'3px'}});
  barOuter.appendChild(barInner);
  var usageL2 = div({style:{fontSize:'12px',color:'rgba(255,255,255,.45)'}}, ['']);
  usageWrap.appendChild(usageL1); usageWrap.appendChild(barOuter); usageWrap.appendChild(usageL2);
  dataGrp.appendChild(usageWrap);
  (function(){
    function human(b){ if(!b) return '0 MB'; if(b<1048576) return (b/1024).toFixed(0)+' KB'; if(b<1073741824) return (b/1048576).toFixed(1)+' MB'; return (b/1073741824).toFixed(2)+' GB'; }
    var photos=Object.keys(IMG).length, ldb=dbGet(), reports=(ldb.jobs||[]).length, receipts=(ldb.receipts||[]).length;
    usageL2.textContent = reports+' reports \u00b7 '+receipts+' receipts \u00b7 '+photos+' photos';
    if(navigator.storage && navigator.storage.estimate){
      navigator.storage.estimate().then(function(est){
        var u=est.usage||0, q=est.quota||0;
        usageL1.textContent = 'Storage used: '+human(u)+(q?(' of '+human(q)):'');
        if(q){
          var pct=Math.max(1, Math.min(100, Math.round(u/q*100)));
          barInner.style.width=pct+'%';
          barInner.style.background = pct>85?'#ff453a':(pct>60?'#ffd60a':'#30d158');
          barOuter.style.display='block';
          usageL2.textContent = pct+'% full \u00b7 '+reports+' reports \u00b7 '+receipts+' receipts \u00b7 '+photos+' photos';
        }
      }).catch(function(){ usageL1.textContent='Storage used: '+human(0)+' ('+photos+' photos)'; });
    } else {
      var bytes=(localStorage.getItem(DB)||'').length; Object.keys(IMG).forEach(function(k){ bytes+=(IMG[k]||'').length; });
      usageL1.textContent='Storage used: ~'+human(bytes);
    }
  })();

  var unsentN = unsentReports().length;
  dataGrp.appendChild(settingBtn('Send All Unsent to Ledger (' + unsentN + ')', function(){
    sendAllUnsent();
  }, '#30d158', false));
  dataGrp.appendChild(settingBtn('Backup Everything \u2014 Save to Files / iCloud', function(){
    FGB.backup();
  }, '#00AEEF', false));
  dataGrp.appendChild(settingBtn('Restore from Backup (any Fan Guys file)', function(){
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.style.display = 'none';
    document.body.appendChild(input);
    function cleanup(){ if(input.parentNode) input.parentNode.removeChild(input); }
    input.addEventListener('change', function(){
      var file = input.files && input.files[0];
      if(!file){ cleanup(); return; }
      var reader = new FileReader();
      reader.onload = function(ev){
        var data;
        try { data = JSON.parse(ev.target.result); }
        catch(e){ alert('That file is not a valid backup. Pick the FanGuys-backup-….json file you exported.'); cleanup(); return; }
        var kind = FGB.detect(data);
        if (kind === 'books' || kind === 'ledger') { cleanup(); FGB.restoreAny(data); return; }
        if(!data || (!Array.isArray(data.jobs) && !Array.isArray(data.receipts))){
          alert('That file does not look like an Invoice Pro backup.'); cleanup(); return;
        }
        var db = dbGet();
        var inJobs = Array.isArray(data.jobs) ? data.jobs : [];
        var inRec  = Array.isArray(data.receipts) ? data.receipts : [];
        var jAdded=0, jUpd=0, rAdded=0, rUpd=0;
        inJobs.forEach(function(j){
          if(!j || !j.id) return;
          var i = db.jobs.findIndex(function(x){return x.id===j.id;});
          if(i>=0){ db.jobs[i]=j; jUpd++; } else { db.jobs.push(j); jAdded++; }
        });
        inRec.forEach(function(r){
          if(!r || !r.id) return;
          // photo may be inline (old backup) or in data.images (new backup)
          if(r.image && typeof r.image==='string' && r.image.indexOf('data:')===0){
            IMG[r.id]=r.image; idbPutImg(r.id, r.image); delete r.image;
          }
          var i = db.receipts.findIndex(function(x){return x.id===r.id;});
          if(i>=0){ db.receipts[i]=r; rUpd++; } else { db.receipts.push(r); rAdded++; }
        });
        if(data.images && typeof data.images==='object'){
          Object.keys(data.images).forEach(function(id){ IMG[id]=data.images[id]; idbPutImg(id, data.images[id]); });
        }
        dbSave(db);
        cleanup(); close(); renderJobList();
        alert('Restore complete.\n\nReports: '+jAdded+' added, '+jUpd+' updated.\nReceipts: '+rAdded+' added, '+rUpd+' updated.\n\nNothing was deleted.');
      };
      reader.onerror = function(){ alert('Could not read that file.'); cleanup(); };
      reader.readAsText(file);
    });
    input.click();
  }, '#30d158', false));
  dataGrp.appendChild(settingBtn('Reset All Data', function(){
    if (!window.confirm('DELETE all jobs and receipts? This cannot be undone.')) return;
    if (!window.confirm('Are you sure? All data will be permanently deleted.')) return;
    dbSave({jobs:[],receipts:[]});
    close();
    renderJobList();
  }, '#ff453a', true));
  dataSec.appendChild(dataGrp);
  body.appendChild(dataSec);

  // ── About ──
  var aboutSec = settingSection('About');
  var aboutGrp = settingGroup();
  aboutGrp.appendChild(settingRow('App', 'Fan Guys Books', null, null, false));
  aboutGrp.appendChild(settingRow('Version', '2.0', null, null, true));
  aboutSec.appendChild(aboutGrp);
  body.appendChild(aboutSec);

  card.appendChild(body);
  overlay.appendChild(bg); overlay.appendChild(card);
  document.body.appendChild(overlay);
}

/* ═══════════════════════════════════════════════════
   SPLASH SCREEN
═══════════════════════════════════════════════════ */
function showSplash(onDone) {
  var s = div({className:'splash'});
  s.appendChild(img({src:'assets/brand-2a40d1ca.png', alt:'Fan Guys', style:{width:'200px',height:'auto',display:'block'}}));
  var sub = div({style:{color:'rgba(255,255,255,.35)',fontSize:'12px',letterSpacing:'6px',marginTop:'16px',textTransform:'none',letterSpacing:'0',fontSize:'15px'}}, ['Invoices and ledger']);
  s.appendChild(sub);
  document.body.appendChild(s);
  setTimeout(function(){ s.style.opacity='0'; }, 2000);
  setTimeout(function(){ s.remove(); onDone(); }, 180);
}

/* ═══════════════════════════════════════════════════
   RECEIPT FORM SHEET
═══════════════════════════════════════════════════ */
function openReceiptSheet(jobId, initial, onSave) {
  var form = initial ? Object.assign({},initial) : {
    id:uid(), date:today(), vendor:'', amount:'',
    category:CATS[0], payment:PAY[1],
    jobId:jobId, notes:'', reimbursable:true, image:null
  };
  if (initial && !form.image && IMG[form.id]) form.image = IMG[form.id];
  var scanSt = 'idle', scanMsg = '';
  var fileInput;
  var photoZone, spinnerDiv, scanResult;

  function setScan(st, msg) {
    scanSt = st; scanMsg = msg||'';
    var busy = (st==='crop'||st==='scan');
    if (photoZone) {
      photoZone.style.borderColor = busy?'#00AEEF':'rgba(255,255,255,.09)';
    }
    if (spinnerDiv) spinnerDiv.style.display = busy?'flex':'none';
    if (spinnerDiv) { var stxt=spinnerDiv.querySelector('.scan-txt'); if(stxt) stxt.textContent=msg; }
    if (scanResult) {
      if (st==='ok'||st==='err') {
        scanResult.style.display='flex';
        scanResult.querySelector('.scan-icon').innerHTML='';
        scanResult.querySelector('.scan-icon').appendChild(st==='ok'?IC.check(14,'#30d158'):IC.xmark(14,'#ff453a'));
        scanResult.querySelector('.scan-txt2').textContent=msg;
        scanResult.querySelector('.scan-txt2').style.color=st==='ok'?'#30d158':'#ff453a';
      } else {
        scanResult.style.display='none';
      }
    }
  }

  function submit() {
    if (!form.vendor.trim()) { alert('Enter a vendor name.'); return; }
    var amt = parseFloat(form.amount);
    if (isNaN(amt)||amt<0) { alert('Enter a valid amount.'); return; }
    form.amount = amt;
    overlay.remove();
    onSave(Object.assign({},form));
  }

  function close() { overlay.remove(); }

  var overlay = makeSheet(
    initial?'Edit Receipt':'New Receipt',
    close, submit, initial?'Save':'Add',
    function(body) {
      // Photo zone
      var photoWrap = div({style:{padding:'12px 16px 6px'}});
      photoZone = div({className:'photo-zone'});
      photoZone.style.borderStyle='dashed';
      photoZone.style.borderWidth='1.5px';
      photoZone.style.borderColor='rgba(255,255,255,.09)';

      var camPlaceholder = div({style:{display:'flex',flexDirection:'column',alignItems:'center',gap:'0'}});
      camPlaceholder.appendChild(IC.cam(28,'rgba(255,255,255,.25)'));
      var ct=div({style:{fontSize:'14px',color:'rgba(255,255,255,.25)',marginTop:'8px'}},['Tap to add receipt photo']);
      var cs=div({style:{fontSize:'11px',color:'rgba(255,255,255,.18)',marginTop:'3px'}},['Camera · Photo Library · Files']);
      camPlaceholder.appendChild(ct); camPlaceholder.appendChild(cs);
      photoZone.appendChild(camPlaceholder);

      spinnerDiv = div({className:'photo-overlay', style:{display:'none'}});
      var sp = div({className:'spinner'});
      var stxt = div({className:'scan-txt', style:{color:'#fff',fontSize:'13px'}},['']);
      spinnerDiv.appendChild(sp); spinnerDiv.appendChild(stxt);
      photoZone.appendChild(spinnerDiv);

      if (form.image) {
        camPlaceholder.style.display='none';
        var imgEl = img({src:form.image, alt:''});
        imgEl.style.cssText='width:100%;height:100%;object-fit:cover;position:absolute;inset:0';
        photoZone.appendChild(imgEl);
      }

      photoZone.style.position='relative';
      photoZone.addEventListener('click', function(){
        if (form.image) {
          // Already has photo — show fullscreen viewer
          openImageViewer(form.image, function() {
            // Optional: re-pick photo from viewer
            fileInput && fileInput.click();
          });
        } else {
          fileInput && fileInput.click();
        }
      });

      fileInput = inp({type:'file', accept:'image/*'});
      fileInput.style.display='none';
      fileInput.addEventListener('change', function(e) {
        var file = e.target.files&&e.target.files[0]; if(!file) return;
        fileInput.value='';
        var reader = new FileReader();
        reader.onload = function(ev) {
          var raw = ev.target.result;
          showCropTool(raw, function(cropped){ processImage(cropped); }, function(orig){ processImage(orig); });
        };
        reader.readAsDataURL(file);
      });

      var processImage = function(raw) {
          setScan('crop','Processing...');
          prepImage(raw).then(function(prepped){
            camPlaceholder.style.display='none';
            var oldImg = photoZone.querySelector('img[style*="position:absolute"]');
            if(oldImg) oldImg.remove();
            var imgEl2=document.createElement('img');
            imgEl2.src=prepped; imgEl2.alt='';
            imgEl2.style.cssText='width:100%;height:100%;object-fit:cover;position:absolute;inset:0';
            photoZone.appendChild(imgEl2);
            form.image=prepped;
            setScan('scan','Reading receipt...');
            scanReceipt(prepped).then(function(res){
              var n=0;
              if(res.vendor&&res.vendor.trim()){ form.vendor=res.vendor.trim(); vendorInp.value=form.vendor; vendorInp.style.color='#fff'; n++; }
              if(res.amount&&res.amount>0){ form.amount=res.amount.toFixed(2); amtInp.value=form.amount; amtInp.style.color='#fff'; n++; }
              if(res.date&&/^\d{4}-\d{2}-\d{2}$/.test(res.date)){ form.date=res.date; dateInp.value=form.date; n++; }
              if(res.category&&res.category.trim()){ form.category=res.category.trim(); catSel.value=form.category; n++; }
              if(n===0){ form.date=today(); dateInp.value=form.date; }
              setScan('ok',n>0?'Auto-filled '+n+' field'+(n>1?'s':'')+' — review below':'Photo saved — fill in Amount and Vendor below');
              // Auto-focus first empty important field
              setTimeout(function(){
                if(!form.amount||parseFloat(form.amount)===0){ amtInp.focus(); }
                else if(!form.vendor){ vendorInp.focus(); }
              }, 400);
              setTimeout(function(){setScan('idle','');},5000);
            }).catch(function(err){
              console.error(err);
              form.date=today(); dateInp.value=form.date;
              setScan('ok','Photo saved — fill in Amount and Vendor below');
              setTimeout(function(){setScan('idle','');},4000);
            });
          });
      }

      scanResult = div({style:{display:'none',alignItems:'center',gap:'5px',marginTop:'8px',paddingLeft:'2px'}});
      var scanIcon = div({className:'scan-icon'});
      var scanTxt2 = div({className:'scan-txt2', style:{fontSize:'12px'}});
      scanResult.appendChild(scanIcon); scanResult.appendChild(scanTxt2);

      photoWrap.appendChild(photoZone);
      photoWrap.appendChild(fileInput);
      photoWrap.appendChild(scanResult);
      body.appendChild(photoWrap);

      // Fields
      var dateInp = inp({type:'date', value:form.date||today()});
      dateInp.className='field-input';
      dateInp.addEventListener('change',function(){ form.date=dateInp.value; });

      var amtInp = inp({type:'number', inputMode:'decimal', step:'0.01', min:'0', placeholder:'0.00', value:form.amount||''});
      amtInp.className='field-input';
      amtInp.style.color=form.amount?'#fff':'rgba(255,255,255,.22)';
      amtInp.addEventListener('input',function(){ form.amount=amtInp.value; amtInp.style.color=amtInp.value?'#fff':'rgba(255,255,255,.22)'; });

      var vendorInp = makeInput('e.g. Home Depot, Shell...', form.vendor, function(v){ form.vendor=v; });
      vendorInp.className='field-input';
      vendorInp.style.color=form.vendor?'#fff':'rgba(255,255,255,.22)';
      vendorInp.addEventListener('input',function(){ vendorInp.style.color=vendorInp.value?'#fff':'rgba(255,255,255,.22)'; });

      var catSel = makeSelect(CATS, form.category, function(v){ form.category=v; });
      var paySel = makeSelect(PAY, form.payment, function(v){ form.payment=v; });

      var notesInp = makeInput('Optional', form.notes, function(v){ form.notes=v; });
      notesInp.className='field-input';
      notesInp.style.color=form.notes?'#fff':'rgba(255,255,255,.22)';
      notesInp.addEventListener('input',function(){ notesInp.style.color=notesInp.value?'#fff':'rgba(255,255,255,.22)'; });

      // Date + Amount row
      var dateRow = makeFieldRow('Date', dateInp, false, true);
      var amtRow  = makeFieldRow('Amount ($)', amtInp, false, true);
      var topRow  = div({style:{display:'flex',borderBottom:'0.5px solid rgba(255,255,255,.09)'}});
      topRow.appendChild(dateRow);
      var divider = div({className:'field-divider'});
      topRow.appendChild(divider);
      topRow.appendChild(amtRow);

      var group = div({className:'field-group'});
      group.appendChild(topRow);
      group.appendChild(makeFieldRow('Vendor / Business', vendorInp, false));
      group.appendChild(makeFieldRow('Category', catSel, false));
      group.appendChild(makeFieldRow('Payment Method', paySel, false));
      group.appendChild(makeFieldRow('Notes', notesInp, true));
      body.appendChild(group);

      // Reimbursable
      var reimb = form.reimbursable!==false;
      var togGroup = div({className:'field-group', style:{marginTop:'10px'}});
      var togRow = div({style:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'13px 16px'}});
      togRow.appendChild(span({style:{fontSize:'16px',color:'#fff'}},'Reimbursable'));
      var tog = makeToggle(reimb, function(v){ form.reimbursable=v; });
      togRow.appendChild(tog);
      togGroup.appendChild(togRow);
      body.appendChild(togGroup);
    }
  );
  document.body.appendChild(overlay);
}

/* ═══════════════════════════════════════════════════
   JOB FORM SHEET
═══════════════════════════════════════════════════ */
function openJobSheet(onSave, existing) {
  var isEdit = !!existing;
  var data = {
    name:      isEdit ? (existing.name||'')      : '',
    location:  isEdit ? (existing.location||'')  : '',
    startDate: isEdit ? (existing.startDate||'') : today(),
    endDate:   isEdit ? (existing.endDate||'')   : '',
    notes:     isEdit ? (existing.notes||'')     : ''
  };
  var DIM = 'rgba(255,255,255,.22)';

  function submit() {
    if (!data.name.trim()) { alert('Enter a job name.'); return; }
    if (data.location && data.location.trim()) saveCityEntry(data.location.trim());
    overlay.remove();
    onSave({id: isEdit ? existing.id : uid(), name:data.name.trim(), location:data.location,
      startDate:data.startDate, endDate:data.endDate, notes:data.notes});
  }

  var overlay = makeSheet(isEdit?'Edit Report':'New Report', function(){overlay.remove();}, submit, isEdit?'Save':'Create', function(body){
    var nameInp = makeInput('e.g. 2026-20 United Cleveland', data.name, function(v){data.name=v;});
    nameInp.className='field-input';
    nameInp.style.color=data.name?'#fff':DIM;
    if(!isEdit) setTimeout(function(){nameInp.focus();},100);
    nameInp.addEventListener('input',function(){ nameInp.style.color=nameInp.value?'#fff':DIM;});

    var cityResult = makeCityInput('City, state or customer', data.location, function(v){data.location=v;});
    var locInp = cityResult.input;
    var locWrap = cityResult.wrap;

    var startInp = inp({type:'date', value:data.startDate});
    startInp.className='field-input';
    startInp.addEventListener('change',function(){data.startDate=startInp.value;});

    var endInp = inp({type:'date', value:data.endDate||''});
    endInp.className='field-input';
    endInp.style.color=data.endDate?'#fff':DIM;
    endInp.addEventListener('change',function(){data.endDate=endInp.value; endInp.style.color=endInp.value?'#fff':DIM;});

    var notesInp = makeInput('PO number, contact info...', data.notes, function(v){data.notes=v;});
    notesInp.className='field-input';
    notesInp.style.color=data.notes?'#fff':DIM;
    notesInp.addEventListener('input',function(){notesInp.style.color=notesInp.value?'#fff':DIM;});

    body.appendChild(makeFieldGroup([
      makeFieldRow('Job / Report Name', nameInp, false),
      makeFieldRow('Location / Customer', locWrap, true)
    ]));
    body.appendChild(makeFieldGroup([
      makeFieldRow('Start Date', startInp, false),
      makeFieldRow('End Date', endInp, true)
    ]));
    body.appendChild(makeFieldGroup([
      makeFieldRow('Notes', notesInp, true)
    ]));
  });
  document.body.appendChild(overlay);
}

/* ═══════════════════════════════════════════════════
   RECEIPT DETAIL SHEET
═══════════════════════════════════════════════════ */
function openImageViewer(src, onReplace) {
  var viewer = div({className:'img-viewer'});
  var header = div({className:'img-viewer-header'});
  // Left: Change Photo button (only if onReplace provided)
  var leftWrap = div({style:{width:'100px'}});
  if (onReplace) {
    var replaceBtn = btn({});
    replaceBtn.textContent = 'Change';
    replaceBtn.style.cssText = 'background:none;border:none;color:rgba(255,255,255,.5);font-size:15px;cursor:pointer';
    replaceBtn.addEventListener('click', function(){ viewer.remove(); onReplace(); });
    leftWrap.appendChild(replaceBtn);
  }
  header.appendChild(leftWrap);
  header.appendChild(span({style:{fontSize:'17px',fontWeight:'600',color:'#fff'}},'Receipt Photo'));
  var closeBtn = btn({});
  closeBtn.textContent = 'Done';
  closeBtn.style.cssText = 'background:none;border:none;color:#00AEEF;font-size:17px;font-weight:600;cursor:pointer;width:100px;text-align:right';
  closeBtn.addEventListener('click', function(){ viewer.remove(); });
  header.appendChild(closeBtn);
  viewer.appendChild(header);
  var body = div({className:'img-viewer-body'});
  var imgEl = document.createElement('img');
  imgEl.src = src; imgEl.alt = 'Receipt';
  body.appendChild(imgEl);
  viewer.appendChild(body);
  document.body.appendChild(viewer);
}

function openReceiptDetail(receipt, onEdit, onDelete) {
  var overlay = div({className:'sheet-overlay'});
  var bg = div({className:'sheet-bg'}); bg.addEventListener('click', close);
  var card = div({className:'sheet-card'});
  var pill = div({className:'sheet-pill'},[div({className:'sheet-pill-inner'})]);

  function close(){ overlay.remove(); }

  var nav = div({className:'sheet-nav'});
  nav.appendChild(div({style:{width:'60px'}}));
  nav.appendChild(span({style:{fontSize:'17px',fontWeight:'600',color:'#fff'}},'Receipt'));
  var doneBtn=btn({style:{color:'#00AEEF',fontWeight:'400',fontSize:'17px'},onClick:close},['Done']);
  nav.appendChild(doneBtn);

  var body = div({className:'sheet-body'});

  if (IMG[receipt.id]) {
    var imgWrap=div({style:{margin:'10px 16px 0',borderRadius:'12px',overflow:'hidden',height:'170px',cursor:'pointer',position:'relative'}});
    var imgEl=img({src:IMG[receipt.id],alt:''}); imgEl.style.cssText='width:100%;height:100%;object-fit:cover';
    // Tap indicator
    var tapHint=div({style:{position:'absolute',bottom:'8px',right:'10px',background:'rgba(0,0,0,.6)',color:'rgba(255,255,255,.7)',fontSize:'11px',padding:'3px 9px',borderRadius:'12px',pointerEvents:'none'}},['Tap to view full']);
    imgWrap.appendChild(imgEl);
    imgWrap.appendChild(tapHint);
    imgWrap.addEventListener('click', function(){ openImageViewer(IMG[receipt.id]); });
    body.appendChild(imgWrap);
  }

  var info=div({style:{padding:'16px 18px 6px'}});
  info.appendChild(div({className:'detail-amount'},[money(receipt.amount)]));
  info.appendChild(div({className:'detail-vendor'},[receipt.vendor]));
  info.appendChild(div({className:'detail-meta'},[fmtD(receipt.date)+' - '+receipt.category]));
  if(receipt.reimbursable) info.appendChild(div({className:'reimb-badge'},['Reimbursable']));
  body.appendChild(info);

  if(receipt.payment||receipt.notes){
    var dets=div({style:{margin:'10px 16px 0',background:'#1c1c1e',borderRadius:'12px',overflow:'hidden'}});
    if(receipt.payment){
      var pr=div({className:'detail-row'});
      pr.appendChild(span({style:{fontSize:'15px',color:'rgba(255,255,255,.48)'}},'Payment'));
      pr.appendChild(span({style:{fontSize:'15px',color:'#fff'}},receipt.payment));
      dets.appendChild(pr);
    }
    if(receipt.notes){
      var nr=div({style:{display:'flex',justifyContent:'space-between',padding:'12px 16px'}});
      nr.appendChild(span({style:{fontSize:'15px',color:'rgba(255,255,255,.48)'}},'Notes'));
      var ntxt=span({style:{fontSize:'15px',color:'#fff',textAlign:'right',maxWidth:'60%'}},receipt.notes);
      nr.appendChild(ntxt); dets.appendChild(nr);
    }
    body.appendChild(dets);
  }

  var acts=div({style:{margin:'10px 16px 0',background:'#1c1c1e',borderRadius:'12px',overflow:'hidden'}});
  var editBtn=btn({className:'action-row',style:{color:'#00AEEF',borderBottom:'0.5px solid rgba(255,255,255,.09)'},onClick:function(){close();onEdit(receipt);}},['Edit Receipt']);
  var delBtn=btn({className:'action-row',style:{color:'#ff453a'},onClick:function(){
    if(window.confirm('Delete this receipt?')){ close(); onDelete(receipt.id); }
  }},['Delete Receipt']);
  acts.appendChild(editBtn); acts.appendChild(delBtn);
  body.appendChild(acts);

  card.appendChild(pill); card.appendChild(nav); card.appendChild(body);
  overlay.appendChild(bg); overlay.appendChild(card);
  document.body.appendChild(overlay);
}

/* ═══════════════════════════════════════════════════
   JOB DETAIL VIEW
═══════════════════════════════════════════════════ */
function renderJobDetail(job) {
  var db = dbGet();
  var search = '';

  function getAll() {
    return db.receipts.filter(function(r){return r.jobId===job.id;})
      .sort(function(a,b){return b.date.localeCompare(a.date);});
  }
  function getVisible() {
    var all=getAll();
    if(!search) return all;
    var q=search.toLowerCase();
    return all.filter(function(r){ return r.vendor.toLowerCase().indexOf(q)>-1||r.category.toLowerCase().indexOf(q)>-1; });
  }
  function getTotal(){ return getAll().reduce(function(s,r){return s+r.amount;},0); }

  function saveReceipt(r) {
    // Photo goes to IndexedDB + RAM, never into localStorage
    if (r.image && typeof r.image==='string' && r.image.indexOf('data:')===0){
      IMG[r.id]=r.image; idbPutImg(r.id, r.image);
    }
    var stored = Object.assign({}, r); delete stored.image;
    db = dbGet();
    var ex=db.receipts.find(function(x){return x.id===stored.id;});
    if(ex){ db.receipts=db.receipts.map(function(x){return x.id===stored.id?stored:x;}); }
    else { db.receipts=[stored].concat(db.receipts); }
    if(!dbSave(db)){ alert('Could not save — please use Settings \u2192 Export to back up, then reload the app.'); return; }
    redraw();
  }
  function deleteReceipt(id) {
    db=dbGet(); db.receipts=db.receipts.filter(function(r){return r.id!==id;});
    dbSave(db); delete IMG[id]; idbDelImg(id); redraw();
  }
  function doExport() {
    var all=getAll();
    if(!all.length){alert('No receipts to export.');return;}
    buildPDF(job,all).catch(function(e){alert('Export error: '+e.message);});
  }

  function redraw() {
    db=dbGet();
    var visible=getVisible();
    var total=getTotal();

    var screen=div({className:'screen receipts-screen'});

    // Nav bar
    var backBtn=btn({className:'nav-btn',onClick:function(){renderJobList();}});
    backBtn.appendChild(IC.back(19,'#00AEEF'));
    backBtn.appendChild(span(null,'Reports'));

    var centerNav=div({style:{textAlign:'center',flex:'1'}});
    var jobTitle=div({style:{fontSize:'14px',fontWeight:'600',color:'#fff',overflow:'hidden',whiteSpace:'nowrap',textOverflow:'ellipsis',maxWidth:'170px',margin:'0 auto'}},[job.name]);
    var jobTotal=div({style:{fontSize:'11px',color:'rgba(255,255,255,.48)'}},'Total: '+money(total));
    centerNav.appendChild(jobTitle); centerNav.appendChild(jobTotal);

    var exportBtn=btn({className:'nav-btn',onClick:doExport});
    exportBtn.setAttribute('aria-label','Export report PDF');
    exportBtn.appendChild(IC.dl(22,'#00AEEF'));

    var editBtn=btn({className:'nav-btn',onClick:function(){
      openJobSheet(function(updated){
        var d=dbGet();
        d.jobs=d.jobs.map(function(j){ return j.id===updated.id ? Object.assign({}, j, updated) : j; });
        dbSave(d);
        // re-open the detail with the fresh job so the title/dates update
        var fresh=dbGet().jobs.find(function(j){return j.id===updated.id;}) || updated;
        renderJobDetail(fresh);
      }, job);
    }});
    editBtn.setAttribute('aria-label','Edit report');
    editBtn.appendChild(document.createTextNode('Edit'));
    editBtn.style.fontSize='17px';

    var rightWrap=div({style:{display:'flex',alignItems:'center',gap:'2px'}},[editBtn, exportBtn]);
    screen.appendChild(makeNavBar(backBtn, centerNav, rightWrap));

    // Title row
    var titleRow=div({style:{display:'flex',alignItems:'baseline',justifyContent:'space-between',padding:'14px 16px 0'}});
    titleRow.appendChild(span({className:'fgb-title'},'Receipts'));
    titleRow.appendChild(span({className:'fgb-title-amt'},money(total)));
    var addReceipt=btn({className:'studio-primary',onClick:function(){openReceiptSheet(job.id,null,saveReceipt);}},'Add receipt');
    titleRow.appendChild(addReceipt);
    screen.appendChild(titleRow);

    // Search bar
    var sb=div({className:'searchbar'});
    sb.appendChild(IC.search(16,'rgba(255,255,255,.25)'));
    var si=inp({type:'text',placeholder:'Search receipts or categories',value:search,'aria-label':'Search receipts or categories'});
    si.style.cssText='background:none;border:none;outline:none;color:#fff;font-size:15px;flex:1';
    si.addEventListener('input',function(){ var pos=si.selectionStart; search=si.value; redraw(); var next=_root.querySelector('.searchbar input'); if(next){next.focus();next.setSelectionRange(pos,pos);} });
    sb.appendChild(si);
    screen.appendChild(sb);

    // Receipt list grouped by date
    var list=div({className:'scroll',style:{flex:'1',paddingBottom:'10px'}});

    if(visible.length===0){
      var empty=div({className:'empty',style:{height:'42vh'}});
      empty.appendChild(IC.doc(40,'rgba(255,255,255,.09)'));
      empty.appendChild(div({style:{fontSize:'17px',color:'rgba(255,255,255,.48)',fontWeight:'500',marginTop:'10px'}},[search?'No matching receipts':'No receipts yet']));
      empty.appendChild(div({style:{fontSize:'14px',color:'rgba(255,255,255,.25)'}},[search?'Try a vendor name or category.':'Add labor, travel, or materials to this job.']));
      if(!search)empty.appendChild(btn({className:'studio-primary',onClick:function(){addReceipt.click();}},'Add your first receipt'));
      list.appendChild(empty);
    } else {
      // Group by date
      var groups=[], seen={};
      visible.forEach(function(r){
        if(!seen[r.date]){seen[r.date]=[];groups.push({date:r.date,rows:seen[r.date]});}
        seen[r.date].push(r);
      });
      groups.forEach(function(g){
        var dayTot=g.rows.reduce(function(s,r){return s+r.amount;},0);
        var pill=div({className:'date-pill'});
        var inner=div({className:'date-pill-inner'});
        inner.appendChild(span(null,fmtD(g.date)));
        inner.appendChild(span({style:{color:'rgba(255,255,255,.09)'}},['|']));
        inner.appendChild(span(null,money(dayTot)));
        pill.appendChild(inner); list.appendChild(pill);

        var group=div({className:'receipt-group'});
        g.rows.forEach(function(r,i){
          var row=div({className:'receipt-row'});
          if(i<g.rows.length-1) row.style.borderBottom='0.5px solid rgba(255,255,255,.09)';

          var thumb=div({className:'thumb'});
          if(IMG[r.id]){ var ti=document.createElement('img'); ti.src=IMG[r.id]; ti.alt=''; ti.style.cssText='width:100%;height:100%;object-fit:cover'; thumb.appendChild(ti); }
          else { var dot=div({className:'thumb-wire',style:{background:CAT_DOT[r.category]||'#8A9099'}}); if((CAT_DOT[r.category]||'')==='#F7F7F2') dot.style.boxShadow='inset 0 0 0 1px #9aa0a6'; thumb.appendChild(dot); }
          row.appendChild(thumb);

          var info=div({className:'flex1'});
          info.appendChild(div({style:{fontSize:'15.5px',fontWeight:'600',color:'#fff',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}},[r.vendor]));
          info.appendChild(div({style:{fontSize:'12.5px',color:'rgba(255,255,255,.48)',marginTop:'2px'}},[r.category]));
          row.appendChild(info);

          var right=div({style:{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:'3px',flexShrink:'0'}});
          right.appendChild(span({style:{fontSize:'15.5px',fontWeight:'700',color:'#fff'}},money(r.amount)));
          var badges=div({style:{display:'flex',gap:'4px',alignItems:'center'}});
          if(r.reimbursable) badges.appendChild(IC.check(12,'#30d158'));
          right.appendChild(badges);
          row.appendChild(right);

          row.addEventListener('click',function(){
            openReceiptDetail(r,
              function(rc){ openReceiptSheet(job.id,rc,function(saved){ saveReceipt(saved); }); },
              function(id){ deleteReceipt(id); });
          });
          group.appendChild(row);
        });
        list.appendChild(group);
      });
    }
    screen.appendChild(list);

    // Tab bar
    screen.appendChild(makeTabBar(
      function(){ openReceiptSheet(job.id,null,function(r){ saveReceipt(r); }); },
      doExport
    ));

    _root.innerHTML=''; _root.appendChild(screen);
    // Restore search focus if searching
    if(search){ var si2=screen.querySelector('input[type=text]'); if(si2){si2.focus();si2.setSelectionRange(si2.value.length,si2.value.length);} }
  }

  redraw();
}


/* ═══════════════════════════════════════════════════
   JOB EXPORT & SHARE HELPERS
═══════════════════════════════════════════════════ */

// buildPDFBlob — same as buildPDF but returns a Blob for sharing
function buildPDFBlob(job, receipts) {
  return buildPDF(job, receipts, {blob:true});
}

function shareJobReport(job, receipts) {
  if (!receipts.length) { alert('No receipts in this job yet.'); return; }
  var fileName = 'FanGuys-'+job.name.replace(/[^a-zA-Z0-9-]/g,'-')+'-'+today()+'.pdf';
  buildPDFBlob(job, receipts).then(function(blob) {
    var file = new File([blob], fileName, {type:'application/pdf'});
    // iOS Share Sheet — lets user pick Google Drive, email, AirDrop, etc.
    if (navigator.share && navigator.canShare && navigator.canShare({files:[file]})) {
      navigator.share({
        files: [file]
      }).catch(function(e){
        if (e.name !== 'AbortError') downloadBlob(blob, fileName);
      });
    } else {
      // Fallback: straight download
      downloadBlob(blob, fileName);
    }
  }).catch(function(e){ alert('Error: '+e.message); });
}

function downloadBlob(blob, fileName) {
  var url=URL.createObjectURL(blob);
  var a=document.createElement('a'); a.href=url; a.download=fileName; a.click();
  setTimeout(function(){URL.revokeObjectURL(url);},3000);
}

/* ═══════════════════════════════════════════════════
   COPY TO LEDGER PRO
   Rolls one report's receipts up into the shape Ledger Pro
   expects (Hotel / Airfare / Rental Car / Fuel / Material),
   drops it on the clipboard AND a shared mailbox key so
   Ledger Pro's "Import from Invoice Pro" can pull it in.
═══════════════════════════════════════════════════ */
var FG_BRIDGE_KEY = 'fg_bridge_inv2led';

function buildLedgerJob(job, receipts) {
  receipts = receipts || [];
  if (!receipts.length) return null;

  function f(n){ return (Math.round(n*100)/100).toFixed(2); }

  // Per-category totals (for the breakdown note)
  var byCat = {};
  var total = 0;
  receipts.forEach(function(r){
    var amt = +r.amount || 0;
    var c = r.category || 'Other';
    byCat[c] = (byCat[c]||0) + amt;
    total += amt;
  });
  function cat(name){ return byCat[name] || 0; }

  // The four travel buckets Ledger maps to cleanly
  var hotel  = cat('Lodging / Hotel');
  var air    = cat('Airfare');
  var rental = cat('Vehicle / Rental');
  var fuel   = cat('Fuel & Gas');
  // Labor receipts go into Ledger's LABOR field (not into expenses)
  var labor  = cat('Labor');
  // Material = everything left over (Parts, Materials, Tools, Meals, Parking, Shipping, Other)
  var material = total - hotel - air - rental - fuel - labor;
  if (material < 0) material = 0;
  // Expense subtotal = the five buckets (does NOT include labor)
  var expensesTotal = hotel + air + rental + fuel + material;
  // Invoice = labor + all expenses (your rule)
  var invoiceAmt = labor + expensesTotal;

  // Earliest receipt date drives which year Ledger files it under; fall back to start date
  var dates = receipts.map(function(r){return r.date;}).filter(Boolean).sort();
  var jobDate = dates[0] || job.startDate || '';

  // Split the report name into a job number + customer.
  // e.g. "2026-21 United Cleveland" -> jobNo "2026-21", customer "United Cleveland".
  // If it doesn't start with a number, send no number and use the whole name as customer.
  var rawName = (job.name || '').trim();
  var nameMatch = rawName.match(/^([0-9][0-9\-\/.]*[0-9]|[0-9]+)\s+(.+)$/);
  var jobNo = nameMatch ? nameMatch[1] : '';
  var custName = nameMatch ? nameMatch[2].trim() : rawName;

  // Build a plain-English breakdown so nothing is hidden inside "Material"
  var brk = [];
  Object.keys(byCat).sort().forEach(function(c){ if(byCat[c]>0) brk.push(c+' $'+f(byCat[c])); });
  var noteParts = [];
  if (job.notes && job.notes.trim()) noteParts.push(job.notes.trim());
  if (brk.length) noteParts.push('From Invoice Pro \u2014 ' + brk.join(', '));
  var notes = noteParts.join('  |  ');

  return {
    totals: { invoice: invoiceAmt, labor: labor, expenses: expensesTotal },
    job: {
      srcId: job.id,
      jobNo: jobNo,                 // Ledger uses this as the job number
      customer: custName,           // Ledger brings this in as the customer
      customCustomer: '',
      location: job.location || '',
      jobDate: jobDate,
      jobType: '', installSubtype: '', fanCount: '',
      invoiceAmount: invoiceAmt ? f(invoiceAmt) : '',   // labor + all expenses
      labor:         labor       ? f(labor)      : '',   // Labor receipts -> Ledger Labor field
      totalExpenses: expensesTotal ? f(expensesTotal) : '',  // expenses only (no labor)
      expenses: {
        Hotel:        hotel    ? f(hotel)    : '',
        Airfare:      air      ? f(air)      : '',
        'Rental Car': rental   ? f(rental)   : '',
        Fuel:         fuel     ? f(fuel)     : '',
        Material:     material ? f(material) : ''
      },
      notes: notes
    }
  };
}

function copyJobToLedger(job, receipts) {
  receipts = receipts || [];
  var b = buildLedgerJob(job, receipts);
  if (!b) { alert('This report has no receipts yet, so there is nothing to send to the Ledger.'); return; }
  if (FGB.inLedger(job)) { alert('"' + (job.name || 'This report') + '" is already in the Ledger.'); return; }
  function f(n){ return (Math.round(n*100)/100).toFixed(2); }
  if (!confirm('Send "' + (job.name || 'this report') + '" to the Ledger?\n\nInvoice $' + f(b.totals.invoice) +
      '  =  Labor $' + f(b.totals.labor) + '  +  Expenses $' + f(b.totals.expenses))) return;
  FGB.sendToLedger([b.job]);
}

/* Every report with receipts that isn't in the Ledger yet */
function unsentReports() {
  var db = dbGet(), idx = FGB.ledgerIndex(), out = [];
  (db.jobs || []).forEach(function(job){
    if (FGB.inLedger(job, idx)) return;
    var recs = (db.receipts || []).filter(function(r){ return r.jobId === job.id; });
    var b = buildLedgerJob(job, recs);
    if (b) out.push(b);
  });
  return out;
}
function sendAllUnsent() {
  var list = unsentReports();
  if (!list.length) { alert('Everything is already in the Ledger. Nothing to send.'); return; }
  var total = list.reduce(function(s, b){ return s + b.totals.invoice; }, 0);
  if (!confirm('Send ' + list.length + ' report' + (list.length !== 1 ? 's' : '') + ' to the Ledger?\n\nTotal invoiced: $' +
      total.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + '\n\nReports already in the Ledger are skipped.')) return;
  FGB.sendToLedger(list.map(function(b){ return b.job; }));
}

/* ═══════════════════════════════════════════════════
   ARCHIVE JOB
   The PDF (with every receipt photo in it) is the permanent record.
   Once it is safely saved, the photos don't need to live in the app.
   Text stays forever — it's tiny. Photos are 99% of the bulk.
   PDF ALWAYS comes first. Photos are never purged on assumption.
═══════════════════════════════════════════════════ */
function archiveJob(job, receipts){
  receipts = receipts || [];
  var withPhotos = receipts.filter(function(r){ return IMG[r.id]; });
  var bytes = withPhotos.reduce(function(s,r){ return s + (IMG[r.id]||'').length; }, 0);
  var mb = (bytes/1048576).toFixed(1);

  if (withPhotos.length === 0){
    alert('"'+(job.name||'This report')+'" has no photos stored in the app \u2014 it is already archived.\n\nIts receipt details are still here, and always will be.');
    return;
  }

  if (!window.confirm(
      'ARCHIVE "'+(job.name||'this report')+'"\n\n'+
      'Step 1: save the PDF (it contains all '+withPhotos.length+' receipt photos).\n'+
      'Step 2: remove those photos from the app to free '+mb+' MB.\n\n'+
      'Receipt details \u2014 vendor, amount, date, category \u2014 stay in the app forever.\n\n'+
      'Save the PDF to Files/iCloud when it appears. Continue?')) return;

  buildPDF(job, receipts).then(function(){
    // Give the share/save sheet time to actually happen before we ask.
    setTimeout(function(){
      if (!window.confirm(
          'Did the PDF save successfully?\n\n'+
          'Tap OK ONLY if you saved it to Files/iCloud.\n'+
          'Tapping OK removes '+withPhotos.length+' photos from the app ('+mb+' MB).\n\n'+
          'Tap Cancel to keep the photos for now.')) return;

      withPhotos.forEach(function(r){ delete IMG[r.id]; idbDelImg(r.id); });

      // Mark the job so you can see it's archived
      var d = dbGet();
      d.jobs = d.jobs.map(function(j){
        return j.id===job.id ? Object.assign({}, j, {archivedAt:new Date().toISOString()}) : j;
      });
      dbSave(d);
      renderJobList();
      alert('Archived. Freed '+mb+' MB.\n\nAll receipt details are still here \u2014 only the photos moved out, and they live in the PDF you just saved.');
    }, 1200);
  }).catch(function(e){
    alert('Could not build the PDF, so NOTHING was removed.\n\n'+(e && e.message ? e.message : 'Unknown error'));
  });
}

function openJobMenu(e, job, receipts, onEdit, onDelete) {
  e.stopPropagation();
  // Remove any existing open menus
  var existing = document.querySelector('.dot-menu');
  if (existing) { existing.remove(); return; }

  var menu = div({className:'dot-menu'});

  function menuItem(icon, label, action, danger) {
    var item = div({className:'dot-menu-item'+(danger?' danger':'')});
    item.innerHTML = icon;
    item.appendChild(document.createTextNode(' '+label));
    item.addEventListener('click', function(ev){
      ev.stopPropagation();
      menu.remove();
      action();
    });
    return item;
  }

  menu.appendChild(menuItem('✉️', 'Email Invoice', function(){
    if (!receipts.length) { alert('This report has no receipts yet.'); return; }
    var b = buildLedgerJob(job, receipts);
    var total = money(b ? b.totals.invoice : receipts.reduce(function(s,r){return s+(+r.amount||0);},0));
    FGBDrive.emailInvoice(job, total, function(){ return buildPDF(job, receipts, {blob:true}); });
  }));
  menu.appendChild(menuItem('📁', 'Open Job Folder', function(){ FGBDrive.openFolder(job); }));
  menu.appendChild(menuItem('✏️', 'Edit Report', onEdit));
  menu.appendChild(menuItem('📄', 'Export PDF', function(){
    buildPDF(job, receipts).catch(function(e){ alert('PDF error: '+e.message); });
  }));
  menu.appendChild(menuItem('📤', 'Share / Google Drive', function(){
    shareJobReport(job, receipts);
  }));
  if (FGB.inLedger(job)) {
    menu.appendChild(menuItem('✅', 'In Ledger — View', function(){ location.href='ledger.html'; }));
  } else {
    menu.appendChild(menuItem('📒', 'Send to Ledger', function(){ copyJobToLedger(job, receipts); }));
  }
  menu.appendChild(menuItem('📦', 'Archive Job (free up space)', function(){
    archiveJob(job, receipts);
  }));
  menu.appendChild(menuItem('🗑', 'Delete Report', onDelete, true));

  // Position relative to the button that was tapped
  var btn2 = e.currentTarget;
  btn2.style.position = 'relative';
  btn2.appendChild(menu);

  // Close on tap outside
  setTimeout(function(){
    function closeMenu(ev){
      if(!menu.contains(ev.target)){ menu.remove(); document.removeEventListener('click',closeMenu); }
    }
    document.addEventListener('click', closeMenu);
  }, 50);
}

/* ═══════════════════════════════════════════════════
   JOB LIST VIEW
═══════════════════════════════════════════════════ */
function renderJobList() {
  var db=dbGet();
  var search='';
  var selecting=false, picked={};   // "Email several" mode
  FGBDrive.onEmailed=function(){ selecting=false; picked={}; redraw(); };

  function redraw(){
    db=dbGet();
    var jobs=search
      ?db.jobs.filter(function(j){ var q=search.toLowerCase(); return j.name.toLowerCase().indexOf(q)>-1||(j.location||'').toLowerCase().indexOf(q)>-1; })
      :db.jobs;
    // Job number order, newest first ("2026-41" above "2026-40"). Reports without a number stay on top.
    function jobKey(j){ var no=FGB.jobNoOf(j.name); if(!no) return null; var m=no.match(/^(\d{4})-?(\d+)$/); return m ? (+m[1])*100000+(+m[2]) : parseFloat(no.replace(/[^0-9.]/g,''))||0; }
    jobs=jobs.map(function(j,i){ return {j:j,i:i,k:jobKey(j)}; }).sort(function(a,b){
      if(a.k===null&&b.k===null) return a.i-b.i;
      if(a.k===null) return -1; if(b.k===null) return 1;
      return b.k-a.k || a.i-b.i;
    }).map(function(x){ return x.j; });

    var screen=div({className:'screen reports-screen'});

    // Nav bar
    var logoWrap=div({style:{display:'flex',alignItems:'center',gap:'9px'}});
    logoWrap.appendChild(img({src:'assets/brand-2a40d1ca.png', alt:'Fan Guys', style:{height:'30px',width:'auto',display:'block'}}));
    logoWrap.appendChild(div({className:'fgb-brand'},['Fan Guys Books']));
    var addJobBtn=btn({className:'nav-btn',onClick:function(){
      openJobSheet(function(j){ db=dbGet(); db.jobs=[j].concat(db.jobs); dbSave(db); if(FGBDrive.connected()) FGBDrive.ensureFolder(j).catch(function(){}); redraw(); renderJobDetail(j); });
    }});
    addJobBtn.setAttribute('aria-label','New report');
    addJobBtn.appendChild(IC.plus(20,'#00AEEF'));
    addJobBtn.appendChild(span({className:'primary-label'},'New report'));
    screen.appendChild(makeNavBar(logoWrap,null,addJobBtn));

    // Title
    screen.appendChild(div({style:{padding:'14px 16px 0'}}, [
      el('h1',{className:'fgb-title'},'Reports'),
      div({className:'workspace-description'},'Job reports, receipts, and everything ready to invoice.')
    ]));

    // Search
    var sb=div({className:'searchbar'});
    sb.appendChild(IC.search(16,'rgba(255,255,255,.25)'));
    var si=inp({type:'text',placeholder:'Search reports or locations',value:search,'aria-label':'Search reports or locations'});
    si.style.cssText='background:none;border:none;outline:none;color:#fff;font-size:15px;flex:1';
    si.addEventListener('input',function(){ var pos=si.selectionStart; search=si.value; redraw(); var next=_root.querySelector('.searchbar input'); if(next){next.focus();next.setSelectionRange(pos,pos);} });
    sb.appendChild(si); screen.appendChild(sb);
    var withRecs=db.jobs.filter(function(j){ return db.receipts.some(function(r){ return r.jobId===j.id; }); });
    if(!search && withRecs.length>1){
      var tools=div({className:'fgb-tools'});
      if(selecting){
        tools.appendChild(span({className:'fgb-tools-note'},'Tap the reports to email together'));
      } else {
        var manyBtn=btn({className:'fgb-chip'}); manyBtn.textContent='Email several';
        manyBtn.addEventListener('click',function(){ selecting=true; picked={}; redraw(); });
        tools.appendChild(manyBtn);
      }
      screen.appendChild(tools);
    }

    // Backup reminder — a backup you never take is not a backup
    var dsb=daysSinceBackup();
    if(dsb>=14 && db.jobs.length>0){
      var nag=div({className:'caution-bar',style:{margin:'0 12px 10px',cursor:'pointer'}});
      nag.textContent = dsb>900 ? 'No backup yet. Tap to back up now.'
                                : 'Last backup was '+dsb+' days ago. Tap to back up now.';
      nag.addEventListener('click', function(){ doFullBackup(); });
      screen.appendChild(nag);
    }

    // List
    var list=div({className:'scroll',style:{flex:'1',padding:'0 12px 20px'}});

    if(jobs.length===0&&!search){
      var empty=div({className:'empty',style:{height:'46vh'}});
      empty.appendChild(img({src:'assets/brand-2a40d1ca.png', alt:'Fan Guys', style:{width:'130px',height:'auto',display:'block'}}));
      empty.appendChild(div({style:{fontSize:'17px',fontWeight:'500',color:'rgba(255,255,255,.48)',marginTop:'14px'}},['Your next job starts here']));
      empty.appendChild(div({style:{fontSize:'14px',color:'rgba(255,255,255,.25)'}},['Keep job details and receipts together. Create a report to get started.']));
      empty.appendChild(btn({className:'studio-primary',onClick:function(){addJobBtn.click();}},'Create your first report'));
      list.appendChild(empty);
    }
    if(!jobs.length && search){ list.appendChild(div({className:'studio-no-results',role:'status'},'No reports match your search. Try a customer name or location.')); }

    var ledIdx=FGB.ledgerIndex();
    if(!search && db.jobs.length && !selecting){
      var nowD=new Date(), ym=nowD.toISOString().slice(0,7), yr=String(nowD.getFullYear());
      var mTot=0, yTot=0;
      db.receipts.forEach(function(r){ var a=+r.amount||0; if((r.date||'').slice(0,7)===ym) mTot+=a; if((r.date||'').slice(0,4)===yr) yTot+=a; });
      var avgM=yTot/Math.max(1,nowD.getMonth()+1);
      list.appendChild(FGB.fan({ amount: money(mTot), pace: avgM>0 ? mTot/avgM : 1,
        label: 'Receipt totals this month' }));
    }
    jobs.forEach(function(job){
      var recs=db.receipts.filter(function(r){return r.jobId===job.id;});
      var tot=recs.reduce(function(s,r){return s+r.amount;},0);
      var dates=recs.map(function(r){return r.date;}).sort();
      var dr=dates.length?fmtD(dates[0])+' → '+fmtD(dates[dates.length-1]):(job.startDate?fmtD(job.startDate)+(job.endDate?' → '+fmtD(job.endDate):''):null);

      var inLedger=FGB.inLedger(job, ledIdx);
      var card=div({className:'strip rep-strip'+(inLedger?' sent':'')});
      var handle=div({className:'handle'});
      handle.appendChild(document.createElement('b')).textContent = inLedger ? '\u2713' : '';
      handle.appendChild(document.createElement('small')).textContent = inLedger ? 'In ledger' : 'To send';
      card.appendChild(handle);
      var left=div({className:'sbody'});
      var l1=div({className:'l1'});
      var jno=FGB.jobNoOf(job.name);
      if(jno) left.appendChild(div({className:'jobno'},[jno]));
      l1.appendChild(div({className:'cust'},[jno ? job.name.slice(jno.length).trim() : job.name]));
      l1.appendChild(div({className:'amt'},[money(tot)]));
      left.appendChild(l1);
      var where=[job.location, dr].filter(Boolean).join(' \u00b7 ');
      left.appendChild(div({className:'where'},[(where||'No dates yet')+'  \u00b7  '+recs.length+' receipt'+(recs.length!==1?'s':'')+(job.archivedAt?'  \u00b7  Archived':'')]));
      if(recs.length) left.appendChild(wireTags(recs));
      var srow=div({className:'status-row'});
      var em=FGBDrive.emailedOn(job);
      if(em) srow.appendChild(span({className:'pill-mail'},'Emailed '+new Date(em).toLocaleDateString('en-US',{month:'short',day:'numeric'})));
      if(inLedger){ srow.appendChild(span({className:'pill-in'},'In ledger')); }
      else if(recs.length){
        var sendBtn=btn({className:'pill-send'}); sendBtn.textContent='Send to ledger';
        (function(j,r){ sendBtn.addEventListener('click',function(e){ e.stopPropagation(); copyJobToLedger(j,r); }); })(job,recs);
        srow.appendChild(sendBtn);
      }
      left.appendChild(srow);
      card.appendChild(left);

      var right=div({style:{display:'flex',flexDirection:'column',alignItems:'flex-end',justifyContent:'flex-start',flexShrink:'0',padding:'6px 4px 0 0'}});
      // 3-dot menu button
      var dotBtn=(function(capturedJob, capturedRecs){
        var b=btn({'aria-label':'Actions for '+capturedJob.name,style:{background:'none',border:'none',padding:'6px 4px',position:'relative',lineHeight:'1'}});
        b.innerHTML='<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#5B6168" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="5" r="1.2" fill="rgba(255,255,255,0.45)"/><circle cx="12" cy="12" r="1.2" fill="rgba(255,255,255,0.45)"/><circle cx="12" cy="19" r="1.2" fill="rgba(255,255,255,0.45)"/></svg>';
        b.addEventListener('click', function(e){
          openJobMenu(e, capturedJob, capturedRecs, function(){
            // Edit: open the sheet pre-filled, save changes back onto the same job id
            openJobSheet(function(updated){
              db=dbGet();
              db.jobs=db.jobs.map(function(j){ return j.id===updated.id ? Object.assign({}, j, updated) : j; });
              dbSave(db); redraw();
            }, capturedJob);
          }, function(){
            if(!window.confirm('Delete this job and all its receipts?'))return;
            db=dbGet(); db.jobs=db.jobs.filter(function(j){return j.id!==capturedJob.id;}); db.receipts=db.receipts.filter(function(r){return r.jobId!==capturedJob.id;}); dbSave(db); redraw();
          });
        });
        return b;
      })(job, recs);
      if(selecting){
        var box=span({className:'fgb-check'+(picked[job.id]?' on':'')}); box.setAttribute('aria-hidden','true');
        right.appendChild(box);
        if(!recs.length) card.classList.add('no-pick');
        if(picked[job.id]) card.classList.add('picked');
        card.setAttribute('role','checkbox'); card.setAttribute('aria-checked', picked[job.id]?'true':'false'); card.tabIndex=0;
      } else right.appendChild(dotBtn);
      card.appendChild(right);

      if(!selecting){card.setAttribute('role','button');card.tabIndex=0;card.setAttribute('aria-label','Open report '+job.name);}
      card.addEventListener('keydown',function(e){if(e.target===card&&(e.key==='Enter'||e.key===' ')){e.preventDefault();card.click();}});
      card.addEventListener('click',function(){
        if(selecting){ if(!recs.length) return; if(picked[job.id]) delete picked[job.id]; else picked[job.id]=true; redraw(); return; }
        renderJobDetail(job);
      });
      list.appendChild(card);
    });

    screen.appendChild(list);

    if(selecting){
      var n=Object.keys(picked).length;
      var bar=div({className:'fgb-pickbar'});
      var cancel=btn({className:'fgb-pick-cancel'}); cancel.textContent='Cancel';
      cancel.addEventListener('click',function(){ selecting=false; picked={}; redraw(); });
      var go=btn({className:'fgb-pick-go'}); go.textContent=n ? 'Email '+n+' invoice'+(n!==1?'s':'') : 'Pick reports';
      go.disabled=!n;
      go.addEventListener('click',function(){
        var d2=dbGet();
        var items=d2.jobs.filter(function(j){ return picked[j.id]; }).map(function(j){
          var r=d2.receipts.filter(function(x){ return x.jobId===j.id; });
          return { job:j, makeBlob:function(){ return buildPDF(j, r, {blob:true}); } };
        });
        FGBDrive.emailJobs(items);
      });
      bar.appendChild(cancel); bar.appendChild(go);
      screen.appendChild(bar);
    } else {
    // Tab bar
    screen.appendChild(makeTabBar(function(){
      openJobSheet(function(j){ db=dbGet(); db.jobs=[j].concat(db.jobs); dbSave(db); if(FGBDrive.connected()) FGBDrive.ensureFolder(j).catch(function(){}); redraw(); renderJobDetail(j); });
    }));
    }

    _root.innerHTML=''; _root.appendChild(screen);
    if(search){ var si2=screen.querySelector('input[type=text]'); if(si2){si2.focus();si2.setSelectionRange(si2.value.length,si2.value.length);} }
  }

  redraw();
}

/* ═══════════════════════════════════════════════════
   PIN LOCK
═══════════════════════════════════════════════════ */
var PIN_CODE = FGB.pin();
var PIN_KEY  = 'fg-unlocked';

function isUnlocked() {
  // Stays unlocked for 8 hours
  var ts = parseInt(localStorage.getItem(PIN_KEY)||'0');
  return (Date.now() - ts) < 8 * 60 * 60 * 1000;
}

function markUnlocked() {
  localStorage.setItem(PIN_KEY, Date.now().toString());
}

function showPIN(onSuccess) {
  var entered = '';
  var shake = false;

  var screen = div({className:'pin-screen'});

  // Logo
  var logoWrap = div({className:'pin-logo'});
  logoWrap.appendChild(makeFan(64, 6));
  logoWrap.appendChild(div({className:'pin-title'}, ['Fan Guys Books']));
  logoWrap.appendChild(div({className:'pin-sub'}, ['Invoices and ledger']));
  screen.appendChild(logoWrap);

  // Dots
  var dotsWrap = div({className:'pin-dots'});
  var dots = [0,1,2,3].map(function() {
    var d = div({className:'pin-dot'});
    dotsWrap.appendChild(d);
    return d;
  });
  screen.appendChild(dotsWrap);

  // Label
  var label = div({className:'pin-label'}, ['Enter Passcode']);
  screen.appendChild(label);

  function updateDots() {
    dots.forEach(function(d, i) {
      d.className = 'pin-dot' + (i < entered.length ? ' filled' : '');
    });
  }

  function doError() {
    dots.forEach(function(d){ d.className='pin-dot error'; });
    label.textContent = 'Incorrect Passcode';
    label.style.color = '#ff453a';
    setTimeout(function(){
      entered = '';
      updateDots();
      label.textContent = 'Enter Passcode';
      label.style.color = '';
    }, 1000);
  }

  function pressKey(k) {
    if (shake) return;
    if (k === 'del') {
      entered = entered.slice(0, -1);
      updateDots();
      return;
    }
    if (entered.length >= 4) return;
    entered += k;
    updateDots();
    if (entered.length === 4) {
      if (entered === PIN_CODE) {
        markUnlocked();
        screen.style.opacity = '0';
        screen.style.transition = 'opacity .3s ease';
        setTimeout(function(){ screen.remove(); onSuccess(); }, 300);
      } else {
        shake = true;
        doError();
        setTimeout(function(){ shake = false; }, 1100);
      }
    }
  }

  // Keypad  1-9, empty, 0, del
  var pad = div({className:'pin-pad'});
  ['1','2','3','4','5','6','7','8','9','','0','del'].forEach(function(k) {
    var b = btn({className:'pin-key' + (k===''?' empty':k==='del'?' del':'')});
    b.textContent = k === 'del' ? '⌫' : k;
    if (k !== '') b.addEventListener('click', function(){ pressKey(k); });
    pad.appendChild(b);
  });
  screen.appendChild(pad);

  document.body.appendChild(screen);
}

/* ═══════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════ */
requestPersistence();
initImages().then(function(){
  showSplash(function(){
    if (isUnlocked()) {
      renderJobList();
    } else {
      showPIN(function(){ renderJobList(); });
    }
  });
});
window.FGBInvoices = { dbGet: dbGet, send: copyJobToLedger, unsent: unsentReports, sendAll: sendAllUnsent };
window.openSettings = openSettings;
})();

