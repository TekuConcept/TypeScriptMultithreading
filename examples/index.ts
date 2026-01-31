import { randomUUID } from 'crypto'
import { Multithreaded } from '@/multithreaded'
import { IThreadedWorker, IThreadObserver } from '@/types'

class MessageObserver implements IThreadObserver {
    onWorkerCreated(worker: IThreadedWorker) {
        console.log(`[main] created worker ${worker.id}`)
    }

    onMessage(
        data: any,
        worker: IThreadedWorker
    ) { console.log(`[main] message from ${worker.id}:`, data) }

    onError(
        error: Error,
        worker: IThreadedWorker
    ) { console.error(`[main] error from ${worker.id}:`, error) }

    onExit(
        code: number,
        worker: IThreadedWorker
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
    w1.instance.postMessage({ type: 'ping', n: 1 })
    w2.instance.postMessage({ type: 'ping', n: 2 })

    setTimeout(() => Multithreaded.terminateWorkers(), 1500)
})
