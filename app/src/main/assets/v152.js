'use strict';
(function(){
  window.refreshPreflight=window.refreshPreflight||function(){
    try{const e=document.getElementById('draft');if(e)e.dispatchEvent(new Event('change',{bubbles:true}));}catch(_){}
  };
  window.notify=window.notify||function(state,text){try{Android.notifyCmems(String(state||'progress'),String(text||''))}catch(_){}};
})();
