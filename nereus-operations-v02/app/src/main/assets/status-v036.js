/* NEREUS Operations v0.3.6 · exact NOT ALLOWED gets strongest alert style */
cls=function(s){
  s=(s||'').toUpperCase().trim();
  if(s==='ALLOWED')return'good';
  if(s==='NOT ALLOWED')return'danger';
  if(s.includes('NOT ALLOWED')||s.includes('CLOSED'))return'bad';
  return'warn';
};
