(function(){
  const API_PREFIX='https://bzfzghszxqartljpjsmc.supabase.co/functions/v1/nereus-api';
  const nativeApi=window.NereusNative;
  if(!nativeApi||typeof nativeApi.post!=='function')return;

  const pending=new Map();
  let seq=0;
  const originalFetch=window.fetch.bind(window);

  window.__nereusNativeResolve=function(id,status,text,error){
    const p=pending.get(id);
    if(!p)return;
    pending.delete(id);
    if(error){p.reject(new TypeError(error));return;}
    const body=String(text||'');
    p.resolve({
      ok:Number(status)>=200&&Number(status)<300,
      status:Number(status)||0,
      json:async()=>JSON.parse(body||'{}'),
      text:async()=>body,
      headers:new Headers({'content-type':'application/json'})
    });
  };

  window.fetch=function(input,init){
    const url=typeof input==='string'?input:(input&&input.url)||'';
    if(url.indexOf(API_PREFIX)!==0)return originalFetch(input,init);

    return new Promise((resolve,reject)=>{
      const id='n'+Date.now().toString(36)+(++seq).toString(36);
      pending.set(id,{resolve,reject});
      try{
        const body=init&&typeof init.body==='string'?init.body:'{}';
        nativeApi.post(id,body);
      }catch(e){
        pending.delete(id);
        reject(new TypeError((e&&e.message)||'NATIVE_NETWORK_ERROR'));
      }
    });
  };
})();
