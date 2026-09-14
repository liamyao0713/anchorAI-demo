const CDP="http://127.0.0.1:9222"; const sleep=(m)=>new Promise(r=>setTimeout(r,m));
const t=(await (await fetch(`${CDP}/json/list`)).json()).find(x=>x.type==="page");
const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r);
let id=0; const pend=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}};
const send=(me,pa={})=>new Promise(res=>{const n=++id;pend.set(n,res);ws.send(JSON.stringify({id:n,method:me,params:pa}));});
const ev=async(x)=>(await send("Runtime.evaluate",{expression:x,returnByValue:true,awaitPromise:true})).result?.result?.value;
await send("Page.enable"); await send("Runtime.enable");
await send("Page.navigate",{url:process.argv[2]}); await sleep(3500);
const R = await ev(`(() => {
  const cs = (sel, props) => { const el=document.querySelector(sel); if(!el) return null;
    const c=getComputedStyle(el); const o={}; props.forEach(p=>o[p]=c[p]); return o; };
  return {
    note: cs(".aw-panel-note", ["backgroundColor","color","fontSize","borderRadius","padding"]),
    letter: cs(".aw-letter", ["width","height","backgroundColor","color"]),
    panelA: cs(".aw-panel-a", ["borderColor","borderRadius","boxShadow"]),
    panelB: cs(".aw-panel-b", ["borderColor"]),
    panelC: cs(".aw-panel-c", ["borderColor"]),
    head: cs(".aw-panel-head", ["padding","fontSize","fontWeight","backgroundImage"]),
    switchEl: cs(".aw-switch", ["width","height"]),
    titleClipped: (() => { const h=document.querySelector("#aw-corrected-title");
      return h ? h.scrollWidth > h.clientWidth + 1 : null; })(),
  };
})()`);
console.log(JSON.stringify(R, null, 2));
ws.close();
