# 06 — SharedArrayBuffer + Atomics (Shared Memory)

Use `SharedArrayBuffer` for true shared memory across threads.

Unlike [transferables](./05-transferables-arraybuffer.md), **both threads keep access** to the same underlying memory.  
Use `Atomics` for safe coordination.

## Pattern: Shared Int32Array

```ts
const memorySize = 4 * Int32Array.BYTES_PER_ELEMENT
const sab = new SharedArrayBuffer(memorySize)
const mem = new Int32Array(sab)

// indices:
//   0 = counter
//   1 = signal
//   2 = payload
//   3 = unused
````

## Worker: Increment Counter Atomically

```ts
import { Multithreaded } from '@tekuconcept/multithreaded'

const memorySize = 4 * Int32Array.BYTES_PER_ELEMENT
const sab = new SharedArrayBuffer(memorySize)

const w = Multithreaded.addWorker(
    'inc', (ctx) => {
        const mem = new Int32Array(ctx.userData.sab)

        // increment counter (index 0) 100_000 times
        for (let i = 0; i < 100_000; i++) {
            Atomics.add(mem, 0, 1)
        }

        ctx.post({ done: true, counter: Atomics.load(mem, 0) })
    },
    { data: { sab } },
)

w.onMessage((msg) => console.log('[main]', msg))
```

Main thread can also read the same memory at any time:

```ts
const mem = new Int32Array(sab)
console.log('counter:', Atomics.load(mem, 0))
```

## Atomic Read / Write

```ts
// write
Atomics.store(mem, 2, 123)

// read
const v = Atomics.load(mem, 2)
```

Use `Atomics` whenever values are shared between threads.

## Wait / Notify (Signal Handshake)

This shows a worker waiting until the main thread signals readiness.

### Main Thread

```ts
import { Multithreaded } from '@tekuconcept/multithreaded'

const memorySize = 4 * Int32Array.BYTES_PER_ELEMENT
const sab = new SharedArrayBuffer(memorySize)
const mem = new Int32Array(sab)

const w = Multithreaded.addWorker(
    'waiter', (ctx) => {
        const mem = new Int32Array(ctx.userData.sab)

        // wait until signal (index 1) changes from 0 -> 1
        Atomics.wait(mem, 1, 0)

        // read payload (index 2) after waking
        const payload = Atomics.load(mem, 2)

        ctx.post({ awoke: true, payload })
    },
    { data: { sab } },
)

w.onMessage((msg) => console.log('[main]', msg))

// set payload, then signal + notify
Atomics.store(mem, 2, 42)
Atomics.store(mem, 1, 1)
Atomics.notify(mem, 1, 1)
```

### Notes on `wait`

* `Atomics.wait(typedArray, index, expectedValue)` blocks the **calling thread** until:

  * the value at `index` is no longer `expectedValue`, or
  * it is notified, or
  * it times out (optional 4th parameter).
* Use only with `Int32Array` (per JS spec).

## Notes

* `SharedArrayBuffer` is shared: no detaching, no copying.
* Use `Atomics.load/store/add` for safe access.
* Use `Atomics.wait/notify` for simple coordination (signals, handshakes, wakeups).
* Keep the memory layout small and documented (indices + meaning).
