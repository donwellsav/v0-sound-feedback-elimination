# KillTheRing – TypeScript Safety Fix Overlay

This overlay fixes two engineering red flags in `donwellsav/v0-sound-feedback-elimination`:

1) Removes `typescript.ignoreBuildErrors: true` from `next.config.mjs`
   - so `next build` will fail on real TypeScript errors (safer deployments)

2) Removes `@ts-expect-error` for `lib/FeedbackDetector.js`
   - by adding a proper `lib/FeedbackDetector.d.ts` declaration file
   - and updating `hooks/use-audio-engine.ts` to use real types + null guards

## How to apply

### Option A (simplest): copy/overwrite files
Unzip this overlay into the **root of your repo** (same folder as `package.json`).
It will:
- overwrite: `next.config.mjs`, `tsconfig.json`, `package.json`, `hooks/use-audio-engine.ts`
- add: `lib/FeedbackDetector.d.ts`

### Option B: apply selectively
If you don’t want to overwrite `package.json`, just manually add:
`"typecheck": "tsc --noEmit"` to `scripts`.

## Verify

Using pnpm:
- `pnpm install`
- `pnpm run typecheck`
- `pnpm run build`

Using npm:
- `npm install`
- `npm run typecheck`
- `npm run build`
