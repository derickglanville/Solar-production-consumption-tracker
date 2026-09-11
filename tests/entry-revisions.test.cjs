const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('static/js/app-client.js','utf8');
function harness(initial, fail = false) {
  let stored = structuredClone(initial), fallback = 0;
  const context = {
    entryCollectionName:'solar_daily_entries', activeFirestoreDb:{}, Date,
    collection: () => ({}), doc: () => ({}),
    firebaseSetDoc: async () => { fallback++; },
    runTransaction: async (_, run) => {
      const writes=[];
      await run({get:async()=>({exists:()=>stored != null,data:()=>structuredClone(stored)}),set:(...args)=>writes.push(args)});
      if (fail) throw new Error('permission denied');
      for(const [,value,options] of writes) stored = options?.merge ? {...stored,...value} : value;
    }
  };
  vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('async function setDoc('),source.indexOf('async function showEntryHistory(')),context);
  return {context, ref:{parent:{id:'solar_daily_entries'}}, stored:()=>stored, revisions:()=>stored?.entry_revisions || [], fallback:()=>fallback};
}
const before={entry_date:'2026-09-09',notes:'original',meter_01_import_reading:100,extra:'keep'};
test('updates preserve complete prior record and merge untouched fields',async()=>{const h=harness(before);await h.context.setDoc(h.ref,{notes:'edited'},{merge:true});assert.equal(h.stored().notes,'edited');assert.equal(h.stored().extra,'keep');assert.equal(h.revisions()[0].snapshot.notes,'original');});
test('failed transaction changes neither entry nor history',async()=>{const h=harness(before,true);await assert.rejects(h.context.setDoc(h.ref,{notes:'edited'},{merge:true}));assert.deepEqual(h.stored(),before);assert.equal(h.revisions().length,0);});
test('restore replaces full snapshot and preserves newer version',async()=>{const h=harness({...before,newField:1});await h.context.restoreEntryRevision(h.ref,{...before,notes:'older'},h.stored(),before.entry_date);assert.equal(h.stored().notes,'older');assert.equal(h.stored().newField,undefined);assert.equal(h.revisions()[0].snapshot.newField,1);});
test('stale preview cannot overwrite concurrent changes',async()=>{const h=harness({...before,notes:'concurrent'});await assert.rejects(h.context.restoreEntryRevision(h.ref,before,before,before.entry_date),/changed/);assert.equal(h.revisions().length,0);assert.equal(h.stored().notes,'concurrent');});
test('rejects snapshot for another date',async()=>{const h=harness(before);await assert.rejects(h.context.restoreEntryRevision(h.ref,{...before,entry_date:'2026-09-08'},before,before.entry_date),/selected date/);});
test('new entry does not create a nonexistent prior version',async()=>{const h=harness(null);await h.context.setDoc(h.ref,before,{merge:true});assert.equal(h.revisions().length,0);assert.equal(h.stored().notes,'original');});
test('settings retain normal save behavior',async()=>{const h=harness(before);await h.context.setDoc({parent:{id:'config'}},{a:1});assert.equal(h.fallback(),1);assert.equal(h.revisions().length,0);});
test('revision snapshots never contain revision history recursively',async()=>{const h=harness({...before,entry_revisions:[{saved_at:'old',snapshot:{entry_date:before.entry_date}}]});await h.context.setDoc(h.ref,{notes:'edited'},{merge:true});assert.equal(h.revisions()[0].snapshot.entry_revisions,undefined);});
