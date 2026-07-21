export function createRoadmapReorderLock() {
  const pendingIds = new Set();
  return {
    acquire(roadmapId) {
      if (pendingIds.has(roadmapId)) return false;
      pendingIds.add(roadmapId);
      return true;
    },
    release(roadmapId) {
      pendingIds.delete(roadmapId);
    },
  };
}

export async function persistRoadmapReorder({
  previousRoadmap,
  nextRoadmap,
  patchRoadmap,
  replaceRoadmap,
  normalizeRoadmap,
  onError,
}) {
  replaceRoadmap(nextRoadmap);
  try {
    const savedRoadmap = normalizeRoadmap(await patchRoadmap(nextRoadmap.id, nextRoadmap));
    replaceRoadmap(savedRoadmap);
    return savedRoadmap;
  } catch (error) {
    replaceRoadmap(previousRoadmap);
    onError?.(error);
    return null;
  }
}
