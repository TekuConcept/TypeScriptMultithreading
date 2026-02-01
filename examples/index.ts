import path from 'path'
import { fileURLToPath } from 'url'
import { randomUUID } from 'crypto'
import { Multithreaded } from '@tekuconcept/multithreaded'
import type {
    ThreadedWorker,
    IThreadObserver,
} from '@tekuconcept/multithreaded'

// ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

class MessageObserver implements IThreadObserver {
    onWorkerCreated(worker: ThreadedWorker) {
        console.log(`[main] created worker ${worker.id}`)
    }

    onMessage(
        data: any,
        worker: ThreadedWorker
    ) { console.log(`[main] message from ${worker.id}:`, data) }

    onError(
        error: Error,
        worker: ThreadedWorker
    ) { console.error(`[main] error from ${worker.id}:`, error) }

    onExit(
        code: number,
        worker: ThreadedWorker
    ) { console.log(`[main] exit from ${worker.id}:`, code) }
}

Multithreaded.main(() => {
    console.log('[main] started')
    Multithreaded.bindObserverAll(new MessageObserver())

    const w1 = Multithreaded.addWorker(randomUUID(), (ctx) => {
        ctx.post({ type: 'ready', id: ctx.id })

        ctx.onMessage((msg: any) => {
            if (msg.type === 'ping')
                ctx.post({ type: 'pong', n: msg.n, from: ctx.id })
        })

        setInterval(() => process.stdout.write('.'), 250)
    })

    const w2 = Multithreaded.addWorkerFile(
        randomUUID(),
        './demo-worker.ts',
        __dirname,
    )

    // independent messages to each worker instance
    w1.post({ type: 'ping', n: 1 })
    w2.post({ type: 'ping', n: 2 })

    setTimeout(() => Multithreaded.terminateWorkers(), 1500)
})
