# 03 — Two Workers + Messaging (post / onMessage)

Spawn two workers and send independent messages to each.

## Main Thread

```ts
import path from 'path'
import { randomUUID } from 'crypto'
import { Multithreaded } from '@tekuconcept/multithreaded'

// ------------------------------------------------------------
// Add worker that spawns a new thread from an inline function

const w1 = Multithreaded.addWorker(randomUUID(), (ctx) => {
    // -- THREAD 1 --
    ctx.post({ type: 'ready', id: ctx.id })
    ctx.onMessage((msg: any) => {
        if (msg.type === 'ping')
            ctx.post({ type: 'pong', n: msg.n, from: ctx.id })
    })

    setInterval(() => process.stdout.write('.'), 250)
})

// ------------------------------------------------------------
// Add worker that spawns in a new thread from a file

const w2 = Multithreaded.addWorkerFile(
    // -- THREAD 2 --
    randomUUID(),
    './demo-worker.ts',
    __dirname,
)

// ------------------------------------------------------------
// listen for messages from each worker

w1.onMessage((msg) => console.log(`[main] w1 ->`, msg))
w2.onMessage((msg) => console.log(`[main] w2 ->`, msg))

// ------------------------------------------------------------
// send independent messages to each worker instance

w1.post({ type: 'ping', n: 1 })
w2.post({ type: 'ping', n: 2 })

setTimeout(() => Multithreaded.terminateWorkers(), 1500)
````

## Worker File (`demo-worker.ts`)

```ts
import { Multithreaded } from '@tekuconcept/multithreaded'

const ctx = Multithreaded.workerContext()
ctx.post({ type: 'ready', id: ctx.id })

ctx.onMessage((msg: any) => {
    if (msg.type === 'ping')
        ctx.post({ type: 'pong', n: msg.n, from: ctx.id })
})

// run work in the background (keep thread alive)
setInterval(() => process.stdout.write('+'), 250)
```

## Notes

* `ThreadedWorker.post(...)` sends messages **to the worker**.
* `ctx.post(...)` sends messages **to the main thread**.
* `ThreadedWorker.onMessage(...)` registers a handler for messages coming **from the worker**.
* `ctx.onMessage(...)` registers a handler for messages coming **from the main thread**.
* Use message envelopes like `{ type: '...' }` so handlers stay predictable.
* Send a "shutdown" message to gracefully shutdown a thread. See more in [08-worker-terminate-detach.md](./08-worker-terminate-detach.md).
