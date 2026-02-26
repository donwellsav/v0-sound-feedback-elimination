const { performance } = require('perf_hooks');

function findFundamentalOriginal(freq, allDetections) {
  for (const other of allDetections) {
    if (Math.abs(other.frequency - freq) < 5) continue
    for (const multiplier of [2, 3, 4]) {
      const expected = other.frequency * multiplier
      const ratio = freq / expected
      if (ratio > 0.97 && ratio < 1.03) {
        return other.frequency
      }
    }
  }
  return null
}

function findFundamentalOptimized(freq, sortedDetections) {
  for (const multiplier of [4, 3, 2]) {
    const target = freq / multiplier
    let low = 0
    let high = sortedDetections.length - 1

    while (low <= high) {
      const mid = Math.floor((low + high) / 2)
      const other = sortedDetections[mid]
      const expected = other.frequency * multiplier
      const ratio = freq / expected

      if (ratio > 0.97 && ratio < 1.03) {
        if (Math.abs(other.frequency - freq) >= 5) {
          return other.frequency
        }
      }

      if (expected < freq) {
        low = mid + 1
      } else {
        high = mid - 1
      }
    }
  }
  return null
}

function runBenchmark(N, useOptimized = false) {
  const allDetections = Array.from({ length: N }, (_, i) => ({
    frequency: 100 + i * 13.12345,
    id: `det-${i}`
  }));
  // allDetections is already sorted by frequency

  const fn = useOptimized ? findFundamentalOptimized : findFundamentalOriginal;

  // Warm up
  for (let i = 0; i < 5; i++) {
    for (const det of allDetections) {
      fn(det.frequency, allDetections);
    }
  }

  const start = performance.now();
  const iterations = 100;
  for (let i = 0; i < iterations; i++) {
    for (const det of allDetections) {
      fn(det.frequency, allDetections);
    }
  }
  const end = performance.now();
  return (end - start) / iterations;
}

const Ns = [100, 200, 400, 800, 1600];
console.log('Original:');
Ns.forEach(N => {
  console.log(`N=${N}: ${runBenchmark(N, false).toFixed(4)}ms`);
});

console.log('\nOptimized:');
Ns.forEach(N => {
  console.log(`N=${N}: ${runBenchmark(N, true).toFixed(4)}ms`);
});
