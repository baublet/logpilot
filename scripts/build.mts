const fullScriptStartTime = Date.now();

import path from "path";
import fs from "fs";
import esbuild from "esbuild";
import url from "url";

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const distFilesToReplace: Record<string, string> = {
  clientWorker: "clientWorker.js",
  ui: "ui.js",
};

const dist = path.resolve(__dirname, "..", "./dist");

const nodeEntry = path.resolve(__dirname, "..", "src", "nodeCli.ts");
const uiEntry = path.resolve(__dirname, "..", "src", "ui.tsx");
const clientWorkerEntry = path.resolve(
  __dirname,
  "..",
  "src",
  "clientWorker.ts"
);

const nodeOutput = path.resolve(dist, "nodeCli.js");

console.log("📦  Bundling node CLI");
const bundlingStartTime = Date.now();

await esbuild
  .build({
    entryPoints: [nodeEntry],
    bundle: true,
    minify: true,
    target: "node16",
    outdir: dist,
    sourcemap: false,
    platform: "node",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
  })
  .then(() => {
    console.log(
      `📦  Done bundling node CLI (${Date.now() - bundlingStartTime}ms)`
    );
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

const uiBundlingStartTime = Date.now();
await esbuild
  .build({
    entryPoints: [uiEntry],
    bundle: true,
    minify: true,
    outdir: dist,
    sourcemap: false,
    platform: "browser",
  })
  .then(() => {
    console.log(
      `📦  Done bundling node UI (${Date.now() - uiBundlingStartTime}ms)`
    );
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

const workerBundlingStartTime = Date.now();
await esbuild
  .build({
    entryPoints: [clientWorkerEntry],
    bundle: true,
    minify: true,
    outdir: dist,
    sourcemap: false,
    platform: "browser",
  })
  .then(() => {
    console.log(
      `📦  Done bundling node client worker (${
        Date.now() - workerBundlingStartTime
      }ms)`
    );
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });

let buildNodeCli = fs.readFileSync(nodeOutput).toString();

console.log("🧱  Packing on-disk files into the node CLI");
const packingFilesStartTime = Date.now();
const filesToReplace = Object.keys(distFilesToReplace);
for (const fileKey of filesToReplace) {
  const filePath = path.resolve(dist, distFilesToReplace[fileKey]);
  if (!fs.existsSync(filePath)) {
    console.error(`⛔  File ${filePath} does not exist`);
    process.exit(1);
  }
  const fileContents = fs.readFileSync(filePath).toString();
  buildNodeCli = buildNodeCli.replace(
    `"${fileKey}":""`,
    `"${fileKey}":${JSON.stringify(fileContents)}`
  );
}

console.log(`🧱  Done packing files (${Date.now() - packingFilesStartTime}ms)`);

fs.writeFileSync(nodeOutput, buildNodeCli);
console.log(
  `🏗️   Done compiling node CLI (${Date.now() - fullScriptStartTime}ms)`
);
