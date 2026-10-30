async function render(){
  const scripts=await browser.runtime.sendMessage({method:'scripts.list'});
  const root=document.getElementById('scripts');root.replaceChildren();
  for(const script of scripts){
    const row=document.createElement('article'), code=document.createElement('pre'), title=document.createElement('p'), button=document.createElement('button');
    title.textContent=script.name+' · '+script.origin;code.textContent=script.code;button.textContent='×';button.setAttribute('aria-label','Remove '+script.name);button.title='Remove script';
    button.onclick=async()=>{await browser.runtime.sendMessage({method:'scripts.remove',params:{id:script.id}});render();};
    row.append(button,title,code);root.append(row);
  }
}
render();
