import http from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const exec=promisify(execFile), results=[];
async function cli(...args){const started=performance.now();const {stdout}=await exec(process.execPath,['cli/firefox-control.mjs',...args.map(String)]);const value=JSON.parse(stdout);results.push({command:args.slice(0,2),ms:Math.round(performance.now()-started)});return value;}
const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(req.url==='/frame'?`<!doctype html><title>Frame fixture</title><input id="inside" aria-label="Iframe field"><button id="frameButton" onclick="this.textContent='Frame clicked'">Frame button</button>`:`<!doctype html><html><title>Firefox Control live verification</title><style>body{font:20px system-ui;margin:50px;background:#172331;color:#e6fff5}input,button,select{font:inherit;padding:12px;margin:8px}iframe{display:block;width:80%;height:150px;background:white}#shadow{padding:20px}</style><h1>Firefox Control · live verification</h1><input id="name" aria-label="Name"><button id="hello" onclick="document.querySelector('#result').textContent='Hello '+document.querySelector('#name').value">Greet</button><select id="choice"><option value="a">A</option><option value="b">B</option></select><p id="result">Ready</p><div id="shadow"></div><iframe src="http://localhost:${server.address().port}/frame"></iframe><script>window.fixtureValue=42;const b=document.createElement('button');b.id='shadowButton';b.textContent='Shadow button';b.onclick=()=>b.textContent='Shadow clicked';document.querySelector('#shadow').attachShadow({mode:'open'}).append(b);</script></html>`);});
await new Promise(r=>server.listen(0,'::',r));
let win;
try{
 const status=await cli('status');assert.equal(status.version,'0.1.0');
 win=await cli('windows','create',JSON.stringify({url:`http://127.0.0.1:${server.address().port}/`,width:1100,height:850}));const tab=win.tabs[0].id;
 for(let i=0;i<100;i++){const tabs=await cli('tabs','list',JSON.stringify({windowId:win.id}));if(tabs[0].status==='complete' && tabs[0].url?.startsWith('http:'))break;await new Promise(r=>setTimeout(r,100));}
 await cli('wait',tab,'#name');
 await cli('fill',tab,'#name','CLI verified');await cli('click',tab,'#hello');
 let q=await cli('query',tab,'#result');assert.equal(q[0].result[0].text,'Hello CLI verified');
 await cli('select',tab,'#choice','b');q=await cli('query',tab,'#choice');assert.equal(q[0].result[0].value,'b');
 await cli('click',tab,'#shadowButton');q=await cli('query',tab,'#shadowButton');assert.equal(q[0].result[0].text,'Shadow clicked');
 const frames=await cli('frames',tab);const child=frames.find(f=>f.parentFrameId===0);assert.ok(child);
 await cli('fill',tab,'#inside','Cross-origin frame verified','--frame',child.frameId);
 await cli('click',tab,'#frameButton','--frame',child.frameId);
 q=await cli('query',tab,'#inside','--frame',child.frameId);assert.equal(q[0].result[0].value,'Cross-origin frame verified');
 const evaluated=await cli('eval',tab,'return {value:window.fixtureValue,title:document.title}');assert.equal(evaluated.results[0].result.value,42);
 const iframeEval=await cli('eval',tab,'return document.querySelector("#inside").value','--frame',child.frameId);assert.equal(iframeEval.results[0].result,'Cross-origin frame verified');
 await cli('console','start',tab);const logged=await cli('eval',tab,'console.log("verified console"); return 7');assert.equal(logged.results[0].result,7);
 const logs=await cli('console','read',tab);assert.ok(logs[0].result.entries.some(e=>e.args[0]==='verified console'));
 await cli('console','stop',tab);
 const snap=await cli('snapshot',tab,'--all-frames');assert.equal(snap.length,2);
 const extra=await cli('tabs','create',JSON.stringify({windowId:win.id,url:'about:blank',active:false}));
 await cli('tabs','update',extra.id,JSON.stringify({pinned:true}));
 await cli('tabs','delete',extra.id);
 await cli('windows','update',win.id,JSON.stringify({width:1150,height:850}));
 await cli('screenshot',tab,'--out','artifacts/live-firefox.png');
 await cli('containers');
 for(const entry of [evaluated,iframeEval,logged])await cli('scripts','delete',entry.scriptId);
 await fs.writeFile('artifacts/live-results.json',JSON.stringify({status,windowId:win.id,tabId:tab,frames,results,passed:true},null,2));
 console.log(JSON.stringify({passed:true,commands:results.length,windowId:win.id,tabId:tab,averageMs:Math.round(results.reduce((s,r)=>s+r.ms,0)/results.length)},null,2));
 // Keep the test page visible for native visual verification. Server exits after 5 minutes.
 setTimeout(()=>server.close(),300000).unref();
}catch(error){server.close();console.error(error);process.exitCode=1;}
