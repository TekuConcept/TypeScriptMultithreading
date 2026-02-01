import { Multithreaded } from '@tekuconcept/multithreaded'

const ctx = Multithreaded.workerContext()

ctx.post({ type: 'ready', id: ctx.id })

ctx.onMessage((msg: any) => {
    if (msg.type === 'ping')
        ctx.post({ type: 'pong', n: msg.n, from: ctx.id })
})

setInterval(() => process.stdout.write('+'), 250)
