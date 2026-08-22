/* ============ PRICE WATCH tab ============ */
let _prMode="season";
async function initPrices(){
  await loadBoot();
  $("prMode").addEventListener("click",e=>{const x=e.target.closest("button");if(!x)return;
    $("prMode").querySelectorAll("button").forEach(y=>y.classList.remove("active"));x.classList.add("active");
    _prMode=x.dataset.m; drawPrices();});
  drawPrices();
}
function pricePlayerRow(e,dir,main,sub){
  const b=boot,t=b.teams.find(z=>z.id===e.team)||{};
  return `<div class="pr-row"><div class="pr-player">${teamKitImg(t,"pr-kit",`${t.name||"Club"} kit`)}<div class="l">
    <div class="nm">${esc(e.web_name)}</div>
    <div class="mt">${esc(t.short_name||"")} · ${POS[e.element_type]} · ${money(e.now_cost)}${sub?` · ${sub}`:""}</div>
  </div></div><div class="pc ${dir||""}">${main}</div></div>`;
}
function drawPrices(){
  const b=boot;
  const started=seasonStarted();
  const field=_prMode==="season"?"cost_change_start":"cost_change_event";
  const withChange=(b.elements||[]).filter(e=>Number(e[field]||0)!==0);
  const risers=withChange.filter(e=>Number(e[field])>0).sort((a,c)=>Number(c[field])-Number(a[field])||Number(c.transfers_in_event||0)-Number(a.transfers_in_event||0)).slice(0,25);
  const fallers=withChange.filter(e=>Number(e[field])<0).sort((a,c)=>Number(a[field])-Number(c[field])||Number(c.transfers_out_event||0)-Number(a.transfers_out_event||0)).slice(0,25);
  const label=_prMode==="season"?"since season start":"this Gameweek";
  const changeText=e=>{const ch=Number(e[field]||0)/10;return `${ch>0?"+":""}£${ch.toFixed(1)}m`;};

  const status=$("prStatus");
  if(!started){
    status.innerHTML=`<div class="price-status-card"><b>Waiting for Gameweek 1</b><span>Official price changes and Gameweek transfer activity become meaningful once the season starts.</span></div>`;
  }else if(!withChange.length){
    status.innerHTML=`<div class="price-status-card live"><b>GW1 is live — no official price changes recorded yet</b><span>FPL has not changed any player prices for ${label} yet. Transfer activity is already available below and will update as managers buy and sell players.</span></div>`;
  }else{
    status.innerHTML=`<div class="price-status-card live"><b>${withChange.length} official price change${withChange.length===1?"":"s"} recorded ${label}</b><span>These are taken from FPL's current <code>now_cost</code> and price-change fields.</span></div>`;
  }

  $("prUp").innerHTML=risers.length?risers.map(e=>pricePlayerRow(e,"up",changeText(e),`${Number(e.transfers_in_event||0).toLocaleString()} in GW`)).join(""):`<div class="price-empty"><b>No official risers yet.</b><span>Prices only appear here after FPL actually applies a price increase.</span></div>`;
  $("prDown").innerHTML=fallers.length?fallers.map(e=>pricePlayerRow(e,"down",changeText(e),`${Number(e.transfers_out_event||0).toLocaleString()} out GW`)).join(""):`<div class="price-empty"><b>No official fallers yet.</b><span>Prices only appear here after FPL actually applies a price decrease.</span></div>`;

  const elements=(b.elements||[]).filter(e=>e.status!=="u");
  const incoming=[...elements].filter(e=>Number(e.transfers_in_event||0)>0)
    .sort((a,c)=>Number(c.transfers_in_event||0)-Number(a.transfers_in_event||0)).slice(0,12);
  const outgoing=[...elements].filter(e=>Number(e.transfers_out_event||0)>0)
    .sort((a,c)=>Number(c.transfers_out_event||0)-Number(a.transfers_out_event||0)).slice(0,12);
  const net=e=>Number(e.transfers_in_event||0)-Number(e.transfers_out_event||0);
  $("prIn").innerHTML=incoming.length?incoming.map(e=>pricePlayerRow(e,"up",`+${Number(e.transfers_in_event||0).toLocaleString()}`,`net ${net(e)>=0?"+":""}${net(e).toLocaleString()}`)).join(""):`<div class="price-empty"><b>No transfer-in data yet.</b></div>`;
  $("prOut").innerHTML=outgoing.length?outgoing.map(e=>pricePlayerRow(e,"down",`−${Number(e.transfers_out_event||0).toLocaleString()}`,`net ${net(e)>=0?"+":""}${net(e).toLocaleString()}`)).join(""):`<div class="price-empty"><b>No transfer-out data yet.</b></div>`;
}

async function loadOfficialPricePredictor(){
  const box=$("prPredictorBody");
  if(!box) return;
  try{
    const r=await fetch("/.netlify/functions/price-predictor",{headers:{Accept:"application/json"}});
    const data=await r.json();
    if(!data.available){
      box.className="price-predictor-state";
      box.innerHTML=`<b>Official predictor feed not available through the public JSON API yet</b><span>${esc(data.reason||"FPL's predictor is live on the official website, but its underlying feed is not currently exposed to FPL Peek.")}</span>`;
      return;
    }
    const map=new Map((boot.elements||[]).map(e=>[Number(e.id),e]));
    const rows=(data.predictions||[]).map(x=>({...x,e:map.get(Number(x.element))})).filter(x=>x.e);
    const score=x=>Number(x.predicted_progress??x.current_progress??0)||0;
    const rises=rows.filter(x=>x.direction==="rise").sort((a,b)=>score(b)-score(a)).slice(0,15);
    const falls=rows.filter(x=>x.direction==="fall").sort((a,b)=>score(b)-score(a)).slice(0,15);
    const label=x=>{
      const v=score(x);
      if(v>=100) return x.direction==="rise"?"Very likely to rise":"Very likely to fall";
      if(v>=80) return x.direction==="rise"?"Likely to rise":"Likely to fall";
      if(v>=60) return x.direction==="rise"?"Rise watch":"Fall watch";
      return "Progress";
    };
    const row=x=>{
      const e=x.e,t=boot.teams.find(z=>z.id===e.team)||{},v=score(x),pct=Math.min(100,Math.max(2,v));
      return `<div class="price-pred-row"><div class="price-pred-player">${teamKitImg(t,"price-pred-kit",`${t.name||"Club"} kit`)}<div><b>${esc(e.web_name)}</b><small>${esc(t.short_name||"")} · ${POS[e.element_type]} · ${money(e.now_cost)}</small></div></div><div class="price-progress ${x.direction}"><b>${v.toFixed(0)}%</b><small>${esc(x.label||label(x))}</small><div class="price-progress-bar"><i style="width:${pct}%"></i></div></div></div>`;
    };
    box.className="";
    box.innerHTML=`<div class="price-pred-grid"><div class="price-pred-col"><div class="price-pred-col-head">Predicted rises</div>${rises.length?rises.map(row).join(""):`<div class="price-predictor-state">No official rise candidates returned right now.</div>`}</div><div class="price-pred-col"><div class="price-pred-col-head">Predicted falls</div>${falls.length?falls.map(row).join(""):`<div class="price-predictor-state">No official fall candidates returned right now.</div>`}</div></div>`;
  }catch(e){
    box.className="price-predictor-state";
    box.innerHTML=`<b>Couldn't load the official predictor right now</b><span>${esc(e.message||"Try again shortly.")}</span>`;
  }
}

const _originalInitPrices=initPrices;
initPrices=async function(){
  await _originalInitPrices();
  loadOfficialPricePredictor();
};
