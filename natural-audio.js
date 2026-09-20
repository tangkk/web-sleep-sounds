/* Procedural soundscape engine. No fixed looping buffers or periodic LFOs.
 * Each channel schedules fresh, overlapping stochastic blocks in Web Audio time.
 * Macro ambience uses low-pass-smoothed, bounded random targets.
 */
(() => {
  'use strict';
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const BLOCK = 14;
  const OVERLAP = 1.5;
  const STEP = BLOCK - OVERLAP;
  const configs = {
    white: { color: 'white', low: 11500, base: 0.65, variation: 0 },
    pink: { color: 'pink', low: 11500, base: 0.7, variation: 0 },
    brown: { color: 'brown', low: 2800, high: 35, base: 0.7, variation: 0 },
    rain: { color: 'white', high: 650, low: 7200, base: 0.64, variation: 0.29 },
    ocean: { color: 'pink', high: 35, low: 1050, base: 0.53, variation: 0.43 },
    wind: { color: 'pink', high: 65, low: 690, base: 0.48, variation: 0.36 },
    fire: { color: 'brown', high: 90, low: 2200, base: 0.54, variation: 0.18 },
    stream: { color: 'white', high: 190, low: 5100, base: 0.63, variation: 0.22 }
  };
  function fill(buffer, id, color) {
    const a = buffer.getChannelData(0), sr = buffer.sampleRate;
    let p0=0,p1=0,p2=0,p3=0,p4=0,p5=0,p6=0,brown=0;
    // Independent fresh broadband bed; smooth the block edges with the source gain, not sample looping.
    for (let i=0; i<a.length; i++) {
      const w=Math.random()*2-1;
      if (color==='pink') {
        p0=.99886*p0+w*.0555179; p1=.99332*p1+w*.0750759;
        p2=.969*p2+w*.153852; p3=.8665*p3+w*.3104856;
        p4=.55*p4+w*.5329522; p5=-.7616*p5-w*.016898;
        a[i]=(p0+p1+p2+p3+p4+p5+p6+w*.5362)*.075;
        p6=w*.115926;
      } else if (color==='brown') {
        brown=(brown+.02*w)/1.02;
        a[i]=brown*2.0;
      } else a[i]=w*.37;
    }
    // Inhomogeneous event arrival rates: slow fluctuations affect rain/crackle/bubbles.
    // The event train is newly drawn for every block, avoiding repeating fingerprints.
    if (id==='rain' || id==='fire' || id==='stream') {
      let t=0, rate=rand(.7,1.2);
      while(t<BLOCK) {
        rate=clamp(rate+rand(-.12,.12),.48,1.55);
        const gap=id==='rain'?rand(.018,.12):id==='fire'?rand(.06,.8):rand(.075,.48);
        t+=gap/rate;
        const start=Math.floor(t*sr);
        if(start>=a.length)break;
        const duration=id==='rain'?rand(.008,.045):id==='fire'?rand(.002,.024):rand(.022,.11);
        const n=Math.floor(duration*sr), amp=id==='rain'?rand(.13,.48):id==='fire'?rand(.15,.68):rand(.045,.20);
        const phase=rand(0,Math.PI*2), freq=rand(450,1800);
        for(let j=0;j<n && start+j<a.length;j++) {
          const envelope=Math.exp(-j/Math.max(1,n*(id==='stream'?.36:.17)));
          const event=id==='stream'?Math.sin(2*Math.PI*freq*j/sr+phase)*amp:(Math.random()*2-1)*amp;
          a[start+j]+=event*envelope;
        }
      }
    }
    // DC correction and soft peak protection; never normalize each block to an identical loudness.
    let sum=0;for(let i=0;i<a.length;i++)sum+=a[i];
    const mean=sum/a.length;
    for(let i=0;i<a.length;i++)a[i]=Math.tanh((a[i]-mean)*1.18)*.66;
    return buffer;
  }
  function makeFilter(ctx,kind,freq) {
    const node=ctx.createBiquadFilter();node.type=kind;node.frequency.value=freq;node.Q.value=.65;return node;
  }
  window.createNaturalSoundEngine = context => {
    const tracks = new Map();
    let scheduler = null;
    function schedule(track) {
      // Limit lookahead to keep generation CPU and memory bounded on mobile.
      let guard=0;
      while(track.nextStart<context.currentTime+2.8 && guard++<2) {
        const start=Math.max(track.nextStart,context.currentTime+.025);
        const buffer=fill(context.createBuffer(1,Math.ceil(context.sampleRate*BLOCK),context.sampleRate),track.id,track.cfg.color);
        const source=context.createBufferSource();source.buffer=buffer;
        const fade=context.createGain();fade.gain.setValueAtTime(0,start);
        fade.gain.linearRampToValueAtTime(1,start+OVERLAP);
        fade.gain.setValueAtTime(1,start+BLOCK-OVERLAP);
        fade.gain.linearRampToValueAtTime(0,start+BLOCK);
        source.connect(track.first).connect(fade).connect(track.texture);
        source.start(start);source.stop(start+BLOCK+.02);
        source.onended=()=>{source.disconnect();fade.disconnect();};
        track.nextStart=start+STEP;
      }
    }
    function move(track) {
      const now=context.currentTime;
      if(!track.cfg.variation)return;
      // Random, bounded targets with different time constants: bursts, gusts and swells
      // have irregular lengths instead of a sinusoid with an audible fixed period.
      const elapsed=now-track.lastMove;
      if(elapsed<track.nextDelay)return;
      track.lastMove=now;
      const spread=track.cfg.variation;
      const next=clamp(track.target+rand(-spread,spread),.23,1);
      track.target=next;
      const tau=track.id==='ocean'?rand(2.3,5.5):track.id==='wind'?rand(1.5,4):rand(1,3.4);
      track.texture.gain.setTargetAtTime(track.cfg.base*next,now,tau);
      track.nextDelay=track.id==='ocean'?rand(5,13):track.id==='wind'?rand(3,10):rand(4,16);
      if(track.movingFilter)track.movingFilter.frequency.setTargetAtTime(track.filterBase*rand(.75,1.32),now,tau*1.1);
    }
    function tick(){for(const track of tracks.values()){schedule(track);move(track);}}
    function create(id, output) {
      const cfg=configs[id];if(!cfg)throw Error(`Unknown sound: ${id}`);
      const texture=context.createGain();texture.gain.value=cfg.base*.72;
      let first=context.createGain(), last=first, movingFilter=null, filterBase=cfg.low;
      if(cfg.high){const high=makeFilter(context,'highpass',cfg.high);last.connect(high);last=high;}
      if(cfg.low){const low=makeFilter(context,'lowpass',cfg.low);last.connect(low);last=low;if(cfg.variation)movingFilter=low;}
      // The fresh source goes through filters, crossfade and then the evolving texture gain.
      // Crossfade connects from last filter to source-specific fade at scheduling time.
      // Rebuild source-specific filters so overlapping sources cannot double-connect old nodes.
      first.disconnect();
      const track={id,cfg,texture,nextStart:context.currentTime+.04,lastMove:context.currentTime,target:.72,
        nextDelay:rand(3,8),movingFilter,filterBase,
        first:null};
      // Each source needs its own chain; shared filters are connected once to a shared bus.
      const bus=context.createGain();bus.gain.value=1;
      let node=bus;
      if(cfg.high){const high=makeFilter(context,'highpass',cfg.high);node.connect(high);node=high;}
      if(cfg.low){const low=makeFilter(context,'lowpass',cfg.low);node.connect(low);node=low;track.movingFilter=low;}
      node.connect(texture);texture.connect(output);
      track.first=bus;
      tracks.set(id,track);
      schedule(track);
      if(!scheduler)scheduler=setInterval(tick,650);
      return {stop(){tracks.delete(id);if(!tracks.size&&scheduler){clearInterval(scheduler);scheduler=null;}
        texture.gain.setTargetAtTime(0,context.currentTime,.04);
        // Nodes/sources naturally end as their already scheduled blocks finish.
      }};
    }
    return {create,stop(){if(scheduler)clearInterval(scheduler);scheduler=null;tracks.clear();}};
  };
})();