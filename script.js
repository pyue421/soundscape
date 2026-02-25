const uploadInput = document.getElementById("mediaUpload");
const playerHost = document.getElementById("playerHost");
const menuButton = document.getElementById("btnMenu");
const prevButton = document.getElementById("btnPrev");
const nextButton = document.getElementById("btnNext");
const playPauseButton = document.getElementById("btnPlayPause");
const styleSelect = document.getElementById("styleSelect");
const reactivityControl = document.getElementById("reactivity");
const focusControl = document.getElementById("focus");
const controlsPanel = document.querySelector(".controls");

let mediaEl = null;
let fileUrl = null;
let audioCtx = null;
let sourceNode = null;
let masterMix = null;
let mediaGain = null;
let analysisGain = null;
let analysisAnalyser = null;
let bassFilter = null;
let midFilter = null;
let trebleFilter = null;
let bassAnalyser = null;
let midAnalyser = null;
let trebleAnalyser = null;

let analysisData = {
  rms: 0,
  bass: 0,
  mid: 0,
  treble: 0,
  bpm: 100
};

let beatTimes = [];
let bpmSmoothing = 100;
let beatLockoutUntil = 0;
let lastTickTime = 0;
let stepIndex = 0;
let engineRunning = false;

const styleProfiles = {
  ambient: {
    tempoBias: 0.88,
    drumDensity: 0.25,
    padLength: 1.7,
    padWave: "sine",
    leadWave: "triangle"
  },
  electronic: {
    tempoBias: 1.08,
    drumDensity: 0.75,
    padLength: 0.7,
    padWave: "sawtooth",
    leadWave: "square"
  },
  orchestral: {
    tempoBias: 0.95,
    drumDensity: 0.4,
    padLength: 1.2,
    padWave: "triangle",
    leadWave: "sine"
  }
};

const scales = {
  ambient: [0, 2, 3, 5, 7, 10],
  electronic: [0, 2, 4, 7, 9],
  orchestral: [0, 2, 4, 5, 7, 9, 11]
};

uploadInput.addEventListener("change", handleFileSelect);
menuButton.addEventListener("click", toggleMenuPanel);
prevButton.addEventListener("click", () => seekBy(-10));
nextButton.addEventListener("click", () => seekBy(10));
playPauseButton.addEventListener("click", handlePlayPause);

function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) {
    return;
  }

  if (audioCtx) {
    audioCtx.close();
    audioCtx = null;
    sourceNode = null;
    masterMix = null;
    mediaGain = null;
    analysisGain = null;
    analysisAnalyser = null;
    bassFilter = null;
    midFilter = null;
    trebleFilter = null;
    bassAnalyser = null;
    midAnalyser = null;
    trebleAnalyser = null;
    engineRunning = false;
  }

  beatTimes = [];
  beatLockoutUntil = 0;
  lastTickTime = 0;
  stepIndex = 0;
  bpmSmoothing = 100;
  analysisData = {
    rms: 0,
    bass: 0,
    mid: 0,
    treble: 0,
    bpm: 100
  };

  if (fileUrl) {
    URL.revokeObjectURL(fileUrl);
  }

  fileUrl = URL.createObjectURL(file);
  const isVideo = file.type.startsWith("video/");
  const element = document.createElement(isVideo ? "video" : "audio");
  element.src = fileUrl;
  element.controls = false;
  element.crossOrigin = "anonymous";
  element.preload = "auto";
  if (isVideo) {
    element.playsInline = true;
  }

  const previousMedia = playerHost.querySelector("audio, video");
  if (previousMedia) {
    previousMedia.remove();
  }

  const placeholder = playerHost.querySelector(".screen-placeholder");
  if (placeholder) {
    placeholder.remove();
  }

  if (controlsPanel) {
    playerHost.insertBefore(element, controlsPanel);
  } else {
    playerHost.appendChild(element);
  }

  element.addEventListener("pause", () => {
    engineRunning = false;
  });

  element.addEventListener("ended", () => {
    engineRunning = false;
  });

  mediaEl = element;
  playPauseButton.disabled = false;
}

async function startEngine() {
  if (!mediaEl) {
    return;
  }

  if (!audioCtx) {
    setupAudioGraph();
  }

  await audioCtx.resume();
  if (mediaEl.ended) {
    mediaEl.currentTime = 0;
  }
  await mediaEl.play();
  startMainLoop();
}

function setupAudioGraph() {
  audioCtx = new window.AudioContext();
  sourceNode = audioCtx.createMediaElementSource(mediaEl);

  mediaGain = audioCtx.createGain();
  mediaGain.gain.value = 0.3;

  analysisGain = audioCtx.createGain();
  analysisGain.gain.value = 1;

  masterMix = audioCtx.createGain();
  masterMix.gain.value = 1.8;

  analysisAnalyser = audioCtx.createAnalyser();
  analysisAnalyser.fftSize = 2048;

  bassFilter = audioCtx.createBiquadFilter();
  bassFilter.type = "lowpass";
  bassFilter.frequency.value = 200;

  midFilter = audioCtx.createBiquadFilter();
  midFilter.type = "bandpass";
  midFilter.frequency.value = 1000;
  midFilter.Q.value = 0.8;

  trebleFilter = audioCtx.createBiquadFilter();
  trebleFilter.type = "highpass";
  trebleFilter.frequency.value = 2500;

  bassAnalyser = audioCtx.createAnalyser();
  midAnalyser = audioCtx.createAnalyser();
  trebleAnalyser = audioCtx.createAnalyser();
  bassAnalyser.fftSize = 512;
  midAnalyser.fftSize = 512;
  trebleAnalyser.fftSize = 512;

  // Original media audio path.
  sourceNode.connect(mediaGain);
  mediaGain.connect(audioCtx.destination);

  // Generated accompaniment path.
  masterMix.connect(audioCtx.destination);

  // Analysis path (not audible).
  sourceNode.connect(analysisGain);
  analysisGain.connect(analysisAnalyser);
  analysisGain.connect(bassFilter);
  analysisGain.connect(midFilter);
  analysisGain.connect(trebleFilter);
  bassFilter.connect(bassAnalyser);
  midFilter.connect(midAnalyser);
  trebleFilter.connect(trebleAnalyser);
}

function mainLoop() {
  if (!audioCtx || !mediaEl || mediaEl.paused || mediaEl.ended) {
    engineRunning = false;
    return;
  }

  updateAnalysis();
  scheduleTick();
  requestAnimationFrame(mainLoop);
}

function updateAnalysis() {
  const waveform = new Float32Array(analysisAnalyser.fftSize);
  analysisAnalyser.getFloatTimeDomainData(waveform);

  let sumSq = 0;
  for (let i = 0; i < waveform.length; i += 1) {
    sumSq += waveform[i] * waveform[i];
  }
  const rms = Math.sqrt(sumSq / waveform.length);
  analysisData.rms = smooth(analysisData.rms, rms, 0.24);

  analysisData.bass = smooth(analysisData.bass, bandEnergy(bassAnalyser), 0.2);
  analysisData.mid = smooth(analysisData.mid, bandEnergy(midAnalyser), 0.2);
  analysisData.treble = smooth(analysisData.treble, bandEnergy(trebleAnalyser), 0.2);

  detectBpm();
}

function startMainLoop() {
  if (!audioCtx || engineRunning) {
    return;
  }
  lastTickTime = audioCtx.currentTime;
  engineRunning = true;
  requestAnimationFrame(mainLoop);
}

function detectBpm() {
  const now = audioCtx.currentTime;
  const threshold = 0.09 + Number(reactivityControl.value) * 0.07;
  const bassPulse = analysisData.bass - analysisData.mid * 0.35;
  if (bassPulse > threshold && now > beatLockoutUntil) {
    beatTimes.push(now);
    beatLockoutUntil = now + 0.22;
    if (beatTimes.length > 14) {
      beatTimes.shift();
    }
  }

  if (beatTimes.length < 4) {
    return;
  }

  const intervals = [];
  for (let i = 1; i < beatTimes.length; i += 1) {
    const dt = beatTimes[i] - beatTimes[i - 1];
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

  const style = styleProfiles[styleSelect.value];
  candidateBpm *= style.tempoBias;
  bpmSmoothing = smooth(bpmSmoothing, candidateBpm, 0.08);
  analysisData.bpm = clamp(bpmSmoothing, 70, 170);
}

function scheduleTick() {
  const now = audioCtx.currentTime;
  const bpm = analysisData.bpm || 100;
  const sixteenth = 60 / bpm / 4;
  if (now - lastTickTime < sixteenth) {
    return;
  }
  lastTickTime = now;
  runStep(now);
  stepIndex = (stepIndex + 1) % 16;
}

function runStep(now) {
  const styleName = styleSelect.value;
  const style = styleProfiles[styleName];
  const reactivity = Number(reactivityControl.value);
  const focus = Number(focusControl.value);
  const bassWeight = clamp(0.5 - focus * 0.35, 0.1, 0.9);
  const trebleWeight = clamp(0.5 + focus * 0.35, 0.1, 0.9);

  const intensity = clamp(
    analysisData.rms * (0.8 + reactivity * 1.2) +
      analysisData.bass * bassWeight * 0.7 +
      analysisData.treble * trebleWeight * 0.5,
    0,
    1
  );

  const rootMidi = 43 + Math.round(analysisData.bass * 5);
  const scale = scales[styleName];

  const isQuarter = stepIndex % 4 === 0;
  const isOffBeat = stepIndex % 4 === 2;
  const isEighth = stepIndex % 2 === 0;

  if (isQuarter && Math.random() < style.drumDensity + analysisData.bass * 0.7) {
    triggerKick(now, 0.22 + intensity * 0.2);
  }

  if (isOffBeat && Math.random() < 0.24 + style.drumDensity * 0.45 + analysisData.treble * 0.35) {
    triggerHat(now, 0.06 + analysisData.treble * 0.1);
  }

  if (isEighth && Math.random() < 0.18 + analysisData.mid * 0.55 + reactivity * 0.2) {
    const degree = Math.floor(Math.random() * scale.length);
    const note = midiToHz(rootMidi + scale[degree] + 12);
    triggerLead(now, note, 0.16 + intensity * 0.2, style.leadWave);
  }

  if (stepIndex % 8 === 0) {
    const chord = pickChord(rootMidi, scale);
    for (let i = 0; i < chord.length; i += 1) {
      triggerPad(now, midiToHz(chord[i]), style.padLength, 0.08 + intensity * 0.12, style.padWave);
    }
  }
}

function pickChord(rootMidi, scale) {
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

function triggerKick(time, amplitude) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(140, time);
  osc.frequency.exponentialRampToValueAtTime(48, time + 0.12);
  gain.gain.setValueAtTime(amplitude, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
  osc.connect(gain);
  gain.connect(masterMix);
  osc.start(time);
  osc.stop(time + 0.16);
}

function triggerHat(time, amplitude) {
  const bufferSize = 0.05 * audioCtx.sampleRate;
  const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const channel = noiseBuffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    channel[i] = Math.random() * 2 - 1;
  }

  const src = audioCtx.createBufferSource();
  const hp = audioCtx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 7000;
  const gain = audioCtx.createGain();
  src.buffer = noiseBuffer;
  gain.gain.setValueAtTime(amplitude, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
  src.connect(hp);
  hp.connect(gain);
  gain.connect(masterMix);
  src.start(time);
  src.stop(time + 0.06);
}

function triggerPad(time, frequency, length, amplitude, waveType) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();
  osc.type = waveType;
  osc.frequency.value = frequency;
  filter.type = "lowpass";
  filter.frequency.value = 1700;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.linearRampToValueAtTime(amplitude, time + 0.15);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + length);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(masterMix);
  osc.start(time);
  osc.stop(time + length + 0.02);
}

function triggerLead(time, frequency, amplitude, waveType) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = waveType;
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, time);
  gain.gain.linearRampToValueAtTime(amplitude, time + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.19);
  osc.connect(gain);
  gain.connect(masterMix);
  osc.start(time);
  osc.stop(time + 0.2);
}

function bandEnergy(analyser) {
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  let sum = 0;
  for (let i = 0; i < data.length; i += 1) {
    sum += data[i];
  }
  return (sum / data.length) / 255;
}

function midiToHz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function smooth(previous, next, alpha) {
  return previous + (next - previous) * alpha;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toggleMenuPanel() {
  controlsPanel.hidden = !controlsPanel.hidden;
}

async function handlePlayPause() {
  if (!mediaEl) {
    return;
  }

  if (mediaEl.paused) {
    if (!audioCtx) {
      await startEngine();
      return;
    }
    await audioCtx.resume();
    if (mediaEl.ended) {
      mediaEl.currentTime = 0;
    }
    await mediaEl.play();
    startMainLoop();
  } else {
    mediaEl.pause();
  }
}

function seekBy(seconds) {
  if (!mediaEl || !Number.isFinite(mediaEl.duration)) {
    return;
  }
  const nextTime = clamp(mediaEl.currentTime + seconds, 0, mediaEl.duration);
  mediaEl.currentTime = nextTime;
}
