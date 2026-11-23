export async function haUser(token, id) {
  const users=await new Promise((resolve,reject)=> {
    const ws=new WebSocket('ws://supervisor/core/websocket');
    const timeout=setTimeout(()=>finish(new Error('Home Assistant user lookup timed out')),10000);
    function finish(error,result){clearTimeout(timeout);ws.close();error?reject(error):resolve(result);}
    ws.addEventListener('error',()=>finish(new Error('Home Assistant user lookup failed')),{once:true});
    ws.addEventListener('message',event=> {
      try {
        const msg=JSON.parse(String(event.data));
        if(msg.type==='auth_required') ws.send(JSON.stringify({type:'auth',access_token:token}));
        else if(msg.type==='auth_ok') ws.send(JSON.stringify({id:1,type:'config/auth/list'}));
        else if(msg.type==='auth_invalid') finish(new Error('Home Assistant authentication failed'));
        else if(msg.type==='result'&&msg.id===1) msg.success?finish(null,msg.result):finish(new Error('Home Assistant user lookup denied'));
      }catch {finish(new Error('Home Assistant returned invalid user data'));}
    });
  });
  const user=users.find(u=>u.id===id&&u.is_active&&!u.system_generated);
  if(!user) throw new Error('Користувача Home Assistant не знайдено.');
  return {userId:user.id,name:user.name,isAdmin:user.is_owner||user.group_ids.includes('system-admin')};
}
