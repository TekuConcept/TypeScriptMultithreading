'use strict'

// Only for dev scenarios where MT_WORKER_ENTRY is TS
if (/\.(ts|tsx|mts|cts)$/.test(process.env.MT_WORKER_ENTRY ?? '')) {
    require('ts-node/register')
    require('tsconfig-paths/register')
}

require(process.env.MT_WORKER_ENTRY as string)
