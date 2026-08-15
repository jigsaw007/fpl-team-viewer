/* ============ SET PIECES tab ============ */
let _spFilter="all";
async function initSetPieces(){
  await loadBoot();
  $("spFilter").addEventListener("click",e=>{const x=e.target.closest("button");if(!x)return;
    $("spFilter").querySelectorAll("button").forEach(y=>y.classList.remove("active"));x.classList.add("active");
    _spFilter=x.dataset.f; drawSetPieces();});
  drawSetPieces();
}
function drawSetPieces(){
  const b=boot;
  const byId={}; b.elements.forEach(e=>byId[e.id]=e);
  // group by team; show order-1 (and order-2 as backup) for each duty
  const wantPen=_spFilter==="all"||_spFilter==="pen";
  const wantFk=_spFilter==="all"||_spFilter==="fk";
  const wantCk=_spFilter==="all"||_spFilter==="ck";
  const teamsWith=b.teams.map(t=>{
    const mates=b.elements.filter(e=>e.team===t.id);
    const pick=(field)=>mates.filter(e=>e[field]===1||e[field]===2).sort((a,c)=>(a[field]||9)-(c[field]||9));
    return {t, pen:pick("penalties_order"), fk:pick("direct_freekicks_order"), ck:pick("corners_and_indirect_freekicks_order")};
  }).filter(x=>x.pen.length||x.fk.length||x.ck.length);
  const nameList=arr=>arr.length?arr.map((e,i)=>`<span class="sp-taker${i===0?' first':''}">${esc(e.web_name)}</span>`).join(''):`<span class="sp-none">—</span>`;
  $("spBody").innerHTML=`<div class="sp-grid">${teamsWith.map(({t,pen,fk,ck})=>`
    <div class="sp-card">
      <div class="sp-team">${teamKitImg(t,"sp-kit")}${esc(t.name)}</div>
      ${wantPen?`<div class="sp-duty"><span class="sp-lbl pen">Penalties</span><div class="sp-takers">${nameList(pen)}</div></div>`:""}
      ${wantFk?`<div class="sp-duty"><span class="sp-lbl fk">Free-kicks</span><div class="sp-takers">${nameList(fk)}</div></div>`:""}
      ${wantCk?`<div class="sp-duty"><span class="sp-lbl ck">Corners</span><div class="sp-takers">${nameList(ck)}</div></div>`:""}
    </div>`).join("")}</div>`;
}

