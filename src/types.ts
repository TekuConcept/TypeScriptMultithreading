import { Worker } from 'worker_threads'

export interface IThreadedWorker {
    id: string
    instance: Worker
}

export interface IThreadObserver {
    /**
     * Called when a new worker is created.
     * NOTE: This is only called when the observer
     *       is globally bound via bindObserverAll().
     * @param worker The created worker
     */
    onWorkerCreated?: (worker: IThreadedWorker) => void

    /**
     * Called when a message is received from a worker.
     * @param data The message data send by the worker
     * @param worker The worker that sent the message
     */
    onMessage?: (data: any, worker: IThreadedWorker) => void

    /**
     * Called when an error occurs in a worker.
     * @param error The error that occurred
     * @param worker The worker that encountered the error
     */
    onError?: (error: Error,  worker: IThreadedWorker) => void

    /**
     * Called when a worker exits.
     * @param code The exit code (0 = success)
     * @param worker The worker that exited
     */
    onExit?: (code: number, worker: IThreadedWorker) => void
}

export interface WorkerContext {
    id: string
    userData: any
    post: (msg: any) => void
    onMessage: (handler: (value: any) => void) => void
}

export interface CreateWorkerOptions {
    data?: any
}

export interface Handlers {
    message: (data: any) => void
    error: (error: Error) => void
    exit: (code: number) => void
}

export interface WorkerHandlers {
    instance: IThreadedWorker
    handlers: Handlers
}

export interface ObserverInstance {
    global?: boolean
    instance: IThreadObserver
    workers: WorkerHandlers[]
}

export type WorkerFunction = (ctx: WorkerContext) => void
