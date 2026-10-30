import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
const source=await fs.readFile('extension/reload.js','utf8');
function instance(storage={},id='test@local'){
 let listener,reloads=0;const scheduled=[];
 const browser={runtime:{id,getManifest:()=>({name:'Test',version:'1.2.3'}),reload:()=>reloads++,onMessageExternal:{addListener:f=>listener=f}},storage:{local:{get:async k=>({[k]:storage[k]}),set:async data=>Object.assign(storage,data)}}};
 const context=vm.createContext({browser,crypto,setTimeout:f=>scheduled.push(f)});vm.runInContext(source,context);
 return {listener,scheduled,get reloads(){return reloads;},handle:message=>vm.runInContext(`handleControlReload(${JSON.stringify(message)})`,context)};
}
const info={protocol:'firefox-control-reload-v1',action:'info'};
test('only the exact controller can invoke the development handler',async()=>{
 const i=instance();assert.equal(i.listener(info,{id:'other@local'}),undefined);assert.equal(i.listener(info,{}),undefined);assert.equal(i.listener({protocol:'other'},{id:'firefox-control@anveio.com'}),undefined);
 const value=await i.listener(info,{id:'firefox-control@anveio.com'});assert.equal(value.id,'test@local');assert.equal(i.scheduled.length,0);
});
test('reload acknowledges before unloading and survives as a verifiable new instance',async()=>{
 const storage={},i=instance(storage),reloadId=crypto.randomUUID();const before=await i.handle(info);
 const ack=await i.handle({...info,action:'reload',reloadId});assert.equal(ack.accepted,true);assert.equal(i.reloads,0);assert.equal(i.scheduled.length,1);
 await assert.rejects(i.handle({...info,action:'reload',reloadId:crypto.randomUUID()}),/already pending/);
 i.scheduled[0]();assert.equal(i.reloads,1);
 const after=await instance(storage).handle(info);assert.notEqual(after.bootId,before.bootId);assert.equal(after.reloadId,reloadId);
});
test('rejects malformed mutations and the controller exposes no external listener',async()=>{
 const i=instance();await assert.rejects(i.handle({...info,action:'eval'}),/Unsupported/);await assert.rejects(i.handle({...info,action:'reload',reloadId:'invalid'}),/Invalid/);assert.equal(i.scheduled.length,0);
 assert.equal(instance({},'firefox-control@anveio.com').listener,undefined);
});
