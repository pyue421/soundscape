import { scales, styleProfiles } from "./config.js";
import { clamp, midiToHz, smooth } from "./utils.js";

export class AudioEngine {
  constructor({ styleSelect, reactivityControl, focusControl, visualizer }) {
    this.styleSelect = styleSelect;
    this.reactivityControl = reactivityControl;
    this.focusControl = focusControl;
    this.visualizer = visualizer;

    this.mediaEl = null;
    this.audioCtx = null;
    this.sourceNode = null;
    this.masterMix = null;
    this.mediaGain = null;
    this.analysisGain = null;
    this.analysisAnalyser = null;
    this.bassFilter = null;
    this.midFilter = null;
    this.trebleFilter = null;
    this.bassAnalyser = null;
    this.midAnalyser = null;
    this.trebleAnalyser = null;

    this.analysisData = this.createInitialAnalysisData();
    this.waveformData = null;

    this.beatTimes = [];
    this.bpmSmoothing = 100;
    this.beatLockoutUntil = 0;
    this.lastTickTime = 0;
    this.stepIndex = 0;
    this.engineRunning = false;
    this.rafId = null;

    this.mainLoop = this.mainLoop.bind(this);
  }

  async setMedia(mediaEl) {
    await this.close();
    this.mediaEl = mediaEl;
    this.resetState();
  }

  async play() {
    if (!this.mediaEl) {
      return;
    }

    if (!this.audioCtx) {
      this.setupAudioGraph();
    }

    await this.audioCtx.resume();
    if (this.mediaEl.ended) {
      this.mediaEl.currentTime = 0;
    }
    await this.mediaEl.play();
    this.startMainLoop();
  }

  pause() {
    if (!this.mediaEl) {
      return;
    }
    this.mediaEl.pause();
    this.stopLoop();
  }

  stopLoop() {
    this.engineRunning = false;
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.visualizer.setActive(false);
  }

  seekBy(seconds) {
    if (!this.mediaEl || !Number.isFinite(this.mediaEl.duration)) {
      return;
    }
    const nextTime = clamp(this.mediaEl.currentTime + seconds, 0, this.mediaEl.duration);
    this.mediaEl.currentTime = nextTime;
  }

  async close() {
    this.stopLoop();
    if (this.audioCtx) {
      await this.audioCtx.close();
    }

    this.audioCtx = null;
    this.sourceNode = null;
    this.masterMix = null;
    this.mediaGain = null;
    this.analysisGain = null;
    this.analysisAnalyser = null;
    this.bassFilter = null;
    this.midFilter = null;
    this.trebleFilter = null;
    this.bassAnalyser = null;
    this.midAnalyser = null;
    this.trebleAnalyser = null;
    this.waveformData = null;
  }

  resetState() {
    this.analysisData = this.createInitialAnalysisData();
    this.beatTimes = [];
    this.bpmSmoothing = 100;
    this.beatLockoutUntil = 0;
    this.lastTickTime = 0;
    this.stepIndex = 0;
  }

  createInitialAnalysisData() {
    return {
      rms: 0,
      bass: 0,
      mid: 0,
      treble: 0,
      bpm: 100
    };
  }

  setupAudioGraph() {
    this.audioCtx = new window.AudioContext();
    this.sourceNode = this.audioCtx.createMediaElementSource(this.mediaEl);

    this.mediaGain = this.audioCtx.createGain();
    this.mediaGain.gain.value = 0.3;

    this.analysisGain = this.audioCtx.createGain();
    this.analysisGain.gain.value = 1;

    this.masterMix = this.audioCtx.createGain();
    this.masterMix.gain.value = 1.8;

    this.analysisAnalyser = this.audioCtx.createAnalyser();
    this.analysisAnalyser.fftSize = 2048;
    this.waveformData = new Float32Array(this.analysisAnalyser.fftSize);

    this.bassFilter = this.audioCtx.createBiquadFilter();
    this.bassFilter.type = "lowpass";
    this.bassFilter.frequency.value = 200;

    this.midFilter = this.audioCtx.createBiquadFilter();
    this.midFilter.type = "bandpass";
    this.midFilter.frequency.value = 1000;
    this.midFilter.Q.value = 0.8;

    this.trebleFilter = this.audioCtx.createBiquadFilter();
    this.trebleFilter.type = "highpass";
    this.trebleFilter.frequency.value = 2500;

    this.bassAnalyser = this.audioCtx.createAnalyser();
    this.midAnalyser = this.audioCtx.createAnalyser();
    this.trebleAnalyser = this.audioCtx.createAnalyser();
    this.bassAnalyser.fftSize = 512;
    this.midAnalyser.fftSize = 512;
    this.trebleAnalyser.fftSize = 512;

    // Original media audio path.
    this.sourceNode.connect(this.mediaGain);
    this.mediaGain.connect(this.audioCtx.destination);

    // Generated accompaniment path.
    this.masterMix.connect(this.audioCtx.destination);

    // Analysis path (not audible).
    this.sourceNode.connect(this.analysisGain);
    this.analysisGain.connect(this.analysisAnalyser);
    this.analysisGain.connect(this.bassFilter);
    this.analysisGain.connect(this.midFilter);
    this.analysisGain.connect(this.trebleFilter);
    this.bassFilter.connect(this.bassAnalyser);
    this.midFilter.connect(this.midAnalyser);
    this.trebleFilter.connect(this.trebleAnalyser);
  }

  startMainLoop() {
    if (!this.audioCtx || this.engineRunning) {
      return;
    }
    this.visualizer.resize();
    this.lastTickTime = this.audioCtx.currentTime;
    this.engineRunning = true;
    this.visualizer.setActive(true);
    this.rafId = requestAnimationFrame(this.mainLoop);
  }

  mainLoop() {
    if (!this.audioCtx || !this.mediaEl || this.mediaEl.paused || this.mediaEl.ended) {
      this.stopLoop();
      return;
    }

    this.updateAnalysis();
    this.scheduleTick();
    this.visualizer.draw(this.analysisAnalyser, this.mediaEl);
    this.rafId = requestAnimationFrame(this.mainLoop);
  }

  updateAnalysis() {
    this.analysisAnalyser.getFloatTimeDomainData(this.waveformData);

    let sumSq = 0;
    for (let i = 0; i < this.waveformData.length; i += 1) {
      sumSq += this.waveformData[i] * this.waveformData[i];
    }
    const rms = Math.sqrt(sumSq / this.waveformData.length);
    this.analysisData.rms = smooth(this.analysisData.rms, rms, 0.24);

    this.analysisData.bass = smooth(this.analysisData.bass, this.bandEnergy(this.bassAnalyser), 0.2);
    this.analysisData.mid = smooth(this.analysisData.mid, this.bandEnergy(this.midAnalyser), 0.2);
    this.analysisData.treble = smooth(this.analysisData.treble, this.bandEnergy(this.trebleAnalyser), 0.2);

    this.detectBpm();
  }

  detectBpm() {
    const now = this.audioCtx.currentTime;
    const threshold = 0.09 + Number(this.reactivityControl.value) * 0.07;
    const bassPulse = this.analysisData.bass - this.analysisData.mid * 0.35;

    if (bassPulse > threshold && now > this.beatLockoutUntil) {
      this.beatTimes.push(now);
      this.beatLockoutUntil = now + 0.22;
      if (this.beatTimes.length > 14) {
        this.beatTimes.shift();
      }
    }

    if (this.beatTimes.length < 4) {
      return;
    }

    const intervals = [];
    for (let i = 1; i < this.beatTimes.length; i += 1) {
      const dt = this.beatTimes[i] - this.beatTimes[i - 1];
      if (dt > 0.25 && dt < 1.1) {
        intervals.push(dt);
      }
    }

    if (!intervals.length) {
      return;
    }

    intervals.sort((a, b) => a - b);
    const median = intervals[Math.floor(intervals.length / 2)];
    let candidateBpm = 60 / median;

    while (candidateBpm < 70) candidateBpm *= 2;
    while (candidateBpm > 170) candidateBpm /= 2;

    const style = styleProfiles[this.styleSelect.value];
    candidateBpm *= style.tempoBias;
    this.bpmSmoothing = smooth(this.bpmSmoothing, candidateBpm, 0.08);
    this.analysisData.bpm = clamp(this.bpmSmoothing, 70, 170);
  }

  scheduleTick() {
    const now = this.audioCtx.currentTime;
    const bpm = this.analysisData.bpm || 100;
    const sixteenth = 60 / bpm / 4;
    if (now - this.lastTickTime < sixteenth) {
      return;
    }
    this.lastTickTime = now;
    this.runStep(now);
    this.stepIndex = (this.stepIndex + 1) % 16;
  }

  runStep(now) {
    const styleName = this.styleSelect.value;
    const style = styleProfiles[styleName];
    const reactivity = Number(this.reactivityControl.value);
    const focus = Number(this.focusControl.value);
    const bassWeight = clamp(0.5 - focus * 0.35, 0.1, 0.9);
    const trebleWeight = clamp(0.5 + focus * 0.35, 0.1, 0.9);

    const intensity = clamp(
      this.analysisData.rms * (0.8 + reactivity * 1.2) +
        this.analysisData.bass * bassWeight * 0.7 +
        this.analysisData.treble * trebleWeight * 0.5,
      0,
      1
    );

    const rootMidi = 43 + Math.round(this.analysisData.bass * 5);
    const scale = scales[styleName];

    const isQuarter = this.stepIndex % 4 === 0;
    const isOffBeat = this.stepIndex % 4 === 2;
    const isEighth = this.stepIndex % 2 === 0;

    if (isQuarter && Math.random() < style.drumDensity + this.analysisData.bass * 0.7) {
      this.triggerKick(now, 0.22 + intensity * 0.2);
    }

    if (isOffBeat && Math.random() < 0.24 + style.drumDensity * 0.45 + this.analysisData.treble * 0.35) {
      this.triggerHat(now, 0.06 + this.analysisData.treble * 0.1);
    }

    if (isEighth && Math.random() < 0.18 + this.analysisData.mid * 0.55 + reactivity * 0.2) {
      const degree = Math.floor(Math.random() * scale.length);
      const note = midiToHz(rootMidi + scale[degree] + 12);
      this.triggerLead(now, note, 0.16 + intensity * 0.2, style.leadWave);
    }

    if (this.stepIndex % 8 === 0) {
      const chord = this.pickChord(rootMidi, scale);
      for (let i = 0; i < chord.length; i += 1) {
        this.triggerPad(now, midiToHz(chord[i]), style.padLength, 0.08 + intensity * 0.12, style.padWave);
      }
    }
  }

  pickChord(rootMidi, scale) {
    const count = scale.length;
    const base = Math.floor(Math.random() * count);

    const thirdIndex = (base + 2) % count;
    const fifthIndex = (base + 4) % count;
    const thirdOctave = base + 2 >= count ? 12 : 0;
    const fifthOctave = base + 4 >= count ? 12 : 0;

    return [
      rootMidi + scale[base],
      rootMidi + scale[thirdIndex] + thirdOctave,
      rootMidi + scale[fifthIndex] + fifthOctave
    ];
  }

  triggerKick(time, amplitude) {
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(48, time + 0.12);
    gain.gain.setValueAtTime(amplitude, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
    osc.connect(gain);
    gain.connect(this.masterMix);
    osc.start(time);
    osc.stop(time + 0.16);
  }

  triggerHat(time, amplitude) {
    const bufferSize = 0.05 * this.audioCtx.sampleRate;
    const noiseBuffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
    const channel = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i += 1) {
      channel[i] = Math.random() * 2 - 1;
    }

    const src = this.audioCtx.createBufferSource();
    const hp = this.audioCtx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;
    const gain = this.audioCtx.createGain();
    src.buffer = noiseBuffer;
    gain.gain.setValueAtTime(amplitude, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    src.connect(hp);
    hp.connect(gain);
    gain.connect(this.masterMix);
    src.start(time);
    src.stop(time + 0.06);
  }

  triggerPad(time, frequency, length, amplitude, waveType) {
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    const filter = this.audioCtx.createBiquadFilter();
    osc.type = waveType;
    osc.frequency.value = frequency;
    filter.type = "lowpass";
    filter.frequency.value = 1700;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(amplitude, time + 0.15);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterMix);
    osc.start(time);
    osc.stop(time + length + 0.02);
  }

  triggerLead(time, frequency, amplitude, waveType) {
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();
    osc.type = waveType;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.linearRampToValueAtTime(amplitude, time + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.19);
    osc.connect(gain);
    gain.connect(this.masterMix);
    osc.start(time);
    osc.stop(time + 0.2);
  }

  bandEnergy(analyser) {
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i += 1) {
      sum += data[i];
    }
    return (sum / data.length) / 255;
  }
}
