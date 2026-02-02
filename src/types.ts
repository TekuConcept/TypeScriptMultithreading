import { Transferable, Worker } from 'worker_threads'

export interface ThreadedWorker {
    /** The unique identifier of this worker. */
    id: string
    /** The underlying Worker instance. */
    instance: Worker
    /**
     * Send a message to the worker.
     * @param msg The message to send
     * @param transferList Optional list of Transferable objects to
     *                     transfer to the worker rather than copy.
     */
    post: (msg: any, transferList?: readonly Transferable[]) => void
    /**
     * Register a message handler for messages from the worker.
     * See also `IThreadObserver.onMessage()`.
     */
    onMessage: (handler: (value: any) => void) => void
    /** Unregister a message handler. */
    offMessage: (handler: (value: any) => void) => void
}

export interface IThreadObserver {
    /**
     * Called when a new worker is created.
     * NOTE: This is only called when the observer
     *       is globally bound via bindObserverAll().
     * @param worker The created worker
     */
    onWorkerCreated?: (worker: ThreadedWorker) => void

    /**
     * Called when a message is received from a worker.
     * @param data The message data send by the worker
     * @param worker The worker that sent the message
     */
    onMessage?: (data: any, worker: ThreadedWorker) => void

    /**
     * Called when an error occurs in a worker.
     * @param error The error that occurred
     * @param worker The worker that encountered the error
     */
    onError?: (error: Error,  worker: ThreadedWorker) => void

    /**
     * Called when a worker exits.
     * @param code The exit code (0 = success)
     * @param worker The worker that exited
     */
    onExit?: (code: number, worker: ThreadedWorker) => void
}

export interface WorkerContext {
    /** The unique identifier of this worker. */
    id: string
    /** User-defined data passed when creating the worker. */
    userData: any
    /**
     * Send a message to the main thread.
     * @param msg The message to send
     * @param transferList Optional list of Transferable objects to
     *                     transfer to the main thread rather than copy.
     */
    post: (msg: any, transferList?: readonly Transferable[]) => void
    /** Register a message handler for messages from the main thread. */
    onMessage: (handler: (value: any) => void) => void
    /** Unregister a message handler. */
    offMessage: (handler: (value: any) => void) => void
    /**
     * Keep the worker alive when there are no more tasks.
     * Call this method to prevent the worker from exiting.
     * 
     * If listeners are attached or removed using `.onMessage()`,
     * the thread is kept alive or permitted to finish automatically
     * depending on whether listeners for the event exist.
     */
    keepalive: () => void
    /**
     * Allow the worker to exit when there are no more tasks.
     * Call this method to let the worker finish.
     * 
     * If listeners are attached or removed using `.onMessage()`,
     * the thread is kept alive or permitted to finish automatically
     * depending on whether listeners for the event exist.
     */
    finish: () => void
}

export interface CreateWorkerOptions {
    /**
     * User-defined data to pass to the worker
     * via the WorkerContext.userData property.
     */
    data?: any
    /**
     * Transferable objects to transfer to the worker.
     * NOTE: The sender loses access to these objects.
     */
    transfer?: Transferable[]
}

export interface AsyncValueOptions {
    /** User-defined data to pass to the worker. */
    data?: any
    /**
     * Transferable objects to transfer to the worker.
     * NOTE: The sender loses access to these objects.
     */
    transfer?: Transferable[]
    /**
     * The name of the export to invoke.
     * Defaults to "default".
     * 
     * (Not used with the asyncValue function)
     */
    exportName?: string
}

export interface Handlers {
    message: (data: any) => void
    error: (error: Error) => void
    exit: (code: number) => void
}

export interface WorkerHandlers {
    instance: ThreadedWorker
    handlers: Handlers
}

export interface ObserverInstance {
    global?: boolean
    instance: IThreadObserver
    workers: WorkerHandlers[]
}

/**
 * The function that will be executed inside the worker thread.
 * @param ctx The worker context providing id,
 *            userData, and messaging methods
 */
export type WorkerFunction = (ctx: WorkerContext) => void

/**
 * A function that returns a value of type T.
 */
export type ValueFunction<T> = (data?: any) => T | Promise<T>

export enum MTMessageType {
    Result = 'mt:result',
    Error = 'mt:error',
    Ack = 'mt:ack',
}
