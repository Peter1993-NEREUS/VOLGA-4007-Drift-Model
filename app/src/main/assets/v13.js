'use strict';
const $=id=>document.getElementById(id), DEG=Math.PI/180, R=6371000, MISS=-32768;
const REPO='Peter1993-NEREUS/VOLGA-4007-Drift-Model';
const RAW_DATA=`https://raw.githubusercontent.com/${REPO}/data/`;
const OSM='https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const OSMSEA='https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png';

const S={
  meta:null,reg:null,stk:null,glo:null,wind:null,coast:null,source:'embedded',
  track:[],daily:[],alts:[],mode:'daily',selected:0,pick:false,showVectors:true,showEnvelope:true,showDaily:true,follow:false,
  map:{lat:43.95,lon:38.15,zoom:7,online:true,seamarks:true,cache:new Map(),pointers:new Map(),dragLast:null,pinch:null}
};

const fmt=(x,n=6)=>Number(x).toFixed(n);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function toast(msg,err=false){let t=$('toast');t.textContent=msg;t.className='toast'+(err?' err':'');t.style.display='block';clearTimeout(toast._t);toast._t=setTimeout(()=>t.style.display='none',4500)}
function utcMs(s){if(typeof s!=='string')return Date.parse(s);return Date.parse(/[zZ]$|[+-]\d\d:?\d\d$/.test(s)?s:s+'Z')}
function localFmt(ms){
  let off=Number($('offset')?.value||S.meta?.localOffsetHours||3),d=new Date(ms+off*3600000);
  return `${String(d.getUTCDate()).padStart(2,'0')}.${String(d.getUTCMonth()+1).padStart(2,'0')}.${d.getUTCFullYear()} ${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`
}
function sd(u,v){return [Math.hypot(u,v),(Math.atan2(u,v)/DEG+360)%360]}
function dest(lat,lon,u,v,sec){let sp=Math.hypot(u,v),br=Math.atan2(u,v),ad=sp*sec/R,la=lat*DEG,lo=lon*DEG;let la2=Math.asin(Math.sin(la)*Math.cos(ad)+Math.cos(la)*Math.sin(ad)*Math.cos(br));let lo2=lo+Math.atan2(Math.sin(br)*Math.sin(ad)*Math.cos(la),Math.cos(ad)-Math.sin(la)*Math.sin(la2));return [la2/DEG,lo2/DEG]}
function bd(a,b){let p1=a.lat*DEG,p2=b.lat*DEG,dl=(b.lon-a.lon)*DEG,dp=(b.lat-a.lat)*DEG,h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2,d=2*R*Math.asin(Math.sqrt(Math.min(1,h)));let y=Math.sin(dl)*Math.cos(p2),x=Math.cos(p1)*Math.sin(p2)-Math.sin(p1)*Math.cos(p2)*Math.cos(dl);return [(Math.atan2(y,x)/DEG+360)%360,d]}
async function jsonUrl(u){let r=await fetch(u,{cache:'no-store'});if(!r.ok)throw Error(`${u}: HTTP ${r.status}`);return r.json()}
async function binUrl(u){let r=await fetch(u,{cache:'no-store'});if(!r.ok)throw Error(`${u}: HTTP ${r.status}`);return new Int16Array(await r.arrayBuffer())}

function fm(k){
  let m=S.meta?.[k]; if(!m)return null;
  return {...m,startMs:utcMs(m.startUtc),endMs:utcMs(m.endUtc),stepMs:Number(m.timeStepHours||1)*3600000}
}
function sample(a,m,ms,lat,lon){
  if(!a||!m)return [NaN,NaN];
  let h=(ms-m.startMs)/m.stepMs,i=Math.floor(h),ft=h-i;
  if(i<0||i>=m.nt)return [NaN,NaN];
  let i1=Math.min(i+1,m.nt-1),yy=(lat-m.lat0)/m.latStep,xx=(lon-m.lon0)/m.lonStep,j=Math.floor(yy),k=Math.floor(xx),fy=yy-j,fx=xx-k;
  if(j<0||j>=m.ny-1||k<0||k>=m.nx-1)return [NaN,NaN];
  function at(t,y,x,c){let q=a[((((t*m.ny)+y)*m.nx+x)*2+c)];return q===MISS?NaN:q*S.meta.scale}
  function sp(t,c){
    let q=[at(t,j,k,c),at(t,j,k+1,c),at(t,j+1,k,c),at(t,j+1,k+1,c)],w=[(1-fx)*(1-fy),fx*(1-fy),(1-fx)*fy,fx*fy],sum=0,ws=0;
    for(let n=0;n<4;n++)if(Number.isFinite(q[n])){sum+=q[n]*w[n];ws+=w[n]}
    return ws>.50?sum/ws:NaN
  }
  let o=[];
  for(let c=0;c<2;c++){let x=sp(i,c),y=sp(i1,c);o[c]=Number.isFinite(x)&&Number.isFinite(y)?x*(1-ft)+y*ft:(Number.isFinite(x)?x:y)}
  return o
}
function leewayFraction(){return Math.max(0,Number($('leeway').value||0))/100}
function wind(ms,kMul=1){
  let mode=$('windMode').value,k=leewayFraction()*kMul;
  if(mode==='embedded'&&S.wind&&S.source==='embedded'){
    let start=utcMs(S.meta.startUtc),h=(ms-start)/3600000,i=Math.floor(h),f=h-i;
    if(i<0||i>=S.wind.length)return [0,0,0,0];
    let i1=Math.min(i+1,S.wind.length-1),sp=S.wind[i][0]*(1-f)+S.wind[i1][0]*f,fr=S.wind[i][1]*(1-f)+S.wind[i1][1]*f,to=((fr+180)%360)*DEG;
    return [k*sp*Math.sin(to),k*sp*Math.cos(to),sp,fr]
  }
  if(mode==='manual'){
    let sp=Math.max(0,Number($('windSpeed').value||0)),fr=((Number($('windDir').value||0)%360)+360)%360,to=((fr+180)%360)*DEG;
    return [k*sp*Math.sin(to),k*sp*Math.cos(to),sp,fr]
  }
  return [0,0,0,0]
}
function field(ms,lat,lon,kMul=1,stokesMul=1){
  let rm=fm('regional'),sm=fm('stokes'),gm=fm('global'),rg=rm?sample(S.reg,rm,ms,lat,lon):[NaN,NaN],gl=sample(S.glo,gm,ms,lat,lon),u,v,src='global';
  if(Number.isFinite(rg[0]+rg[1])){
    if(gm&&ms>rm.endMs-24*3600000&&Number.isFinite(gl[0]+gl[1])){
      let a=Math.max(0,Math.min(1,(ms-(rm.endMs-24*3600000))/(24*3600000)));u=(1-a)*rg[0]+a*gl[0];v=(1-a)*rg[1]+a*gl[1];src='blend'
    }else{u=rg[0];v=rg[1];src='regional'}
  }else{u=gl[0];v=gl[1]}
  if(!Number.isFinite(u+v))return null;
  let st=sample(S.stk,sm,ms,lat,lon),us=Number.isFinite(st[0])?st[0]*stokesMul:0,vs=Number.isFinite(st[1])?st[1]*stokesMul:0,w=wind(ms,kMul),ut=u+us+w[0],vt=v+vs+w[1],c=sd(u,v),q=sd(us,vs),t=sd(ut,vt);
  return {u,v,cs:c[0],cd:c[1],us,vs,ss:q[0],sdir:q[1],ws:w[2],wd:w[3],ut,vt,ts:t[0],td:t[1],src}
}
function compute(lat,lon,kMul=1,stokesMul=1){
  let start=utcMs(S.meta.startUtc),end=utcMs(S.meta.endUtc),dt=15*60000,out=[];
  for(let ms=start,n=0;ms<=end;ms+=dt,n++){
    let f=field(ms,lat,lon,kMul,stokesMul);
    if(!f)throw Error(`CMEMS U/V unavailable at ${localFmt(ms)} • ${fmt(lat,5)}, ${fmt(lon,5)}. Increase online radius or update pack.`);
    if(n%4===0)out.push({ms,lat,lon,...f});
    if(ms>=end)break;
    [lat,lon]=dest(lat,lon,f.ut,f.vt,dt/1000)
  }
  return out
}

function parseCoords(){
  let raw=$('pair').value.trim().replace(';',',').split(/[ ,]+/).filter(Boolean);
  if(raw.length>=2){$('lat').value=raw[0];$('lon').value=raw[1]}
  let lat=parseFloat(String($('lat').value).replace(',','.')),lon=parseFloat(String($('lon').value).replace(',','.'));
  if(!Number.isFinite(lat+lon)||lat<-80||lat>89||lon<-179.9||lon>179.9)throw Error('Coordinates must be within Lat -80..89 / Lon -179.9..179.9');
  return [lat,lon]
}
function controlUtc(dateId,timeId){
  let ds=$(dateId).value,ts=$(timeId).value||'00:00',off=Number($('offset').value||0);
  if(!ds)throw Error('Set start/end date');
  let [y,m,d]=ds.split('-').map(Number),[hh,mm]=ts.split(':').map(Number);
  return Date.UTC(y,m-1,d,hh||0,mm||0)-off*3600000
}
function requestedRange(){let a=controlUtc('startDate','startTime'),b=controlUtc('endDate','endTime');if(b<=a)throw Error('End must be after start');return [a,b]}
function packMatches(lat,lon){
  let d=S.meta.domain||{},[a,b]=requestedRange(),s=utcMs(S.meta.startUtc),e=utcMs(S.meta.endUtc),draft=Number($('draft').value||0),pd=Number(S.meta.fixed?.draftM||draft);
  if(Math.abs(a-s)>65*60000||Math.abs(b-e)>65*60000)return [false,'Selected dates do not match loaded CMEMS pack'];
  if(Math.abs(draft-pd)>.12)return [false,'Draft changed; press ONLINE UPDATE to rebuild depth-mean U/V'];
  if(lat<d.minLat||lat>d.maxLat||lon<d.minLon||lon>d.maxLon)return [false,'Start point is outside loaded CMEMS area; increase radius and press ONLINE UPDATE'];
  return [true,'']
}
function dailyRows(){return S.track.filter((_,i)=>i%24===0)}
function calculate(silent=false){
  try{
    let [lat,lon]=parseCoords(),chk=packMatches(lat,lon);if(!chk[0])throw Error(chk[1]);
    S.track=compute(lat,lon,1,1);S.alts=[compute(lat,lon,.5,1),compute(lat,lon,2,1),compute(lat,lon,1,.5)];S.daily=dailyRows();S.selected=0;
    $('pair').value=`${fmt(lat)}, ${fmt(lon)}`;$('time').max=Math.max(0,S.track.length-1);$('time').value=0;
    results();fitRoute();selectTime(0,false);table();report();drawAll();if(!silent)toast('Route calculated')
  }catch(e){if(!silent)toast(e.message,true)}
}
function spreadAt(i){let pts=[S.track[i],...S.alts.map(a=>a[i])].filter(Boolean),m=0;for(let a=0;a<pts.length;a++)for(let b=a+1;b<pts.length;b++)m=Math.max(m,bd(pts[a],pts[b])[1]/1852);return m}
function results(){
  if(!S.track.length)return clearResults(false);
  let a=S.track[0],b=S.track.at(-1),z=bd(a,b),max=0;for(let i=0;i<S.track.length;i++)max=Math.max(max,spreadAt(i));
  $('endPos').innerHTML=`${fmt(b.lat,4)}<br>${fmt(b.lon,4)}`;$('dist').textContent=`${(z[1]/1852).toFixed(1)} NM`;$('bearing').textContent=`${z[0].toFixed(1)}°T`;
  $('engineStatus').textContent=`${S.track.length} hourly outputs • max sensitivity spread ${max.toFixed(1)} NM • ${S.source.toUpperCase()} pack`
}
function clearResults(redraw=true){
  S.track=[];S.daily=[];S.alts=[];S.selected=0;$('time').max=0;$('time').value=0;$('timeLabel').textContent='—';$('timeDetail').textContent='—';
  $('endPos').innerHTML='0.0000<br>0.0000';$('dist').textContent='0.0 NM';$('bearing').textContent='0.0°T';$('selPos').innerHTML='0.0000<br>0.0000';
  $('engineStatus').textContent='Route cleared.';$('nowCard').textContent='Route cleared.';$('tbody').innerHTML='';$('reportDaily').innerHTML='';
  if(redraw)drawAll()
}
function selectTime(i,redraw=true){
  if(!S.track.length)return;
  S.selected=Math.max(0,Math.min(S.track.length-1,Number(i)||0));$('time').value=S.selected;let r=S.track[S.selected];
  $('timeLabel').textContent=localFmt(r.ms);$('timeDetail').textContent=`${S.selected} h from start`;$('selPos').innerHTML=`${fmt(r.lat,4)}<br>${fmt(r.lon,4)}`;
  $('nowCard').innerHTML=`<b>${localFmt(r.ms)} LT</b><br>${fmt(r.lat,6)}, ${fmt(r.lon,6)}<br>Current ${r.cs.toFixed(3)} m/s @ ${r.cd.toFixed(0)}°T<br>Stokes ${r.ss.toFixed(3)} m/s • Wind ${r.ws.toFixed(1)} m/s<br>Total ${r.ts.toFixed(3)} m/s @ ${r.td.toFixed(0)}°T<br>Sensitivity spread ${spreadAt(S.selected).toFixed(1)} NM`;
  if(S.follow){S.map.lat=r.lat;S.map.lon=r.lon}
  if(redraw){drawAll();table()}
}
function table(){
  let rows=S.mode==='daily'?S.daily:S.track;$('tableTitle').textContent=S.mode==='daily'?'Daily coordinates':'Hourly coordinates';
  $('tbody').innerHTML=rows.map(r=>{let idx=Math.round((r.ms-S.track[0].ms)/3600000);return `<tr data-i="${idx}" class="${idx===S.selected?'sel':''}"><td>${localFmt(r.ms)}</td><td>${fmt(r.lat)}</td><td>${fmt(r.lon)}</td><td>${r.cs.toFixed(3)}</td><td>${r.cd.toFixed(0)}°</td><td>${r.ss.toFixed(3)}</td><td>${r.ws.toFixed(1)}</td><td>${r.ts.toFixed(3)}</td><td>${r.td.toFixed(0)}°</td><td>${r.src}</td></tr>`}).join('');
  document.querySelectorAll('#tbody tr').forEach(tr=>tr.onclick=()=>selectTime(Number(tr.dataset.i)))
}
function vesselInfo(){return {name:$('vessel').value.trim()||'CUSTOM VESSEL',imo:$('imo').value.trim(),cargo:Number($('cargo').value||0),draft:Number($('draft').value||0),loa:Number($('loa').value||0),beam:Number($('beam').value||0),leeway:leewayFraction()}}
function report(){
  if(!S.track.length)return;
  let v=vesselInfo(),a=S.track[0],b=S.track.at(-1),z=bd(a,b);
  $('rVessel').textContent=`${v.name}${v.imo?' • IMO '+v.imo:''} • cargo ${v.cargo||0} MT • draft ${v.draft.toFixed(2)} m • LOA ${v.loa||0} m • beam ${v.beam||0} m • leeway ${(v.leeway*100).toFixed(2)}%`;
  $('rPeriod').textContent=`${localFmt(a.ms)} LT → ${localFmt(b.ms)} LT`;$('rStart').textContent=`${fmt(a.lat,6)}, ${fmt(a.lon,6)}`;$('rEnd').textContent=`${fmt(b.lat,6)}, ${fmt(b.lon,6)} • ${(z[1]/1852).toFixed(1)} NM @ ${z[0].toFixed(1)}°T`;
  $('rMethod').textContent=`15-minute Lagrangian integration; spatial/time interpolation of loaded CMEMS U/V and Stokes. Regional current is used when present, with global current fallback. Wind mode: ${$('windMode').value}. Data source: ${S.source}. Sensitivity envelope is not probabilistic.`;
  $('reportDaily').innerHTML=S.daily.map(r=>`<tr><td>${localFmt(r.ms)}</td><td>${fmt(r.lat)}</td><td>${fmt(r.lon)}</td><td>${r.cs.toFixed(3)}</td><td>${r.ss.toFixed(3)}</td><td>${r.ts.toFixed(3)}</td><td>${r.td.toFixed(0)}°</td></tr>`).join('')
}
function csv(){
  if(!S.track.length)return toast('No route to export',true);
  let v=vesselInfo(),h=`vessel,${v.name}\nimo,${v.imo}\ncargo_mt,${v.cargo}\ndraft_m,${v.draft}\nleeway_percent,${(v.leeway*100).toFixed(3)}\n\n`+
  'time_lt,latitude,longitude,current_u,current_v,current_speed,current_dir,stokes_u,stokes_v,stokes_speed,wind_mps,wind_from,total_u,total_v,total_speed,total_dir,source\n';
  let s=h+S.track.map(r=>[localFmt(r.ms),r.lat,r.lon,r.u,r.v,r.cs,r.cd,r.us,r.vs,r.ss,r.ws,r.wd,r.ut,r.vt,r.ts,r.td,r.src].join(',')).join('\n');
  Android.saveText('marine_drift_v1.3.csv',s)
}

function syncControlsFromMeta(){
  let off=Number(S.meta.localOffsetHours??3);$('offset').value=off;
  function set(ms,did,tid){let d=new Date(ms+off*3600000);$(did).value=`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;$(tid).value=`${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`}
  set(utcMs(S.meta.startUtc),'startDate','startTime');set(utcMs(S.meta.endUtc),'endDate','endTime');
  if(S.meta.fixed?.draftM)$('draft').value=Number(S.meta.fixed.draftM).toFixed(2);
  if(S.meta.fixed?.vessel)$('vessel').value=S.meta.fixed.vessel;if(S.meta.fixed?.imo)$('imo').value=S.meta.fixed.imo;
}
async function loadEmbedded(){
  S.meta=await jsonUrl('meta.json');S.reg=await binUrl('regional.bin');S.stk=await binUrl('stokes.bin');S.glo=await binUrl('global.bin');
  S.wind=await jsonUrl('wind.json');S.coast=await jsonUrl('coast.json');S.source='embedded';$('dataBadge').textContent='EMBEDDED';$('windMode').value='embedded';syncControlsFromMeta()
}
async function loadRemote(){
  let ts=Date.now(),meta=await jsonUrl(`${RAW_DATA}meta.json?t=${ts}`);
  let [g,s]=await Promise.all([binUrl(`${RAW_DATA}global.bin?t=${ts}`),binUrl(`${RAW_DATA}stokes.bin?t=${ts}`)]),r=null;
  if(meta.regional)try{r=await binUrl(`${RAW_DATA}regional.bin?t=${ts}`)}catch(_){}
  S.meta=meta;S.glo=g;S.stk=s;S.reg=r;S.wind=null;S.source='online';$('dataBadge').textContent='CMEMS ONLINE';$('windMode').value='off';syncControlsFromMeta()
}

function requestInputs(){
  let [lat,lon]=parseCoords(),[a,b]=requestedRange(),v=vesselInfo(),radius=Math.max(.25,Math.min(12,Number($('radius').value||3)));
  if(a<Date.UTC(1993,0,1))throw Error('Full current + Stokes online mode is supported from 01.01.1993 onward');
  if((b-a)>31*86400000)throw Error('One online request is limited to 31 days. Use a shorter interval.');
  return {lat,lon,a,b,v,radius}
}
function iso(ms){return new Date(ms).toISOString().replace('.000Z','Z')}
async function updateCMEMS(){
  let token=$('ghToken').value.trim();if(!token)throw Error('Enter a fine-grained GitHub token with Actions: write for this repository');
  let q=requestInputs(),rid=`${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
  if($('rememberToken').checked)localStorage.setItem('gh_token',token);else localStorage.removeItem('gh_token');
  $('onlineProgress').textContent='Starting GitHub Action…';$('updateData').disabled=true;
  let body={ref:'main',inputs:{request_id:rid,start_utc:iso(q.a),end_utc:iso(q.b),center_lat:String(q.lat),center_lon:String(q.lon),radius_deg:String(q.radius),draft_m:String(q.v.draft),
    vessel_name:q.v.name,imo:q.v.imo,cargo:String(q.v.cargo),loa_m:String(q.v.loa),beam_m:String(q.v.beam),leeway:String(q.v.leeway),local_offset:String(Number($('offset').value||0))}};
  let r=await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/online-cmems.yml/dispatches`,{method:'POST',headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},body:JSON.stringify(body)});
  if(r.status!==204){let txt=await r.text();throw Error(`GitHub dispatch failed HTTP ${r.status}: ${txt.slice(0,160)}`)}
  let started=Date.now();
  for(let n=0;n<100;n++){
    let sec=Math.round((Date.now()-started)/1000);$('onlineProgress').textContent=`CMEMS pack is building… ${sec}s. Do not close this screen.`;
    try{let m=await jsonUrl(`${RAW_DATA}manifest.json?t=${Date.now()}`);if(m.requestId===rid&&m.status==='ready'){await loadRemote();$('onlineProgress').textContent=`ONLINE pack ready: ${localFmt(utcMs(S.meta.startUtc))} → ${localFmt(utcMs(S.meta.endUtc))}; area ${fmt(S.meta.domain.minLat,2)}..${fmt(S.meta.domain.maxLat,2)} N / ${fmt(S.meta.domain.minLon,2)}..${fmt(S.meta.domain.maxLon,2)} E`;calculate();return}}
    catch(_){}
    await sleep(12000)
  }
  throw Error('Online pack build did not complete in the polling window. Check GitHub Actions.')
}

function clampLat(lat){return Math.max(-85.05112878,Math.min(85.05112878,lat))}
function world(lat,lon,z){let n=256*Math.pow(2,z),x=(lon+180)/360*n,p=clampLat(lat)*DEG,y=(1-Math.log(Math.tan(p)+1/Math.cos(p))/Math.PI)/2*n;return [x,y]}
function unworld(x,y,z){let n=256*Math.pow(2,z),lon=x/n*360-180,yy=Math.PI*(1-2*y/n),lat=Math.atan(Math.sinh(yy))/DEG;return [lat,lon]}
function canvasSize(c){let r=c.getBoundingClientRect(),q=Math.min(2,devicePixelRatio||1);if(c.width!==Math.round(r.width*q)||c.height!==Math.round(r.height*q)){c.width=Math.max(1,Math.round(r.width*q));c.height=Math.max(1,Math.round(r.height*q))}return [r.width,r.height,q]}
function mapXY(lon,lat,w,h){let c=world(S.map.lat,S.map.lon,S.map.zoom),p=world(lat,lon,S.map.zoom);return [w/2+(p[0]-c[0]),h/2+(p[1]-c[1])]}
function mapGeo(x,y,w,h){let c=world(S.map.lat,S.map.lon,S.map.zoom);return unworld(c[0]+x-w/2,c[1]+y-h/2,S.map.zoom)}
function tileImage(url){
  let e=S.map.cache.get(url);if(e)return e;
  let img=new Image(),obj={img,state:'loading'};img.crossOrigin='anonymous';
  img.onload=()=>{obj.state='ok';drawTiles()};img.onerror=()=>{obj.state='err'};img.src=url;S.map.cache.set(url,obj);
  if(S.map.cache.size>350){let k=S.map.cache.keys().next().value;S.map.cache.delete(k)}
  return obj
}
function tileUrl(t,z,x,y){return t.replace('{z}',z).replace('{x}',x).replace('{y}',y)}
function drawTiles(){
  let c=$('tiles'),[w,h,q]=canvasSize(c),g=c.getContext('2d');g.setTransform(q,0,0,q,0,0);g.clearRect(0,0,w,h);g.fillStyle='#dff1f7';g.fillRect(0,0,w,h);
  if(!S.map.online)return;
  let z=Math.round(S.map.zoom),n=1<<z,ctr=world(S.map.lat,S.map.lon,z),left=ctr[0]-w/2,top=ctr[1]-h/2,x0=Math.floor(left/256),x1=Math.floor((left+w)/256),y0=Math.floor(top/256),y1=Math.floor((top+h)/256);
  for(let ty=y0;ty<=y1;ty++){if(ty<0||ty>=n)continue;for(let tx=x0;tx<=x1;tx++){let wx=((tx%n)+n)%n,dx=tx*256-left,dy=ty*256-top,b=tileImage(tileUrl(OSM,z,wx,ty));if(b.state==='ok')g.drawImage(b.img,dx,dy,256,256);if(S.map.seamarks){let s=tileImage(tileUrl(OSMSEA,z,wx,ty));if(s.state==='ok')g.drawImage(s.img,dx,dy,256,256)}}}
}
function drawCoast(g,w,h,q){
  if(S.map.online||!S.coast)return;g.fillStyle='#e8dfcf';g.strokeStyle='#52656f';g.lineWidth=1;
  for(let p of S.coast){g.beginPath();p.forEach((z,i)=>{let a=mapXY(z[0],z[1],w,h);i?g.lineTo(...a):g.moveTo(...a)});g.closePath();g.fill();g.stroke()}
}
function drawArrow(g,x,y,u,v,scale=65){let sp=Math.hypot(u,v);if(!Number.isFinite(sp)||sp<.003)return;let dx=u*scale,dy=-v*scale,len=Math.hypot(dx,dy),mx=30;if(len>mx){dx*=mx/len;dy*=mx/len}let ex=x+dx,ey=y+dy,a=Math.atan2(dy,dx),ah=5;g.beginPath();g.moveTo(x,y);g.lineTo(ex,ey);g.lineTo(ex-ah*Math.cos(a-.55),ey-ah*Math.sin(a-.55));g.moveTo(ex,ey);g.lineTo(ex-ah*Math.cos(a+.55),ey-ah*Math.sin(a+.55));g.stroke()}
function currentVectors(g,w,h){
  if(!S.showVectors||!S.track.length)return;let tl=mapGeo(0,0,w,h),br=mapGeo(w,h,w,h),latMin=Math.min(tl[0],br[0]),latMax=Math.max(tl[0],br[0]),lonMin=Math.min(tl[1],br[1]),lonMax=Math.max(tl[1],br[1]),latStep=Math.max(.08,(latMax-latMin)/8),lonStep=Math.max(.08,(lonMax-lonMin)/10),ms=S.track[S.selected].ms;
  g.strokeStyle='#187b9db8';g.lineWidth=1.2;
  for(let lat=Math.ceil(latMin/latStep)*latStep;lat<latMax;lat+=latStep)for(let lon=Math.ceil(lonMin/lonStep)*lonStep;lon<lonMax;lon+=lonStep){let f=field(ms,lat,lon,1,0);if(!f)continue;let p=mapXY(lon,lat,w,h);drawArrow(g,p[0],p[1],f.u,f.v)}
}
function envelope(g,w,h){
  if(!S.showEnvelope||!S.alts.length)return;g.strokeStyle='#71858faa';g.setLineDash([5,4]);g.lineWidth=1.2;for(let t of S.alts){g.beginPath();t.forEach((r,i)=>{let p=mapXY(r.lon,r.lat,w,h);i?g.lineTo(...p):g.moveTo(...p)});g.stroke()}g.setLineDash([]);
  let i=S.selected,pts=[S.track[i],...S.alts.map(a=>a[i])].filter(Boolean);if(pts.length>2){let cx=pts.reduce((s,p)=>s+p.lon,0)/pts.length,cy=pts.reduce((s,p)=>s+p.lat,0)/pts.length,ord=pts.slice().sort((a,b)=>Math.atan2(a.lat-cy,a.lon-cx)-Math.atan2(b.lat-cy,b.lon-cx));g.fillStyle='#7b8e9840';g.beginPath();ord.forEach((p,j)=>{let q=mapXY(p.lon,p.lat,w,h);j?g.lineTo(...q):g.moveTo(...q)});g.closePath();g.fill()}
}
function marker(g,r,color,label,w,h){let p=mapXY(r.lon,r.lat,w,h);g.fillStyle=color;g.strokeStyle='#fff';g.lineWidth=2;g.beginPath();g.arc(p[0],p[1],6,0,Math.PI*2);g.fill();g.stroke();g.fillStyle='#173142';g.font='bold 10px sans-serif';g.fillText(label,p[0]+8,p[1]+3)}
function drawScale(g,w,h){let a=mapGeo(w-170,h-25,w,h),b=mapGeo(w-20,h-25,w,h),nm=bd({lat:a[0],lon:a[1]},{lat:b[0],lon:b[1]})[1]/1852;if(!Number.isFinite(nm))return;g.strokeStyle='#173142';g.lineWidth=2;g.beginPath();g.moveTo(w-170,h-22);g.lineTo(w-20,h-22);g.stroke();g.fillStyle='#173142';g.font='9px sans-serif';g.fillText(`${nm.toFixed(nm<10?1:0)} NM`,w-105,h-28)}
function drawOverlay(){
  let c=$('map'),[w,h,q]=canvasSize(c),g=c.getContext('2d');g.setTransform(q,0,0,q,0,0);g.clearRect(0,0,w,h);drawCoast(g,w,h,q);currentVectors(g,w,h);
  if(S.track.length){envelope(g,w,h);g.strokeStyle='#0b91b8';g.lineWidth=3;g.beginPath();S.track.forEach((r,i)=>{let p=mapXY(r.lon,r.lat,w,h);i?g.lineTo(...p):g.moveTo(...p)});g.stroke();
    if(S.selected<S.track.length-1){g.strokeStyle='#e56c20';g.lineWidth=3.2;g.beginPath();S.track.slice(S.selected).forEach((r,i)=>{let p=mapXY(r.lon,r.lat,w,h);i?g.lineTo(...p):g.moveTo(...p)});g.stroke()}
    if(S.showDaily)for(let r of S.daily){let p=mapXY(r.lon,r.lat,w,h);g.fillStyle='#fff';g.strokeStyle='#17324d';g.lineWidth=1;g.beginPath();g.arc(p[0],p[1],3.5,0,Math.PI*2);g.fill();g.stroke()}
    marker(g,S.track[0],'#11876c','START',w,h);marker(g,S.track.at(-1),'#e56c20','END',w,h);marker(g,S.track[S.selected],'#cf1f42','SELECTED',w,h)
  }
  drawScale(g,w,h);g.fillStyle='#173142';g.font='bold 11px sans-serif';g.fillText('N',w-25,25);g.beginPath();g.moveTo(w-22,30);g.lineTo(w-27,42);g.lineTo(w-17,42);g.closePath();g.fill()
}
function drawAll(){drawTiles();drawOverlay()}
function fitRoute(){
  let c=$('map'),r=c.getBoundingClientRect(),w=Math.max(300,r.width),h=Math.max(300,r.height);
  let pts=S.track.length?[...S.track,...S.alts.flat()]:[{lat:Number($('lat').value)||43.95,lon:Number($('lon').value)||38.15}],lats=pts.map(p=>p.lat),lons=pts.map(p=>p.lon),minLat=Math.min(...lats),maxLat=Math.max(...lats),minLon=Math.min(...lons),maxLon=Math.max(...lons);
  S.map.lat=(minLat+maxLat)/2;S.map.lon=(minLon+maxLon)/2;
  for(let z=14;z>=2;z--){let a=world(maxLat,minLon,z),b=world(minLat,maxLon,z);if(Math.abs(b[0]-a[0])<w*.78&&Math.abs(b[1]-a[1])<h*.72){S.map.zoom=z;break}}
  drawAll()
}
function zoomAt(delta,x=null,y=null){
  let c=$('map'),r=c.getBoundingClientRect(),w=r.width,h=r.height;if(x===null){x=w/2;y=h/2}
  let anchor=mapGeo(x,y,w,h),nz=Math.max(2,Math.min(15,S.map.zoom+delta));if(nz===S.map.zoom)return;
  S.map.zoom=nz;let aw=world(anchor[0],anchor[1],nz),cx=aw[0]-(x-w/2),cy=aw[1]-(y-h/2),cc=unworld(cx,cy,nz);S.map.lat=cc[0];S.map.lon=cc[1];drawAll()
}
function mapEvents(){
  let c=$('map');
  c.onwheel=e=>{e.preventDefault();let r=c.getBoundingClientRect();zoomAt(e.deltaY>0?-1:1,e.clientX-r.left,e.clientY-r.top)};
  c.onpointerdown=e=>{
    let r=c.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top;
    if(S.pick){let z=mapGeo(x,y,r.width,r.height);$('lat').value=fmt(z[0]);$('lon').value=fmt(z[1]);$('pair').value=`${fmt(z[0])}, ${fmt(z[1])}`;S.pick=false;$('pickState').textContent='NORMAL';toast('Start point selected');return}
    S.map.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});c.setPointerCapture?.(e.pointerId);
    if(S.map.pointers.size===1)S.map.dragLast={x:e.clientX,y:e.clientY};
    if(S.map.pointers.size===2){let a=[...S.map.pointers.values()],d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);S.map.pinch={dist:d,zoom:S.map.zoom}}
  };
  c.onpointermove=e=>{
    if(!S.map.pointers.has(e.pointerId))return;S.map.pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
    if(S.map.pointers.size===1&&S.map.dragLast){let dx=e.clientX-S.map.dragLast.x,dy=e.clientY-S.map.dragLast.y,cc=world(S.map.lat,S.map.lon,S.map.zoom),geo=unworld(cc[0]-dx,cc[1]-dy,S.map.zoom);S.map.lat=geo[0];S.map.lon=geo[1];S.map.dragLast={x:e.clientX,y:e.clientY};S.follow=false;$('follow').classList.remove('on');drawAll()}
    else if(S.map.pointers.size===2&&S.map.pinch){let a=[...S.map.pointers.values()],d=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);S.map.zoom=Math.max(2,Math.min(15,S.map.pinch.zoom+Math.log2(d/S.map.pinch.dist)));drawAll()}
  };
  function up(e){S.map.pointers.delete(e.pointerId);S.map.dragLast=null;if(S.map.pointers.size<2)S.map.pinch=null}
  c.onpointerup=up;c.onpointercancel=up;
}

function preset(){
  if($('preset').value==='volga'){$('vessel').value='VOLGA-4007';$('imo').value='8728816';$('cargo').value='6000';$('draft').value='4.68';$('loa').value='139';$('beam').value='18';$('leeway').value='0.30'}
}
function toggle(id,key){S[key]=!S[key];$(id).classList.toggle('on',S[key]);drawAll()}
function events(){
  $('preset').onchange=preset;$('calc').onclick=()=>calculate();$('reset').onclick=()=>{clearResults();toast('Route and calculated outputs cleared')};$('pick').onclick=()=>{S.pick=!S.pick;$('pickState').textContent=S.pick?'TAP MAP':'NORMAL';toast(S.pick?'Tap map to set start':'Pick mode cancelled')};
  $('updateData').onclick=()=>{updateCMEMS().catch(e=>{toast(e.message,true);$('onlineProgress').textContent=e.message}).finally(()=>$('updateData').disabled=false)};
  $('csv').onclick=csv;$('print').onclick=()=>{if(!S.track.length)return toast('No route to print',true);report();Android.printPdf()};$('png').onclick=()=>{if(!S.track.length)return toast('No route to export',true);Android.saveBase64('marine_drift_route_v1.3.png','image/png',$('map').toDataURL('image/png'))};
  $('fit').onclick=fitRoute;$('time').oninput=e=>selectTime(e.target.value);$('zoomIn').onclick=()=>zoomAt(1);$('zoomOut').onclick=()=>zoomAt(-1);$('mapOnline').onclick=()=>{S.map.online=!S.map.online;$('mapOnline').classList.toggle('on',S.map.online);drawAll()};
  $('seamarks').onclick=()=>{S.map.seamarks=!S.map.seamarks;$('seamarks').classList.toggle('on',S.map.seamarks);drawTiles()};$('vectors').onclick=()=>toggle('vectors','showVectors');$('envelope').onclick=()=>toggle('envelope','showEnvelope');$('dailyMarks').onclick=()=>toggle('dailyMarks','showDaily');
  $('follow').onclick=()=>{S.follow=!S.follow;$('follow').classList.toggle('on',S.follow);selectTime(S.selected)};
  document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');S.mode=b.dataset.mode;table()});
  window.onresize=drawAll;mapEvents()
}
async function init(){
  try{
    events();let tok=localStorage.getItem('gh_token');if(tok){$('ghToken').value=tok;$('rememberToken').checked=true}
    await loadEmbedded();fitRoute();calculate(true);$('onlineProgress').textContent='Embedded Aug-2026 pack ready. Change dates/area/draft → UPDATE ONLINE.';$('loading').style.display='none';drawAll()
  }catch(e){$('loading').innerHTML=`<b>Model load error</b><div style="max-width:82%;text-align:center">${e.message}</div>`}
}
init();
