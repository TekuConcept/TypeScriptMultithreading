# Examples

Minimal, copy-pasteable examples for common multithreading use cases.

## Async values (request → response)

Run a function in another thread and get a value back.

- [**01-async-value-inline.md**](./01-async-value-inline.md)  
  Run an inline function and await its return value.

- [**02-async-value-file.md**](./02-async-value-file.md)  
  Run a file entrypoint and await its return value.

## Workers and communication

Run long-lived threads and exchange messages.

- [**03-two-workers-messaging.md**](./03-two-workers-messaging.md)  
  Two workers with basic `post` / `onMessage` cross-thread communication.

- [**04-observers.md**](./04-observers.md)  
  Observe worker lifecycle, messages, errors, and exits using observers.

## Transferables (C++ std::move semantics)

Transfer ownership of memory between threads without copying.

- [**05-transferables-arraybuffer.md**](./05-transferables-arraybuffer.md)  
  Pass `ArrayBuffer` / typed arrays using `transfer` and observe buffer detachment.

## Shared memory (SharedArrayBuffer + Atomics)

True shared memory with explicit synchronization.

- [**06-sharedarraybuffer-atomics.md**](./06-sharedarraybuffer-atomics.md)  
  Share memory between threads and coordinate access using `Atomics`.

## Control and lifecycle

Abort, timeout, and terminate threaded work.

- [**07-worker-terminate-detach.md**](./07-worker-terminate-detach.md)  
  Terminate or detach workers and control their lifetime explicitly.

---

Each example is intentionally small and focused.  
If you don’t see what you need here, the source is short and readable. Suggestions are also welcome!
