# 05 — Transferables (ArrayBuffer / TypedArray “std::move”)

Transfer ownership of memory between threads without copying.

When you transfer an `ArrayBuffer`, a typed array backed by one, or any other transferrable types, the **sender loses access** to that buffer while the receiver gains it.

## asyncValue (transfer to worker)

```ts
import { Multithreaded } from '@tekuconcept/multithreaded'

const buf = new ArrayBuffer(1024)
const view = new Uint8Array(buf)
view[0] = 123

const len = await Multithreaded.asyncValue<number>(
    (data) => {
        // `data.buf` is now owned by the worker
        const b: ArrayBuffer = data.buf
        return b.byteLength
    },
    {
        data: { buf },
        transfer: [buf],
    },
)

console.log('worker byteLength:', len) // 1024
console.log('main byteLength after transfer:', buf.byteLength) // 0 (detached)
````

`buf.byteLength === 0` is the proof that ownership moved.

Note that the reference in the data object must match the reference in the transfer array, or the buffer will only be copied.

## addWorker (transfer at creation)

```ts
import { Multithreaded } from '@tekuconcept/multithreaded'

const buf = new ArrayBuffer(16)
new Uint8Array(buf)[0] = 42

const w = Multithreaded.addWorker(
    'w1',
    (ctx) => {
        const b: ArrayBuffer = ctx.userData.buf
        const first = new Uint8Array(b)[0]
        ctx.post({ first, byteLength: b.byteLength })
    },
    {
        data: { buf },
        transfer: [buf],
    },
)

w.onMessage((msg) => console.log('[main] from worker:', msg))
console.log('[main] byteLength after transfer:', buf.byteLength) // 0 (detached)
```

---

## Worker → Main (transfer back)

```ts
import { Multithreaded } from '@tekuconcept/multithreaded'

const w = Multithreaded.addWorker('w1', (ctx) => {
    const buf = new ArrayBuffer(8)
    const view = new Uint8Array(buf)
    view[0] = 99

    // transfer ownership to main
    ctx.post({ buf }, [buf])

    // worker loses access after transfer
    ctx.post({ workerByteLengthAfter: buf.byteLength }) // 0
})

w.onMessage((msg) => {
    if (msg.buf) {
        const b: ArrayBuffer = msg.buf
        console.log('[main] received byteLength:', b.byteLength) // 8
        console.log('[main] first byte:', new Uint8Array(b)[0]) // 99
    } else {
        console.log('[main] info:', msg)
    }
})
```

---

## Worker → Worker (one loses access)

Transferables always detach on the **sending side**, even when forwarding through the main thread.

```ts
import { Multithreaded } from '@tekuconcept/multithreaded'

const w1 = Multithreaded.addWorker('w1', (ctx) => {
    const buf = new ArrayBuffer(4)
    new Uint8Array(buf)[0] = 7

    // send buffer to main (ownership leaves w1)
    ctx.post({ buf }, [buf])

    // w1 loses access here
    ctx.post({ w1ByteLengthAfter: buf.byteLength }) // 0
})

const w2 = Multithreaded.addWorker('w2', (ctx) => {
    ctx.onMessage((msg: any) => {
        const b: ArrayBuffer = msg.buf
        ctx.post({ w2ByteLength: b.byteLength, first: new Uint8Array(b)[0] })
    })
})

// main: forward the buffer from w1 -> w2
w1.onMessage((msg) => {
    if (msg.buf) {
        const b: ArrayBuffer = msg.buf

        // forward ownership to w2 (main loses access after this)
        w2.post({ buf: b }, [b])

        console.log('[main] byteLength after forwarding:', b.byteLength) // 0
    } else {
        console.log('[main] info:', msg)
    }
})

w2.onMessage((msg) => console.log('[main] from w2:', msg))
```

## Notes

* Works with `asyncValue`, `asyncValueFile`, `addWorker`, `addWorkerFile`.
* Transfer the **exact underlying `ArrayBuffer`** (usually `typedArray.buffer`).
* After transfer, the sender’s buffer is **detached** (`byteLength === 0`).
* If you need *true shared memory*, use [`SharedArrayBuffer`](./06-sharedarraybuffer-atomics.md).
