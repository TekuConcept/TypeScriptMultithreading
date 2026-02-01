
export class AbortError extends Error {
    name = 'AbortError'
    constructor(message = 'Aborted') { super(message) }
}

export type Executor<T> = (
    resolve: (value: T | PromiseLike<T>) => void,
    reject: (reason?: any) => void,
    signal: AbortSignal,
) => void | PromiseLike<void>

export class AbortablePromise<T> extends Promise<T> {
    private readonly controller = new AbortController()
    private _reject!: (reason?: any) => void
    private settled = false

    constructor(executor: Executor<T>) {
        let resolveFn!: (value: T | PromiseLike<T>) => void
        let rejectFn!: (reason?: any) => void

        super((resolve, reject) => {
            resolveFn = resolve
            rejectFn = reject
        })

        this.controller = new AbortController()
        this._reject = rejectFn

        const resolve = (v: T | PromiseLike<T>) => {
            if (this.settled) return
            this.settled = true
            resolveFn(v)
        }

        const reject = (e?: any) => {
            if (this.settled) return
            this.settled = true
            rejectFn(e)
        }

        try {
            const maybe = executor(resolve, reject, this.controller.signal)
            // If executor returns a promise, attach a
            // rejection handler so it can't go 'unhandled'.
            if (maybe && typeof (maybe as any).then === 'function')
            { (maybe as PromiseLike<void>).then(() => {}, reject) }
        } catch (e) { reject(e) }
    }

    // Ensure .then/.catch/.finally return AbortablePromise (not Promise)
    static get [Symbol.species]() { return this }
    /** Get the AbortSignal associated with this promise. */
    get signal(): AbortSignal { return this.controller.signal }

    /**
     * Abort the promise with an optional reason.
     * @param reason The abort reason.
     */
    abort(reason: unknown = new AbortError()): void {
        if (this.settled) return
        this.controller.abort(reason)
        this._reject(reason)
    }

    /**
     * Set a timeout to automatically abort
     * the promise after `ms` milliseconds.
     * @param ms Number of milliseconds to wait.
     * @param reason The abort reason.
     * @returns The chainable AbortablePromise instance.
     */
    timeout(
        ms: number,
        reason: unknown = new Error(`Timeout after ${ms}ms`),
    ): AbortablePromise<T> {
        const id = setTimeout(() => this.abort(reason), ms)

        // Attach cleanup in a way that can't create an unhandled rejection:
        // the returned promise resolves regardless of original outcome.
        this.then(
            () => { clearTimeout(id) },
            () => { clearTimeout(id) }
        )

        return this
    }
}
