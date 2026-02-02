# 04 — Observers (Worker-Specific and Global)

Observe worker lifecycle events and messages without wiring handlers on every worker.

## Global Observer

Global observers automatically bind to **all existing and future workers**.

```ts
import {
    Multithreaded,
    IThreadObserver,
} from '@tekuconcept/multithreaded'

class Logger implements IThreadObserver {
    onWorkerCreated(worker) {
        console.log('[observer] created', worker.id)
    }

    onMessage(data, worker) {
        console.log('[observer] message from', worker.id, data)
    }

    onError(error, worker) {
        console.error('[observer] error from', worker.id, error)
    }

    onExit(code, worker) {
        console.log('[observer] exit', worker.id, code)
    }
}

Multithreaded.bindObserverAll(new Logger())
````

Once bound, the observer will receive events from every worker.

## Worker-Specific Observer

Bind an observer to a single worker instance.

```ts
const observer = {
    onMessage(data, worker) {
        console.log('[observer] w1 ->', data)
    },
}

const w1 = Multithreaded.addWorker('w1', (ctx) => {
    ctx.post('ready')
})

Multithreaded.bindObserver(observer, w1)
```

Only events from `w1` will be reported.

## Unbinding

```ts
Multithreaded.unbindObserver(observer, w1)
Multithreaded.unbindObserverAll(observer)
```

* `unbindObserver` removes the observer from a single worker.
* `unbindObserverAll` removes it from all workers and disables future auto-binding.

## Notes

* Observers are **passive**: they do not replace `post` / `onMessage`.
* Use observers for logging, tracing, metrics, or debugging.
* Use direct `onMessage` handlers when worker-specific logic is required.
