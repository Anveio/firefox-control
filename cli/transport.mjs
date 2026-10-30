import net from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
export const ROOT=process.env.FIREFOX_CONTROL_HOME || path.join(os.homedir(),'.local/share/firefox-control');
export const RUNTIME=path.join(ROOT,'run');
export const MAX=8*1024*1024;
export async function privateDir(dir){await fs.mkdir(dir,{recursive:true,mode:0o700});const stat=await fs.lstat(dir);if(!stat.isDirectory() || stat.uid!==process.getuid())throw new Error('Unsafe runtime directory');await fs.chmod(dir,0o700);}
export function nativeDecoder(onMessage,onError){
  let buffer=Buffer.alloc(0);
  return chunk=>{try{
    buffer=Buffer.concat([buffer,chunk]);
    while(buffer.length>=4){const size=buffer.readUInt32LE(0);if(size>MAX)throw new Error('Native message exceeds size limit');if(buffer.length<size+4)break;const value=JSON.parse(buffer.subarray(4,4+size).toString());buffer=buffer.subarray(4+size);onMessage(value);}
  }catch(error){onError(error);}};
}
export function encodeNative(value){const body=Buffer.from(JSON.stringify(value));if(body.length>MAX)throw new Error('Message too large');const size=Buffer.alloc(4);size.writeUInt32LE(body.length);return Buffer.concat([size,body]);}
export async function host(){
  await privateDir(RUNTIME);
  let server, socketPath, metaPath, profileId;
  const pending=new Map(),clients=new Set();
  function sendNative(value){process.stdout.write(encodeNative(value));}
  function finish(){for(const entry of pending.values()){clearTimeout(entry.timer);entry.client.end(JSON.stringify({error:{message:'Firefox disconnected'}})+'\n');}server?.close();if(socketPath)fs.unlink(socketPath).catch(()=>{});if(metaPath)fs.unlink(metaPath).catch(()=>{});}
  let chain=Promise.resolve();
  const receive=async value=>{
    if(value.type==='hello'){
      if(!/^[a-f0-9-]{36}$/.test(value.profileId))throw new Error('Invalid profile identifier');
      if(profileId && value.profileId!==profileId)throw new Error('Profile identity changed');
      profileId=value.profileId;
      if(!server){
        socketPath=path.join(RUNTIME,`${profileId}-${process.pid}.sock`);metaPath=socketPath+'.json';
        if(Buffer.byteLength(socketPath)>100)throw new Error('Socket path too long; use a shorter FIREFOX_CONTROL_HOME');
        server=net.createServer(client=>{
          client.setEncoding('utf8');clients.add(client);client.setTimeout(35000,()=>client.destroy());let input='';let used=false;
          client.on('data',chunk=>{
            input+=chunk.toString();if(Buffer.byteLength(input)>MAX){client.destroy();return;}
            if(used || !input.includes('\n'))return;used=true;
            try{
              const request=JSON.parse(input.slice(0,input.indexOf('\n')));
              if(typeof request.method!=='string' || !request.params || typeof request.params!=='object' || Array.isArray(request.params))throw new Error('Invalid request');
              const id=crypto.randomUUID();
              const timer=setTimeout(()=>{pending.delete(id);client.end(JSON.stringify({error:{message:'Command timed out; it may still finish in Firefox. Do not blindly retry mutations.'}})+'\n');},30000);
              pending.set(id,{client,timer});sendNative({id,method:request.method,params:request.params});
              client.on('close',()=>{const entry=pending.get(id);if(entry){clearTimeout(entry.timer);pending.delete(id);}});
            }catch(error){client.end(JSON.stringify({error:{message:error.message}})+'\n');}
          });
          client.on('error',()=>{});client.on('close',()=>clients.delete(client));
        });
        await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(socketPath,resolve);});await fs.chmod(socketPath,0o600);
      }
      await fs.writeFile(metaPath,JSON.stringify({profileId,name:value.name || '',version:value.version,pid:process.pid,socket:socketPath}),{mode:0o600});
      sendNative({type:'hello'});return;
    }
    const entry=pending.get(value.id);if(!entry)return;pending.delete(value.id);clearTimeout(entry.timer);entry.client.end(JSON.stringify(value)+'\n');
  };
  process.stdin.on('data',nativeDecoder(value=>{chain=chain.then(()=>receive(value)).catch(error=>{process.stderr.write(error.message+'\n');finish();process.exit(1);});},error=>{process.stderr.write(error.message+'\n');finish();process.exit(1);}));
  process.stdin.on('end',()=>{finish();process.exit(0);});process.on('SIGTERM',()=>{finish();process.exit(0);});
}
export async function profiles(){
  await privateDir(RUNTIME);const results=[];
  for(const name of await fs.readdir(RUNTIME)){
    if(!name.endsWith('.sock.json'))continue;
    try{const value=JSON.parse(await fs.readFile(path.join(RUNTIME,name),'utf8'));process.kill(value.pid,0);
      await new Promise((resolve,reject)=>{const socket=net.connect(value.socket);socket.setTimeout(200,()=>{socket.destroy();reject(new Error('offline'));});socket.on('connect',()=>{socket.destroy();resolve();});socket.on('error',reject);});results.push(value);
    }catch{/* Ignore stale or inaccessible sessions; never unlink another live host's socket. */}
  }return results;
}
export async function request(method,params={},profile){
  const available=await profiles();
  const matches=profile?available.filter(p=>p.profileId===profile || p.name===profile):available;
  if(matches.length!==1)throw new Error(matches.length?'Multiple Firefox sessions match; use --profile with an exact profile ID.':'No connected Firefox profile. Install the companion and extension, then click its toolbar icon.');
  return new Promise((resolve,reject)=>{
    const socket=net.connect(matches[0].socket);socket.setEncoding('utf8');let input='';
    socket.setTimeout(32000,()=>{socket.destroy();reject(new Error('Firefox command timed out; outcome may be unknown.'));});
    socket.on('connect',()=>socket.write(JSON.stringify({method,params})+'\n'));
    socket.on('data',chunk=>{input+=chunk;if(Buffer.byteLength(input)>MAX){socket.destroy();reject(new Error('Response too large'));return;}if(!input.includes('\n'))return;
      socket.end();try{const value=JSON.parse(input.slice(0,input.indexOf('\n')));if(value.error)reject(new Error(value.error.message));else resolve(value.result);}catch(error){reject(error);}
    });socket.on('error',reject);socket.on('end',()=>{if(!input.includes('\n'))reject(new Error('Firefox disconnected before a response'));});
  });
}
