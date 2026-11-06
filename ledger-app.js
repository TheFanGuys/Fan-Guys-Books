
var _ALL_DATA_B64 = '';  // Fan Guys Books: no data is ever stored in the code
var SEED = {};
try {
  var _allData = _ALL_DATA_B64 ? JSON.parse(atob(_ALL_DATA_B64)) : {};
  ['2024','2025','2026'].forEach(function(yr) {
    if (_allData[yr]) SEED[parseInt(yr)] = _allData[yr];
  });
} catch(e) { console.error('Data load failed', e); }

var DEFAULT_CUSTS = ['Wesco','Thriftbooks','United Airlines','Saia Trucking','Medline'];
var EXP_CATS = ['Hotel','Airfare','Rental Car','Fuel','Material'];
var currentYear = new Date().getFullYear();
var jobs = [];
var customers = [];
var allLocations = [];
var editingId = null;
var expandAll = false;

/* ============ PIN LOCK ============ */
var APP_PIN = (function(){ try { return FGB.pin(); } catch(e){ return '7264'; } })();
var pinEntry = '';
function pinPress(d){
  if(pinEntry.length >= 4) return;
  pinEntry += d;
  updatePinDots();
  if(pinEntry.length === 4){
    setTimeout(checkPin, 120);
  }
}
function pinDelete(){
  pinEntry = pinEntry.slice(0,-1);
  updatePinDots();
}
function updatePinDots(){
  for(var i=0;i<4;i++){
    var dot = document.getElementById('dot-'+i);
    if(dot) dot.className = 'lock-dot' + (i < pinEntry.length ? ' filled' : '');
  }
}
function checkPin(){
  if(pinEntry === APP_PIN){
    try { sessionStorage.setItem('fg_unlocked','1'); } catch(e){}
    FGB.markUnlocked();
    unlockApp();
  } else {
    var err = document.getElementById('lock-err');
    err.textContent = 'Wrong passcode. Try again.';
    err.classList.add('shake');
    setTimeout(function(){ err.classList.remove('shake'); }, 400);
    pinEntry = '';
    updatePinDots();
  }
}
function unlockApp(){
  document.getElementById('lock-screen').style.display = 'none';
  document.getElementById('app-wrap').style.display = '';
  initApp();
}

function SK(y){ return 'fg_j_' + y; }

/* Guarded write. Returns true on success, false if storage refused it.
   Never let a save fail silently — that is how records disappear. */
function safeSet(key, val){
  try { localStorage.setItem(key, val); return true; }
  catch(e){
    console.error('Save failed', key, e);
    return false;
  }
}
function saveFailed(){
  alert('COULD NOT SAVE\n\nYour device refused to store the change, so it was NOT saved.\n\nOpen \u2630 \u2192 Backup right away to protect what you have, then reload the app.');
}

/* Jobs come from storage only. An empty year stays empty — deletions stick. */
function loadJobs(y) {
  try {
    var s = localStorage.getItem(SK(y));
    if (s !== null) { var p = JSON.parse(s); if (Array.isArray(p)) return p; }
  } catch(e){}
  return [];
}

/* The starter data is imported ONCE, then never again. After this runs, the
   copy baked into the app file is dead weight and can never overwrite you. */
var SEED_FLAG = 'fg_seeded_v1';
function runSeedOnce() {
  try {
    if (localStorage.getItem(SEED_FLAG)) return;            // already imported
    Object.keys(SEED).forEach(function(k) {
      var y = parseInt(k), key = SK(y), existing = null;
      try { existing = localStorage.getItem(key); } catch(e){}
      // only fill a year that has never been written to
      if (existing === null && SEED[y] && SEED[y].length) {
        safeSet(key, JSON.stringify(SEED[y]));
      }
    });
    localStorage.setItem(SEED_FLAG, new Date().toISOString());
  } catch(e){}
}

function saveJobs(){
  if(!safeSet(SK(currentYear), JSON.stringify(jobs))) { saveFailed(); return false; }
  return true;
}
function loadCustomers(){
  try{ var s=localStorage.getItem('fg_c'); return s ? JSON.parse(s) : DEFAULT_CUSTS.slice(); }
  catch(e){ return DEFAULT_CUSTS.slice(); }
}
function saveCustomers(){ if(!safeSet('fg_c', JSON.stringify(customers))) saveFailed(); }
function refreshLocations(){
  var s = {};
  yearRange().forEach(function(y){
    try{ JSON.parse(localStorage.getItem(SK(y))||'[]').forEach(function(j){ if(j.location) s[j.location]=1; }); }catch(e){}
  });
  allLocations = Object.keys(s).sort();
}

function usd(v){ return (parseFloat(v)||0).toLocaleString('en-US',{style:'currency',currency:'USD'}); }
function n(v){ return parseFloat(v)||0; }
function csvEsc(v){ return '"'+String(v).replace(/"/g,'""')+'"'; }
function nextId(){
  // Highest existing number for this year + 1 (so it never reuses or collides,
  // even after deletes or after importing out-of-order numbers from Invoice Pro)
  var maxN=0;
  jobs.forEach(function(j){
    if(j.year!==currentYear) return;
    var m=String(j.id||'').match(/-(\d+)\b/);
    if(m){ var nn=parseInt(m[1],10); if(nn>maxN) maxN=nn; }
  });
  var seq=maxN+1, cand=currentYear+'-'+seq;
  while(jobs.some(function(j){ return j.id===cand; })){ seq++; cand=currentYear+'-'+seq; }
  return cand;
}
function fmtDate(d, long){
  if(!d) return '';
  var dt = new Date(d+'T12:00:00');
  if(long) return dt.toLocaleDateString('en-US',{weekday:'short',month:'long',day:'numeric',year:'numeric'});
  return dt.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'});
}
function h(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

/* Ask iOS to keep this data. Without it, storage is "best-effort" and can be
   evicted after ~7 days of not opening the app. With it, we're excluded. */
function requestPersistence(){
  try{
    if (navigator.storage && navigator.storage.persist){
      navigator.storage.persisted().then(function(already){
        if (!already) navigator.storage.persist();
      }).catch(function(){});
    }
  }catch(e){}
}

/* Years are worked out at runtime, so this never hits a cliff.
   Range = earliest year that has data (or 2024) .. next year. */
var FIRST_YEAR = 2024;
function yearRange(){
  var lo = FIRST_YEAR, hi = new Date().getFullYear() + 1, found = [];
  for (var i = 0; i < localStorage.length; i++){
    var k = localStorage.key(i);
    if (k && /^fg_j_(\d{4})$/.test(k)){
      var y = parseInt(k.slice(5), 10);
      try {
        var v = JSON.parse(localStorage.getItem(k) || '[]');
        if (Array.isArray(v) && v.length) found.push(y);
      } catch(e){}
    }
  }
  found.forEach(function(y){ if (y < lo) lo = y; if (y > hi) hi = y; });
  var out = [];
  for (var y = lo; y <= hi; y++) out.push(y);
  return out;
}
function buildYearOptions(){
  var sel = document.getElementById('year-sel');
  if (!sel) return;
  var years = yearRange();
  if (years.indexOf(currentYear) < 0) currentYear = years[years.length-1];
  sel.innerHTML = years.map(function(y){
    return '<option value="'+y+'"'+(y===currentYear?' selected':'')+'>'+y+'</option>';
  }).join('');
}

function initApp(){
  requestPersistence();
  runSeedOnce();
  buildYearOptions();
  customers = loadCustomers();
  jobs = loadJobs(currentYear);
  refreshLocations();
  render();
  checkBackupNag();
  if (/[?&]import=1/.test(location.search)) {
    try { history.replaceState(null, '', 'ledger.html'); } catch(e){}
    setTimeout(importFromInvoice, 50);
  }
}

function changeYear(){
  currentYear = parseInt(document.getElementById('year-sel').value);
  jobs = loadJobs(currentYear);
  refreshLocations();
  render();
}

function switchTab(t){
  document.getElementById('tab-jobs').className = 'tab' + (t==='jobs'?' active':'');
  document.getElementById('tab-summary').className = 'tab' + (t==='summary'?' active':'');
  document.getElementById('jobs-tab').style.display = t==='jobs'?'':'none';
  document.getElementById('summary-tab').style.display = t==='summary'?'':'none';
  if(t==='summary') renderSummary();
}

function fanSVG(size){
  return '<svg width="'+size+'" height="'+size+'" viewBox="0 0 48 48"><circle cx="24" cy="24" r="23" fill="#52a0ff" opacity=".12"/><circle cx="24" cy="24" r="23" fill="none" stroke="#52a0ff" stroke-width="1.5"/><circle cx="24" cy="24" r="3.8" fill="#52a0ff"/><path d="M24 20C24 11.5 31.5 8.5 31.5 16 31.5 20 28 21.2 24 20Z" fill="#52a0ff"/><path d="M24 28C24 36.5 16.5 39.5 16.5 32 16.5 28 20 26.8 24 28Z" fill="#52a0ff"/><path d="M20 24C11.5 24 8.5 16.5 16 16.5 20 16.5 21.2 20 20 24Z" fill="#52a0ff"/><path d="M28 24C36.5 24 39.5 31.5 32 31.5 28 31.5 26.8 28 28 24Z" fill="#52a0ff"/></svg>';
}

function render(){
  document.getElementById('job-count').textContent = jobs.length;
  var list = document.getElementById('jobs-list');
  var tBar = document.getElementById('totals-bar');
  var expBtn = document.getElementById('expand-btn');

  if(jobs.length === 0){
    list.innerHTML = '<div class="empty"><img src="assets/brand-2a40d1ca.png" alt="" style="width:100px;height:auto;margin:0 auto;display:block">'+'<div class="empty-title">NO JOBS FOR '+currentYear+'</div><div class="empty-sub">Tap <b style="color:var(--acc)">+ New Job</b> to get started.</div></div>';
    tBar.style.display = 'none';
    expBtn.style.display = 'none';
    return;
  }
  expBtn.style.display = '';
  expBtn.innerHTML = expandAll ? '&#8863; Collapse' : '&#8862; Expand All';
  list.innerHTML = jobs.map(function(j){ return renderCard(j); }).join('');

  var tI=0,tL=0,tE=0;
  jobs.forEach(function(j){ tI+=n(j.invoiceAmount); tL+=n(j.labor); tE+=n(j.totalExpenses); });
  tBar.style.display = '';
  document.getElementById('totals-label').textContent = currentYear+' TOTALS \u00b7 '+jobs.length+' JOBS';
  document.getElementById('tot-inv').textContent = usd(tI);
  document.getElementById('tot-lab').textContent = usd(tL);
  document.getElementById('tot-exp').textContent = usd(tE);
}

function renderCard(j){
  var nm = j.customer==='Custom...' ? j.customCustomer : j.customer;
  var inv=n(j.invoiceAmount), lab=n(j.labor), exp=n(j.totalExpenses);
  var bal = Math.abs(lab+exp-inv)<0.01 && inv>0;
  var ds = fmtDate(j.jobDate, false);
  var typeStr = [j.jobType, j.installSubtype, j.fanCount?j.fanCount+' fans':null].filter(Boolean).join(' \u00b7 ');
  var expItems = EXP_CATS.filter(function(c){ return n(j.expenses[c])>0; }).map(function(c){
    return '<div class="exp-chip"><span style="color:var(--mid)">'+c+': </span><span style="color:var(--tx);font-weight:600">'+usd(j.expenses[c])+'</span></div>';
  }).join('');
  var balBox = inv>0 ? '<div class="bal-box '+(bal?'bal-ok':'bal-warn')+'"><span style="color:var(--mid);font-size:12px"><b style="color:var(--tx)">Labor+Exp=</b> '+usd(lab+exp)+' \u00b7 <b style="color:var(--tx)">Invoice=</b> '+usd(inv)+'</span><span class="chip '+(bal?'chip-gr':'chip-am')+'">'+(bal?'\u2713 BALANCED':'\u26a0 OFF '+usd(Math.abs(lab+exp-inv)))+'</span></div>' : '';
  var open = expandAll;
  var id = j.id;
  return '<div class="job-card'+(open?' open':'')+'" id="card-'+h(id)+'">' +
    '<div class="job-row" onclick="toggleCard(\''+h(id)+'\')">' +
      '<span class="job-chevron'+(open?' open':'')+'">&#9658;</span>' +
      '<div class="job-id">'+h(id)+'</div>' +
      '<div class="job-meta"><div class="job-name">'+(nm?h(nm):'&#8212;')+'</div><div class="job-loc">'+(j.location?h(j.location):'&#8212;')+(ds?' \u00b7 '+ds:'')+'</div></div>' +
      '<div class="job-right"><div class="job-inv">'+usd(j.invoiceAmount)+'</div><div class="job-status">'+(inv>0?(bal?'<span style="color:var(--gr)">\u2713 ok</span>':'<span style="color:var(--am)">\u26a0 check</span>'):'<span style="color:var(--dim)">&#8212;</span>')+'</div></div>' +
    '</div>' +
    '<div class="job-detail" id="detail-'+h(id)+'" style="display:'+(open?'flex':'none')+'">' +
      ((typeStr||j.jobDate)?'<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">'+(j.jobDate?'<span style="font-size:12px;color:var(--mid)">\ud83d\udcc5 '+fmtDate(j.jobDate,true)+'</span>':'')+(typeStr?'<span class="chip chip-blue">'+h(typeStr)+'</span>':'')+'</div>':'') +
      '<div class="detail-grid">' +
        '<div class="detail-box"><div class="detail-lbl">Invoice</div><div class="detail-val accent">'+usd(j.invoiceAmount)+'</div></div>' +
        '<div class="detail-box"><div class="detail-lbl">Labor</div><div class="detail-val">'+usd(j.labor)+'</div></div>' +
        '<div class="detail-box"><div class="detail-lbl">Expenses</div><div class="detail-val">'+usd(j.totalExpenses)+'</div></div>' +
      '</div>' +
      balBox +
      (expItems?'<div><div style="font-size:9px;text-transform:uppercase;letter-spacing:2px;color:var(--dim);margin-bottom:6px">Expense Breakdown</div><div class="exp-row">'+expItems+'</div></div>':'') +
      (j.notes?'<div style="font-size:12px;color:var(--mid);font-style:italic;padding:7px 11px;background:var(--s3);border-radius:8px">\ud83d\udcdd '+h(j.notes)+'</div>':'') +
      '<div class="row-actions"><button onclick="openForm(\''+h(id)+'\')">&#9999; EDIT</button><button class="del-btn" onclick="deleteJob(\''+h(id)+'\')">&#10005;</button></div>' +
    '</div></div>';
}

function toggleCard(id){
  var card=document.getElementById('card-'+id);
  var detail=document.getElementById('detail-'+id);
  var chev=card.querySelector('.job-chevron');
  var showing = detail.style.display!=='none';
  detail.style.display = showing?'none':'flex';
  card.classList.toggle('open',!showing);
  chev.classList.toggle('open',!showing);
}
function toggleExpand(){ expandAll=!expandAll; render(); }

function renderSummary(){
  var tI=0,tL=0,tE=0;
  jobs.forEach(function(j){ tI+=n(j.invoiceAmount); tL+=n(j.labor); tE+=n(j.totalExpenses); });
  var byC={};
  EXP_CATS.forEach(function(c){ byC[c]=jobs.reduce(function(s,j){return s+n(j.expenses[c]);},0); });
  document.getElementById('s-jobs').textContent=jobs.length;
  document.getElementById('s-inv').textContent=usd(tI);
  document.getElementById('s-lab').textContent=usd(tL);
  document.getElementById('s-exp').textContent=usd(tE);
  document.getElementById('s-exp-hdr').textContent='Expense Breakdown \u2014 '+currentYear;
  document.getElementById('s-table-hdr').textContent='All Jobs \u2014 '+currentYear;
  document.getElementById('s-exp-grid').innerHTML=EXP_CATS.map(function(c){
    return '<div class="exp-tile"><div class="exp-tile-val">'+usd(byC[c])+'</div><div class="exp-tile-lbl">'+c+'</div></div>';
  }).join('');
  var rows=jobs.map(function(j,i){
    var inv2=n(j.invoiceAmount),ok2=Math.abs((n(j.labor)+n(j.totalExpenses))-inv2)<.01&&inv2>0;
    var nm=j.customer==='Custom...'?j.customCustomer:j.customer;
    var dt=j.jobDate?new Date(j.jobDate+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}):'&#8212;';
    return '<tr style="background:'+(i%2===0?'var(--s2)':'var(--s1)')+'"><td style="font-weight:900;color:var(--acc);font-size:14px">'+h(j.id)+'</td><td style="color:var(--mid);font-size:12px;white-space:nowrap">'+dt+'</td><td style="font-weight:600;color:var(--tx)">'+h(nm||'')+'</td><td style="color:var(--mid);font-size:12px">'+h(j.location||'')+'</td><td style="font-weight:800;color:var(--tx);font-size:14px">'+usd(j.invoiceAmount)+'</td><td style="color:var(--mid)">'+usd(j.labor)+'</td><td style="color:var(--mid)">'+usd(j.totalExpenses)+'</td><td>'+(ok2?'<span class="chip chip-gr">\u2713 OK</span>':inv2>0?'<span class="chip chip-am">\u26a0</span>':'<span style="color:var(--dim)">&#8212;</span>')+'</td></tr>';
  }).join('');
  var totRow='<tr style="background:var(--s3);border-top:2px solid var(--bd2)"><td colspan="4" style="padding:10px 12px;font-size:9px;font-weight:900;letter-spacing:3px;text-transform:uppercase;color:var(--mid)">Year Totals</td><td style="padding:10px 12px;font-weight:900;font-size:15px;color:var(--acc)">'+usd(tI)+'</td><td style="padding:10px 12px;font-weight:700;color:var(--tx)">'+usd(tL)+'</td><td style="padding:10px 12px;font-weight:700;color:var(--tx)">'+usd(tE)+'</td><td></td></tr>';
  document.getElementById('s-table').innerHTML='<thead><tr>'+['Job #','Date','Customer','Location','Invoice','Labor','Expenses','Status'].map(function(x){return '<th>'+x+'</th>';}).join('')+'</tr></thead><tbody>'+rows+'</tbody><tfoot>'+totRow+'</tfoot>';

  /* Monthly breakdown - grouped by Job Date */
  document.getElementById('s-month-hdr').textContent='Monthly Breakdown \u2014 '+currentYear;
  var months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var monthly=months.map(function(){return {inv:0,lab:0,exp:0,count:0};});
  jobs.forEach(function(j){
    if(!j.jobDate) return;
    var mo=new Date(j.jobDate+'T12:00:00').getMonth();
    if(mo>=0&&mo<12){
      monthly[mo].inv+=n(j.invoiceAmount);
      monthly[mo].lab+=n(j.labor);
      monthly[mo].exp+=n(j.totalExpenses);
      monthly[mo].count++;
    }
  });
  var mRows=months.map(function(mn,i){
    var m=monthly[i];
    if(m.count===0) return '';
    return '<tr style="background:'+(i%2===0?'var(--s2)':'var(--s1)')+'"><td style="color:var(--tx);font-weight:700">'+mn+'</td><td style="color:var(--mid);font-size:11px">'+m.count+' job'+(m.count!==1?'s':'')+'</td><td style="color:var(--acc);font-weight:800">'+usd(m.inv)+'</td><td style="color:var(--mid)">'+usd(m.lab)+'</td><td style="color:var(--mid)">'+usd(m.exp)+'</td></tr>';
  }).filter(Boolean).join('');
  var mTot='<tr style="background:var(--s3);border-top:2px solid var(--bd2)"><td colspan="2" style="padding:10px 12px;font-size:9px;font-weight:900;letter-spacing:3px;text-transform:uppercase;color:var(--mid)">Year Totals</td><td style="padding:10px 12px;font-weight:900;font-size:15px;color:var(--acc)">'+usd(tI)+'</td><td style="padding:10px 12px;font-weight:700;color:var(--tx)">'+usd(tL)+'</td><td style="padding:10px 12px;font-weight:700;color:var(--tx)">'+usd(tE)+'</td></tr>';
  document.getElementById('s-month-table').innerHTML='<thead><tr>'+['Month','Jobs','Invoice','Labor','Expenses'].map(function(x){return '<th>'+x+'</th>';}).join('')+'</tr></thead><tbody>'+(mRows||'<tr><td colspan="5" style="padding:16px;text-align:center;color:var(--dim)">No jobs with dates entered for '+currentYear+'</td></tr>')+'</tbody><tfoot>'+mTot+'</tfoot>';
}

function populateCustomerSelect(){
  var sel=document.getElementById('f-customer');
  sel.innerHTML='<option value="">\u2014 Select \u2014</option>'+
    customers.map(function(c){return '<option value="'+h(c)+'">'+h(c)+'</option>';}).join('')+
    '<option value="Custom...">Custom (type below)...</option>';
}

function openForm(id){
  editingId=id;
  resetReceipts();
  populateCustomerSelect();
  var j=id?jobs.find(function(x){return x.id===id;}):null;
  document.getElementById('form-mode-lbl').textContent=id?'Edit Job':'New Job';
  document.getElementById('form-job-id').textContent=id||nextId();
  document.getElementById('save-btn').textContent=id?'\ud83d\udcbe  Update Job':'\u2795  Save Job';
  document.getElementById('f-customer').value=j&&j.customer?j.customer:'';
  document.getElementById('f-custom').value=j&&j.customCustomer?j.customCustomer:'';
  document.getElementById('f-location').value=j&&j.location?j.location:'';
  document.getElementById('f-date').value=j&&j.jobDate?j.jobDate:'';
  document.getElementById('f-type').value=j&&j.jobType?j.jobType:'';
  document.getElementById('f-subtype').value=j&&j.installSubtype?j.installSubtype:'';
  document.getElementById('f-fans').value=j&&j.fanCount?j.fanCount:'';
  document.getElementById('f-invoice').value=j&&j.invoiceAmount?j.invoiceAmount:'';
  document.getElementById('f-labor').value=j&&j.labor?j.labor:'';
  document.getElementById('f-totexp').value=j&&j.totalExpenses?j.totalExpenses:'';
  document.getElementById('f-hotel').value=j&&j.expenses&&j.expenses.Hotel?j.expenses.Hotel:'';
  document.getElementById('f-airfare').value=j&&j.expenses&&j.expenses.Airfare?j.expenses.Airfare:'';
  document.getElementById('f-rental').value=j&&j.expenses&&j.expenses['Rental Car']?j.expenses['Rental Car']:'';
  document.getElementById('f-fuel').value=j&&j.expenses&&j.expenses.Fuel?j.expenses.Fuel:'';
  document.getElementById('f-material').value=j&&j.expenses&&j.expenses.Material?j.expenses.Material:'';
  document.getElementById('f-notes').value=j&&j.notes?j.notes:'';
  onCustomerChange(); onTypeChange(); onSubtypeChange(); updateBal(); updateExpBal();
  var hasInv=n(document.getElementById('f-invoice').value)>0;
  document.getElementById('auto-exp-note').style.display=hasInv?'':'none';
  document.getElementById('form-overlay').style.display='';
  document.body.style.overflow='hidden';
}
function closeForm(){
  document.getElementById('form-overlay').style.display='none';
  document.getElementById('ac-list').classList.remove('show');
  document.body.style.overflow='';
}
function onCustomerChange(){
  var v=document.getElementById('f-customer').value;
  var isCust=v==='Custom...';
  document.getElementById('f-custom-wrap').style.display=isCust?'':'none';
  document.getElementById('f-note-info').style.display=isCust?'':'none';
}
function onTypeChange(){
  var v=document.getElementById('f-type').value;
  document.getElementById('f-sub-wrap').style.display=v==='Install'?'':'none';
  if(v!=='Install'){document.getElementById('f-subtype').value='';document.getElementById('f-fans-wrap').style.display='none';}
}
function onSubtypeChange(){
  document.getElementById('f-fans-wrap').style.display=document.getElementById('f-subtype').value==='Turnkey Mechanical'?'':'none';
}
function onLocInput(){
  var v=document.getElementById('f-location').value;
  var list=document.getElementById('ac-list');
  if(v.length<1){list.classList.remove('show');return;}
  var q=v.toLowerCase();
  var hits=allLocations.filter(function(l){return l.toLowerCase().indexOf(q)>=0&&l!==v;}).slice(0,7);
  if(!hits.length){list.classList.remove('show');return;}
  list.innerHTML=hits.map(function(loc){return '<div class="ac-item" onmousedown="pickLoc(this)">\ud83d\udccd '+h(loc)+'</div>';}).join('');
  list.classList.add('show');
}
function pickLoc(el){
  var txt=el.textContent.replace(/^\S+\s/,'');
  document.getElementById('f-location').value=txt;
  document.getElementById('ac-list').classList.remove('show');
}
document.addEventListener('click',function(e){if(!e.target.closest('.ac-wrap')){var ac=document.getElementById('ac-list');if(ac)ac.classList.remove('show');}});

function autoCalcExp(){
  var inv=n(document.getElementById('f-invoice').value);
  var lab=n(document.getElementById('f-labor').value);
  if(inv>0&&lab>=0){
    var autoExp=Math.max(0,inv-lab);
    document.getElementById('f-totexp').value=autoExp.toFixed(2);
    document.getElementById('auto-exp-note').style.display='';
  } else {
    document.getElementById('auto-exp-note').style.display='none';
  }
  updateBal();
  updateExpBal();
}
function updateBal(){
  var inv=n(document.getElementById('f-invoice').value);
  var lab=n(document.getElementById('f-labor').value);
  var exp=n(document.getElementById('f-totexp').value);
  var ok=Math.abs(lab+exp-inv)<.01&&inv>0;
  var box=document.getElementById('bal-fin');
  box.className='bal-box '+(ok?'bal-ok':'bal-warn');
  document.getElementById('bal-fin-txt').innerHTML='<b style="color:var(--tx)">Labor+Exp=</b> '+usd(lab+exp)+' \u00b7 <b style="color:var(--tx)">Invoice=</b> '+usd(inv)+(inv>0?' &nbsp;<span class="chip '+(ok?'chip-gr':'chip-am')+'">'+(ok?'\u2713 BALANCED':'\u26a0 OFF '+usd(Math.abs(lab+exp-inv)))+'</span>':'');
}
function catTotal(cat){
  // true value for a category = sum of banked receipts + whatever is currently typed in the box
  var banked = receipts[cat] ? receipts[cat].reduce(function(s,x){ return s+x; }, 0) : 0;
  return banked + n(document.getElementById(RCPT_INPUT[cat]).value);
}
function catSaveVal(cat){
  // What gets saved: if no banked receipts, keep the box text as-is (blank stays blank).
  // If receipts were banked, save the combined total as a fixed 2-decimal string.
  var banked = receipts[cat] ? receipts[cat].length : 0;
  if(banked===0){ return document.getElementById(RCPT_INPUT[cat]).value; }
  return catTotal(cat).toFixed(2);
}
function updateExpBal(){
  var cats=catTotal('hotel')+catTotal('airfare')+catTotal('rental')+catTotal('fuel')+catTotal('material');
  var tot=n(document.getElementById('f-totexp').value);
  var ok=Math.abs(cats-tot)<.01&&tot>0;
  var box=document.getElementById('bal-exp');
  box.className='bal-box '+(ok?'bal-ok':'bal-warn');
  document.getElementById('bal-exp-txt').innerHTML='<b style="color:var(--tx)">Categories=</b> '+usd(cats)+' \u00b7 <b style="color:var(--tx)">Total Exp=</b> '+usd(tot)+(tot>0?' &nbsp;<span class="chip '+(ok?'chip-gr':'chip-am')+'">'+(ok?'\u2713 BALANCED':'\u26a0 OFF '+usd(Math.abs(cats-tot)))+'</span>':'');
}

/* ===== Receipt stacking: type an amount, tap +, it banks it and clears for the next ===== */
var receipts = { hotel:[], airfare:[], rental:[], fuel:[], material:[] };
var RCPT_INPUT = { hotel:'f-hotel', airfare:'f-airfare', rental:'f-rental', fuel:'f-fuel', material:'f-material' };
function resetReceipts(){
  receipts = { hotel:[], airfare:[], rental:[], fuel:[], material:[] };
  Object.keys(receipts).forEach(renderTally);
}
function addReceipt(cat){
  var inp = document.getElementById(RCPT_INPUT[cat]);
  var val = n(inp.value);
  if(val<=0){ inp.focus(); return; }
  receipts[cat].push(val);
  renderTally(cat);
  // Blank the box for the next receipt; the running total lives in the tally + is stored on save.
  inp.value = '';
  var total = receipts[cat].reduce(function(s,x){ return s+x; }, 0);
  inp.placeholder = total.toFixed(2);
  inp.focus();
  updateExpBal();
}
function renderTally(cat){
  var el = document.getElementById('tally-'+cat);
  if(!el) return;
  var arr = receipts[cat];
  if(arr.length===0){ el.innerHTML=''; return; }
  var total = arr.reduce(function(s,x){ return s+x; }, 0);
  var list = arr.map(function(x){ return usd(x); }).join(' + ');
  el.innerHTML = '<span>\u2211 '+arr.length+' receipt'+(arr.length!==1?'s':'')+' = <b>'+usd(total)+'</b></span>'+
                 '<span class="rcpt-undo" onclick="undoReceipt(\''+cat+'\')">undo</span>'+
                 '<span style="color:var(--dim)">'+list+'</span>';
}
function undoReceipt(cat){
  if(receipts[cat].length===0) return;
  receipts[cat].pop();
  var inp = document.getElementById(RCPT_INPUT[cat]);
  var total = receipts[cat].reduce(function(s,x){ return s+x; }, 0);
  inp.placeholder = receipts[cat].length===0 ? '0.00' : total.toFixed(2);
  renderTally(cat);
  updateExpBal();
}
function saveJob(){
  var cust=document.getElementById('f-customer').value;
  var custName=document.getElementById('f-custom').value.trim();
  if(!cust){alert('Please select a customer.');return;}
  if(cust==='Custom...'&&!custName){alert('Please enter the customer name.');return;}
  if(cust==='Custom...'&&custName&&customers.indexOf(custName)<0){customers.push(custName);saveCustomers();}
  var job={
    id:editingId||nextId(), year:currentYear,
    customer:cust, customCustomer:custName,
    location:document.getElementById('f-location').value,
    jobDate:document.getElementById('f-date').value,
    jobType:document.getElementById('f-type').value,
    installSubtype:document.getElementById('f-subtype').value,
    fanCount:document.getElementById('f-fans').value,
    invoiceAmount:document.getElementById('f-invoice').value,
    labor:document.getElementById('f-labor').value,
    totalExpenses:document.getElementById('f-totexp').value,
    expenses:{
      Hotel:catSaveVal('hotel'),
      Airfare:catSaveVal('airfare'),
      'Rental Car':catSaveVal('rental'),
      Fuel:catSaveVal('fuel'),
      Material:catSaveVal('material')
    },
    notes:document.getElementById('f-notes').value,
    createdAt:editingId&&jobs.find(function(j){return j.id===editingId;})?jobs.find(function(j){return j.id===editingId;}).createdAt:new Date().toISOString()
  };
  var prev=editingId?jobs.find(function(j){return j.id===editingId;}):null;
  if(prev){
    // keep the link back to the Invoices report, so it's never sent twice
    if(prev.srcId) job.srcId=prev.srcId;
    if(prev.srcCustomer){ job.srcCustomer=prev.srcCustomer; FGB.learnAlias(prev.srcCustomer, cust==='Custom...'?custName:cust); }
  }
  if(editingId){var idx=jobs.findIndex(function(j){return j.id===editingId;});if(idx>=0)jobs[idx]=job;else jobs.push(job);}
  else{jobs.push(job);}
  saveJobs(); refreshLocations(); render(); closeForm();
}
function deleteJob(id){
  if(!confirm('Delete this job? Cannot be undone.'))return;
  jobs=jobs.filter(function(j){return j.id!==id;});
  saveJobs(); render();
}

function buildPrintHTML(){
  var L=jobs.filter(function(j){return j.year===currentYear;});
  var tI=L.reduce(function(s,j){return s+n(j.invoiceAmount);},0);
  var tL=L.reduce(function(s,j){return s+n(j.labor);},0);
  var tE=L.reduce(function(s,j){return s+n(j.totalExpenses);},0);
  function f(v){return '$'+n(v).toFixed(2);}
  var byC={}; EXP_CATS.forEach(function(c){ byC[c]=L.reduce(function(s,j){return s+n(j.expenses&&j.expenses[c]);},0); });
  var catRows=EXP_CATS.map(function(c){ return '<tr><td>'+c+'</td><td class="r">'+f(byC[c])+'</td></tr>'; }).join('');
  var months=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var mo=months.map(function(){return {i:0,l:0,e:0,c:0};});
  L.forEach(function(j){ if(!j.jobDate) return; var m=new Date(j.jobDate+'T12:00:00').getMonth(); if(m>=0&&m<12){ mo[m].i+=n(j.invoiceAmount); mo[m].l+=n(j.labor); mo[m].e+=n(j.totalExpenses); mo[m].c++; } });
  var moRows=months.map(function(mn,i){ var m=mo[i]; if(!m.c) return ''; return '<tr><td>'+mn+'</td><td class="r">'+m.c+'</td><td class="r">'+f(m.i)+'</td><td class="r">'+f(m.l)+'</td><td class="r">'+f(m.e)+'</td></tr>'; }).filter(Boolean).join('');
  var rows=L.map(function(j){ var nm=j.customer==='Custom...'?j.customCustomer:j.customer; return '<tr><td class="b">'+j.id+'</td><td>'+(j.jobDate||'&mdash;')+'</td><td>'+(nm||'')+'</td><td>'+(j.location||'')+'</td><td>'+(j.jobType||'')+(j.installSubtype?' - '+j.installSubtype:'')+(j.fanCount?' ('+j.fanCount+')':'')+'</td><td class="r">'+f(j.invoiceAmount)+'</td><td class="r">'+f(j.labor)+'</td><td class="r">'+f(j.totalExpenses)+'</td></tr>'; }).join('');
  var css='*{box-sizing:border-box;margin:0;padding:0}'
    +'body{font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;font-size:12px;padding:24px;background:#fff}'
    +'.hd{display:flex;align-items:center;gap:16px;border-bottom:2px solid #1f5fbf;padding-bottom:12px;margin-bottom:16px}'
    +'.hd img{height:62px;width:auto}.hd .t{font-size:18px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#111}.hd .s{font-size:10px;color:#667;margin-top:3px}'
    +'.kpis{display:flex;gap:10px;margin-bottom:14px}'
    +'.kpi{border:1px solid #ccd3df;border-radius:6px;padding:9px 12px;flex:1;text-align:center}'
    +'.kpi .v{font-size:17px;font-weight:800;color:#1f5fbf}.kpi .l{font-size:8px;text-transform:uppercase;letter-spacing:1px;color:#667;margin-top:3px}'
    +'h2{font-size:11px;text-transform:uppercase;letter-spacing:1.5px;color:#1f5fbf;margin:18px 0 6px}'
    +'table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:4px}'
    +'th{background:#eef2f8;color:#333;padding:6px 7px;text-align:left;font-size:8px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1.5px solid #1f5fbf}'
    +'th.r{text-align:right}td{padding:5px 7px;border-bottom:1px solid #e3e7ee}td.r{text-align:right}td.b{font-weight:800;color:#1f5fbf}'
    +'tr:nth-child(even) td{background:#f7f9fc}tfoot td{font-weight:800;border-top:2px solid #1f5fbf;background:#fff}'
    +'.foot{margin-top:18px;font-size:8px;color:#aaa;text-align:center;text-transform:uppercase;letter-spacing:2px}'
    +'@media print{@page{margin:1cm}body{padding:0}}';
  return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Fan Guys Ledger '+currentYear+'</title><style>'+css+'</style></head><body>'
    +'<div class="hd"><img src="data:image/jpeg;base64,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AREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREAREQBERAEREB//Z" alt="Fan Guys"><div><div class="t">'+currentYear+' Annual Summary</div><div class="s">Generated '+new Date().toLocaleDateString()+' &middot; '+L.length+' Jobs</div></div></div>'
    +'<div class="kpis"><div class="kpi"><div class="v">'+L.length+'</div><div class="l">Jobs</div></div><div class="kpi"><div class="v">'+f(tI)+'</div><div class="l">Invoiced</div></div><div class="kpi"><div class="v">'+f(tL)+'</div><div class="l">Labor</div></div><div class="kpi"><div class="v">'+f(tE)+'</div><div class="l">Expenses</div></div></div>'
    +'<h2>Expense Breakdown</h2><table><thead><tr><th>Category</th><th class="r">Total</th></tr></thead><tbody>'+catRows+'</tbody></table>'
    +(moRows?'<h2>Monthly Breakdown</h2><table><thead><tr><th>Month</th><th class="r">Jobs</th><th class="r">Invoice</th><th class="r">Labor</th><th class="r">Expenses</th></tr></thead><tbody>'+moRows+'</tbody></table>':'')
    +'<h2>All Jobs</h2><table><thead><tr><th>Job #</th><th>Date</th><th>Customer</th><th>Location</th><th>Type</th><th class="r">Invoice</th><th class="r">Labor</th><th class="r">Expenses</th></tr></thead><tbody>'+rows+'</tbody><tfoot><tr><td colspan="5">Totals</td><td class="r">'+f(tI)+'</td><td class="r">'+f(tL)+'</td><td class="r">'+f(tE)+'</td></tr></tfoot></table>'
    +'<div class="foot">Fan Guys &middot; Ledger Pro &middot; Confidential &middot; '+currentYear+'</div></body></html>';
}
function buildCSV(){
  var L=jobs.filter(function(j){return j.year===currentYear;});
  var hdrs=['Job #','Job Date','Customer','Location','Job Type','Invoice','Labor','Total Expenses','Hotel','Airfare','Rental Car','Fuel','Material','Notes'];
  var rows=L.map(function(j){
    var nm=j.customer==='Custom...'?j.customCustomer:j.customer;
    return [j.id,j.jobDate||'',nm,j.location,j.jobType+(j.installSubtype?' - '+j.installSubtype:'')+(j.fanCount?' ('+j.fanCount+' fans)':''),n(j.invoiceAmount),n(j.labor),n(j.totalExpenses),n(j.expenses.Hotel),n(j.expenses.Airfare),n(j.expenses['Rental Car']),n(j.expenses.Fuel),n(j.expenses.Material),j.notes||''].map(csvEsc).join(',');
  });
  var tI=L.reduce(function(s,j){return s+n(j.invoiceAmount);},0);
  var tL=L.reduce(function(s,j){return s+n(j.labor);},0);
  var tE=L.reduce(function(s,j){return s+n(j.totalExpenses);},0);
  var tH=L.reduce(function(s,j){return s+n(j.expenses.Hotel);},0);
  var tA=L.reduce(function(s,j){return s+n(j.expenses.Airfare);},0);
  var tR=L.reduce(function(s,j){return s+n(j.expenses['Rental Car']);},0);
  var tF=L.reduce(function(s,j){return s+n(j.expenses.Fuel);},0);
  var tM=L.reduce(function(s,j){return s+n(j.expenses.Material);},0);
  var tot=['TOTALS','','','','',tI,tL,tE,tH,tA,tR,tF,tM,''].map(csvEsc).join(',');
  return [hdrs.map(csvEsc).join(',')].concat(rows).concat([tot]).join('\n');
}

/* ═══════════════════════════════════════════════════
   BACKUP  — every year, every customer, one file.
   This file is the real record. Save it to Files/iCloud.
═══════════════════════════════════════════════════ */
var LAST_BACKUP_KEY = 'fg_last_backup';

function buildBackup(){
  var all = {};
  for (var y = 2020; y <= new Date().getFullYear() + 2; y++){
    try {
      var s = localStorage.getItem(SK(y));
      if (s !== null){ var p = JSON.parse(s); if (Array.isArray(p) && p.length) all[y] = p; }
    } catch(e){}
  }
  return JSON.stringify({
    app:'Ledger Pro', v:2, exportedAt:new Date().toISOString(),
    years: all, customers: customers
  }, null, 2);
}

function backupFilename(){
  var d=new Date(), p=function(n){return (n<10?'0':'')+n;};
  return 'FanGuys-Ledger-'+d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'.json';
}

function markBackedUp(){
  try{ localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString()); }catch(e){}
  var b=document.getElementById('backup-nag'); if(b) b.style.display='none';
}

function doBackup(){
  var content = buildBackup(), name = backupFilename();
  var count = 0;
  try { var yy=JSON.parse(content).years; Object.keys(yy).forEach(function(k){ count+=yy[k].length; }); } catch(e){}

  var file;
  try { file = new File([content], name, {type:'application/json'}); } catch(e){ file = null; }

  // iPhone: share sheet -> "Save to Files" -> iCloud Drive. This is the one that matters.
  if (file && navigator.canShare && navigator.canShare({files:[file]}) && navigator.share){
    navigator.share({files:[file]})
      .then(function(){ markBackedUp(); })
      .catch(function(err){ if(err && err.name==='AbortError') return; downloadBackup(content,name); });
    return;
  }
  downloadBackup(content, name);
}

function downloadBackup(content, name){
  try{
    var blob=new Blob([content],{type:'application/json'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a'); a.href=url; a.download=name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function(){URL.revokeObjectURL(url);},2000);
    markBackedUp();
  }catch(e){
    showExport('backup', content);   // last resort: copy/paste
  }
}

/* Nag if it has been more than 14 days. Backups only work if you actually do them. */
function checkBackupNag(){
  var bar=document.getElementById('backup-nag'); if(!bar) return;
  var last=null; try{ last=localStorage.getItem(LAST_BACKUP_KEY); }catch(e){}
  var days = last ? Math.floor((Date.now()-new Date(last).getTime())/86400000) : 999;
  if (days >= 14){
    bar.textContent = last
      ? '\u26a0\ufe0f Last backup was '+days+' days ago \u2014 tap to back up'
      : '\u26a0\ufe0f You have never backed up \u2014 tap to save a copy';
    bar.style.display='block';
  } else { bar.style.display='none'; }
}

/* Accepts every backup shape we have ever produced:
     v2  {years:{2024:[...],...}, customers:[...]}     (current, all years)
     v1  {year:2026, jobs:[...]}                        (old, one year)
     raw [ {...}, {...} ]                               (a bare jobs array)
   Text saved via Notes can pick up smart quotes — clean those first. */
function parseBackupText(text){
  if(!text) return null;
  var t = String(text).trim()
    .replace(/[\u201C\u201D\u201E\u2033]/g, '"')   // curly double quotes
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")   // curly single quotes
    .replace(/\u00A0/g, ' ');                      // non-breaking spaces
  var i = t.search(/[\{\[]/);                      // ignore any text pasted around it
  if(i > 0) t = t.slice(i);
  var last = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  if(last > -1) t = t.slice(0, last+1);
  var d;
  try{ d = JSON.parse(t); }catch(e){ return null; }

  var out = { years:{}, customers:[] };
  if(Array.isArray(d)){                             // bare array of jobs
    d.forEach(function(j){
      var y = j.year || (j.jobDate ? parseInt(j.jobDate.slice(0,4)) : null) ||
              (String(j.id||'').match(/^(\d{4})/) ? parseInt(String(j.id).slice(0,4)) : null);
      if(!y) return;
      (out.years[y] = out.years[y] || []).push(j);
    });
  } else if(d && d.years && typeof d.years==='object'){   // v2
    Object.keys(d.years).forEach(function(y){ if(Array.isArray(d.years[y])) out.years[y]=d.years[y]; });
    if(Array.isArray(d.customers)) out.customers = d.customers;
  } else if(d && Array.isArray(d.jobs)){                   // v1
    var yr = d.year || (d.jobs[0] && d.jobs[0].year);
    if(!yr) return null;
    out.years[yr] = d.jobs;
  } else return null;

  if(Object.keys(out.years).length===0) return null;
  return out;
}

/* replace=false  -> MERGE: add jobs you don't have, never touch what's there
   replace=true   -> overwrite those years wholesale */
function applyRestore(parsed, replace){
  var added=0, skipped=0, replaced=0, yrs=[];
  Object.keys(parsed.years).forEach(function(k){
    var y = parseInt(k), incoming = parsed.years[k];
    if(!incoming.length) return;
    yrs.push(k);
    if(replace){
      if(!safeSet(SK(y), JSON.stringify(incoming))){ saveFailed(); return; }
      replaced += incoming.length;
      return;
    }
    var existing = loadJobs(y);
    var have = {};
    existing.forEach(function(j){ have[j.id]=1; });
    incoming.forEach(function(j){
      if(have[j.id]){ skipped++; return; }
      if(!j.year) j.year = y;
      existing.push(j); have[j.id]=1; added++;
    });
    existing.sort(function(a,b){
      var na=parseInt((String(a.id).match(/-(\d+)$/)||[0,0])[1]);
      var nb=parseInt((String(b.id).match(/-(\d+)$/)||[0,0])[1]);
      return na-nb;
    });
    if(!safeSet(SK(y), JSON.stringify(existing))){ saveFailed(); return; }
  });

  if(parsed.customers.length){
    parsed.customers.forEach(function(c){ if(customers.indexOf(c)<0) customers.push(c); });
    saveCustomers();
  }

  try{ localStorage.setItem(SEED_FLAG,'restored'); }catch(e){}
  customers = loadCustomers();
  buildYearOptions();
  jobs = loadJobs(currentYear);
  refreshLocations(); render(); checkBackupNag();

  var msg = replace
    ? 'Replaced '+yrs.length+' year'+(yrs.length!==1?'s':'')+' ('+yrs.sort().join(', ')+') with '+replaced+' jobs.'
    : 'Added '+added+' job'+(added!==1?'s':'')+' from years '+yrs.sort().join(', ')+'.'+
      (skipped>0 ? '\n\n'+skipped+' job'+(skipped!==1?'s were':' was')+' already in your ledger, so '+(skipped!==1?'they were':'it was')+' left untouched.' : '');
  alert(msg);
}

/* Shows EXACTLY what each choice does, with real numbers, before you commit.
   Three real options — Cancel always means cancel, never "replace". */
function startRestore(text){
  var parsed = parseBackupText(text);
  if(!parsed){
    alert('That does not look like a Ledger Pro backup.\n\nIt should start with { and contain your jobs.');
    return;
  }

  // Work out the true consequences of each choice, per year
  var yl = Object.keys(parsed.years).sort();
  var totalIn=0, willAdd=0, alreadyHave=0, willDelete=0, rows=[];
  yl.forEach(function(k){
    var y=parseInt(k), incoming=parsed.years[k], existing=loadJobs(y);
    var have={}; existing.forEach(function(j){ have[j.id]=1; });
    var add=0, dup=0;
    incoming.forEach(function(j){ if(have[j.id]) dup++; else add++; });
    totalIn+=incoming.length; willAdd+=add; alreadyHave+=dup; willDelete+=existing.length;
    rows.push({y:k, incoming:incoming.length, add:add, dup:dup, cur:existing.length});
  });

  var ov=document.createElement('div');
  ov.className='overlay';
  ov.style.alignItems='center';

  function esc(t){ return String(t).replace(/[&<>]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c];}); }

  var tbl = rows.map(function(r){
    return '<tr>'
      +'<td style="padding:6px 8px;font-weight:800;color:var(--acc)">'+esc(r.y)+'</td>'
      +'<td style="padding:6px 8px;text-align:right">'+r.cur+'</td>'
      +'<td style="padding:6px 8px;text-align:right">'+r.incoming+'</td>'
      +'<td style="padding:6px 8px;text-align:right;color:var(--gr);font-weight:800">+'+r.add+'</td>'
      +'</tr>';
  }).join('');

  ov.innerHTML =
   '<div class="modal" style="max-width:520px">'
  +'  <div class="modal-hdr"><div>'
  +'    <div style="font-size:9px;color:var(--mid);letter-spacing:3px;text-transform:uppercase">Restore Backup</div>'
  +'    <div style="font-size:22px;font-weight:900;color:var(--tx);letter-spacing:1px">'+totalIn+' job'+(totalIn!==1?'s':'')+' found</div>'
  +'  </div></div>'
  +'  <div class="modal-body">'
  +'    <table style="width:100%;border-collapse:collapse;font-size:12px;color:var(--tx)">'
  +'      <thead><tr style="color:var(--mid);font-size:9px;text-transform:uppercase;letter-spacing:1px">'
  +'        <th style="text-align:left;padding:4px 8px">Year</th>'
  +'        <th style="text-align:right;padding:4px 8px">You have</th>'
  +'        <th style="text-align:right;padding:4px 8px">In backup</th>'
  +'        <th style="text-align:right;padding:4px 8px">New</th>'
  +'      </tr></thead><tbody>'+tbl+'</tbody>'
  +'    </table>'

  +'    <div style="border:1.5px solid rgba(52,211,153,.5);background:rgba(52,211,153,.08);border-radius:10px;padding:12px">'
  +'      <div style="color:var(--gr);font-weight:900;font-size:13px;letter-spacing:1px">\u2705 ADD MISSING &nbsp;\u00b7&nbsp; RECOMMENDED</div>'
  +'      <div style="color:var(--tx);font-size:12px;margin-top:6px;line-height:1.6">'
  +'        Adds <b>'+willAdd+'</b> job'+(willAdd!==1?'s':'')+' you don\u2019t have.<br>'
  +'        Keeps all <b>'+willDelete+'</b> of your current jobs exactly as they are.<br>'
  +'        <b>'+alreadyHave+'</b> already in your ledger \u2014 left untouched.<br>'
  +'        <span style="color:var(--gr)">Nothing is deleted. Safe.</span>'
  +'      </div>'
  +'    </div>'

  +'    <div style="border:1.5px solid rgba(248,113,113,.5);background:rgba(248,113,113,.08);border-radius:10px;padding:12px">'
  +'      <div style="color:#f87171;font-weight:900;font-size:13px;letter-spacing:1px">\u26a0\ufe0f REPLACE &nbsp;\u00b7&nbsp; DESTRUCTIVE</div>'
  +'      <div style="color:var(--tx);font-size:12px;margin-top:6px;line-height:1.6">'
  +'        <b style="color:#f87171">Permanently deletes all '+willDelete+'</b> of your current jobs in '+yl.join(', ')+'.<br>'
  +'        Replaces them with the '+totalIn+' from this backup.<br>'
  +'        Any job added or edited since this backup is <b style="color:#f87171">gone forever</b>.<br>'
  +'        <span style="color:#f87171">Cannot be undone.</span>'
  +'      </div>'
  +'    </div>'

  +'    <div style="display:flex;flex-direction:column;gap:8px;margin-top:2px">'
  +'      <button id="rs-add" class="btn btn-blue" style="width:100%;padding:14px;font-size:14px">\u2705 Add '+willAdd+' Missing Job'+(willAdd!==1?'s':'')+'</button>'
  +'      <div style="display:flex;gap:8px">'
  +'        <button id="rs-cancel" class="btn btn-dark" style="flex:1;padding:12px">Cancel</button>'
  +'        <button id="rs-replace" class="btn btn-dark" style="flex:1;padding:12px;color:#f87171;border-color:rgba(248,113,113,.5)">Replace\u2026</button>'
  +'      </div>'
  +'    </div>'
  +'  </div>'
  +'</div>';

  document.body.appendChild(ov);
  function close(){ if(ov.parentNode) ov.parentNode.removeChild(ov); }

  ov.querySelector('#rs-cancel').onclick = close;
  ov.querySelector('#rs-add').onclick = function(){ close(); applyRestore(parsed, false); };

  ov.querySelector('#rs-replace').onclick = function(){
    // Gate 1: back up first — you're about to destroy data
    if(willDelete > 0){
      if(window.confirm('BACK UP FIRST?\n\nYou are about to permanently delete '+willDelete+' jobs.\n\nOK = save a backup now (strongly recommended)\nCancel = skip and continue')){
        close(); doBackup();
        alert('Backup saved. Open Restore again and choose Replace to continue.');
        return;
      }
    }
    // Gate 2: type the word
    var typed = window.prompt(
      'FINAL CONFIRMATION\n\n'+
      'This DELETES '+willDelete+' jobs in '+yl.join(', ')+' forever.\n\n'+
      'Type  REPLACE  in capitals to proceed:');
    if(typed === null) return;
    if(typed.trim().toUpperCase() !== 'REPLACE'){
      alert('Not replaced \u2014 nothing was changed.\n\nYour jobs are safe.');
      return;
    }
    close();
    applyRestore(parsed, true);
  };
}

function doRestore(e){
  var file=e.target.files[0]; if(!file) return;
  var r=new FileReader();
  r.onload=function(ev){ startRestore(ev.target.result); };
  r.onerror=function(){ alert('Could not read that file.'); };
  r.readAsText(file); e.target.value='';
}

function doRestorePaste(){
  var t = window.prompt('Paste your backup text here (from Notes, a .txt file, or the clipboard):');
  if(t===null) return;
  if(!t.trim()){ alert('Nothing was pasted.'); return; }
  startRestore(t);
}
function doCSV(){ showExport('csv',buildCSV()); }
function doPrint(){ showExport('pdf',buildPrintHTML()); }

function showExport(type,content){
  var ab=document.getElementById('export-action-btn');
  var hint=document.getElementById('export-hint');
  var ca=document.getElementById('export-content-area');
  if(type==='pdf'){
    ab.textContent='\ud83d\udda8 Print / Save PDF'; ab.className='btn btn-blue';
    hint.textContent='iOS: Print \u2192 Share \u2192 Save to Files';
    ab.onclick=function(){var f=document.getElementById('pfr');try{f.contentWindow.focus();f.contentWindow.print();}catch(e){window.print();}};
    ca.innerHTML='<iframe id="pfr" srcdoc=""></iframe>';
    document.getElementById('pfr').srcdoc=content;
  } else {
    var isBk=type==='backup';
    ab.textContent=isBk?'\ud83d\udccb Copy Backup':'\ud83d\udccb Copy CSV';
    ab.className='btn '+(isBk?'btn-blue':'btn-green');
    hint.textContent=isBk?'Paste into Notes \u2192 Save to Files as LedgerPro_'+currentYear+'_BACKUP.json':'Paste into Notes \u2192 Save as .csv \u2192 open in Numbers/Excel';
    ab.onclick=function(){
      if(navigator.clipboard){navigator.clipboard.writeText(content).then(function(){alert('Copied! Paste into Notes app, then Share \u2192 Save to Files.');}).catch(function(){alert('Long-press the text box below \u2192 Select All \u2192 Copy');});}
      else{alert('Long-press the text box below \u2192 Select All \u2192 Copy');}
    };
    ca.innerHTML='<textarea class="export-area" readonly onclick="this.select()"></textarea>';
    ca.querySelector('textarea').value=content;
  }
  document.getElementById('export-overlay').style.display='';
  document.body.style.overflow='hidden';
}
function closeExport(){document.getElementById('export-overlay').style.display='none';document.body.style.overflow='';}

/* ============ Import from Invoice Pro ============ */
/* Shared mailbox key. If both apps can see the same storage on this device,
   the transfer happens automatically. If not, we fall back to paste-the-code. */
var BRIDGE_KEY = 'fg_bridge_inv2led';

function importFromInvoice(){
  var raw=null, viaAuto=false;
  // 1) Try the automatic handoff (works only when both apps share storage on this device)
  try{ raw=localStorage.getItem(BRIDGE_KEY); }catch(e){}
  if(raw){ viaAuto=true; }
  // 2) Otherwise ask Chris to paste the code Invoice Pro put on the clipboard
  if(!raw){
    raw=prompt('Nothing is waiting from Invoices.\n\nTo send a report: go to Invoices, open the report menu, tap Send to Ledger.\n\nOr paste a code from the old Invoice Pro app here:');
    if(raw===null) return;
    raw=raw.trim();
    if(!raw){ alert('Nothing was pasted. Open Invoice Pro, tap "Copy to Ledger Pro", then paste the code here.'); return; }
  }
  var data;
  try{ data=JSON.parse(raw); }
  catch(e){ alert('That code did not look right. Make sure you copied the whole thing from Invoice Pro.'); return; }
  if(!data || data._fanguys_bridge!=='invoice->ledger' || !Array.isArray(data.jobs)){
    alert('That is not an Invoice Pro transfer code. In Invoice Pro tap "Copy to Ledger Pro" and paste the code it gives you.');
    return;
  }
  var incoming=data.jobs;
  if(incoming.length===0){
    alert('No jobs to bring over from Invoice Pro.');
    if(viaAuto){ try{ localStorage.removeItem(BRIDGE_KEY); }catch(e){} }
    return;
  }

  var added=0, skipped=0, touchedCurrent=false, lastImported=null;

  incoming.forEach(function(src){
    // Send each job into the year of its job date; if no date, use the year selected up top
    var y=currentYear;
    if(src.jobDate && /^\d{4}-/.test(src.jobDate)){ var yy=parseInt(src.jobDate.slice(0,4)); if(yy>=2024&&yy<=2030) y=yy; }
    var bucket;
    try{ bucket=JSON.parse(localStorage.getItem(SK(y))||'[]'); }catch(e){ bucket=[]; }
    if(!Array.isArray(bucket)) bucket=[];

    // Skip anything already brought over before (matched on Invoice Pro's own id)
    if(src.srcId){
      var dup=bucket.some(function(j){ return j.srcId===src.srcId; });
      if(dup){ skipped++; return; }
    }

    // Job number: honor the number Invoice Pro sent; keep it unique so two jobs
    // can never share a number. If it's already taken, add a small suffix.
    var desired=(src.jobNo||'').trim();
    var newId;
    // Already in the Ledger under that job number (typed in before the apps were connected)?
    // Link it to the report instead of adding a second copy.
    if(desired){
      var same=bucket.find(function(j){ return j.id===desired && !j.srcId; });
      if(same){
        same.srcId=src.srcId||''; same.srcCustomer=(src.customer||'').trim();
        if(!safeSet(SK(y), JSON.stringify(bucket))){ saveFailed(); return; }
        skipped++; return;
      }
    }
    if(desired){
      newId=desired; var k=2;
      while(bucket.some(function(j){ return j.id===newId; })){ newId=desired+'-'+k; k++; }
    } else {
      var maxN=0;
      bucket.forEach(function(j){ var mm=String(j.id||'').match(/-(\d+)\b/); if(mm){ var nn=parseInt(mm[1],10); if(nn>maxN)maxN=nn; } });
      var seq=maxN+1; newId=y+'-'+seq;
      while(bucket.some(function(j){ return j.id===newId; })){ seq++; newId=y+'-'+seq; }
    }

    // Customer: reuse an existing one if it matches, otherwise bring it in as a
    // Custom name so it shows up (editable) in the form for you to confirm on Save.
    var incCust=(src.customer||'').trim();
    var cust='', custName='';
    var srcLoc=src.location||'';
    if(incCust){
      var mc=FGB.matchCustomer(incCust, customers);
      cust=mc.customer; custName=mc.custom;
      if(!srcLoc && mc.rest) srcLoc=mc.rest;   // "Wesco Phoenix" with no location → Phoenix
    }

    var job={
      id:newId, year:y,
      customer:cust, customCustomer:custName,
      location:srcLoc,
      jobDate:src.jobDate||'',
      jobType:src.jobType||'',
      installSubtype:src.installSubtype||'',
      fanCount:src.fanCount||'',
      invoiceAmount:src.invoiceAmount||'',
      labor:src.labor||'',
      totalExpenses:src.totalExpenses||'',
      expenses:{
        Hotel:(src.expenses&&src.expenses.Hotel)||'',
        Airfare:(src.expenses&&src.expenses.Airfare)||'',
        'Rental Car':(src.expenses&&src.expenses['Rental Car'])||'',
        Fuel:(src.expenses&&src.expenses.Fuel)||'',
        Material:(src.expenses&&src.expenses.Material)||''
      },
      notes:src.notes||'',
      srcId:src.srcId||'',
      srcCustomer:incCust,
      createdAt:new Date().toISOString()
    };
    bucket.push(job);
    if(!safeSet(SK(y), JSON.stringify(bucket))){ saveFailed(); return; }
    added++;
    lastImported={ id:newId, year:y };
    if(y===currentYear) touchedCurrent=true;
  });

  saveCustomers();
  if(viaAuto){ try{ localStorage.removeItem(BRIDGE_KEY); }catch(e){} }

  // One report came in → jump to its year and open it so you can confirm the
  // customer and add the invoice amount + labor, then hit Save.
  if(added===1 && lastImported){
    currentYear=lastImported.year;
    var ysel=document.getElementById('year-sel'); if(ysel) ysel.value=String(currentYear);
    jobs=loadJobs(currentYear);
    refreshLocations();
    render();
    if(skipped>0) alert(skipped+' report'+(skipped!==1?'s were':' was')+' already imported earlier, so it was skipped. Opening the new one now.');
    openForm(lastImported.id);
    return;
  }

  // Zero, or several at once → just file them and report.
  if(touchedCurrent){ jobs=loadJobs(currentYear); }
  refreshLocations();
  render();
  var msg = added>0 ? ('Brought over '+added+' jobs from Invoice Pro.') : 'No new jobs were brought over.';
  if(skipped>0) msg+='\n'+skipped+' that '+(skipped!==1?'were':'was')+' already imported earlier got skipped.';
  alert(msg);
}

function openSettings(){renderCustList();document.getElementById('settings-overlay').style.display='';document.body.style.overflow='hidden';}
function closeSettings(){document.getElementById('settings-overlay').style.display='none';document.body.style.overflow='';}
function renderCustList(){
  document.getElementById('cust-list').innerHTML=customers.map(function(c){
    return '<div class="cust-row">'+h(c)+(DEFAULT_CUSTS.indexOf(c)>=0?'<span class="cust-default">Default</span>':'<button class="btn btn-ghost" style="font-size:12px;padding:3px 10px" onclick="removeCust(\''+h(c)+'\')">Remove</button>')+'</div>';
  }).join('');
}
function addCustomer(){var v=document.getElementById('new-cust-input').value.trim();if(!v||customers.indexOf(v)>=0)return;customers.push(v);saveCustomers();document.getElementById('new-cust-input').value='';renderCustList();}
function removeCust(nm){if(DEFAULT_CUSTS.indexOf(nm)>=0)return;customers=customers.filter(function(c){return c!==nm;});saveCustomers();renderCustList();}
function resetCustomers(){customers=DEFAULT_CUSTS.slice();saveCustomers();renderCustList();}
function changePin(){
  var cur=prompt('Enter your CURRENT 4-digit passcode:');
  if(cur===null)return;
  if(cur!==APP_PIN){alert('That passcode is not correct.');return;}
  var nw=prompt('Enter a NEW 4-digit passcode:');
  if(nw===null)return;
  if(!/^[0-9]{4}$/.test(nw)){alert('Passcode must be exactly 4 numbers (0-9).');return;}
  var cf=prompt('Re-enter the new passcode to confirm:');
  if(cf===null)return;
  if(nw!==cf){alert('The two new passcodes did not match. Nothing was changed.');return;}
  FGB.setPin(nw);
  APP_PIN=nw;
  alert('Passcode changed. Use your new code next time the app opens.');
}

function toggleTools(e){
  if(e) e.stopPropagation();
  document.getElementById('tools-menu').classList.toggle('show');
}
function closeTools(){
  var m=document.getElementById('tools-menu');
  if(m) m.classList.remove('show');
}
document.addEventListener('click',function(e){
  if(!e.target.closest('.tools-wrap')) closeTools();
});


/* ============ Fan Guys Books: panel-schedule look ============ */
var WIRE = { 'Hotel':'w-hotel', 'Airfare':'w-airfare', 'Rental Car':'w-rental', 'Fuel':'w-fuel', 'Material':'w-material' };
function usd0(v){ var x=n(v); return '$'+x.toLocaleString('en-US',{minimumFractionDigits:x%1?2:0,maximumFractionDigits:2}); }
renderCard = function(j){
  var nm = j.customer==='Custom...' ? j.customCustomer : j.customer;
  var inv=n(j.invoiceAmount), lab=n(j.labor), exp=n(j.totalExpenses);
  var bal = Math.abs(lab+exp-inv)<0.01 && inv>0;
  var ds = j.jobDate ? new Date(j.jobDate+'T12:00:00').toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '';
  var num = String(j.id||'').replace(/^\d{4}-/,'');
  var wires = (lab>0?'<span class="wire w-labor"><i></i>Labor '+usd0(lab)+'</span>':'') +
    EXP_CATS.filter(function(c){ return n(j.expenses&&j.expenses[c])>0; }).map(function(c){
      return '<span class="wire '+WIRE[c]+'"><i></i>'+(c==='Rental Car'?'Rental':c)+' '+usd0(j.expenses[c])+'</span>';
    }).join('');
  var typeStr = [j.jobType, j.installSubtype, j.fanCount?j.fanCount+' fans':null].filter(Boolean).join(', ');
  var open = expandAll, id = j.id;
  var flag = inv>0 && !bal ? '<span class="flag">Check totals</span>' : (inv===0 ? '<span class="flag">No invoice yet</span>' : '');
  return '<div class="job-card" id="card-'+h(id)+'" style="background:none;border:none;margin:0">' +
    '<div class="strip'+(open?' open':'')+'" onclick="toggleCard(\''+h(id)+'\')">' +
      '<div class="handle"><b>'+h(num)+'</b><span class="job-chevron'+(open?' open':'')+'" style="display:none"></span></div>' +
      '<div class="sbody">' +
        '<div class="jobno">'+h(j.id)+'</div>' +
        '<div class="l1"><div class="cust">'+(nm?h(nm):'No customer')+'</div><div class="amt">'+usd(j.invoiceAmount)+'</div></div>' +
        '<div class="where">'+(j.location?h(j.location):'No location')+(ds?' · '+ds:'')+flag+'</div>' +
        (wires?'<div class="wires">'+wires+'</div>':'') +
      '</div>' +
    '</div>' +
    '<div class="job-detail" id="detail-'+h(id)+'" style="display:'+(open?'flex':'none')+'">' +
      ((typeStr||j.jobDate)?'<div class="meta">'+(j.jobDate?fmtDate(j.jobDate,true):'')+(typeStr?(j.jobDate?'. ':'')+h(typeStr):'')+'</div>':'') +
      (inv>0?'<div class="meta">'+(bal?'Labor plus expenses matches the invoice.':'Labor plus expenses is '+usd(lab+exp)+', invoice is '+usd(inv)+'.')+'</div>':'') +
      (j.notes?'<div class="notes">'+h(j.notes)+'</div>':'') +
      '<div class="row-actions"><button onclick="openForm(\''+h(id)+'\')">Edit job '+h(id)+'</button><button class="del-btn" onclick="deleteJob(\''+h(id)+'\')" aria-label="Delete job">Delete</button></div>' +
    '</div></div>';
};
var _origToggle = toggleCard;
toggleCard = function(id){
  _origToggle(id);
  var card=document.getElementById('card-'+id), d=document.getElementById('detail-'+id);
  if(card) card.querySelector('.strip').classList.toggle('open', !!d && d.style.display!=='none');
};
var _origRender = render;
render = function(){
  _origRender();
  var tBar=document.getElementById('totals-bar'), list=document.getElementById('jobs-list');
  if(!tBar||!list) return;
  var tI=0,tL=0,tE=0; jobs.forEach(function(j){ tI+=n(j.invoiceAmount); tL+=n(j.labor); tE+=n(j.totalExpenses); });
  var plate=document.getElementById('fgb-plate');
  if(plate) plate.parentNode.removeChild(plate);
  var now=new Date(), isNow=(currentYear===now.getFullYear());
  var monthInv=0; jobs.forEach(function(j){ if(j.jobDate && j.jobDate.slice(0,7)===now.toISOString().slice(0,7)) monthInv+=n(j.invoiceAmount); });
  var avgMonth = isNow ? tI/Math.max(1, now.getMonth()+1) : tI/12;
  plate=FGB.fan({ amount: usd(tI), pace: isNow && avgMonth>0 ? monthInv/avgMonth : 1,
    label: 'Invoiced in '+currentYear+(isNow ? '. The fan spins at this month\'s pace.' : '') });
  plate.id='fgb-plate';
  list.parentNode.insertBefore(plate, list);
  plate.style.display = jobs.length ? '' : 'none';
  tBar.style.display='none';
  var cl=document.getElementById('fgb-count');
  if(!cl){ cl=document.createElement('div'); cl.id='fgb-count'; cl.className='count-line'; list.parentNode.insertBefore(cl, list); }
  var allN=0; yearRange().forEach(function(y){ allN+=loadJobs(y).length; });
  cl.innerHTML = jobs.length ? '<span>'+jobs.length+' job'+(jobs.length!==1?'s':'')+' in '+currentYear+(allN>jobs.length?' of '+allN+' total. Pick a year up top.':'')+'</span><button onclick="toggleExpand()">'+(expandAll?'Collapse all':'Open all')+'</button>' : '';
  var nag=document.getElementById('backup-nag');
  if(nag && nag.nextSibling!==cl){ list.parentNode.insertBefore(nag, cl); nag.style.marginBottom='14px'; }
};
var _origNag = checkBackupNag;
checkBackupNag = function(){
  _origNag();
  var bar=document.getElementById('backup-nag'); if(!bar||bar.style.display==='none') return;
  var last=null; try{ last=localStorage.getItem(LAST_BACKUP_KEY); }catch(e){}
  var days = last ? Math.floor((Date.now()-new Date(last).getTime())/86400000) : 0;
  bar.textContent = last ? 'Last backup was '+days+' days ago. Tap to back up now.' : 'No backup yet. Tap to back up now.';
};
var _origSummary = renderSummary;
renderSummary = function(){
  _origSummary();
  var tiles=document.querySelectorAll('#s-exp-grid .exp-tile');
  EXP_CATS.forEach(function(c,i){ if(tiles[i]) tiles[i].classList.add(WIRE[c]); });
};

/* ============ Fan Guys Books: one backup, one restore ============ */
doBackup = function(){ FGB.backup(); };
var _ledgerStartRestore = startRestore;
startRestore = function(text){
  var d = FGB.parseLoose(text), kind = FGB.detect(d);
  if (kind === 'books' || kind === 'invoice') { FGB.restoreAny(d); return; }
  _ledgerStartRestore(text);
};

/* ============ Boot ============ */
window.onload=function(){
  var unlocked=false;
  try { unlocked = sessionStorage.getItem('fg_unlocked')==='1' || FGB.isUnlocked(); } catch(e){}
  if(unlocked){ unlockApp(); }
  else { updatePinDots(); }
};

