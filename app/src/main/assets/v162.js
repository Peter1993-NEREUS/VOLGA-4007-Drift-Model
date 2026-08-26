'use strict';
(function(){
  const CUSTOM_ID='builtin:custom';
  const $x=id=>document.getElementById(id);
  function customOption(){const p=$x('preset');return p?[...p.options].find(o=>o.value===CUSTOM_ID):null}
  function cleanName(){const v=($x('vessel')?.value||'').trim();return v&&v.toUpperCase()!=='CUSTOM VESSEL'?v:''}
  function syncCustomLabel(forceDefault=false){
    const p=$x('preset'),o=customOption();if(!p||!o)return;
    if(forceDefault||p.value!==CUSTOM_ID){if(forceDefault)o.textContent='CUSTOM VESSEL';return}
    const name=cleanName();o.textContent=name?`CUSTOM • ${name}`:'CUSTOM VESSEL';
    const pn=$x('presetName');if(pn&&name&&(pn.value.trim()===''||pn.value.trim()==='CUSTOM VESSEL'))pn.value=name;
  }
  function install(){
    const status=$x('lookupStatus'),vessel=$x('vessel'),preset=$x('preset');
    if(status){new MutationObserver(()=>{const t=status.textContent||'';if(/CURRENT PUBLIC DATA|FALLBACK PUBLIC DATA/i.test(t))setTimeout(()=>syncCustomLabel(false),0)}).observe(status,{childList:true,subtree:true,characterData:true})}
    if(vessel){vessel.addEventListener('input',()=>{if(preset?.value===CUSTOM_ID)syncCustomLabel(false)});vessel.addEventListener('change',()=>{if(preset?.value===CUSTOM_ID)syncCustomLabel(false)})}
    preset?.addEventListener('change',()=>setTimeout(()=>syncCustomLabel(false),0));
    $x('customPreset')?.addEventListener('click',()=>setTimeout(()=>syncCustomLabel(true),20));
    $x('reset')?.addEventListener('click',()=>setTimeout(()=>syncCustomLabel(true),20));
    syncCustomLabel(false);
  }
  function version(){const sub=document.querySelector('header .sub');if(sub){sub.textContent=sub.textContent.replace(/ • v1\.6\.\d+/g,'');sub.insertAdjacentHTML('beforeend',' • v1.6.2')}}
  function boot(){try{install();version()}catch(e){console.error('v1.6.2 custom label',e)}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,300));else setTimeout(boot,300);
})();
