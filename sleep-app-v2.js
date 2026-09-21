(() => {
'use strict';
const definitions=[
 {id:'white',icon:'◌',name:'白噪声',detail:'均匀宽频沙沙声',level:35,param:'明亮度',character:65},
 {id:'pink',icon:'〰',name:'粉红噪声',detail:'柔和、低频更丰富',level:17,param:'明亮度',character:60},
 {id:'brown',icon:'●',name:'棕噪声',detail:'深沉的低频声',level:35,param:'低沉度',character:40},
 {id:'rain',icon:'⋰',name:'细雨',detail:'雨幕与独立雨滴',level:8,param:'雨滴密度',character:50},
 {id:'ocean',icon:'≈',name:'海浪',detail:'缓慢起伏的浪声',level:45,param:'起伏速度',character:28},
 {id:'wind',icon:'∿',name:'微风',detail:'轻柔阵风',level:61,param:'阵风速度',character:28},
 {id:'fire',icon:'✦',name:'篝火噼啪',detail:'只有火星噼啪声，不含底噪',level:28,param:'噼啪密度',character:75},
 {id:'embers',icon:'◒',name:'篝火环境',detail:'独立的低沉环境声，不含噼啪',level:28,param:'温暖度',character:30},
 {id:'stream',icon:'≋',name:'溪流',detail:'潺潺水声与随机气泡',level:40,param:'气泡密度',character:45},
 {id:'fan',icon:'◎',name:'风扇',detail:'稳定、均匀的风扇气流',level:35,param:'风声频率',character:38},
 {id:'night',icon:'⁂',name:'夜间虫鸣',detail:'稀疏的连续随机虫鸣',level:27,param:'鸣叫密度',character:30}
];
const $=id=>document.getElementById(id);
const clamp=(v,min=0,max=100)=>Math.max(min,Math.min(max,Number.isFinite(+v)?+v:min));
const levels={white:35,pink:17,brown:35,rain:8,ocean:45,wind:61,fire:28,embers:28,stream:40,fan:35,night:27};
const defaults={master:30,timer:0,sounds:Object.fromEntries(definitions.map(d=>[d.id,{enabled:['ocean','fire','embers'].includes(d.id),level:levels[d.id],character:d.character}]))};
let saved=null;try{saved=JSON.parse(localStorage.getItem('sleep-sounds-v1')||'null')}catch{}
const oldFireEnabled=saved?.sounds?.fire?.enabled;
const settings={master:clamp(saved?.master??defaults.master),timer:[0,15,30,45,60,90,120,180].includes(+saved?.timer)?+saved.timer:0,sounds:Object.fromEntries(definitions.map(d=>{
 const old=saved?.sounds?.[d.id];
 return [d.id,{enabled:old?.enabled===undefined?(d.id==='embers'&&oldFireEnabled!==undefined?oldFireEnabled===true:defaults.sounds[d.id].enabled):old.enabled===true,
 level:clamp(old?.level??(d.id==='embers'?saved?.sounds?.fire?.level:undefined)??defaults.sounds[d.id].level),character:clamp(old?.character??d.character)}];
}))};
const persist=names=>{try{localStorage.setItem('sleep-sounds-v1',JSON.stringify(settings))}catch{}if(names?.length)window.dispatchEvent(new CustomEvent('sleep-sounds:changed',{detail:{names}}))};
let context=null, masterGain=null, engine=null, playing=false, busy=false, fading=false;
let timerId=null,timerInterval=null,timerEnd=0,removeTimers=new Map();
function updateUI(){
 $('master').value=settings.master;$('master-value').textContent=settings.master+'%';
 for(const d of definitions){
  const s=settings.sounds[d.id],button=$('toggle-'+d.id);
  $('card-'+d.id).classList.toggle('active',s.enabled);
  button.textContent=s.enabled?'已开启':'已关闭';button.setAttribute('aria-pressed',String(s.enabled));
  $('level-'+d.id).value=s.level;$('value-'+d.id).textContent=s.level+'%';
  $('character-'+d.id).value=s.character;$('character-value-'+d.id).textContent=s.character+'%';
 }
 $('timer').value=String(settings.timer);
 $('play').textContent=playing?'Ⅱ 暂停播放':'▶ 开始播放';
 $('play').setAttribute('aria-pressed',String(playing));
 $('status').textContent=playing?(fading?'声音正在渐弱…':'声景播放中'):'准备好，今晚睡个好觉';
}
for(const d of definitions){
 const card=document.createElement('section');card.className='panel sound';card.id='card-'+d.id;
 card.innerHTML=`<div class="sound-head"><div class="sound-title"><span class="symbol" aria-hidden="true">${d.icon}</span><div><div class="name">${d.name}</div><div class="detail">${d.detail}</div></div></div><button type="button" class="toggle" id="toggle-${d.id}" aria-label="${d.name}开关" aria-pressed="false"></button></div><div class="control"><label for="level-${d.id}">音量</label><input type="range" id="level-${d.id}" min="0" max="100" aria-label="${d.name}音量"><output id="value-${d.id}" for="level-${d.id}"></output></div><div class="control"><label for="character-${d.id}">${d.param}</label><input type="range" id="character-${d.id}" min="0" max="100" aria-label="${d.name}${d.param}"><output id="character-value-${d.id}" for="character-${d.id}"></output></div>`;
 $('sounds').append(card);
 $('toggle-'+d.id).addEventListener('click',()=>{settings.sounds[d.id].enabled=!settings.sounds[d.id].enabled;updateUI();updateAudio();persist([d.id+':enabled'])});
 for(const field of ['level','character']){
  $(field+'-'+d.id).addEventListener('input',event=>{settings.sounds[d.id][field]=+event.target.value;updateUI();updateAudio();persist([d.id+':'+field])});
 }
}
$('master').addEventListener('input',event=>{settings.master=+event.target.value;updateUI();updateAudio();persist(['master'])});
$('timer').addEventListener('change',event=>{settings.timer=+event.target.value;if(playing)scheduleTimer();else renderTimer();persist(['timer'])});
$('reset').addEventListener('click',()=>{
 settings.master=defaults.master;
 for(const d of definitions)settings.sounds[d.id]={...defaults.sounds[d.id]};
 updateUI();updateAudio();persist(['master',...definitions.flatMap(d=>[d.id+':enabled',d.id+':level',d.id+':character'])]);
});
function updateAudio(){
 if(!context||!engine)return;
 const now=context.currentTime;
 for(const d of definitions){
  const s=settings.sounds[d.id],pending=removeTimers.get(d.id);
  if(s.enabled){
   if(pending){clearTimeout(pending);removeTimers.delete(d.id);}
   engine.ensure(d.id,s.character).gain.setTargetAtTime(s.level/100*.52,now,.05);
  }else if(engine.has(d.id)){
   const gain=engine.ensure(d.id,s.character).gain;
   gain.gain.setTargetAtTime(0,now,.025);
   if(!pending){const handle=setTimeout(()=>{
    removeTimers.delete(d.id);
    if(!settings.sounds[d.id].enabled&&engine)engine.remove(d.id);
   },180);removeTimers.set(d.id,handle);}
  }
 }
 if(!fading)masterGain.gain.setTargetAtTime(settings.master/100*.8,now,.06);
}
async function initializeAudio(){
 const AudioContextClass=window.AudioContext||window.webkitAudioContext;
 if(!AudioContextClass||!window.AudioWorkletNode)throw Error('此浏览器不支持实时音频生成');
 if(typeof window.createSleepEngine!=='function')throw Error('音频引擎未加载，请刷新页面');
 const ctx=new AudioContextClass();context=ctx;
 await ctx.resume();
 if(!ctx.audioWorklet)throw Error('浏览器不支持 AudioWorklet');
 await ctx.audioWorklet.addModule('./sleep-worklet-v2.js?v=2');
 const master=ctx.createGain();master.gain.value=0;
 const compressor=ctx.createDynamicsCompressor();compressor.threshold.value=-18;compressor.knee.value=20;compressor.ratio.value=5;compressor.attack.value=.004;compressor.release.value=.3;
 master.connect(compressor).connect(ctx.destination);masterGain=master;
 engine=window.createSleepEngine(ctx,{output:master});updateAudio();
}
async function destroyAudio(){
 for(const handle of removeTimers.values())clearTimeout(handle);removeTimers.clear();
 if(engine){engine.dispose();engine=null;}
 const old=context;context=null;masterGain=null;
 if(old)try{await old.close()}catch{}
}
function clearTimer(){if(timerId!==null)clearTimeout(timerId);if(timerInterval!==null)clearInterval(timerInterval);timerId=null;timerInterval=null;timerEnd=0;fading=false;}
function renderTimer(){
 if(!playing||!timerEnd){$('timer-status').textContent=settings.timer?'点击播放后开始计时':'';return;}
 const left=Math.max(0,Math.ceil((timerEnd-Date.now())/1000));
 $('timer-status').textContent=`自动关闭倒计时 ${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}${fading?' · 正在渐弱':''}`;
}
function timerTick(){
 if(!playing||!context||!timerEnd)return;
 const remaining=timerEnd-Date.now();
 if(remaining<=0){void stopPlayback();return;}
 if(remaining<=30000&&!fading){
  fading=true;
  masterGain.gain.cancelScheduledValues(context.currentTime);
  masterGain.gain.setValueAtTime(masterGain.gain.value,context.currentTime);
  masterGain.gain.linearRampToValueAtTime(0,context.currentTime+remaining/1000);
  updateUI();
 }
 renderTimer();
}
function scheduleTimer(){
 clearTimer();
 if(!playing||!settings.timer){renderTimer();return;}
 const total=settings.timer*60000;
 timerEnd=Date.now()+total;
 timerInterval=setInterval(timerTick,1000);
 timerId=setTimeout(()=>void stopPlayback(),total);
 renderTimer();
}
async function stopPlayback(){
 clearTimer();playing=false;window.iOSBackgroundAudio?.pause();
 if(context&&masterGain){
  const ctx=context;
  masterGain.gain.cancelScheduledValues(ctx.currentTime);
  masterGain.gain.setTargetAtTime(0,ctx.currentTime,.035);
  setTimeout(()=>{if(context===ctx&&!playing)ctx.suspend().catch(()=>{})},200);
 }
 updateUI();renderTimer();
}
$('play').addEventListener('click',async()=>{
 if(busy)return;busy=true;$('play').disabled=true;
 try{
  if(playing)await stopPlayback();
  else{
   void window.iOSBackgroundAudio?.start();
   if(!context)await initializeAudio();else await context.resume();
   playing=true;fading=false;updateAudio();updateUI();scheduleTimer();
  }
 }catch(error){playing=false;clearTimer();window.iOSBackgroundAudio?.pause();console.error(error);await destroyAudio();updateUI();$('status').textContent=`无法播放：${error.message||'请重试'}`;}
 finally{busy=false;$('play').disabled=false;}
});
window.addEventListener('sleep-sounds:media-play',()=>{if(!playing&&!busy)$('play').click()});
window.addEventListener('sleep-sounds:media-pause',()=>{if(playing&&!busy)$('play').click()});
document.addEventListener('visibilitychange',()=>{
 if(!document.hidden&&playing&&context?.state==='suspended')context.resume().catch(()=>{});
 if(!document.hidden)timerTick();
});
window.SleepSounds={ids:definitions.map(d=>d.id),readControl(name){
 if(name==='master'||name==='timer')return settings[name];
 const[id,field]=name.split(':');return settings.sounds[id]?.[field];
},applyControls(changes){
 let timerChanged=false;
 for(const[name,value]of Object.entries(changes)){
  if(name==='master')settings.master=clamp(value);
  else if(name==='timer'){settings.timer=value;timerChanged=true;}
  else{const[id,field]=name.split(':');if(settings.sounds[id]&&['enabled','level','character'].includes(field))settings.sounds[id][field]=field==='enabled'?value===true:clamp(value);}
 }
 updateUI();updateAudio();if(timerChanged){if(playing)scheduleTimer();else renderTimer();}persist([]);
}};
updateUI();renderTimer();
})();
