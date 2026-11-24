'use strict';
(() => {
const $=id=>document.getElementById(id);
const {calcEMA,calcSMA,calcRSI,calcMACD}=globalThis.TradingIndicators;
const demo=new Set(['PETR4','VALE3','ITUB4','MGLU3']);
const money=new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'});
const decimal=new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2});
const valid=x=>typeof x==='number'&&Number.isFinite(x);
const fmt=(x,f=decimal)=>valid(x)?f.format(x):'—';
let symbol='PETR4',interval='1d',range='3mo',source='auto',controller,serial=0,bars=[],chart,candle,volume,lines=[],overlays=[true,true,true];
const status=t=>$('status').textContent=t;
function clear(){
 bars=[];for(const id of ['price','change','high','low','volume','rsi','macd','ema9','ema21','sma50'])$(id).textContent='—';
 $('asset').textContent=symbol;$('trend').textContent='Dados insuficientes';$('providerStatus').textContent='Consultando fontes; streaming ao vivo não conectado';
 if(chart){candle.setData([]);volume.setData([]);lines.forEach(x=>x.setData([]));}
}
function initChart(){
 if(!globalThis.LightweightCharts){status('Biblioteca de gráfico indisponível.');return false;}
 const el=$('stockChart');chart=LightweightCharts.createChart(el,{layout:{background:{type:'solid',color:'transparent'},textColor:'#98a8c3'},grid:{vertLines:{color:'#1b2538'},horzLines:{color:'#1b2538'}},timeScale:{timeVisible:true},localization:{priceFormatter:p=>money.format(p)}});
 candle=chart.addCandlestickSeries({upColor:'#00f5a0',downColor:'#ff3b6b',borderVisible:false,wickUpColor:'#00f5a0',wickDownColor:'#ff3b6b'});
 volume=chart.addHistogramSeries({priceFormat:{type:'volume'},priceScaleId:'vol'});chart.priceScale('vol').applyOptions({scaleMargins:{top:.8,bottom:0}});
 lines=['#38bdf8','#f5b731','#c084fc'].map(color=>chart.addLineSeries({color,lineWidth:2,priceLineVisible:false}));
 const resize=()=>chart.applyOptions({width:el.clientWidth,height:el.clientHeight});new ResizeObserver(resize).observe(el);resize();return true;
}
function normalize(rows){
 const points=new Map();
 for(const r of Array.isArray(rows)?rows:[]){
  if(![r.date,r.open,r.high,r.low,r.close,r.volume].every(valid)||r.date<=0||r.volume<0||r.low>Math.min(r.open,r.close)||r.high<Math.max(r.open,r.close))continue;
  const time=Math.trunc(r.date);points.set(time,{time,open:r.open,high:r.high,low:r.low,close:r.close,volume:r.volume});
 }
 return [...points.values()].sort((a,b)=>a.time-b.time);
}
function draw(){
 const closes=bars.map(x=>x.close),e9=calcEMA(closes,9),e21=calcEMA(closes,21),s50=calcSMA(closes,50),r=calcRSI(closes),m=calcMACD(closes),last=x=>x.at(-1);
 if(chart){candle.setData(bars.map(({time,open,high,low,close})=>({time,open,high,low,close})));volume.setData(bars.map(b=>({time:b.time,value:b.volume,color:b.close>=b.open?'#00f5a055':'#ff3b6b55'})));
 [e9,e21,s50].forEach((v,i)=>lines[i].setData(overlays[i]?v.flatMap((n,j)=>valid(n)?[{time:bars[j].time,value:n}]:[]):[]));}
 $('rsi').textContent=fmt(last(r));$('macd').textContent=fmt(last(m.macdLine));$('ema9').textContent=fmt(last(e9),money);$('ema21').textContent=fmt(last(e21),money);$('sma50').textContent=fmt(last(s50),money);
 const a=last(e9),b=last(e21),c=last(s50),p=last(closes);
 $('trend').textContent=![a,b,c,p].every(valid)?'Histórico insuficiente para tendência':a>b&&p>c?'Viés de alta pelas médias':a<b&&p<c?'Viés de baixa pelas médias':'Médias sem alinhamento';
}
async function request(s,i,r,signal){
 const params=new URLSearchParams({symbol:s,interval:i,range:r,source});
 let response;
 try {response=await fetch('./api/stocks?'+params,{signal,headers:{Accept:'application/json'}});}catch(e){if(signal.aborted)throw e;}
 if(!response||response.status===404||!response.headers.get('content-type')?.includes('application/json')){
  if(!demo.has(s))throw Error('Este ativo exige uma instalação com BRAPI_TOKEN configurado no servidor.');
  response=await fetch('https://brapi.dev/api/quote/'+encodeURIComponent(s)+'?'+new URLSearchParams({interval:i,range:r}),{signal});
 }
 if(!response.ok)throw Error(response.status===429?'Limite de consultas da API atingido.':response.status===400||response.status===401||response.status===403?'Ativo ou intervalo não disponível no plano da API.':'Falha na fonte de dados ('+response.status+').');
 const data=await response.json();const q=data.results?.[0];if(!q||q.symbol!==s)throw Error('Cotação não encontrada para este ticker.');return {...q,provenance:q.provenance||{quote:'brapi',history:q.historicalDataPrice?.length?'brapi':null,quoteMode:'delayed_or_unknown',pntStatus:'backend_required',historyFallback:source==='pnt'}};
}
async function load(){
 controller?.abort();controller=new AbortController();const run=++serial,s=symbol,i=interval,r=range;clear();status('Consultando fontes de '+s+'…');
 try{
  const q=await request(s,i,r,controller.signal);if(run!==serial)return;
  $('asset').textContent=q.symbol;$('price').textContent=fmt(q.regularMarketPrice,money);$('change').textContent=valid(q.regularMarketChangePercent)?fmt(q.regularMarketChangePercent)+'%':'—';$('high').textContent=fmt(q.regularMarketDayHigh,money);$('low').textContent=fmt(q.regularMarketDayLow,money);$('volume').textContent=fmt(q.regularMarketVolume);
  bars=normalize(q.historicalDataPrice);draw();chart?.timeScale().fitContent();
  const time=new Date(q.regularMarketTime);const stamp=q.regularMarketTime&&Number.isFinite(time.valueOf())?time.toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})+' (Brasília)':'horário não informado';
  const p=q.provenance;
  const sourceName=x=>x==='pnt'?'PNT':x==='brapi'?'brapi':'indisponível';
  const histStamp=bars.length?new Date(bars.at(-1).time*1000).toISOString().slice(0,10):'—';
  status('Cotação: '+sourceName(p.quote)+' · '+(p.quote?stamp+' · pode ter atraso':'sem cotação')+' | Histórico: '+sourceName(p.history)+' · '+bars.length+' candles · último: '+histStamp+(p.historyFallback?' · PNT indisponível; fallback':'')+(!chart?' · gráfico indisponível':''));
  $('providerStatus').textContent='brapi: '+(p.quote?'cotação disponível':'cotação indisponível')+' | PNT: '+(p.pntStatus==='available'?'histórico disponível':p.pntStatus==='not_requested'?'não consultada':p.pntStatus==='not_configured'||p.pntStatus==='backend_required'?'requer servidor e credenciais':p.pntStatus==='unsupported_interval'?'intervalo não suportado':'indisponível')+' | Streaming ao vivo: não conectado';
 }catch(e){if(run===serial&&!controller.signal.aborted){clear();status(e.message||'Não foi possível consultar a fonte.');}}
}
function choose(s){symbol=s;document.querySelectorAll('[data-symbol]').forEach(b=>{const on=b.dataset.symbol===s;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});load();}
document.querySelectorAll('[data-symbol]').forEach(b=>b.addEventListener('click',()=>choose(b.dataset.symbol)));
$('symbolForm').addEventListener('submit',e=>{e.preventDefault();const s=$('symbolInput').value.trim().toUpperCase();if(/^[A-Z0-9]{4,12}$/.test(s))choose(s);});
document.querySelectorAll('[data-interval]').forEach(b=>b.addEventListener('click',()=>{interval=b.dataset.interval;range=b.dataset.range;document.querySelectorAll('[data-interval]').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});load();}));
document.querySelectorAll('[data-overlay]').forEach(b=>b.addEventListener('click',()=>{const i=Number(b.dataset.overlay);overlays[i]=!overlays[i];b.classList.toggle('active',overlays[i]);b.setAttribute('aria-pressed',String(overlays[i]));draw();}));
$('fit').addEventListener('click',()=>chart?.timeScale().fitContent());$('refresh').addEventListener('click',load);
$('historySource').addEventListener('change',e=>{source=e.target.value;load();});
initChart();load();
window.addEventListener('pagehide',()=>controller?.abort());
})();
