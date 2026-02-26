import { performance } from 'node:perf_hooks';

const ITERATIONS = 10000;
const BUFFER_SIZE = 4096; // Typical FFT size
const sourceBuf = new Float32Array(BUFFER_SIZE).fill(0.5);

console.log(`\nBenchmark: Allocating vs Reusing Float32Array (size ${BUFFER_SIZE}, ${ITERATIONS} iterations)\n`);

// 1. Baseline: new Float32Array(buf)
const start1 = performance.now();
let dummy1: Float32Array;
for (let i = 0; i < ITERATIONS; i++) {
  dummy1 = new Float32Array(sourceBuf);
}
const end1 = performance.now();
const time1 = end1 - start1;
console.log(`Baseline (new Float32Array): ${time1.toFixed(2)}ms (${(time1 / ITERATIONS * 1000).toFixed(4)} µs/op)`);

// 2. Optimization: Reusing buffer with .set()
const targetBuf = new Float32Array(BUFFER_SIZE);
const start2 = performance.now();
for (let i = 0; i < ITERATIONS; i++) {
  targetBuf.set(sourceBuf);
}
const end2 = performance.now();
const time2 = end2 - start2;
console.log(`Optimized (reuse buffer + .set): ${time2.toFixed(2)}ms (${(time2 / ITERATIONS * 1000).toFixed(4)} µs/op)`);

const improvement = ((time1 - time2) / time1 * 100).toFixed(2);
console.log(`\nSpeed improvement: ${improvement}%\n`);
