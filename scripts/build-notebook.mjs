import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("../cuotiben/", import.meta.url));
const lock = await readFile(new URL("../cuotiben/package-lock.json", import.meta.url));
const stamp = new URL("../cuotiben/node_modules/.notebook-lock", import.meta.url);
const version = createHash("sha256").update(lock).update(process.version + process.platform + process.arch).digest("hex");
if (await readFile(stamp, "utf8").catch(() => "") !== version) {
  execFileSync("npm", ["ci", "--include=dev", "--no-audit", "--no-fund"], { cwd, stdio: "inherit" });
  await writeFile(stamp, version);
}

execFileSync("npm", ["run", "build", "--", "--base", "./", "--outDir", "../public/cuotiben", "--emptyOutDir"], {
  cwd, stdio: "inherit",
  env: { ...process.env, VITE_TUTOR_HOME: "../", VITE_TUTOR_API_BASE: process.env.NEXT_PUBLIC_API_BASE_URL || "/api" },
});
