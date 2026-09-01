/* NEREUS Operations v0.4.2 · protected Export Center */
(function(){
  const EXPORT_API_URL='https://bzfzghszxqartljpjsmc.supabase.co/functions/v1/nereus-export';

  function exportAllowed(){
    return state.user?.role==='admin'||state.user?.schedules_access===true;
  }
  window.nereusExportAllowed=exportAllowed;

  const baseAppView=appView;
  appView=function(){
    baseAppView();
    const allowed=exportAllowed();
    const en=$('#exportNav');if(en)en.classList.toggle('hidden',!allowed);
    const nav=$('#nav');
    if(nav){
      nav.classList.remove('nav-four','nav-export-four','nav-five');
      if(state.user?.role==='admin')nav.classList.add('nav-five');
      else if(allowed)nav.classList.add('nav-export-four');
    }
    if(!allowed&&state.view==='export')state.view='brief';
  };

  async function exportRaw(retry=true){
    const body={action:'manifest',device_id:device,access_token:state.token};
    let r;
    try{
      r=await fetch(EXPORT_API_URL,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify(body),
        cache:'no-store'
      });
    }catch(_){throw new Error('CONNECTION_ERROR')}
    let d;try{d=await r.json()}catch(_){throw new Error('SERVER_RESPONSE_ERROR')}
    if(!r.ok||!d.ok){
      const err=new Error(d.error||('HTTP_'+r.status));err.status=r.status;
      if(retry&&state.refresh&&(r.status===401||err.message==='INVALID_SESSION')){
        await refreshSession();
        return exportRaw(false);
      }
      throw err;
    }
    return d;
  }

  function link(url,label){
    return url?`<a class="export-link" href="${esc(url)}">${esc(label)}</a>`:'—';
  }
  function rows(items){
    return Object.entries(items||{}).map(([k,v])=>
      `<div>${esc(v?.name||k)}</div><div>${link(v?.pdf,'PDF')}</div><div>${link(v?.xlsx,'XLSX')}</div>`
    ).join('');
  }
  function block(title,note,items,allXlsx){
    return `<div class="export-box"><div class="export-head"><b>${esc(title)}</b><small>${esc(note)}</small></div>`+
      `<div class="export-grid"><div class="eh">REPORT</div><div class="eh">PDF</div><div class="eh">XLSX</div>${rows(items)}</div>`+
      `${allXlsx?`<div class="export-all">${link(allXlsx,'ALL · XLSX')}</div>`:''}</div>`;
  }
  function manifestHtml(m){
    if(!m)return '<div class="export-notice">Export Center требует Apps Script v0.4.3.</div>';
    const sc=m.schedules||{},vc=m.views?.commercial||{},vn=m.views?.no_commercial||{},w=m.weather||{};
    return '<div class="section">EXPORT CENTER</div>'+
      block('SCHEDULES','исходные табличные сводки · PDF / XLSX',sc,'')+
      block('PORT VIEWS · COMMERCIAL','все колонки',vc,m.views?.all_commercial_xlsx||'')+
      block('PORT VIEWS · NO COMMERCIAL','без коммерческих полей',vn,m.views?.all_no_commercial_xlsx||'')+
      block('WEATHER REPORT','актуальный отчёт',{weather:w},'');
  }
  async function renderExport(){
    if(!exportAllowed())return;
    const root=$('#export');if(!root)return;
    root.innerHTML='<div class="empty">Загрузка EXPORT CENTER…</div>';
    try{
      const d=await exportRaw();
      root.innerHTML=manifestHtml(d.exports);
    }catch(e){
      const t=e.message==='EXPORT_MANIFEST_NOT_AVAILABLE'
        ?'Установите Apps Script v0.4.3 и обновите данные.'
        :'Экспорт сейчас недоступен: '+e.message;
      root.innerHTML='<div class="section">EXPORT CENTER</div><div class="export-notice">'+esc(t)+'</div>';
    }
  }
  window.nereusRenderExport=renderExport;

  switchView=function(v){
    const isAdmin=state.user?.role==='admin',schedAllowed=(state.user?.role==='admin'||state.user?.schedules_access===true),expAllowed=exportAllowed();
    if(v==='admin'&&!isAdmin)v='brief';
    if(v==='schedules'&&!schedAllowed)v='brief';
    if(v==='export'&&!expAllowed)v='brief';
    state.view=v;
    $('#brief').classList.toggle('hidden',v!=='brief');
    $('#weather').classList.toggle('hidden',v!=='weather');
    $('#schedules').classList.toggle('hidden',v!=='schedules');
    $('#export').classList.toggle('hidden',v!=='export');
    $('#admin').classList.toggle('hidden',v!=='admin');
    $$('nav button').forEach(b=>b.classList.toggle('active',b.dataset.view===v));
    if(v==='admin'){$('#reportMeta').textContent='Admin · Users & subscriptions';renderAdmin()}
    else if(v==='schedules'){$('#reportMeta').textContent='Schedules';renderSchedules()}
    else if(v==='export'){$('#reportMeta').textContent='Export Center';renderExport()}
    else if(state.reports)$('#reportMeta').textContent=(v==='brief'?'Mobile Brief · '+state.reports.mobile.date:'Weather · '+state.reports.weather.date);
  };

  const baseRender=render;
  render=function(){baseRender();if(state.view==='export')renderExport()};
})();
