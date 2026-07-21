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
