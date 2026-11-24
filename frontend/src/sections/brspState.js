export const activeMeetingTopics = (meeting, catalog) => meeting?.topics.filter(topic =>
  catalog.find(item => item.id === topic.id)?.status !== 'completed') || [];

export const completedTopics = catalog => catalog.filter(topic => topic.status === 'completed');

export const topicReports = (meetings, topicId, beforeDate = null) => meetings
  .filter(meeting => !beforeDate || meeting.date < beforeDate)
  .flatMap(meeting => meeting.topics
    .filter(topic => topic.id === topicId && topic.text.trim())
    .map(topic => ({ date: meeting.date, text: topic.text })))
  .sort((a, b) => b.date.localeCompare(a.date));
