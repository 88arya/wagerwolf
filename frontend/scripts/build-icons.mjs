/**
 * Turns a list of Iconify icon names into `lib/icons.ts`.
 *
 * WHY THIS EXISTS. `<Icon icon="lucide:trophy" />` is Iconify's default usage
 * and it fetches the icon from api.iconify.design at runtime: nothing renders
 * on the server, nothing renders at all on a blocked network, and the first
 * paint has a hole where the icon goes. Passing the icon DATA instead renders
 * synchronously, server and client, with no request.
 *
 * The obvious way to get that data — importing `@iconify-json/lucide` in the
 * app — ships all 1,884 icons (595KB) to get one. A bundler cannot tree-shake
 * properties off a JSON object. So the extraction happens HERE, at author time,
 * and the app imports ~400 bytes per icon from a generated file.
 *
 * Add a name to ICONS below, run `npm run icons`, import the new export.
 * `@iconify-json/*` packages are devDependencies for exactly this reason: they
 * are build-time sources, never shipped.
 *
 * LOCAL takes icons that are not in any set we have — artwork someone handed
 * us, or an icon whose set could not be identified. Each names an .svg in
 * scripts/icons/, and they come out of the same generated file under the same
 * names as the set icons, so the app has exactly ONE place icons live. Without
 * it the first icon from outside a set puts a second icon source in a
 * component, which is the thing this whole arrangement exists to prevent.
 *
 * A local source must use `currentColor`, not its own fills — every icon in
 * this app is coloured by CSS. Recolour the file when you add it; the generator
 * does not, because silently rewriting someone's artwork is worse than an icon
 * that visibly ignores its class.
 *
 * Browse names at https://icon-sets.iconify.design.
 */
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** Every icon the app takes from an Iconify set, as `prefix:name`. */
const ICONS = ["lucide:trophy"];

/**
 * Icons with no set behind them: `name` → file in scripts/icons/.
 *
 * `app:` is not a real Iconify prefix and deliberately so — the name says at
 * every call site that this one is ours and cannot be looked up.
 *
 * app:award is a laurel wreath: a star above, and two branches sweeping out
 * from a crossing at the bottom. THE CENTRE IS EMPTY — the two branches are
 * separate subpaths, one entirely left of x 201.5 and one entirely right of
 * 298.5, so the whole column between them is open at every height. That is
 * what makes it a frame rather than a medal.
 *
 * app:helmet-front is a football helmet seen head-on, one path, in a box
 * TALLER than it is wide (229.6 x 275.4). That is the only non-square artwork
 * here and it is why the champion card fits its icons by the LONGER axis; see
 * MARK_UNIT in PlayoffReveal.
 *
 * NOT HelmetMark. That one is a side profile and every team card on the board
 * wears it, facing its opponent. This one faces the reader, which is the whole
 * distinction the champion card is trading on.
 *
 * Both are candidates for the champion's card; PlayoffReveal's MARKS states
 * the measurements each relies on, and design/champion-marks.md the verdicts.
 */
const LOCAL = {
  "app:award": "award.svg",
  "app:helmet-front": "helmet-front.svg",
};

const OUT = new URL("../lib/icons.ts", import.meta.url);

/** "lucide:trophy" → "lucideTrophy". Prefix-qualified so two sets can both
 *  supply a "trophy" without colliding. */
const exportName = (full) =>
  full
    .replace(/[:-](\w)/g, (_, ch) => ch.toUpperCase())
    .replace(/^(\w)/, (_, ch) => ch.toLowerCase());

const ICON_DIR = new URL("./icons/", import.meta.url);

/** One local .svg → Iconify's data shape: everything inside the root tag,
 *  plus the box it is drawn in. */
async function loadLocal(file) {
  const raw = await readFile(new URL(file, ICON_DIR), "utf8");

  const box = raw.match(/viewBox="([^"]+)"/);
  if (!box) throw new Error(`${file}: no viewBox`);
  const [minX, minY, width, height] = box[1].trim().split(/\s+/).map(Number);
  // A non-zero origin would have to be carried through to every call site,
  // which no caller expects. Re-export the artwork from zero instead.
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

  // Iconify sets declare their box once, on the set; an individual icon
  // overrides it only when it differs. Resolve it here so the app never has to.
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
