const COLUMN_TO_STATE = {
  'Беклог': { status: 'todo', progress: 0 },
  'В работе': { status: 'active', progress: 50 },
  'Готов': { status: 'done', progress: 100 },
  'Архив': { status: 'done', progress: 100 },
};

export function taskColumnToRoadmapState(column) {
  return COLUMN_TO_STATE[column] || COLUMN_TO_STATE['Беклог'];
}

export function roadmapStateToTaskColumn(status, progress) {
  if (status === 'done' || Number(progress) >= 100) return 'Готов';
  if (status === 'active' || Number(progress) > 0) return 'В работе';
  return 'Беклог';
}

export function snapshotLinkedTask(task) {
  return {
    id: task.id,
    title: task.title,
    due: task.due,
    column: task.column,
    ownerId: task.ownerId,
    assigneeId: task.assigneeId,
  };
}

export function resolveLinkedBar(bar, task) {
  const state = taskColumnToRoadmapState(task.column);
  return {
    ...bar,
    title: task.title,
    endDate: task.due && task.due !== '—' ? task.due : bar.endDate,
    ownerId: task.assigneeId || task.ownerId,
    ...state,
    linkedTaskSnapshot: snapshotLinkedTask(task),
  };
}

export function unlinkTaskBar(bar, task) {
  const snapshot = task ? snapshotLinkedTask(task) : bar.linkedTaskSnapshot;
  const state = snapshot ? taskColumnToRoadmapState(snapshot.column) : {};
  const unlinked = {
    ...bar,
    ...(snapshot?.title !== undefined ? { title: snapshot.title } : {}),
    ...(snapshot?.due && snapshot.due !== '—' ? { endDate: snapshot.due } : {}),
    ...(snapshot ? { ownerId: snapshot.assigneeId || snapshot.ownerId, ...state } : {}),
  };
  delete unlinked.linkedTaskId;
  delete unlinked.linkedTaskSnapshot;
  return unlinked;
}

export function normalizeTaskRoadmapLinks(roadmaps, tasks) {
  const tasksById = new Map(tasks.map(task => [String(task.id), task]));
  const usedIds = new Set();
  return roadmaps.map(roadmap => ({
    ...roadmap,
    bars: roadmap.bars.map(bar => {
      if (bar.linkedTaskId === undefined || bar.linkedTaskId === null) return bar;
      const id = String(bar.linkedTaskId);
      const task = tasksById.get(id);
      if (!task || usedIds.has(id)) return unlinkTaskBar(bar);
      usedIds.add(id);
      return resolveLinkedBar(bar, task);
    }),
  }));
}

export function availableTasksForLink(roadmaps, tasks, linkedTaskId) {
  const usedIds = new Set(Object.keys(buildRoadmapLinkIndex(roadmaps)));
  if (linkedTaskId !== undefined && linkedTaskId !== null) {
    usedIds.delete(String(linkedTaskId));
  }
  return tasks.filter(task => !usedIds.has(String(task.id)));
}

export function buildLinkedTaskPatch(previousBar, nextBar) {
  const patch = {};
  if (previousBar.endDate !== nextBar.endDate) patch.due = nextBar.endDate;
  const previousColumn = roadmapStateToTaskColumn(previousBar.status, previousBar.progress);
  const nextColumn = roadmapStateToTaskColumn(nextBar.status, nextBar.progress);
  if (previousColumn !== nextColumn) patch.column = nextColumn;
  return patch;
}

export function buildRoadmapLinkIndex(roadmaps) {
  const index = {};
  for (const roadmap of roadmaps) {
    for (const bar of roadmap.bars) {
      if (bar.linkedTaskId === undefined || bar.linkedTaskId === null) continue;
      const id = String(bar.linkedTaskId);
      if (index[id]) continue;
      index[id] = { roadmapId: roadmap.id, roadmapTitle: roadmap.title, barId: bar.id };
    }
  }
  return index;
}

export async function persistLinkedBarChange({ api, roadmap, previousBar, nextBar }) {
  const taskPatch = buildLinkedTaskPatch(previousBar, nextBar);
  let task = previousBar.linkedTaskSnapshot || { id: previousBar.linkedTaskId };
  if (Object.keys(taskPatch).length) {
    task = await api.patchTask(previousBar.linkedTaskId, taskPatch);
  }
  const refreshedBar = resolveLinkedBar(nextBar, task);
  const nextRoadmap = {
    ...roadmap,
    bars: roadmap.bars.map(bar => bar.id === previousBar.id ? refreshedBar : bar),
  };
  return api.patchRoadmap(roadmap.id, nextRoadmap);
}
