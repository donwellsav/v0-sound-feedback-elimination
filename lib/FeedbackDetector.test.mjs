import { test, describe } from 'node:test';
import assert from 'node:assert';
import { FeedbackDetector } from './FeedbackDetector.js';

describe('FeedbackDetector._isValidFftSize', () => {
  test('should return true for valid power-of-2 values within range [32, 32768]', () => {
    const validSizes = [32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384, 32768];
    validSizes.forEach(n => {
      assert.strictEqual(FeedbackDetector._isValidFftSize(n), true, `Expected ${n} to be a valid FFT size`);
    });
  });

  test('should return false for valid power-of-2 values outside range', () => {
    const outOfRangeSizes = [16, 65536];
    outOfRangeSizes.forEach(n => {
      assert.strictEqual(FeedbackDetector._isValidFftSize(n), false, `Expected ${n} to be an invalid FFT size (out of range)`);
    });
  });

  test('should return false for non-power-of-2 values within range', () => {
    const nonPowerOfTwoSizes = [31, 33, 100, 1023, 1025, 32767];
    nonPowerOfTwoSizes.forEach(n => {
      assert.strictEqual(FeedbackDetector._isValidFftSize(n), false, `Expected ${n} to be an invalid FFT size (not power of 2)`);
    });
  });

  test('should return false for non-integer values', () => {
    const nonIntegers = [32.5, 64.1, 1024.00001];
    nonIntegers.forEach(n => {
      assert.strictEqual(FeedbackDetector._isValidFftSize(n), false, `Expected ${n} to be an invalid FFT size (non-integer)`);
    });
  });

  test('should return false for non-numeric types', () => {
    const nonNumerics = ["32", null, undefined, NaN, Infinity, -Infinity, [], {}, true];
    nonNumerics.forEach(n => {
      assert.strictEqual(FeedbackDetector._isValidFftSize(n), false, `Expected ${JSON.stringify(n)} to be an invalid FFT size (non-numeric type)`);
    });
  });

  test('should return false for negative numbers', () => {
    const negatives = [-32, -64, -1024];
    negatives.forEach(n => {
      assert.strictEqual(FeedbackDetector._isValidFftSize(n), false, `Expected ${n} to be an invalid FFT size (negative)`);
    });
  });
});
