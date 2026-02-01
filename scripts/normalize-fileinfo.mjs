import { rename } from "node:fs/promises";
import path from "node:path";

async function safeRename(
    moduleType,
    names, // string[]
) {
    const tryRename = async (from, to) => {
        try { await rename(from, to); }
        catch (e) { /* ignore if missing */ }
    };

    for (const name of names) {
        const from = path.join("dist", moduleType, `${name}.${moduleType}.js`);
        const to = path.join("dist", moduleType, `${name}.js`);
        console.log(`Renaming ${from} -> ${to}`);
        await tryRename(from, to);
    }
}

safeRename("cjs", [
    "fileinfo",
    "worker-bootstrap",
]);

safeRename("esm", [
    "fileinfo",
    "worker-bootstrap",
]);
