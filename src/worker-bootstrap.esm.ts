'use strict'

import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const entry = process.env.MT_WORKER_ENTRY as string
if (!entry) throw new Error('MT_WORKER_ENTRY is not set')

// If dev scenario: entry is TS, we need to load ts-node from ESM.
// ESM can’t use bare require, so use createRequire.
if (/\.(ts|tsx|mts|cts)$/.test(entry)) {
    const require = createRequire(import.meta.url)
    require('ts-node/register')
    require('tsconfig-paths/register')
}

// ESM-friendly load. Works for ESM targets, and also works for CJS targets
// (Node can import CJS and will execute it, exposing default/namespace exports).
await import(pathToFileURL(entry).href)
