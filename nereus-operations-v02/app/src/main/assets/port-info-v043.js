(function(){
const PORT_INFO_API='https://bzfzghszxqartljpjsmc.supabase.co/functions/v1/nereus-port-info';
const pi={data:null,loading:false,port:'',terminal:'',facilityId:''};

function nfmt(v){const s=String(v??'').trim();if(!s)return'';const x=Number(s.replace(',','.'));return Number.isFinite(x)?x.toLocaleString('en-US',{maximumFractionDigits:1}):s}
function range(min,max,unit=''){const a=nfmt(min),b=nfmt(max);if(a&&b)return `${a} – ${b}${unit}`;if(b)return `max ${b}${unit}`;if(a)return `min ${a}${unit}`;return''}
function splitItems(v){return String(v||'').split('|').map(x=>x.trim()).filter(Boolean)}
function field(label,value){if(value===undefined||value===null||String(value).trim()==='')return'';return `<div class="pi-field"><span>${esc(label)}</span><b>${esc(value)}</b></div>`}
function listField(label,value){const items=splitItems(value);if(!items.length)return'';return `<div class="pi-field pi-wide"><span>${esc(label)}</span><div class="pi-list">${items.map(x=>`<b>${esc(x)}</b>`).join('')}</div></div>`}
function section(title,body){return body?`<div class="pi-section"><div class="pi-section-title">${esc(title)}</div><div class="pi-fields">${body}</div></div>`:''}
function noticeFor(port,terminal){return (pi.data?.settings||[]).find(x=>x.port===port&&x.terminal===terminal)}

async function fetchPortInfo(force=false){
  if(pi.loading)return;
  if(pi.data&&!force)return;
  pi.loading=true;
  const root=document.querySelector('#portInfo');
  if(root)root.innerHTML='<div class="empty">Loading Port Info…</div>';
  try{
    const r=await fetch(PORT_INFO_API,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'portInfo',device_id:device,access_token:state.token,force_refresh:force}),cache:'no-store'});
    const d=await r.json().catch(()=>null);
    if(!r.ok||!d?.ok)throw new Error(d?.error||'PORT_INFO_ERROR');
    pi.data=d.port_info||{facilities:[],settings:[]};
  }catch(e){
    if(root)root.innerHTML=`<div class="empty">Port Info temporarily unavailable.<br><small>${esc(e.message||'')}</small></div>`;
    return;
  }finally{pi.loading=false}
  renderPortInfo();
}

function compactCard(x){
  const dwt=range(x.dwt_min,x.dwt_max,' MT');
  const loa=range(x.loa_min,x.loa_max,' m');
  return `<button class="pi-card" data-pi-id="${esc(x.id)}">
    <div class="pi-card-head"><div><small>${esc(x.terminal)}</small><h3>BERTH ${esc(x.berth)}</h3></div><span class="pi-side">${esc(x.berthing_side||'—')}</span></div>
    <div class="pi-cargo">${esc(x.cargo||'—')}</div>
    <div class="pi-kpis">
      ${dwt?`<div><small>DWT</small><b>${esc(dwt)}</b></div>`:''}
      ${loa?`<div><small>LOA</small><b>${esc(loa)}</b></div>`:''}
      ${x.draft_value?`<div><small>${esc(x.draft_label||'DRAFT')}</small><b>${esc(x.draft_value)}</b></div>`:''}
    </div>
    <div class="pi-view">VIEW DETAILS</div>
  </button>`;
}

function detail(x){
  const notice=noticeFor(x.port,x.terminal);
  const vessel=field('DWT',range(x.dwt_min,x.dwt_max,' MT'))+
    field('LOA',range(x.loa_min,x.loa_max,' m'))+
    field('PARALLEL BODY LENGTH',x.parallel_body_min?`min ${nfmt(x.parallel_body_min)} m`:'')+
    field(x.draft_label||'DRAFT',x.draft_value)+field('FREEBOARD',x.freeboard_min);
  const berthing=field('BERTHING SIDE',x.berthing_side)+field('BALLAST DISCHARGE',x.ballast_discharge);
  const manifold=field('MANIFOLD POSITION',x.manifold_position)+field('MANIFOLD CENTRES',x.manifold_centres_min)+field("SHIP'S RAIL → MANIFOLD",x.rail_to_manifold_min)+field('OIL TRAY WIDTH',x.oil_tray_width_min)+field('OIL TRAY → MANIFOLD',x.oil_tray_to_manifold)+field('FLANGE POSITION',x.flange_position)+field('FLANGE THICKNESS',x.flange_thickness);
  const connections=listField('CONNECTIONS',x.connections)+field('CONNECTION STANDARD',x.connection_standard)+field('SHORE LINE TYPE',x.shore_line_type)+field('MAX PRESSURE',x.max_pressure);
  const envelope=field(x.waterline_label||'OPERATING ENVELOPE',x.waterline_min&&x.waterline_max?`${x.waterline_min} – ${x.waterline_max}`:(x.waterline_min||x.waterline_max));
  const loading=listField('AVERAGE LOADING RATE',x.loading_rates)+listField('MIN TOPPING-OFF RATE',x.topping_off_rates);
  const notes=field('SHORE GANGWAY',x.gangway_requirements)+field('SPECIAL RESTRICTIONS',x.special_restrictions)+field('TECHNICAL NOTES',x.technical_notes);
  return `<div class="pi-detail">
    <button class="pi-back" data-pi-back>← BACK TO BERTHS</button>
    <div class="pi-detail-head"><div><small>${esc(x.port)} · ${esc(x.terminal)}</small><h2>BERTH ${esc(x.berth)}</h2><div class="pi-cargo">${esc(x.cargo)}</div></div><span class="pi-side">${esc(x.berthing_side||'—')}</span></div>
    ${section('VESSEL LIMITS',vessel)}
    ${section('BERTHING',berthing)}
    ${section('MANIFOLD REQUIREMENTS',manifold)}
    ${section('CARGO CONNECTIONS',connections)}
    ${section('OPERATING ENVELOPE',envelope)}
    ${section('LOADING PERFORMANCE',loading)}
    ${section('NOTES / RESTRICTIONS',notes)}
    ${notice?.notice?`<div class="pi-notice"><b>IMPORTANT NOTICE</b><div>${esc(notice.notice)}</div></div>`:''}
    <div class="pi-updated">DATA STATUS: ${esc(x.data_status||'CURRENT')} · LAST UPDATED: ${esc(x.last_updated||notice?.last_updated||'—')}</div>
  </div>`;
}

function renderPortInfo(){
  const root=document.querySelector('#portInfo');if(!root)return;
  if(!pi.data){fetchPortInfo();return}
  const all=(pi.data.facilities||[]).filter(x=>x.status!=='INACTIVE');
  if(!all.length){root.innerHTML='<div class="empty">No Port Info data available.</div>';return}
  const ports=[...new Set(all.map(x=>x.port).filter(Boolean))];
  if(!pi.port||!ports.includes(pi.port))pi.port=ports[0];
  const portRows=all.filter(x=>x.port===pi.port);
  const terminals=[...new Set(portRows.map(x=>x.terminal).filter(Boolean))];
  if(!pi.terminal||!terminals.includes(pi.terminal))pi.terminal=terminals[0];
  const rows=portRows.filter(x=>x.terminal===pi.terminal).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0));
  const selected=pi.facilityId?all.find(x=>x.id===pi.facilityId):null;
  if(selected){root.innerHTML=detail(selected);root.querySelector('[data-pi-back]').onclick=()=>{pi.facilityId='';renderPortInfo()};return}
  const notice=noticeFor(pi.port,pi.terminal);
  root.innerHTML=`<div class="pi-wrap">
    <div class="pi-title"><div><small>PORT INFORMATION CENTER</small><h2>TERMINALS & BERTHS</h2></div><button class="secondary pi-refresh" title="Refresh Port Info">↻</button></div>
    ${ports.length>1?`<div class="chips">${ports.map(p=>`<button class="chip ${p===pi.port?'active':''}" data-pi-port="${esc(p)}">${esc(p)}</button>`).join('')}</div>`:''}
    <div class="pi-terminal-bar"><b>${esc(pi.terminal)}</b><span>${rows.length} BERTHS</span></div>
    ${terminals.length>1?`<div class="chips">${terminals.map(t=>`<button class="chip ${t===pi.terminal?'active':''}" data-pi-terminal="${esc(t)}">${esc(t)}</button>`).join('')}</div>`:''}
    <div class="pi-grid">${rows.map(compactCard).join('')}</div>
    ${notice?.notice?`<div class="pi-notice compact"><b>IMPORTANT NOTICE</b><div>${esc(notice.notice)}</div></div>`:''}
  </div>`;
  root.querySelector('.pi-refresh')?.addEventListener('click',()=>fetchPortInfo(true));
  root.querySelectorAll('[data-pi-port]').forEach(b=>b.onclick=()=>{pi.port=b.dataset.piPort;pi.terminal='';renderPortInfo()});
  root.querySelectorAll('[data-pi-terminal]').forEach(b=>b.onclick=()=>{pi.terminal=b.dataset.piTerminal;renderPortInfo()});
  root.querySelectorAll('[data-pi-id]').forEach(b=>b.onclick=()=>{pi.facilityId=b.dataset.piId;renderPortInfo()});
}

const baseSwitchPortInfo=switchView;
switchView=function(v){
  if(v==='portInfo'){
    state.view='portInfo';
    ['brief','schedules','weather','export','admin','portInfo'].forEach(x=>document.querySelector('#'+x)?.classList.toggle('hidden',x!=='portInfo'));
    document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.view==='portInfo'));
    const meta=document.querySelector('#reportMeta');if(meta)meta.textContent='Port Info · Terminals & Berths';
    renderPortInfo();
    return;
  }
  document.querySelector('#portInfo')?.classList.add('hidden');
  baseSwitchPortInfo(v);
};
window.renderPortInfo=renderPortInfo;
})();
