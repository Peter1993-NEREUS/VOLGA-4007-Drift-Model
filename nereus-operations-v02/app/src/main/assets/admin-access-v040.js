/* NEREUS Operations v0.4.0 · schedules access control in ADMIN */
(function(){
  renderAdmin=async function(){
    if(state.user?.role!=='admin')return;
    $('#admin').innerHTML='<div class="empty">Загрузка пользователей…</div>';
    try{
      const d=await call('adminListUsers');
      $('#admin').innerHTML=`<div class="card"><div class="section">CREATE USER</div><div class="adminForm"><input id="cu" placeholder="Username"><input id="cn" placeholder="Name"><input id="cc" placeholder="Company"><input id="cv" placeholder="Vessel"><input id="cd" type="date"><input id="cm" type="number" min="1" max="10" value="1"><button id="create" class="secondary">Create</button></div><div id="amsg" class="small"></div></div><div class="section">USERS</div>${d.users.map(u=>`<div class="user"><b>${esc(u.username)}</b><small>${esc(u.display_name||u.company||'')}</small><div class="small">${u.active?'ACTIVE':'BLOCKED'} · до ${esc(u.subscription_until||'—')} · ${u.device_count}/${u.max_devices} devices</div><div class="sched-access-line"><span>SCHEDULES ACCESS</span>${u.role==='admin'?`<button class="secondary sched-access-btn on" disabled>ADMIN</button>`:`<button class="secondary sched-access-btn ${u.schedules_access?'on':'off'}" data-sched-access="1" data-enabled="${u.schedules_access?'true':'false'}" data-id="${u.id}">${u.schedules_access?'ON':'OFF'}</button>`}</div><div class="actions"><button class="secondary" data-a="extend" data-id="${u.id}">+1M</button><button class="secondary" data-a="devices" data-id="${u.id}">Reset devices</button><button class="secondary" data-a="password" data-id="${u.id}">New password</button>${u.role==='admin'?'':`<button class="secondary" data-a="block" data-on="${u.active}" data-id="${u.id}">${u.active?'Block':'Unblock'}</button>`}</div></div>`).join('')}`;
      $('#create').onclick=createUser;
      $('#admin').querySelectorAll('[data-a]').forEach(b=>b.onclick=()=>act(b));
      $('#admin').querySelectorAll('[data-sched-access]').forEach(b=>b.onclick=async()=>{
        if(b.disabled)return;
        const was=b.dataset.enabled==='true';
        b.disabled=true;b.textContent='…';
        try{
          await call('adminSetSchedulesAccess',{user_id:b.dataset.id,enabled:!was});
          await renderAdmin();
        }catch(e){
          b.disabled=false;b.textContent=was?'ON':'OFF';
          alert(msg(e)+'\n'+e.message);
        }
      });
    }catch(e){
      if(AUTH_ERRORS.has(e.message)){clearSession();loginView(msg(e))}
      else $('#admin').innerHTML='<div class="empty">Ошибка загрузки пользователей.</div>';
    }
  };
})();
