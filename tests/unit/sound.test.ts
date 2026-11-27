import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface ScheduledRamp {
  kind: 'set' | 'linear' | 'exp';
  value: number;
  time: number;
}

class FakeAudioParam {
  value = 0;
  readonly events: ScheduledRamp[] = [];

  setValueAtTime(value: number, time: number): void {
    this.value = value;
    this.events.push({ kind: 'set', value, time });
  }

  linearRampToValueAtTime(value: number, time: number): void {
    this.value = value;
    this.events.push({ kind: 'linear', value, time });
  }

  exponentialRampToValueAtTime(value: number, time: number): void {
    this.value = value;
    this.events.push({ kind: 'exp', value, time });
  }
}

class FakeNode {
  readonly connections: FakeNode[] = [];
  disconnected = false;

  connect(dest: FakeNode): FakeNode {
    this.connections.push(dest);
    return dest;
  }

  disconnect(): void {
    this.disconnected = true;
  }
}

class FakeGainNode extends FakeNode {
  readonly gain = new FakeAudioParam();
}

class FakeOscillatorNode extends FakeNode {
  type: OscillatorType = 'sine';
  readonly frequency = new FakeAudioParam();
  startedAt: number | null = null;
  stoppedAt: number | null = null;
  onended: (() => void) | null = null;

  start(when = 0): void {
    this.startedAt = when;
  }

  stop(when = 0): void {
    this.stoppedAt = when;
  }
}

class FakeBiquadFilterNode extends FakeNode {
  type: BiquadFilterType = 'lowpass';
  readonly frequency = new FakeAudioParam();
  readonly Q = new FakeAudioParam();
}

class FakeAudioBuffer {
  readonly numberOfChannels: number;
  readonly length: number;
  readonly sampleRate: number;
  private readonly channels: Float32Array[];

  constructor(numberOfChannels: number, length: number, sampleRate: number) {
    this.numberOfChannels = numberOfChannels;
    this.length = length;
    this.sampleRate = sampleRate;
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }

  getChannelData(channel: number): Float32Array {
    return this.channels[channel];
  }
}

class FakeAudioBufferSourceNode extends FakeNode {
  buffer: FakeAudioBuffer | null = null;
  loop = false;
  startedArgs: [number, number?] | null = null;
  stoppedAt: number | null = null;
  onended: (() => void) | null = null;

  start(when = 0, offset?: number): void {
    this.startedArgs = offset === undefined ? [when] : [when, offset];
  }

  stop(when = 0): void {
    this.stoppedAt = when;
  }
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  static nextInitialState: AudioContextState = 'suspended';
  static resumeBehavior: 'resolve' | 'reject' = 'resolve';

  state: AudioContextState;
  currentTime = 0;
  sampleRate = 48000;
  readonly destination = new FakeNode();
  readonly gains: FakeGainNode[] = [];
  readonly oscillators: FakeOscillatorNode[] = [];
  readonly filters: FakeBiquadFilterNode[] = [];
  readonly bufferSources: FakeAudioBufferSourceNode[] = [];
  readonly buffers: FakeAudioBuffer[] = [];
  resumeCalls = 0;

  constructor() {
    this.state = FakeAudioContext.nextInitialState;
    FakeAudioContext.instances.push(this);
  }

  resume(): Promise<void> {
    this.resumeCalls += 1;
    if (FakeAudioContext.resumeBehavior === 'reject') {
      return Promise.reject(new Error('NotAllowedError'));
    }
    this.state = 'running';
    return Promise.resolve();
  }

  createGain(): FakeGainNode {
    const g = new FakeGainNode();
    this.gains.push(g);
    return g;
  }

  createOscillator(): FakeOscillatorNode {
    const osc = new FakeOscillatorNode();
    this.oscillators.push(osc);
    return osc;
  }

  createBiquadFilter(): FakeBiquadFilterNode {
    const filter = new FakeBiquadFilterNode();
    this.filters.push(filter);
    return filter;
  }

  createBuffer(channels: number, length: number, sampleRate: number): FakeAudioBuffer {
    const buf = new FakeAudioBuffer(channels, length, sampleRate);
    this.buffers.push(buf);
    return buf;
  }

  createBufferSource(): FakeAudioBufferSourceNode {
    const src = new FakeAudioBufferSourceNode();
    this.bufferSources.push(src);
    return src;
  }
}

describe('sound synthesis and gates', () => {
  const globalWithAudio = globalThis as unknown as {
    AudioContext?: unknown;
    webkitAudioContext?: unknown;
  };
  let origAudioContext: unknown;
  let origWebkitAudioContext: unknown;

  beforeEach(() => {
    vi.resetModules();
    origAudioContext = globalWithAudio.AudioContext;
    origWebkitAudioContext = globalWithAudio.webkitAudioContext;
    FakeAudioContext.instances = [];
    FakeAudioContext.nextInitialState = 'suspended';
    FakeAudioContext.resumeBehavior = 'resolve';
    globalWithAudio.AudioContext = FakeAudioContext;
    globalWithAudio.webkitAudioContext = undefined;
  });

  afterEach(() => {
    globalWithAudio.AudioContext = origAudioContext;
    globalWithAudio.webkitAudioContext = origWebkitAudioContext;
  });

  it('creates one lazy context across repeated unlocks, sets master gain 0.30, and resumes when suspended', async () => {
    const sound = await import('../../src/game/sound.ts');

    expect(sound.getSoundState()).toEqual({ soundUnlocked: false, soundMuted: false });
    sound.playSound('swing');
    expect(FakeAudioContext.instances).toHaveLength(0);

    sound.unlockSound();
    expect(FakeAudioContext.instances).toHaveLength(1);
    const ctx = FakeAudioContext.instances[0];
    expect(ctx.resumeCalls).toBe(1);
    expect(ctx.gains).toHaveLength(1);
    expect(ctx.gains[0].gain.value).toBeCloseTo(0.3, 6);
    expect(ctx.gains[0].connections).toContain(ctx.destination);
    expect(ctx.oscillators).toHaveLength(0);
    expect(ctx.bufferSources).toHaveLength(0);
    expect(sound.getSoundState()).toEqual({ soundUnlocked: true, soundMuted: false });

    // Second unlock reuses same context and does not resume again when already running
    sound.unlockSound();
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(ctx.resumeCalls).toBe(1);
  });

  it('does not initialize audio when muting before unlock and skips scheduling while muted or non-running', async () => {
    const sound = await import('../../src/game/sound.ts');

    sound.setSoundMuted(true);
    expect(FakeAudioContext.instances).toHaveLength(0);
    expect(sound.getSoundState()).toEqual({ soundUnlocked: false, soundMuted: true });

    FakeAudioContext.nextInitialState = 'suspended';
    FakeAudioContext.resumeBehavior = 'reject';
    sound.unlockSound();
    await Promise.resolve();
    const ctx = FakeAudioContext.instances[0];
    expect(ctx.state).toBe('suspended');
    expect(ctx.gains[0].gain.value).toBe(0);
    expect(sound.getSoundState()).toEqual({ soundUnlocked: false, soundMuted: true });

    // Non-running & muted calls schedule nothing
    sound.playSound('hit');
    sound.playSound('kill');
    expect(ctx.oscillators).toHaveLength(0);
    expect(ctx.bufferSources).toHaveLength(0);

    // Once running but muted, still skips scheduling and consumes no throttle window
    ctx.state = 'running';
    ctx.currentTime = 1.0;
    sound.playSound('hit');
    expect(ctx.oscillators).toHaveLength(0);

    sound.setSoundMuted(false);
    expect(ctx.gains[0].gain.value).toBeCloseTo(0.3, 6);
    sound.playSound('hit');
    expect(ctx.oscillators).toHaveLength(1);
  });

  it('gates hit and kill independently at 119ms vs 120ms', async () => {
    const sound = await import('../../src/game/sound.ts');
    sound.unlockSound();
    const ctx = FakeAudioContext.instances[0];

    ctx.currentTime = 0.18;
    sound.playSound('hit');
    expect(ctx.oscillators).toHaveLength(1);

    // Independent kill cue is eligible immediately at the same timestamp
    sound.playSound('kill');
    expect(ctx.oscillators).toHaveLength(2);

    // 119 ms later -> both hit and kill blocked
    ctx.currentTime = 0.18 + 0.119;
    sound.playSound('hit');
    sound.playSound('kill');
    expect(ctx.oscillators).toHaveLength(2);

    // 120 ms later -> both eligible again (guards IEEE-754 0.30 - 0.18 drift)
    ctx.currentTime = 0.3;
    sound.playSound('hit');
    sound.playSound('kill');
    expect(ctx.oscillators).toHaveLength(4);
  });

  it('reuses a single mono noise buffer of ceil(sampleRate * 0.4) samples in [-1, 1) and disconnects onended', async () => {
    const sound = await import('../../src/game/sound.ts');
    sound.unlockSound();
    const ctx = FakeAudioContext.instances[0];
    ctx.sampleRate = 44100;

    // levelUp uses no noise, so buffer is not created yet
    ctx.currentTime = 1.0;
    sound.playSound('levelUp');
    expect(ctx.buffers).toHaveLength(0);
    expect(ctx.oscillators).toHaveLength(3);
    const expectedStarts = [1.0, 1.07, 1.14];
    const expectedStops = [1.105, 1.175, 1.245];
    ctx.oscillators.forEach((o, i) => {
      expect(o.startedAt).toBeCloseTo(expectedStarts[i], 6);
      expect(o.stoppedAt).toBeCloseTo(expectedStops[i], 6);
    });

    // First noise cue allocates one mono buffer
    ctx.currentTime = 2.0;
    sound.playSound('swing');
    expect(ctx.buffers).toHaveLength(1);
    const buf = ctx.buffers[0];
    expect(buf.numberOfChannels).toBe(1);
    expect(buf.length).toBe(Math.ceil(44100 * 0.4));
    const samples = buf.getChannelData(0);
    for (let i = 0; i < samples.length; i += 1) {
      expect(samples[i]).toBeGreaterThanOrEqual(-1);
      expect(samples[i]).toBeLessThan(1);
    }

    // Second noise cue reuses the exact same buffer with loop=false and offset 0
    ctx.currentTime = 3.0;
    sound.playSound('bossEntrance');
    expect(ctx.buffers).toHaveLength(1);
    expect(ctx.bufferSources).toHaveLength(2);
    expect(ctx.bufferSources[0].buffer).toBe(buf);
    expect(ctx.bufferSources[1].buffer).toBe(buf);
    expect(ctx.bufferSources[0].loop).toBe(false);
    expect(ctx.bufferSources[1].loop).toBe(false);
    expect(ctx.bufferSources[0].startedArgs).toEqual([2.0, 0]);
    expect(ctx.bufferSources[0].stoppedAt).toBeCloseTo(2.095, 6);
    expect(ctx.bufferSources[1].startedArgs).toEqual([3.0, 0]);
    expect(ctx.bufferSources[1].stoppedAt).toBeCloseTo(3.38, 6);

    // Check swing oscillator stop time and onended disconnect cleanup
    const swingOsc = ctx.oscillators[3];
    expect(swingOsc.stoppedAt).toBeCloseTo(2.08, 6);
    swingOsc.onended?.();
    expect(swingOsc.disconnected).toBe(true);
    ctx.bufferSources[0].onended?.();
    expect(ctx.bufferSources[0].disconnected).toBe(true);
  });

  it('fails silently when AudioContext is unavailable', async () => {
    globalWithAudio.AudioContext = undefined;
    globalWithAudio.webkitAudioContext = undefined;
    const sound = await import('../../src/game/sound.ts');

    expect(() => sound.unlockSound()).not.toThrow();
    expect(() => sound.playSound('swing')).not.toThrow();
    expect(sound.getSoundState()).toEqual({ soundUnlocked: false, soundMuted: false });
  });
});
