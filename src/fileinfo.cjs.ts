/**
 * File information utilities for CommonJS modules.
 * Provides filename, dirname, extension, and
 * a method to get sibling file paths.
 */

import * as path from 'path'

const filename = __filename
const dirname = __dirname
const ext = path.extname(filename) // will be '.js' in dist/cjs

export const FileInfo = {
    filename,
    dirname,
    ext,
    sibling(basenameNoExt: string) {
        return path.join(dirname, `${basenameNoExt}${ext}`)
    },
} as const
