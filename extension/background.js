/* No remote code, HTTP listener, external messages or page-to-extension command channel. */
const HOST = 'com.anveio.firefox_control';
let port, retry, config;
const ready = browser.storage.local.get({profileId:crypto.randomUUID(),profileName:'',enabled:false,scripts:[]}).then(async value=>{config=value;await browser.storage.local.set(config);});
function badge(text,title) {browser.action.setBadgeText({text});browser.action.setTitle({title});browser.action.setBadgeBackgroundColor({color:'#14664e'});}
async function connect() {
  await ready;
  if(!config.enabled || port) return;
  try {
    const current=browser.runtime.connectNative(HOST);port=current;
    current.onMessage.addListener(async request=>{
      if(request.type==='hello')return;
      try {const result=await dispatch(request.method,request.params || {});send(current,{id:request.id,result:result ?? null});}
      catch(error){send(current,{id:request.id,error:{message:error.message}});}
    });
    current.onDisconnect.addListener(()=>{
      const error=browser.runtime.lastError;void error;
      if(port===current)port=undefined;
      if(config.enabled){badge('!','Firefox Control: companion unavailable; click to pause');retry=setTimeout(connect,3000);}
    });
    current.postMessage({type:'hello',profileId:config.profileId,name:config.profileName,version:browser.runtime.getManifest().version});
    badge('ON','Pause local Firefox control');
  }catch(error){badge('!','Firefox Control: '+error.message);retry=setTimeout(connect,3000);}
}
function send(current,message){try{current.postMessage(message);}catch{/* Client disconnected. */}}
browser.action.onClicked.addListener(()=>{
  // Request within the browser's user gesture, before awaiting storage.
  if(config?.enabled){config.enabled=false;browser.storage.local.set({enabled:false});clearTimeout(retry);port?.disconnect();port=undefined;badge('','Enable local Firefox control and user scripts');}
  else browser.permissions.request({permissions:['userScripts']}).then(async granted=>{
    if(!granted){badge('!','Firefox Control: user-script permission declined');return;}await ready;config.enabled=true;await browser.storage.local.set({enabled:true});connect();
  }).catch(error=>badge('!','Firefox Control: '+error.message));
});
browser.runtime.onMessage.addListener(async (message,sender)=>{
  if(sender.id!==browser.runtime.id || sender.url!==browser.runtime.getURL('options.html'))throw new Error('Untrusted sender');
  await ready;
  if(message.method==='scripts.list')return config.scripts;
  if(message.method==='scripts.remove')return removeScript(message.params.id);
  if(message.method==='status')return status();
  throw new Error('Unsupported settings operation');
});
function status(){return {profileId:config.profileId,name:config.profileName,enabled:config.enabled,connected:!!port,version:browser.runtime.getManifest().version};}
function target(p){
  if(!Number.isInteger(p.tabId))throw new Error('tabId must be an integer');
  if(p.allFrames && p.frameId!==undefined)throw new Error('Use frameId or allFrames, not both');
  return {tabId:p.tabId,...(p.allFrames?{allFrames:true}:{frameIds:[p.frameId ?? 0]})};
}
async function removeScript(id){config.scripts=config.scripts.filter(s=>s.id!==id);await browser.storage.local.set({scripts:config.scripts});return {removed:id};}
async function checked(promise){const results=await promise;const errors=results.filter(r=>r.error);if(errors.length)throw new Error(errors.map(r=>`Frame ${r.frameId}: ${r.error.message || String(r.error)}`).join('; '));return results;}
async function scriptRun(p){
  if(!browser.userScripts)throw new Error('Enable user scripts by clicking the extension toolbar icon');
  const t=target(p), tab=await browser.tabs.get(p.tabId);
  const frames=await browser.webNavigation.getAllFrames({tabId:p.tabId});
  const frame=frames.find(f=>f.frameId===(p.frameId ?? 0));
  const url=p.allFrames?tab.url:frame?.url;
  const script=p.id?config.scripts.find(s=>s.id===p.id):undefined;
  if(p.id && !script)throw new Error('Unknown script');
  if(script && script.origin!==new URL(url).origin)throw new Error('Saved script belongs to another origin');
  const code=script?.code ?? p.code;
  if(typeof code!=='string' || !code.trim() || code.length>100000)throw new Error('Provide 1–100000 characters of JavaScript');
  if(p.allFrames)throw new Error('Run user scripts in one explicit frame at a time');
  const entry=script || {id:crypto.randomUUID(),name:p.name || 'CLI script',origin:new URL(url).origin,code,createdAt:new Date().toISOString()};
  if(!script){config.scripts.push(entry);if(config.scripts.length>50)config.scripts.shift();await browser.storage.local.set({scripts:config.scripts});}
  const results=await checked(browser.userScripts.execute({target:t,world:p.world || 'MAIN',js:[{code:`(async()=>{${code}\n})()`}]}));
  return {scriptId:entry.id,results};
}
async function dispatch(method,p){
  await ready;
  if(!config.enabled)throw new Error('Local control is paused');
  switch(method){
    case 'status':return status();
    case 'extensions.info':case 'extensions.reload':{
      const id=p.id === 'self' ? browser.runtime.id : p.id;
      if(typeof id!=='string' || !id || id.length>255)throw new Error('Provide an extension ID or self');
      const message={protocol:'firefox-control-reload-v1',action:method==='extensions.info'?'info':'reload',reloadId:p.reloadId};
      if(id===browser.runtime.id)return handleControlReload(message);
      let result;
      try {result=await browser.runtime.sendMessage(id,message);}catch(error){throw new Error(`Cannot contact ${id}: install the development reload handler and reload it once. ${error.message}`);}
      if(result?.protocol!==message.protocol || result?.id!==id)throw new Error(`${id} does not support the development reload protocol`);
      return result;
    }
    case 'profile.rename':config.profileName=String(p.name).slice(0,80);await browser.storage.local.set({profileName:config.profileName});port.postMessage({type:'hello',profileId:config.profileId,name:config.profileName,version:browser.runtime.getManifest().version});return status();
    case 'windows.list':return browser.windows.getAll({populate:!!p.populate});
    case 'windows.create':return browser.windows.create(p);
    case 'windows.update':{const {windowId,...props}=p;return browser.windows.update(windowId,props);}
    case 'windows.remove':return browser.windows.remove(p.windowId);
    case 'tabs.list':return browser.tabs.query(p);
    case 'tabs.create':return browser.tabs.create(p);
    case 'tabs.update':{const {tabId,...props}=p;return browser.tabs.update(tabId,props);}
    case 'tabs.remove':return browser.tabs.remove(p.tabIds ?? p.tabId);
    case 'tabs.reload':return browser.tabs.reload(p.tabId,{bypassCache:!!p.bypassCache});
    case 'tabs.back':return browser.tabs.goBack(p.tabId);
    case 'tabs.forward':return browser.tabs.goForward(p.tabId);
    case 'tabs.move':{const {tabId,...props}=p;return browser.tabs.move(tabId,props);}
    case 'frames.list':return browser.webNavigation.getAllFrames({tabId:p.tabId});
    case 'containers.list':return browser.contextualIdentities.query({});
    case 'page':return checked(browser.scripting.executeScript({target:target(p),func:pageCommand,args:[p]}));
    case 'eval':case 'scripts.run':return scriptRun(p);
    case 'scripts.list':return config.scripts;
    case 'scripts.remove':return removeScript(p.id);
    case 'console':return checked(browser.scripting.executeScript({target:target(p),world:'MAIN',func:consoleCommand,args:[p]}));
    case 'screenshot':return browser.tabs.captureTab(p.tabId,{format:'png'});
    default:throw new Error(`Unknown method: ${method}`);
  }
}
ready.then(()=>{badge('','Enable local Firefox control and user scripts');connect();}).catch(error=>badge('!','Firefox Control startup: '+error.message));
