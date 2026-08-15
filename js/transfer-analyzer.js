/* ============ TRANSFER ANALYZER ============ */
let _taReady=false,_taFixtureMap={};
const _taSelected={from:null,to:null};
const _taActiveIndex={from:-1,to:-1};

async function initTransferAnalyzer(){
  if(_taReady) return;
  _taReady=true;
  try{
    const [b,fixtures]=await Promise.all([loadBoot(),get("/fixtures/")]);
    const start=(b.events.find(e=>e.is_current)||b.events.find(e=>e.is_next)||b.events[0]||{}).id||1;
    _taFixtureMap=buildFixtureMap(fixtures,start);

    const teamOptions=(b.teams||[])
      .slice()
      .sort((a,c)=>a.name.localeCompare(c.name))
      .map(t=>`<option value="${t.id}">${esc(t.name)}</option>`)
      .join("");
    $("taFromTeam").insertAdjacentHTML("beforeend",teamOptions);
    $("taToTeam").insertAdjacentHTML("beforeend",teamOptions);

    setupTransferPicker("from");
    setupTransferPicker("to");

    $("taRun").onclick=()=>drawTransferComparison();
    $("taSwap").onclick=()=>swapTransferPlayers();
    $("taReset").onclick=()=>resetTransferAnalyzer();
    document.addEventListener("pointerdown",e=>{
      ["from","to"].forEach(side=>{
        const picker=$(taId(side,"Picker"));
        if(picker&&!picker.contains(e.target)) hideTransferResults(side);
      });
    });
    updateTransferActions();
  }catch(e){
    $("transferBody").innerHTML=`<div class="tool-empty bad">Could not load player data.</div>`;
  }
}

function taId(side,suffix){ return `ta${side==="from"?"From":"To"}${suffix||""}`; }

function setupTransferPicker(side){
  const input=$(taId(side,""));
  const pos=$(taId(side,"Pos"));
  const team=$(taId(side,"Team"));
  const results=$(taId(side,"Results"));
  const clearSelected=$(taId(side,"Clear"));
  const clearSearch=$(taId(side,"SearchClear"));

  input.addEventListener("focus",()=>renderTransferResults(side));
  input.addEventListener("input",()=>{
    clearSearch.hidden=!input.value;
    _taActiveIndex[side]=-1;
    renderTransferResults(side);
    updateTransferActions();
  });
  input.addEventListener("keydown",e=>handleTransferPickerKeys(side,e));
  pos.addEventListener("change",()=>{_taActiveIndex[side]=-1;renderTransferResults(side,true);updateTransferActions();});
  team.addEventListener("change",()=>{_taActiveIndex[side]=-1;renderTransferResults(side,true);updateTransferActions();});
  clearSelected.addEventListener("click",()=>clearTransferSelection(side));
  clearSearch.addEventListener("click",()=>{
    input.value="";
    clearSearch.hidden=true;
    input.focus();
    renderTransferResults(side);
    updateTransferActions();
  });
  results.addEventListener("pointerdown",e=>e.preventDefault());
  results.addEventListener("click",e=>{
    const row=e.target.closest("[data-player-id]");
    if(row) selectTransferPlayer(side,Number(row.dataset.playerId));
  });
}

function transferFilteredPlayers(side){
  const q=$(taId(side,"")).value.trim().toLowerCase();
  const pos=Number($(taId(side,"Pos")).value||0);
  const team=Number($(taId(side,"Team")).value||0);
  const otherSide=side==="from"?"to":"from";
  const otherId=_taSelected[otherSide]&&_taSelected[otherSide].id;
  let rows=(boot.elements||[]).filter(e=>{
    if(otherId&&e.id===otherId) return false;
    if(pos&&e.element_type!==pos) return false;
    if(team&&e.team!==team) return false;
    if(q){
      const club=(boot.teams||[]).find(t=>t.id===e.team)||{};
      const hay=`${e.web_name||""} ${e.first_name||""} ${e.second_name||""} ${club.name||""} ${club.short_name||""}`.toLowerCase();
      if(!hay.includes(q)) return false;
    }
    return true;
  });

  if(q){
    rows.sort((a,b)=>{
      const an=String(a.web_name||"").toLowerCase(),bn=String(b.web_name||"").toLowerCase();
      const ap=an.startsWith(q)?0:1,bp=bn.startsWith(q)?0:1;
      return ap-bp || an.localeCompare(bn);
    });
  }else{
    rows.sort((a,b)=>(parseFloat(b.selected_by_percent||0)||0)-(parseFloat(a.selected_by_percent||0)||0) || (b.total_points||0)-(a.total_points||0));
  }
  return rows.slice(0,24);
}

function transferResultRow(e,index,active){
  const t=(boot.teams||[]).find(x=>x.id===e.team)||{};
  const own=parseFloat(e.selected_by_percent||0)||0;
  return `<button type="button" class="ta-result${active?" active":""}" role="option" aria-selected="${active?"true":"false"}" data-player-id="${e.id}" data-result-index="${index}">
    <span class="ta-result-kit">${teamKitImg(t,"ta-result-shirt",`${t.name||"Club"} kit`)}</span>
    <span class="ta-result-main"><b>${esc(e.web_name)}</b><small>${esc(t.short_name||"")} · ${POS[e.element_type]} · ${money(e.now_cost)}</small></span>
    <span class="ta-result-meta"><b>${own.toFixed(1)}%</b><small>owned</small></span>
  </button>`;
}

function renderTransferResults(side,forceOpen=false){
  const input=$(taId(side,""));
  const results=$(taId(side,"Results"));
  const picker=$(taId(side,"Picker"));
  const hasFocus=document.activeElement===input;
  if(!hasFocus&&!forceOpen){ hideTransferResults(side); return; }
  const rows=transferFilteredPlayers(side);
  if(_taActiveIndex[side]>=rows.length) _taActiveIndex[side]=-1;
  if(!rows.length){
    results.innerHTML=`<div class="ta-no-results"><b>No players found</b><span>Try another name or clear a filter.</span></div>`;
  }else{
    results.innerHTML=rows.map((e,i)=>transferResultRow(e,i,_taActiveIndex[side]===i)).join("");
  }
  results.hidden=false;
  input.setAttribute("aria-expanded","true");
  picker.classList.add("results-open");
}

function hideTransferResults(side){
  const results=$(taId(side,"Results"));
  const picker=$(taId(side,"Picker"));
  if(results) results.hidden=true;
  const input=$(taId(side,""));
  if(input) input.setAttribute("aria-expanded","false");
  if(picker) picker.classList.remove("results-open");
  _taActiveIndex[side]=-1;
}

function handleTransferPickerKeys(side,e){
  const results=$(taId(side,"Results"));
  const rows=transferFilteredPlayers(side);
  if(e.key==="ArrowDown"||e.key==="ArrowUp"){
    e.preventDefault();
    if(results.hidden) renderTransferResults(side,true);
    const dir=e.key==="ArrowDown"?1:-1;
    let next=_taActiveIndex[side]+dir;
    if(next<0) next=rows.length-1;
    if(next>=rows.length) next=0;
    _taActiveIndex[side]=next;
    renderTransferResults(side,true);
    const active=results.querySelector(".ta-result.active");
    if(active) active.scrollIntoView({block:"nearest"});
  }else if(e.key==="Enter"){
    if(!results.hidden&&rows.length){
      e.preventDefault();
      const idx=_taActiveIndex[side]>=0?_taActiveIndex[side]:0;
      selectTransferPlayer(side,rows[idx].id);
    }else if(_taSelected.from&&_taSelected.to){
      e.preventDefault();
      drawTransferComparison();
    }
  }else if(e.key==="Escape"){
    hideTransferResults(side);
  }
}

function selectTransferPlayer(side,id){
  const player=(boot.elements||[]).find(e=>e.id===id)||null;
  if(!player) return;
  const otherSide=side==="from"?"to":"from";
  if(_taSelected[otherSide]&&_taSelected[otherSide].id===player.id){
    _taSelected[otherSide]=null;
    renderTransferSelection(otherSide);
  }
  _taSelected[side]=player;
  const input=$(taId(side,""));
  input.value="";
  input.placeholder="Search to change player";
  $(taId(side,"SearchClear")).hidden=true;
  hideTransferResults(side);
  renderTransferSelection(side);
  updateTransferActions();
  if(_taSelected.from&&_taSelected.to) drawTransferComparison();
}

function renderTransferSelection(side){
  const e=_taSelected[side];
  const selected=$(taId(side,"Selected"));
  const clear=$(taId(side,"Clear"));
  if(!e){
    selected.hidden=true;
    selected.innerHTML="";
    clear.hidden=true;
    return;
  }
  const t=(boot.teams||[]).find(x=>x.id===e.team)||{};
  selected.innerHTML=`${teamKitImg(t,"ta-selected-kit",`${t.name||"Club"} kit`)}
    <span><b>${esc(e.web_name)}</b><small>${esc(t.name||"")} · ${POS[e.element_type]} · ${money(e.now_cost)}</small></span>
    <span class="ta-selected-own">${esc(String(e.selected_by_percent||"0"))}%<small>owned</small></span>`;
  selected.hidden=false;
  clear.hidden=false;
}

function clearTransferSelection(side){
  _taSelected[side]=null;
  const input=$(taId(side,""));
  input.value="";
  input.placeholder="Search player name";
  $(taId(side,"SearchClear")).hidden=true;
  renderTransferSelection(side);
  hideTransferResults(side);
  updateTransferActions();
  $("transferBody").innerHTML=`<div class="tool-empty">Pick a player on each side. Search by name or narrow the list by position and club.</div>`;
  input.focus();
}

function swapTransferPlayers(){
  const a=_taSelected.from;
  _taSelected.from=_taSelected.to;
  _taSelected.to=a;
  renderTransferSelection("from");
  renderTransferSelection("to");
  ["from","to"].forEach(side=>{
    $(taId(side,"Pos")).value="0";
    $(taId(side,"Team")).value="0";
    $(taId(side,"")).value="";
    $(taId(side,"SearchClear")).hidden=true;
    hideTransferResults(side);
  });
  updateTransferActions();
  if(_taSelected.from&&_taSelected.to) drawTransferComparison();
}

function resetTransferAnalyzer(){
  ["from","to"].forEach(side=>{
    _taSelected[side]=null;
    $(taId(side,"")).value="";
    $(taId(side,"")).placeholder="Search player name";
    $(taId(side,"Pos")).value="0";
    $(taId(side,"Team")).value="0";
    $(taId(side,"SearchClear")).hidden=true;
    renderTransferSelection(side);
    hideTransferResults(side);
  });
  updateTransferActions();
  $("transferBody").innerHTML=`<div class="tool-empty">Pick a player on each side. Search by name or narrow the list by position and club.</div>`;
}

function updateTransferActions(){
  const ready=!!(_taSelected.from&&_taSelected.to);
  $("taRun").disabled=!ready;
  $("taSwap").disabled=!(_taSelected.from||_taSelected.to);
  $("taReset").disabled=!(_taSelected.from||_taSelected.to||$("taFrom").value||$("taTo").value||$("taFromPos").value!=="0"||$("taToPos").value!=="0"||$("taFromTeam").value!=="0"||$("taToTeam").value!=="0");
}

function taMetric(label,a,b,fmt=v=>v){
  const av=fmt(a),bv=fmt(b);
  return `<div class="transfer-metric"><span>${esc(String(av))}</span><b>${esc(label)}</b><span>${esc(String(bv))}</span></div>`;
}

function taPlayerHead(e){
  const t=(boot.teams||[]).find(x=>x.id===e.team)||{};
  return `<div class="transfer-player-head">${teamKitImg(t,"transfer-kit")}<div><h3>${esc(e.web_name)}</h3><p>${esc(t.name||"")} · ${POS[e.element_type]}</p></div><b>${money(e.now_cost)}</b></div>`;
}

function drawTransferComparison(){
  const a=_taSelected.from,b=_taSelected.to,out=$("transferBody");
  if(!a||!b){out.innerHTML=`<div class="tool-empty bad">Choose a player on both sides first.</div>`;return;}
  const avgA=fixtureAverageForTeam(a.team,_taFixtureMap,5),avgB=fixtureAverageForTeam(b.team,_taFixtureMap,5);
  const scoreA=playerWindowScore(a,_taFixtureMap,5),scoreB=playerWindowScore(b,_taFixtureMap,5);
  const teams=boot.teams||[];
  const formA=parseFloat(a.form||0)||0,formB=parseFloat(b.form||0)||0;
  const ownA=parseFloat(a.selected_by_percent||0)||0,ownB=parseFloat(b.selected_by_percent||0)||0;
  const diff=scoreB-scoreA;
  let verdict="The short-term profiles are close.";
  if(Math.abs(diff)>=1) verdict=diff>0?`${b.web_name} has the stronger next-five profile.`:`${a.web_name} has the stronger next-five profile.`;
  const cheaper=b.now_cost<a.now_cost?`${b.web_name} also frees ${money(a.now_cost-b.now_cost)}.`:b.now_cost>a.now_cost?`${b.web_name} costs ${money(b.now_cost-a.now_cost)} more.`:"Both players have the same current price.";
  out.innerHTML=`
    <div class="transfer-board">
      <div class="transfer-side">${taPlayerHead(a)}<div class="fixture-run">${fixtureRunHtml(a.team,_taFixtureMap,teams,5)}</div></div>
      <div class="transfer-center"><span>vs</span></div>
      <div class="transfer-side">${taPlayerHead(b)}<div class="fixture-run">${fixtureRunHtml(b.team,_taFixtureMap,teams,5)}</div></div>
    </div>
    <div class="transfer-metrics">
      ${taMetric("Price",money(a.now_cost),money(b.now_cost))}
      ${taMetric("Total points",a.total_points||0,b.total_points||0)}
      ${taMetric("Form",formA.toFixed(1),formB.toFixed(1))}
      ${taMetric("Ownership",`${ownA.toFixed(1)}%`,`${ownB.toFixed(1)}%`)}
      ${taMetric("Minutes",a.minutes||0,b.minutes||0)}
      ${taMetric("Next 5 avg FDR",avgA==null?"-":avgA.toFixed(2),avgB==null?"-":avgB.toFixed(2))}
      ${taMetric("5-GW profile",scoreA.toFixed(1),scoreB.toFixed(1))}
    </div>
    <div class="transfer-verdict"><span>FPL Peek view</span><h4>${esc(verdict)}</h4><p>${esc(cheaper)} The profile is a transparent comparison of recent scoring, availability and fixture difficulty - not a predicted points guarantee.</p></div>`;
}
