'use strict';
(function(){
  const BRANCH='pending-test-fixes';
  const POLL_MS=4000;
  const MAX_POLLS=150;
  const $c=id=>document.getElementById(id);

  function cmemsNotify(state,text){try{Android.notifyCmems(state,String(text||''))}catch(_){}}
  function elapsedText(started){return `${Math.round((Date.now()-started)/1000)}s`}
  async function apiJson(url,tk){
    const r=await fetch(url,{cache:'no-store',headers:{Authorization:`Bearer ${tk}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});
    if(!r.ok)throw Error(`GitHub status HTTP ${r.status}`);
    return r.json();
  }
  async function findRun(rid,tk){
    try{
      const j=await apiJson(`https://api.github.com/repos/${REPO}/actions/runs?event=workflow_dispatch&branch=${encodeURIComponent(BRANCH)}&per_page=20&t=${Date.now()}`,tk);
      const title=`CMEMS ${rid}`;
      return (j.workflow_runs||[]).find(x=>x.display_title===title||x.name===title)||null;
    }catch(_){return null}
  }
  function failConclusion(run){
    if(!run||run.status!=='completed')return '';
    const c=String(run.conclusion||'').toLowerCase();
    return c&&c!=='success'?c:'';
  }

  async function updateFast(){
    const tk=token();
    if(!tk){$c('connectionDetails')?.setAttribute('open','');$c('ghTokenSetup')?.focus();throw Error('One-time connection setup required: save GitHub token below')}
    const q=requestInputs(),rid=`${Date.now()}-${Math.random().toString(36).slice(2,8)}`,started=Date.now();
    setProgress(1,'Запрос подготовлен. Запускаем CMEMS fast-path…');
    if($c('updateData'))$c('updateData').disabled=true;
    cmemsNotify('start','CMEMS request started');
    const body={ref:BRANCH,inputs:{request_id:rid,start_utc:iso(q.a),end_utc:iso(q.b),center_lat:String(q.lat),center_lon:String(q.lon),radius_deg:String(q.radius),draft_m:String(q.v.draft),vessel_name:q.v.name,imo:q.v.imo,cargo:String(q.v.cargo),loa_m:String(q.v.loa),beam_m:String(q.v.beam),leeway:String(q.v.leeway),local_offset:String(Number($c('offset')?.value||0))}};
    try{
      const r=await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/online-cmems.yml/dispatches`,{method:'POST',headers:{Authorization:`Bearer ${tk}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},body:JSON.stringify(body)});
      if(r.status!==204){const txt=await r.text();throw Error(`GitHub update failed HTTP ${r.status}: ${txt.slice(0,140)}`)}
      setProgress(2,'CMEMS job запущен. Ожидаем Copernicus данные…');
      let run=null;
      for(let n=0;n<MAX_POLLS;n++){
        const sec=Math.round((Date.now()-started)/1000);
        try{
          const m=await jsonUrl(`${RAW_DATA}manifest.json?t=${Date.now()}`);
          if(m.requestId===rid&&m.status==='ready'){
            setProgress(4,`Пакет готов за ${elapsedText(started)}. Загружаем в приложение…`);
            await loadRemote();
            setProgress(5,`Готово за ${elapsedText(started)}: ${localFmt(utcMs(S.meta.startUtc))} → ${localFmt(utcMs(S.meta.endUtc))} • ONLINE CMEMS`);
            cmemsNotify('success',`CMEMS data ready in ${elapsedText(started)}`);
            calculate();return;
          }
        }catch(_){}
        if(n%2===0||!run){run=await findRun(rid,tk)||run}
        const bad=failConclusion(run);
        if(bad)throw Error(`CMEMS workflow ${bad} after ${elapsedText(started)}. Copernicus service did not produce a usable pack.`);
        if(run?.status==='queued')setProgress(2,`GitHub runner queued • ${sec}s`);
        else if(run?.status==='in_progress')setProgress(3,`Copernicus Marine / pack build in progress • ${sec}s`);
        else if(sec>30)setProgress(3,`Ожидаем CMEMS pack • ${sec}s`);
        await sleep(POLL_MS);
      }
      throw Error(`CMEMS pack did not complete within ${elapsedText(started)}.`);
    }catch(e){
      cmemsNotify('error',e.message||'CMEMS update failed');
      throw e;
    }finally{
      if($c('updateData'))$c('updateData').disabled=false;
    }
  }

  function install(){
    if(typeof updateCMEMS!=='function'||updateCMEMS.__fast175)return;
    updateFast.__fast175=true;
    updateCMEMS=updateFast;
    S.cmemsFastPath={branch:BRANCH,pollMs:POLL_MS,installed:true};
    const p=$c('onlineProgress');if(p&&!/fast-path/i.test(p.textContent||''))p.textContent=(p.textContent||'CMEMS ready')+' • fast failure detection active';
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(install,500));else setTimeout(install,500);
})();
