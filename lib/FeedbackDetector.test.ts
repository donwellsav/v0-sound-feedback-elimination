import { test, describe, it } from 'node:test';
import assert from 'node:assert';
import { FeedbackDetector } from './FeedbackDetector.ts';
import type { ThresholdMode } from './FeedbackDetector.ts';

describe('FeedbackDetector._isValidFftSize', () => {
  test('should return true for valid power-of-2 values within range [32, 32768]', () => {
    const validSizes = [32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768];
    validSizes.forEach(n => {
      assert.strictEqual((FeedbackDetector as any)._isValidFftSize(n), true, `Expected ${n} to be a valid FFT size`);
    });
  });

  test('should return false for valid power-of-2 values outside range', () => {
    const outOfRangeSizes = [16, 65536];
    outOfRangeSizes.forEach(n => {
      assert.strictEqual((FeedbackDetector as any)._isValidFftSize(n), false, `Expected ${n} to be an invalid FFT size (out of range)`);
    });
  });

  test('should return false for non-power-of-2 values within range', () => {
    const nonPowerOfTwoSizes = [31, 33, 100, 1023, 1025, 32767];
    nonPowerOfTwoSizes.forEach(n => {
      assert.strictEqual((FeedbackDetector as any)._isValidFftSize(n), false, `Expected ${n} to be an invalid FFT size (not power of 2)`);
    });
  });

  test('should return false for non-integer values', () => {
    const nonIntegers = [32.5, 64.1, 1024.00001];
    nonIntegers.forEach(n => {
      assert.strictEqual((FeedbackDetector as any)._isValidFftSize(n), false, `Expected ${n} to be an invalid FFT size (non-integer)`);
    });
  });

  test('should return false for non-numeric types', () => {
    const nonNumerics = ["32", null, undefined, NaN, Infinity, -Infinity, [], {}, true];
    nonNumerics.forEach(n => {
      assert.strictEqual((FeedbackDetector as any)._isValidFftSize(n), false, `Expected ${JSON.stringify(n)} to be an invalid FFT size (non-numeric type)`);
    });
  });

  test('should return false for negative numbers', () => {
    const negatives = [-32, -64, -1024];
    negatives.forEach(n => {
      assert.strictEqual((FeedbackDetector as any)._isValidFftSize(n), false, `Expected ${n} to be an invalid FFT size (negative)`);
    });
  });
});

describe('FeedbackDetector.setThresholdMode', () => {
  it('should set threshold mode to "absolute"', () => {
    const detector = new FeedbackDetector();
    detector.setThresholdMode("absolute");
    assert.strictEqual(detector._thresholdMode, "absolute");
  });

  it('should set threshold mode to "relative"', () => {
    const detector = new FeedbackDetector();
    detector.setThresholdMode("relative");
    assert.strictEqual(detector._thresholdMode, "relative");
  });

  it('should set threshold mode to "hybrid"', () => {
    const detector = new FeedbackDetector();
    detector.setThresholdMode("hybrid");
    assert.strictEqual(detector._thresholdMode, "hybrid");
  });

  it('should throw error for invalid mode', () => {
    const detector = new FeedbackDetector();
    assert.throws(() => {
      detector.setThresholdMode("invalid" as ThresholdMode);
    }, /thresholdMode must be "absolute", "relative", or "hybrid"./);
  });

  it('should throw error for empty string', () => {
    const detector = new FeedbackDetector();
    assert.throws(() => {
      detector.setThresholdMode("" as ThresholdMode);
    }, /thresholdMode must be "absolute", "relative", or "hybrid"./);
  });

  it('should throw error for case sensitive input', () => {
    const detector = new FeedbackDetector();
    assert.throws(() => {
      detector.setThresholdMode("ABSOLUTE" as ThresholdMode);
    }, /thresholdMode must be "absolute", "relative", or "hybrid"./);
  });

  it('should throw error for non-string input that stringifies to invalid mode', () => {
    const detector = new FeedbackDetector();
    assert.throws(() => {
      detector.setThresholdMode(123 as any);
    }, /thresholdMode must be "absolute", "relative", or "hybrid"./);
  });

  it('should throw error for null/undefined', () => {
    const detector = new FeedbackDetector();
    assert.throws(() => {
      // @ts-expect-error Testing runtime validation
      detector.setThresholdMode(null);
    }, /thresholdMode must be "absolute", "relative", or "hybrid"./);

    assert.throws(() => {
      // @ts-expect-error Testing runtime validation
      detector.setThresholdMode(undefined);
    }, /thresholdMode must be "absolute", "relative", or "hybrid"./);
  });
});

describe('FeedbackDetector.binToFrequency', () => {
  it('should return correct frequency for valid sampleRate and fftSize', () => {
    const detector = new FeedbackDetector({ fftSize: 2048 });
    // Mock audio context with specific sample rate
    detector._audioContext = { sampleRate: 48000 } as AudioContext;

    // Formula: frequency = binIndex * sampleRate / fftSize
    // Expected: 10 * 48000 / 2048 = 234.375
    const freq = detector.binToFrequency(10);
    assert.strictEqual(freq, 234.375);
  });

  it('should return null if sampleRate is not available', () => {
    const detector = new FeedbackDetector({ fftSize: 2048 });
    detector._audioContext = null; // Ensure no audio context

    const freq = detector.binToFrequency(10);
    assert.strictEqual(freq, null);
  });

  it('should use analyser.fftSize if analyser is available', () => {
    const detector = new FeedbackDetector({ fftSize: 2048 });
    detector._audioContext = { sampleRate: 44100 } as AudioContext;

    // Mock analyser with different FFT size
    detector._analyser = { fftSize: 4096 } as AnalyserNode;

    // Expected: 10 * 44100 / 4096 = 107.666015625
    const freq = detector.binToFrequency(10);
    assert.strictEqual(freq, 107.666015625);
  });

  it('should handle 0 as binIndex', () => {
    const detector = new FeedbackDetector({ fftSize: 2048 });
    detector._audioContext = { sampleRate: 48000 } as AudioContext;

    const freq = detector.binToFrequency(0);
    assert.strictEqual(freq, 0);
  });

  it('should fall back to internal fftSize if analyser is missing', () => {
    const detector = new FeedbackDetector({ fftSize: 1024 });
    detector._audioContext = { sampleRate: 48000 } as AudioContext;
    detector._analyser = null;

    // Expected: 10 * 48000 / 1024 = 468.75
    const freq = detector.binToFrequency(10);
    assert.strictEqual(freq, 468.75);
  });
});
