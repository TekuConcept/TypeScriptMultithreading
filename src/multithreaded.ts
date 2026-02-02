import * as path from 'path'
import { randomUUID } from 'crypto'
import {
    Transferable,
    Worker,
    WorkerOptions,
    isMainThread,
    parentPort,
    workerData,
} from 'worker_threads'
import { FileInfo } from './fileinfo.js'
import {
    CreateWorkerOptions,
    ThreadedWorker,
    IThreadObserver,
    ObserverInstance,
    WorkerContext,
    WorkerFunction,
    WorkerHandlers,
    ValueFunction,
    AsyncValueOptions,
    MTMessageType,
} from './types.js'
import { AbortablePromise } from './abortable-promise.js'
import {
    AsyncValueWorkerFileData,
    InlineWorkerData,
    WorkerFileData,
} from './bootstrap-types.js'

const isDev = process.env.NODE_ENV === 'development'

/*********************************************************\
 * Multithreaded Main Thread Abstraction
\*********************************************************/

let _observers: ObserverInstance[] = []
let _workers: ThreadedWorker[] = []

/**
 * Binds a single observer to the specified worker.
 * @param observer The observer to bind
 * @param worker The worker to observe
 */
export function bindObserver(
    observer: IThreadObserver,
    worker: ThreadedWorker
): void {
    // Ignore if same observer
    const existingObserver = _observers.find(
        o => o.instance === observer)
    // Ignore if already observing this worker
    const existingWorker = existingObserver?.workers.find(
        w => w.instance === worker)
    if (existingWorker) return

    const workerHandlers = createWorkerHandlers(
        existingObserver!,
        worker,
    )

    worker.instance.on('message', workerHandlers.handlers.message)
    worker.instance.on('error', workerHandlers.handlers.error)
    worker.instance.on('exit', workerHandlers.handlers.exit)

    if (existingObserver)
        existingObserver.workers.push(workerHandlers)
    else {
        _observers.push({
            instance: observer,
            workers: [workerHandlers],
        })
    }
}

/**
 * Unbinds a single observer from the specified worker.
 * @param observer The observer to unbind
 * @param worker The worker to stop observing
 */
export function unbindObserver(
    observer: IThreadObserver,
    worker: ThreadedWorker
): void {
    // Find existing observer
    const existingObserver = _observers.find(
        o => o.instance === observer)
    if (!existingObserver) return

    // Find existing worker
    const existingWorker = existingObserver.workers.find(
        w => w.instance === worker)
    if (!existingWorker) return

    existingWorker.instance.instance
        .off('message', existingWorker.handlers.message)
    existingWorker.instance.instance
        .off('error', existingWorker.handlers.error)
    existingWorker.instance.instance
        .off('exit', existingWorker.handlers.exit)

    const wIdx = existingObserver.workers.indexOf(existingWorker)
    if (wIdx >= 0)
        existingObserver.workers.splice(wIdx, 1)

    // If no more workers, remove observer entirely
    if (existingObserver.workers.length === 0 &&
        !existingObserver.global
    ) {
        const oIdx = _observers.indexOf(existingObserver)
        if (oIdx >= 0) _observers.splice(oIdx, 1)
    }
}

/**
 * Binds an observer to all current and future workers.
 * @param observer The observer to bind
 */
export function bindObserverAll(observer: IThreadObserver): void {
    _observers.push({
        global: true,
        instance: observer,
        workers: [],
    })

    for (const worker of _workers)
        bindObserver(observer, worker)
}

/**
 * Unbinds an observer from all workers.
 * Automatically disables future bindings
 * and removes the observer if no workers remain.
 * @param observer The observer to unbind
 */
export function unbindObserverAll(observer: IThreadObserver): void {
    const existingObserver = _observers.find(
        o => o.instance === observer)
    if (!existingObserver) return

    // Disable automatic global binding
    // This will automatically be removed if no workers remain
    existingObserver.global = false

    for (const worker of existingObserver.workers)
        unbindObserver(observer, worker.instance)
}

/**
 * Run the provided function on the main thread.
 * This is considered the main entry point for
 * multithreaded applications.
 */
export function main(fn: Function): void
{ if (isMainThread) fn() }

/**
 * Create a new worker thread running the provided function.
 * @param id Worker identifier
 * @param fn Function to run in the worker
 * @param options Creation options eg data to pass to the worker
 * @returns Worker instance wrapper
 * @throws If not called from main thread or fn is not a function
 */
export function addWorker(
    id: string,
    fn: WorkerFunction,
    options: CreateWorkerOptions = {},
): ThreadedWorker {
    if (!isMainThread) throw new Error(
        'addWorker() can only be called on the main thread')

    if (typeof fn !== 'function') throw new TypeError(
        'addWorker(fn, ...) expects a function')

    const data = {
        __mt_kind: 'inlineFn',
        id,
        entry: fn.toString(),
        userData: options.data ?? null,
    } as InlineWorkerData

    return addWorkerHelper(id, data, options.transfer)
}

export function addWorkerFile(
  id: string,
  filename: string,
  options?: CreateWorkerOptions
): ThreadedWorker
export function addWorkerFile(
  id: string,
  filename: string,
  relativeTo?: string,
  options?: CreateWorkerOptions
): ThreadedWorker

/**
 * Create a new worker thread running the specified file.
 * @param id Worker identifier
 * @param filename Path to worker file
 * @param options Creation options eg data to pass to the worker
 * @returns Worker instance wrapper
 * @throws If not called from main thread or file not found
 */
export function addWorkerFile(
    id: string,
    filename: string,
    relOrOpts?: string | CreateWorkerOptions,
    opts?: CreateWorkerOptions,
): ThreadedWorker {
    if (!isMainThread) throw new Error(
        'addWorkerFile() can only be called on the main thread'
    )

    let relativeTo: string | undefined
    let options: CreateWorkerOptions | undefined

    if (relOrOpts === null ||
        relOrOpts === undefined ||
        typeof relOrOpts === 'string'
    ) {
        // Signature: (id, filename, relativeTo?, options?)
        relativeTo = relOrOpts as string | undefined
        options = (opts ?? {}) as CreateWorkerOptions
    } else {
        // Signature: (id, filename, options?)
        relativeTo = undefined
        options = (relOrOpts ?? {}) as CreateWorkerOptions
    }

    const data = {
        __mt_kind: 'workerFile',
        id,
        userData: options.data ?? null
    } as WorkerFileData

    return addFileWorkerHelper(
        id,
        data,
        filename,
        relativeTo,
        options.transfer,
    )
}

export function asyncValue<T = any>(
    fn: ValueFunction<T>,
    options: AsyncValueOptions = {},
): AbortablePromise<T> {
    if (typeof fn !== 'function') throw new TypeError(
        'asyncValue(fn, ...) expects a function')

    const id = `asyncValue-${randomUUID()}`
    const data = {
        __mt_kind: 'asyncValue',
        id,
        entry: fn.toString(),
        userData: options.data ?? null,
    } as InlineWorkerData

    return new AbortablePromise<T>((resolve, reject, signal) => {
        const worker = addWorkerHelper(id, data, options.transfer)

        const cleanup = attachAsyncValueLifecycle(
            worker, resolve, reject)

        // Listen for abort signal to terminate worker
        signal.addEventListener('abort', () => {
            reject(new Error('Operation aborted'))
            cleanup()
        })
    })
}

export function asyncValueFile<T = any>(
    filename: string,
    opts?: AsyncValueOptions,
): AbortablePromise<T>
export function asyncValueFile<T = any>(
    filename: string,
    relativeTo?: string,
    opts?: AsyncValueOptions,
): AbortablePromise<T>

export function asyncValueFile<T = any>(
    filename: string,
    relOrOpts?: string | AsyncValueOptions,
    opts?: AsyncValueOptions,
): AbortablePromise<T> {
    let relativeTo: string | undefined
    let options: AsyncValueOptions | undefined

    if (relOrOpts === null ||
        relOrOpts === undefined ||
        typeof relOrOpts === 'string'
    ) {
        // Signature: (id, filename, relativeTo?, options?)
        relativeTo = relOrOpts as string | undefined
        options = (opts ?? {}) as AsyncValueOptions
    } else {
        // Signature: (id, filename, options?)
        relativeTo = undefined
        options = (relOrOpts ?? {}) as AsyncValueOptions
    }

    const id = `asyncValueFile-${randomUUID()}`
    const data = {
        __mt_kind: 'asyncValueFile',
        id,
        userData: options.data ?? null,
        exportName: options.exportName || 'default',
    } as AsyncValueWorkerFileData

    return new AbortablePromise<T>((resolve, reject, signal) => {
        const worker = addFileWorkerHelper(
            id,
            data,
            filename,
            relativeTo,
            options.transfer,
        )

        const cleanup = attachAsyncValueLifecycle(
            worker, resolve, reject)

        // Listen for abort signal to terminate worker
        signal.addEventListener('abort', () => {
            reject(new Error('Operation aborted'))
            cleanup()
        })
    })
}

/** Get a list of all currently active workers. */
export function getWorkers(): ThreadedWorker[]
{ return _workers.slice() }

/**
 * Terminate workers matching the selector.
 * If no selector is provided, terminates all workers.
 * 
 * Use this to forcefully stop workers when they are
 * no longer needed. For a more graceful shutdown, consider
 * sending a custom message to the worker and letting it
 * exit on its own.
 * 
 * @param selector Function to select workers to terminate.
 */
export function terminateWorkers(
    selector?: (worker: ThreadedWorker) => boolean
): void {
    const toRelease = selector
        ? _workers.filter(selector)
        : _workers.slice()
    for (const worker of toRelease) {
        worker.instance.terminate()
        const idx = _workers.indexOf(worker)
        if (idx >= 0) _workers.splice(idx, 1)
    }
}

/**
 * Terminate a specific worker.
 * @param worker The worker to terminate.
 */
export function terminate(
    worker: ThreadedWorker
): void { terminateWorkers(w => w === worker) }

/**
 * Detach workers matching the selector from the
 * internal worker list without terminating them.
 * If no selector is provided, detaches all workers.
 * 
 * Use this to remove workers from management when
 * you want them to continue running independently
 * without keeping the main thread alive.
 * 
 * @param selector Function to select workers to detach.
 */
export function detachWorkers(
    selector?: (worker: ThreadedWorker) => boolean
): void {
    const toDetach = selector
        ? _workers.filter(selector)
        : _workers.slice()
    for (const worker of toDetach) {
        const idx = _workers.indexOf(worker)
        if (idx >= 0) _workers.splice(idx, 1)
        worker.instance.unref()
    }
}

/**
 * Detach a specific worker from the internal worker list
 * without terminating it.
 * @param worker The worker to detach.
 */
export function detach(
    worker: ThreadedWorker
): void { detachWorkers(w => w === worker) }

/**
 * Get the worker context when running inside a worker thread.
 * @returns Worker context
 * @throws If not called inside a worker thread
 */
export function workerContext(): WorkerContext {
    if (isMainThread) throw new Error(
        'workerContext() can only be used inside a worker'
    )

    return createWorkerContext(
        workerData?.id,
        workerData?.userData ?? null
    )
}

export const Multithreaded = {
    bindObserver,
    unbindObserver,
    bindObserverAll,
    unbindObserverAll,
    main,
    addWorker,
    addWorkerFile,
    asyncValue,
    asyncValueFile,
    getWorkers,
    terminateWorkers,
    detachWorkers,
    workerContext,
} as const

/*********************************************************\
 * Internal Helper Functions
\*********************************************************/

function addWorkerHelper(
    id: string,
    workerData: InlineWorkerData,
    transferList?: Transferable[],
): ThreadedWorker {
    // We run a tiny worker bootstrapper (this same module file),
    // and pass the user function as a string for evaluation in the worker.
    const bootstrap = FileInfo.sibling('multithreaded')
    const execArgv = getExecArgvForFile(bootstrap)
    const env = getEnvForFile(bootstrap)

    const worker = new Worker(
        path.resolve(FileInfo.dirname, 'worker-bootstrap.js'),
        {
            execArgv,
            env,
            workerData,
            transferList,
        }
    )

    const instance = createWorkerInstance(id, worker)
    postAddWorkerSetup(instance)

    return instance
}

function addFileWorkerHelper(
    id: string,
    workerData: WorkerFileData | AsyncValueWorkerFileData,
    filename: string,
    relativeTo?: string,
    transferList?: Transferable[],
): ThreadedWorker {
    const unifiedFilename = unifyFilename(filename, relativeTo)
    const execArgv = getExecArgvForFile(unifiedFilename)
    const env = getEnvForFile(unifiedFilename)

    const workerOptions: WorkerOptions = {
        execArgv,
        env: { ...env, MT_WORKER_ENTRY: unifiedFilename },
        workerData,
        transferList,
    }

    const worker = new Worker(
        /**
         * NOTE: We use a small bootstrap file to set up
         *       the environment (eg ts-node) before
         *       loading the actual worker file.
         */
        path.resolve(FileInfo.dirname, 'worker-bootstrap.js'),
        workerOptions,
    )

    const instance = createWorkerInstance(id, worker)
    postAddWorkerSetup(instance)

    return instance
}

function createWorkerHandlers(
    owner: ObserverInstance,
    worker: ThreadedWorker,
): WorkerHandlers {
    return {
        instance: worker,
        handlers: {
            message: (data: any) => owner.instance.onMessage?.(data, worker),
            error: (error: Error) => owner.instance.onError?.(error, worker),
            exit: (code: number) => owner.instance.onExit?.(code, worker),
        },
    }
}

function createWorkerInstance(
    id: string,
    worker: Worker
): ThreadedWorker {
    return {
        id,
        instance: worker,
        post: (
            msg: any,
            transferList?: readonly Transferable[],
        ) => worker.postMessage(msg, transferList),
        onMessage: (handler: (value: any) => void) =>
            worker.on('message', handler),
        offMessage: (handler: (value: any) => void) =>
            worker.off('message', handler),
    }
}

function createWorkerContext(
    id: string,
    userData: any
): WorkerContext {
    return {
        id,
        userData,
        post: (
            msg: any,
            transferList?: readonly Transferable[],
        ) => parentPort!.postMessage(msg, transferList),
        onMessage: (handler: ((value: any) => void)) =>
            parentPort!.on('message', handler),
        offMessage: (handler: ((value: any) => void)) =>
            parentPort!.off('message', handler),
        keepalive: () => parentPort!.ref(),
        finish: () => parentPort!.unref(),
    }
}

function postAddWorkerSetup(
    worker: ThreadedWorker
) {
    _workers.push(worker)
    attachLifecycle(worker)
}

function attachLifecycle(worker: ThreadedWorker) {
    const globalObservers = _observers.filter(o => o.global)
    for (const obs of globalObservers) {
        const alreadyBound = obs.workers.find(w => w.instance === worker)
        if (!alreadyBound)
            Multithreaded.bindObserver(obs.instance, worker)

        if (obs.instance.onWorkerCreated)
            obs.instance.onWorkerCreated(worker)
    }

    worker.instance.on('exit', () => removeWorker(worker))
}

function attachAsyncValueLifecycle(
    worker: ThreadedWorker,
    resolve: (value: any) => void,
    reject: (reason?: any) => void,
) {
    const cleanup = () => {
        worker.instance.removeAllListeners()
        worker.instance.terminate()
        removeWorker(worker)
    }

    worker.instance.on('message', (msg: any) => {
        if (msg.type === MTMessageType.Result) {
            resolve(msg.result)
            // resolve before ack to avoid premature exit-rejection
            worker.post({ __mt_type: MTMessageType.Ack })
            cleanup()
        } else if (msg.type === MTMessageType.Error) {
            reject(new Error(msg.error))
            cleanup()
        }
    })

    worker.instance.on('error', (error: Error) => {
        reject(error)
        cleanup()
    })

    worker.instance.on('exit', (code: number) => {
        if (code !== 0)
            reject(new Error(`Worker exited with code ${code}`))
        else {
            // NOTE: The promise listener may have
            // already resolved/rejected here, so
            // we only reject if still pending.
            reject(new Error('Worker exited before returning a result'))
        }
        cleanup()
    })

    return cleanup
}

function removeWorker(worker: ThreadedWorker) {
    const idx = _workers.indexOf(worker)
    if (idx >= 0) _workers.splice(idx, 1)

    // Unbind from all observers
    for (const obs of _observers) {
        const existingWorker = obs.workers.find(
            w => w.instance === worker)
        if (existingWorker)
            unbindObserver(obs.instance, worker)
    }
}

/**
 * Filename ext will be set to match this file's ext.
 * This is used to help worker threads locate this module.
 * @param filename Filename of the main module entrypoint.
 */
function unifyFilename(
    filename: string,
    relativeTo?: string,
) {
    /**
     * TODO: Right now this enforces the same extension
     *       as this file, eg .ts or .js. In the future,
     *       we may want to support source maps or other
     *       mechanisms to allow workers to load the
     *       correct file type regardless of main file.
     */

    filename = path.isAbsolute(filename)
        ? filename
        : path.resolve(
            relativeTo || process.cwd(),
            filename
        )

    const mainFile = path.basename(filename)
    const mainExt = path.extname(mainFile)
    const thisExt = FileInfo.ext

    if (thisExt !== mainExt) {
        const newName = mainFile.replace(
            new RegExp(`${mainExt}$`),
            thisExt
        )
        return path.join((path.dirname(filename)), newName)
    } else return filename
}

function getExecArgvForTsWorker(): string[] {
    // Prefer resolution through Node so it works with monorepos/workspaces too.
    const tsNodeRegister = require.resolve('ts-node/register')
    const tsConfigPaths = require.resolve('tsconfig-paths/register')

    return ['-r', tsNodeRegister, '-r', tsConfigPaths]
}

function hasTsRuntimeInExecArgv(execArgv: string[]): boolean {
    // Covers common cases:
    // -r ts-node/register
    // --require ts-node/register
    // --loader ts-node/esm (or similar)
    return execArgv.some((arg, i) => {
        const a = arg.toLowerCase()
        const next = (execArgv[i + 1] || '').toLowerCase()

        if (a === '-r' || a === '--require') return next.includes('ts-node')
        if (a.startsWith('-r') || a.startsWith('--require=')) return a.includes('ts-node')
        if (a === '--loader') return next.includes('ts-node')
        if (a.startsWith('--loader=')) return a.includes('ts-node')
        return false
    })
}

function getExecArgvForFile(filename: string): string[] | undefined {
    if (path.extname(filename) !== '.ts') return undefined

    // Only inherit if ts-node (or equivalent) is explicitly present.
    if (hasTsRuntimeInExecArgv(process.execArgv)) {
        if (isDev) console.log(
            'Worker execArgv for TS file: (inherited ts runtime)')
        return undefined
    }

    const args = [
        ...nodeFlagsOnly(process.execArgv),
        ...getExecArgvForTsWorker()
    ]
    if (isDev) console.log('Worker execArgv for TS file:', args)
    return args
}

function nodeFlagsOnly(argv: readonly string[]): string[] {
    const out: string[] = []

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i]

        // Must start with '-' to be a Node flag
        if (!arg.startsWith('-')) continue
        if (arg.startsWith('--project')) continue

        out.push(arg)

        // Preserve flag values for flags that take a value
        if (
            arg === '-r' ||
            arg === '--require' ||
            arg === '--loader' ||
            arg === '--inspect-port' ||
            arg === '--project'
        ) {
            const next = argv[i + 1]
            if (next && !next.startsWith('-')) {
                out.push(next)
                i++ // skip consumed value
            }
        }
    }

    return out
}

function getEnvForFile(filename: string): NodeJS.ProcessEnv {
    if (path.extname(filename) !== '.ts') return process.env

    // Only inherit if ts-node (or equivalent) is explicitly present.
    if (hasTsRuntimeInExecArgv(process.execArgv)) {
        if (isDev) console.log(
            'Worker env for TS file: (inherited ts runtime)')
        return process.env
    }

    if (isDev) console.log('Worker env for TS file: (added TS_NODE_PROJECT)')
    return {
        ...process.env,
        TS_NODE_PROJECT: path.resolve(process.cwd(), 'tsconfig.json'),
    }
}
