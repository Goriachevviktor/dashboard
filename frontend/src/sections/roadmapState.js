export function normalizeRoadmaps(maps, normalize) {
  return Array.isArray(maps) ? maps.filter(map => map?.id).map(normalize) : [];
}

export function legacyRoadmapRaw(read) {
  try {
    return read() || '';
  } catch {
    return '';
  }
}

export function legacyUserRoadmaps(raw, sampleIds, normalize) {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed)
      ? parsed.filter(map => map?.id && !sampleIds.has(map.id)).map(normalize)
      : [];
  } catch {
    return [];
  }
}

export async function migrateLegacyRoadmaps({ readLegacy, parseLegacy, importRoadmaps, listRoadmaps, clearLegacy }) {
  const legacy = parseLegacy(readLegacy());
  const serverRoadmaps = await listRoadmaps();
  if (!legacy.length) return serverRoadmaps;

  await importRoadmaps(legacy);
  const migratedRoadmaps = await listRoadmaps();
  clearLegacy();
  return migratedRoadmaps;
}
