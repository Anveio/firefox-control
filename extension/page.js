/* Packaged DOM operations. Executed in an isolated content-script world. */
async function pageCommand(p) {
  const roots = [document];
  function discover(root) { for (const el of root.querySelectorAll('*')) if (el.shadowRoot) { roots.push(el.shadowRoot); discover(el.shadowRoot); } }
  discover(document);
  const query = selector => roots.flatMap(root => [...root.querySelectorAll(selector)]);
  const describe = el => {
    const r = el.getBoundingClientRect();
    return {tag: el.localName, id: el.id || undefined, role: el.getAttribute('role') || undefined,
      name: el.getAttribute('aria-label') || el.getAttribute('alt') || el.getAttribute('title') || undefined,
      text: (el.innerText || el.textContent || '').trim().slice(0, 500),
      value: el.type === 'password' ? '[redacted]' : el.value,
      href: el.href, type: el.type, disabled: el.disabled,
      rect: {x:r.x,y:r.y,width:r.width,height:r.height}};
  };
  if (p.action === 'snapshot') return {url:location.href,title:document.title,
    text:(document.body?.innerText || '').slice(0,p.limit || 12000),
    elements:query('a,button,input,textarea,select,[role],[contenteditable="true"]').slice(0,200).map(describe)};
  if (p.action === 'query') return query(p.selector).slice(0,p.limit || 100).map(describe);
  if (p.action === 'wait') {
    const until = Date.now() + Math.min(p.timeout || 10000, 25000);
    do { const el = query(p.selector)[0]; if (el) return describe(el); await new Promise(r=>setTimeout(r,100)); } while(Date.now()<until);
    throw new Error(`Selector not found: ${p.selector}`);
  }
  const elements = p.selector ? query(p.selector) : [document.scrollingElement];
  if (elements.length !== 1) throw new Error(`Expected one element; found ${elements.length}. Use a unique CSS selector (open shadow roots are searched).`);
  const el = elements[0];
  if (p.action === 'click') { el.scrollIntoView({block:'center'}); el.click(); }
  else if (p.action === 'fill') {
    el.focus();
    if (el.isContentEditable) el.textContent = p.value;
    else {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto,'value')?.set;
      if (!setter) throw new Error('Element cannot be filled');
      setter.call(el,p.value);
    }
    el.dispatchEvent(new InputEvent('input',{bubbles:true,composed:true,inputType:'insertText',data:p.value}));
    el.dispatchEvent(new Event('change',{bubbles:true}));
  } else if (p.action === 'select') {
    if (!(el instanceof HTMLSelectElement)) throw new Error('Expected a select element');
    el.value=p.value; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true}));
  } else if (p.action === 'key') {
    el.focus();
    for (const type of ['keydown','keyup']) el.dispatchEvent(new KeyboardEvent(type,{key:p.key,code:p.code || p.key,bubbles:true,composed:true,...p.modifiers}));
  } else if (p.action === 'scroll') el.scrollBy({left:p.x || 0,top:p.y || 0,behavior:'instant'});
  else throw new Error(`Unknown page action: ${p.action}`);
  return {ok:true,element:describe(el)};
}

/* Explicitly started console recording, scoped to a tab/frame until navigation. */
function consoleCommand(p) {
  const key = '__firefoxControlConsole_v1';
  if (p.action === 'start' && !window[key]) {
    const state={entries:[],originals:{}};
    window[key]=state;
    const record = (level,args) => {
      const values=args.map(x=>{try{return typeof x==='string'?x:JSON.stringify(x);}catch{return String(x);}});
      state.entries.push({time:Date.now(),level,args:values.map(x=>String(x).slice(0,4000))});
      if(state.entries.length>200) state.entries.shift();
    };
    for(const level of ['log','info','warn','error','debug']) {
      state.originals[level]=console[level];
      console[level]=function(...args){record(level,args);return state.originals[level].apply(console,args);};
    }
    state.error=e=>record('error',[e.message]);
    state.rejection=e=>record('unhandledrejection',[String(e.reason)]);
    window.addEventListener('error',state.error); window.addEventListener('unhandledrejection',state.rejection);
  }
  const state=window[key];
  if (p.action==='stop' && state) {
    Object.assign(console,state.originals);window.removeEventListener('error',state.error);window.removeEventListener('unhandledrejection',state.rejection);delete window[key];return {stopped:true};
  }
  if(p.action==='clear' && state)state.entries=[];
  return {recording:!!state,entries:state?.entries || []};
}
