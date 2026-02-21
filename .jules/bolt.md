## 2025-05-21 - [BrowserView List Iteration]
**Learning:** The `BrowserView` component iterates over all `fileNodes` (which can be thousands) on every download progress tick to compute `activeDownloadsInView`. This causes main thread blocking during downloads in large folders.
**Action:** Inverted the loop logic: iterate over the much smaller `downloads` list and perform O(1) lookups in a memoized `fileNodesMap`. Always check loop complexity in frequently updated components.
