import { readFile } from 'node:fs/promises';
import path from 'node:path';

// Serves the ZXing barcode-reader WebAssembly used by the asset-tag scanner on browsers without a native
// BarcodeDetector (iPhone, desktop). Self-hosted so scanning doesn't depend on a third-party CDN.
// Public, versioned by the ?v= query the client adds, so it can be cached for a year.
export async function GET() {
  const wasm = await readFile(path.join(process.cwd(), 'node_modules', 'zxing-wasm', 'dist', 'reader', 'zxing_reader.wasm'));
  return new Response(new Uint8Array(wasm), {
    headers: { 'Content-Type': 'application/wasm', 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' },
  });
}
