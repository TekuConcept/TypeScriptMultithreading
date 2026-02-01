/**
 * Placeholder file for the TypeScript compiler.
 * The actual implementations are in
 * fileinfo.mjs.ts and fileinfo.cjs.ts
 * for ESM and CommonJS builds respectively.
 * 
 * This exacts as a psudo wrapper around
 * CJS: __filename and __dirname
 * MJS: fileURLToPath(import.meta.url) and path.dirname()
 * and provides consistent extension and sibling path methods.
 * 
 * IMPORTANT: This file must exist at the same path
 * as the code-file that imports it, so that the
 * relative paths resolve correctly in both CJS and ESM builds.
 */

export declare const FileInfo: {
    filename: string;
    dirname: string;
    ext: string;
    sibling(basenameNoExt: string): string;
}
