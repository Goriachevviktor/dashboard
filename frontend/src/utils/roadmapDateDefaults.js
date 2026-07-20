export function formatLocalDateInputValue(dateLike = new Date()) {
  return `${dateLike.getFullYear()}-${String(dateLike.getMonth() + 1).padStart(2, '0')}-${String(dateLike.getDate()).padStart(2, '0')}`;
}

export function resolveRoadmapBarInitialDates({
  bar,
  legacyStartDate,
  legacyEndDate,
  now = new Date(),
}) {
  if (bar) {
    return {
      startDate: bar.startDate || legacyStartDate,
      endDate: bar.endDate || legacyEndDate,
    };
  }

  const creationDate = formatLocalDateInputValue(now);
  return { startDate: creationDate, endDate: creationDate };
}
