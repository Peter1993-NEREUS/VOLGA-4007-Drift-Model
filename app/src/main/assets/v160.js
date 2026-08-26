'use strict';
(function(){
  const $w=id=>document.getElementById(id);
  const ATM='https://api.open-meteo.com/v1/forecast';
  const ARCH='https://archive-api.open-meteo.com/v1/archive';
  const MAR='https://marine-api.open-meteo.com/v1/marine';
  S.windOnline=null;S.weatherReport=null;

  function ddm(v,isLat){const h=isLat?(v<0?'S':'N'):(v<0?'W':'E'),a=Math.abs(Number(v)),d=Math.floor(a),m=(a-d)*60;return `${String(d).padStart(isLat?2:3,'0')}°${m.toFixed(3)}′${h}`}
  function ymd(ms){return new Date(ms).toISOString().slice(0,10)}
  function enc(o){return Object.entries(o).filter(([,v])=>v!==undefined&&v!==null&&v!=='').map(([k,v])=>encodeURIComponent(k)+'='+encodeURIComponent(v)).join('&')}
  async function getj(url){let r=await fetch(url,{cache:'no-store'});if(!r.ok){let t=await r.text();throw Error(`Weather service HTTP ${r.status}: ${t.slice(0,120)}`)}return r.json()}
  function timesFrom(j){return (j?.hourly?.time||[]).map(x=>Date.parse(/[zZ]$|[+-]\d\d:?\d\d$/.test(x)?x:x+'Z'))}
  function q(obj,k,i){let a=obj?.hourly?.[k];return Array.isArray(a)?a[i]:null}
  function atmEndpoint(a,b){return b<Date.now()-6*86400000?ARCH:ATM}
  async function fetchAtmos(lat,lon,a,b){
    let endpoint=atmEndpoint(a,b);
    let hourly='temperature_2m,relative_humidity_2m,dew_point_2m,precipitation,weather_code,pressure_msl,cloud_cover,visibility,wind_speed_10m,wind_direction_10m,wind_gusts_10m';
    let params={latitude:lat,longitude:lon,hourly,wind_speed_unit:'ms',timezone:'GMT',start_date:ymd(a),end_date:ymd(b),cell_selection:'sea'};
    let j=await getj(endpoint+'?'+enc(params));j._source=endpoint===ARCH?'Open-Meteo Historical Weather / ERA5':'Open-Meteo Weather Forecast / Best Match';return j;
  }
  async function fetchMarine(lat,lon,a,b){
    let hourly='wave_height,wave_direction,wave_period,wave_peak_period,wind_wave_height,wind_wave_direction,wind_wave_period,wind_wave_peak_period,swell_wave_height,swell_wave_direction,swell_wave_period,swell_wave_peak_period,sea_surface_temperature';
    let params={latitude:lat,longitude:lon,hourly,timezone:'GMT',start_date:ymd(a),end_date:ymd(b),cell_selection:'sea'};
    let j=await getj(MAR+'?'+enc(params));j._source='Open-Meteo Marine Forecast / Best Match';return j;
  }

  function buildWindProfile(j,lat,lon,a,b){
    let tm=timesFrom(j),sp=j.hourly?.wind_speed_10m||[],di=j.hourly?.wind_direction_10m||[],gu=j.hourly?.wind_gusts_10m||[],rows=[];
    for(let i=0;i<tm.length;i++)if(tm[i]>=a-3600000&&tm[i]<=b+3600000&&Number.isFinite(Number(sp[i]))&&Number.isFinite(Number(di[i])))rows.push({ms:tm[i],speed:Number(sp[i]),dir:Number(di[i]),gust:Number(gu[i]||0)});
    if(rows.length<2)throw Error('Wind profile contains insufficient hourly data');
    return {rows,lat,lon,start:rows[0].ms,end:rows.at(-1).ms,source:j._source||'Weather service',loadedUtc:new Date().toISOString()};
  }
  function sampleWindProfile(ms){
    let w=S.windOnline;if(!w?.rows?.length)return null;let r=w.rows;if(ms<r[0].ms||ms>r.at(-1).ms)return null;let lo=0,hi=r.length-1;
    while(hi-lo>1){let m=(lo+hi)>>1;if(r[m].ms<=ms)lo=m;else hi=m}
    let a=r[lo],b=r[Math.min(lo+1,r.length-1)],f=b.ms===a.ms?0:(ms-a.ms)/(b.ms-a.ms);
    return {speed:a.speed*(1-f)+b.speed*f,dir:a.dir*(1-f)+b.dir*f,gust:a.gust*(1-f)+b.gust*f};
  }
  function windProfileMatches(){
    let w=S.windOnline,s=startPoint();if(!w||!s)return [false,'WIND NOT LOADED'];let km=Math.hypot((s.lat-w.lat)*111,(s.lon-w.lon)*111*Math.cos(s.lat*DEG));if(km>5)return [false,`WIND STALE • loaded point is ${km.toFixed(1)} km from START`];
    try{let [a,b]=requestedRange();if(a<w.start||b>w.end)return [false,'WIND RANGE DOES NOT COVER CALCULATION PERIOD'];}catch(_){return [false,'CHECK PERIOD']}
    return [true,'WIND LOADED'];
  }
  function ensureWindMode(){let sel=$w('windMode');if(sel&&![...sel.options].some(o=>o.value==='weather')){let o=document.createElement('option');o.value='weather';o.textContent='Loaded 10 m wind at START point';sel.appendChild(o)}}
  function installWindEngine(){
    ensureWindMode();if(typeof wind==='function'&&!wind.__onlineV16){let old=wind;wind=function(ms,kMul=1){if($w('windMode')?.value==='weather'){let z=sampleWindProfile(ms);if(!z)return [0,0,0,0];let k=leewayFraction()*kMul,to=((z.dir+180)%360)*DEG;return [k*z.speed*Math.sin(to),k*z.speed*Math.cos(to),z.speed,z.dir]}return old(ms,kMul)};wind.__onlineV16=true}
  }
  async function loadDriftWind(silent=false){
    let s=startPoint();if(!s)throw Error('Set START coordinates first');let [a,b]=requestedRange();setWindStatus('LOADING','Loading 10 m wind for START and selected drift period…','');
    let j=await fetchAtmos(s.lat,s.lon,a,b);S.windOnline=buildWindProfile(j,s.lat,s.lon,a,b);ensureWindMode();$w('windMode').value='weather';updateWindCard();if(!silent)toast('Wind profile loaded');return S.windOnline;
  }
  function setWindStatus(state,text,vals){let badge=$w('windDataState');if(badge){badge.textContent=state;badge.className='windState '+state.toLowerCase().replace(/\s+/g,'')}if($w('windDataText'))$w('windDataText').textContent=text||'';if($w('windDataValues'))$w('windDataValues').textContent=vals||''}
  function updateWindCard(ms=null){
    if(!$w('windDataCard'))return;let mode=$w('windMode')?.value||'off',lee=Number($w('leeway')?.value||0);
    if(mode==='manual'){setWindStatus('MANUAL','Manual constant wind. No external wind data is used.',`${Number($w('windSpeed')?.value||0).toFixed(1)} m/s FROM ${Number($w('windDir')?.value||0).toFixed(0)}°T • leeway ${lee.toFixed(2)}%`);return}
    if(mode==='off'){setWindStatus('OFF','Wind leeway is disabled. Drift uses current + Stokes only.','—');return}
    if(mode==='embedded'){let ok=S.source==='embedded';setWindStatus(ok?'EMBEDDED':'NOT APPLICABLE',ok?'Built-in time-varying wind profile for embedded August-2026 data.':'Embedded wind belongs to the built-in August-2026 pack and is not used with ONLINE CMEMS.','');return}
    let [ok,msg]=windProfileMatches(),w=S.windOnline;if(!w){setWindStatus('NOT LOADED','No external wind profile loaded.','Press LOAD / RELOAD WIND');return}
    let t=ms??(S.track[S.selected]?.ms||w.start),z=sampleWindProfile(t),vals=z?`${localFmt(t)} • ${z.speed.toFixed(1)} m/s FROM ${z.dir.toFixed(0)}°T • gust ${z.gust.toFixed(1)} m/s • leeway drift ${(z.speed*leewayFraction()).toFixed(3)} m/s`:msg;
    setWindStatus(ok?'LOADED':'STALE',`${w.source} • START ${w.lat.toFixed(5)}, ${w.lon.toFixed(5)} • ${localFmt(w.start)} → ${localFmt(w.end)}`,ok?vals:msg);
  }
  function installWindCard(){
    if($w('windDataCard'))return;let pre=$w('preflightCard'),card=document.createElement('section');card.id='windDataCard';card.className='card';card.innerHTML='<div class="windHead"><h2>Wind data</h2><span id="windDataState" class="windState off">OFF</span></div><div id="windDataText" class="windText">Wind status</div><div id="windDataValues" class="windValues">—</div><div class="rowbuttons"><button id="reloadWind" class="secondary">LOAD / RELOAD WIND</button><button id="windOffQuick" class="secondary">WIND OFF</button></div><div class="hint">Loaded wind is a time-varying 10 m profile at START and is applied uniformly along the drift track. This is an explicit approximation for long tracks.</div>';
    if(pre)pre.insertAdjacentElement('beforebegin',card);else document.querySelector('.sidebar')?.appendChild(card);
    $w('reloadWind').onclick=()=>loadDriftWind().then(()=>{clearResults();refreshPreflight?.()}).catch(e=>{setWindStatus('FAILED',e.message,'');toast(e.message,true)});
    $w('windOffQuick').onclick=()=>{$w('windMode').value='off';updateWindCard();clearResults();refreshPreflight?.()};
    $w('windMode')?.addEventListener('change',()=>{updateWindCard();clearResults();refreshPreflight?.()});['windSpeed','windDir','leeway'].forEach(id=>$w(id)?.addEventListener('input',()=>updateWindCard()));updateWindCard();
  }
  function patchPreflightWind(){let rows=document.querySelectorAll('#preflightBody .pfrow');if(!rows.length)return;let last=rows[rows.length-1],mode=$w('windMode')?.value;if(mode==='weather'){let [ok,msg]=windProfileMatches(),w=S.windOnline,z=w?sampleWindProfile(S.track[S.selected]?.ms||w.start):null;last.className='pfrow '+(ok?'pfok':'pfwarn');last.querySelector('.pfmark').textContent=ok?'✓':'!';last.querySelector('b').textContent='Wind / leeway';last.querySelector('small').textContent=ok?`${w.source} • ${z?z.speed.toFixed(1)+' m/s FROM '+z.dir.toFixed(0)+'°T':''} • leeway ${Number($w('leeway').value||0).toFixed(2)}%`:msg}}
  function wrapPreflight(){if(typeof refreshPreflight==='function'&&!refreshPreflight.__wind16){let old=refreshPreflight;refreshPreflight=function(){let r=old();patchPreflightWind();return r};refreshPreflight.__wind16=true}}
  function wrapSelectTime(){if(typeof selectTime==='function'&&!selectTime.__wind16){let old=selectTime;selectTime=function(i,follow=true){let r=old(i,follow);updateWindCard(S.track[Number(i)]?.ms);return r};selectTime.__wind16=true}}
  function wrapCalculateWindGuard(){if(typeof calculate==='function'&&!calculate.__wind16){let old=calculate;calculate=function(silent=false){if($w('windMode')?.value==='weather'){let [ok,msg]=windProfileMatches();if(!ok){if(!silent)toast(msg+' — reload wind or select Manual/OFF',true);return}}return old(silent)};calculate.__wind16=true}}
  function wrapOnlineUpdateWind(){if(typeof updateCMEMS==='function'&&!updateCMEMS.__windAuto16){let old=updateCMEMS;updateCMEMS=async function(){let r=await old();try{setProgress(4,'CMEMS ready. Loading 10 m wind profile…');await loadDriftWind(true);notify?.('success','CMEMS + wind data ready');setProgress(5,`Ready • CMEMS + WIND • ${localFmt(utcMs(S.meta.startUtc))} → ${localFmt(utcMs(S.meta.endUtc))}`);calculate();}catch(e){setWindStatus('FAILED',e.message,'Select Manual wind or WIND OFF to calculate');toast('CMEMS loaded, but wind failed: '+e.message,true)}return r};updateCMEMS.__windAuto16=true}}

  function pointForWeather(){let mode=$w('weatherPoint')?.value||'start';if(mode==='end'&&S.track.length){let p=S.track.at(-1);return {lat:p.lat,lon:p.lon,label:'DRIFT END'}}if(mode==='map')return {lat:S.map.lat,lon:S.map.lon,label:'MAP CENTER'};let p=startPoint();if(!p)throw Error('Set START coordinates first');return {...p,label:'START'}}
  function weatherRange(){let h=Number($w('weatherHorizon')?.value||72),a=Date.now(),b=a+h*3600000;return [a,b,h]}
  function mergeWeather(atm,mar,p,a,b){
    let ta=timesFrom(atm),tm=timesFrom(mar),mm=new Map(tm.map((t,i)=>[t,i])),rows=[];
    for(let i=0;i<ta.length;i++){let t=ta[i];if(t<a-3600000||t>b+3600000)continue;let j=mm.get(t);rows.push({ms:t,temp:q(atm,'temperature_2m',i),rh:q(atm,'relative_humidity_2m',i),dew:q(atm,'dew_point_2m',i),precip:q(atm,'precipitation',i),pressure:q(atm,'pressure_msl',i),cloud:q(atm,'cloud_cover',i),vis:q(atm,'visibility',i),wind:q(atm,'wind_speed_10m',i),windDir:q(atm,'wind_direction_10m',i),gust:q(atm,'wind_gusts_10m',i),wave:j===undefined?null:q(mar,'wave_height',j),waveDir:j===undefined?null:q(mar,'wave_direction',j),wavePeriod:j===undefined?null:q(mar,'wave_period',j),wavePeak:j===undefined?null:q(mar,'wave_peak_period',j),windWave:j===undefined?null:q(mar,'wind_wave_height',j),windWaveDir:j===undefined?null:q(mar,'wind_wave_direction',j),swell:j===undefined?null:q(mar,'swell_wave_height',j),swellDir:j===undefined?null:q(mar,'swell_wave_direction',j),swellPeriod:j===undefined?null:q(mar,'swell_wave_period',j),sst:j===undefined?null:q(mar,'sea_surface_temperature',j)});}
    return {point:p,start:a,end:b,rows,atmosSource:atm._source,marineSource:mar._source,generatedUtc:new Date().toISOString()};
  }
  async function loadWeatherReport(){let p=pointForWeather(),[a,b,h]=weatherRange(),st=$w('weatherStatus');st.textContent='LOADING…';$w('loadWeather').disabled=true;try{let [atm,mar]=await Promise.all([fetchAtmos(p.lat,p.lon,a,b),fetchMarine(p.lat,p.lon,a,b)]);S.weatherReport=mergeWeather(atm,mar,p,a,b);renderWeather();st.textContent=`LOADED • ${p.label} • ${h} h`;toast('Point weather forecast loaded')}catch(e){st.textContent='FAILED';$w('weatherMini').textContent=e.message;toast(e.message,true)}finally{$w('loadWeather').disabled=false}}
  function val(x,d=1,s='—'){return x===null||x===undefined||!Number.isFinite(Number(x))?s:Number(x).toFixed(d)}
  function renderWeather(){let w=S.weatherReport;if(!w?.rows?.length)return;let now=w.rows.reduce((best,x)=>Math.abs(x.ms-Date.now())<Math.abs(best.ms-Date.now())?x:best,w.rows[0]);$w('weatherPointReadout').textContent=`${w.point.label} • ${w.point.lat.toFixed(5)}, ${w.point.lon.toFixed(5)}`;$w('weatherMini').innerHTML=`<b>${val(now.wind,1)} m/s</b> FROM ${val(now.windDir,0)}°T • gust <b>${val(now.gust,1)}</b> • air <b>${val(now.temp,1)}°C</b> • wave <b>${val(now.wave,1)} m</b> / ${val(now.waveDir,0)}° • SST ${val(now.sst,1)}°C`;
    $w('weatherTableBody').innerHTML=w.rows.map(x=>`<tr><td>${localFmt(x.ms)}</td><td>${val(x.temp,1)}</td><td>${val(x.wind,1)} / ${val(x.windDir,0)}°</td><td>${val(x.gust,1)}</td><td>${val(x.pressure,0)}</td><td>${val(x.wave,1)} / ${val(x.waveDir,0)}°</td><td>${val(x.wavePeriod,1)}</td><td>${val(x.swell,1)} / ${val(x.swellDir,0)}°</td><td>${val(x.sst,1)}</td></tr>`).join('');buildWeatherPrint();
  }
  function buildWeatherPrint(){let w=S.weatherReport,box=$w('weatherPrintReport');if(!w||!box)return;let maxWave=Math.max(...w.rows.map(x=>Number(x.wave)||0)),maxWind=Math.max(...w.rows.map(x=>Number(x.wind)||0)),maxGust=Math.max(...w.rows.map(x=>Number(x.gust)||0)),minTemp=Math.min(...w.rows.map(x=>Number(x.temp)).filter(Number.isFinite)),maxTemp=Math.max(...w.rows.map(x=>Number(x.temp)).filter(Number.isFinite));box.innerHTML=`<div class="reportHero"><h1>POINT WEATHER FORECAST</h1><div class="rsub">Marine Drift Model by NEREUS • generated ${new Date(w.generatedUtc).toISOString().replace('T',' ').slice(0,16)} UTC</div></div><div class="reportBody"><div class="reportPanel"><h3>${w.point.label}</h3><p>${w.point.lat.toFixed(6)}, ${w.point.lon.toFixed(6)} • ${ddm(w.point.lat,true)} ${ddm(w.point.lon,false)}</p><p>${w.atmosSource} • ${w.marineSource}</p></div><div class="reportKpis"><div class="rk"><b>${maxWind.toFixed(1)} m/s</b><span>max wind</span></div><div class="rk"><b>${maxGust.toFixed(1)} m/s</b><span>max gust</span></div><div class="rk"><b>${maxWave.toFixed(1)} m</b><span>max significant wave</span></div><div class="rk"><b>${minTemp.toFixed(1)}…${maxTemp.toFixed(1)}°C</b><span>air temperature</span></div></div><div class="reportSection"><h2>Hourly forecast</h2><table class="rtable"><thead><tr><th>LT</th><th>Air °C</th><th>Wind m/s / FROM</th><th>Gust</th><th>MSLP hPa</th><th>Wave m / dir</th><th>Period s</th><th>Swell m / dir</th><th>SST °C</th></tr></thead><tbody>${$w('weatherTableBody').innerHTML}</tbody></table></div><div class="reportFoot">Forecast/model data for planning only; not a navigational or safety certificate.<div class="reportDeveloper"><b>Marine Drift Model by NEREUS</b><br>Developed by Peter Mirronov • mirron_petr@mail.ru</div></div></div>`}
  function printWeather(){if(!S.weatherReport?.rows?.length)return toast('Load weather forecast first',true);buildWeatherPrint();document.body.classList.add('weatherPrintMode');setTimeout(()=>{try{Android.printPdf()}catch(e){toast('Android print service unavailable',true)}setTimeout(()=>document.body.classList.remove('weatherPrintMode'),1800)},120)}
  function installWeather(){
    if($w('weatherCard'))return;let mapCard=document.querySelector('.mapcard'),card=document.createElement('details');card.id='weatherCard';card.className='card advanced compactWeather';card.innerHTML='<summary>Weather at point <span id="weatherStatus" class="weatherStatus">NOT LOADED</span></summary><div class="weatherControls"><select id="weatherPoint"><option value="start">START</option><option value="end">DRIFT END</option><option value="map">MAP CENTER</option></select><select id="weatherHorizon"><option value="24">24 h</option><option value="72" selected>72 h</option><option value="168">7 days</option></select><button id="loadWeather" class="secondary">LOAD</button></div><div id="weatherPointReadout" class="hint">Choose point and horizon</div><div id="weatherMini" class="weatherMini">Wind • temperature • waves • swell • SST</div><div class="rowbuttons"><button id="weatherDetailsBtn" class="secondary">DETAILS</button><button id="weatherPrintBtn" class="secondary">REPORT</button></div><div id="weatherDetails" class="weatherDetails" hidden><div class="tablewrap weatherTableWrap"><table class="table"><thead><tr><th>LT</th><th>Air</th><th>Wind</th><th>Gust</th><th>MSLP</th><th>Wave</th><th>Period</th><th>Swell</th><th>SST</th></tr></thead><tbody id="weatherTableBody"></tbody></table></div><div class="hint">Forecast/model data for planning only. Marine values may be unavailable close to coast or outside model coverage.</div></div>';
    if(mapCard)mapCard.insertAdjacentElement('afterend',card);else document.querySelector('.shell')?.appendChild(card);
    let pr=document.createElement('section');pr.id='weatherPrintReport';pr.className='report weatherPrintReport';document.body.appendChild(pr);
    $w('loadWeather').onclick=loadWeatherReport;$w('weatherDetailsBtn').onclick=()=>{$w('weatherDetails').hidden=!$w('weatherDetails').hidden;$w('weatherDetailsBtn').textContent=$w('weatherDetails').hidden?'DETAILS':'HIDE DETAILS'};$w('weatherPrintBtn').onclick=printWeather;
  }
  function styles(){let s=document.createElement('style');s.textContent='.windHead{display:flex;align-items:center;justify-content:space-between}.windHead h2{margin:0!important}.windState,.weatherStatus{font-size:8px;font-weight:800;padding:4px 7px;border-radius:20px;background:#edf2f4;color:#607581}.windState.loaded{background:#dff6ed;color:#16745d}.windState.loading{background:#fff0d8;color:#8b5a10}.windState.failed,.windState.stale,.windState.notloaded,.windState.notapplicable{background:#fae0e3;color:#a62f42}.windState.manual,.windState.embedded{background:#e4effa;color:#205f89}.windText{font-size:9px;color:#607581;line-height:1.4;margin-top:6px}.windValues{font-size:10.5px;font-weight:700;color:#244657;line-height:1.4;margin-top:4px}.compactWeather{margin:8px 0}.compactWeather>summary{font-size:11px!important;color:#163c52!important;text-transform:uppercase;letter-spacing:.45px;display:flex;justify-content:space-between;align-items:center}.weatherControls{display:grid;grid-template-columns:1fr 90px 80px;gap:5px;margin-top:8px}.weatherMini{margin-top:7px;padding:8px;border-radius:8px;background:#eef7fa;color:#244657;font-size:10px;line-height:1.45}.weatherDetails{margin-top:7px}.weatherTableWrap{max-height:310px}.weatherPrintReport{display:none}body.weatherPrintMode>header,body.weatherPrintMode>.shell,body.weatherPrintMode>.developerContact,body.weatherPrintMode>.toast,body.weatherPrintMode>.egg,body.weatherPrintMode>#report{display:none!important}body.weatherPrintMode>#weatherPrintReport{display:block!important}@media print{body.weatherPrintMode>#weatherPrintReport{display:block!important}}@media(max-width:500px){.weatherControls{grid-template-columns:1fr 1fr}.weatherControls button{grid-column:1/-1}}';document.head.appendChild(s)}
  function version(){let sub=document.querySelector('header .sub');if(sub){sub.textContent=sub.textContent.replace(/ • v1\.5\.\d+/g,'').replace(/ • v1\.6\.\d+/g,'');sub.insertAdjacentHTML('beforeend',' • v1.6.0')}}
  function boot(){try{styles();installWindEngine();installWindCard();wrapPreflight();wrapSelectTime();wrapCalculateWindGuard();wrapOnlineUpdateWind();installWeather();version();refreshPreflight?.();updateWindCard()}catch(e){console.error('v1.6 weather/wind enhancements',e)}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,180));else setTimeout(boot,180);
})();
