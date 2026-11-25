export const catalogEntryForTopic = (catalog, topicId) => catalog.find(item =>
  item.id === topicId || item.aliases?.includes(topicId));

export const topicIds = (catalog, topicId) => {
  const entry = catalogEntryForTopic(catalog, topicId);
  return entry ? [entry.id, ...(entry.aliases || [])] : [topicId];
};

export const activeMeetingTopics = (meeting, catalog) => meeting?.topics.filter(topic =>
  catalogEntryForTopic(catalog, topic.id)?.status !== 'completed') || [];

export const completedTopics = catalog => catalog.filter(topic => topic.status === 'completed');

export const canDownloadDraft = meeting => meeting?.status === 'draft' &&
  meeting.topics.some(topic => topic.text.trim());

export const topicReports = (meetings, ids, beforeDate = null) => meetings
  .filter(meeting => !beforeDate || meeting.date < beforeDate)
  .flatMap(meeting => meeting.topics
    .filter(topic => (Array.isArray(ids) ? ids.includes(topic.id) : topic.id === ids) && topic.text.trim())
    .map(topic => ({ date: meeting.date, text: topic.text })))
  .sort((a, b) => b.date.localeCompare(a.date));
