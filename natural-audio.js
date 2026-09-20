/* Independent procedural tracks: only white/pink/brown are standalone noise beds.
 * Nature sounds use noise solely as a shaped component of their own events.
 * Fresh blocks overlap; no fixed audio loop or periodic LFO.
 */
(() => {
'use strict';
const rnd=(a,b)=>a+Math.random()*(b-a);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const LENGTH=14,OVERLAP=1.5,STEP=LENGTH-OVERLAP;
const types={
 white:{color:'white',hp:0,lp:11500,level:.68},
 pink:{color:'pink',hp:0,lp:11500,level:.7},
 brown:{color:'brown',hp:35,lp:2800,level:.7},
 rain:{hp:650,lp:7200,level:.70,variation:.2},
 ocean:{hp:45,lp:1400,level:.67,variation:.3},
 wind:{hp:65,lp:900,level:.62,variation:.3},
 fire:{hp:230,lp:7500,level:.75,variation:.12},
 stream:{hp:280,lp:5200,level:.68,variation:.17}
};
function bufferFor(context,id){
 const sr=context.sampleRate,length=Math.ceil(sr*LENGTH),buffer=context.createBuffer(1,length,sr),data=buffer.getChannelData(0);
 const type=types[id];
 // Brown/pink/white have their own dedicated controls and never bleed into nature tracks.
 if(type.color){
  let p0=0,p1=0,p2=0,p3=0,p4=0,p5=0,p6=0,brown=0;
  for(let i=0;i<length;i++){
   const w=Math.random()*2-1;
   if(type.color==='pink'){
    p0=.99886*p0+w*.0555179;p1=.99332*p1+w*.0750759;p2=.969*p2+w*.153852;
    p3=.8665*p3+w*.3104856;p4=.55*p4+w*.5329522;p5=-.7616*p5-w*.016898;
    data[i]=(p0+p1+p2+p3+p4+p5+p6+w*.5362)*.075;p6=w*.115926;
   }else if(type.color==='brown'){brown=(brown+.02*w)/1.02;data[i]=brown*2;}
   else data[i]=w*.37;
  }
 }else if(id==='rain'||id==='fire'||id==='stream'){
  // No continuous background layer. Each sample begins at zero; only actual
  // drops, wood snaps or water bubbles add sound to this track.
  let t=rnd(0,.1),rate=rnd(.85,1.15);
  while(t<LENGTH){
   rate=clamp(rate+rnd(-.09,.09),.55,1.5);
   t+=(id==='rain'?rnd(.012,.065):id==='fire'?rnd(.08,.75):rnd(.025,.15))/rate;
   const start=Math.floor(t*sr);if(start>=length)break;
   const duration=id==='rain'?rnd(.012,.055):id==='fire'?rnd(.003,.038):rnd(.018,.12);
   const n=Math.max(2,Math.floor(duration*sr));
   const amp=id==='rain'?rnd(.18,.5):id==='fire'?rnd(.25,.85):rnd(.07,.24);
   const hz=id==='stream'?rnd(400,1800):0,phase=rnd(0,Math.PI*2);
   for(let j=0;j<n&&start+j<length;j++){
    const env=Math.pow(Math.sin(Math.PI*(j+.5)/n),id==='fire'?1.5:1.2)*Math.exp(-2*j/n);
    const excitation=id==='stream'?Math.sin(2*Math.PI*hz*j/sr+phase):Math.random()*2-1;
    data[start+j]+=amp*excitation*env;
   }
  }
 }else if(id==='ocean'||id==='wind'){
  // Waves and gusts are finite random swells; filtered noise is audible only
  // inside each swell, rather than an always-on pink/brown noise underlay.
  const envelope=new Float32Array(length);
  let t=-rnd(0,id==='ocean'?4:2);
  while(t<LENGTH){
   const duration=id==='ocean'?rnd(4.5,10):rnd(2.5,7);
   const amp=id==='ocean'?rnd(.40,.95):rnd(.25,.85);
   const begin=Math.max(0,Math.floor(t*sr)),end=Math.min(length,Math.ceil((t+duration)*sr));
   for(let i=begin;i<end;i++){
    const p=(i/sr-t)/duration;
    // Unequal attack and decay: waves build then break; wind rises then settles.
    const peak=id==='ocean'?.38:.28;
    const shape=p<peak?Math.pow(p/peak,1.35):Math.pow(Math.max(0,(1-p)/(1-peak)),1.6);
    envelope[i]=clamp(envelope[i]+amp*shape,0,1);
   }
   t+=duration*rnd(.83,1.35)+rnd(.1,id==='ocean'?1.7:2.7);
  }
  // Colored acoustic excitation is used only for the wave/gust envelope.
  let slow=0,fast=0;
  for(let i=0;i<length;i++){
   const w=Math.random()*2-1;
   slow=slow*.985+w*.015;
   fast=fast*.65+w*.35;
   const texture=id==='ocean'?slow*3.1+fast*.16:slow*1.9+fast*.3;
   data[i]=texture*envelope[i]*.55;
  }
 }
 // Remove DC only; do not introduce another audible layer or normalize silence.
 let mean=0;for(let i=0;i<length;i++)mean+=data[i];mean/=length;
 for(let i=0;i<length;i++)data[i]=Math.tanh((data[i]-mean)*1.12)*.72;
 return buffer;
}
function filter(context,mode,hz){const node=context.createBiquadFilter();node.type=mode;node.frequency.value=hz;node.Q.value=.65;return node;}
window.createNaturalSoundEngine=context=>{
 const tracks=new Map();let scheduler=null;
 function schedule(track){
  let iterations=0;
  while(track.nextStart<context.currentTime+2.8&&iterations++<2){
   const start=Math.max(track.nextStart,context.currentTime+.025);
   const source=context.createBufferSource();source.buffer=bufferFor(context,track.id);
   const fade=context.createGain();fade.gain.setValueAtTime(0,start);
   fade.gain.linearRampToValueAtTime(1,start+OVERLAP);
   fade.gain.setValueAtTime(1,start+LENGTH-OVERLAP);
   fade.gain.linearRampToValueAtTime(0,start+LENGTH);
   source.connect(fade);fade.connect(track.bus);
   source.start(start);source.stop(start+LENGTH+.02);
   source.onended=()=>{source.disconnect();fade.disconnect();};
   track.nextStart=start+STEP;
  }
 }
 function move(track){
  const now=context.currentTime,amount=track.type.variation||0;
  if(!amount||now-track.lastMove<track.nextDelay)return;
  track.lastMove=now;track.target=clamp(track.target+rnd(-amount,amount),.5,1);
  const tau=track.id==='ocean'?rnd(2.5,5):track.id==='wind'?rnd(1.5,4):rnd(1.3,3);
  track.texture.gain.setTargetAtTime(track.type.level*track.target,now,tau);
  track.nextDelay=track.id==='ocean'?rnd(5,13):track.id==='wind'?rnd(3,10):rnd(4,16);
  if(track.low)track.low.frequency.setTargetAtTime(track.type.lp*rnd(.82,1.2),now,tau);
 }
 function tick(){for(const track of tracks.values()){schedule(track);move(track);}}
 function create(id,output){
  const type=types[id];if(!type)throw Error(`Unknown sound ${id}`);
  const bus=context.createGain(),texture=context.createGain();texture.gain.value=type.level*.75;
  let node=bus,low=null;
  if(type.hp){node.connect(filter(context,'highpass',type.hp));node=node.connectionsPlaceholder||node;}
  // Wire filters explicitly; do not connect any shared noise source to this bus.
  bus.disconnect();node=bus;
  if(type.hp){const high=filter(context,'highpass',type.hp);node.connect(high);node=high;}
  if(type.lp){low=filter(context,'lowpass',type.lp);node.connect(low);node=low;}
  node.connect(texture);texture.connect(output);
  const track={id,type,bus,texture,low,nextStart:context.currentTime+.04,lastMove:context.currentTime,nextDelay:rnd(3,8),target:.75};
  tracks.set(id,track);schedule(track);
  if(!scheduler)scheduler=setInterval(tick,650);
  return {stop(){tracks.delete(id);texture.gain.setTargetAtTime(0,context.currentTime,.04);if(!tracks.size&&scheduler){clearInterval(scheduler);scheduler=null;}}};
 }
 return {create,stop(){if(scheduler)clearInterval(scheduler);scheduler=null;tracks.clear();}};
};
})();