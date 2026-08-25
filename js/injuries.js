/* ============ INJURIES tab ============ */
let _injFilter="all", _injQuery="", _injClub=0, _injPos=0, _injPage=1;
const INJ_PAGE_SIZE=10;
function ensureInjuryFilters(){
  const body=$("injBody"),tab=document.getElementById("tab-injuries");if(!body||!tab)return;
  const oldCtl=tab.querySelector(".ctl");
  if(oldCtl && !document.getElementById("injClub")){
    oldCtl.classList.add("inj-toolbar");
    const search=oldCtl.querySelector(".field");
    const selects=document.createElement("div");selects.className="inj-selects";
    selects.innerHTML='<select id="injClub" aria-label="Filter injuries by club"><option value="0">All clubs</option></select><select id="injPos" aria-label="Filter injuries by position"><option value="0">All positions</option><option value="1">Goalkeepers</option><option value="2">Defenders</option><option value="3">Midfielders</option><option value="4">Forwards</option></select>';
    if(search){search.classList.add("inj-search");selects.appendChild(search);}
    oldCtl.appendChild(selects);
  }
  if(!document.getElementById("injCount")){const el=document.createElement("div");el.id="injCount";el.className="inj-count";body.before(el);}
  if(!document.getElementById("injPagination")){const el=document.createElement("div");el.id="injPagination";el.className="inj-pagination";el.setAttribute("aria-label","Injury list pagination");body.after(el);}
}
async function initInjuries(){
  await loadBoot();ensureInjuryFilters();
  const clubSel=$("injClub");
  if(clubSel&&clubSel.options.length<=1){(boot.teams||[]).slice().sort((a,b)=>String(a.name).localeCompare(String(b.name))).forEach(t=>{const o=document.createElement("option");o.value=String(t.id);o.textContent=t.name;clubSel.appendChild(o);});}
  $("injFilter")?.addEventListener("click",e=>{const x=e.target.closest("button");if(!x)return;$("injFilter").querySelectorAll("button").forEach(y=>y.classList.remove("active"));x.classList.add("active");_injFilter=x.dataset.f;_injPage=1;drawInjuries();});
  $("injSearch")?.addEventListener("input",e=>{_injQuery=e.target.value.toLowerCase();_injPage=1;drawInjuries();});
  clubSel?.addEventListener("change",e=>{_injClub=Number(e.target.value)||0;_injPage=1;drawInjuries();});
  $("injPos")?.addEventListener("change",e=>{_injPos=Number(e.target.value)||0;_injPage=1;drawInjuries();});
  drawInjuries();
}
function injStatus(e){const c=e.chance_of_playing_next_round;if(e.status==="a"&&(c===null||c===100))return null;if(c===0||e.status==="i"||e.status==="u"||e.status==="n"||e.status==="s")return{kind:"out",label:c===0?"Out":({i:"Injured",u:"Unavailable",n:"Ineligible",s:"Suspended"}[e.status]||"Out"),pct:c};return{kind:"doubt",label:(c!=null?`${c}% chance`:"Doubtful"),pct:c};}
function injuryFilteredList(){let list=(boot.elements||[]).map(e=>({e,s:injStatus(e)})).filter(x=>x.s);if(_injFilter==="out")list=list.filter(x=>x.s.kind==="out");else if(_injFilter==="doubt")list=list.filter(x=>x.s.kind==="doubt");if(_injClub)list=list.filter(x=>Number(x.e.team)===_injClub);if(_injPos)list=list.filter(x=>Number(x.e.element_type)===_injPos);if(_injQuery)list=list.filter(x=>String(x.e.web_name||"").toLowerCase().includes(_injQuery));list.sort((a,c)=>{if(a.s.kind!==c.s.kind)return a.s.kind==="out"?-1:1;return parseFloat(c.e.selected_by_percent||0)-parseFloat(a.e.selected_by_percent||0);});return list;}
function renderInjuryPager(pages){const el=$("injPagination");if(!el)return;if(pages<=1){el.innerHTML="";return;}const btn=(label,page,disabled=false,active=false)=>`<button type="button" data-page="${page}" ${disabled?"disabled":""} class="${active?"active":""}">${label}</button>`;let parts=[btn("←",Math.max(1,_injPage-1),_injPage===1)];let start=Math.max(1,_injPage-2),end=Math.min(pages,start+4);start=Math.max(1,end-4);for(let i=start;i<=end;i++)parts.push(btn(String(i),i,false,i===_injPage));parts.push(btn("→",Math.min(pages,_injPage+1),_injPage===pages));el.innerHTML=parts.join("");el.querySelectorAll("button[data-page]").forEach(b=>b.onclick=()=>{if(b.disabled)return;_injPage=Number(b.dataset.page)||1;drawInjuries();document.querySelector("#tab-injuries .thead")?.scrollIntoView({behavior:"smooth",block:"start"});});}
function drawInjuries(){const list=injuryFilteredList(),pages=Math.max(1,Math.ceil(list.length/INJ_PAGE_SIZE));if(_injPage>pages)_injPage=pages;const start=(_injPage-1)*INJ_PAGE_SIZE,shown=list.slice(start,start+INJ_PAGE_SIZE),count=$("injCount");if(count)count.textContent=list.length?`Showing ${start+1}–${Math.min(start+INJ_PAGE_SIZE,list.length)} of ${list.length} flagged players`:`0 flagged players`;if(!shown.length){$("injBody").innerHTML='<div class="tab-status">No flagged players match these filters.</div>';renderInjuryPager(1);return;}$("injBody").innerHTML=shown.map(({e,s})=>{const t=(boot.teams||[]).find(z=>z.id===e.team)||{},news=e.news?esc(e.news):(s.kind==="out"?"Ruled out":"Doubtful");return `<div class="inj-row inj-${s.kind}"><div class="inj-pill inj-${s.kind}">${s.kind==="out"?"OUT":(s.pct!=null?s.pct+"%":"DOUBT")}</div>${teamKitImg(t,"inj-kit")}<div class="inj-info"><div class="inj-nm">${esc(e.web_name)} <span class="inj-meta">${esc(t.short_name||"")} · ${POS[e.element_type]} · ${money(e.now_cost)} · ${(+e.selected_by_percent).toFixed(1)}% owned</span></div><div class="inj-news">${news}</div></div></div>`;}).join("");renderInjuryPager(pages);}
