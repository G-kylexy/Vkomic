## 2025-05-15 - [Global State Optimization]
**Learning:** Frequent updates in a root-level hook (`useDownloads`) trigger re-renders of the entire application (`App` -> `MainView` -> `BrowserView`).
**Action:** When updating state based on frequent events (like progress bars), always check if the *rounded/visible* values have actually changed before creating a new state object reference. This prevents thousands of unnecessary re-renders.
