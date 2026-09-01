/* NEREUS Operations v0.3.7 · port status/security in Operations */
(function(){
  const PORTS=new Set(['NOVOROSSIYSK','CPC','TAMAN','TUAPSE']);
  const GROUPS=new Set(['AT BERTH','AT ANCHORAGE','EXPECTED / PROSPECTS','DEPARTED - LAST 5 DAYS']);

  parseMobile=function(rows){
    let date='',ports=[],p=null,g=null;
    for(const raw of rows||[]){
      const cells=(raw||[]).map(x=>String(x??'').trim());
      const f=cells[0]||'';
      if(!cells.some(Boolean))continue;
      if(f==='REPORT DATE'){date=cells[1]||'';continue}
      if(PORTS.has(f)){
        p={
          name:f,
          groups:[],
          portStatus:cells[9]||'',
          security:cells[10]||'',
          securityLevel:cells[11]||''
        };
        ports.push(p);g=null;continue;
      }
      if(GROUPS.has(f)&&p){g={status:f,vessels:[]};p.groups.push(g);continue}
      if(f.toLowerCase()==='vessel'||!p||!g)continue;
      const v=[...cells,...Array(8).fill('')];
      if(v[0])g.vessels.push({
        vessel:v[0],terminal:v[1],cargo:v[2],qty:v[3],loadPosition:v[4],eta:v[5],etb:v[6],ets:v[7]
      });
    }
    return{date,ports};
  };

  function portStatusClass(v){
    v=(v||'').toUpperCase().trim();
    if(v==='OPERATIONAL')return'ps-good';
    if(v.includes('POSPON')||v.includes('CLOSED')||v.includes('SUSPEND'))return'ps-danger';
    return'ps-neutral';
  }
  function securityClass(v){
    v=(v||'').toUpperCase().trim();
    if(v==='MILITARY')return'ps-danger';
    if(v==='ALERT')return'ps-alert';
    if(v==='WEATHER')return'ps-weather';
    return'ps-neutral';
  }
  function levelClass(v){
    v=String(v||'').trim();
    if(v==='1')return'ps-good';
    if(v==='2')return'ps-alert';
    if(v==='3')return'ps-danger';
    return'ps-neutral';
  }

  function portPanel(p){
    return `<div class="port-panel">
      <div class="port-stat ${portStatusClass(p.portStatus)}"><span>PORT STATUS</span><b>${esc(p.portStatus||'—')}</b></div>
      <div class="port-stat ${securityClass(p.security)}"><span>SECURITY / RESTRICTIONS</span><b>${esc(p.security||'—')}</b></div>
      <div class="port-stat ${levelClass(p.securityLevel)}"><span>SECURITY LEVEL</span><b>${esc(p.securityLevel||'—')}</b></div>
    </div>`;
  }

  renderBrief=function(){
    let d=state.reports.mobile,ps=d.ports||[];
    if(!state.port||!ps.some(p=>p.name===state.port))state.port=ps[0]?.name;
    let p=ps.find(q=>q.name===state.port),h=chips(ps.map(q=>q.name),state.port);
    if(p){
      h+=portPanel(p);
      for(let g of p.groups){
        h+=`<div class="section">${esc(g.status)} · ${g.vessels.length}</div>`;
        h+=g.vessels.length?'<div class="grid">'+g.vessels.map(v=>`<div class="vessel"><b>${esc(v.vessel)}</b><div class="terminal">${esc(v.terminal||'—')}</div><div class="cargo"><span>${esc(v.cargo||'—')}</span><span>${esc(v.qty||'—')} MT</span></div><div class="loadpos"><span>LOAD POSITION</span><b>${esc(v.loadPosition||'—')}</b></div><div class="times"><div class="time"><span>ETA / ARR</span><b>${esc(v.eta||'—')}</b></div><div class="time"><span>ETB</span><b>${esc(v.etb||'—')}</b></div><div class="time"><span>ETS</span><b>${esc(v.ets||'—')}</b></div></div></div>`).join('')+'</div>':'<div class="empty">Нет судов</div>';
      }
    }
    $('#brief').innerHTML=h;
    $('#brief').querySelectorAll('[data-chip]').forEach(b=>b.onclick=()=>{state.port=b.dataset.chip;renderBrief()});
  };
})();
