
# Basic Multithreaded API Reference

This document describes the public API exposed by `multithreaded`. It is intended as a concise reference for developers.

## Core Concepts

### Main Thread

The main thread is responsible for:

* creating and managing workers
* sending messages to workers
* receiving messages and lifecycle events

All worker creation must occur on the _main thread_.

### Worker Thread

Each worker runs in its own V8 isolate and communicates with the main thread through message passing.

Workers receive a `WorkerContext` object that provides:

* an identifier
* optional user data
* messaging utilities

## Entry Point

#### `main(fn: Function): void`

Run the provided function on the main thread.

While one can create workers and perform other operations outside this function's scope, they may not be guaranteed to run on the main thread or otherwise may cause unexpected runtime errors.

This function basically uses the `isMainThread` guard under the hood.

```ts
Multithreaded.main(() => {
    // create workers here
})
```

## Worker Creation

#### `addWorker(id, fn, options?): ThreadedWorker`

Create a new worker thread that executes an inline function.

**Parameters**

* `id` — Unique identifier for the worker
* `fn` — Function executed inside the worker thread
* `options` — Optional configuration (initial user data)

**Throws**

* If called outside the main thread
* If `fn` is not a function

```ts
const worker = Multithreaded.addWorker(
    'worker-1',
    (ctx) => {
        ctx.post({ type: 'ready' })
        // do work
    },
    { data: { role: 'example' } }
)
```

---

#### `addWorkerFile(id, filename, relativeTo?, options?): ThreadedWorker`

Create a new worker thread from a file as the entry-point instead of an inline function.

**Parameters**

* `id` — Unique identifier for the worker
* `filename` — Path to the worker entry file
* `relativeTo` — Optional base directory for resolving the file
* `options` — Optional configuration (initial user data)

**Throws**

* If called outside the main thread
* If the file cannot be resolved

```ts
Multithreaded.addWorkerFile(
    'worker-2',
    './worker.js',
    __dirname
)
```

## Worker Management

#### `getWorkers(): ThreadedWorker[]`

Returns a list of all currently managed workers.

---

#### `terminateWorkers(selector?): void`

Forcefully terminate workers.

If no selector is provided, all workers are terminated.

Use this for immediate shutdown. For graceful shutdowns, send a custom message and allow workers to exit voluntarily.

```ts
Multithreaded.terminateWorkers(w => w.id === 'worker-1')
```

---

#### `detachWorkers(selector?): void`

Detach workers from internal management without terminating them.

Detached workers continue running independently and will no longer keep the main thread alive.

```ts
Multithreaded.detachWorkers()
```


## Observers

Observers allow centralized handling of worker lifecycle events and messages.

#### `bindObserver(observer, worker): void`

Bind an observer to a specific worker.

---

#### `unbindObserver(observer, worker): void`

Remove an observer from a specific worker.

---

#### `bindObserverAll(observer): void`

Bind an observer to all current and future workers.

---

#### `unbindObserverAll(observer): void`

Remove an observer from all workers and disable future bindings.

If no workers remain, the observer is fully removed.

## Worker Context (Worker Thread)

#### `workerContext(): WorkerContext`

Retrieve the worker context from inside a worker thread.

**Throws**

* If called outside a worker thread

```ts
const ctx = Multithreaded.workerContext()
```

## Types

#### `ThreadedWorker`

Represents a managed worker on the main thread.

```ts
interface ThreadedWorker {
    id: string
    instance: Worker

    post(msg: any): void
    onMessage(handler: (value: any) => void): void
    offMessage(handler: (value: any) => void): void
}
```

---

#### `WorkerContext`

Provided to worker functions to enable messaging and access user data.

**Note:** memory for user data is not shared between threads. Any changes to user data within a worker thread will not be reflected on the main thread.

```ts
interface WorkerContext {
    id: string
    userData: any

    post(msg: any): void
    onMessage(handler: (value: any) => void): void
    offMessage(handler: (value: any) => void): void
}
```

---

#### `IThreadObserver`

Observer interface for monitoring worker lifecycle events.

```ts
interface IThreadObserver {
    onWorkerCreated?(worker: ThreadedWorker): void
    onMessage?(data: any, worker: ThreadedWorker): void
    onError?(error: Error, worker: ThreadedWorker): void
    onExit?(code: number, worker: ThreadedWorker): void
}
```

---

#### `CreateWorkerOptions`

Optional configuration for worker creation. Here is were
user-data may be passed for setup, initialization, context, etc.

```ts
interface CreateWorkerOptions {
    data?: any
}
```

---

#### `WorkerFunction`

Function shape executed inside a worker thread.

```ts
type WorkerFunction = (ctx: WorkerContext) => void
```


## Notes

* Prefer message-based shutdown over forced termination.
* Observers are ideal for logging, metrics, or centralized message routing.
* Inline workers are convenient for small tasks; file-based workers scale better for complex logic.
* Inline workers are technically invoked as file-based workers, but uses the `multithreaded` file as the anchor point.

_Suggestions and issue-reporting are welcome!_
