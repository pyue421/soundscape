export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function smooth(previous, next, alpha) {
  return previous + (next - previous) * alpha;
}

export function midiToHz(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}
