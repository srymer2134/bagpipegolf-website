// Event names — the commissioner's label for a slot.
//
// Stored in `leagues.schedule.names` as a slot-keyed map, the same
// schemaless home `bindings` and `formats` already use, so no DDL.
//
// ⚠️ The Flutter `LeagueSchedule` model must carry `names` too. The
// app writes the WHOLE schedule object on a schedule edit, so a build
// whose model does not know the key will drop every name. Paired
// fairwayiq-flutter change ships with this.

/** Form values → the stored map. Blank names are omitted rather than
 *  stored as '', so "unnamed" is absence, not an empty string. */
export function namesToMap(names: Array<string | null | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  names.forEach((raw, i) => {
    const v = typeof raw === 'string' ? raw.trim() : '';
    if (v) out[String(i)] = v.slice(0, 60);
  });
  return out;
}

/** The stored map → one value per slot, '' where unnamed, so the form
 *  can render `count` inputs without index gaps. */
export function namesToList(
  map: Record<string, string> | null | undefined,
  count: number,
): string[] {
  const n = Math.max(0, Math.min(52, count));
  return Array.from({ length: n }, (_, i) => map?.[String(i)] ?? '');
}

/** What to show when a slot has no name of its own. */
export function displayEventName(
  map: Record<string, string> | null | undefined,
  slot: number,
): string {
  const v = map?.[String(slot)];
  return v && v.trim() ? v.trim() : `Event ${slot + 1}`;
}
