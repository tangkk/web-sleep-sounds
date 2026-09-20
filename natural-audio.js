/* Fresh stochastic audio blocks with overlapped crossfades and slow random ambience. */
(() => {
'use strict';
const random=(lo,hi)=>lo+Math.random()*(hi-lo);
const bounded=(x,lo,hi)=>Math.max(lo,Math.min(hi,x));
const LENGTH=14,OVERLAP=1.5,STEP=LENGTH-OVERLAP;
const types={
 white:['white',null,11500,.68,0],pink:['pink',null,11500,.7,0],brown:['brown',35,2800,.7,0],
 rain:['white',650,7200,.66,.25],ocean:['pink',35,1050,.58,.42],wind:['pink',65,690,.52,.34],
 fire:['brown',90,2200,.58,.16],stream:['white',190,5100,.64,.21]
};
function generate(context,id,color){
 const buffer=context.createBuffer(1,Math.ceil(context.sampleRate*LENGTH),context.sampleRate);
 const data=buffer.getChannelData(0),sr=context.sampleRate;
 let p0=0,p1=0,p2=0,p3=0,p4=0,p5=0,p6=0,brown=0;
 for(let i=0;i<data.length;i++){
  const w=Math.random()*2-1;
  if(color==='pink'){
   p0=.99886*p0+w*.0555179;p1=.99332*p1+w*.0750759;p2=.969*p2+w*.153852;
   p3=.8665*p3+w*.3104856;p4=.55*p4+w*.5329522;p5=-.7616*p5-w*.016898;
   data[i]=(p0+p1+p2+p3+p4+p5+p6+w*.5362)*.075;p6=w*.115926;
  }else if(color==='brown'){brown=(brown+.02*w)/1.02;data[i]=brown*2;}else data[i]=w*.37;
 }
 // Renew rain droplets, fire crackles and stream bubbles with every generated block.
 if(id==='rain'||id==='fire'||id==='stream'){
  let t=0,rate=random(.8,1.2);
  while(t<LENGTH){
   rate=bounded(rate+random(-.11,.11),.48,1.6);
   t+=(id==='rain'?random(.018,.12):id==='fire'?random(.06,.8):random(.075,.48))/rate;
   const begin=Math.floor(t*sr);if(begin>=data.length)break;
   const duration=id==='rain'?random(.008,.045):id==='fire'?random(.002,.024):random(.022,.11);
   const count=Math.floor(duration*sr),amp=id==='rain'?random(.13,.48):id==='fire'?random(.15,.68):random(.045,.20);
   const phase=random(0,Math.PI*2),frequency=random(450,1800);
   for(let j=0;j<count&&begin+j<data.length;j++){
    const envelope=Math.exp(-j/Math.max(1,count*(id==='stream'?.36:.17)));
    const pulse=id==='stream'?Math.sin(2*Math.PI*frequency*j/sr+phase)*amp:(Math.random()*2-1)*amp;
    data[begin+j]+=pulse*envelope;
   }
  }
 }
 let sum=0;for(let i=0;i<data.length;i++)sum+=data[i];const dc=sum/data.length;
 for(let i=0;i<data.length;i++)data[i]=Math.tanh((data[i]-dc)*1.18)*.66;
 return buffer;
}
function filter(context,mode,hz){const node=context.createBiquadFilter();node.type=mode;node.frequency.value=hz;node.Q.value=.65;return node;}
window.createNaturalSoundEngine=context=>{
 const tracks=new Map();let scheduler=null;
 function schedule(track){
  let iterations=0;
  while(track.nextStart<context.currentTime+2.8&&iterations++<2){
   const start=Math.max(track.nextStart,context.currentTime+.025);
   const source=context.createBufferSource();source.buffer=generate(context,track.id,track.type[0]);
   const envelope=context.createGain();envelope.gain.setValueAtTime(0,start);
   envelope.gain.linearRampToValueAtTime(1,start+OVERLAP);
   envelope.gain.setValueAtTime(1,start+LENGTH-OVERLAP);
   envelope.gain.linearRampToValueAtTime(0,start+LENGTH);
   source.connect(envelope);envelope.connect(track.bus);
   source.start(start);source.stop(start+LENGTH+.02);
   source.onended=()=>{source.disconnect();envelope.disconnect();};
   track.nextStart=start+STEP;
  }
 }
 function move(track){
  const now=context.currentTime,variation=track.type[4];
  if(!variation||now-track.lastMove<track.nextDelay)return;
  track.lastMove=now;track.target=bounded(track.target+random(-variation,variation),.24,1);
  const tau=track.id==='ocean'?random(2.3,5.5):track.id==='wind'?random(1.5,4):random(1,3.4);
  track.texture.gain.setTargetAtTime(track.type[3]*track.target,now,tau);
  track.nextDelay=track.id==='ocean'?random(5,13):track.id==='wind'?random(3,10):random(4,16);
  if(track.low)track.low.frequency.setTargetAtTime(track.type[2]*random(.76,1.3),now,tau*1.1);
 }
 function tick(){for(const track of tracks.values()){schedule(track);move(track);}}
 function create(id,output){
  const type=types[id];if(!type)throw Error(`Unknown sound ${id}`);
  const bus=context.createGain(),texture=context.createGain();texture.gain.value=type[3]*.72;
  let node=bus,low=null;
  if(type[1]){const high=filter(context,'highpass',type[1]);node.connect(high);node=high;}
  if(type[2]){low=filter(context,'lowpass',type[2]);node.connect(low);node=low;}
  node.connect(texture);texture.connect(output);
  const track={id,type,bus,texture,low,nextStart:context.currentTime+.04,lastMove:context.currentTime,nextDelay:random(3,8),target:.72};
  tracks.set(id,track);schedule(track);
  if(!scheduler)scheduler=setInterval(tick,650);
  return {stop(){tracks.delete(id);texture.gain.setTargetAtTime(0,context.currentTime,.04);if(!tracks.size&&scheduler){clearInterval(scheduler);scheduler=null;}}};
 }
 return {create,stop(){if(scheduler)clearInterval(scheduler);scheduler=null;tracks.clear();}};
};
})();