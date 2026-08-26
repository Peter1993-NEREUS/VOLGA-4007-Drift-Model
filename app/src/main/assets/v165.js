'use strict';
(function(){
  const $m=id=>document.getElementById(id);
  function ddm(v,isLat){
    const h=isLat?(v<0?'S':'N'):(v<0?'W':'E');
    const a=Math.abs(Number(v)),d=Math.floor(a),m=(a-d)*60;
    return `${String(d).padStart(isLat?2:3,'0')}°${m.toFixed(4).padStart(7,'0')}′${h}`;
  }
  function updateMapCoordOverlay(){
    const box=$m('mapCoordOverlay');if(!box)return;
    const lat=Number($m('lat')?.value),lon=Number($m('lon')?.value);
    if(!Number.isFinite(lat)||!Number.isFinite(lon)){
      box.innerHTML='<b>START POINT</b><span>Coordinates unavailable</span>';
      return;
    }
    box.innerHTML=`<b>START POINT</b><span>${lat.toFixed(6)}, ${lon.toFixed(6)}</span><small>${ddm(lat,true)}  ${ddm(lon,false)}</small>`;
  }
  function installOverlay(){
    const wrap=$m('canvaswrap');if(!wrap||$m('mapCoordOverlay'))return;
    const box=document.createElement('div');
    box.id='mapCoordOverlay';box.className='mapCoordOverlay';
    wrap.appendChild(box);
    const style=document.createElement('style');
    style.textContent=`.mapCoordOverlay{position:absolute;right:8px;bottom:26px;z-index:4;background:#071f33e8;color:#fff;border:1px solid #ffffff24;border-radius:9px;padding:7px 9px;min-width:205px;max-width:min(72vw,310px);font-size:9px;line-height:1.35;pointer-events:none;box-shadow:0 3px 12px #0003}.mapCoordOverlay b{display:block;font-size:8px;letter-spacing:.7px;color:#9fd7eb;margin-bottom:2px}.mapCoordOverlay span{display:block;font-size:11px;font-weight:800;white-space:nowrap}.mapCoordOverlay small{display:block;font-size:9px;color:#d8edf5;margin-top:2px;white-space:nowrap}@media(max-width:650px){.mapCoordOverlay{right:6px;bottom:24px;min-width:190px;padding:6px 8px}.mapCoordOverlay span{font-size:10px}.mapCoordOverlay small{font-size:8.5px}}`;
    document.head.appendChild(style);
    updateMapCoordOverlay();
  }
  function hookSetStart(){
    if(typeof setStart!=='function'||setStart.__mapCoordOverlay)return;
    const old=setStart;
    const wrapped=function(lat,lon,clear,center){
      const r=old(lat,lon,clear,center);
      updateMapCoordOverlay();
      return r;
    };
    wrapped.__mapCoordOverlay=true;
    setStart=wrapped;
  }
  function watchManualFields(){
    ['lat','lon','pair','shipPair'].forEach(id=>{
      const el=$m(id);if(!el)return;
      el.addEventListener('change',()=>setTimeout(updateMapCoordOverlay,0));
      el.addEventListener('blur',()=>setTimeout(updateMapCoordOverlay,0));
    });
  }
  function boot(){
    try{installOverlay();hookSetStart();watchManualFields();updateMapCoordOverlay()}catch(e){console.error('map coordinate overlay',e)}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,520));else setTimeout(boot,520);
})();
