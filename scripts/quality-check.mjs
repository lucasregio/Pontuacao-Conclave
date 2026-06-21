import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

function runNodeTests() {
  execFileSync(process.execPath, ["--test"], { stdio: "inherit" });
}

function assertNoNativeDialogs() {
  // A regra do AGENTS.md vale para qualquer JS embarcado.
  const targets = ["../web/app.js"];
  const offenders = [];
  for (const rel of targets) {
    const source = readFileSync(new URL(rel, import.meta.url), "utf8");
    const hasAlert = /\balert\s*\(/.test(source);
    const hasConfirm = /\bconfirm\s*\(/.test(source);
    const hasPrompt = /\bprompt\s*\(/.test(source);
    if (hasAlert || hasConfirm || hasPrompt) {
      offenders.push(rel.replace(/^\.\.\//, ""));
    }
  }
  if (offenders.length) {
    throw new Error(
      "Falha de qualidade: uso de alert/confirm/prompt detectado em " + offenders.join(", ") + "."
    );
  }
}

function main() {
  console.log("[quality] Running Node tests...");
  runNodeTests();
  console.log("[quality] Checking UI feedback rules...");
  assertNoNativeDialogs();
  console.log("[quality] OK");
}

try {
  main();
} catch (error) {
  console.error("[quality] FAILED");
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
