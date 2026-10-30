import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
async function setup(){
 let stored={},clicked;const events={addListener:()=>{}};
 const browser={storage:{local:{get:async defaults=>defaults,set:async v=>Object.assign(stored,v)}},action:{setBadgeText(){},setTitle(){},setBadgeBackgroundColor(){},onClicked:{addListener:f=>clicked=f}},runtime:{getManifest:()=>({version:'0.1.0'}),getURL:p=>'moz-extension://test/'+p,onMessage:events},permissions:{request:async()=>false},tabs:{get:async()=>({url:'https://a.test/'})},webNavigation:{getAllFrames:async()=>[{frameId:0,url:'https://a.test/'}]},userScripts:{execute:async params=>[{frameId:0,result:params}]}};
 const context=vm.createContext({browser,crypto,URL,setTimeout:()=>0,clearTimeout:()=>{}});
 vm.runInContext(await fs.readFile('extension/background.js','utf8'),context);await vm.runInContext('ready',context);
 return {context,browser,stored,clicked,call:(method,p={})=>vm.runInContext(`dispatch(${JSON.stringify(method)},${JSON.stringify(p)})`,context)};
}
test('paused extension rejects native commands',async()=>{const s=await setup();await assert.rejects(s.call('windows.remove',{windowId:1}),/paused/);});
test('user scripts are scoped to their frame origin',async()=>{
 const s=await setup();vm.runInContext('config.enabled=true',s.context);
 await s.call('eval',{tabId:1,code:'return document.title'});const script=s.stored.scripts[0];assert.equal(script.origin,'https://a.test');
 s.browser.webNavigation.getAllFrames=async()=>[{frameId:0,url:'https://b.test/'}];
 await assert.rejects(s.call('scripts.run',{tabId:1,id:script.id}),/another origin/);
 await assert.rejects(s.call('eval',{tabId:1,allFrames:true,code:'return 1'}),/one explicit frame/);
});
test('only allowlisted commands and exact frames are accepted',async()=>{
 const s=await setup();vm.runInContext('config.enabled=true',s.context);
 await assert.rejects(s.call('runtime.sendNativeMessage'),/Unknown method/);
 await assert.rejects(s.call('eval',{tabId:1,frameId:0,allFrames:true,code:'return 1'}),/not both/);
});
