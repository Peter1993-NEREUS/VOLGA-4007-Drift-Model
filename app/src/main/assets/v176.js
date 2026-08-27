'use strict';
(function(){
  const started=performance.now();
  const localName=u=>{
    const s=String(u||'').split('?')[0];
    if(/^[a-z]+:/i.test(s)||s.startsWith('//'))return '';
    return s.replace(/^\.\//,'').replace(/^\//,'');
  };
  const binCache=new Map();
  const jsonCache=new Map();

  function prefetchBin(name){
    const p=fetch(name,{cache:'no-store'}).then(r=>{if(!r.ok)throw Error(`HTTP ${r.status}`);return r.arrayBuffer()}).then(b=>new Int16Array(b));
    binCache.set(name,p.catch(e=>{binCache.delete(name);throw e}));
  }
  function prefetchJson(name){
    const p=fetch(name,{cache:'no-store'}).then(r=>{if(!r.ok)throw Error(`HTTP ${r.status}`);return r.json()});
    jsonCache.set(name,p.catch(e=>{jsonCache.delete(name);throw e}));
  }

  // STARTUP FAST PATH: begin the large embedded CMEMS reads together while v14
  // is awaiting meta.json. Later sequential calls reuse these in-flight promises.
  for(const n of ['regional.bin','stokes.bin','global.bin'])prefetchBin(n);
  for(const n of ['wind.json','coast.json'])prefetchJson(n);

  if(typeof binUrl==='function'&&!binUrl.__startupFast){
    const old=binUrl;
    binUrl=async function(u){const n=localName(u);if(binCache.has(n))return binCache.get(n);return old(u)};
    binUrl.__startupFast=true;
  }
  if(typeof jsonUrl==='function'&&!jsonUrl.__startupFast){
    const old=jsonUrl;
    jsonUrl=async function(u){const n=localName(u);if(jsonCache.has(n))return jsonCache.get(n);return old(u)};
    jsonUrl.__startupFast=true;
  }

  // The old boot path calculated baseline + three sensitivity routes before the
  // loading screen disappeared. Skip only that one silent boot calculation.
  // User-triggered ROUTE/CALCULATE and all later recalculations remain unchanged.
  if(typeof calculate==='function'&&!calculate.__startupFast){
    const old=calculate;
    let firstSilent=true;
    calculate=function(silent=false){
      if(firstSilent&&silent&&S?.source==='embedded'&&!S?.track?.length){
        firstSilent=false;
        const e=document.getElementById('engineStatus');
        if(e)e.textContent='CMEMS pack ready • press CALCULATE / ROUTE when ready.';
        return;
      }
      firstSilent=false;
      return old(silent);
    };
    calculate.__startupFast=true;
  }

  const loading=document.getElementById('loading');
  if(loading){
    const mo=new MutationObserver(()=>{
      if(getComputedStyle(loading).display==='none'){
        console.info(`STARTUP FAST PATH ready in ${Math.round(performance.now()-started)} ms`);
        mo.disconnect();
      }
    });
    mo.observe(loading,{attributes:true,attributeFilter:['style','class']});
  }
})();
