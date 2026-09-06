import { getStore } from "@netlify/blobs";
const FPL="https://fantasy.premierleague.com/api";
const GW3_ARCHIVE={
  gw:3,
  captured_at:"2026-08-29T07:12:00Z",
  snapshot_type:"archived-early",
  source_label:"Archived early snapshot · 29 Aug",
  incoming:[
    {web_name:"Cherki",transfers:249336},
    {web_name:"Gvardiol",transfers:57449},
    {web_name:"De Cuyper",transfers:46340}
  ],
  outgoing:[
    {web_name:"Semenyo",transfers:46823},
    {web_name:"O'Reilly",transfers:22952},
    {web_name:"Guéhi",transfers:11853}
  ]
};
async function json(path){const r=await fetch(FPL+path,{headers:{Accept:"application/json","User-Agent":"FPL-Peek/1.0"}});if(!r.ok)throw new Error(`FPL ${r.status}`);return r.json();}
function key(v){return String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/gi,'').toLowerCase();}
export default async(req)=>{
  try{
    const url=new URL(req.url),gw=Number(url.searchParams.get('gw'));
    if(!Number.isInteger(gw)||gw<1||gw>38)return Response.json({error:'Invalid Gameweek'},{status:400});
    const store=getStore('fpl-transfer-snapshots');
    const stored=await store.get(`gw-${gw}`,{type:'json',consistency:'strong'});
    const snap=stored||(gw===3?GW3_ARCHIVE:null);
    if(!snap)return Response.json({status:'waiting',gw},{headers:{'Cache-Control':'no-store'}});
    const [live,boot]=await Promise.all([json(`/event/${gw}/live/`),json('/bootstrap-static/')]);
    const points=new Map((live.elements||[]).map(x=>[Number(x.id),Number(x.stats?.total_points)||0]));
    const element=new Map((boot.elements||[]).map(x=>[Number(x.id),x]));
    const byName=new Map((boot.elements||[]).map(x=>[key(x.web_name),x]));
    const add=rows=>(rows||[]).map(x=>{const player=element.get(Number(x.id))||byName.get(key(x.web_name))||x;return {...x,id:player.id||x.id,player,points:points.get(Number(player.id))||0};});
    const ev=(boot.events||[]).find(e=>Number(e.id)===gw);
    return Response.json({...snap,status:'ok',final:!!(ev&&(ev.finished||ev.data_checked)),incoming:add(snap.incoming),outgoing:add(snap.outgoing)},{headers:{'Cache-Control':'public, max-age=15, s-maxage=30','Access-Control-Allow-Origin':'*'}});
  }catch(e){return Response.json({error:e.message},{status:500,headers:{'Cache-Control':'no-store'}});}
};
