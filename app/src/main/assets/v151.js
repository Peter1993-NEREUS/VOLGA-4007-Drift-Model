'use strict';
(function(){
  const $p=id=>document.getElementById(id);
  const CUSTOM_ID='builtin:custom';
  const VOLGA_ID='builtin:volga';
  function customPreset(){return {id:CUSTOM_ID,name:'CUSTOM VESSEL',imo:'',cargo:0,draft:0,loa:0,beam:0,leeway:.003,flag:'',type:'',dwt:0,gt:0,mmsi:'',callsign:''}}
  function presetLabel(x){return x.presetName||x.name||'Unnamed preset'}
  function loadPresetList(selectId){
    const p=$p('preset'),old=selectId||p.value||CUSTOM_ID,b=builtinPreset(),u=userPresets();
    p.innerHTML=`<option value="${CUSTOM_ID}">CUSTOM VESSEL</option><option value="${VOLGA_ID}">${b.name} • IMO ${b.imo}</option>`+u.map(x=>`<option value="${x.id}">${presetLabel(x)}${x.imo?' • IMO '+x.imo:''}</option>`).join('');
    p.value=[...p.options].some(o=>o.value===old)?old:CUSTOM_ID;
    syncPresetName();
  }
  function syncPresetName(){let f=$p('presetName');if(!f)return;let id=$p('preset').value;if(id===CUSTOM_ID)f.value='CUSTOM VESSEL';else if(id===VOLGA_ID)f.value='VOLGA-4007';else{let x=userPresets().find(z=>z.id===id);f.value=x?presetLabel(x):''}}
  function selectCustom(focusImo=false,preserveImo=''){
    loadPresetList(CUSTOM_ID);setVessel(customPreset());$p('preset').value=CUSTOM_ID;syncPresetName();
    if(preserveImo)$p('imo').value=preserveImo;
    clearResults();refreshPreflight?.();
    if(focusImo)setTimeout(()=>$p('imo')?.focus(),80);
  }
  function selectPresetV15(){let id=$p('preset').value;if(id===CUSTOM_ID){selectCustom(false);return}let v=id===VOLGA_ID?builtinPreset():userPresets().find(x=>x.id===id);if(v)setVessel(v);syncPresetName();refreshPreflight?.()}
  function saveAsNew(){let v=vesselInfo(),name=($p('presetName')?.value||'').trim()||v.name||'CUSTOM VESSEL',id='user:'+Date.now().toString(36),arr=userPresets();arr.push({...v,id,presetName:name});saveUserPresets(arr);loadPresetList(id);toast(`Preset created: ${name}`)}
  function updatePreset(){let id=$p('preset').value;if(!id.startsWith('user:'))return saveAsNew();let arr=userPresets(),i=arr.findIndex(x=>x.id===id);if(i<0)return saveAsNew();let keep=arr[i].presetName||arr[i].name||'Preset';arr[i]={...vesselInfo(),id,presetName:keep};saveUserPresets(arr);loadPresetList(id);toast(`Preset updated: ${keep}`)}
  function renamePreset(){let id=$p('preset').value;if(!id.startsWith('user:'))return toast('Built-in presets cannot be renamed. Use SAVE AS NEW.',true);let name=($p('presetName')?.value||'').trim();if(!name)return toast('Enter preset name first',true);let arr=userPresets(),i=arr.findIndex(x=>x.id===id);if(i<0)return toast('Preset not found',true);arr[i].presetName=name;saveUserPresets(arr);loadPresetList(id);toast(`Preset renamed: ${name}`)}
  function deletePresetV15(){let id=$p('preset').value;if(!id.startsWith('user:'))return toast('Built-in presets cannot be deleted',true);saveUserPresets(userPresets().filter(x=>x.id!==id));selectCustom(false);toast('Preset deleted')}
  function installPresetUi(){
    let line=$p('preset')?.closest('.presetline');if(!line||$p('presetName'))return;
    $p('savePreset').textContent='UPDATE';$p('deletePreset').textContent='DELETE';
    let box=document.createElement('div');box.className='presetV15';box.innerHTML='<label>Preset name</label><input id="presetName" class="input" placeholder="e.g. TARYN EVE — Full Load"><div class="presetActionsV15"><button id="customPreset" class="secondary">CUSTOM / NEW</button><button id="saveAsNewPreset" class="secondary">SAVE AS NEW</button><button id="renamePreset" class="secondary">RENAME</button></div>';
    line.insertAdjacentElement('afterend',box);
    let style=document.createElement('style');style.textContent='.presetV15{margin-top:5px}.presetActionsV15{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin-top:6px}.presetActionsV15 button{font-size:9.5px;padding:7px 5px}@media(max-width:390px){.presetActionsV15{grid-template-columns:1fr 1fr}}';document.head.appendChild(style);
    $p('preset').onchange=selectPresetV15;$p('savePreset').onclick=updatePreset;$p('deletePreset').onclick=deletePresetV15;$p('customPreset').onclick=()=>selectCustom(true);$p('saveAsNewPreset').onclick=saveAsNew;$p('renamePreset').onclick=renamePreset;
    loadPresetList($p('preset').value||VOLGA_ID);
  }
  function validIMO(imo){if(!/^\d{7}$/.test(imo))return false;let s=0;for(let i=0;i<6;i++)s+=Number(imo[i])*(7-i);return s%10===Number(imo[6])}
  async function lookupOnline(){
    let imo=$p('imo').value.replace(/\D/g,'');if(!validIMO(imo))return toast('Invalid IMO number or checksum',true);
    if($p('preset').value!==CUSTOM_ID)selectCustom(false,imo);else $p('imo').value=imo;
    let tk=token();if(!tk){$p('connectionDetails').open=true;return toast('Connection token is required for vessel lookup',true)}
    const rid=`vessel-${Date.now()}-${Math.random().toString(36).slice(2,7)}`,btn=$p('lookupImo'),st=$p('lookupStatus');btn.disabled=true;st.textContent='Searching current public particulars by IMO…';
    try{
      let body={ref:'pending-test-fixes',inputs:{request_id:rid,imo}},r=await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/vessel-lookup.yml/dispatches`,{method:'POST',headers:{Authorization:`Bearer ${tk}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','Content-Type':'application/json'},body:JSON.stringify(body)});
      if(r.status!==204)throw Error(`Vessel lookup request failed HTTP ${r.status}`);
      for(let n=0;n<45;n++){
        try{
          let j=await jsonUrl(`https://raw.githubusercontent.com/${REPO}/lookup/vessel.json?t=${Date.now()}`);
          if(j.requestId===rid){
            if(j.status!=='ready')throw Error(j.message||'No usable public particulars found');
            applyLookup(j);return;
          }
        }catch(e){if(String(e.message||'').includes('No usable')||String(e.message||'').includes('Invalid IMO'))throw e}
        st.textContent=`Searching current public particulars… ${Math.round((n+1)*3)}s`;await sleep(3000);
      }
      throw Error('Vessel lookup timed out');
    }catch(e){st.textContent=`LOOKUP FAILED: ${e.message}`;toast(e.message,true)}finally{btn.disabled=false}
  }
  function applyLookup(j){
    const set=(id,v,fmtFn=null)=>{if(!$p(id)||v===undefined||v===null||v==='')return;if(typeof v==='number'&&!v)return;$p(id).value=fmtFn?fmtFn(v):v};
    set('vessel',j.name);set('imo',j.imo);set('loa',j.loa,x=>Number(x).toFixed(2));set('beam',j.beam,x=>Number(x).toFixed(2));set('gt',j.gt,x=>Math.round(x));set('dwt',j.dwt,x=>Math.round(x));set('mmsi',j.mmsi);set('callsign',j.callsign);set('flag',j.flag);set('shipType',j.type);
    S.lookupSource=j.source||'Public particulars';
    let flags=[];if(j.year)flags.push(`built ${j.year}`);if(j.referenceDraft)flags.push(`reference draft ${Number(j.referenceDraft).toFixed(2)} m — actual draft unchanged`);if(j.nameConflict)flags.push(`NAME CONFLICT: current ${j.name} / fallback ${j.alternateName}`);
    let quality=j.confidence==='high'?'CURRENT PUBLIC DATA':'FALLBACK PUBLIC DATA';$p('lookupStatus').textContent=`${quality} • ${j.source||''}${flags.length?' • '+flags.join(' • '):''}. Review values, then SAVE AS NEW.`;
    if(j.nameConflict)toast('Vessel found, but sources disagree on name — check before saving',true);else toast(`Vessel found: ${j.name}`);
    if($p('presetName'))$p('presetName').value=j.name||`IMO ${j.imo}`;clearResults();refreshPreflight?.();
  }
  function hookLookup(){if($p('lookupImo'))$p('lookupImo').onclick=lookupOnline}
  function hookReset(){let b=$p('reset');if(!b)return;b.onclick=()=>{clearResults();selectCustom(false);toast('Route cleared • CUSTOM VESSEL selected')}}
  function loadCmemsFastPath(){if(document.getElementById('enh175'))return;let s=document.createElement('script');s.id='enh175';s.src='v175.js';s.onerror=()=>console.error('Failed to load v175.js');document.body.appendChild(s)}
  function version(){let sub=document.querySelector('header .sub');if(sub){sub.textContent=sub.textContent.replace(/ • v1\.5\.\d+/g,'');sub.insertAdjacentHTML('beforeend',' • v1.5.1')}}
  function boot(){try{installPresetUi();hookLookup();hookReset();version();setTimeout(loadCmemsFastPath,350)}catch(e){console.error('v1.5.1 preset/IMO enhancements',e)}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,120));else setTimeout(boot,120);
})();
