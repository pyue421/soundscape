export const styleProfiles = {
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

export const scales = {
  ambient: [0, 2, 3, 5, 7, 10],
  electronic: [0, 2, 4, 7, 9],
  orchestral: [0, 2, 4, 5, 7, 9, 11]
};
