import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cjsDir = path.join(__dirname, "..", "dist", "cjs");
await mkdir(cjsDir, { recursive: true });

await writeFile(
    path.join(cjsDir, "package.json"),
    JSON.stringify({ type: "commonjs" }, null, 2) + "\n",
    "utf8"
);
