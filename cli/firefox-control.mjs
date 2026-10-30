#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {ROOT,privateDir,host,profiles,request} from './transport.mjs';
const HELP=`firefox-control — local Firefox automation (JSON output; Node 22+, Firefox 153+)

Setup:
  firefox-control install             Install native companion for macOS/Linux
  firefox-control profiles            List connected profile IDs, names, versions
  firefox-control status [--profile ID]
  firefox-control profile rename NAME [--profile ID]

Browser (PROPS and QUERY are JSON objects, matching Firefox WebExtension APIs):
  firefox-control windows list [QUERY]
  firefox-control windows create [PROPS]
  firefox-control windows update ID PROPS
  firefox-control windows delete ID
  firefox-control tabs list [QUERY]
  firefox-control tabs create [PROPS]
  firefox-control tabs update ID PROPS
  firefox-control tabs delete ID
  firefox-control tabs reload|back|forward ID
  firefox-control tabs move ID PROPS
  firefox-control containers
  firefox-control frames TAB

Page (CSS searches the document and open shadow roots):
  firefox-control snapshot TAB [--frame ID] [--all-frames] [--limit N]
  firefox-control query TAB CSS [--frame ID] [--all-frames]
  firefox-control click TAB CSS [--frame ID]
  firefox-control fill TAB CSS VALUE [--frame ID]
  firefox-control select TAB CSS VALUE [--frame ID]
  firefox-control key TAB CSS KEY [--frame ID]
  firefox-control scroll TAB X Y [--selector CSS] [--frame ID]
  firefox-control wait TAB CSS [--frame ID] [--timeout MS]
  firefox-control eval TAB 'return document.title' [--frame ID] [--world MAIN|USER_SCRIPT]
  firefox-control eval TAB --file script.js [--frame ID]
  firefox-control eval TAB --stdin [--frame ID]
  firefox-control console start|read|clear|stop TAB [--frame ID]
  firefox-control screenshot TAB --out /absolute/path.png
  firefox-control scripts list
  firefox-control scripts run ID TAB [--frame ID]
  firefox-control scripts delete ID
  firefox-control rpc METHOD JSON      Same allowlisted API; no arbitrary browser API eval

Global: --profile ID|NAME selects one connected Firefox profile; required if ambiguous.
Use containers to identify cookieStoreId, then tabs create '{"url":"https://example.com",
"cookieStoreId":"firefox-container-1"}'. New tabs do not inherit a target container.

Install the signed extension, click its icon to enable local control and grant user
scripts, click again to pause. Extension Preferences shows removable saved scripts.
Scripts are async function bodies: use return for results; await works. eval is an
explicit one-shot user-script installation/execution, retained among the last 50
scripts for inspection/removal. Scripts run only on their saved origin. Page MAIN
world has website globals; USER_SCRIPT is isolated. Page scripts cannot call the
extension or native companion. No page data goes to a remote service by this tool.

Restricted Firefox pages (about:, browser UI, protected Mozilla sites) are not
scriptable. Closed shadow roots and trusted OS input are not supported. click/fill/
key use DOM events; key does not type text or perform native keyboard defaults.
Console captures only after start and resets on navigation; page code can alter it.
The local OS account can control connected profiles. Do not run untrusted scripts.
A timeout does not cancel a browser mutation; inspect before retrying.\n`;
function number(value,name='ID'){const n=Number(value);if(value===undefined || !Number.isInteger(n))throw new Error(name+' must be an integer');return n;}
function json(value='{}'){const result=JSON.parse(value);if(!result || typeof result!=='object' || Array.isArray(result))throw new Error('Expected a JSON object');return result;}
const shellQuote=s=>"'"+s.replaceAll("'","'\\''")+"'";
async function install(){
  if(!['darwin','linux'].includes(process.platform))throw new Error('Companion installer supports macOS and Linux');
  await privateDir(ROOT);
  const source=path.dirname(fileURLToPath(import.meta.url));const target=path.join(ROOT,'cli');await privateDir(target);
  for(const name of ['firefox-control.mjs','transport.mjs'])await fs.copyFile(path.join(source,name),path.join(target,name));
  const launcher=path.join(ROOT,'native-host');await fs.writeFile(launcher,`#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(path.join(target,'firefox-control.mjs'))} host\n`,{mode:0o700});
  const manifestDir=process.platform==='darwin'?path.join(os.homedir(),'Library/Application Support/Mozilla/NativeMessagingHosts'):path.join(os.homedir(),'.mozilla/native-messaging-hosts');
  await fs.mkdir(manifestDir,{recursive:true});
  await fs.writeFile(path.join(manifestDir,'com.anveio.firefox_control.json'),JSON.stringify({name:'com.anveio.firefox_control',description:'Firefox Control local CLI bridge',path:launcher,type:'stdio',allowed_extensions:['firefox-control@anveio.com']},null,2),{mode:0o600});
  const bin=path.join(os.homedir(),'.local/bin');await fs.mkdir(bin,{recursive:true});
  await fs.writeFile(path.join(bin,'firefox-control'),`#!/bin/sh\nexec ${shellQuote(process.execPath)} ${shellQuote(path.join(target,'firefox-control.mjs'))} "$@"\n`,{mode:0o700});
  return {installed:true,command:path.join(bin,'firefox-control'),nativeManifest:path.join(manifestDir,'com.anveio.firefox_control.json'),next:'Install the extension and click its toolbar icon to enable local control.'};
}
export async function main(argv){
  const args=[],opts={};const flags=new Set(['stdin','all-frames']);const valued=new Set(['profile','frame','limit','timeout','file','world','out','selector']);
  for(let i=0;i<argv.length;i++){const value=argv[i];if(value.startsWith('--')){const name=value.slice(2);if(name==='help'){console.log(HELP);return;}if(flags.has(name))opts[name]=true;else if(valued.has(name)){if(argv[i+1]===undefined)throw new Error('Missing value for '+value);opts[name]=argv[++i];}else throw new Error('Unknown option '+value);}else args.push(value);}
  const [cmd,sub,...rest]=args;
  if(!cmd || cmd==='help'){console.log(HELP);return;}
  if(cmd==='host'){await host();return;}
  if(cmd==='install')return install();
  if(cmd==='profiles')return profiles();
  const send=(method,params={})=>request(method,params,opts.profile);
  if(cmd==='status')return send('status');
  if(cmd==='profile' && sub==='rename')return send('profile.rename',{name:rest[0]});
  if(cmd==='rpc')return send(sub,json(rest[0]));
  if(cmd==='containers')return send('containers.list');
  if(cmd==='windows' || cmd==='tabs'){
    const id=cmd==='windows'?'windowId':'tabId',action=sub==='delete'?'remove':sub;
    if(['list','create'].includes(action))return send(cmd+'.'+action,json(rest[0]));
    if(['update','move'].includes(action))return send(cmd+'.'+action,{...json(rest[1]),[id]:number(rest[0])});
    if(['remove','reload','back','forward'].includes(action))return send(cmd+'.'+action,{[id]:number(rest[0])});
    throw new Error('Unknown browser action');
  }
  const frame={...(opts.frame!==undefined?{frameId:number(opts.frame,'frame')}:{}) ,...(opts['all-frames']?{allFrames:true}:{})};
  if(cmd==='scripts'){
    if(sub==='list')return send('scripts.list');
    if(sub==='delete')return send('scripts.remove',{id:rest[0]});
    if(sub==='run')return send('scripts.run',{id:rest[0],tabId:number(rest[1]),...frame});
    throw new Error('Unknown script action');
  }
  if(cmd==='console')return send('console',{action:sub,tabId:number(rest[0]),...frame});
  const tabId=number(sub,'tab');
  if(cmd==='frames')return send('frames.list',{tabId});
  if(cmd==='eval'){
    const code=opts.file?await fs.readFile(opts.file,'utf8'):opts.stdin?await (async()=>{let text='';for await(const chunk of process.stdin)text+=chunk;return text;})():rest[0];
    return send('eval',{tabId,code,world:opts.world || 'MAIN',...frame});
  }
  if(cmd==='screenshot'){
    if(!opts.out)throw new Error('screenshot requires --out');const data=await send('screenshot',{tabId});
    if(!data.startsWith('data:image/png;base64,'))throw new Error('Unexpected screenshot format');
    await fs.writeFile(opts.out,Buffer.from(data.split(',')[1],'base64'));return {path:path.resolve(opts.out)};
  }
  if(['snapshot','query','click','fill','select','key','scroll','wait'].includes(cmd)){
    const p={action:cmd,tabId,...frame};
    if(opts.limit)p.limit=number(opts.limit,'limit');if(opts.timeout)p.timeout=number(opts.timeout,'timeout');
    if(cmd==='scroll'){p.x=number(rest[0],'X');p.y=number(rest[1],'Y');p.selector=opts.selector;}
    else if(cmd!=='snapshot'){if(!rest[0])throw new Error('CSS selector required');p.selector=rest[0];}
    if(cmd==='fill' || cmd==='select'){if(rest[1]===undefined)throw new Error('Value required');p.value=rest[1];}
    if(cmd==='key')p.key=rest[1];return send('page',p);
  }
  throw new Error('Unknown command; run firefox-control --help');
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url))main(process.argv.slice(2)).then(result=>{if(result!==undefined)console.log(JSON.stringify(result,null,2));}).catch(error=>{console.error(JSON.stringify({error:error.message}));process.exitCode=1;});
