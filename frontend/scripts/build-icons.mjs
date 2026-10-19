import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** Every icon the app takes from an Iconify set, as `prefix:name`. */
const ICONS = ["lucide:trophy"];

const LOCAL = {
  "app:award": "award.svg",
  "app:helmet-front": "helmet-front.svg",
};

const OUT = new URL("../lib/icons.ts", import.meta.url);

const exportName = (full) =>
  full
    .replace(/[:-](\w)/g, (_, ch) => ch.toUpperCase())
    .replace(/^(\w)/, (_, ch) => ch.toLowerCase());

const ICON_DIR = new URL("./icons/", import.meta.url);

async function loadLocal(file) {
  const raw = await readFile(new URL(file, ICON_DIR), "utf8");

  const box = raw.match(/viewBox="([^"]+)"/);
  if (!box) throw new Error(`${file}: no viewBox`);
  const [minX, minY, width, height] = box[1].trim().split(/\s+/).map(Number);
  if (minX !== 0 || minY !== 0) {
    throw new Error(`${file}: viewBox must start at "0 0", got "${box[1]}"`);
  }
  if (!/currentColor/.test(raw)) {
    throw new Error(`${file}: no currentColor — recolour it before adding it`);
  }

  const body = raw
    .replace(/^[\s\S]*?<svg[^>]*>/, "")
    .replace(/<\/svg>\s*$/, "")
    .trim();
  return { body, width, height };
}

const sets = new Map();
async function load(prefix) {
  if (!sets.has(prefix)) {
    const path = require.resolve(`@iconify-json/${prefix}/icons.json`);
    sets.set(prefix, JSON.parse(await readFile(path, "utf8")));
  }
  return sets.get(prefix);
}

const resolved = new Map();

for (const full of ICONS) {
  const [prefix, name] = full.split(":");
  const set = await load(prefix);
  const icon = set.icons[name];
  if (!icon) throw new Error(`No such icon: ${full}`);

  resolved.set(full, {
    body: icon.body,
    width: icon.width ?? set.width ?? 16,
    height: icon.height ?? set.height ?? 16,
  });
}

for (const [full, file] of Object.entries(LOCAL)) {
  if (resolved.has(full)) throw new Error(`Duplicate icon: ${full}`);
  resolved.set(full, await loadLocal(file));
}

const parts = [...resolved.keys()]
  .sort()
  .map(
    (full) =>
      `/** \`${full}\` */\nexport const ${exportName(full)}: IconifyIcon = ${JSON.stringify(resolved.get(full), null, 2)};`,
  );

const file = `/**
 * GENERATED — do not edit. Run \`npm run icons\` after changing the ICONS list
 * in scripts/build-icons.mjs, which explains why this file exists.
 */
import type { IconifyIcon } from "@iconify/react";

${parts.join("\n\n")}
`;

await writeFile(OUT, file, "utf8");
console.log(`icons: wrote ${resolved.size} to lib/icons.ts`);
