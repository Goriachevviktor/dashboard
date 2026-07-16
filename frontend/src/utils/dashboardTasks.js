export function replaceTaskById(tasks, savedTask) {
  return tasks.map(task => String(task.id) === String(savedTask.id) ? savedTask : task);
}

export function applyTaskCacheMutation(tasks, mutation) {
  if (mutation?.type === 'remove') {
    return tasks.filter(task => String(task.id) !== String(mutation.taskId));
  }
  if (mutation?.type === 'upsert' && mutation.task) {
    return tasks.some(task => String(task.id) === String(mutation.task.id))
      ? replaceTaskById(tasks, mutation.task)
      : [...tasks, mutation.task];
  }
  return tasks;
}
