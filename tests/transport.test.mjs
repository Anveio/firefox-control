import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {nativeDecoder,encodeNative,MAX} from '../cli/transport.mjs';
test('native framing tolerates fragmented and coalesced messages',()=>{
 const values=[],errors=[];const decode=nativeDecoder(x=>values.push(x),e=>errors.push(e));
 const bytes=Buffer.concat([encodeNative({x:'😀'}),encodeNative({y:2})]);
 for(let i=0;i<bytes.length;i+=3)decode(bytes.subarray(i,i+3));
 assert.deepEqual(values,[{x:'😀'},{y:2}]);assert.deepEqual(errors,[]);
});
test('rejects oversized and malformed native frames',()=>{
 let count=0;const size=Buffer.alloc(4);size.writeUInt32LE(MAX+1);nativeDecoder(()=>assert.fail(),()=>count++)(size);
 nativeDecoder(()=>assert.fail(),()=>count++)(Buffer.from([1,0,0,0,123]));assert.equal(count,2);
});
test('real native host routes concurrent clients and cleans up',async()=>{
 const dir=await fs.mkdtemp('/tmp/fc-');const id='01234567-0123-4123-8123-0123456789ab';
 const proc=spawn(process.execPath,['cli/firefox-control.mjs','host'],{env:{...process.env,FIREFOX_CONTROL_HOME:dir},stdio:['pipe','pipe','pipe']});
 let stderr='';proc.stderr.on('data',x=>stderr+=x);
 const requests=[];proc.stdout.on('data',nativeDecoder(x=>{if(x.type!=='hello'){requests.push(x);proc.stdin.write(encodeNative({id:x.id,result:x.params}));}},e=>assert.fail(e)));
 try{
  proc.stdin.write(encodeNative({type:'hello',profileId:id,name:'Test',version:'0.1.0'}));
  let meta;for(let i=0;i<100;i++){const names=await fs.readdir(path.join(dir,'run')).catch(()=>[]);if(names.some(n=>n.endsWith('.json'))){meta=JSON.parse(await fs.readFile(path.join(dir,'run',names.find(n=>n.endsWith('.json'))),'utf8'));break;}await new Promise(r=>setTimeout(r,20));}
  assert.ok(meta,stderr);assert.equal((await fs.stat(path.join(dir,'run'))).mode&0o777,0o700);assert.equal((await fs.stat(meta.socket)).mode&0o777,0o600);
  const send=n=>new Promise((resolve,reject)=>{const socket=net.connect(meta.socket);let data='';socket.on('connect',()=>socket.write(JSON.stringify({method:'status',params:{n}})+'\n'));socket.on('data',x=>data+=x);socket.on('end',()=>resolve(JSON.parse(data)));socket.on('error',reject);});
  const values=await Promise.all([send(1),send(2),send(3)]);assert.deepEqual(values.map(x=>x.result.n),[1,2,3]);assert.equal(new Set(requests.map(x=>x.id)).size,3);
  const unicode=await new Promise((resolve,reject)=>{const socket=net.connect(meta.socket);socket.setNoDelay(true);socket.setEncoding('utf8');let data='';socket.on('connect',async()=>{for(const byte of Buffer.from(JSON.stringify({method:'echo',params:{text:'বাংলা 😺'}})+'\n')){socket.write(Buffer.from([byte]));await new Promise(r=>setTimeout(r,1));}});socket.on('data',x=>data+=x);socket.on('end',()=>resolve(JSON.parse(data)));socket.on('error',reject);});assert.equal(unicode.result.text,'বাংলা 😺');
 }finally{proc.stdin.end();if(proc.exitCode===null)await new Promise(resolve=>proc.on('exit',resolve));await fs.rm(dir,{recursive:true,force:true});}
});
