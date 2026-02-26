
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { NoiseFloorEstimator } from './NoiseFloorEstimator';

describe('NoiseFloorEstimator', () => {
  let estimator: NoiseFloorEstimator;

  beforeEach(() => {
    estimator = new NoiseFloorEstimator({
      minDecibels: -100,
      maxDecibels: 0,
      attackMs: 100,
      releaseMs: 100
    });
  });

  it('should initialize with default values', () => {
    const e = new NoiseFloorEstimator();
    assert.strictEqual(e.value, null);
  });

  it('should initialize with provided initial value', () => {
    const e = new NoiseFloorEstimator({ initialValue: -50 });
    assert.strictEqual(e.value, -50);
  });

  it('should calculate median correctly for odd number of samples', () => {
    const freqDb = new Float32Array([-10, -20, -30, -40, -50]);
    // Indices: 0, 1, 2 => -10, -20, -30. Median is -20.
    const indices = new Uint32Array([0, 1, 2]);

    const result = estimator.update(freqDb, indices, 0);
    assert.strictEqual(result, -20);
    assert.strictEqual(estimator.value, -20);
  });

  it('should calculate median correctly for even number of samples', () => {
    const freqDb = new Float32Array([-10, -20, -30, -40]);
    // Indices: 0, 1, 2, 3 => -10, -20, -30, -40. Median is average of -20 and -30 => -25.
    const indices = new Uint32Array([0, 1, 2, 3]);

    const result = estimator.update(freqDb, indices, 0);
    assert.strictEqual(result, -25);
  });

  it('should clamp values to min/max decibels', () => {
    const freqDb = new Float32Array([-200, 100, -50]); // -200 < -100, 100 > 0
    const indices = new Uint32Array([0, 1, 2]);

    // Values become: -100, 0, -50. Median is -50.
    const result = estimator.update(freqDb, indices, 0);
    assert.strictEqual(result, -50);
  });

  it('should handle non-finite values by clamping to minDecibels', () => {
    const freqDb = new Float32Array([-Infinity, NaN, -50]);
    const indices = new Uint32Array([0, 1, 2]);

    // Values become: -100, -100, -50. Median is -100.
    const result = estimator.update(freqDb, indices, 0);
    assert.strictEqual(result, -100);
  });

  it('should update value with attack time when level rises', () => {
    // Start at -50
    const freqDb = new Float32Array([-50]);
    const indices = new Uint32Array([0]);
    estimator.update(freqDb, indices, 0);
    assert.strictEqual(estimator.value, -50);

    // Jump to -40
    freqDb[0] = -40;

    // dt = 100ms. attackMs = 100ms.
    // alpha = 1 - exp(-100/100) = 1 - 0.3678 = 0.6321
    // New val = -50 + 0.6321 * (-40 - (-50)) = -50 + 6.321 = -43.679
    const dt = 100;
    const result = estimator.update(freqDb, indices, dt);

    assert.ok(result! > -50);
    assert.ok(result! < -40);
    assert.ok(Math.abs(result! - -43.679) < 0.01);
  });

  it('should update value with release time when level falls', () => {
    // Start at -40
    const freqDb = new Float32Array([-40]);
    const indices = new Uint32Array([0]);
    estimator.update(freqDb, indices, 0);

    // Drop to -50
    freqDb[0] = -50;

    // dt = 100ms. releaseMs = 100ms.
    // alpha = 1 - exp(-100/100) = 0.6321
    // New val = -40 + 0.6321 * (-50 - (-40)) = -40 - 6.321 = -46.321
    const dt = 100;
    const result = estimator.update(freqDb, indices, dt);

    assert.ok(result! < -40);
    assert.ok(result! > -50);
    assert.ok(Math.abs(result! - -46.321) < 0.01);
  });

  it('should handle buffer resizing', () => {
    const freqDb = new Float32Array([-10, -20, -30, -40]);

    // 2 samples
    let indices = new Uint32Array([0, 1]);
    let result = estimator.update(freqDb, indices, 0);
    assert.strictEqual(result, -15); // Avg(-10, -20)

    // 3 samples
    indices = new Uint32Array([0, 1, 2]); // -10, -20, -30 -> Median -20
    result = estimator.update(freqDb, indices, 0); // Need to reset history? No, history persists.
    // But since dt=0, it sets the value immediately if previous was null? No, previous was -15.
    // So if dt=0, alpha = 0. No change?
    // Wait, update(..., 0) -> alpha = 0. So result is current.
    // Let's reset first to test calculation logic only
    estimator.reset();
    result = estimator.update(freqDb, indices, 0);
    assert.strictEqual(result, -20);
  });

  it('should respect override value', () => {
    estimator.setOverride(-30);
    const freqDb = new Float32Array([-100]);
    const indices = new Uint32Array([0]);

    const result = estimator.update(freqDb, indices, 1000);
    assert.strictEqual(result, -30);
    assert.strictEqual(estimator.value, -30);
  });

  it('should return null if not initialized and no indices', () => {
    const freqDb = new Float32Array(10);
    const indices = new Uint32Array(0);
    assert.strictEqual(estimator.update(freqDb, indices, 10), null);
  });
});
