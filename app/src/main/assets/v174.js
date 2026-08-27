'use strict';
(function(){
  const $g=id=>document.getElementById(id);
  const RHO_AIR=1.25,RHO_WATER=1025,LEEWAY_MAX=.08;
  const GEO_IDS=['shipDepth','shipLpp','shipDesignDraft','shipDisplacement','shipAirDraft','shipCb','windAreaLat','windAreaFront'];
  S.geometrySources=S.geometrySources||{};

  function clamp(x,a,b){x=Number(x);return Math.max(a,Math.min(b,x))}
  function num(id){const n=Number($g(id)?.value);return Number.isFinite(n)?n:0}
  function mode(){return $g('leewayMode')?.value||'manual'}
  function typeText(){return String($g('shipType')?.value||'').toLowerCase()}
  function val(x,n=2){return Number.isFinite(Number(x))?Number(x).toFixed(n):'—'}
  function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
  function badge(text,kind='derived'){return `<span class="geoBadge ${kind.toLowerCase().replace(/\s+/g,'')}">${esc(text)}</span>`}

  function sourceFor(id,fallback='USER'){
    return S.geometrySources?.[id]||fallback;
  }
  function setField(id,value,source='PUBLIC',overwrite=false){
    const el=$g(id),n=Number(value);if(!el||!Number.isFinite(n)||n<=0)return false;
    if(!overwrite&&Number(el.value)>0)return false;
    el.value=String(Math.round(n*1000)/1000);S.geometrySources[id]=source;return true;
  }
  function clearGeometry(){
    for(const id of GEO_IDS){if($g(id))$g(id).value=''}S.geometrySources={};S.leewayCalibration&&(S.leewayCalibration.v2Basis=null);renderV2();
  }

  function typeDefaults(){
    const t=typeText();
    if(/passenger|cruise|ferry/.test(t))return {cb:.62,superRatio:.58,side:.72,front:.82,label:'passenger/ferry'};
    if(/container/.test(t))return {cb:.66,superRatio:.38,side:.72,front:.82,label:'container'};
    if(/ro-?ro|vehicle/.test(t))return {cb:.64,superRatio:.48,side:.78,front:.86,label:'ro-ro'};
    if(/tanker|oil|chemical|product/.test(t))return {cb:.82,superRatio:.12,side:.46,front:.70,label:'tanker'};
    if(/bulk/.test(t))return {cb:.82,superRatio:.14,side:.48,front:.70,label:'bulk carrier'};
    if(/fishing|trawler/.test(t))return {cb:.58,superRatio:.28,side:.66,front:.78,label:'fishing'};
    if(/general cargo|cargo|freighter/.test(t))return {cb:.72,superRatio:.20,side:.58,front:.74,label:'general cargo'};
    return {cb:.70,superRatio:.20,side:.58,front:.74,label:'generic ship'};
  }

  // IMO 1969 tonnage relation: GT = (0.2 + 0.02 log10(V)) * V.
  // V is enclosed volume, not displacement volume.
  function volumeFromGt(gt){
    gt=Number(gt);if(!(gt>0))return 0;
    let lo=1,hi=Math.max(1000,gt*12);
    const f=v=>(.2+.02*Math.log10(Math.max(1,v)))*v;
    while(f(hi)<gt&&hi<2e8)hi*=2;
    for(let i=0;i<70;i++){const m=(lo+hi)/2;if(f(m)<gt)lo=m;else hi=m}
    return (lo+hi)/2;
  }
  function windCd(exposed){exposed=Math.max(0,Number(exposed)||0);if(exposed>37.2)return 1.4;if(exposed>15)return 1.045+.016*(exposed-15);return .700+.023*exposed}
  function waterCd(loa,draft){let dl=clamp((Number(draft)||0)/Math.max(1,Number(loa)||1),.025,.07),beta=2*dl;if(beta>.12)return 1.27;if(beta>.10)return 1.32+(1.27-1.32)/.02*(beta-.10);if(beta>.08)return 1.38+(1.32-1.38)/.02*(beta-.08);if(beta>.06)return 1.44+(1.38-1.44)/.02*(beta-.06);return 1.50+(1.44-1.50)/.01*(beta-.05)}

  function loadingCondition(draft,designDraft,cargo,dwt){
    const cr=dwt>0?clamp(cargo/dwt,0,1.5):NaN,dr=designDraft>0?draft/designDraft:NaN;
    let state='UNKNOWN',confidence='ESTIMATED';
    if((Number.isFinite(cr)&&cr>=.78)||(Number.isFinite(dr)&&dr>=.94))state='LADEN / FULL';
    else if((Number.isFinite(cr)&&cr>=.25)||(Number.isFinite(dr)&&dr>=.72))state='PART LOAD';
    else if(Number.isFinite(cr)||Number.isFinite(dr))state='BALLAST / LIGHT';
    if(Number.isFinite(cr)&&Number.isFinite(dr))confidence='DERIVED';
    return {state,confidence,cargoRatio:cr,draftRatio:dr};
  }

  function autoV2(){
    const loa=num('loa'),beam=num('beam'),draft=num('draft'),gt=num('gt'),dwt=num('dwt'),cargo=num('cargo');
    if(!(loa>0&&beam>0&&draft>0))return {ok:false,reason:'AUTO v2 needs LOA, Beam and Actual Draft'};
    const td=typeDefaults();
    let lpp=num('shipLpp'),lppQ=lpp>0?sourceFor('shipLpp'):'ESTIMATED';if(!(lpp>0)){lpp=loa*.96}
    lpp=clamp(lpp,loa*.78,loa*1.01);
    let depth=num('shipDepth'),depthQ=depth>0?sourceFor('shipDepth'):'ESTIMATED';
    if(!(depth>draft+.15)){depth=Math.max(draft+.6,beam*.39);depthQ='ESTIMATED'}
    const freeboard=Math.max(.15,depth-draft);
    const designDraft=num('shipDesignDraft')||draft,designQ=num('shipDesignDraft')>0?sourceFor('shipDesignDraft'):'CURRENT DRAFT';
    const displacement=num('shipDisplacement'),dispQ=displacement>0?sourceFor('shipDisplacement'):'ESTIMATED';
    let cb=num('shipCb'),cbQ=cb>0?sourceFor('shipCb'):'ESTIMATED';
    if(!(cb>=.45&&cb<=.95)){
      if(displacement>0&&lpp>0&&beam>0&&designDraft>0){const raw=displacement*1000/(RHO_WATER*lpp*beam*designDraft);if(raw>=.45&&raw<=.95){cb=raw;cbQ='DERIVED'}else{cb=td.cb;cbQ='ESTIMATED'}}else{cb=td.cb;cbQ='ESTIMATED'}
    }
    cb=clamp(cb,.45,.95);
    const displacementEst=displacement>0?displacement:RHO_WATER*lpp*beam*designDraft*cb/1000;
    const displacementVolume=displacementEst*1000/RHO_WATER;
    const gtVolume=volumeFromGt(gt);
    const load=loadingCondition(draft,num('shipDesignDraft'),cargo,dwt);

    let superEq=beam*td.superRatio;
    if(/container/.test(typeText())){const cr=Number.isFinite(load.cargoRatio)?clamp(load.cargoRatio,0,1):.5;superEq*=.78+.55*cr}
    if(gtVolume>0){const mean=gtVolume/(Math.max(1,lpp)*Math.max(1,beam)),extra=Math.max(0,mean-depth);superEq=Math.max(superEq,Math.min(beam*.68,extra*.55))}
    const airDraft=num('shipAirDraft');if(airDraft>freeboard+.5)superEq=Math.max(superEq,Math.min(beam*.72,(airDraft-freeboard)*.25));
    superEq=clamp(superEq,.5,beam*.78);

    let areaLat=num('windAreaLat'),areaLatQ=areaLat>0?sourceFor('windAreaLat'):'ESTIMATED';
    if(!(areaLat>0)){areaLat=lpp*(freeboard*.88+superEq*td.side);areaLatQ='ESTIMATED'}
    let areaFront=num('windAreaFront'),areaFrontQ=areaFront>0?sourceFor('windAreaFront'):'ESTIMATED';
    if(!(areaFront>0)){areaFront=beam*(freeboard*.85+superEq*td.front);areaFrontQ='ESTIMATED'}
    areaLat=Math.max(1,areaLat);areaFront=Math.max(1,areaFront);

    const underFill=clamp(.78+.20*cb,.86,.98),areaUnder=lpp*draft*underFill;
    const equivalentExposed=Math.max(.25,areaLat/lpp),cf=windCd(equivalentExposed),cd=waterCd(lpp,draft);
    let fraction=Math.sqrt((RHO_AIR*cf*areaLat)/(RHO_WATER*cd*areaUnder));
    // AF is used only as a conservative orientation/aspect correction because actual yaw/heading is unknown.
    const expected=Math.max(.02,beam/lpp),shape=(areaFront/areaLat)/expected,shapeModifier=clamp(.97+.03*Math.sqrt(clamp(shape,.25,4)),.93,1.07);
    fraction=clamp(fraction*shapeModifier,.001,LEEWAY_MAX);

    const qualities=[lppQ,depthQ,cbQ,areaLatQ,areaFrontQ],estimated=qualities.filter(x=>x==='ESTIMATED').length,derived=qualities.filter(x=>x==='DERIVED').length;
    const unc=estimated>=3?.48:estimated>=1?.36:derived>=2?.28:.22;
    return {ok:true,fraction,low:clamp(fraction*(1-unc),.0005,LEEWAY_MAX),high:clamp(fraction*(1+unc),.001,LEEWAY_MAX),uncertainty:unc,
      loa,beam,draft,lpp,lppQ,depth,depthQ,freeboard,designDraft,designQ,displacement:displacementEst,displacementQ:dispQ,displacementVolume,gtVolume,cb,cbQ,
      areaLat,areaLatQ,areaFront,areaFrontQ,areaUnder,equivalentExposed,cf,cd,shapeModifier,superEq,load,typeLabel:td.label,airDraft};
  }
  S.autoLeewayV2=autoV2;

  function basicCalibrationValid(){
    const c=S.leewayCalibration,b=c?.basis,p=startPoint();if(!c||!b||!p||!b.start)return false;
    let startMs=NaN;try{startMs=requestedRange()[0]}catch(_){startMs=utcMs(S.meta?.startUtc)}
    const posErr=bd(p,b.start)[1]/1852;
    const entered=num('leewayHeight'),beam=num('beam'),draft=num('draft');
    let ratio=.65,t=typeText();if(/passenger|cruise|ferry/.test(t))ratio=1.10;else if(/container|ro-?ro|vehicle/.test(t))ratio=.90;else if(/fishing|trawler/.test(t))ratio=.72;else if(/tanker|oil|chemical|product/.test(t))ratio=.62;else if(/bulk|general cargo|cargo|freighter/.test(t))ratio=.60;
    const h=entered>draft+.25?entered:Math.max(draft+.75,beam>0?beam*ratio:draft+4);
    return posErr<=.05&&Math.abs(startMs-Number(b.start.ms))<=60000&&Math.abs(draft-Number(b.draft))<=.05&&Math.abs(num('loa')-Number(b.loa))<=.15&&Math.abs(beam-Number(b.beam))<=.15&&Math.abs(h-Number(b.height))<=.15&&($g('windMode')?.value||'off')===b.windMode&&Math.abs(num('windSpeed')-Number(b.windSpeed))<=.05&&Math.abs(num('windDir')-Number(b.windDir))<=.5&&String(S.windOnline?.loadedUtc||'')===String(b.windLoadedUtc||'');
  }
  function geoSignature(){return {depth:num('shipDepth'),lpp:num('shipLpp'),designDraft:num('shipDesignDraft'),displacement:num('shipDisplacement'),airDraft:num('shipAirDraft'),cb:num('shipCb'),areaLat:num('windAreaLat'),areaFront:num('windAreaFront')}}
  function sameGeo(a,b){if(!a||!b)return false;return ['depth','lpp','designDraft','displacement','airDraft','cb','areaLat','areaFront'].every(k=>Math.abs(Number(a[k]||0)-Number(b[k]||0))<=({displacement:2,areaLat:2,areaFront:1}[k]||.05))}
  function calibrationValidV2(){return basicCalibrationValid()&&sameGeo(S.leewayCalibration?.v2Basis,geoSignature())}
  S.leewayCalibrationValidV2=calibrationValidV2;

  function patchLeewayFraction(){
    if(typeof leewayFraction!=='function'||leewayFraction.__autoV2)return;
    const old=leewayFraction;
    leewayFraction=function(){
      if(Number.isFinite(Number(S._leewayFractionOverride)))return Number(S._leewayFractionOverride);
      const m=mode();if(m==='off')return 0;if(m==='manual')return old();if(m==='calibrated'&&calibrationValidV2())return old();
      const a=autoV2();return a.ok?a.fraction:old();
    };leewayFraction.__autoV2=true;
  }
  function patchWind(){
    if(typeof wind!=='function'||wind.__autoV2)return;
    const old=wind;
    wind=function(ms,kMul=1){
      const z=old(ms,kMul);
      if(Number.isFinite(Number(S._leewayFractionOverride)))return z;
      const m=mode(),needs=m==='auto'||(m==='calibrated'&&!calibrationValidV2());if(!needs)return z;
      const a=autoV2(),sp=Number(z?.[2]),fr=Number(z?.[3]);if(!a.ok||!Number.isFinite(sp)||sp<=0||!Number.isFinite(fr))return z;
      const k=a.fraction*Math.max(0,Number(kMul)||0),to=((fr+180)%360+360)%360*DEG;
      return [k*sp*Math.sin(to),k*sp*Math.cos(to),sp,fr];
    };wind.__autoV2=true;
  }

  function geometryHtml(a){
    if(!a?.ok)return `<b>AUTO v2 unavailable</b> • ${esc(a?.reason||'check vessel geometry')}`;
    const q=(name,value,unit,quality)=>`<div><span>${esc(name)}</span><b>${esc(value)}${unit?` ${unit}`:''}</b>${badge(quality,quality)}</div>`;
    return `<div class="geoGrid">
      ${q('LPP',val(a.lpp,2),'m',a.lppQ)}${q('Depth',val(a.depth,2),'m',a.depthQ)}${q('Freeboard',val(a.freeboard,2),'m','DERIVED')}${q('Cb',val(a.cb,3),'',a.cbQ)}
      ${q('Lateral area AL',val(a.areaLat,0),'m²',a.areaLatQ)}${q('Frontal area AF',val(a.areaFront,0),'m²',a.areaFrontQ)}${q('Underwater lateral',val(a.areaUnder,0),'m²','DERIVED')}${q('Loading',a.load.state,'',a.load.confidence)}
      ${q('Displacement',val(a.displacement,0),'t',a.displacementQ)}${q('Displacement volume',val(a.displacementVolume,0),'m³','DERIVED')}${q('GT enclosed volume',a.gtVolume?val(a.gtVolume,0):'—','m³',a.gtVolume?'DERIVED':'ESTIMATED')}${q('Ship class',a.typeLabel,'','ESTIMATED')}
    </div>`;
  }
  function renderV2(){
    const a=autoV2(),r=$g('autoV2Readout');if(r)r.innerHTML=geometryHtml(a);
    const m=mode(),box=$g('leewayModelReadout');if(!box)return;
    if((m==='auto'||m==='calibrated')&&a.ok){
      const stale=m==='calibrated'&&!calibrationValidV2();
      if(m==='auto'||stale){box.innerHTML=`<b>${stale?'CALIBRATION STALE • AUTO v2 FALLBACK':'AUTO v2'} ${(a.fraction*100).toFixed(2)}%</b> • sensitivity ${(a.low*100).toFixed(2)}–${(a.high*100).toFixed(2)}%<br><small>Freeboard ${a.freeboard.toFixed(2)} m • AL ${a.areaLat.toFixed(0)} m² • AF ${a.areaFront.toFixed(0)} m² • Cb ${a.cb.toFixed(3)} • ${a.load.state}. Direct windage only; CMEMS Stokes remains separate.${stale?' Re-calibrate after geometry/scenario changes.':''}</small>`;
        const lee=$g('leeway');if(lee){lee.value=(a.fraction*100).toFixed(2);lee.disabled=true}
      }
    }
  }

  function installUi(){
    const parent=$g('leewayModelBox');if(!parent||$g('autoV2Geometry'))return;
    const d=document.createElement('details');d.id='autoV2Geometry';d.className='advanced autoV2Geometry';d.innerHTML=`<summary>SHIP GEOMETRY / AUTO v2 <span class="geoBadge derived">ADVANCED</span></summary>
      <div class="geoIntro">More geometry reduces AUTO uncertainty. Leave unknown values blank: the model will derive or estimate them and show the source quality.</div>
      <div class="grid2 geoInputs">
        <div><label>Moulded depth m</label><input id="shipDepth" class="input" type="number" step="0.01" min="0" placeholder="AUTO estimate"></div>
        <div><label>LPP / LBP m</label><input id="shipLpp" class="input" type="number" step="0.01" min="0" placeholder="≈ 0.96 × LOA"></div>
        <div><label>Reference / design draft m</label><input id="shipDesignDraft" class="input" type="number" step="0.01" min="0"></div>
        <div><label>Displacement t</label><input id="shipDisplacement" class="input" type="number" step="1" min="0"></div>
        <div><label>Air draft m</label><input id="shipAirDraft" class="input" type="number" step="0.1" min="0" placeholder="optional"></div>
        <div><label>Block coefficient Cb</label><input id="shipCb" class="input" type="number" step="0.001" min="0.45" max="0.95" placeholder="AUTO derive"></div>
        <div><label>PROJECTED LATERAL AREA AL m²</label><input id="windAreaLat" class="input" type="number" step="1" min="0" placeholder="AUTO estimate"></div>
        <div><label>PROJECTED FRONTAL AREA AF m²</label><input id="windAreaFront" class="input" type="number" step="1" min="0" placeholder="AUTO estimate"></div>
      </div>
      <div id="autoV2Readout" class="autoV2Readout">—</div>
      <div class="hint">GT VOLUME is derived from the IMO tonnage relation and represents enclosed volume — not displacement volume. Explicit AL/AF from ship drawings or windage tables are preferred. Orientation/yaw is not assumed known, so AF is used only as a bounded aspect correction.</div>`;
    const cal=parent.querySelector('.leewayCal');if(cal)cal.insertAdjacentElement('beforebegin',d);else parent.appendChild(d);
    const st=document.createElement('style');st.textContent=`.autoV2Geometry{margin-top:7px;border-top:1px solid #d9e6eb;padding-top:5px}.autoV2Geometry summary{font-size:9px;font-weight:850;color:#21495e}.geoIntro{font-size:8.5px;color:#607581;line-height:1.4;margin:6px 0}.geoInputs{gap:5px}.autoV2Readout{margin-top:7px;padding:7px;border:1px solid #d7e5ea;border-radius:8px;background:#fbfdfe}.geoGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:4px}.geoGrid>div{padding:5px;border-radius:6px;background:#f2f7f9;min-width:0}.geoGrid span{display:block;font-size:7.6px;color:#667d89}.geoGrid b{display:block;font-size:9px;color:#244657;overflow-wrap:anywhere}.geoBadge{display:inline-block!important;width:max-content;margin-top:2px;padding:2px 4px;border-radius:10px;font-size:6.8px!important;font-weight:850;letter-spacing:.2px}.geoBadge.verified{background:#dff6ed;color:#176b58}.geoBadge.public{background:#e6f0f8;color:#285f83}.geoBadge.user{background:#e8eef7;color:#405f84}.geoBadge.derived,.geoBadge.currentdraft{background:#e8f2f6;color:#406776}.geoBadge.estimated{background:#fff0d8;color:#8b5a10}@media(max-width:430px){.geoGrid{grid-template-columns:1fr}}@media(pointer:coarse){${GEO_IDS.map(id=>'#'+id).join(',')}{min-height:44px}}`;document.head.appendChild(st);
    for(const id of GEO_IDS){const e=$g(id);if(!e)continue;e.addEventListener('input',()=>{if(e.value)S.geometrySources[id]='USER';setTimeout(()=>{renderV2();if(mode()==='auto'||mode()==='calibrated'){clearResults();refreshPreflight?.()}},0)});e.addEventListener('change',renderV2)}
    ['loa','beam','draft','cargo','dwt','gt','shipType','leewayHeight'].forEach(id=>$g(id)?.addEventListener('input',()=>setTimeout(renderV2,0)));
  }

  const VOLGA_PROFILE={depth:6.70,designDraft:4.52,displacement:8595,gt:4911,ballast:2240,fuel:438,source:'PROJECT 19610 / PUBLIC TECHNICAL PARTICULARS'};
  function applyVolgaProfile(){
    if(String($g('imo')?.value||'').replace(/\D/g,'')!=='8728816')return false;
    let changed=false;changed=setField('shipDepth',VOLGA_PROFILE.depth,'VERIFIED')||changed;changed=setField('shipDesignDraft',VOLGA_PROFILE.designDraft,'VERIFIED')||changed;changed=setField('shipDisplacement',VOLGA_PROFILE.displacement,'VERIFIED')||changed;
    if($g('gt')&&!(num('gt')>0)){$g('gt').value=VOLGA_PROFILE.gt;changed=true}
    S.volgaProfile={...VOLGA_PROFILE};if(changed)renderV2();return changed;
  }

  function patchPresets(){
    if(typeof vesselInfo==='function'&&!vesselInfo.__geo174){const old=vesselInfo;vesselInfo=function(){const v=old();v.depth=num('shipDepth');v.lpp=num('shipLpp');v.designDraft=num('shipDesignDraft');v.displacement=num('shipDisplacement');v.airDraft=num('shipAirDraft');v.blockCoeff=num('shipCb');v.windAreaLat=num('windAreaLat');v.windAreaFront=num('windAreaFront');v.geometrySources={...S.geometrySources};return v};vesselInfo.__geo174=true}
    if(typeof setVessel==='function'&&!setVessel.__geo174){const old=setVessel;setVessel=function(v){const r=old(v);const map={shipDepth:v?.depth,shipLpp:v?.lpp,shipDesignDraft:v?.designDraft,shipDisplacement:v?.displacement,shipAirDraft:v?.airDraft,shipCb:v?.blockCoeff,windAreaLat:v?.windAreaLat,windAreaFront:v?.windAreaFront};for(const [id,x] of Object.entries(map))if($g(id))$g(id).value=Number(x)>0?String(x):'';S.geometrySources={...(v?.geometrySources||{})};if(String(v?.imo||'').replace(/\D/g,'')==='8728816')setTimeout(applyVolgaProfile,0);setTimeout(renderV2,0);return r};setVessel.__geo174=true}
    if(typeof builtinPreset==='function'&&!builtinPreset.__geo174){const old=builtinPreset;builtinPreset=function(){const v=old();if(String(v?.imo||'')==='8728816')return {...v,depth:VOLGA_PROFILE.depth,designDraft:VOLGA_PROFILE.designDraft,displacement:VOLGA_PROFILE.displacement,gt:Number(v.gt)>0?v.gt:VOLGA_PROFILE.gt,geometrySources:{shipDepth:'VERIFIED',shipDesignDraft:'VERIFIED',shipDisplacement:'VERIFIED'}};return v};builtinPreset.__geo174=true}
  }

  async function pullExtendedLookup(){
    try{
      const imo=String($g('imo')?.value||'').replace(/\D/g,'');if(!/^\d{7}$/.test(imo))return;
      const j=await fetch(`https://raw.githubusercontent.com/${REPO}/lookup/vessel.json?t=${Date.now()}`,{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('lookup raw '+r.status);return r.json()});
      if(String(j.imo)!==imo||j.status!=='ready')return;
      let changed=false;changed=setField('shipDepth',j.depth,'PUBLIC')||changed;changed=setField('shipLpp',j.lpp,'PUBLIC')||changed;changed=setField('shipDesignDraft',j.referenceDraft,'PUBLIC')||changed;changed=setField('shipDisplacement',j.displacement,'PUBLIC')||changed;changed=setField('shipAirDraft',j.airDraft,'PUBLIC')||changed;
      if(changed){renderV2();refreshPreflight?.();toast('Extended ship geometry added to AUTO v2 from public particulars')}
    }catch(e){console.info('AUTO v2 extended lookup unavailable',e?.message||e)}
  }
  function hookLookup(){const st=$g('lookupStatus');if(st)new MutationObserver(()=>{/CURRENT PUBLIC DATA|FALLBACK PUBLIC DATA/i.test(st.textContent||'')&&setTimeout(pullExtendedLookup,100)}).observe(st,{childList:true,subtree:true,characterData:true})}

  function hookCalibration(){
    const st=$g('leewayCalStatus');if(!st)return;
    new MutationObserver(()=>{if(/^CALIBRATED\b/.test((st.textContent||'').trim())&&S.leewayCalibration){S.leewayCalibration.v2Basis=geoSignature();setTimeout(renderV2,0)}}).observe(st,{childList:true,subtree:true,characterData:true});
  }
  function patchResults(){
    if(typeof results==='function'&&!results.__autoV2174){const old=results;results=function(){const r=old();try{const a=autoV2(),m=mode();if(S.track?.length&&a.ok&&(m==='auto'||(m==='calibrated'&&!calibrationValidV2()))&&$g('engineStatus')){$g('engineStatus').textContent=$g('engineStatus').textContent.replace(/ • LEEWAY (?:AUTO FALLBACK|AUTO) [0-9.]+%[^•]*/,'');$g('engineStatus').textContent+=` • LEEWAY ${m==='calibrated'?'AUTO v2 FALLBACK':'AUTO v2'} ${(a.fraction*100).toFixed(2)}%`}renderV2()}catch(_){}return r};results.__autoV2174=true}
  }
  function patchCalculate(){if(typeof calculate==='function'&&!calculate.__autoV2174){const old=calculate;calculate=function(...args){const r=old.apply(this,args);setTimeout(renderV2,0);return r};calculate.__autoV2174=true}}

  function hookResetAndHistory(){
    [$g('customPreset'),$g('reset')].filter(Boolean).forEach(b=>b.addEventListener('click',()=>setTimeout(()=>{if(($g('preset')?.value||'').includes('custom'))clearGeometry()},35)));
    $g('historyLoad')?.addEventListener('click',()=>setTimeout(()=>{try{const arr=JSON.parse(localStorage.getItem('nereus_drift_history_v15')||'[]'),x=arr.find(z=>z.id===$g('historySelect')?.value),v=x?.v;if(!v)return;const map={shipDepth:v.depth,shipLpp:v.lpp,shipDesignDraft:v.designDraft,shipDisplacement:v.displacement,shipAirDraft:v.airDraft,shipCb:v.blockCoeff,windAreaLat:v.windAreaLat,windAreaFront:v.windAreaFront};for(const [id,n] of Object.entries(map))if($g(id))$g(id).value=Number(n)>0?String(n):'';S.geometrySources={...(v.geometrySources||{})};renderV2()}catch(_){}},80));
  }

  function boot(){
    try{installUi();patchPresets();patchLeewayFraction();patchWind();patchResults();patchCalculate();hookCalibration();hookLookup();hookResetAndHistory();applyVolgaProfile();renderV2()}catch(e){console.error('AUTO v2 v174 boot',e)}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,1720));else setTimeout(boot,1720);
})();
