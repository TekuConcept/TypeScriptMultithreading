# 01 — Async Value (Inline Function)

Run a function in another thread and await its return value.

## Basic

```ts
import { Multithreaded } from '@tekuconcept/multithreaded'

const value = await Multithreaded.asyncValue<number>(() => {
    return 42
})

console.log(value) // 42
````

The function runs in a worker thread.
The returned value is resolved as a promise.

## With Input Data

```ts
const result = await Multithreaded.asyncValue<number>(
    (data) => data.a + data.b,
    { data: { a: 20, b: 22 } },
)

console.log(result) // 42
```

`data` is serialized and passed to the worker before execution.

## Async Functions Are Supported

```ts
const value = await Multithreaded.asyncValue(async () => {
    await new Promise(r => setTimeout(r, 100))
    return 42
})
```

The function may return a value or a promise.

## Abort and Timeout

`asyncValue` returns an `AbortablePromise`.

```ts
const p = Multithreaded.asyncValue(() => {
    // long-running work
    while (true) {}
})

// Abort manually
p.abort(new Error('Cancelled'))

// Or set a timeout
const value = await Multithreaded
    .asyncValue(() => 42)
    .timeout(500)
```

Aborting rejects the promise and terminates the underlying worker execution.

## Notes

* No worker handle is returned — this is a one-shot task.
* Use [`asyncValueFile`](./02-async-value-file.md) when the function must live in its own file or must be broken up into smaller functions. This function must be self-contained with no external references.
* For long-lived or message-driven work, use [`addWorker`](./03-two-workers-messaging.md) instead.
