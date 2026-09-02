/* NEREUS Operations WEB v1.1.20 · display schedule quantities without thousands separators */
(function(){
  function stripThousands(root){
    if(!root)return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    const nodes=[];
    while(walker.nextNode())nodes.push(walker.currentNode);
    nodes.forEach(node=>{
      const before=node.nodeValue||'';
      const after=before.replace(/(\d),(?=\d{3}(?:\D|$))/g,'$1');
      if(after!==before)node.nodeValue=after;
    });
  }
  function clean(){
    stripThousands(document.querySelector('#schedules'));
    stripThousands(document.querySelector('#scheduleModal'));
  }
  const observer=new MutationObserver(clean);
  const schedules=document.querySelector('#schedules');
  const modal=document.querySelector('#scheduleModal');
  if(schedules)observer.observe(schedules,{subtree:true,childList:true,characterData:true});
  if(modal)observer.observe(modal,{subtree:true,childList:true,characterData:true});
  clean();
})();
