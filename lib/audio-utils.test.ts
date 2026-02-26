import { describe, it } from 'node:test';
import assert from 'node:assert';
import { dbToY, yToDb } from './audio-utils.ts';
import { AUDIO_CONSTANTS } from './constants.ts';

describe('audio-utils', () => {
  describe('dbToY and yToDb', () => {
    it('should correctly convert max DB to 0 (top of canvas)', () => {
      const height = 100;
      const minDb = -100;
      const maxDb = 0;
      const y = dbToY(maxDb, height, minDb, maxDb);
      assert.strictEqual(y, 0);
    });

    it('should correctly convert min DB to height (bottom of canvas)', () => {
      const height = 100;
      const minDb = -100;
      const maxDb = 0;
      const y = dbToY(minDb, height, minDb, maxDb);
      assert.strictEqual(y, height);
    });

    it('should be inverse functions', () => {
      const height = 500;
      const minDb = -120;
      const maxDb = -10;

      // Test across the range
      for (let db = minDb; db <= maxDb; db += 10) {
        const y = dbToY(db, height, minDb, maxDb);
        const reconstructedDb = yToDb(y, height, minDb, maxDb);
        assert.ok(Math.abs(db - reconstructedDb) < 0.001, `Failed for db=${db}: got ${reconstructedDb}`);
      }

      // Test across Y range
      for (let y = 0; y <= height; y += 50) {
        const db = yToDb(y, height, minDb, maxDb);
        const reconstructedY = dbToY(db, height, minDb, maxDb);
        assert.ok(Math.abs(y - reconstructedY) < 0.001, `Failed for y=${y}: got ${reconstructedY}`);
      }
    });

    it('should handle custom ranges', () => {
        const height = 200;
        const minDb = -60;
        const maxDb = -20;

        // Midpoint check
        const midDb = (minDb + maxDb) / 2;
        const y = dbToY(midDb, height, minDb, maxDb);
        assert.strictEqual(y, height / 2);
    });

    it('should use default constants if minDb/maxDb are not provided', () => {
        const height = 100;
        const y = dbToY(AUDIO_CONSTANTS.MAX_DB, height);
        assert.strictEqual(y, 0);

        const yMin = dbToY(AUDIO_CONSTANTS.MIN_DB, height);
        assert.strictEqual(yMin, height);

        const db = yToDb(0, height);
        assert.strictEqual(db, AUDIO_CONSTANTS.MAX_DB);

        const dbMin = yToDb(height, height);
        assert.strictEqual(dbMin, AUDIO_CONSTANTS.MIN_DB);
    });

    it('should handle height=0', () => {
        const height = 0;
        const minDb = -100;
        const maxDb = 0;
        // dbToY: height - ... * height = 0 - ... * 0 = 0.
        assert.strictEqual(dbToY(-50, height, minDb, maxDb), 0);

        // yToDb: minDb + ((0 - y)/0) * (maxDb - minDb)
        // If y=0, (0/0)*range -> NaN
        // If y!=0, (1/0)*range -> Infinity or -Infinity
        assert.ok(Number.isNaN(yToDb(0, height, minDb, maxDb)));

        // (0 - 10)/0 = -Infinity. (-Infinity) * 100 = -Infinity. -100 + (-Infinity) = -Infinity.
        assert.strictEqual(yToDb(10, height, minDb, maxDb), -Infinity);
    });
  });
});
