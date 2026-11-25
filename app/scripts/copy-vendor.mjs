// Copies the Capacitor runtime into www/vendor so the plain-script UI can use native plugins
// without a bundler. Run before `npx cap sync android` (CI does this automatically).
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
mkdirSync(join(root, "www", "vendor"), { recursive: true });
copyFileSync(join(root, "node_modules", "@capacitor", "core", "dist", "capacitor.js"), join(root, "www", "vendor", "capacitor.js"));
console.log("Copied @capacitor/core runtime to www/vendor/capacitor.js");
