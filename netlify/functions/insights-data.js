const { buildLiveInsights } = require("../lib/live-insights");
exports.handler = async function(){
  try{
    const data = await buildLiveInsights();
    return {statusCode:200,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"public, max-age=120, s-maxage=600, stale-while-revalidate=900","Access-Control-Allow-Origin":"*"},body:JSON.stringify(data)};
  }catch(e){
    return {statusCode:500,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"},body:JSON.stringify({error:"Insights are temporarily unavailable",detail:e.message})};
  }
};
