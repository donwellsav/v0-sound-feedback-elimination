import test from 'node:test';
import assert from 'node:assert';
import {
  freqToX,
  xToFreq,
  dbToY,
  yToDb,
  formatFreq,
  freqToNote,
  getFreqBandLabel,
  getFreqBandColor
} from './audio-utils.ts';
import { AUDIO_CONSTANTS } from './constants.ts';

test('Visualization Math: freqToX and xToFreq inverse relationship', () => {
  const width = 1200;
  const frequencies = [20, 100, 440, 1000, 5000, 10000, 20000];

  for (const freq of frequencies) {
    const x = freqToX(freq, width);
    const backToFreq = xToFreq(x, width);

    // Use a small epsilon for floating point comparison
    const epsilon = 0.0001;
    assert.ok(
      Math.abs(freq - backToFreq) < epsilon,
      `Expected ${freq} to be close to ${backToFreq} for frequency ${freq}`
    );

    // Check bounds
    assert.ok(x >= 0 && x <= width, `x value ${x} out of bounds for frequency ${freq}`);
  }
});

test('Visualization Math: dbToY and yToDb inverse relationship', () => {
  const height = 800;
  const dbs = [-100, -80, -60, -40, -20, -10];

  for (const db of dbs) {
    const y = dbToY(db, height);
    const backToDb = yToDb(y, height);

    const epsilon = 0.0001;
    assert.ok(
      Math.abs(db - backToDb) < epsilon,
      `Expected ${db} to be close to ${backToDb} for dB ${db}`
    );

    // Check bounds
    assert.ok(y >= 0 && y <= height, `y value ${y} out of bounds for dB ${db}`);
  }
});

test('Visualization Math: dbToY with custom bounds', () => {
  const height = 100;
  const minDb = -60;
  const maxDb = 0;

  assert.strictEqual(dbToY(0, height, minDb, maxDb), 0);
  assert.strictEqual(dbToY(-60, height, minDb, maxDb), height);
  assert.strictEqual(dbToY(-30, height, minDb, maxDb), 50);
});

test('Formatting: formatFreq', () => {
  assert.strictEqual(formatFreq(440), '440 Hz');
  assert.strictEqual(formatFreq(1000), '1.00 kHz');
  assert.strictEqual(formatFreq(1250.5), '1.25 kHz');
  assert.strictEqual(formatFreq(20000), '20.00 kHz');
});

test('Musical: freqToNote', () => {
  assert.strictEqual(freqToNote(440), 'A4');
  assert.strictEqual(freqToNote(261.63), 'C4');
  assert.strictEqual(freqToNote(880), 'A5');
  assert.strictEqual(freqToNote(55), 'A1');
});

test('Categorization: getFreqBandLabel and getFreqBandColor', () => {
  assert.strictEqual(getFreqBandLabel(50), 'Sub Bass');
  assert.strictEqual(getFreqBandLabel(500), 'Body');
  assert.strictEqual(getFreqBandLabel(15000), 'Air');

  assert.ok(getFreqBandColor(50).includes('blue'));
  assert.ok(getFreqBandColor(15000).includes('purple'));
});

test('Edge Cases: freqToX handles frequencies below MIN_FREQ', () => {
  const width = 1000;
  const belowMin = AUDIO_CONSTANTS.MIN_FREQ - 10;
  const atMin = AUDIO_CONSTANTS.MIN_FREQ;

  // freqToX uses Math.max(freq, AUDIO_CONSTANTS.MIN_FREQ)
  assert.strictEqual(freqToX(belowMin, width), freqToX(atMin, width));
  assert.strictEqual(freqToX(belowMin, width), 0);
});
