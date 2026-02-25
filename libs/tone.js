const synth = new Tone.Synth().toDestination();

function playAdaptiveNote() {
  if (!features) return;

  // Map amplitude to volume
  let velocity = map(features.rms, 0, 0.5, 0.1, 1);

  // Map spectral centroid to pitch
  let note = Tone.Frequency(features.spectralCentroid, "hz").toNote();

  synth.triggerAttackRelease(note, "8n", undefined, velocity);
}