// Fails when the installed sharp predates the libvips/libheif/librsvg
// security fixes (GHSA-f88m-g3jw-g9cj, GHSA-rgj7-g3m4-5g8c, GHSA-wq5f-xc86-pv6w).
import { readFileSync } from "node:fs";

const MINIMUM_SHARP_VERSION = [0, 35, 5];

const installedVersion = JSON.parse(
  readFileSync(new URL("../node_modules/sharp/package.json", import.meta.url), "utf-8"),
).version;
const installedParts = installedVersion.split(/[.-]/).slice(0, 3).map(Number);

function isOlder(actual, minimum) {
  for (let index = 0; index < minimum.length; index += 1) {
    if (actual[index] !== minimum[index]) {
      return actual[index] < minimum[index];
    }
  }
  return false;
}

if (isOlder(installedParts, MINIMUM_SHARP_VERSION)) {
  console.error(
    `Installed sharp ${installedVersion} is older than ${MINIMUM_SHARP_VERSION.join(".")}, ` +
      "which contains unpatched libvips/libheif/librsvg advisories. Run `bun add sharp@^0.35.5`.",
  );
  process.exit(1);
}
console.log(`sharp ${installedVersion} satisfies >=${MINIMUM_SHARP_VERSION.join(".")}`);
