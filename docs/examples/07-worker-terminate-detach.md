# 07 — Worker Terminate / Detach (Lifecycle Control)

Stop workers forcefully, or detach them from management.

## Terminate a Specific Worker

```ts
import { Multithreaded } from '@tekuconcept/multithreaded'

const w = Multithreaded.addWorker('w1', (ctx) => {
    setInterval(() => process.stdout.write('.'), 250)
})

setTimeout(() => {
    Multithreaded.terminate(w)
}, 1500)
````

## Terminate Many Workers (Selector)

```ts
// terminate only workers whose id starts with "job-"
Multithreaded.terminateWorkers(w => w.id.startsWith('job-'))

// terminate all workers
Multithreaded.terminateWorkers()
```

## Detach a Specific Worker

Detaching removes the worker from the internal worker list **without terminating it**.

```ts
import { Multithreaded } from '@tekuconcept/multithreaded'

const w = Multithreaded.addWorker('w1', (ctx) => {
    setInterval(() => process.stdout.write('+'), 250)
})

setTimeout(() => {
    Multithreaded.detach(w)
    console.log('[main] detached w1 (still running)')
}, 1000)
```

## Detach Many Workers (Selector)

```ts
// detach only workers that match a condition
Multithreaded.detachWorkers(w => w.id.includes('background'))

// detach all workers
Multithreaded.detachWorkers()
```

## Notes / Warnings

* Prefer `Multithreaded.terminate(...)` / `terminateWorkers(...)` over calling:

  * `worker.instance.terminate()`
* Prefer `Multithreaded.detach(...)` / `detachWorkers(...)` over calling:

  * `worker.instance.unref()`
* Avoid removing all event listeners from `worker.instance`.

Doing any of the above outside the `Multithreaded` API can leave internal references in an unnatural state (workers tracked that no longer exist).
