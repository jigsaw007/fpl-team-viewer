const ORIGIN = "https://fantasy.premierleague.com";

const CANDIDATES = [
  process.env.FPL_PRICE_PREDICTOR_PATH,
  "/api/price-change-predictor/",
  "/api/price-change-predictions/",
  "/api/price-changes/predictor/",
  "/api/price-changes/",
  "/api/price-change/",
].filter(Boolean);

function num(v){
  if(v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function pick(obj, keys){
  for(const k of keys){ if(obj && Object.prototype.hasOwnProperty.call(obj,k) && obj[k] !== null && obj[k] !== undefined) return obj[k]; }
  return null;
}
function normalizeDirection(v, progress){
  const s=String(v||"").toLowerCase();
  if(s.includes("rise")||s.includes("up")||s.includes("increase")) return "rise";
  if(s.includes("fall")||s.includes("drop")||s.includes("down")||s.includes("decrease")) return "fall";
  if(progress!=null && progress<0) return "fall";
  if(progress!=null && progress>0) return "rise";
  return "neutral";
}
function normalizeRecord(x){
  if(!x || typeof x!=="object") return null;
  const id=num(pick(x,["element","element_id","elementId","player_id","playerId","id"]));
  if(!id) return null;
  let predicted=num(pick(x,["predicted_progress","predictedProgress","prediction_progress","predictionProgress","predicted_percentage","predictedPercentage","prediction","predicted"]));
  let current=num(pick(x,["current_progress","currentProgress","price_change_progress","priceChangeProgress","progress","percentage","percent"]));
  const rawDirection=pick(x,["direction","predicted_direction","predictedDirection","status","trend","change_direction","changeDirection"]);
  const basis=predicted!=null?predicted:current;
  const direction=normalizeDirection(rawDirection,basis);
  if(predicted!=null) predicted=Math.abs(predicted);
  if(current!=null) current=Math.abs(current);
  if(predicted==null && current==null && !rawDirection) return null;
  return {element:id,direction,current_progress:current,predicted_progress:predicted,label:String(pick(x,["label","message","status_text","statusText"])||"")};
}
function recordsFromPayload(payload){
  const seen=new Map();
  function walk(v,depth=0){
    if(depth>5 || v==null) return;
    if(Array.isArray(v)){ v.forEach(x=>walk(x,depth+1)); return; }
    if(typeof v!=="object") return;
    const rec=normalizeRecord(v);
    if(rec) seen.set(rec.element,{...(seen.get(rec.element)||{}),...rec});
    for(const [k,val] of Object.entries(v)){
      if(["players","elements","results","data","predictions","price_changes","priceChanges","items"].includes(k) || depth<2) walk(val,depth+1);
    }
  }
  walk(payload);
  return [...seen.values()].filter(x=>x.current_progress!=null||x.predicted_progress!=null);
}
function recordsFromBootstrap(boot){
  const out=[];
  for(const e of boot?.elements||[]){
    const candidate={element:e.id};
    for(const [k,v] of Object.entries(e)){
      const lk=k.toLowerCase();
      if(!(lk.includes("price")||lk.includes("progress")||lk.includes("predict"))) continue;
      candidate[k]=v;
    }
    const rec=normalizeRecord(candidate);
    if(rec && (rec.current_progress!=null||rec.predicted_progress!=null)) out.push(rec);
  }
  return out;
}
async function fetchJson(url){
  const r=await fetch(url,{headers:{Accept:"application/json","User-Agent":"FPL-Peek/1.0"}});
  if(!r.ok) return null;
  const ct=r.headers.get("content-type")||"";
  if(!ct.includes("json")) return null;
  return r.json();
}
exports.handler=async function(event){
  if(event.httpMethod && event.httpMethod!=="GET") return {statusCode:405,headers:{Allow:"GET"},body:"Method not allowed"};
  try{
    const boot=await fetchJson(`${ORIGIN}/api/bootstrap-static/`);
    const bootstrapRecords=recordsFromBootstrap(boot);
    if(bootstrapRecords.length){
      return {statusCode:200,headers:{"Content-Type":"application/json","Cache-Control":"public, max-age=60, s-maxage=300","Access-Control-Allow-Origin":"*"},body:JSON.stringify({available:true,source:"official-fpl",endpoint:"bootstrap-static",updated_at:new Date().toISOString(),predictions:bootstrapRecords})};
    }
    for(const path of CANDIDATES){
      const payload=await fetchJson(`${ORIGIN}${path}`);
      if(!payload) continue;
      const predictions=recordsFromPayload(payload);
      if(predictions.length){
        return {statusCode:200,headers:{"Content-Type":"application/json","Cache-Control":"public, max-age=60, s-maxage=300","Access-Control-Allow-Origin":"*"},body:JSON.stringify({available:true,source:"official-fpl",endpoint:path,updated_at:new Date().toISOString(),predictions})};
      }
    }
    return {statusCode:200,headers:{"Content-Type":"application/json","Cache-Control":"public, max-age=60, s-maxage=180","Access-Control-Allow-Origin":"*"},body:JSON.stringify({available:false,source:"official-fpl",reason:"The official FPL predictor is live on the FPL website, but its predictor feed was not exposed through any currently known unauthenticated JSON endpoint. Transfer activity and applied price changes remain available."})};
  }catch(e){
    return {statusCode:200,headers:{"Content-Type":"application/json","Cache-Control":"no-store","Access-Control-Allow-Origin":"*"},body:JSON.stringify({available:false,source:"official-fpl",reason:e.message||"Could not read official FPL predictor data."})};
  }
};
