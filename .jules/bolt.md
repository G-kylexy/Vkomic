## 2024-05-22 - Prevent Redundant Re-renders in High-Frequency Hooks
**Learning:** React state updates trigger re-renders even if the new state object has identical values (but different reference). In high-frequency event handlers (like download progress @ 5Hz), this causes significant performance overhead for the entire app.
**Action:** Always verify if the *values* have actually changed before creating a new object reference in state updaters, especially for rounded/formatted values.
