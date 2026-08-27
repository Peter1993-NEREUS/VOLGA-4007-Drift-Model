'use strict';
(function(){
  window.refreshPreflight=window.refreshPreflight||function(){
    try{const e=document.getElementById('draft');if(e)e.dispatchEvent(new Event('change',{bubbles:true}));}catch(_){}
  };
  window.notify=window.notify||function(state,text){try{Android.notifyCmems(String(state||'progress'),String(text||''))}catch(_){}};

  // v1.7.0 hotfix: weather must be anchored to route time, not device current time.
  const $rw=id=>document.getElementById(id);
  function routeWeatherAnchor(){
    const mode=$rw('weatherPoint')?.value||'start';
    const track=Array.isArray(window.S?.track)?window.S.track:[];
    if(mode==='end'&&track.length){const ms=Number(track.at(-1)?.ms);if(Number.isFinite(ms))return ms}
    if(mode==='map'&&track.length){
      const i=Math.max(0,Math.min(track.length-1,Number(window.S?.selected)||0));
      const ms=Number(track[i]?.ms);if(Number.isFinite(ms))return ms;
    }
    if(track.length){const ms=Number(track[0]?.ms);if(Number.isFinite(ms))return ms}
    try{
      const r=typeof window.requestedRange==='function'?window.requestedRange():null;
      if(Array.isArray(r)){
        const ms=Number(mode==='end'?r[1]:r[0]);
        if(Number.isFinite(ms))return ms;
      }
    }catch(_){}
    return Date.now();
  }
  function wxVal(x,d=1,s='—'){return x===null||x===undefined||!Number.isFinite(Number(x))?s:Number(x).toFixed(d)}
  function nearestRouteWeather(rows,ms){
    return rows.reduce((best,x)=>Math.abs(Number(x.ms)-ms)<Math.abs(Number(best.ms)-ms)?x:best,rows[0]);
  }
  function refreshRouteWeatherSummary(anchor){
    const w=window.S?.weatherReport;if(!w?.rows?.length)return;
    const ms=Number.isFinite(Number(anchor))?Number(anchor):Number(w.routeAnchorMs)||routeWeatherAnchor();
    w.routeAnchorMs=ms;
    const x=nearestRouteWeather(w.rows,ms);
    const fmt=typeof window.localFmt==='function'?window.localFmt(ms):new Date(ms).toISOString();
    const point=$rw('weatherPointReadout');
    if(point)point.textContent=`${w.point.label} • ${w.point.lat.toFixed(5)}, ${w.point.lon.toFixed(5)} • ROUTE ${fmt}`;
    const mini=$rw('weatherMini');
    if(mini)mini.innerHTML=`<b>${wxVal(x.wind,1)} m/s</b> FROM ${wxVal(x.windDir,0)}°T • gust <b>${wxVal(x.gust,1)}</b> • air <b>${wxVal(x.temp,1)}°C</b> • wave <b>${wxVal(x.wave,1)} m</b> / ${wxVal(x.waveDir,0)}° • SST ${wxVal(x.sst,1)}°C`;
    const st=$rw('weatherStatus');
    if(st&&/^LOADED/.test(st.textContent||''))st.textContent=(st.textContent||'LOADED')+` • ROUTE ${fmt}`;
  }
  function patchWeatherLoad(){
    const b=$rw('loadWeather');
    if(!b||typeof b.onclick!=='function'||b.__routeTimeWeather)return false;
    const old=b.onclick;
    b.onclick=function(e){
      const anchor=routeWeatherAnchor();
      const realNow=Date.now;
      let calls=0,p;
      // weatherRange() is the first Date.now() call. Later Date.now() calls (e.g. archive/forecast selection)
      // must still see the real current time.
      Date.now=()=>++calls===1?anchor:realNow();
      try{p=old.call(this,e)}finally{Date.now=realNow}
      return Promise.resolve(p).then(r=>{refreshRouteWeatherSummary(anchor);return r});
    };
    b.__routeTimeWeather=true;
    return true;
  }
  function installRouteWeatherPatch(){
    let n=0;
    const timer=setInterval(()=>{if(patchWeatherLoad()||++n>40)clearInterval(timer)},100);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installRouteWeatherPatch);else installRouteWeatherPatch();
})();
