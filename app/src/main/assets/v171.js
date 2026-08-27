'use strict';
(function(){
  const $=id=>document.getElementById(id);
  const ERRORS=[];
  const VERSION='1.7.0';
  const MAX_ERRORS=12;

  function pushError(kind,msg,src=''){
    ERRORS.unshift({time:new Date().toISOString(),kind:String(kind||'ERROR'),msg:String(msg||'Unknown error').slice(0,500),src:String(src||'').slice(0,240)});
    if(ERRORS.length>MAX_ERRORS)ERRORS.length=MAX_ERRORS;
    updateHealth();
  }
  window.addEventListener('error',e=>pushError('JS',e.message,e.filename?`${e.filename}:${e.lineno||0}`:''));
  window.addEventListener('unhandledrejection',e=>pushError('PROMISE',e.reason?.message||e.reason||'Unhandled rejection'));

  function comp(d){const a=['N','NNE','NE','ENE','E','ESE','SE','SSE','S','SSW','SW','WSW','W','WNW','NW','NNW'];d=((Number(d)%360)+360)%360;return a[Math.round(d/22.5)%16]}
  function dir(d,n=0){d=Number(d);return Number.isFinite(d)?`${d.toFixed(n)}°T (${comp(d)})`:'—'}
  function val(x,n=1){return x==null||!Number.isFinite(Number(x))?'—':Number(x).toFixed(n)}
  function ddm(v,lat){const h=lat?(v<0?'S':'N'):(v<0?'W':'E'),a=Math.abs(Number(v)),d=Math.floor(a),m=(a-d)*60;return `${String(d).padStart(lat?2:3,'0')}°${m.toFixed(4).padStart(7,'0')}′${h}`}
  function fmt(ms){try{return typeof localFmt==='function'?localFmt(ms):new Date(ms).toISOString()}catch(_){return new Date(ms).toISOString()}}

  function routeAnchor(){
    const w=window.S?.weatherReport;
    if(Number.isFinite(Number(w?.routeAnchorMs)))return Number(w.routeAnchorMs);
    const mode=$('weatherPoint')?.value||'start',track=Array.isArray(window.S?.track)?window.S.track:[];
    if(mode==='end'&&track.length&&Number.isFinite(Number(track.at(-1)?.ms)))return Number(track.at(-1).ms);
    if(mode==='map'&&track.length){const i=Math.max(0,Math.min(track.length-1,Number(window.S?.selected)||0)),ms=Number(track[i]?.ms);if(Number.isFinite(ms))return ms}
    if(track.length&&Number.isFinite(Number(track[0]?.ms)))return Number(track[0].ms);
    try{const r=typeof requestedRange==='function'?requestedRange():null;if(Array.isArray(r)){const ms=Number(mode==='end'?r[1]:r[0]);if(Number.isFinite(ms))return ms}}catch(_){}
    return Date.now();
  }
  function nearest(rows,ms){return rows.reduce((a,b)=>Math.abs(Number(b.ms)-ms)<Math.abs(Number(a.ms)-ms)?b:a,rows[0])}
  function enforceRouteWeather(){
    const w=window.S?.weatherReport;if(!w?.rows?.length)return;
    const ms=routeAnchor();w.routeAnchorMs=ms;const x=nearest(w.rows,ms),p=w.point;
    const pointHtml=`<b>${p.label} POINT</b><br>${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}<br>${ddm(p.lat,true)} ${ddm(p.lon,false)}<br><strong>ROUTE ${fmt(ms)}</strong>`;
    const miniHtml=`<b>${val(x.wind)} m/s</b> FROM ${dir(x.windDir)} • gust <b>${val(x.gust)}</b> • air <b>${val(x.temp)}°C</b> • wave <b>${val(x.wave)} m</b> FROM ${dir(x.waveDir)} • SST ${val(x.sst)}°C`;
    const pr=$('weatherPointReadout'),mi=$('weatherMini');if(pr&&pr.innerHTML!==pointHtml)pr.innerHTML=pointHtml;if(mi&&mi.innerHTML!==miniHtml)mi.innerHTML=miniHtml;
    updateHealth();
  }
  function guardWeather(){
    const st=$('weatherStatus'),mi=$('weatherMini');
    if(st)new MutationObserver(()=>{/LOADED/.test(st.textContent||'')&&setTimeout(enforceRouteWeather,30)}).observe(st,{childList:true,subtree:true,characterData:true});
    if(mi)new MutationObserver(()=>{if(window.S?.weatherReport?.rows?.length)setTimeout(enforceRouteWeather,0)}).observe(mi,{childList:true,subtree:true,characterData:true});
  }

  function notificationState(){try{return Android?.getNotificationStatus?.()||'unknown'}catch(_){return 'bridge unavailable'}}
  function health(){
    let route='NO ROUTE';try{if(S?.track?.length)route=`ROUTE ${S.track.length} pts`}catch(_){}
    let source='DATA —';try{source=S?.source?String(S.source).toUpperCase():'DATA —'}catch(_){}
    return {online:navigator.onLine,notification:notificationState(),errors:ERRORS.length,route,source};
  }
  function updateHealth(){
    const h=health(),bar=$('systemHealthBar');if(!bar)return;
    const n=h.notification==='allowed'?'NOTIFY OK':h.notification==='blocked'||h.notification==='channel_blocked'?'NOTIFY BLOCKED':h.notification==='permission_required'?'NOTIFY PERMISSION':'NOTIFY '+String(h.notification).toUpperCase();
    bar.innerHTML=`<span class="sysChip ${h.online?'ok':'bad'}">${h.online?'ONLINE':'OFFLINE'}</span><span class="sysChip">${h.source}</span><span class="sysChip">${h.route}</span><button id="sysNotifyChip" class="sysChip ${h.notification==='allowed'?'ok':h.notification==='blocked'||h.notification==='channel_blocked'?'bad':'warn'}">${n}</button><span class="sysChip ${h.errors?'bad':'ok'}">JS ${h.errors?'ERROR '+h.errors:'OK'}</span>`;
    $('sysNotifyChip')?.addEventListener('click',()=>{$('systemDiag')&&( $('systemDiag').open=true);$('systemDiag')?.scrollIntoView({behavior:'smooth',block:'center'})},{once:true});
  }

  function testRow(ok,title,detail){return `<div class="diagRow ${ok?'ok':'bad'}"><span>${ok?'✓':'!'}</span><div><b>${title}</b><small>${detail}</small></div></div>`}
  function runChecks(){
    const rows=[];
    rows.push(testRow(!!window.S,'Runtime state','window.S '+(window.S?'available':'missing')));
    rows.push(testRow(typeof calculate==='function','Route engine',typeof calculate==='function'?'calculate() available':'calculate() missing'));
    rows.push(testRow(!!$('map')?.getContext?.('2d'),'Canvas','2D rendering context'));
    let ls=false;try{const k='nereus_diag_'+Date.now();localStorage.setItem(k,'1');ls=localStorage.getItem(k)==='1';localStorage.removeItem(k)}catch(_){}rows.push(testRow(ls,'Local storage',ls?'read/write OK':'storage unavailable'));
    const bridge=typeof Android==='object';rows.push(testRow(bridge,'Android bridge',bridge?'connected':'unavailable'));
    const ns=notificationState();rows.push(testRow(ns==='allowed','Notifications',ns));
    rows.push(testRow(navigator.onLine,'Network',navigator.onLine?'navigator online':'navigator offline'));
    let rt=true,rd='No route calculated';try{if(S?.track?.length){rt=S.track.every(x=>Number.isFinite(Number(x.ms))&&Number.isFinite(Number(x.lat))&&Number.isFinite(Number(x.lon)));rd=`${S.track.length} points • ${fmt(S.track[0].ms)} → ${fmt(S.track.at(-1).ms)}`}}catch(_){rt=false;rd='Route state exception'}rows.push(testRow(rt,'Route integrity',rd));
    let wx=true,wd='Weather not loaded';try{const w=S?.weatherReport;if(w?.rows?.length){const a=routeAnchor(),x=nearest(w.rows,a),delta=Math.abs(x.ms-a)/60000;wx=delta<=61;wd=`anchor ${fmt(a)} • nearest forecast ${fmt(x.ms)} • Δ ${delta.toFixed(0)} min`}}catch(_){wx=false;wd='Weather state exception'}rows.push(testRow(wx,'Weather ↔ route time',wd));
    rows.push(testRow(ERRORS.length===0,'Runtime errors',ERRORS.length?ERRORS.map(e=>`${e.kind}: ${e.msg}`).join(' | '):'No captured JS errors'));
    const box=$('diagResults');if(box)box.innerHTML=rows.join('');
    updateHealth();return rows;
  }
  function diagnosticsText(){
    const h=health(),w=window.S?.weatherReport,a=w?.rows?.length?routeAnchor():null;
    return [`MARINE DRIFT MODEL by NEREUS • v${VERSION}`,'SYSTEM DIAGNOSTICS',`Time UTC: ${new Date().toISOString()}`,`Network: ${h.online?'ONLINE':'OFFLINE'}`,`Notifications: ${h.notification}`,`Data source: ${h.source}`,`Route: ${h.route}`,`Weather anchor: ${a?fmt(a):'not loaded'}`,`User agent: ${navigator.userAgent}`,`Viewport: ${innerWidth}x${innerHeight} @${devicePixelRatio||1}x`,`Errors: ${ERRORS.length}`,...ERRORS.map(e=>`${e.time} ${e.kind} ${e.msg} ${e.src}`)].join('\n');
  }

  function installDiagnostics(){
    if($('systemHealthBar'))return;
    const header=document.querySelector('header');if(header){const bar=document.createElement('div');bar.id='systemHealthBar';bar.className='systemHealthBar';header.insertAdjacentElement('afterend',bar)}
    const side=document.querySelector('.sidebar');if(side){const d=document.createElement('details');d.id='systemDiag';d.className='card advanced systemDiag';d.innerHTML='<summary>SYSTEM CHECK <span class="diagVersion">v1.7.0</span></summary><div class="diagIntro">Local self-diagnostics. No telemetry is uploaded.</div><div id="diagResults" class="diagResults"></div><div class="diagActions"><button id="runDiag" class="secondary">RUN CHECK</button><button id="testNotify" class="secondary">TEST NOTIFICATION</button><button id="notifySettings" class="secondary">NOTIFICATION SETTINGS</button><button id="copyDiag" class="secondary">COPY DIAGNOSTICS</button></div>';side.appendChild(d);
      $('runDiag').onclick=runChecks;$('testNotify').onclick=()=>{try{Android.sendTestNotification();toast('Test notification requested')}catch(_){toast('Android notification bridge unavailable',true)};setTimeout(()=>{runChecks()},500)};$('notifySettings').onclick=()=>{try{Android.openNotificationSettings()}catch(_){toast('Notification settings unavailable',true)}};$('copyDiag').onclick=()=>{const t=diagnosticsText();try{Android.setClipboardText(t);toast('Diagnostics copied')}catch(_){navigator.clipboard?.writeText(t);toast('Diagnostics copied')}};
    }
    document.querySelectorAll('button').forEach(b=>{if(!b.getAttribute('aria-label')){const t=(b.textContent||'').trim();if(t==='+')b.setAttribute('aria-label','Zoom in');else if(t==='−'||t==='-')b.setAttribute('aria-label','Zoom out');else if(t)b.setAttribute('aria-label',t)}});
    const toastEl=$('toast');if(toastEl){toastEl.setAttribute('role','status');toastEl.setAttribute('aria-live','polite')}
    updateHealth();
  }

  function styles(){
    const s=document.createElement('style');s.textContent=`
      :root{--focus:#2aa7d2;--ok:#147b65;--warn:#a96b0b;--bad:#a83043}
      button,.input,select{transition:box-shadow .16s ease,border-color .16s ease,transform .08s ease}
      button:active{transform:translateY(1px)}
      button:focus-visible,.input:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid color-mix(in srgb,var(--focus) 55%,transparent);outline-offset:2px}
      .systemHealthBar{max-width:1600px;margin:7px auto 0;padding:0 9px;display:flex;gap:5px;align-items:center;overflow-x:auto;scrollbar-width:none}
      .systemHealthBar::-webkit-scrollbar{display:none}.sysChip{flex:0 0 auto;border:1px solid #cbdbe3;background:#f8fbfc;color:#405d6c;border-radius:999px;padding:5px 8px;font-size:8px;font-weight:800;letter-spacing:.25px;line-height:1.1}.sysChip.ok{background:#e3f5ef;border-color:#b8dfd3;color:#176b58}.sysChip.warn{background:#fff3dd;border-color:#ecd6a6;color:#8b5a10}.sysChip.bad{background:#fae7e9;border-color:#e5bcc3;color:#9b3142}button.sysChip{cursor:pointer}
      .systemDiag summary{display:flex!important;align-items:center;justify-content:space-between}.diagVersion{font-size:8px;background:#e8f2f6;padding:3px 6px;border-radius:20px}.diagIntro{font-size:9px;color:#607581;margin:7px 0}.diagResults{display:grid;gap:5px}.diagRow{display:grid;grid-template-columns:20px 1fr;gap:6px;padding:6px;border:1px solid #dce7ec;border-radius:8px;background:#fbfdfe}.diagRow>span{font-weight:900;font-size:13px;text-align:center}.diagRow.ok>span{color:var(--ok)}.diagRow.bad>span{color:var(--bad)}.diagRow b{display:block;font-size:9.5px;color:#274a5c}.diagRow small{display:block;font-size:8px;color:#667b86;margin-top:1px;line-height:1.35;overflow-wrap:anywhere}.diagActions{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:7px}.diagActions button{font-size:9px}
      @media(pointer:coarse){button,.input,select{min-height:44px}.mini{min-height:38px}.chip{min-height:36px;display:inline-flex;align-items:center}.zoomctl button{min-width:44px;min-height:44px;width:44px;height:44px}.tab{min-height:40px}}
      @media(max-width:650px){.systemHealthBar{padding:0 7px}.card{border-radius:14px}.mapcard{border-radius:14px}.diagActions{grid-template-columns:1fr}.shell{gap:7px}}
      @media(prefers-reduced-motion:reduce){*,*::before,*::after{scroll-behavior:auto!important;animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important}}
      @media(prefers-contrast:more){.card,.input,select,button{border-width:2px}.hint,.status{color:#40515b}.sysChip{border-width:2px}}
    `;document.head.appendChild(s);
  }

  function hookState(){
    addEventListener('online',updateHealth);addEventListener('offline',updateHealth);addEventListener('resize',()=>setTimeout(updateHealth,50));
    document.addEventListener('change',()=>setTimeout(updateHealth,0),true);
    if(typeof calculate==='function'&&!calculate.__diag171){const old=calculate;calculate=function(...a){try{return old.apply(this,a)}catch(e){pushError('ROUTE',e?.message||e);throw e}finally{setTimeout(()=>{updateHealth();enforceRouteWeather()},0)}};calculate.__diag171=true}
  }
  function loadLeeway172(){
    if(document.getElementById('enh172'))return;
    const s=document.createElement('script');s.id='enh172';s.src='v172.js';
    s.onerror=()=>pushError('MODULE','Failed to load v172.js');
    s.onload=()=>{
      if(document.getElementById('enh173'))return;
      const q=document.createElement('script');q.id='enh173';q.src='v173.js';q.onerror=()=>pushError('MODULE','Failed to load v173.js');document.body.appendChild(q);
    };
    document.body.appendChild(s);
  }

  function boot(){try{styles();installDiagnostics();guardWeather();hookState();setTimeout(enforceRouteWeather,50);setTimeout(updateHealth,100);setTimeout(loadLeeway172,180)}catch(e){pushError('BOOT',e?.message||e)}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,1050));else setTimeout(boot,1050);
})();
