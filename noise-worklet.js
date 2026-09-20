/* Continuous sample synthesis. Filter and RNG states survive render quanta.
 * AudioWorkletProcessor runs on the browser audio rendering thread.
 */
class SleepNoiseProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.kind = options.processorOptions?.kind || 'white';
    this.p = new Float64Array(7);
    this.brown = 0;
    this.eventLeft = 0;
    this.eventLength = 0;
    this.eventAmp = 0;
    this.eventPhase = 0;
    this.eventHz = 0;
    this.nextEvent = 0;
    this.rate = 1;
  }
  noise(kind) {
    const w = Math.random() * 2 - 1;
    if (kind === 'pink') {
      const p = this.p;
      p[0] = .99886*p[0]+w*.0555179; p[1]=.99332*p[1]+w*.0750759;
      p[2]=.969*p[2]+w*.153852; p[3]=.8665*p[3]+w*.3104856;
      p[4]=.55*p[4]+w*.5329522; p[5]=-.7616*p[5]-w*.016898;
      const result=(p[0]+p[1]+p[2]+p[3]+p[4]+p[5]+p[6]+w*.5362)*.11;
      p[6]=w*.115926;
      return Math.max(-.72,Math.min(.72,result));
    }
    if(kind==='brown') {
      this.brown=(this.brown+.02*w)/1.02;
      return Math.max(-.72,Math.min(.72,this.brown*3.4));
    }
    return w*.62;
  }
  transient() {
    if (this.nextEvent <= 0 && this.eventLeft <= 0) {
      const rain=this.kind==='rain-drop', fire=this.kind==='fire-crackle';
      const delay=rain ? .018+Math.random()*.085 : fire ? .045+Math.random()*.65 : .075+Math.random()*.45;
      this.nextEvent=Math.max(1,Math.floor(delay*sampleRate));
      this.eventLength=Math.max(2,Math.floor((rain ? .008+Math.random()*.022 : fire ? .002+Math.random()*.016 : .022+Math.random()*.11)*sampleRate));
      this.eventAmp=rain ? .12+Math.random()*.45 : fire ? .2+Math.random()*.7 : .045+Math.random()*.2;
      this.eventLeft=this.eventLength;
      this.eventPhase=Math.random()*Math.PI*2;
      this.eventHz=450+Math.random()*1350;
    }
    if (this.nextEvent > 0) { this.nextEvent--; return 0; }
    if (this.eventLeft <= 0) return 0;
    const j=this.eventLength-this.eventLeft--;
    const envelope=Math.exp(-j/(this.eventLength*(this.kind==='stream-bubble'?.36:.18)));
    const pulse=this.kind==='stream-bubble' ? Math.sin(this.eventPhase+2*Math.PI*this.eventHz*j/sampleRate) : Math.random()*2-1;
    return pulse*this.eventAmp*envelope;
  }
  process(inputs, outputs) {
    const channel=outputs[0]?.[0];
    if(!channel)return true;
    const transient=this.kind==='rain-drop'||this.kind==='fire-crackle'||this.kind==='stream-bubble';
    for(let i=0;i<channel.length;i++)channel[i]=transient ? this.transient() : this.noise(this.kind);
    for(let c=1;c<outputs[0].length;c++)outputs[0][c].set(channel);
    return true;
  }
}
registerProcessor('sleep-noise',SleepNoiseProcessor);
