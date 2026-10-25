#!/usr/bin/env node
/**
 * npm run bundle:order
 *
 * Compiles lib/web-order.ts (and the two small modules it imports) to plain
 * CommonJS in .bundle/, so tests/invoice-number-test.cjs can exercise the
 * invoice rules against a fake Tbl_Serials — no database, no Next runtime.
 */
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const out = join(process.cwd(), ".bundle");
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// tsc reports a type error from an unrelated module but still emits every
// file; the bundle is only useful if web-order.js is one of them.
try {
  execFileSync(
    "npx",
    [
      "tsc", "lib/web-order.ts", "lib/customer-code.ts", "lib/customer-sql.ts", "lib/otp-store.ts", "lib/phone.ts",
      "--outDir", out,
      "--module", "commonjs",
      "--target", "es2022",
      "--moduleResolution", "node",
      "--esModuleInterop",
      "--skipLibCheck",
    ],
    { stdio: "inherit" },
  );
} catch {
  /* see above */
}

cpSync(join(out, "web-order.js"), join(out, "wo.cjs"));
console.log("✓ .bundle/wo.cjs is ready for tests/invoice-number-test.cjs");
for (const name of ["customer-code", "customer-sql", "otp-store"]) {
  if (existsSync(join(out, `${name}.js`))) {
    cpSync(join(out, `${name}.js`), join(out, `${name}.cjs`));
    console.log(`✓ .bundle/${name}.cjs is ready for tests/${name}-test.cjs`);
  }
}
