import { getStore } from "@netlify/blobs";
const FPL="https://fantasy.premierleague.com/api";
async function json(path){const r=await fetch(FPL+path,{headers:{Accept:"application/json","User-Agent":"FPL-Peek/1.0"}});if(!r.ok)throw new Error(`FPL ${r.status}`);return r.json();}
export default async(req)=>{
  try{
    const url=new URL(req.url),gw=Number(url.searchParams.get('gw'));
    if(!Number.isInteger(gw)||gw<1||gw>38)return Response.json({error:'Invalid Gameweek'},{status:400});
    const store=getStore('fpl-transfer-snapshots');
    const snap=await store.get(`gw-${gw}`,{type:'json',consistency:'strong'});
    if(!snap)return Response.json({status:'waiting',gw},{headers:{'Cache-Control':'no-store'}});
    const [live,boot]=await Promise.all([json(`/event/${gw}/live/`),json('/bootstrap-static/')]);
    const points=new Map((live.elements||[]).map(x=>[Number(x.id),Number(x.stats?.total_points)||0]));
    const element=new Map((boot.elements||[]).map(x=>[Number(x.id),x]));
    const add=rows=>(rows||[]).map(x=>({...x,player:element.get(Number(x.id))||x,points:points.get(Number(x.id))||0}));
    const ev=(boot.events||[]).find(e=>Number(e.id)===gw);
    return Response.json({...snap,status:'ok',final:!!(ev&&(ev.finished||ev.data_checked)),incoming:add(snap.incoming),outgoing:add(snap.outgoing)},{headers:{'Cache-Control':'public, max-age=15, s-maxage=30','Access-Control-Allow-Origin':'*'}});
  }catch(e){return Response.json({error:e.message},{status:500,headers:{'Cache-Control':'no-store'}});}
};
