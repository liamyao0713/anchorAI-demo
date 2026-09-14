const CDP="http://127.0.0.1:9222"; const sleep=(m)=>new Promise(r=>setTimeout(r,m));
const t=(await (await fetch(`${CDP}/json/list`)).json()).find(x=>x.type==="page");
const ws=new WebSocket(t.webSocketDebuggerUrl); await new Promise(r=>ws.onopen=r);
let id=0; const pend=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data); if(m.id&&pend.has(m.id)){pend.get(m.id)(m);pend.delete(m.id);}};
const send=(me,pa={})=>new Promise(res=>{const n=++id;pend.set(n,res);ws.send(JSON.stringify({id:n,method:me,params:pa}));});
const ev=async(x)=>(await send("Runtime.evaluate",{expression:x,returnByValue:true,awaitPromise:true})).result?.result?.value;
await send("Page.enable"); await send("Runtime.enable");
await send("Page.navigate",{url:process.argv[2]}); await sleep(3000);
await ev(`(()=>{const q=document.querySelector("#aw-question");
 const set=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value").set;
 set.call(q, ${JSON.stringify(process.argv[3])}); q.dispatchEvent(new Event("input",{bubbles:true}));
 document.querySelector("#aw-question-form").requestSubmit(); return 1;})()`);
process.stdout.write("  等待");
for(let i=0;i<120;i++){await sleep(2000);process.stdout.write(".");
 if((await ev(`document.querySelectorAll("#aw-corrected-text .aw-seg").length`))>3) break;}
process.stdout.write("\n");
// 切到 tracked 才能看到修订标记
await ev(`document.querySelector('.aw-mode-button[data-mode="tracked"]').click(); 1`);
await sleep(600);
const R = await ev(`(()=>{
 const cs=(sel,props)=>{const el=document.querySelector(sel); if(!el) return null;
  const c=getComputedStyle(el); const o={}; props.forEach(p=>o[p]=c[p]); return o;};
 const before=(sel)=>{const el=document.querySelector(sel); if(!el) return null;
  return getComputedStyle(el,"::before").content;};
 return {
  was: cs(".aw-seg--severe .aw-seg__was",["display","backgroundColor","color","textDecorationLine"]),
  wasGlyph: before(".aw-seg--severe .aw-seg__was"),
  fix: cs(".aw-seg__fix",["display","backgroundColor","borderBottom","cursor"]),
  fixGlyph: before(".aw-seg__fix"),
  fixTitle: document.querySelector(".aw-seg__fix")?.title || null,
  note: cs(".aw-seg__note",["display","backgroundColor","color","borderLeft","fontSize"]),
  noteGlyph: before(".aw-seg__note"),
  list: cs(".aw-seg-list",["paddingLeft"]),
  counts: {segs:document.querySelectorAll("#aw-corrected-text .aw-seg").length,
           was:document.querySelectorAll(".aw-seg__was").length,
           fix:document.querySelectorAll(".aw-seg__fix").length,
           note:document.querySelectorAll(".aw-seg__note").length},
 };})()`);
console.log(JSON.stringify(R,null,2));
// 点中间开关，验证自动切换
const before = await ev(`document.querySelector(".aw-mode-button.active").dataset.mode`);
await ev(`document.querySelector(".aw-switch").click(); 1`); await sleep(400);
const after = await ev(`document.querySelector(".aw-mode-button.active").dataset.mode`);
console.log(`  点开关: ${before} -> ${after}  ${before!==after?"✓":"✗"}`);
await ev(`document.querySelector(".aw-switch").click(); 1`); await sleep(400);
const back = await ev(`document.querySelector(".aw-mode-button.active").dataset.mode`);
console.log(`  再点一次: ${after} -> ${back}  ${back===before?"✓":"✗"}`);
await ev(`document.querySelector('.aw-mode-button[data-mode="tracked"]').click(); 1`); await sleep(500);
const shot=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:true});
const {writeFileSync}=await import("node:fs");
writeFileSync(process.argv[4], Buffer.from(shot.result.data,"base64"));
console.log("  截图:",process.argv[4]);
ws.close();
