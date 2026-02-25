export class Visualizer {
  constructor(playerHost, canvas) {
    this.playerHost = playerHost;
    this.canvas = canvas;
    this.ctx = canvas ? canvas.getContext("2d") : null;
    this.waveData = null;
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

  draw(analyser) {
    if (!this.ctx || !this.canvas || !analyser) {
      return;
    }

    if (!this.waveData || this.waveData.length !== analyser.fftSize) {
      this.waveData = new Uint8Array(analyser.fftSize);
    }

    analyser.getByteTimeDomainData(this.waveData);
    const w = this.canvas.width;
    const h = this.canvas.height;
    const midY = h * 0.78;
    const amp = h * 0.18;

    this.ctx.clearRect(0, 0, w, h);

    const bg = this.ctx.createLinearGradient(0, h * 0.58, 0, h);
    bg.addColorStop(0, "rgba(16, 20, 28, 0)");
    bg.addColorStop(1, "rgba(16, 20, 28, 0.36)");
    this.ctx.fillStyle = bg;
    this.ctx.fillRect(0, h * 0.58, w, h * 0.42);

    this.ctx.beginPath();
    for (let i = 0; i < this.waveData.length; i += 1) {
      const x = (i / (this.waveData.length - 1)) * w;
      const y = midY + ((this.waveData[i] - 128) / 128) * amp;
      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    }

    this.ctx.strokeStyle = "rgba(237, 244, 255, 0.86)";
    this.ctx.lineWidth = Math.max(1.2, h * 0.006);
    this.ctx.shadowColor = "rgba(160, 205, 255, 0.42)";
    this.ctx.shadowBlur = h * 0.025;
    this.ctx.stroke();
    this.ctx.shadowBlur = 0;
  }

  clear() {
    if (!this.ctx || !this.canvas) {
      return;
    }
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }
}
