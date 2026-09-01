/* NEREUS Operations v0.3.9 · ADMIN-only lifting schedules */
(function(){
  const SCHEDULE_LABELS={crude:'CRUDE',sheskharis:'SHESKHARIS',ipp:'IPP',nfot:'NFOT',taman:'TAMAN'};
  let scheduleKey='crude',scheduleMode='timeline',refreshBusy=false;

  function canSchedules(){return state.user?.role==='admin'&&state.reports?.schedulesAccess===true&&state.reports?.schedules}

  const baseAppView=appView;
  appView=function(){
    baseAppView();
    const allowed=state.user?.role==='admin';
    const n=$('#schedulesNav');
    if(n)n.classList.toggle('hidden',!allowed);
    const nav=$('#nav');
    if(nav)nav.classList.toggle('nav-four',allowed);
  };

  cache=function(r){
    const safe={...r,schedules:null,schedulesAccess:false};
    localStorage.setItem('reports',JSON.stringify({at:Date.now(),r:safe}));
    localStorage.setItem('valid',Date.now());
  };

  load=async function(){
    try{
      const d=await call('reports');
      state.reports={source:d.source,generated_at:d.generated_at||'',mobile:parseMobile(d.mobile_rows),weather:parseWeather(d.weather_rows),schedules:d.schedules||null,schedulesAccess:!!d.schedules_access};
      cache(state.reports);render();banner('LIVE · Google Sheets обновлены автоматически','live');
    }catch(e){
      if(AUTH_ERRORS.has(e.message)){clearSession();loginView(msg(e));return}
      let c;try{c=JSON.parse(localStorage.getItem('reports')||'null')}catch(_){c=null}
      if(c&&Date.now()-Number(localStorage.getItem('valid')||0)<86400000){state.reports=c.r;render();banner('Нет связи. Показаны последние сохранённые данные. Графики требуют LIVE-соединение.')}else banner(msg(e));
    }
  };

  async function forceRefresh039(){
    if(refreshBusy)return;refreshBusy=true;const btn=$('#refresh');
    if(btn){btn.classList.add('refresh-busy');btn.disabled=true;btn.setAttribute('aria-busy','true')}
    banner('ОБНОВЛЕНИЕ · запрашиваю свежие данные…','live');
    try{
      const d=await call('reports',{force_refresh:true,request_id:'manual-'+Date.now()+'-'+Math.random().toString(36).slice(2)});
      state.reports={source:d.source,generated_at:d.generated_at||'',mobile:parseMobile(d.mobile_rows),weather:parseWeather(d.weather_rows),schedules:d.schedules||null,schedulesAccess:!!d.schedules_access};
      cache(state.reports);render();
      const stamp=d.generated_at?(' · '+String(d.generated_at).replace('T',' ').replace('Z',' UTC')):'';
      banner('ОБНОВЛЕНО · свежие данные получены'+stamp,'live');
    }catch(e){if(AUTH_ERRORS.has(e.message)){clearSession();loginView(msg(e));return}banner('ОБНОВЛЕНИЕ НЕ ВЫПОЛНЕНО · '+msg(e),'')}
    finally{refreshBusy=false;if(btn){btn.classList.remove('refresh-busy');btn.disabled=false;btn.removeAttribute('aria-busy')}}
  }
  const refreshButton=$('#refresh');if(refreshButton)refreshButton.onclick=forceRefresh039;window.nereusForceRefresh=forceRefresh039;

  function qnum(v){const s=String(v||'').replace(/\s/g,'').replace(',','.');const n=Number(s);return Number.isFinite(n)?n:0}
  function fmtQty(v){const n=qnum(v);return n?n.toLocaleString('en-US',{maximumFractionDigits:3})+' MT':'—'}
  function berthOf(r){return String(r.berth||'').trim()||'NO BERTH ALLOCATION'}
  function d(y,m,day){const x=new Date(y,m-1,day);return isNaN(x)?null:x}
  function parseLaycan(raw){
    if(!raw)return null;const s=String(raw).replace(/\s/g,'').replace(/\.2026/g,'.26');let m;
    m=s.match(/^(\d{1,2})[.-](\d{1,2})[.-](\d{2})-(\d{1,2})[.-](\d{1,2})[.-](\d{2})$/);if(m)return[d(2000+Number(m[3]),Number(m[2]),Number(m[1])),d(2000+Number(m[6]),Number(m[5]),Number(m[4]))];
    m=s.match(/^(\d{1,2})-(\d{1,2})\.(\d{1,2})\.(\d{2})$/);if(m){const y=2000+Number(m[4]),mo=Number(m[3]);const a=d(y,mo,Number(m[1]));let b=d(y,mo,Number(m[2]));if(Number(m[2])<Number(m[1]))b=d(y,mo+1,Number(m[2]));return[a,b]}
    m=s.match(/^(\d{1,2})-(\d{1,2})\.(\d{1,2})$/);if(m){const y=2026,mo=Number(m[3]);const a=d(y,mo,Number(m[1]));let b=d(y,mo,Number(m[2]));if(Number(m[2])<Number(m[1]))b=d(y,mo+1,Number(m[2]));return[a,b]}
    m=s.match(/^(\d{1,2})\.(\d{1,2})-(\d{1,2})\.(\d{1,2})\.(\d{2})$/);if(m)return[d(2000+Number(m[5]),Number(m[2]),Number(m[1])),d(2000+Number(m[5]),Number(m[4]),Number(m[3]))];
    m=s.match(/^(\d{1,2})\.(\d{1,2})$/);if(m){const a=d(2026,Number(m[2]),Number(m[1]));return[a,a]}return null;
  }
  function daysBetween(a,b){return Math.round((b-a)/86400000)}
  function fmtDay(x){return String(x.getDate()).padStart(2,'0')+' '+['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][x.getMonth()]}
  function timelineRange(rows){const dates=[];rows.forEach(r=>{const p=parseLaycan(r.laycan);if(p)dates.push(p[0],p[1])});if(!dates.length){const a=new Date(2026,7,1),b=new Date(2026,7,14);return[a,b]}return[new Date(Math.min(...dates)),new Date(Math.max(...dates))]}
  function escapeAttr(o){return encodeURIComponent(JSON.stringify(o))}

  function ensureModal(){if($('#scheduleModal'))return;const m=document.createElement('div');m.id='scheduleModal';m.className='sched-modal hidden';m.innerHTML='<div class="sched-sheet"><div class="sched-sheet-head"><div><small>SCHEDULE POSITION</small><h2 id="schedModalVessel"></h2></div><button id="schedClose" class="secondary">✕</button></div><div id="schedDetail" class="sched-detail"></div></div>';document.body.appendChild(m);$('#schedClose').onclick=()=>m.classList.add('hidden');m.onclick=e=>{if(e.target===m)m.classList.add('hidden')}}
  function openSchedule(r){ensureModal();$('#schedModalVessel').textContent=r.vessel||'TBN';const fields=[['TERMINAL',r.terminal],['CARGO / GRADE',r.cargo],['QUANTITY',fmtQty(r.quantity)],['LAYCAN',r.laycan||'TBA'],['SHIPPER / RECEIVER',r.shipper],['BERTH ALLOCATION',r.berth],['REMARKS',r.remarks]];$('#schedDetail').innerHTML=fields.map((f,i)=>`<div class="sched-field ${i===6?'wide':''}"><small>${f[0]}</small><b>${esc(f[1]||'—')}</b></div>`).join('');$('#scheduleModal').classList.remove('hidden')}
  function bindScheduleClicks(){
    $('#schedules')?.querySelectorAll('[data-srow]').forEach(el=>el.onclick=()=>openSchedule(JSON.parse(decodeURIComponent(el.dataset.srow))));
    $('#schedules')?.querySelectorAll('[data-skey]').forEach(el=>el.onclick=()=>{scheduleKey=el.dataset.skey;renderSchedules()});
    $('#schedules')?.querySelectorAll('[data-smode]').forEach(el=>el.onclick=()=>{scheduleMode=el.dataset.smode;renderSchedules()});
  }
  function renderSchedules(){
    const root=$('#schedules');if(!root)return;if(state.user?.role!=='admin'){root.innerHTML='';return}
    if(!canSchedules()){root.innerHTML='<div class="empty">SCHEDULES доступны администратору только при LIVE-соединении.</div>';return}
    const all=state.reports.schedules||{};if(!all[scheduleKey])scheduleKey=Object.keys(SCHEDULE_LABELS).find(k=>Array.isArray(all[k]))||'crude';
    const rows=Array.isArray(all[scheduleKey])?all[scheduleKey]:[];const keys=Object.keys(SCHEDULE_LABELS).filter(k=>Array.isArray(all[k]));const total=rows.reduce((a,r)=>a+qnum(r.quantity),0);const berthCount=new Set(rows.map(berthOf)).size;
    let h='<div class="sched-tabs">'+keys.map(k=>`<button data-skey="${k}" class="${k===scheduleKey?'active':''}">${SCHEDULE_LABELS[k]}</button>`).join('')+'</div>';
    h+=`<div class="sched-head"><div><b>${SCHEDULE_LABELS[scheduleKey]} LIFTING SCHEDULE</b><small>Only Google Sheet schedule fields</small></div><div class="sched-modes"><button data-smode="timeline" class="${scheduleMode==='timeline'?'active':''}">TIMELINE</button><button data-smode="list" class="${scheduleMode==='list'?'active':''}">LIST</button></div></div>`;
    h+=`<div class="sched-kpis"><div><small>POSITIONS</small><b>${rows.length}</b></div><div><small>TOTAL QUANTITY</small><b>${total.toLocaleString('en-US',{maximumFractionDigits:3})} MT</b></div><div><small>BERTH GROUPS</small><b>${berthCount}</b></div></div>`;
    if(scheduleMode==='list')h+='<div class="sched-list">'+rows.map(r=>`<div class="sched-card" data-srow="${escapeAttr(r)}"><b>${esc(r.vessel||'TBN')}</b><small>${esc(r.terminal||'—')} · ${esc(berthOf(r))}</small><div class="sched-card-grid"><span><small>CARGO / GRADE</small><b>${esc(r.cargo||'—')}</b></span><span><small>QUANTITY</small><b>${esc(fmtQty(r.quantity))}</b></span><span><small>LAYCAN</small><b>${esc(r.laycan||'TBA')}</b></span><span><small>SHIPPER / RECEIVER</small><b>${esc(r.shipper||'—')}</b></span></div></div>`).join('')+'</div>';
    else{
      const valid=rows.filter(r=>parseLaycan(r.laycan)),tba=rows.filter(r=>!parseLaycan(r.laycan)),range=timelineRange(valid),start=range[0],end=range[1],count=Math.max(1,daysBetween(start,end)+1),groups=[...new Set(valid.map(berthOf))];
      h+='<div class="sched-timeline"><div class="sched-scroll"><div class="sched-axis" style="--days:'+count+'"><div class="berth-axis">BERTH / GROUP</div>';for(let i=0;i<count;i++){const x=new Date(start);x.setDate(start.getDate()+i);h+=`<div>${fmtDay(x)}</div>`}h+='</div>';
      groups.forEach(g=>{h+=`<div class="sched-row" style="--days:${count}"><div class="sched-berth"><b>${esc(g)}</b><small>${valid.filter(r=>berthOf(r)===g).length} positions</small></div><div class="sched-track" style="--days:${count}">`;valid.filter(r=>berthOf(r)===g).forEach(r=>{const p=parseLaycan(r.laycan),a=p[0],b=p[1],off=Math.max(0,daysBetween(start,a)),dur=Math.max(1,daysBetween(a,b)+1),left=off/count*100,width=Math.max(100/count,Math.min(dur,count-off)/count*100),cancel=String(r.remarks||'').toUpperCase().includes('CANCELED')?' cancel':'';h+=`<div class="sched-bar${cancel}" style="left:${left}%;width:${width}%" data-srow="${escapeAttr(r)}"><b>${esc(r.vessel||'TBN')}</b><small>${esc(r.cargo||'—')} · ${esc(fmtQty(r.quantity))}</small><small>LC ${esc(r.laycan||'TBA')}</small></div>`});h+='</div></div>'});h+='</div>';
      if(tba.length)h+='<div class="sched-tba"><small>TBA / NO LAYCAN</small><div>'+tba.map(r=>`<button data-srow="${escapeAttr(r)}">${esc(r.vessel||'TBN')} · ${esc(r.cargo||'—')}</button>`).join('')+'</div></div>';h+='</div>';
    }
    root.innerHTML=h;bindScheduleClicks();
  }

  switchView=function(v){const isAdmin=state.user?.role==='admin';if((v==='admin'||v==='schedules')&&!isAdmin)v='brief';state.view=v;$('#brief').classList.toggle('hidden',v!=='brief');$('#weather').classList.toggle('hidden',v!=='weather');$('#schedules').classList.toggle('hidden',v!=='schedules');$('#admin').classList.toggle('hidden',v!=='admin');$$('nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===v));if(v==='admin'){$('#reportMeta').textContent='Admin · Users & subscriptions';renderAdmin()}else if(v==='schedules'){$('#reportMeta').textContent='Schedules · ADMIN ONLY';renderSchedules()}else if(state.reports)$('#reportMeta').textContent=(v==='brief'?'Mobile Brief · '+state.reports.mobile.date:'Weather · '+state.reports.weather.date)};
  render=function(){if(!state.reports)return;$('#sourceMeta').textContent=state.reports.source?.includes('google')?'LIVE · GOOGLE SHEETS':'CACHE';renderBrief();renderWeather();renderSchedules();switchView(state.view)};
  ensureModal();
})();
