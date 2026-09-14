import {
  KANTO_DEX,
  KANTO_BY_SLUG,
  officialSpeciesName,
  speciesDexId,
  pokemonPlateText,
} from "../shared/kantoDex.js";
import { SPECIES, STARTERS, PLAYABLE_KANTO_SLUGS } from "../server/species.js";

if (KANTO_DEX.length !== 151) throw new Error(`expected 151 Kanto entries, got ${KANTO_DEX.length}`);
if (KANTO_BY_SLUG.bulbasaur?.name !== "Bulbasaur") throw new Error("Bulbasaur official name");
if (officialSpeciesName("charmander", true) !== "Shiny Charmander") throw new Error("shiny label");
if (speciesDexId("pikachu", false) !== "0025") throw new Error("pikachu dex id");
if (speciesDexId("pikachu", true) !== "0025-1") throw new Error("shiny pikachu dex id");
if (speciesDexId("caterpie", false) !== "0010") throw new Error("caterpie dex id");
const plate = pokemonPlateText({ kind: "wild", species: "caterpie", shiny: false, level: 2 });
if (plate !== "0010 Caterpie [2]") throw new Error(`plate ${plate}`);

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
