import { KANTO_DEX, KANTO_BY_SLUG, officialSpeciesName } from "../shared/kantoDex.js";
import { SPECIES, STARTERS, PLAYABLE_KANTO_SLUGS } from "../server/species.js";

if (KANTO_DEX.length !== 151) throw new Error(`expected 151 Kanto entries, got ${KANTO_DEX.length}`);
if (KANTO_BY_SLUG.bulbasaur?.name !== "Bulbasaur") throw new Error("Bulbasaur official name");
if (officialSpeciesName("charmander", true) !== "Shiny Charmander") throw new Error("shiny label");

for (const slug of PLAYABLE_KANTO_SLUGS) {
  if (!KANTO_BY_SLUG[slug]) throw new Error(`${slug} not in Kanto dex`);
  if (SPECIES[slug].name !== KANTO_BY_SLUG[slug].name) {
    throw new Error(`${slug} name mismatch ${SPECIES[slug].name} vs ${KANTO_BY_SLUG[slug].name}`);
  }
}

for (const s of STARTERS) {
  if (!PLAYABLE_KANTO_SLUGS.includes(s)) throw new Error(`starter ${s} not playable`);
}

console.log("KANTO OK", { playable: PLAYABLE_KANTO_SLUGS.length, dex: KANTO_DEX.length });
