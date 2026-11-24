// B3 data aggregator. Credentials stay server-side. Do not expose paid feeds publicly without authorization.
const demo=new Set(['PETR4','VALE3','ITUB4','MGLU3']);
const allowed=new Set(['1d:3mo','1d:1mo','1wk:1y','15m:5d']);
const sources=new Set(['auto','brapi','pnt']);
const valid=n=>typeof n==='number'&&Number.isFinite(n);
function validateBars(rows){
 if(!Array.isArray(rows))return [];
 const unique=new Map();
 for(const x of rows){
  if(!x||![x.date,x.open,x.high,x.low,x.close,x.volume].every(valid)||x.date<=0||x.volume<0||x.low>Math.min(x.open,x.close)||x.high<Math.max(x.open,x.close))continue;
  unique.set(x.date,x);
 }
 return [...unique.values()].sort((a,b)=>a.date-b.date);
}
async function brapi(symbol,interval,range){
 const token=process.env.BRAPI_TOKEN;
 if(!token&&!demo.has(symbol))return {error:403};
 const url=new URL('https://brapi.dev/api/quote/'+symbol);
 url.searchParams.set('interval',interval);url.searchParams.set('range',range);
 try{
  const res=await fetch(url,{headers:token?{Authorization:'Bearer '+token}:{},signal:AbortSignal.timeout(8000)});
  if(!res.ok)return {error:res.status};
  const body=await res.json(),q=body.results?.[0];
  if(q?.symbol!==symbol)return {error:404};
  return {quote:q,history:validateBars(q.historicalDataPrice)};
 }catch{return {error:502};}
}
let cachedToken=null,tokenPromise=null;
function pntConfigured(){return Boolean(process.env.PNT_CLIENT_ID&&process.env.PNT_CLIENT_SECRET);}
async function getPntToken(){
 if(cachedToken&&cachedToken.expires>Date.now())return cachedToken.value;
 if(tokenPromise)return tokenPromise;
 tokenPromise=(async()=>{
  const body=new URLSearchParams({grant_type:'client_credentials',client_id:process.env.PNT_CLIENT_ID,client_secret:process.env.PNT_CLIENT_SECRET,scope:'pntdata.hist'});
  const res=await fetch('https://auth-prd.pnt.api.br/PnTAuthorizationServerProvider/connect/token',{method:'POST',body,signal:AbortSignal.timeout(8000)});
  if(!res.ok)throw Error('PNT auth unavailable');
  const data=await res.json();if(typeof data.access_token!=='string')throw Error('PNT token missing');
  cachedToken={value:data.access_token,expires:Date.now()+Math.max(0,Number(data.expires_in||0)-60)*1000};
  return cachedToken.value;
 })();
 try{return await tokenPromise;}finally{tokenPromise=null;}
}
async function pnt(symbol,interval,range){
 if(!pntConfigured())return {error:'not_configured'};
 const tf={'1d':'OneDay','15m':'FifteenMinutes'}[interval],days={'3mo':93,'1mo':31,'5d':5}[range];
 if(!tf||!days)return {error:'unsupported_interval'};
 try{
  const token=await getPntToken(),end=new Date(),start=new Date(end.valueOf()-days*86400000);
  const res=await fetch('https://data-hist.pnt.api.br/v1/ohlc/query',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({market:'Bovespa',symbols:[symbol],tf,start:start.toISOString(),end:end.toISOString(),adjusted:false}),signal:AbortSignal.timeout(10000)});
  if(!res.ok){if(res.status===401)cachedToken=null;return {error:res.status};}
  const body=await res.json(),rows=body.data?.[symbol];
  const history=validateBars(Array.isArray(rows)?rows.map(x=>({date:Math.floor(Date.parse(x.t)/1000),open:x.o,high:x.h,low:x.l,close:x.c,volume:x.v})):[]);
  return history.length?{history}:{error:'empty'};
 }catch{return {error:'unavailable'};}
}
function combine(symbol,b,p,source){
 const quote=b.quote||null;
 // Keep an entire historical series from one provider; never splice adjusted/unadjusted series.
 const usePnt=source!=='brapi'&&p.history?.length&&(
 source==='pnt'||!b.history?.length||
 (p.history.length>=b.history.length&&p.history.at(-1).date>b.history.at(-1).date));
 const history=usePnt?p.history:(b.history||[]);
 if(!quote&&!history.length)return null;
 return {results:[{...(quote||{symbol}),historicalDataPrice:history,provenance:{quote:quote?'brapi':null,history:history.length?(usePnt?'pnt':'brapi'):null,quoteMode:quote?'delayed_or_unknown':null,pntStatus:p.history?.length?'available':String(p.error||'not_requested'),brapiStatus:quote?'available':String(b.error||'unavailable'),historyFallback:source==='pnt'&&!usePnt}}]};
}
async function handler(req,res){
 if(req.method!=='GET')return res.status(405).json({error:'Method not allowed'});
 const {symbol,interval,range}=req.query;const source=req.query.source||'auto';
 if(typeof symbol!=='string'||!/^[A-Z0-9]{4,12}$/.test(symbol)||typeof interval!=='string'||typeof range!=='string'||!allowed.has(interval+':'+range)||!sources.has(source))return res.status(400).json({error:'Invalid query'});
 const [b,p]=await Promise.all([brapi(symbol,interval,range),source==='brapi'?Promise.resolve({error:'not_requested'}):pnt(symbol,interval,range)]);
 const data=combine(symbol,b,p,source);
 // No shared caching of licensed provider responses.
 res.setHeader('Cache-Control','private, no-store');
 return data?res.status(200).json(data):res.status(typeof b.error==='number'&&[400,401,403,404,429].includes(b.error)?b.error:502).json({error:'Data unavailable'});
}
module.exports=handler;
