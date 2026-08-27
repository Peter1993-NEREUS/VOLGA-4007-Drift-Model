'use strict';
(function(){
  const $l=id=>document.getElementById(id);
  const RHO_AIR=1.25, RHO_WATER=1025, LEEWAY_MAX=.08;
  S.leewayCalibration=S.leewayCalibration||null;

  function clamp(x,a,b){x=Number(x);return Math.max(a,Math.min(b,x))}
  function mode(){return $l('leewayMode')?.value||'manual'}
  function typeText(){return String($l('shipType')?.value||'').toLowerCase()}
  function typeHeightRatio(){
    const t=typeText();
    if(/passenger|cruise|ferry/.test(t))return 1.10;
    if(/container|ro-?ro|vehicle/.test(t))return .90;
    if(/fishing|trawler/.test(t))return .72;
    if(/tanker|oil|chemical|product/.test(t))return .62;
    if(/bulk|general cargo|cargo|freighter/.test(t))return .60;
    return .65;
  }
  function effectiveHeight(){
    const draft=Math.max(.1,Number($l('draft')?.value||0)),beam=Math.max(0,Number($l('beam')?.value||0));
    const entered=Number($l('leewayHeight')?.value||0);
    if(Number.isFinite(entered)&&entered>draft+.25)return {height:entered,estimated:false};
    const h=Math.max(draft+.75,beam>0?beam*typeHeightRatio():draft+4);
    return {height:h,estimated:true};
  }
  // Direct windage component, adapted from the deterministic ship-force approach used by OpenDrift ShipDrift.
  // Stokes drift remains a separate CMEMS vector in this application to avoid double counting wave-induced transport.
  function windCd(exposed){
    exposed=Math.max(0,Number(exposed)||0);
    if(exposed>37.2)return 1.4;
    if(exposed>15)return 1.045+.016*(exposed-15);
    return .700+.023*exposed;
  }
  function waterCd(loa,draft){
    let dl=clamp((Number(draft)||0)/Math.max(1,Number(loa)||1),.025,.07),beta=2*dl;
    if(beta>.12)return 1.27;
    if(beta>.10)return 1.32+(1.27-1.32)/.02*(beta-.10);
    if(beta>.08)return 1.38+(1.32-1.38)/.02*(beta-.08);
    if(beta>.06)return 1.44+(1.38-1.44)/.02*(beta-.06);
    return 1.50+(1.44-1.50)/.01*(beta-.05);
  }
  function autoEstimate(){
    const loa=Number($l('loa')?.value||0),beam=Number($l('beam')?.value||0),draft=Number($l('draft')?.value||0);
    if(!(loa>0&&beam>0&&draft>0))return {ok:false,fraction:Math.max(0,Number($l('leeway')?.value||0))/100,reason:'AUTO needs LOA, Beam and Actual Draft'};
    const eh=effectiveHeight(),exposed=Math.max(.25,eh.height-draft),cf=windCd(exposed),cd=waterCd(loa,draft);
    const areaDry=loa*exposed,areaWet=loa*draft;
    let fraction=Math.sqrt((RHO_AIR*cf*areaDry)/(RHO_WATER*cd*areaWet));
    fraction=clamp(fraction,.001,LEEWAY_MAX);
    return {ok:true,fraction,height:eh.height,heightEstimated:eh.estimated,exposed,cf,cd,areaDry,areaWet,low:fraction*.65,high:Math.min(LEEWAY_MAX,fraction*1.35)};
  }
  function currentSignature(){
    let p=startPoint(),startMs=NaN;try{startMs=requestedRange()[0]}catch(_){startMs=utcMs(S.meta?.startUtc)}
    const eh=effectiveHeight();
    return {start:p?{lat:p.lat,lon:p.lon,ms:startMs}:null,draft:Number($l('draft')?.value||0),loa:Number($l('loa')?.value||0),beam:Number($l('beam')?.value||0),height:eh.height,windMode:$l('windMode')?.value||'off',windSpeed:Number($l('windSpeed')?.value||0),windDir:Number($l('windDir')?.value||0),windLoadedUtc:S.windOnline?.loadedUtc||''};
  }
  function calibrationValid(){
    const c=S.leewayCalibration,s=currentSignature(),b=c?.basis;if(!c||!b||!s.start||!b.start)return false;
    const posErr=bd(s.start,b.start)[1]/1852;
    return posErr<=.05&&Math.abs(Number(s.start.ms)-Number(b.start.ms))<=60000&&Math.abs(s.draft-b.draft)<=.05&&Math.abs(s.loa-b.loa)<=.15&&Math.abs(s.beam-b.beam)<=.15&&Math.abs(s.height-b.height)<=.15&&s.windMode===b.windMode&&Math.abs(s.windSpeed-b.windSpeed)<=.05&&Math.abs(s.windDir-b.windDir)<=.5&&String(s.windLoadedUtc||'')===String(b.windLoadedUtc||'');
  }
  function effectiveFraction(){
    if(Number.isFinite(Number(S._leewayFractionOverride)))return clamp(Number(S._leewayFractionOverride),0,LEEWAY_MAX);
    const m=mode();
    if(m==='off')return 0;
    if(m==='calibrated'&&calibrationValid())return clamp(Number(S.leewayCalibration.fraction),0,LEEWAY_MAX);
    if(m==='auto'||m==='calibrated'){const a=autoEstimate();return a.ok?a.fraction:Math.max(0,Number($l('leeway')?.value||0))/100}
    return Math.max(0,Number($l('leeway')?.value||0))/100;
  }
  function effectiveAngle(){
    if(Number.isFinite(Number(S._leewayAngleOverride)))return Number(S._leewayAngleOverride);
    return mode()==='calibrated'&&calibrationValid()&&Number.isFinite(Number(S.leewayCalibration?.angleDeg))?Number(S.leewayCalibration.angleDeg):0;
  }
  function modelName(){return mode()==='calibrated'&&!calibrationValid()?'AUTO FALLBACK':mode().toUpperCase()}

  if(typeof leewayFraction==='function'&&!leewayFraction.__auto172){
    leewayFraction=function(){return effectiveFraction()};
    leewayFraction.__auto172=true;
  }
  if(typeof wind==='function'&&!wind.__auto172){
    const prevWind=wind;
    wind=function(ms,kMul=1){
      const z=prevWind(ms,kMul),sp=Number(z?.[2]),fr=Number(z?.[3]);
      if(!Number.isFinite(sp)||sp<=0||!Number.isFinite(fr))return z||[0,0,0,0];
      const k=effectiveFraction()*Number(kMul||0),to=((fr+180+effectiveAngle())%360+360)%360*DEG;
      return [k*sp*Math.sin(to),k*sp*Math.cos(to),sp,fr];
    };
    wind.__auto172=true;
  }

  function withLeeway(k,angle,fn){
    const ok=S._leewayFractionOverride,oa=S._leewayAngleOverride;
    S._leewayFractionOverride=k;S._leewayAngleOverride=angle;
    try{return fn()}finally{S._leewayFractionOverride=ok;S._leewayAngleOverride=oa}
  }
  function computeVariant(lat,lon,kMul=1,stokesMul=1,angle=null){
    if(angle===null||angle===undefined)return compute(lat,lon,kMul,stokesMul);
    const k=effectiveFraction();return withLeeway(k,angle,()=>compute(lat,lon,kMul,stokesMul));
  }
  function simulateTo(endMs,k,angle){
    const p=startPoint();if(!p)throw Error('Set START coordinates first');
    const start=utcMs(S.meta?.startUtc),limit=Math.min(Number(endMs),utcMs(S.meta?.endUtc)),dt=15*60000;
    if(!Number.isFinite(start)||!Number.isFinite(limit)||limit<=start)throw Error('Calibration time must be after route START and inside loaded CMEMS period');
    return withLeeway(k,angle,()=>{
      let lat=p.lat,lon=p.lon;
      for(let ms=start;ms<limit;ms+=dt){
        const sec=Math.min(dt,limit-ms)/1000,f=field(ms,lat,lon,1,1);
        if(!f)throw Error(`CMEMS U/V unavailable during calibration at ${localFmt(ms)}`);
        [lat,lon]=dest(lat,lon,f.ut,f.vt,sec);
      }
      return {lat,lon,ms:limit};
    });
  }
  function errorNm(pred,obs){return bd(pred,obs)[1]/1852}
  function yieldUi(){return new Promise(r=>setTimeout(r,0))}
  async function calibrate(){
    const out=$l('leewayCalStatus'),btn=$l('calibrateLeeway');
    try{
      if(!$l('windMode')||$l('windMode').value==='off')throw Error('Select Loaded / Embedded / Manual wind before calibration');
      const obsArr=parseCoordsText($l('calPair').value),obs={lat:obsArr[0],lon:obsArr[1]};validateCoords(obs.lat,obs.lon);
      const obsMs=controlUtc('calDate','calTime'),start=utcMs(S.meta?.startUtc),end=utcMs(S.meta?.endUtc);
      if(!(obsMs>start&&obsMs<=end))throw Error('Known position time must be after ROUTE START and within loaded CMEMS period');
      const probe=wind(start,1);if(!(Number(probe?.[2])>0))throw Error('Wind data is unavailable for calibration period');
      btn.disabled=true;out.textContent='CALIBRATING • coarse search…';
      let best={err:Infinity,k:0,angle:0,pred:null},count=0;
      for(let k=0;k<=LEEWAY_MAX+.00001;k+=.0025){
        for(let a=-30;a<=30;a+=5){
          try{const pred=simulateTo(obsMs,k,a),err=errorNm(pred,obs);if(err<best.err)best={err,k,angle:a,pred}}catch(_){}
          if(++count%40===0){out.textContent=`CALIBRATING • ${count} candidates • best ${best.err.toFixed(2)} NM`;await yieldUi()}
        }
      }
      if(!Number.isFinite(best.err))throw Error('No valid calibration solution inside loaded CMEMS area');
      out.textContent='CALIBRATING • fine search…';count=0;
      const k0=best.k,a0=best.angle;
      for(let k=Math.max(0,k0-.003);k<=Math.min(LEEWAY_MAX,k0+.003)+.000001;k+=.0005){
        for(let a=Math.max(-35,a0-6);a<=Math.min(35,a0+6);a+=1){
          try{const pred=simulateTo(obsMs,k,a),err=errorNm(pred,obs);if(err<best.err)best={err,k,angle:a,pred}}catch(_){}
          if(++count%35===0)await yieldUi();
        }
      }
      S.leewayCalibration={fraction:best.k,angleDeg:best.angle,errorNm:best.err,observed:{lat:obs.lat,lon:obs.lon,ms:obsMs},predicted:{lat:best.pred.lat,lon:best.pred.lon},basis:currentSignature(),createdUtc:new Date().toISOString()};
      $l('leewayMode').value='calibrated';
      updateUi();clearResults();refreshPreflight?.();
      out.textContent=`CALIBRATED • ${(best.k*100).toFixed(2)}% • ${best.angle>=0?'+':''}${best.angle.toFixed(0)}° crosswind • fit ${best.err.toFixed(2)} NM`;
      toast(`Leeway calibrated: ${(best.k*100).toFixed(2)}% • fit ${best.err.toFixed(2)} NM`);
      setTimeout(()=>calculate(),60);
    }catch(e){out.textContent='CALIBRATION FAILED • '+e.message;toast(e.message,true)}finally{if(btn)btn.disabled=false}
  }

  function syncLeewayField(){
    const inp=$l('leeway');if(!inp)return;
    const m=mode(),f=effectiveFraction();
    if(m!=='manual')inp.value=(f*100).toFixed(2);
    inp.disabled=m!=='manual';inp.title=m==='manual'?'Manual windage/leeway coefficient':'Calculated effective leeway coefficient';
  }
  function updateUi(){
    const box=$l('leewayModelReadout');if(!box)return;
    syncLeewayField();
    const m=mode(),f=effectiveFraction(),ang=effectiveAngle(),a=autoEstimate(),calOk=calibrationValid();
    if(m==='off')box.innerHTML='<b>OFF</b> • direct wind leeway disabled. ROUTE uses CURRENT + STOKES.';
    else if(m==='manual')box.innerHTML=`<b>MANUAL ${(f*100).toFixed(2)}%</b> • direct wind drift ${(f*100).toFixed(2)}% of 10 m wind speed.`;
    else if(m==='calibrated'&&calOk){const c=S.leewayCalibration;box.innerHTML=`<b>CALIBRATED ${(f*100).toFixed(2)}%</b> • divergence ${ang>=0?'+':''}${ang.toFixed(0)}° • fit error ${Number(c.errorNm).toFixed(2)} NM.<br><small>Known position ${Number(c.observed?.lat).toFixed(5)}, ${Number(c.observed?.lon).toFixed(5)} at ${localFmt(c.observed?.ms)}.</small>`}
    else if(m==='calibrated'&&!calOk&&a.ok)box.innerHTML=`<b>CALIBRATION STALE • AUTO FALLBACK ${(a.fraction*100).toFixed(2)}%</b><br><small>START, time, vessel geometry or wind source changed. Re-calibrate before relying on the calibrated coefficient.</small>`;
    else if(a.ok)box.innerHTML=`<b>AUTO ${(a.fraction*100).toFixed(2)}%</b> • sensitivity ${(a.low*100).toFixed(2)}–${(a.high*100).toFixed(2)}% • effective height ${a.height.toFixed(1)} m${a.heightEstimated?' (ESTIMATED)':''}.<br><small>Exposed ${a.exposed.toFixed(1)} m • C<sub>air</sub> ${a.cf.toFixed(2)} • C<sub>water</sub> ${a.cd.toFixed(2)} • direct windage only; Stokes is added separately.</small>`;
    else box.innerHTML=`<b>AUTO unavailable</b> • ${a.reason}. Manual ${(f*100).toFixed(2)}% fallback is being used.`;
    if(m!=='manual'){try{$l('leeway').dispatchEvent(new Event('input',{bubbles:false}))}catch(_){}}
  }
  function fillCalibrationDefaults(){
    try{
      const p=S.track?.length?S.track.at(-1):null,ms=p?.ms||controlUtc('endDate','endTime'),off=Number($l('offset')?.value||0),d=new Date(ms+off*3600000);
      if(p&&!$l('calPair').value)$l('calPair').value=`${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}`;
      if(!$l('calDate').value)$l('calDate').value=`${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
      if(!$l('calTime').value)$l('calTime').value=`${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`;
    }catch(_){}
  }

  function installUi(){
    if($l('leewayModelBox'))return;
    const lee=$l('leeway'),grid=lee?.closest('.grid3'),section=lee?.closest('section.card');if(!lee||!section)return;
    const label=lee.parentElement?.querySelector('label');if(label)label.textContent='Leeway % / effective';
    const box=document.createElement('div');box.id='leewayModelBox';box.className='leewayModelBox';
    box.innerHTML=`<div class="leewayTitle"><b>LEEWAY MODEL</b><span>AUTO • CALIBRATED • MANUAL • OFF</span></div>
      <div class="grid2"><div><label>Mode</label><select id="leewayMode"><option value="auto">AUTO • ship model</option><option value="calibrated">CALIBRATED • known position</option><option value="manual" selected>MANUAL</option><option value="off">OFF</option></select></div><div><label>Effective total height m</label><input id="leewayHeight" class="input" type="number" step="0.1" min="0" placeholder="AUTO estimate"></div></div>
      <div id="leewayModelReadout" class="leewayReadout">—</div>
      <details class="advanced leewayCal"><summary>CALIBRATE FROM KNOWN POSITION</summary><label>Known position</label><input id="calPair" class="input" placeholder="43.975267, 38.181139"><div class="grid2"><div><label>Date LT</label><input id="calDate" class="input" type="date"></div><div><label>Time LT</label><input id="calTime" class="input" type="time"></div></div><button id="calibrateLeeway" class="secondary big" type="button">CALIBRATE LEEWAY</button><div id="leewayCalStatus" class="hint">Fits direct windage coefficient + left/right divergence against a known observed position. Current + Stokes are retained from CMEMS.</div></details>
      <div class="hint">AUTO is a deterministic ship windage estimate. It is not a substitute for measured drift. CALIBRATED is preferred when a reliable known position is available.</div>`;
    if(grid)grid.insertAdjacentElement('afterend',box);else section.appendChild(box);
    const style=document.createElement('style');style.textContent=`.leewayModelBox{margin-top:8px;padding:9px;border:1px solid #cbdde5;border-radius:10px;background:#f7fbfd}.leewayTitle{display:flex;align-items:center;justify-content:space-between;gap:8px;color:#17465f;font-size:9px}.leewayTitle span{font-size:7.5px;color:#607581}.leewayReadout{margin-top:7px;padding:7px;border-radius:8px;background:#eef6f9;border:1px solid #d8e7ed;color:#355464;font-size:9.5px;line-height:1.45}.leewayReadout b{color:#0b4266}.leewayReadout small{color:#607581}.leewayCal button{margin-top:7px}@media(pointer:coarse){#leewayMode,#leewayHeight,#calPair,#calDate,#calTime,#calibrateLeeway{min-height:44px}}`;document.head.appendChild(style);
    $l('leewayMode').addEventListener('change',()=>{if($l('leewayMode').value==='calibrated'&&!S.leewayCalibration){toast('No calibration yet — enter a known position and press CALIBRATE',true);$l('leewayMode').value='auto'}updateUi();clearResults();refreshPreflight?.()});
    $l('leewayHeight').addEventListener('change',()=>{updateUi();clearResults();refreshPreflight?.()});
    ['loa','beam','draft','shipType','cargo','dwt','windMode','windSpeed','windDir'].forEach(id=>$l(id)?.addEventListener('change',()=>{if(mode()==='auto'||mode()==='calibrated'){updateUi();clearResults();refreshPreflight?.()}}));
    lee.addEventListener('input',()=>{if(mode()==='manual')updateUi()});
    $l('calibrateLeeway').onclick=calibrate;
    $l('calPair').addEventListener('focus',fillCalibrationDefaults,{once:true});
    updateUi();
  }

  function patchPresets(){
    if(typeof vesselInfo==='function'&&!vesselInfo.__leeway172){const old=vesselInfo;vesselInfo=function(){const v=old();v.leewayMode=mode();v.leewayHeight=Number($l('leewayHeight')?.value||0);v.leewayCalibration=S.leewayCalibration?JSON.parse(JSON.stringify(S.leewayCalibration)):null;return v};vesselInfo.__leeway172=true}
    if(typeof setVessel==='function'&&!setVessel.__leeway172){const old=setVessel;setVessel=function(v){const r=old(v);S.leewayCalibration=v?.leewayCalibration||null;if($l('leewayMode'))$l('leewayMode').value=v?.leewayMode||'manual';if($l('leewayHeight'))$l('leewayHeight').value=Number(v?.leewayHeight)>0?Number(v.leewayHeight).toFixed(1):'';updateUi();return r};setVessel.__leeway172=true}
  }
  function patchResults(){
    if(typeof results==='function'&&!results.__leeway172){const old=results;results=function(){const r=old();if(S.track?.length&&$l('engineStatus')){$l('engineStatus').textContent+=` • LEEWAY ${modelName()} ${(effectiveFraction()*100).toFixed(2)}%${effectiveAngle()?` @ ${effectiveAngle()>=0?'+':''}${effectiveAngle().toFixed(0)}°`:''}`}return r};results.__leeway172=true}
  }
  function patchCalculateEnvelope(){
    if(typeof calculate==='function'&&!calculate.__leeway172){const old=calculate;calculate=function(silent=false){const r=old(silent);try{if(S.track?.length&&mode()!=='off'&&$l('windMode')?.value!=='off'){const p=startPoint(),a=effectiveAngle();S.alts.push(computeVariant(p.lat,p.lon,1,1,a-20));S.alts.push(computeVariant(p.lat,p.lon,1,1,a+20));results();fitRoute();selectTime(S.selected,false);table();report();drawAll();updateUi()}}catch(e){if(!silent)toast('Directional leeway sensitivity: '+e.message,true)}return r};calculate.__leeway172=true}
  }
  function patchStateVisibility(){
    document.addEventListener('change',e=>{if(['pair','startDate','startTime','endDate','endTime','offset'].includes(e.target?.id))setTimeout(updateUi,0)},true);
    if(typeof setStart==='function'&&!setStart.__leeway172){const old=setStart;setStart=function(...a){const r=old.apply(this,a);setTimeout(updateUi,0);return r};setStart.__leeway172=true}
  }
  function boot(){try{installUi();patchPresets();patchResults();patchCalculateEnvelope();patchStateVisibility();updateUi()}catch(e){console.error('Leeway v172 boot',e)}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,1250));else setTimeout(boot,1250);
})();
