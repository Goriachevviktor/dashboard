export function replaceTaskById(tasks, savedTask) {
  return tasks.map(task => String(task.id) === String(savedTask.id) ? savedTask : task);
}
