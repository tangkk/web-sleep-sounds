(() => {
'use strict';
const app=window.SleepSounds;if(!app)return;
const API='https://sync.tangkk-x2o.com/v1/podcasts/state';
const KEY_STORAGE='sleep-sounds:sync-key',TIMES_STORAGE='sleep-sounds:sync-times:v1',PREFIX='sleep-sounds:v1:';
const controlNames=['master','timer',...app.ids.flatMap(id=>[`${id}:enabled`,`${id}:level`,`${id}:character`])];
let times={};try{times=JSON.parse(localStorage.getItem(TIMES_STORAGE)||'{}')||{}}catch{}
let busy=false,queued=false,debounce=null;
const $=id=>document.getElementById(id),status=$('sync-status'),code=$('sync-code');
const enabled=()=>!!localStorage.getItem(KEY_STORAGE);
const setStatus=text=>{status.textContent=text;$('sync-indicator').textContent=enabled()?'同步已连接':'未连接';};
const saveTimes=()=>{try{localStorage.setItem(TIMES_STORAGE,JSON.stringify(times))}catch{}};
const timestamp=name=>Number(times[name])||0;
async function request(method,key,items){
 const response=await fetch(API,{method,cache:'no-store',headers:{'X-Sync-Key':key,...(items?{'Content-Type':'application/json'}:{})},body:items?JSON.stringify({items}):undefined});
 if(!response.ok)throw Error(`HTTP ${response.status}`);
 return response.json();
}
const read=name=>app.readControl(name);
const ownItems=()=>controlNames.map(name=>({key:PREFIX+name,value:read(name),updatedAt:timestamp(name)}));
function normalize(name,value){
 if(name.endsWith(':enabled'))return typeof value==='boolean'?value:null;
 if(typeof value!=='number'||!Number.isFinite(value))return null;
 if(name==='timer')return [0,15,30,45,60,90,120,180].includes(value)?value:null;
 return Math.min(100,Math.max(0,value));
}
function merge(items){
 const map=new Map((Array.isArray(items)?items:[]).filter(item=>item&&typeof item.key==='string').map(item=>[item.key,item]));
 const changes={};
 for(const name of controlNames){
  const item=map.get(PREFIX+name);if(!item)continue;
  const value=normalize(name,item.value);if(value===null)continue;
  const remoteTime=Number(item.updatedAt)||0;
  if(remoteTime>timestamp(name)||(!timestamp(name)&&remoteTime>=0)){
   if(read(name)!==value)changes[name]=value;
   times[name]=remoteTime||Date.now();
  }
 }
 if(Object.keys(changes).length)app.applyControls(changes);
 saveTimes();
}
async function syncNow(){
 const key=localStorage.getItem(KEY_STORAGE)?.trim();if(!key)return;
 if(busy){queued=true;return;}
 busy=true;
 try{
  const remote=await request('GET',key);merge(remote.items);
  const saved=await request('POST',key,ownItems());merge(saved.items);
  setStatus(`同步成功 · ${new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}`);
 }catch(error){setStatus(`同步失败：${error.message} · 本地设置仍已保存`);console.warn('Sleep Sounds sync:',error);}
 finally{busy=false;if(queued){queued=false;schedule();}}
}
function schedule(){if(!enabled())return;clearTimeout(debounce);debounce=setTimeout(syncNow,1000);}
window.addEventListener('sleep-sounds:changed',event=>{
 const names=event.detail?.names||[];const now=Date.now();
 for(const name of names)if(controlNames.includes(name))times[name]=Math.max(now,timestamp(name)+1);
 saveTimes();schedule();
});
$('sync-save').addEventListener('click',async()=>{
 const key=code.value.trim();if(!key){setStatus('请输入同步码');return;}
 if(localStorage.getItem(KEY_STORAGE)!==key){times={};saveTimes();}
 localStorage.setItem(KEY_STORAGE,key);setStatus('正在连接…');await syncNow();
});
$('sync-now').addEventListener('click',syncNow);
$('sync-off').addEventListener('click',()=>{localStorage.removeItem(KEY_STORAGE);clearTimeout(debounce);setStatus('已关闭此设备同步；云端数据保留');});
window.addEventListener('storage',event=>{if(event.key===KEY_STORAGE){code.value=localStorage.getItem(KEY_STORAGE)||'';setStatus(enabled()?'此设备已连接':'未连接');}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)syncNow();});
window.addEventListener('online',syncNow);
setInterval(syncNow,30000);
code.value=localStorage.getItem(KEY_STORAGE)||'';
setStatus(enabled()?'此设备已连接':'未连接');
if(enabled())setTimeout(syncNow,800);
})();
