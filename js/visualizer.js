export class Visualizer {
  constructor(playerHost, canvas) {
    this.playerHost = playerHost;
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext("2d") : null;
    this.waveData = null;
    this.smoothedWave = null;
    this.colorProbeCanvas = document.createElement("canvas");
    this.colorProbeCanvas.width = 24;
    this.colorProbeCanvas.height = 14;
    this.colorProbeCtx = this.colorProbeCanvas.getContext("2d", { willReadFrequently: true });
    this.cachedColor = { r: 80, g: 255, b: 230 };
    this.frameCounter = 0;
  }

  resize() {
    if (!this.canvas) {
      return;
    }

    const rect = this.playerHost.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));

    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
  }

  setActive(active) {
    if (!this.canvas) {
      return;
    }
    this.canvas.classList.toggle("active", active);
    if (!active) {
      this.clear();
    }
  }

  draw(analyser, mediaEl) {
    if (!this.ctx || !this.canvas || !analyser) {
      return;
    }

    if (!this.waveData || this.waveData.length !== analyser.fftSize) {
      this.waveData = new Uint8Array(analyser.fftSize);
      this.smoothedWave = new Float32Array(analyser.fftSize);
    }

    analyser.getByteTimeDomainData(this.waveData);
    this.updateColorFromMedia(mediaEl);

    const w = this.canvas.width;
    const h = this.canvas.height;
    const midY = h * 0.76;
    const amp = h * 0.62;

    this.ctx.clearRect(0, 0, w, h);

    this.ctx.beginPath();
    for (let i = 0; i < this.waveData.length; i += 1) {
      const x = (i / (this.waveData.length - 1)) * w;
      const raw = (this.waveData[i] - 128) / 128;
      this.smoothedWave[i] = this.smoothedWave[i] * 0.93 + raw * 0.07;
      const shaped = Math.sign(this.smoothedWave[i]) * Math.pow(Math.abs(this.smoothedWave[i]), 0.72);
      const y = midY + shaped * amp;
      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    }

    const strokeR = Math.min(255, this.cachedColor.r + 44);
    const strokeG = Math.min(255, this.cachedColor.g + 44);
    const strokeB = Math.min(255, this.cachedColor.b + 44);
    this.ctx.strokeStyle = `rgba(${strokeR}, ${strokeG}, ${strokeB}, 0.95)`;
    this.ctx.lineWidth = Math.max(1.5, h * 0.01);
    this.ctx.shadowColor = "transparent";
    this.ctx.shadowBlur = 0;
    this.ctx.stroke();

    this.ctx.beginPath();
    for (let i = 0; i < this.waveData.length; i += 1) {
      const x = (i / (this.waveData.length - 1)) * w;
      const shaped = Math.sign(this.smoothedWave[i]) * Math.pow(Math.abs(this.smoothedWave[i]), 0.72);
      const y = midY + shaped * amp * 0.86;
      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    }
    this.ctx.strokeStyle = `rgba(255, 255, 255, 0.75)`;
    this.ctx.lineWidth = Math.max(0.9, h * 0.003);
    this.ctx.shadowBlur = 0;
    this.ctx.stroke();
    this.ctx.shadowBlur = 0;
  }

  clear() {
    if (!this.ctx || !this.canvas) {
      return;
    }
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  updateColorFromMedia(mediaEl) {
    this.frameCounter = (this.frameCounter + 1) % 8;
    if (this.frameCounter !== 0 || !mediaEl || mediaEl.tagName !== "VIDEO") {
      return;
    }
    if (!mediaEl.videoWidth || !mediaEl.videoHeight || !this.colorProbeCtx) {
      return;
    }

    try {
      this.colorProbeCtx.drawImage(
        mediaEl,
        0,
        0,
        mediaEl.videoWidth,
        mediaEl.videoHeight,
        0,
        0,
        this.colorProbeCanvas.width,
        this.colorProbeCanvas.height
      );
      const pixels = this.colorProbeCtx.getImageData(
        0,
        0,
        this.colorProbeCanvas.width,
        this.colorProbeCanvas.height
      ).data;
      let r = 0;
      let g = 0;
      let b = 0;
      const total = pixels.length / 4;
      for (let i = 0; i < pixels.length; i += 4) {
        r += pixels[i];
        g += pixels[i + 1];
        b += pixels[i + 2];
      }
      const avgR = r / total;
      const avgG = g / total;
      const avgB = b / total;
      const neon = this.toContrastingNeon(avgR, avgG, avgB);

      // Keep transitions smooth but vivid.
      this.cachedColor.r = this.cachedColor.r * 0.8 + neon.r * 0.2;
      this.cachedColor.g = this.cachedColor.g * 0.8 + neon.g * 0.2;
      this.cachedColor.b = this.cachedColor.b * 0.8 + neon.b * 0.2;
    } catch (_err) {
      // Keep last known color if pixel read fails.
    }
  }

  toContrastingNeon(r, g, b) {
    const { h, s, l } = this.rgbToHsl(r, g, b);
    // Complementary hue for contrast, with high saturation and bright neon lightness.
    const neonH = (h + 0.5) % 1;
    const neonS = Math.max(0.88, s);
    const neonL = l < 0.5 ? 0.62 : 0.56;
    return this.hslToRgb(neonH, neonS, neonL);
  }

  rgbToHsl(r, g, b) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const max = Math.max(rn, gn, bn);
    const min = Math.min(rn, gn, bn);
    const delta = max - min;
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;

    if (delta !== 0) {
      s = delta / (1 - Math.abs(2 * l - 1));
      switch (max) {
        case rn:
          h = ((gn - bn) / delta) % 6;
          break;
        case gn:
          h = (bn - rn) / delta + 2;
          break;
        default:
          h = (rn - gn) / delta + 4;
      }
      h /= 6;
      if (h < 0) h += 1;
    }

    return { h, s, l };
  }

  hslToRgb(h, s, l) {
    if (s === 0) {
      const gray = Math.round(l * 255);
      return { r: gray, g: gray, b: gray };
    }

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;

    const hueToChannel = (t) => {
      let x = t;
      if (x < 0) x += 1;
      if (x > 1) x -= 1;
      if (x < 1 / 6) return p + (q - p) * 6 * x;
      if (x < 1 / 2) return q;
      if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
      return p;
    };

    return {
      r: Math.round(hueToChannel(h + 1 / 3) * 255),
      g: Math.round(hueToChannel(h) * 255),
      b: Math.round(hueToChannel(h - 1 / 3) * 255)
    };
  }
}
