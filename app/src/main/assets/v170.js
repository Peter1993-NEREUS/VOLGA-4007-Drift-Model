'use strict';
(function(){
  const $=id=>document.getElementById(id);
  function prepMap(){
    fitRoute(); report();
    const c=$('reportMap'); if(!c)return;
    let img=$('reportMapPrint');
    if(!img){img=document.createElement('img');img.id='reportMapPrint';img.className='reportMap reportMapPrint';c.insertAdjacentElement('afterend',img)}
    try{img.src=c.toDataURL('image/png')}catch(_){}
  }
  function boot(){
    const b=$('print'); if(!b)return;
    b.textContent='PRINT / SAVE PDF';
    b.onclick=()=>{if(!S.track.length)return toast('No route to export',true);prepMap();setTimeout(()=>{try{Android.printPdf()}catch(_){toast('Android print service unavailable',true)}},180)};
  }
  setTimeout(boot,900);
})();