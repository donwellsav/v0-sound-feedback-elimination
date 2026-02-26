import { AUDIO_CONSTANTS } from "./constants"

export interface NoiseFloorEstimatorOptions {
  attackMs?: number
  releaseMs?: number
  minDecibels?: number
  maxDecibels?: number
  initialValue?: number | null
}

export class NoiseFloorEstimator {
  private _noiseFloorDb: number | null = null
  private _noiseFloorOverride: number | null = null

  private _attackMs: number
  private _releaseMs: number
  private _minDecibels: number
  private _maxDecibels: number

  // Scratch buffer for median calculation
  private _samples: Float32Array = new Float32Array(0)

  constructor(options: NoiseFloorEstimatorOptions = {}) {
    this._attackMs = Math.max(0, options.attackMs ?? AUDIO_CONSTANTS.NOISE_FLOOR.DEFAULT_ATTACK_MS)
    this._releaseMs = Math.max(0, options.releaseMs ?? AUDIO_CONSTANTS.NOISE_FLOOR.DEFAULT_RELEASE_MS)
    this._minDecibels = options.minDecibels ?? AUDIO_CONSTANTS.MIN_DB
    this._maxDecibels = options.maxDecibels ?? 0

    if (options.initialValue !== undefined) {
      this._noiseFloorDb = options.initialValue
    }
  }

  get value(): number | null {
    return this._noiseFloorOverride !== null ? this._noiseFloorOverride : this._noiseFloorDb
  }

  get override(): number | null {
    return this._noiseFloorOverride
  }

  setOverride(db: number | null) {
    this._noiseFloorOverride = db
  }

  setAttackMs(ms: number) {
    this._attackMs = Math.max(0, ms)
  }

  setReleaseMs(ms: number) {
    this._releaseMs = Math.max(0, ms)
  }

  setMinDecibels(db: number) {
    this._minDecibels = db
  }

  setMaxDecibels(db: number) {
    this._maxDecibels = db
  }

  /**
   * Updates the noise floor estimate based on current frequency data.
   * @param freqDb The full frequency spectrum (dB values).
   * @param indices The indices within freqDb to sample for noise floor estimation.
   * @param dt Time delta in milliseconds since last update.
   * @returns The updated noise floor value.
   */
  update(freqDb: Float32Array, indices: Uint32Array, dt: number): number | null {
    if (this._noiseFloorOverride !== null) {
      return this._noiseFloorOverride
    }

    if (!indices || indices.length === 0) {
      return this._noiseFloorDb
    }

    // Ensure scratch buffer size matches indices count
    if (this._samples.length !== indices.length) {
      this._samples = new Float32Array(indices.length)
    }

    const samples = this._samples

    // Gather and clamp samples
    for (let i = 0; i < indices.length; i++) {
      let db = freqDb[indices[i]]
      if (!Number.isFinite(db)) db = this._minDecibels
      if (db < this._minDecibels) db = this._minDecibels
      if (db > this._maxDecibels) db = this._maxDecibels
      samples[i] = db
    }

    // Calculate median
    const estimateDb = NoiseFloorEstimator._medianInPlace(samples)

    // Initialize if null
    if (this._noiseFloorDb === null) {
      this._noiseFloorDb = estimateDb
      return estimateDb
    }

    // Apply exponential moving average (EMA)
    const current = this._noiseFloorDb
    const tau = estimateDb > current ? this._attackMs : this._releaseMs
    // dt and tau are in ms. Formula: alpha = 1 - exp(-dt / tau)
    // If tau is 0, we jump instantly.
    if (tau <= 0) {
      this._noiseFloorDb = estimateDb
    } else {
      const alpha = 1 - Math.exp(-dt / tau)
      this._noiseFloorDb = current + alpha * (estimateDb - current)
    }

    return this._noiseFloorDb
  }

  reset() {
    this._noiseFloorDb = null
    this._noiseFloorOverride = null
  }

  resetEstimate() {
    this._noiseFloorDb = null
  }

  // --- Static Helpers for Median Calculation ---

  private static _medianInPlace(arr: Float32Array): number {
    const len = arr.length
    if (len === 0) return -Infinity
    const mid = len >> 1
    if (len & 1) {
      return NoiseFloorEstimator._quickselect(arr, mid)
    }
    const a = NoiseFloorEstimator._quickselect(arr, mid - 1)
    const b = NoiseFloorEstimator._quickselect(arr, mid)
    return 0.5 * (a + b)
  }

  private static _quickselect(arr: Float32Array, k: number): number {
    let left = 0
    let right = arr.length - 1
    while (right > left) {
      const mid = (left + right) >> 1
      const a = arr[left]
      const b = arr[mid]
      const c = arr[right]

      // Median-of-three pivot choice
      let pivotIndex
      if (a < b) {
        if (b < c) pivotIndex = mid
        else pivotIndex = a < c ? right : left
      } else {
        if (a < c) pivotIndex = left
        else pivotIndex = b < c ? right : mid
      }

      const pivotNewIndex = NoiseFloorEstimator._partition(arr, left, right, pivotIndex)
      if (k === pivotNewIndex) return arr[k]
      if (k < pivotNewIndex) right = pivotNewIndex - 1
      else left = pivotNewIndex + 1
    }
    return arr[left]
  }

  private static _partition(arr: Float32Array, left: number, right: number, pivotIndex: number): number {
    const pivotValue = arr[pivotIndex]
    let tmp = arr[pivotIndex]
    arr[pivotIndex] = arr[right]
    arr[right] = tmp

    let storeIndex = left
    for (let i = left; i < right; i++) {
      if (arr[i] < pivotValue) {
        tmp = arr[storeIndex]
        arr[storeIndex] = arr[i]
        arr[i] = tmp
        storeIndex++
      }
    }

    tmp = arr[right]
    arr[right] = arr[storeIndex]
    arr[storeIndex] = tmp
    return storeIndex
  }
}
