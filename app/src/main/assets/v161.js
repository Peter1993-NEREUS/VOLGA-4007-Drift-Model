'use strict';
(function(){
  function ddm16(v,isLat){const h=isLat?(v<0?'S':'N'):(v<0?'W':'E'),a=Math.abs(Number(v)),d=Math.floor(a),m=(a-d)*60;return `${String(d).padStart(isLat?2:3,'0')}°${m.toFixed(4).padStart(7,'0')}′${h}`}
  function clip16(text,msg){try{Android.setClipboardText(text);toast(msg)}catch(_){}}
  function guardOnlineWind(){
    if(typeof updateCMEMS!=='function'||updateCMEMS.__windGuard161)return;let old=updateCMEMS;
    updateCMEMS=async function(){let r=await old();if(S.source==='online'&&!S.windOnline){clearResults();let b=document.getElementById('windDataState'),t=document.getElementById('windDataText'),v=document.getElementById('windDataValues');if(b){b.textContent='FAILED';b.className='windState failed'}if(t)t.textContent='CMEMS ocean data is loaded, but matching wind data is not loaded.';if(v)v.textContent='Choose LOAD / RELOAD WIND, MANUAL wind, or WIND OFF before CALCULATE.';toast('CMEMS ready • wind is not loaded • route cleared',true)}return r};updateCMEMS.__windGuard161=true;
  }
  function fixSummary(){let b=document.getElementById('copySummary');if(!b)return;b.onclick=()=>{if(!S.track.length)return toast('Calculate route first',true);let a=S.track[0],e=S.track.at(-1),d=bd(a,e),v=vesselInfo(),txt=`MARINE DRIFT MODEL by NEREUS\nVessel: ${v.name}${v.imo?' / IMO '+v.imo:''}\nPeriod LT: ${localFmt(a.ms)} -> ${localFmt(e.ms)}\nStart DD: ${a.lat.toFixed(6)}, ${a.lon.toFixed(6)}\nStart ship: ${ddm16(a.lat,true)} ${ddm16(a.lon,false)}\nEnd DD: ${e.lat.toFixed(6)}, ${e.lon.toFixed(6)}\nEnd ship: ${ddm16(e.lat,true)} ${ddm16(e.lon,false)}\nDisplacement: ${(d[1]/1852).toFixed(1)} NM\nBearing: ${d[0].toFixed(1)}°T\nMax sensitivity: ${maxSpread().toFixed(1)} NM\nData pack: ${String(S.source).toUpperCase()}\nActual draft: ${v.draft.toFixed(2)} m\nLeeway: ${(v.leeway*100).toFixed(2)}%\nWind mode: ${document.getElementById('windMode')?.value||'off'}\nMarine Drift Model by NEREUS`;clip16(txt,'Drift summary copied')}}
  function version(){let sub=document.querySelector('header .sub');if(sub){sub.textContent=sub.textContent.replace(/ • v1\.6\.\d+/g,'');sub.insertAdjacentHTML('beforeend',' • v1.6.1')}}
  function boot(){try{guardOnlineWind();fixSummary();version()}catch(e){console.error('v1.6.1 guard',e)}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,220));else setTimeout(boot,220);
})();
