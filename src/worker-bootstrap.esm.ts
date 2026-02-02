'use strict'

import { pathToFileURL } from 'url'
import { createRequire } from 'module'
import { parentPort, workerData } from 'worker_threads'
import type {
    AsyncValueWorkerFileData,
    InlineWorkerData,
    WorkerData,
} from './bootstrap-types.js'
import {
    WorkerContext,
    MTMessageType,
} from './types.js'

const KEEPALIVE_INT = 1 << 30

;(async () => {
    const ud = workerData! as WorkerData

    if (!ud || typeof ud !== 'object' || !('__mt_kind' in ud))
    { throw new Error('Invalid workerData received') }

    const target = ud.__mt_kind
    switch (target) {
    case 'inlineFn': await runInline(); break
    case 'workerFile': await runWorkerFile(); break
    case 'asyncValue': await runInline(); break
    case 'asyncValueFile': await runAsyncValueFile(); break
    default: throw new Error(`Unsupported worker kind: ${target}`)
    }
})()

function serializeError(e: any) {
    return {
        name: e.name ?? 'Error',
        message: e.message ?? String(e),
        stack: e.stack ?? '',
    }
}

function getWorkerFileEntry() {
    const entry = process.env.MT_WORKER_ENTRY
    if (!entry) throw new Error('MT_WORKER_ENTRY is not set')

    // Only for dev scenarios where MT_WORKER_ENTRY is TS
    // ESM can’t use bare require, so use createRequire.
    if (/\.(ts|tsx|mts|cts)$/.test(entry)) {
        const require = createRequire(import.meta.url)
        require('ts-node/register')
        require('tsconfig-paths/register')
    }

    return entry
}

function createWorkerContext(
    id: string,
    userData: any
): WorkerContext {
    return {
        id,
        userData,
        post: (msg: any) => parentPort!.postMessage(msg),
        onMessage: (handler: ((value: any) => void)) =>
            parentPort!.on('message', handler),
        offMessage: (handler: ((value: any) => void)) =>
            parentPort!.off('message', handler),
    }
}

async function runInline() {
    if (!parentPort) throw new Error('Missing parentPort in worker')
    const {
        __mt_kind,
        id,
        entry,
        userData,
    } = workerData as InlineWorkerData

    let fn: (ctx: any) => any
    // Wrap in parens so 'function () {}' parses as an expression
    try { fn = (0, eval)(`(${entry})`) }
    catch (e) {
        parentPort.postMessage({
            type: MTMessageType.Error,
            stage: 'eval',
            id,
            error: serializeError(e),
        })
        setImmediate(() => process.exit(1))
        return
    }

    // Provide a small context object to the function
    const ctx = createWorkerContext(id, userData)

    let result: any
    try {
        result = (__mt_kind === 'asyncValue')
            ? fn(userData)
            : fn(ctx)
        const value = await Promise.resolve(result)

        if (__mt_kind === 'asyncValue') {
            const keepalive = setInterval(() => {}, KEEPALIVE_INT)
            ctx.onMessage((message) => {
                if (message && message.__mt_type === MTMessageType.Ack) {
                    clearInterval(keepalive)
                    setImmediate(() => process.exit(0))
                }
            })
        } // else don't exit immediately; let the user code decide when to exit

        ctx.post({ type: MTMessageType.Result, result: value })
    } catch (e) {
        parentPort.postMessage({
            type: MTMessageType.Error,
            stage: 'run',
            id,
            error: serializeError(e),
        })
        setImmediate(() => process.exit(1))
    }
}

async function runWorkerFile() {
    const entry = getWorkerFileEntry()
    // ESM-friendly load. Works for ESM targets,
    // and also works for CJS targets
    // (Node can import CJS and will execute it,
    // exposing default/namespace exports).
    await import(pathToFileURL(entry).href)
}

async function runAsyncValueFile() {
    const entry = getWorkerFileEntry()
    const { id, exportName, userData } = workerData as AsyncValueWorkerFileData

    try {
        const mod = await import(pathToFileURL(entry).href)
        const name = exportName || 'default'
        const fn =
            (mod && typeof mod[name] === 'function' && mod[name]) ||
            null

        if (!fn) {
            throw new Error(
                `Export "${name}" not found in module "${entry}"`,
            )
        }

        const ctx = createWorkerContext(id, userData)
        const result = fn(userData)
        const value = await Promise.resolve(result)

        const keepalive = setInterval(() => {}, KEEPALIVE_INT)
        ctx.onMessage((message) => {
            if (message && message.__mt_type === MTMessageType.Ack) {
                setImmediate(() => process.exit(0))
                clearInterval(keepalive)
            }
        })
        ctx.post({ type: MTMessageType.Result, result: value })
    } catch (e) {
        parentPort!.postMessage({
            type: MTMessageType.Error,
            stage: 'run',
            id,
            error: serializeError(e),
        })
        setImmediate(() => process.exit(1))
    }
}
