## 2025-02-18 - Unintentional Unmounting defeats Memoization
**Learning:** Components wrapped in conditional rendering (e.g., `if (isActive) return <Comp />`) are unmounted when the condition is false, causing state loss (scroll position, refs) and defeating optimizations like `useMemo` caches. `display: none` preserves state and cache but keeps memory usage.
**Action:** Always check if a heavy component is intended to persist state (like scroll or cache) when conditionally rendering it. Use CSS visibility control instead of conditional rendering for such cases.
