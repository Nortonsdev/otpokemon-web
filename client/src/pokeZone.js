/**
 * Gancho cliente para PokeZone (wander clamp) — mesma lógica do servidor.
 * Usar quando o mapa JSON expuser wildSpawns[].radius (editor parte B).
 */
export {
  DEFAULT_POKE_ZONE_RADIUS,
  chebyshev,
  isInPokeZone,
  pokeZoneForSpawnTile,
} from "../../shared/pokeZone.js";
