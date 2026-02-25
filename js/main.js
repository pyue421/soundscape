import { AudioEngine } from "./audio-engine.js";
import { Visualizer } from "./visualizer.js";

const uploadInput = document.getElementById("mediaUpload");
const playerHost = document.getElementById("playerHost");
const controlsPanel = document.querySelector(".controls");
const menuButton = document.getElementById("btnMenu");
const prevButton = document.getElementById("btnPrev");
const nextButton = document.getElementById("btnNext");
const playPauseButton = document.getElementById("btnPlayPause");
const styleSelect = document.getElementById("styleSelect");
const reactivityControl = document.getElementById("reactivity");
const focusControl = document.getElementById("focus");
const visualizerCanvas = document.getElementById("audioViz");

let mediaEl = null;
let fileUrl = null;

const visualizer = new Visualizer(playerHost, visualizerCanvas);
const engine = new AudioEngine({
  styleSelect,
  reactivityControl,
  focusControl,
  visualizer
});

uploadInput.addEventListener("change", onFileSelect);
menuButton.addEventListener("click", () => {
  controlsPanel.hidden = !controlsPanel.hidden;
});
prevButton.addEventListener("click", () => engine.seekBy(-10));
nextButton.addEventListener("click", () => engine.seekBy(10));
playPauseButton.addEventListener("click", onPlayPause);
window.addEventListener("resize", () => visualizer.resize());

async function onFileSelect(event) {
  const file = event.target.files[0];
  if (!file) {
    return;
  }

  await engine.close();

  if (fileUrl) {
    URL.revokeObjectURL(fileUrl);
  }
  fileUrl = URL.createObjectURL(file);

  const element = createMediaElement(fileUrl, file.type.startsWith("video/"));
  const previousMedia = playerHost.querySelector("audio, video");
  if (previousMedia) {
    previousMedia.remove();
  }

  const placeholder = playerHost.querySelector(".screen-placeholder");
  if (placeholder) {
    placeholder.remove();
  }

  playerHost.insertBefore(element, controlsPanel);
  mediaEl = element;
  playPauseButton.disabled = false;
  visualizer.resize();

  element.addEventListener("pause", () => engine.stopLoop());
  element.addEventListener("ended", () => engine.stopLoop());

  await engine.setMedia(mediaEl);
}

function createMediaElement(src, isVideo) {
  const element = document.createElement(isVideo ? "video" : "audio");
  element.src = src;
  element.controls = false;
  element.crossOrigin = "anonymous";
  element.preload = "auto";
  if (isVideo) {
    element.playsInline = true;
  }
  return element;
}

async function onPlayPause() {
  if (!mediaEl) {
    return;
  }

  if (mediaEl.paused) {
    await engine.play();
  } else {
    engine.pause();
  }
}
