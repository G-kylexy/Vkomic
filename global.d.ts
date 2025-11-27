export {};

declare global {
  interface Window {
    win?: {
      minimize: () => void;
      maximize: () => void;
      close: () => void;
    };
  }
}
