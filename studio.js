/* Shared presentation and keyboard behavior. No data migrations or storage writes. */
(function () {
 'use strict';
 var ledger = document.body.classList.contains('fgb-ledger');
 var rail = document.createElement('aside');
 rail.className = 'studio-rail'; rail.setAttribute('aria-label','Workspace navigation');
 rail.innerHTML = '<div class="studio-logo"><img src="icon-192.png" alt=""><div>Fan Guys<small>BOOKS / WORKSPACE</small></div></div><div class="studio-nav-heading">WORKSPACE</div><nav aria-label="Main"><a class="studio-nav-link '+(!ledger?'active':'')+'" href="invoices.html" '+(!ledger?'aria-current="page"':'')+'>Reports</a><a class="studio-nav-link '+(ledger?'active':'')+'" href="ledger.html" '+(ledger?'aria-current="page"':'')+'>Ledger</a><button class="studio-nav-link" data-studio="summary">Financial summary</button></nav><div class="studio-rail-bottom"><button class="studio-nav-link" data-studio="backup">Back up everything</button><button class="studio-nav-link" data-studio="settings">Settings &amp; tools</button><div class="studio-local-note">Your books stay on this device.<br>Save a backup to keep a copy.</div></div>';
 document.body.appendChild(rail);
 function action(name) {
  if(name==='backup'){FGB.backup();return;}
  if(name==='jobs'){if(ledger){switchTab('jobs');window.scrollTo(0,0);}else location.href='ledger.html';return;}
  if(name==='summary'){
   if(ledger){switchTab('summary');document.getElementById('tab-summary').focus();}
   else location.href='ledger.html#summary';
  }
  if(name==='settings'){
   if(ledger){var b=document.getElementById('tools-btn');b.click();b.focus();}
   else if(typeof openSettings==='function') openSettings();
  }
 }
 rail.addEventListener('click',function(e){var b=e.target.closest('[data-studio]');if(b)action(b.dataset.studio);});
 if(ledger){
  var mobile=document.createElement('nav');mobile.className='studio-ledger-mobile';mobile.setAttribute('aria-label','Workspace');
  mobile.innerHTML='<a href="invoices.html">Reports</a><button data-studio="jobs" class="active" aria-current="page">Ledger <span class="studio-count"></span></button><button data-studio="summary">Summary</button><button data-studio="backup">Backup</button>';
  mobile.addEventListener('click',function(e){var b=e.target.closest('[data-studio]');if(b)action(b.dataset.studio);});document.body.appendChild(mobile);
  window.addEventListener('load',function(){if(location.hash==='#summary'&&FGB.isUnlocked())switchTab('summary');});
 }
 var uid=0, scheduled=false;
 function enhance(){
  scheduled=false;
  document.querySelectorAll('.searchbar input').forEach(function(i){if(!i.hasAttribute('aria-label'))i.setAttribute('aria-label',i.placeholder||'Search receipts');});
  document.querySelectorAll('.field input,.field select,.field textarea,.field-row input,.field-row select,.field-row textarea').forEach(function(i){
   var group=i.closest('.field,.field-row'), label=group.querySelector('label,.field-label');
   if(label&&!i.hasAttribute('aria-label')&&!i.hasAttribute('aria-labelledby')){
    if(!label.id)label.id='studio-label-'+(++uid);
    i.setAttribute('aria-labelledby',label.id);
   }
  });
  document.querySelectorAll('.empty').forEach(function(empty){
   if(ledger&&!empty.querySelector('.studio-primary')){
    var title=empty.querySelector('.empty-title');if(title)title.textContent='A clean slate for '+document.getElementById('year-sel').value;
    var sub=empty.querySelector('.empty-sub');if(sub)sub.textContent='Add a job or bring a report over from Invoices.';
    var b=document.createElement('button');b.className='studio-primary';b.textContent='Create your first job';b.onclick=function(){openForm(null);};empty.appendChild(b);
   }
  });
  document.querySelectorAll('.strip[onclick]').forEach(function(card){
   if(card.hasAttribute('tabindex'))return;card.tabIndex=0;card.setAttribute('role','button');
   card.onkeydown=function(e){if(e.target===card&&(e.key==='Enter'||e.key===' ')){e.preventDefault();card.click();}};
  });
  document.querySelectorAll('.pin-key.del,.keypad-btn').forEach(function(b){if(b.textContent.trim()==='⌫'||b.classList.contains('del'))b.setAttribute('aria-label','Delete last digit');});
  var year=document.getElementById('year-sel');if(year&&!year.hasAttribute('aria-label'))year.setAttribute('aria-label','Ledger year');
  if(ledger){var mob=document.querySelector('.studio-ledger-mobile');if(mob){var sOn=!!document.getElementById('tab-summary')&&document.getElementById('tab-summary').classList.contains('active');var mj=mob.querySelector('[data-studio=jobs]'),ms=mob.querySelector('[data-studio=summary]');if(mj.classList.contains('active')===sOn){mj.classList.toggle('active',!sOn);ms.classList.toggle('active',sOn);if(sOn){ms.setAttribute('aria-current','page');mj.removeAttribute('aria-current');}else{mj.setAttribute('aria-current','page');ms.removeAttribute('aria-current');}}var jc=document.getElementById('job-count'),sc=mj.querySelector('.studio-count');if(jc&&sc&&sc.textContent!==jc.textContent)sc.textContent=jc.textContent;}}
  if(ledger){var sum=document.getElementById('tab-summary');var active=!!sum&&sum.classList.contains('active');var summary=rail.querySelector('[data-studio=summary]');if(summary.classList.contains('active')!==active)summary.classList.toggle('active',active);summary.setAttribute('aria-pressed',String(active));var link=rail.querySelector('a[href="ledger.html"]');if(link.classList.contains('active')===active)link.classList.toggle('active',!active);if(active)link.removeAttribute('aria-current');else link.setAttribute('aria-current','page');}
  document.querySelectorAll('.tab').forEach(function(t){var v=t.classList.contains('active')?'true':'false';if(t.getAttribute('aria-pressed')!==v)t.setAttribute('aria-pressed',v);});
  document.querySelectorAll('.caution-bar').forEach(function(b){if(b.hasAttribute('tabindex'))return;b.tabIndex=0;b.setAttribute('role','button');b.onkeydown=function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();b.click();}};});
 }
 new MutationObserver(function(){if(!scheduled){scheduled=true;requestAnimationFrame(enhance);}}).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
 enhance();
 // Focus containment for the active application dialog; leave native pickers alone.
 var lastDialog=null,previousFocus=null;
 function visible(el){return el&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden';}
 function dialog(){return Array.from(document.querySelectorAll('.sheet-overlay,.fgb-sheet,.overlay')).filter(visible).pop();}
 function controls(d){return Array.from(d.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')).filter(visible);}
 document.addEventListener('keydown',function(e){
  var d=dialog();if(!d)return;
  if(e.key==='Tab'){
   var all=controls(d);if(!all.length)return;
   var first=all[0],last=all[all.length-1];
   if(!d.contains(document.activeElement)){e.preventDefault();first.focus();}
   else if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
   else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  }
  if(e.key==='Escape'){
   var close=controls(d).find(function(b){return /(^|\s)(cancel|close|done|×)$/i.test(b.textContent.trim())||/close/i.test(b.getAttribute('aria-label')||'');});
   if(close){e.preventDefault();close.click();}
  }
 });
 new MutationObserver(function(){
  var d=dialog();if(d===lastDialog)return;
  if(d){previousFocus=document.activeElement;lastDialog=d;d.setAttribute('role','dialog');d.setAttribute('aria-modal','true');
   var heading=d.querySelector('h2,.sheet-nav span,.modal-hdr h2');if(heading){if(!heading.id)heading.id='studio-dialog-'+(++uid);d.setAttribute('aria-labelledby',heading.id);}else d.setAttribute('aria-label','Edit details');
   requestAnimationFrame(function(){if(!d.contains(document.activeElement)){var c=controls(d);if(c[0])c[0].focus();}});
  }else{lastDialog=null;if(previousFocus&&previousFocus.isConnected)previousFocus.focus();}
 }).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['style']});
})();
