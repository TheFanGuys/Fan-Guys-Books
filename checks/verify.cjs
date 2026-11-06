// Run with: node checks/verify.cjs. No packages or network required.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
for(const file of ['books.js','drive.js','invoices-app.js','ledger-app.js','studio.js','jspdf.umd.min.js'])new vm.Script(fs.readFileSync(path.join(root,file),'utf8'),{filename:file});
for(const page of ['invoices.html','ledger.html']){
 const html=fs.readFileSync(path.join(root,page),'utf8');
 for(const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)){
  const target=match[1].split('?')[0];if(/^(https?:|data:|mailto:)/.test(target))continue;
  assert.ok(fs.existsSync(path.join(root,target)),`${page}: missing ${target}`);
 }
 assert.ok(!html.includes('localStorage.setItem("fg-unlocked"'), 'Preview fixture must not ship');
}
const values=new Map();const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,String(v)),key:i=>Array.from(values.keys())[i],get length(){return values.size;}};
const context={localStorage:storage,Date,JSON,Promise,setTimeout,clearTimeout};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'books.js'),'utf8'),context);const f=context.FGB;
assert.equal(f.jobNoOf('2026-42 Demo installation'),'2026-42');
assert.equal(f.detect({app:'Fan Guys Books',v:1,invoice:{jobs:[],receipts:[]},ledger:{years:{}}}),'books');
assert.equal(f.parseLoose('Backup: {"year":2026,"jobs":[]}').year,2026);
values.set('fg_j_2026',JSON.stringify([{id:'2026-42',srcId:'demo-42',invoiceAmount:1250}]));
assert.equal(f.inLedger({id:'demo-42',name:'2026-42 Demo installation'}),true);
assert.equal(f.inLedger({id:'other',name:'2026-43 Another job'}),false);
console.log('PASS: six scripts parse; HTML asset references resolve; preview unlock excluded; backup recognition, job parsing, and ledger linking pass.');
