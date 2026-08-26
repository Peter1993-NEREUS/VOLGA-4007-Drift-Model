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
  function current(){const lat=Number($x('lat')?.value),lon=Number($x('lon')?.value);return Number.isFinite(lat+lon)?[lat,lon]:null}
  function syncDisplays(){
    const z=current();if(!z)return;const [lat,lon]=z,ship=$x('shipPair'),dmsOut=$x('dmsReadout');
    if(ship&&document.activeElement!==ship)ship.value=`${ddm(lat,true)}  ${ddm(lon,false)}`;
    const pair=$x('pair');if(pair&&document.activeElement!==pair)pair.value=`${lat.toFixed(6)}, ${lon.toFixed(6)}`;
    if(dmsOut)dmsOut.textContent=`DMS: ${dms(lat,true)}  ${dms(lon,false)}`;
  }
  function applyText(text,source){try{const z=parseCoordsText(text);setStart(z[0],z[1],true,false);syncDisplays();toast(source==='ship'?'Ship coordinates converted to Google / decimal format':'Google / decimal coordinates converted to ship format')}catch(e){toast(e.message,true)}}
  function debounceInput(el,source){let timer=null;el.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(()=>{try{const z=parseCoordsText(el.value);setStart(z[0],z[1],true,false);syncDisplays()}catch(_){}},550)});el.addEventListener('change',()=>applyText(el.value,source))}
  function installCoordinatePanel(){
    const pair=$x('pair');if(!pair||$x('shipPair'))return;const label=pair.previousElementSibling;if(label&&label.tagName==='LABEL')label.textContent='Google Maps / Decimal Degrees (DD)';pair.placeholder='43.975267, 38.181139';
    const wrap=document.createElement('div');wrap.innerHTML=`<label>Судовые координаты (Degrees + Decimal Minutes / DDM)</label><input id="shipPair" class="input coordbox" inputmode="text" placeholder="43°58.5160′N 038°10.8683′E"><div id="dmsReadout" class="hint" style="margin-top:4px"></div><div class="hint">Оба поля синхронизированы. Можно вводить DD, DDM или DMS; при изменении одного формата второй пересчитывается автоматически.</div>`;
    const tools=pair.nextElementSibling;if(tools)tools.insertAdjacentElement('afterend',wrap);else pair.insertAdjacentElement('afterend',wrap);debounceInput(pair,'google');debounceInput($x('shipPair'),'ship');syncDisplays();
  }
  function hookStart(){if(typeof setStart!=='function'||setStart.__coordHook)return;const old=setStart;const wrapped=function(lat,lon,clear,center){const r=old(lat,lon,clear,center);syncDisplays();return r};wrapped.__coordHook=true;setStart=wrapped}

  function renderPdfRouteMap(){
    const c=$x('reportMap');if(!c||!S?.track?.length)return;const g=c.getContext('2d'),W=c.width,H=c.height;g.setTransform(1,0,0,1,0,0);g.clearRect(0,0,W,H);g.fillStyle='#dff1f7';g.fillRect(0,0,W,H);
    const pts=[...S.track,...((S.alts||[]).flat())].filter(Boolean);let minLat=Math.min(...pts.map(p=>p.lat)),maxLat=Math.max(...pts.map(p=>p.lat)),minLon=Math.min(...pts.map(p=>p.lon)),maxLon=Math.max(...pts.map(p=>p.lon));let dLat=Math.max(.02,maxLat-minLat),dLon=Math.max(.02,maxLon-minLon);minLat-=dLat*.12;maxLat+=dLat*.12;minLon-=dLon*.12;maxLon+=dLon*.12;
    const L=90,R=45,T=45,B=70,x=lon=>L+(lon-minLon)/(maxLon-minLon)*(W-L-R),y=lat=>H-B-(lat-minLat)/(maxLat-minLat)*(H-T-B);
    if(Array.isArray(S.coast)){g.fillStyle='#e9dfcf';g.strokeStyle='#91a3ad';g.lineWidth=1.2;for(const poly of S.coast){if(!Array.isArray(poly)||poly.length<2)continue;let any=false;g.beginPath();poly.forEach((q,i)=>{const px=x(q[0]),py=y(q[1]);i?g.lineTo(px,py):g.moveTo(px,py);if(q[0]>=minLon&&q[0]<=maxLon&&q[1]>=minLat&&q[1]<=maxLat)any=true});if(any){g.closePath();g.fill();g.stroke()}}}
    g.strokeStyle='#6b89951f';g.fillStyle='#55717f';g.font='19px sans-serif';g.lineWidth=1;for(let i=0;i<=5;i++){let lo=minLon+(maxLon-minLon)*i/5,px=x(lo);g.beginPath();g.moveTo(px,T);g.lineTo(px,H-B);g.stroke();g.fillText(lo.toFixed(2)+'°',px-28,H-24);let la=minLat+(maxLat-minLat)*i/5,py=y(la);g.beginPath();g.moveTo(L,py);g.lineTo(W-R,py);g.stroke();g.fillText(la.toFixed(2)+'°',12,py+7)}
    if(Array.isArray(S.alts)){g.save();g.setLineDash([12,9]);g.strokeStyle='#788b94';g.globalAlpha=.65;g.lineWidth=3;for(const tr of S.alts){g.beginPath();tr.forEach((p,i)=>i?g.lineTo(x(p.lon),y(p.lat)):g.moveTo(x(p.lon),y(p.lat)));g.stroke()}g.restore()}
    g.strokeStyle='#087fa7';g.lineWidth=7;g.lineJoin='round';g.lineCap='round';g.beginPath();S.track.forEach((p,i)=>i?g.lineTo(x(p.lon),y(p.lat)):g.moveTo(x(p.lon),y(p.lat)));g.stroke();
    if(Array.isArray(S.daily)){g.fillStyle='#fff';g.strokeStyle='#17324d';g.lineWidth=2;for(const p of S.daily){g.beginPath();g.arc(x(p.lon),y(p.lat),6,0,Math.PI*2);g.fill();g.stroke()}}
    const a=S.track[0],b=S.track.at(-1);function mark(p,color,label){const px=x(p.lon),py=y(p.lat);g.fillStyle=color;g.strokeStyle='#fff';g.lineWidth=3;g.beginPath();g.arc(px,py,10,0,Math.PI*2);g.fill();g.stroke();g.fillStyle='#173142';g.font='bold 22px sans-serif';g.fillText(label,px+15,py+7)}mark(a,'#11876c','START');mark(b,'#e56c20','END');
    g.fillStyle='#173142';g.font='bold 23px sans-serif';g.fillText('Route overview • Marine Drift Model by NEREUS',L,T-14);
    g.font='18px sans-serif';g.fillStyle='#546b77';g.fillText('Cyan: calculated drift route • Grey dashed: sensitivity tracks • White dots: daily positions',L,H-8);
  }
  function preparePdfMapImage(){
    renderPdfRouteMap();const c=$x('reportMap');if(!c)return;let img=$x('reportMapPrint');if(!img){img=document.createElement('img');img.id='reportMapPrint';img.className='reportMap reportMapPrint';c.insertAdjacentElement('afterend',img)}try{img.src=c.toDataURL('image/png')}catch(_){ };
  }
  function installPdfSave(){
    const b=$x('print');if(!b)return;b.textContent='PRINT / SAVE PDF';b.onclick=()=>{if(!S.track.length)return toast('No route to export',true);fitRoute();report();preparePdfMapImage();setTimeout(()=>{try{Android.printPdf()}catch(e){toast('Android print service is unavailable',true)}},180)};
  }
  function installDeveloperContact(){
    if(!$x('developerContact')){const style=document.createElement('style');style.textContent=`.developerContact{max-width:1600px;margin:2px auto 14px;padding:10px 14px;text-align:center;color:#607581;font-size:10px;line-height:1.5}.developerContact b{color:#0b4266}.developerContact .mail{font-weight:650;color:#315f73}.reportDeveloper{margin-top:3mm;padding-top:2.5mm;border-top:1px solid #dbe6eb;text-align:right;color:#607581;font-size:7.5px;line-height:1.45}.reportMapPrint{display:none}body.pdfExport{margin:0!important;padding:0!important;background:#fff!important;width:1000px!important;min-width:1000px!important;overflow:visible!important}body.pdfExport>header,body.pdfExport>.shell,body.pdfExport>.toast,body.pdfExport>.egg,body.pdfExport>.developerContact{display:none!important}body.pdfExport>.report{display:block!important;width:1000px!important;background:#fff!important}body.pdfExport .reportHero{border-radius:0!important}body.pdfExport .reportKpis{grid-template-columns:repeat(4,1fr)!important}body.pdfExport .reportGrid{grid-template-columns:1fr 1fr!important}body.pdfExport #reportMap{display:none!important}body.pdfExport .reportMapPrint{display:block!important;width:100%!important;height:auto!important}body.pdfExport .rtable thead{display:table-header-group}@media print{.developerContact{display:none!important}.reportMapPrint{display:block!important}#reportMap{display:none!important}}`;document.head.appendChild(style);const f=document.createElement('div');f.id='developerContact';f.className='developerContact';f.innerHTML='<b>Developed by Peter Mirronov</b><br><span class="mail">mirron_petr@mail.ru</span>';const reportEl=document.getElementById('report');document.body.insertBefore(f,reportEl||null)}
    const foot=document.querySelector('.reportFoot');if(foot&&!foot.querySelector('.reportDeveloper')){const d=document.createElement('div');d.className='reportDeveloper';d.innerHTML='<b>Marine Drift Model by NEREUS</b><br>Developed by Peter Mirronov • mirron_petr@mail.ru';foot.appendChild(d)}
  }
  function installVersion(){const sub=document.querySelector('header .sub');if(sub){sub.textContent=sub.textContent.replace(/ • v1\.4\.\d+/g,'');sub.insertAdjacentHTML('beforeend',' • v1.4.2')}}
  function boot(){try{hookStart();installCoordinatePanel();installPdfSave();installDeveloperContact();installVersion();syncDisplays()}catch(e){console.error('v1.4.2 enhancement',e)}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0));else setTimeout(boot,0);
})();
