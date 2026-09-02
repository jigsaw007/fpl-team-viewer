/* ============ INJURIES tab ============ */
let _injFilter="all", _injQuery="";
async function initInjuries(){
  await loadBoot();
  $("injFilter").addEventListener("click",e=>{const x=e.target.closest("button");if(!x)return;
    $("injFilter").querySelectorAll("button").forEach(y=>y.classList.remove("active"));x.classList.add("active");
    _injFilter=x.dataset.f; drawInjuries();});
  $("injSearch").addEventListener("input",e=>{_injQuery=e.target.value.toLowerCase();drawInjuries();});
  drawInjuries();
}
function injStatus(e){
  // chance_of_playing_next_round: null=fine, 0=out, 25/50/75=doubt; status: a/d/i/s/u/n
  const c=e.chance_of_playing_next_round;
  if(e.status==="a" && (c===null||c===100)) return null; // available, no flag
  if(c===0 || e.status==="i" || e.status==="u" || e.status==="n" || e.status==="s") return {kind:"out",label:c===0?"Out":({i:"Injured",u:"Unavailable",n:"Ineligible",s:"Suspended"}[e.status]||"Out"),pct:c};
  return {kind:"doubt",label:(c!=null?`${c}% chance`:"Doubtful"),pct:c};
}
function drawInjuries(){
  const b=boot;
  let list=b.elements.map(e=>({e,s:injStatus(e)})).filter(x=>x.s);
  if(_injFilter==="out") list=list.filter(x=>x.s.kind==="out");
  else if(_injFilter==="doubt") list=list.filter(x=>x.s.kind==="doubt");
  if(_injQuery) list=list.filter(x=>x.e.web_name.toLowerCase().includes(_injQuery));
  // sort: out first, then by ownership desc (most-owned injuries matter most)
  list.sort((a,c)=>{
    if(a.s.kind!==c.s.kind) return a.s.kind==="out"?-1:1;
    return parseFloat(c.e.selected_by_percent)-parseFloat(a.e.selected_by_percent);
  });
  if(!list.length){ $("injBody").innerHTML=`<div class="tab-status">No flagged players match.</div>`; return; }
  $("injBody").innerHTML=list.map(({e,s})=>{
    const t=b.teams.find(z=>z.id===e.team)||{};
    const news=e.news?esc(e.news):(s.kind==="out"?"Ruled out":"Doubtful");
    return `<div class="inj-row inj-${s.kind}">
      <div class="inj-pill inj-${s.kind}">${s.kind==="out"?"OUT":(s.pct!=null?s.pct+"%":"DOUBT")}</div>
      ${teamKitImg(t,"inj-kit")}
      <div class="inj-info">
        <div class="inj-nm">${esc(e.web_name)} <span class="inj-meta">${esc(t.short_name||"")} · ${POS[e.element_type]} · ${money(e.now_cost)} · ${(+e.selected_by_percent).toFixed(1)}% owned</span></div>
        <div class="inj-news">${news}</div>
      </div>
    </div>`;
  }).join("");
}

