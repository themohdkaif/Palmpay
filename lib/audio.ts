/**
 * Vault & Vein Sound Synthesis Engine using Web Audio API
 * Generates programmatic metallic seal impacts, mechanical camera clicks, and quiet failure tones.
 */

let audioCtx: AudioContext | null = null;

const getAudioContext = (): AudioContext | null => {
  if (typeof window === "undefined") return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
};

/**
 * Metallic Seal Impact Sound
 * Triggered when the "Payment Certified" seal lands on the Banknote Receipt
 */
export const playStampSound = (enabled: boolean = true) => {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  // 1. Heavy Metallic Thud (Low Sine Drop)
  const thudOsc = ctx.createOscillator();
  const thudGain = ctx.createGain();
  thudOsc.type = "sine";
  thudOsc.frequency.setValueAtTime(140, now);
  thudOsc.frequency.exponentialRampToValueAtTime(30, now + 0.25);

  thudGain.gain.setValueAtTime(0.7, now);
  thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

  thudOsc.connect(thudGain);
  thudGain.connect(ctx.destination);
  thudOsc.start(now);
  thudOsc.stop(now + 0.25);

  // 2. Brass Ring Clang (High Metallic Overtones)
  const clangOsc = ctx.createOscillator();
  const clangGain = ctx.createGain();
  clangOsc.type = "triangle";
  clangOsc.frequency.setValueAtTime(880, now);
  clangOsc.frequency.exponentialRampToValueAtTime(440, now + 0.18);

  clangGain.gain.setValueAtTime(0.3, now);
  clangGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

  clangOsc.connect(clangGain);
  clangGain.connect(ctx.destination);
  clangOsc.start(now);
  clangOsc.stop(now + 0.18);
};

/**
 * Mechanical Camera Click
 * Triggered on Authenticate press
 */
export const playClickSound = (enabled: boolean = true) => {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(1200, now);
  osc.frequency.exponentialRampToValueAtTime(200, now + 0.04);

  gain.gain.setValueAtTime(0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.04);
};

/**
 * Soft Failure Tone
 * Triggered on Retake / Scan Mismatch
 */
export const playErrorSound = (enabled: boolean = true) => {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.setValueAtTime(180, now + 0.1);

  gain.gain.setValueAtTime(0.25, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.35);
};
