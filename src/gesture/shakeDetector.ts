export interface MotionSample { x: number; y: number; z: number; timestamp: number }

/** Ignore slow orientation changes; detect a short series of deliberate movements. */
export function createShakeDetector() {
  let previous: MotionSample | null = null;
  let impulses: number[] = [];
  let lastImpulse = -Infinity;
  let cooldownUntil = 0;
  return {
    reset() { previous = null; impulses = []; lastImpulse = -Infinity; },
    sample(sample: MotionSample) {
      if (![sample.x, sample.y, sample.z, sample.timestamp].every(Number.isFinite)) return false;
      const prior = previous;
      previous = sample;
      if (!prior || sample.timestamp < cooldownUntil) return false;
      const dt = sample.timestamp - prior.timestamp;
      if (dt <= 0 || dt > 250) { impulses = []; return false; }
      const delta = Math.hypot(sample.x - prior.x, sample.y - prior.y, sample.z - prior.z);
      if (delta < 6 || sample.timestamp - lastImpulse < 90) return false;
      lastImpulse = sample.timestamp;
      impulses = [...impulses.filter((t) => sample.timestamp - t < 1400), sample.timestamp];
      if (impulses.length < 3) return false;
      impulses = [];
      cooldownUntil = sample.timestamp + 1800;
      return true;
    }
  };
}
