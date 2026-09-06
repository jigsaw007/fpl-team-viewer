import { getStore } from "@netlify/blobs";
const FPL="https://fantasy.premierleague.com/api";
async function json(path){const r=await fetch(FPL+path,{headers:{Accept:"application/json","User-Agent":"FPL-Peek/1.0"}});if(!r.ok)throw new Error(`FPL ${r.status}`);return r.json();}
export default async()=>{
  const boot=await json('/bootstrap-static/');
  const next=(boot.events||[]).find(e=>e.is_next);
  if(!next)return new Response('No upcoming Gameweek',{status:200});
  const deadline=Date.parse(next.deadline_time),remaining=deadline-Date.now();
  if(remaining<0||remaining>45*60*1000)return new Response('Outside snapshot window',{status:200});
  const players=boot.elements||[];
  const pack=(field)=>[...players].sort((a,b)=>Number(b[field]||0)-Number(a[field]||0)).slice(0,3).map(p=>({id:p.id,web_name:p.web_name,team:p.team,element_type:p.element_type,now_cost:p.now_cost,transfers:Number(p[field]||0)}));
  const snapshot={gw:next.id,captured_at:new Date().toISOString(),deadline_time:next.deadline_time,incoming:pack('transfers_in_event'),outgoing:pack('transfers_out_event')};
  const store=getStore('fpl-transfer-snapshots');
  await store.setJSON(`gw-${next.id}`,snapshot,{onlyIfNew:true});
  return new Response(`GW${next.id} snapshot checked`,{status:200});
};
