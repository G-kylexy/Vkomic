## 2026-02-19 - Unintentional Component Unmounting
**Learning:** Comments in `MainView.tsx` claimed `BrowserView` was "ALWAYS mounted" to preserve state, but the `if/else` logic actually unmounted it when inactive. This defeated the purpose of `searchIndex` caching (via `useRef`) and scroll preservation.
**Action:** Always verify if render logic matches the intended behavior described in comments, especially for conditional rendering intended to hide/show components.
