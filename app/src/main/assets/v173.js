'use strict';
(function(){
  const $r=id=>document.getElementById(id);
  const FORECAST='https://api.open-meteo.com/v1/forecast';
  const ARCHIVE='https://archive-api.open-meteo.com/v1/archive';
  S.windRoute=S.windRoute||null;
  S._windRoutePos=null;
  S._windRouteLoading=false;
  S._windRouteRecalc=false;

  function ymd(ms){return new Date(ms).toISOString().slice(0,10)}
  function norm360(d){return ((Number(d)%360)+360)%360}
  function signedAngle(d){d=norm360(d);return d>180?d-360:d}
  function enc(o){return Object.entries(o).filter(([,v])=>v!==undefined&&v!==null&&v!=='').map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&')}
  async function getj(url){let r=await fetch(url,{cache:'no-store'});if(!r.ok){let t=await r.text();throw Error(`Route wind HTTP ${r.status}: ${t.slice(0,140)}`)}return r.json()}
  function range(){try{return requestedRange()}catch(_){return [utcMs(S.meta?.startUtc),utcMs(S.meta?.endUtc)]}}
  function signature(){
    const p=startPoint(),[a,b]=range();
    return [p?.lat?.toFixed(5),p?.lon?.toFixed(5),Math.round(a/60000),Math.round(b/60000),S.windOnline?.loadedUtc||'',S.windOnline?.source||''].join('|');
  }
  function matches(){return !!(S.windRoute?.profiles?.length&&S.windRoute.signature===signature())}
  function km(a,b){
    const la=(Number(a.lat)+Number(b.lat))*.5*DEG,dy=(Number(a.lat)-Number(b.lat))*111.195,dx=(Number(a.lon)-Number(b.lon))*111.195*Math.cos(la);
    return Math.hypot(dx,dy);
  }
  function rowTimes(j){return (j?.hourly?.time||[]).map(t=>Date.parse(/[zZ]$|[+-]\d\d:?\d\d$/.test(t)?t:t+'Z'))}
  function makeProfile(j,point){
    const tm=rowTimes(j),sp=j?.hourly?.wind_speed_10m||[],di=j?.hourly?.wind_direction_10m||[],gu=j?.hourly?.wind_gusts_10m||[],rows=[];
    for(let i=0;i<tm.length;i++)if(Number.isFinite(tm[i])&&Number.isFinite(Number(sp[i]))&&Number.isFinite(Number(di[i])))rows.push({ms:tm[i],speed:Number(sp[i]),dir:norm360(di[i]),gust:Number(gu[i]||0)});
    return {lat:Number(point.lat),lon:Number(point.lon),routeMs:Number(point.ms),rows};
  }
  function sampleProfile(profile,ms){
    const r=profile?.rows;if(!r?.length||ms<r[0].ms||ms>r.at(-1).ms)return null;
    let lo=0,hi=r.length-1;while(hi-lo>1){let m=(lo+hi)>>1;if(r[m].ms<=ms)lo=m;else hi=m}
    const a=r[lo],b=r[Math.min(lo+1,r.length-1)],f=b.ms===a.ms?0:(ms-a.ms)/(b.ms-a.ms);
    // Interpolate direction through vector space to avoid a 359°/001° discontinuity.
    const ta=(a.dir+180)*DEG,tb=(b.dir+180)*DEG;
    const ua=a.speed*Math.sin(ta),va=a.speed*Math.cos(ta),ub=b.speed*Math.sin(tb),vb=b.speed*Math.cos(tb);
    const u=ua*(1-f)+ub*f,v=va*(1-f)+vb*f,speed=Math.hypot(u,v),to=norm360(Math.atan2(u,v)/DEG),dir=norm360(to+180);
    return {speed,dir,gust:a.gust*(1-f)+b.gust*f};
  }
  function sampleRouteWind(ms,lat,lon){
    if(!matches())return null;
    const pos={lat:Number(lat),lon:Number(lon)},nearest=S.windRoute.profiles.map(p=>({p,d:km(pos,p)})).sort((a,b)=>a.d-b.d).slice(0,3);
    let su=0,sv=0,sg=0,sw=0;
    for(const q of nearest){const z=sampleProfile(q.p,ms);if(!z)continue;const w=1/Math.max(.25,q.d*q.d+.25),to=(z.dir+180)*DEG;su+=z.speed*Math.sin(to)*w;sv+=z.speed*Math.cos(to)*w;sg+=z.gust*w;sw+=w}
    if(!(sw>0))return null;
    const u=su/sw,v=sv/sw,speed=Math.hypot(u,v),to=norm360(Math.atan2(u,v)/DEG),dir=norm360(to+180);
    return {speed,dir,gust:sg/sw};
  }
  function status(state,text){
    let el=$r('routeWindStatus');if(!el)return;el.className='routeWindStatus '+String(state||'').toLowerCase();el.textContent=text||state||'';
  }
  function choosePoints(track){
    if(!Array.isArray(track)||!track.length)return [];
    const max=28,step=Math.max(1,Math.ceil((track.length-1)/(max-1))),pts=[];
    for(let i=0;i<track.length;i+=step)pts.push(track[i]);
    if(pts.at(-1)!==track.at(-1))pts.push(track.at(-1));
    return pts.slice(0,max);
  }
  async function fetchProfiles(points){
    const [a,b]=range(),endpoint=b<Date.now()-6*86400000?ARCHIVE:FORECAST;
    const lats=points.map(p=>Number(p.lat).toFixed(5)).join(','),lons=points.map(p=>Number(p.lon).toFixed(5)).join(',');
    const params={latitude:lats,longitude:lons,hourly:'wind_speed_10m,wind_direction_10m,wind_gusts_10m',wind_speed_unit:'ms',timezone:'GMT',start_date:ymd(a),end_date:ymd(b),cell_selection:'sea'};
    const raw=await getj(endpoint+'?'+enc(params)),arr=Array.isArray(raw)?raw:[raw];
    if(arr.length!==points.length)throw Error(`Route wind returned ${arr.length}/${points.length} locations`);
    const profiles=arr.map((j,i)=>makeProfile(j,points[i])).filter(p=>p.rows.length>=2);
    if(profiles.length<Math.min(2,points.length))throw Error('Insufficient route wind profiles');
    return {profiles,source:endpoint===ARCHIVE?'Open-Meteo Historical multi-point':'Open-Meteo Forecast multi-point'};
  }
  async function buildRouteWind(track){
    if(S._windRouteLoading)return false;
    const points=choosePoints(track);if(points.length<2)return false;
    S._windRouteLoading=true;status('loading',`ROUTE WIND • loading ${points.length} spatial points…`);
    try{
      const z=await fetchProfiles(points);
      S.windRoute={profiles:z.profiles,signature:signature(),source:z.source,loadedUtc:new Date().toISOString(),sampleCount:z.profiles.length};
      status('ready',`ROUTE-AWARE WIND • ${z.profiles.length} spatial points • hourly time interpolation`);
      return true;
    }catch(e){S.windRoute=null;status('failed',`ROUTE WIND FALLBACK • START-point wind retained • ${e.message}`);return false}
    finally{S._windRouteLoading=false}
  }

  function installUi(){
    if($r('routeWindStatus'))return;
    const card=$r('windDataCard');if(!card)return;
    const el=document.createElement('div');el.id='routeWindStatus';el.className='routeWindStatus idle';el.textContent='ROUTE WIND • waiting for a calculated route';card.appendChild(el);
    const st=document.createElement('style');st.textContent=`.routeWindStatus{margin-top:6px;padding:6px 7px;border-radius:8px;border:1px solid #d6e4ea;background:#f9fbfc;color:#58717d;font-size:8.5px;line-height:1.35}.routeWindStatus.loading{background:#fff3dd;border-color:#ecd6a6;color:#8b5a10}.routeWindStatus.ready{background:#e3f5ef;border-color:#b8dfd3;color:#176b58}.routeWindStatus.failed{background:#fae7e9;border-color:#e5bcc3;color:#9b3142}`;document.head.appendChild(st);
  }

  function patchField(){
    if(typeof field==='function'&&!field.__routeWind173){const old=field;field=function(ms,lat,lon,...rest){const prev=S._windRoutePos;S._windRoutePos={lat:Number(lat),lon:Number(lon)};try{return old(ms,lat,lon,...rest)}finally{S._windRoutePos=prev}};field.__routeWind173=true}
  }
  function patchWind(){
    if(typeof wind==='function'&&!wind.__routeWind173){const old=wind;wind=function(ms,kMul=1){const base=old(ms,kMul);if($r('windMode')?.value!=='weather'||!matches()||!S._windRoutePos)return base;const rw=sampleRouteWind(ms,S._windRoutePos.lat,S._windRoutePos.lon);if(!rw)return base;const oldSp=Number(base?.[2]),mag=Math.hypot(Number(base?.[0])||0,Number(base?.[1])||0);if(!(oldSp>0)||!(mag>=0))return base;const k=mag/oldSp;if(k===0)return [0,0,rw.speed,rw.dir];const oldTo=norm360(Math.atan2(Number(base[0]),Number(base[1]))/DEG),offset=signedAngle(oldTo-norm360(Number(base[3])+180)),to=norm360(rw.dir+180+offset)*DEG;return [k*rw.speed*Math.sin(to),k*rw.speed*Math.cos(to),rw.speed,rw.dir]};wind.__routeWind173=true}
  }
  function patchCalculate(){
    if(typeof calculate==='function'&&!calculate.__routeWind173){const old=calculate;calculate=function(silent=false){const r=old(silent);try{
      if(S._windRouteRecalc)return r;
      if($r('windMode')?.value==='weather'&&S.track?.length&&!matches()&&!S._windRouteLoading){const preliminary=S.track.map(x=>({lat:x.lat,lon:x.lon,ms:x.ms}));setTimeout(async()=>{const ok=await buildRouteWind(preliminary);if(ok){S._windRouteRecalc=true;try{old(true);toast('Route refined with spatially varying wind along track')}finally{S._windRouteRecalc=false}status('ready',`ROUTE-AWARE WIND • ${S.windRoute.sampleCount} spatial points • route refined`)}},20)}
      else if($r('windMode')?.value==='weather'&&matches())status('ready',`ROUTE-AWARE WIND • ${S.windRoute.sampleCount} spatial points • active`);
    }catch(e){status('failed','ROUTE WIND • '+e.message)}return r};calculate.__routeWind173=true}
  }
  function invalidate(){if(S.windRoute){S.windRoute=null;status('idle','ROUTE WIND • scenario changed; will refresh after next ROUTE')}}
  function hookInvalidation(){
    document.addEventListener('change',e=>{if(['pair','startDate','startTime','endDate','endTime','offset','windMode','windSpeed','windDir'].includes(e.target?.id))invalidate()},true);
    if(typeof setStart==='function'&&!setStart.__routeWind173){const old=setStart;setStart=function(...a){const r=old.apply(this,a);invalidate();return r};setStart.__routeWind173=true}
  }
  function boot(){try{installUi();patchField();patchWind();patchCalculate();hookInvalidation()}catch(e){console.error('Route wind v173 boot',e)}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,1450));else setTimeout(boot,1450);
})();
