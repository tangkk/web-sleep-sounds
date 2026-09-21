/* Realtime mono generators: no precomputed loops. */
class SleepSource extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.kind = options.processorOptions?.kind || 'white';
    this.character = options.processorOptions?.character ?? 50;
    this.p = new Float64Array(7);
    this.brown = 0;
    this.next = 0;
    this.left = 0;
    this.length = 0;
    this.amp = 0;
    this.phase = 0;
    this.hz = 0;
    this.running = true;
    this.port.onmessage = event => {
      if (event.data?.type === 'stop') this.running = false;
      if (event.data?.type === 'character') this.character = Math.max(0,Math.min(100,event.data.value));
    };
  }
  noise(kind) {
    const w = Math.random()*2-1;
    if(kind === 'pink') {
      const p=this.p;
      p[0]=.99886*p[0]+w*.0555179; p[1]=.99332*p[1]+w*.0750759;
      p[2]=.969*p[2]+w*.153852; p[3]=.8665*p[3]+w*.3104856;
      p[4]=.55*p[4]+w*.5329522; p[5]=-.7616*p[5]-w*.016898;
      const value=(p[0]+p[1]+p[2]+p[3]+p[4]+p[5]+p[6]+w*.5362)*.11;
      p[6]=w*.115926;
      return Math.max(-.72,Math.min(.72,value));
    }
    if(kind === 'brown') {
      this.brown=(this.brown+.02*w)/1.02;
      return Math.max(-.72,Math.min(.72,this.brown*3.4));
    }
    return w*.62;
  }
  event() {
    const kind=this.kind, v=this.character/100;
    if(this.left<=0) {
      if(this.next-->0)return 0;
      if(kind==='rain-drop') {
        this.next=Math.floor((.22-v*.19+Math.random()*(.16-v*.10))*sampleRate);
        this.length=Math.floor((.007+Math.random()*.023)*sampleRate);
        this.amp=.11+Math.random()*.40;
      } else if(kind==='fire-crackle') {
        this.next=Math.floor((.48-v*.43+Math.random()*(.55-v*.37))*sampleRate);
        this.length=Math.floor((.002+Math.random()*.017)*sampleRate);
        this.amp=.17+Math.random()*.62;
      } else if(kind==='stream-bubble') {
        this.next=Math.floor((.27-v*.21+Math.random()*.30)*sampleRate);
        this.length=Math.floor((.025+Math.random()*.10)*sampleRate);
        this.amp=.035+Math.random()*.13;
      } else {
        // Cricket pulses: clustered high-pitched chirps with gaps.
        this.next=Math.floor((.17-v*.145+Math.random()*(.22-v*.12))*sampleRate);
        this.length=Math.floor((.018+Math.random()*.043)*sampleRate);
        this.amp=.07+Math.random()*.12;
      }
      this.left=Math.max(1,this.length);
      this.phase=Math.random()*Math.PI*2;
      this.hz=kind==='cricket' ? 2850+Math.random()*1650 : 450+Math.random()*1350;
    }
    const j=this.length-this.left--;
    const env=Math.exp(-j/(this.length*(kind==='cricket'?.62:kind==='stream-bubble'?.36:.2)));
    const value=(kind==='cricket'||kind==='stream-bubble') ? Math.sin(this.phase+Math.PI*2*this.hz*j/sampleRate) : Math.random()*2-1;
    return value*this.amp*env;
  }
  process(inputs,outputs) {
    if(!this.running)return false;
    const channel=outputs[0]?.[0];
    if(!channel)return true;
    const events=['rain-drop','fire-crackle','stream-bubble','cricket'].includes(this.kind);
    for(let i=0;i<channel.length;i++)channel[i]=events?this.event():this.noise(this.kind);
    for(let i=1;i<outputs[0].length;i++)outputs[0][i].set(channel);
    return true;
  }
}
registerProcessor('sleep-source-v2',SleepSource);
