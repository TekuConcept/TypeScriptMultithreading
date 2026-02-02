# 02 — Async Value (File Entrypoint)

Run a function exported from a file in another thread and await its return value.

## Worker File

Create a file that exports a function. The _default_ export is used by default. You may alternatively use named exports.

```ts
// value-worker.ts
export default function main(data?: any) {
    return (data.a + data.b)
}
````

## Basic

```ts
import path from 'path'
import { Multithreaded } from '@tekuconcept/multithreaded'

const result = await Multithreaded.asyncValueFile<number>(
    path.resolve(__dirname, './value-worker.ts'),
    { data: { a: 20, b: 22 } },
)

console.log(result) // 42
```

## Relative Path Variant

If you want to resolve `filename` relative to a directory, pass `relativeTo`.

```ts
import { Multithreaded } from '@tekuconcept/multithreaded'

const result = await Multithreaded.asyncValueFile<number>(
    './value-worker.ts',
    __dirname,
    { data: { a: 20, b: 22 } },
)

console.log(result) // 42
```

## Named Export (exportName)

If `exportName` is set, the worker file must export a function with that name.

```ts
// value-worker.ts
export function calculate(data?: any) {
    return (data?.a ?? 0) + (data?.b ?? 0)
}
```

```ts
import { Multithreaded } from '@tekuconcept/multithreaded'

const result = await Multithreaded.asyncValueFile<number>(
    './value-worker.ts',
    __dirname,
    {
        data: { a: 20, b: 22 },
        exportName: 'calculate',
    },
)

console.log(result) // 42
```

## Abort and Timeout

`asyncValueFile` returns an `AbortablePromise`.

```ts
const p = Multithreaded.asyncValueFile<number>(
    './value-worker.ts',
    __dirname,
    { data: { a: 20, b: 22 } },
)

p.timeout(500)

const value = await p
```

## Notes

* Use [`asyncValue`](./01-async-value-inline.md) for inline functions; use `asyncValueFile` when the function must live in its own file or reference other functions.
* `data` is serialized and passed to the worker before execution.
* `exportName` defaults to `"default"` when not provided.
