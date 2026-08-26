'use strict';
(function(){
  const $x=id=>document.getElementById(id);
  function ddm(v,isLat){
    const h=isLat?(v<0?'S':'N'):(v<0?'W':'E'),a=Math.abs(Number(v)),d=Math.floor(a),m=(a-d)*60;
    return `${String(d).padStart(isLat?2:3,'0')}°${m.toFixed(4).padStart(7,'0')}′${h}`;
  }
  function dms(v,isLat){
    const h=isLat?(v<0?'S':'N'):(v<0?'W':'E'),a=Math.abs(Number(v)),d=Math.floor(a),mf=(a-d)*60,m=Math.floor(mf),s=(mf-m)*60;
    return `${String(d).padStart(isLat?2:3,'0')}°${String(m).padStart(2,'0')}′${s.toFixed(1).padStart(4,'0')}″${h}`;
  }
  function current(){
    const lat=Number($x('lat')?.value),lon=Number($x('lon')?.value);
    return Number.isFinite(lat+lon)?[lat,lon]:null;
  }
  function syncDisplays(){
    const z=current(); if(!z)return;
    const [lat,lon]=z,ship=$x('shipPair'),dmsOut=$x('dmsReadout');
    if(ship && document.activeElement!==ship)ship.value=`${ddm(lat,true)}  ${ddm(lon,false)}`;
    const pair=$x('pair'); if(pair && document.activeElement!==pair)pair.value=`${lat.toFixed(6)}, ${lon.toFixed(6)}`;
    if(dmsOut)dmsOut.textContent=`DMS: ${dms(lat,true)}  ${dms(lon,false)}`;
  }
  function applyText(text,source){
    try{
      const z=parseCoordsText(text); setStart(z[0],z[1],true,false); syncDisplays();
      if(source==='ship') toast('Ship coordinates converted to Google / decimal format');
      else toast('Google / decimal coordinates converted to ship format');
    }catch(e){ toast(e.message,true); }
  }
  function debounceInput(el,source){
    let timer=null;
    el.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{try{const z=parseCoordsText(el.value);setStart(z[0],z[1],true,false);syncDisplays()}catch(_){ }},550)});
    el.addEventListener('change',()=>applyText(el.value,source));
  }
  function installCoordinatePanel(){
    const pair=$x('pair'); if(!pair||$x('shipPair'))return;
    const label=pair.previousElementSibling; if(label&&label.tagName==='LABEL')label.textContent='Google Maps / Decimal Degrees (DD)';
    pair.placeholder='43.975267, 38.181139';
    const wrap=document.createElement('div');
    wrap.innerHTML=`<label>Судовые координаты (Degrees + Decimal Minutes / DDM)</label><input id="shipPair" class="input coordbox" inputmode="text" placeholder="43°58.5160′N 038°10.8683′E"><div id="dmsReadout" class="hint" style="margin-top:4px"></div><div class="hint">Оба поля синхронизированы. Можно вводить DD, DDM или DMS; при изменении одного формата второй пересчитывается автоматически.</div>`;
    const tools=pair.nextElementSibling;
    if(tools)tools.insertAdjacentElement('afterend',wrap); else pair.insertAdjacentElement('afterend',wrap);
    debounceInput(pair,'google'); debounceInput($x('shipPair'),'ship');
    syncDisplays();
  }
  function hookStart(){
    if(typeof setStart!=='function'||setStart.__coordHook)return;
    const old=setStart;
    const wrapped=function(lat,lon,clear,center){const r=old(lat,lon,clear,center);syncDisplays();return r};
    wrapped.__coordHook=true; setStart=wrapped;
  }
  function installPdfSave(){
    const b=$x('print'); if(!b)return;
    b.textContent='SAVE PDF';
    b.onclick=()=>{
      if(!S.track.length)return toast('No route to save',true);
      fitRoute();report();
      const v=(($x('vessel')?.value||'vessel').trim().replace(/[^A-Za-z0-9._-]+/g,'_'));
      const stamp=new Date().toISOString().slice(0,10);
      setTimeout(()=>{try{Android.savePdf(`Marine_Drift_${v}_${stamp}.pdf`)}catch(e){toast('PDF save is not supported by this build',true)}},180);
    };
  }
  function installDeveloperContact(){
    if(!$x('developerContact')){
      const style=document.createElement('style');
      style.textContent=`.developerContact{max-width:1600px;margin:2px auto 14px;padding:10px 14px;text-align:center;color:#607581;font-size:10px;line-height:1.5}.developerContact b{color:#0b4266}.developerContact .mail{font-weight:650;color:#315f73}.reportDeveloper{margin-top:3mm;padding-top:2.5mm;border-top:1px solid #dbe6eb;text-align:right;color:#607581;font-size:7.5px;line-height:1.45}@media print{.developerContact{display:none!important}}`;
      document.head.appendChild(style);
      const f=document.createElement('div');
      f.id='developerContact';f.className='developerContact';
      f.innerHTML='<b>Developed by Peter Mirronov</b><br><span class="mail">mirron_petr@mail.ru</span>';
      const report=document.getElementById('report');
      document.body.insertBefore(f,report||null);
    }
    const foot=document.querySelector('.reportFoot');
    if(foot&&!foot.querySelector('.reportDeveloper')){
      const d=document.createElement('div');d.className='reportDeveloper';
      d.innerHTML='<b>Marine Drift Model by NEREUS</b><br>Developed by Peter Mirronov • mirron_petr@mail.ru';
      foot.appendChild(d);
    }
  }
  function installVersion(){
    const sub=document.querySelector('header .sub');
    if(sub&&!sub.textContent.includes('v1.4.1'))sub.insertAdjacentHTML('beforeend',' • v1.4.1');
  }
  function boot(){
    try{hookStart();installCoordinatePanel();installPdfSave();installDeveloperContact();installVersion();syncDisplays();}
    catch(e){console.error('v1.4.1 enhancement',e)}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0));else setTimeout(boot,0);
})();
