import * as path from 'path'
import {
    Worker,
    isMainThread,
    parentPort,
    workerData,
} from 'worker_threads'
import {
    CreateWorkerOptions,
    IThreadedWorker,
    IThreadObserver,
    ObserverInstance,
    WorkerContext,
    WorkerFunction,
    WorkerHandlers,
} from './types'

const isDev = process.env.NODE_ENV === 'development'

/*********************************************************\
 * Multithreaded Main Thread Abstraction
\*********************************************************/

let _observers: ObserverInstance[] = []
let _workers: IThreadedWorker[] = []

export namespace Multithreaded {
    /**
     * Binds a single observer to the specified worker.
     * @param observer The observer to bind
     * @param worker The worker to observe
     */
    export function bindObserver(
        observer: IThreadObserver,
        worker: IThreadedWorker
    ) {
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
        worker: IThreadedWorker
    ) {
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
    export function bindObserverAll(observer: IThreadObserver) {
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
    export function unbindObserverAll(observer: IThreadObserver) {
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
    export function main(fn: Function)
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
    ) {
        if (!isMainThread) throw new Error(
            'addWorker() can only be called on the main thread')
        if (typeof fn !== 'function') throw new TypeError(
            'addWorker(fn, ...) expects a function')

        // We run a tiny worker bootstrapper (this same module file),
        // and pass the user function as a string for evaluation in the worker.
        // const bootstrap = path.join(__dirname, 'multithreaded.js')
        const bootstrap = __filename
        const execArgv = getExecArgvForFile(bootstrap)
        const env = getEnvForFile(bootstrap)

        const instance = new Worker(bootstrap, {
            execArgv, env,
            workerData: {
                __mt_kind: 'inlineFn',
                id,
                fnSource: fn.toString(),
                userData: options.data ?? null,
            },
        })

        const worker = { id, instance }
        postAddWorkerSetup(worker)

        return worker
    }

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
        relativeTo?: string,
        options: CreateWorkerOptions = {},
    ) {
        if (!isMainThread) throw new Error(
            'addWorkerFile() can only be called on the main thread'
        )

        const unifiedFilename = unifyFilename(filename, relativeTo)
        const execArgv = getExecArgvForFile(unifiedFilename)
        const env = getEnvForFile(unifiedFilename)

        const instance = new Worker(
            /**
             * NOTE: We use a small bootstrap file to set up
             *       the environment (eg ts-node) before
             *       loading the actual worker file.
             * 
             * While technically we could pass the filename
             * directly to the Worker constructor, this helps
             * ensure that workers can run TypeScript files
             * directly when needed - avoiding any gotchas
             * with module resolution or runtime setup.
             */
            path.resolve(__dirname, 'worker-bootstrap.js'),
            {
                execArgv,
                env: { ...env, MT_WORKER_ENTRY: unifiedFilename },
                workerData: {
                    id,
                    userData: options.data ?? null
                },
            }
        )

        const worker = { id, instance }
        postAddWorkerSetup(worker)

        return worker
    }

    export function getWorkers(): IThreadedWorker[]
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
        selector?: (worker: IThreadedWorker) => boolean
    ) {
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
        selector?: (worker: IThreadedWorker) => boolean
    ) {
        const toDetach = selector
            ? _workers.filter(selector)
            : _workers.slice()
        for (const worker of toDetach) {
            const idx = _workers.indexOf(worker)
            if (idx >= 0) _workers.splice(idx, 1)
        }
    }

    /**
     * Get the worker context when running inside a worker thread.
     * @returns Worker context
     * @throws If not called inside a worker thread
     */
    export function workerContext() {
        if (isMainThread) throw new Error(
            'workerContext() can only be used inside a worker'
        )

        return {
            id: workerData?.id,
            userData: workerData?.userData ?? null,
            post: (msg: any) => parentPort!.postMessage(msg),
            onMessage: (
                handler: ((value: any) => void)
            ) => parentPort!.on('message', handler),
        }
    }
}

function createWorkerHandlers(
    owner: ObserverInstance,
    worker: IThreadedWorker,
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

function postAddWorkerSetup(
    worker: IThreadedWorker
) {
    _workers.push(worker)
    attachLifecycle(worker)
}

function attachLifecycle(worker: IThreadedWorker) {
    const globalObservers = _observers.filter(o => o.global)
    for (const obs of globalObservers) {
        const alreadyBound = obs.workers.find(w => w.instance === worker)
        if (!alreadyBound)
            Multithreaded.bindObserver(obs.instance, worker)

        if (obs.instance.onWorkerCreated)
            obs.instance.onWorkerCreated(worker)
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

    const thisFile = path.basename(__filename)
    const mainFile = path.basename(filename)

    const thisExt = path.extname(thisFile)
    const mainExt = path.extname(mainFile)

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

/*********************************************************\
 * Multithreaded Worker Abstraction
\*********************************************************/

/**
 * Internal worker bootstrap:
 * If this file is started as a worker with __mt_kind=inlineFn,
 * it evaluates and executes the provided function.
 */
function runInlineWorker() {
    if (!workerData || workerData.__mt_kind !== 'inlineFn') return

    if (!parentPort) throw new Error('Missing parentPort in worker')
    const { id, fnSource, userData } = workerData

    let fn: (ctx: WorkerContext) => void
    try {
        // Wrap in parens so 'function () {}' parses as an expression
        fn = (0, eval)(`(${fnSource})`)
    } catch (e) {
        parentPort.postMessage({
            type: 'mt:error',
            stage: 'eval',
            id, error: String(e)
        })
        throw e
    }

    // Provide a small context object to the function
    const ctx = {
        id,
        userData,
        post: (msg: any) => parentPort!.postMessage(msg),
        onMessage: (
            handler: ((value: any) => void)
        ) => parentPort!.on('message', handler),
    }

    try { fn(ctx) }
    catch (e) {
        parentPort.postMessage({
            type: 'mt:error',
            stage: 'run',
            id, error: String(e)
        })
        throw e
    }
}

if (!isMainThread) runInlineWorker()
