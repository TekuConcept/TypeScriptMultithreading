/**
 * File information utility for ESM modules.
 * Provides filename, dirname, extension, and
 * a method to get sibling file paths.
 */

import * as path from 'path'
import { fileURLToPath } from 'url'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const ext = path.extname(filename) // will be '.js' in dist/esm

export const FileInfo = {
    filename,
    dirname,
    ext,
    sibling(basenameNoExt: string) {
        return path.join(dirname, `${basenameNoExt}${ext}`)
    },
} as const
