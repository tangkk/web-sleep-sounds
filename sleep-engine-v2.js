/* Realtime-only Web Audio graph. No buffers or loop mode. */
(() => {
'use strict';
const IDS=['white','pink','brown','rain','ocean','wind','fire','embers','stream','fan','night'];
window.createSleepEngine=(context,{output})=>{
 if(!output)throw Error('缺少声音输出节点');
 const channels=new Map();
 const smooth=(param,value)=>param.setTargetAtTime(value,context.currentTime,.055);
 function create(id,character){
  const record={sources:[],nodes:[],oscillators:[],filters:[],gain:null,character,apply:null};
  const gain=context.createGain();gain.gain.value=0;gain.connect(output);record.gain=gain;record.nodes.push(gain);
  function source(kind,processorCharacter=50){
   const node=new AudioWorkletNode(context,'sleep-source-v2',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[1],processorOptions:{kind,character:processorCharacter}});
   record.sources.push(node);return node;
  }
  function filter(type,freq,q=.7){const n=context.createBiquadFilter();n.type=type;n.frequency.value=freq;n.Q.value=q;record.nodes.push(n);return n;}
  function route(kind,effects=[],processorCharacter=50){let n=source(kind,processorCharacter);for(const next of effects){n.connect(next);n=next;}n.connect(gain);return n;}
  function modulation(target,rate,depth,offset){const osc=context.createOscillator(),scale=context.createGain();osc.type='sine';osc.frequency.value=rate;scale.gain.value=depth;target.gain.value=offset;osc.connect(scale).connect(target.gain);osc.start();record.oscillators.push(osc);record.nodes.push(osc,scale);return osc;}
  const norm=()=>record.character/100;
  if(id==='white'||id==='pink'||id==='brown'){
   const tone=filter('lowpass',6000);
   route(id,[tone]);
   record.apply=()=>smooth(tone.frequency, id==='brown'?280+norm()*2800:id==='pink'?550+norm()*12500:900+norm()*18000);
  } else if(id==='rain'){
   const tone=filter('highpass',800),top=filter('lowpass',8200);
   route('white',[tone,top]);route('rain-drop',[filter('bandpass',2100,.5)],character);
   record.apply=()=>record.sources[1].port.postMessage({type:'character',value:record.character});
  } else if(id==='ocean'){
   const swell=context.createGain();record.nodes.push(swell);
   route('pink',[filter('lowpass',800),swell]);
   const lfo=modulation(swell,.085,.43,.48);
   record.apply=()=>smooth(lfo.frequency,.035+norm()*.18);
  } else if(id==='wind'){
   const gust=context.createGain();record.nodes.push(gust);
   route('pink',[filter('lowpass',440),gust]);
   const lfo=modulation(gust,.13,.26,.48);
   record.apply=()=>smooth(lfo.frequency,.04+norm()*.32);
  } else if(id==='fire'){
   route('fire-crackle',[filter('highpass',750)],character);
   record.apply=()=>record.sources[0].port.postMessage({type:'character',value:record.character});
  } else if(id==='embers'){
   const warmth=filter('lowpass',630);
   route('brown',[filter('highpass',110),warmth]);
   record.apply=()=>smooth(warmth.frequency,260+norm()*1200);
  } else if(id==='stream'){
   const ripple=context.createGain();record.nodes.push(ripple);
   route('white',[filter('highpass',320),filter('lowpass',3200),ripple]);
   modulation(ripple,.23,.14,.54);
   route('pink',[filter('bandpass',1100,.42)]);
   route('stream-bubble',[filter('bandpass',1200,.4)],character);
   record.apply=()=>record.sources[2].port.postMessage({type:'character',value:record.character});
  } else if(id==='fan'){
   const tone=filter('lowpass',1500);
   route('white',[filter('highpass',115),tone]);
   record.apply=()=>smooth(tone.frequency,450+norm()*4800);
  } else if(id==='night'){
   const mellow=filter('lowpass',7000);
   route('cricket',[mellow],character);
   record.apply=()=>record.sources[0].port.postMessage({type:'character',value:record.character});
  } else throw Error('未知声音：'+id);
  record.apply();
  channels.set(id,record);
  return record;
 }
 function ensure(id,character=50){
  if(!IDS.includes(id))throw Error('未知声音：'+id);
  if(!channels.has(id))create(id,character);
  const record=channels.get(id);
  if(record.character!==character){record.character=character;record.apply();}
  return record.gain;
 }
 function remove(id){
  const record=channels.get(id);if(!record)return;
  channels.delete(id);
  for(const oscillator of record.oscillators){try{oscillator.stop()}catch{}}
  for(const node of record.sources){try{node.port.postMessage({type:'stop'});node.disconnect()}catch{}}
  for(const node of record.nodes){try{node.disconnect()}catch{}}
 }
 function dispose(){for(const id of [...channels.keys()])remove(id);}
 return {ensure,has:id=>channels.has(id),remove,dispose};
};
})();
