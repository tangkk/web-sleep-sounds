/* Two rendering modes, one sound design. Buffers are lazily generated per enabled track.
 * Each channel owns its noise sources and gain. No noise track is enabled implicitly.
 */
(() => {
'use strict';
const IDS=['white','pink','brown','rain','ocean','wind','fire','stream'];
const DEFAULT_SECONDS=30;
window.createSleepEngine=(context,{mode='loop',seconds=DEFAULT_SECONDS,output})=>{
  if(!IDS.includes('white')||!output)throw Error('无效的音频引擎配置');
  if(mode!=='loop'&&mode!=='realtime')throw Error('未知的生成模式');
  if(mode==='loop'&&![12,30,60].includes(seconds))throw Error('无效的循环长度');
  const cache=new Map(),channels=new Map();
  const sampleRate=context.sampleRate;
  function generateNoise(kind){
    if(cache.has(kind))return cache.get(kind);
    const length=Math.ceil(sampleRate*seconds),buffer=context.createBuffer(1,length,sampleRate),data=buffer.getChannelData(0);
    let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0,last=0;
    for(let i=0;i<length;i++){
      const w=Math.random()*2-1;
      if(kind==='pink'){
        b0=.99886*b0+w*.0555179;b1=.99332*b1+w*.0750759;b2=.969*b2+w*.153852;
        b3=.8665*b3+w*.3104856;b4=.55*b4+w*.5329522;b5=-.7616*b5-w*.016898;
        data[i]=(b0+b1+b2+b3+b4+b5+b6+w*.5362)*.11;b6=w*.115926;
      }else if(kind==='brown'){last=(last+.02*w)/1.02;data[i]=last*3.4;}
      else data[i]=w*.62;
    }
    let sum=0,peak=0;
    for(let i=0;i<length;i++)sum+=data[i];
    const mean=sum/length;
    for(let i=0;i<length;i++){data[i]-=mean;peak=Math.max(peak,Math.abs(data[i]));}
    const scale=.72/Math.max(peak,.72);
    for(let i=0;i<length;i++)data[i]*=scale;
    // Make the sample at the loop seam continuous without periodic gain pumping.
    const seam=Math.min(Math.floor(sampleRate*.025),Math.floor(length/8));
    for(let i=0;i<seam;i++){const t=(i+1)/seam;data[length-seam+i]=data[length-seam+i]*(1-t)+data[i]*t;}
    cache.set(kind,buffer);return buffer;
  }
  function generateEvents(kind){
    const length=Math.ceil(sampleRate*seconds),buffer=context.createBuffer(1,length,sampleRate),data=buffer.getChannelData(0);
    if(kind==='rain-drop'){
      for(let t=0;t<seconds;t+=.018+Math.random()*.085){const start=Math.floor(t*sampleRate),duration=Math.floor((.008+Math.random()*.022)*sampleRate),amp=.12+Math.random()*.45;for(let j=0;j<duration&&start+j<length;j++)data[start+j]+=(Math.random()*2-1)*amp*Math.exp(-j/(duration*.18));}
    }else if(kind==='fire-crackle'){
      const n=Math.round(170*seconds/12);
      for(let i=0;i<n;i++){const start=Math.floor(Math.random()*length),duration=Math.floor((.002+Math.random()*.016)*sampleRate),amp=.2+Math.random()*.7;for(let j=0;j<duration&&start+j<length;j++)data[start+j]+=(Math.random()*2-1)*amp*Math.exp(-j/(duration*.2));}
    }else if(kind==='stream-bubble'){
      for(let t=0;t<seconds;t+=.09+Math.random()*.3){const start=Math.floor(t*sampleRate),duration=Math.floor((.022+Math.random()*.08)*sampleRate),amp=.045+Math.random()*.16,hz=450+Math.random()*1350;for(let j=0;j<duration&&start+j<length;j++)data[start+j]+=Math.sin(2*Math.PI*hz*j/sampleRate)*amp*Math.exp(-j/(duration*.3));}
    }
    const seam=Math.min(Math.floor(sampleRate*.012),Math.floor(length/8));
    for(let i=0;i<seam;i++){const t=(i+1)/seam;data[length-seam+i]=data[length-seam+i]*(1-t)+data[i]*t;}
    return buffer;
  }
  function source(kind,record){
    let node;
    if(mode==='realtime'){
      node=new AudioWorkletNode(context,'sleep-noise',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[1],processorOptions:{kind}});
    }else{
      node=context.createBufferSource();node.buffer=kind==='white'||kind==='pink'||kind==='brown'?generateNoise(kind):generateEvents(kind);node.loop=true;node.start();
    }
    record.sources.push(node);return node;
  }
  function filter(type,frequency,q=.7){const node=context.createBiquadFilter();node.type=type;node.frequency.value=frequency;node.Q.value=q;return node;}
  function lfo(gain,rate,depth,offset,record){const osc=context.createOscillator(),scale=context.createGain();osc.type='sine';osc.frequency.value=rate;scale.gain.value=depth;gain.gain.value=offset;osc.connect(scale).connect(gain.gain);osc.start();record.oscillators.push(osc);record.nodes.push(osc,scale);}
  function ensure(id){
    if(channels.has(id))return channels.get(id).volume;
    if(!IDS.includes(id))throw Error('未知声音：'+id);
    const volume=context.createGain();volume.gain.value=0;volume.connect(output);
    const record={volume,sources:[],oscillators:[],nodes:[volume]};
    const route=(kind,effects=[])=>{
      let node=source(kind,record);
      for(const next of effects){node.connect(next);node=next;record.nodes.push(next);}
      node.connect(volume);
    };
    if(id==='white'||id==='pink'||id==='brown')route(id);
    if(id==='rain'){route('white',[filter('highpass',800),filter('lowpass',8200)]);route('rain-drop',[filter('bandpass',2100,.5)]);}
    if(id==='ocean'){const swell=context.createGain();route('pink',[filter('lowpass',800),swell]);lfo(swell,.085,.43,.48,record);}
    if(id==='wind'){const gust=context.createGain();route('pink',[filter('lowpass',440),gust]);lfo(gust,.13,.26,.48,record);}
    if(id==='fire'){route('brown',[filter('highpass',110),filter('lowpass',630)]);route('fire-crackle',[filter('highpass',750)]);}
    if(id==='stream'){const ripple=context.createGain();route('white',[filter('highpass',320),filter('lowpass',3200),ripple]);lfo(ripple,.23,.14,.54,record);route('pink',[filter('bandpass',1100,.42)]);}
    channels.set(id,record);return volume;
  }
  function dispose(){
    for(const record of channels.values()){
      for(const osc of record.oscillators){try{osc.stop();}catch{}}
      for(const node of record.sources){if(mode==='loop'){try{node.stop();}catch{}}else{node.port.postMessage({stop:true});}try{node.disconnect();}catch{}}
      for(const node of record.nodes){try{node.disconnect();}catch{}}
    }
    channels.clear();cache.clear();
  }
  return {ensure,has:id=>channels.has(id),dispose};
};
})();
