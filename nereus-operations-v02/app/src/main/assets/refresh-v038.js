/* NEREUS Operations v0.3.8 · reliable manual refresh */
(function(){
  let busy=false;

  const style=document.createElement('style');
  style.textContent=`
    #refresh.refresh-busy{animation:nereusSpin .8s linear infinite;opacity:.75;pointer-events:none}
    @keyframes nereusSpin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
  `;
  document.head.appendChild(style);

  async function forceRefresh(){
    if(busy)return;
    busy=true;
    const btn=$('#refresh');
    if(btn){btn.classList.add('refresh-busy');btn.disabled=true;btn.setAttribute('aria-busy','true')}
    banner('ОБНОВЛЕНИЕ · запрашиваю свежие данные…','live');

    try{
      const d=await call('reports',{
        force_refresh:true,
        request_id:'manual-'+Date.now()+'-'+Math.random().toString(36).slice(2)
      });

      state.reports={
        source:d.source,
        generated_at:d.generated_at||'',
        mobile:parseMobile(d.mobile_rows),
        weather:parseWeather(d.weather_rows)
      };
      cache(state.reports);
      render();

      const stamp=d.generated_at?(' · '+String(d.generated_at).replace('T',' ').replace('Z',' UTC')):'';
      banner('ОБНОВЛЕНО · свежие данные получены'+stamp,'live');
    }catch(e){
      if(AUTH_ERRORS.has(e.message)){
        clearSession();
        loginView(msg(e));
        return;
      }
      // Keep already displayed data, but never pretend that the refresh succeeded.
      banner('ОБНОВЛЕНИЕ НЕ ВЫПОЛНЕНО · '+msg(e),'');
    }finally{
      busy=false;
      if(btn){btn.classList.remove('refresh-busy');btn.disabled=false;btn.removeAttribute('aria-busy')}
    }
  }

  const btn=$('#refresh');
  if(btn)btn.onclick=forceRefresh;
  window.nereusForceRefresh=forceRefresh;
})();
