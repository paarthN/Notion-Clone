/// <reference types="vite/client" />

export const modules = import.meta.glob([
  "./**/*.ts",
  "./**/*.js",
  "!./**/*.test.ts",
  "!./**/*.d.ts",
  "!./components/**",
]);

export const prosemirrorModules = import.meta.glob(
  "./components/prosemirrorSync/**/*.ts",
);
