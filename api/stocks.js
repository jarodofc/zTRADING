// Node.js / Vercel. Never expose BRAPI_TOKEN to the browser.
const demo=new Set(['PETR4','VALE3','ITUB4','MGLU3']);
const allowed=new Set(['1d:3mo','1d:1mo','1wk:1y','15m:5d']);
module.exports=async function(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 const {symbol,interval,range}=req.query;
 if(typeof symbol!=='string'||!/^[A-Z0-9]{4,12}$/.test(symbol)||!allowed.has(interval+':'+range))return res.status(400).json({error:'Invalid query'});
 const token=process.env.BRAPI_TOKEN;
 if(!token&&!demo.has(symbol))return res.status(403).json({error:'BRAPI_TOKEN required'});
 const url=new URL('https://brapi.dev/api/quote/'+symbol);url.searchParams.set('interval',interval);url.searchParams.set('range',range);
 try{
  const upstream=await fetch(url,{headers:token?{Authorization:'Bearer '+token}:{},signal:AbortSignal.timeout(10000)});
  if(!upstream.ok)return res.status(upstream.status).json({error:'Upstream unavailable'});
  const body=await upstream.json();
  res.setHeader('Cache-Control','public, s-maxage=60, stale-while-revalidate=60');
  return res.status(200).json(body);
 }catch{return res.status(502).json({error:'Upstream unavailable'});}
};
