/* ============ PRICE WATCH tab ============ */
let _prMode="season";
async function initPrices(){
  await loadBoot();
  $("prMode").addEventListener("click",e=>{const x=e.target.closest("button");if(!x)return;
    $("prMode").querySelectorAll("button").forEach(y=>y.classList.remove("active"));x.classList.add("active");
    _prMode=x.dataset.m; drawPrices();});
  drawPrices();
}
function drawPrices(){
  const b=boot;
  if(_prMode==="event" && !seasonStarted()){
    $("prUp").innerHTML=""; $("prDown").innerHTML="";
    $("prUp").closest(".two-col").insertAdjacentHTML("beforebegin","");
    // render notice spanning both columns
    document.querySelector("#tab-prices .two-col").style.display="none";
    let n=document.getElementById("prNotice");
    if(!n){ n=document.createElement("div"); n.id="prNotice"; document.querySelector("#tab-prices .two-col").after(n); }
    n.innerHTML=gwStartNotice("Gameweek price changes"); n.style.display="block";
    return;
  }
  const tw=document.querySelector("#tab-prices .two-col"); if(tw) tw.style.display="";
  const n=document.getElementById("prNotice"); if(n) n.style.display="none";
  const field=_prMode==="season"?"cost_change_start":"cost_change_event";
  const withChange=b.elements.filter(e=>e[field]!==0);
  const risers=withChange.filter(e=>e[field]>0).sort((a,c)=>c[field]-a[field]).slice(0,25);
  const fallers=withChange.filter(e=>e[field]<0).sort((a,c)=>a[field]-c[field]).slice(0,25);
  const row=(e,dir)=>{
    const t=b.teams.find(z=>z.id===e.team)||{};
    const ch=e[field]/10;
    return `<div class="pr-row"><div class="l">
      <div class="nm">${esc(e.web_name)}</div>
      <div class="mt">${esc(t.short_name||"")} · ${POS[e.element_type]} · now ${money(e.now_cost)}</div>
    </div><div class="pc ${dir}">${ch>0?"+":""}£${ch.toFixed(1)}m</div></div>`;
  };
  $("prUp").innerHTML=risers.length?risers.map(e=>row(e,"up")).join(""):`<div class="mt" style="color:var(--dim);padding:10px">No risers ${_prMode==="event"?"this gameweek":"yet"}.</div>`;
  $("prDown").innerHTML=fallers.length?fallers.map(e=>row(e,"down")).join(""):`<div class="mt" style="color:var(--dim);padding:10px">No fallers ${_prMode==="event"?"this gameweek":"yet"}.</div>`;
}

