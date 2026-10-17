import fs from "node:fs";
import archiver from "archiver";

fs.mkdirSync("dist", { recursive: true });
const output = fs.createWriteStream("dist/fairhouse-webhook.zip");
const archive = archiver("zip", { zlib: { level: 9 } });
archive.pipe(output);
archive.file("index.js");
archive.file("package.json");
archive.directory("lib", "lib");
archive.directory("node_modules", "node_modules");
await archive.finalize();
await new Promise((resolve, reject) => {
  output.on("close", resolve);
  output.on("error", reject);
});
