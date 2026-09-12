// Minimal declarations for the Node built-ins the tests use (@types/node is not
// a dependency of this project).

declare module "node:fs" {
  export function readFileSync(path: string): Uint8Array;
  export function readFileSync(path: string, encoding: "utf8"): string;
  export function writeFileSync(path: string, data: Uint8Array | string): void;
  export function existsSync(path: string): boolean;
  export function readdirSync(path: string): string[];
}

declare module "node:zlib" {
  export function gunzipSync(data: Uint8Array): Uint8Array;
  export function gzipSync(data: Uint8Array | string): Uint8Array;
}

declare module "node:url" {
  export function fileURLToPath(url: string | URL): string;
}

declare module "node:path" {
  export function resolve(...parts: string[]): string;
  export function dirname(p: string): string;
  export function basename(p: string, ext?: string): string;
  export function join(...parts: string[]): string;
}
