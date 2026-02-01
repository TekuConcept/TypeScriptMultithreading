# Multithreaded

[![NPM Latest Release](https://img.shields.io/npm/v/@tekuconcept/multithreaded.svg)]()

**Multithreaded** is a lightweight utility for running _multithreaded_ workloads in Node.js using native worker threads, with first-class TypeScript support.

It abstracts away most of the worker-thread boilerplate — entry resolution, messaging, and setup — so you can focus on defining worker logic and exchanging data between threads.


## Features

- Simple API for managing Node.js worker threads
- TypeScript-first design with strong typings
- Works with both **ESM** and **CommonJS** projects
- Supports ts-node for local development
- Handles worker bootstrapping internally


## Installation

This module is available through the [npm registry](https://www.npmjs.com/package/@tekuconcept/multithreaded).

```sh
$ npm install @tekuconcept/multithreaded
```


## Exmples

Below is a minimal example that spawns a worker, exchanges messages, and finally shuts everything down.

```ts
function createWorker() {
    const scope = (ctx: WorkerContext) => {
        // Let the main thread know we're ready
        ctx.post({ type: 'ready', id: ctx.id })

        // Main thread seing if we're sill here
        ctx.onMessage((msg: any) => {
            if (msg.type === 'ping') ctx.post({
                type: 'pong',
                n: msg.n,
                from: ctx.id
            })
        })

        // doing some work in the background
        setInterval(() => process.stdout.write('.'), 250)
    }

    return Multithreaded.addWorker(randomUUID(), scope)
}

Multithreaded.main(() => {
    // Listens for responses from all workers
    // Use bindObserver(o, w) for a single worker
    Multithreaded.bindObserverAll(/* your observer */)

    const w1 = createWorker()

    // Let's send a job to our worker...
    w1.post({ type: 'ping', n: 1 })

    // Force-quit threads with terminateWorkers():
    // (Gracefully quit by sending a "shutdown" message)
    setTimeout(() => Multithreaded.terminateWorkers(), 1500)
})
```

See the [API doc](./docs/api.md) for a brief overview of functions and types.
