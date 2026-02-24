## BOLT'S JOURNAL - CRITICAL LEARNINGS ONLY

This journal is for capturing critical performance learnings, anti-patterns, and architectural discoveries.

## 2025-02-18 - [AppHeader Refactor]
**Learning:** High-frequency updates (60fps rmsLevel) in the root component were causing the entire `AppHeader` and its children (including complex `SettingsPanel`) to re-render.
**Action:** Decomposed `AppHeader` into memoized sub-components (`HeaderControls`, `HeaderLogo`) to isolate the high-frequency updates to a small `HeaderStatus` component. Use this pattern whenever mixing high-frequency data with static controls.
