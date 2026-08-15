// Aggregates captain choices from a small sample of the current top overall managers.
// The FPL API does not provide an all-manager captain aggregate, so this intentionally
// samples the first page of the Overall league rather than crawling millions of entries.
const FPL="https://fantasy.premierleague.com/api";

async function getJSON(path){
  const r=await fetch(FPL+path,{headers:{"User-Agent":"Mozilla/5.0","Accept":"application/json"}});
  if(!r.ok) throw new Error(`FPL ${r.status} for ${path}`);
  return r.json();
}

async function mapLimit(items, limit, fn){
  const out=[];
  for(let i=0;i<items.length;i+=limit){
    const batch=items.slice(i,i+limit);
    const settled=await Promise.allSettled(batch.map(fn));
    out.push(...settled);
  }
  return out;
}

exports.handler=async function(){
  try{
    const [boot, seed]=await Promise.all([getJSON("/bootstrap-static/"),getJSON("/entry/1/")]);
    const events=boot.events||[];
    const current=events.find(e=>e.is_current);
    const finished=[...events].filter(e=>e.finished).sort((a,b)=>b.id-a.id)[0];
    const ev=current||finished;
    if(!ev){
      return {statusCode:200,headers:{"Content-Type":"application/json","Cache-Control":"public, max-age=300, s-maxage=600"},body:JSON.stringify({status:"waiting"})};
    }
    const overall=((seed.leagues&&seed.leagues.classic)||[]).find(l=>l.short_name==="overall" || l.name==="Overall");
    if(!overall) throw new Error("Overall league not found");
    const standings=await getJSON(`/leagues-classic/${overall.id}/standings/?page_standings=1`);
    const managers=((standings.standings&&standings.standings.results)||[]).filter(x=>x.entry).slice(0,50);
    if(!managers.length){
      return {statusCode:200,headers:{"Content-Type":"application/json","Cache-Control":"public, max-age=300, s-maxage=600"},body:JSON.stringify({status:"waiting",gw:ev.id})};
    }
    const picked=await mapLimit(managers,10,async m=>{
      const p=await getJSON(`/entry/${m.entry}/event/${ev.id}/picks/`);
      const cap=(p.picks||[]).find(x=>x.is_captain);
      return cap?{element:cap.element,multiplier:cap.multiplier||2}:null;
    });
    const counts=new Map(); let sample=0;
    for(const s of picked){
      if(s.status!=="fulfilled"||!s.value) continue;
      sample++;
      const x=s.value, cur=counts.get(x.element)||{element:x.element,count:0,triple_count:0};
      cur.count++; if(x.multiplier===3) cur.triple_count++; counts.set(x.element,cur);
    }
    const captains=[...counts.values()].sort((a,b)=>b.count-a.count).map(x=>({...x,percent:sample?x.count/sample*100:0}));
    return {
      statusCode:200,
      headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"*","Cache-Control":"public, max-age=300, s-maxage=600"},
      body:JSON.stringify({status:"ok",gw:ev.id,sample_size:sample,requested_sample:managers.length,captains})
    };
  }catch(e){
    return {statusCode:502,headers:{"Content-Type":"application/json","Access-Control-Allow-Origin":"*"},body:JSON.stringify({error:e.message})};
  }
};
