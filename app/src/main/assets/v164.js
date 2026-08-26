'use strict';
(function(){
  function patchCoordinatePriority(){
    if(typeof setStart!=='function'||setStart.__activeCoordPriority)return;
    const previous=setStart;
    const wrapped=function(lat,lon,clear,center){
      const pair=document.getElementById('pair');
      const ship=document.getElementById('shipPair');
      const active=document.activeElement;
      const protectedField=(active===pair||active===ship)?active:null;
      const typed=protectedField?protectedField.value:null;
      const caret=protectedField&&typeof protectedField.selectionStart==='number'?protectedField.selectionStart:null;
      const result=previous(lat,lon,clear,center);
      if(protectedField){
        protectedField.value=typed;
        if(caret!==null){
          try{protectedField.setSelectionRange(caret,caret)}catch(_){}
        }
      }
      return result;
    };
    wrapped.__activeCoordPriority=true;
    setStart=wrapped;
  }
  function boot(){
    try{patchCoordinatePriority()}catch(e){console.error('active coordinate priority',e)}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,450));else setTimeout(boot,450);
})();
