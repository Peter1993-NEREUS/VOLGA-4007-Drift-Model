/* NEREUS Operations · protected Export Center · server-side downloads */
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

  async function apiJson(body,retry=true){
    let r;
    try{
      r=await fetch(EXPORT_API_URL,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({...body,device_id:device,access_token:state.token}),
        cache:'no-store'
      });
    }catch(_){throw new Error('CONNECTION_ERROR')}

    let d;
    try{d=await r.json()}catch(_){throw new Error('SERVER_RESPONSE_ERROR')}

    if(!r.ok||!d.ok){
      const err=new Error(d.error||('HTTP_'+r.status));
      err.status=r.status;
      if(retry&&state.refresh&&(r.status===401||err.message==='INVALID_SESSION')){
        await refreshSession();
        return apiJson(body,false);
      }
      throw err;
    }
    return d;
  }

  async function exportRaw(retry=true){
    return apiJson({action:'manifest'},retry);
  }

  function fileNameFromDisposition(value){
    const s=String(value||'');
    let m=s.match(/filename\*=UTF-8''([^;]+)/i);
    if(m&&m[1]){
      try{return decodeURIComponent(m[1])}catch(_){return m[1]}
    }
    m=s.match(/filename="?([^";]+)"?/i);
    return m&&m[1]?m[1]:'NEREUS_EXPORT';
  }

  async function downloadRaw(exportId,retry=true){
    let r;
    try{
      r=await fetch(EXPORT_API_URL,{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          action:'download',
          export_id:exportId,
          device_id:device,
          access_token:state.token
        }),
        cache:'no-store'
      });
    }catch(_){throw new Error('CONNECTION_ERROR')}

    if(!r.ok){
      let d={};
      try{d=await r.json()}catch(_){}
      const err=new Error(d.error||('HTTP_'+r.status));
      err.status=r.status;
      if(retry&&state.refresh&&(r.status===401||err.message==='INVALID_SESSION')){
        await refreshSession();
        return downloadRaw(exportId,false);
      }
      throw err;
    }

    const blob=await r.blob();
    if(!blob||!blob.size)throw new Error('EMPTY_EXPORT_FILE');

    return {
      blob,
      name:fileNameFromDisposition(r.headers.get('Content-Disposition'))
    };
  }

  function saveBlob(blob,name){
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=name||'NEREUS_EXPORT';
    a.style.display='none';
    document.body.appendChild(a);
    a.click();
    setTimeout(()=>{
      try{URL.revokeObjectURL(url)}catch(_){}
      try{a.remove()}catch(_){}
    },2000);
  }

  function downloadLink(exportId,label){
    return exportId
      ? '<a class="export-link export-download" href="#" data-export-id="'+esc(exportId)+'">'+esc(label)+'</a>'
      : '—';
  }

  function rows(items,idBuilder){
    return Object.entries(items||{}).map(([k,v])=>
      '<div>'+esc(v?.name||k)+'</div>'+
      '<div>'+downloadLink(idBuilder(k,'pdf'),'PDF')+'</div>'+
      '<div>'+downloadLink(idBuilder(k,'xlsx'),'XLSX')+'</div>'
    ).join('');
  }

  function block(title,note,items,idBuilder,allId){
    return '<div class="export-box"><div class="export-head"><b>'+esc(title)+'</b><small>'+esc(note)+'</small></div>'+
      '<div class="export-grid"><div class="eh">REPORT</div><div class="eh">PDF</div><div class="eh">XLSX</div>'+
      rows(items,idBuilder)+'</div>'+
      (allId?'<div class="export-all">'+downloadLink(allId,'ALL · XLSX')+'</div>':'')+
      '</div>';
  }

  function manifestHtml(m){
    if(!m)return '<div class="export-notice">Export Center требует актуальный Apps Script.</div>';
    const sc=m.schedules||{},vc=m.views?.commercial||{},vn=m.views?.no_commercial||{},w=m.weather||{};
    return '<div class="section">EXPORT CENTER</div>'+
      block('SCHEDULES','исходные табличные сводки · PDF / XLSX',sc,(k,f)=>'schedule:'+k+':'+f,'')+
      block('PORT VIEWS · COMMERCIAL','все колонки',vc,(k,f)=>'view:commercial:'+k+':'+f,'view:commercial:all:xlsx')+
      block('PORT VIEWS · NO COMMERCIAL','без коммерческих полей',vn,(k,f)=>'view:no_commercial:'+k+':'+f,'view:no_commercial:all:xlsx')+
      block('WEATHER REPORT','актуальный отчёт',{weather:w},(_,f)=>'weather:'+f,'');
  }

  function bindDownloads(root){
    root.querySelectorAll('.export-download').forEach(a=>{
      a.addEventListener('click',async e=>{
        e.preventDefault();
        if(a.dataset.busy==='1')return;

        const exportId=String(a.dataset.exportId||'');
        const oldText=a.textContent;
        a.dataset.busy='1';
        a.textContent='...';
        a.setAttribute('aria-busy','true');

        try{
          const f=await downloadRaw(exportId);
          saveBlob(f.blob,f.name);
        }catch(err){
          const msg=String(err?.message||err||'DOWNLOAD_ERROR');
          const friendly=
            msg==='EXPORT_DOWNLOAD_NOT_AVAILABLE'
              ?'Этот файл пока недоступен через защищённое скачивание.'
              :'Не удалось скачать файл: '+msg;
          try{showBanner(friendly,'error')}catch(_){alert(friendly)}
        }finally{
          a.dataset.busy='0';
          a.textContent=oldText;
          a.removeAttribute('aria-busy');
        }
      });
    });
  }

  async function renderExport(){
    if(!exportAllowed())return;
    const root=$('#export');if(!root)return;
    root.innerHTML='<div class="empty">Загрузка EXPORT CENTER…</div>';
    try{
      const d=await exportRaw();
      root.innerHTML=manifestHtml(d.exports);
      bindDownloads(root);
    }catch(e){
      const t=e.message==='EXPORT_MANIFEST_NOT_AVAILABLE'
        ?'Export Center пока недоступен.'
        :'Экспорт сейчас недоступен: '+e.message;
      root.innerHTML='<div class="section">EXPORT CENTER</div><div class="export-notice">'+esc(t)+'</div>';
    }
  }
  window.nereusRenderExport=renderExport;

  switchView=function(v){
    const isAdmin=state.user?.role==='admin',
      schedAllowed=(state.user?.role==='admin'||state.user?.schedules_access===true),
      expAllowed=exportAllowed();

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

    if(v==='admin'){
      $('#reportMeta').textContent='Admin · Users & subscriptions';
      renderAdmin();
    }else if(v==='schedules'){
      $('#reportMeta').textContent='Schedules';
      renderSchedules();
    }else if(v==='export'){
      $('#reportMeta').textContent='Export Center';
      renderExport();
    }else if(state.reports){
      $('#reportMeta').textContent=(v==='brief'?'Mobile Brief · '+state.reports.mobile.date:'Weather · '+state.reports.weather.date);
    }
  };

  const baseRender=render;
  render=function(){
    baseRender();
    if(state.view==='export')renderExport();
  };
})();