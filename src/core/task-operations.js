/* Related records are removed together through this module, independent of UI and persistence. */
export function removeTasks(data, ids) {
  const removed = new Set(ids);
  data.tasks = data.tasks.filter(task => !removed.has(task.id));
  for (const task of data.tasks) task.deps = (task.deps || []).filter(id => !removed.has(id));
  for (const key of ['comments', 'files', 'notifs', 'activity']) {
    data[key] = (data[key] || []).filter(record => !removed.has(record.task));
  }
}

export function removeProject(data, projectId) {
  removeTasks(
    data,
    data.tasks.filter(task => task.project === projectId).map(task => task.id),
  );
  data.projects = data.projects.filter(project => project.id !== projectId);
  data.projOrder = data.projOrder.filter(id => id !== projectId);
  for (const key of ['files', 'events', 'savedViews', 'notifs', 'activity']) {
    data[key] = (data[key] || []).filter(record => record.project !== projectId);
  }
}

export function removeFile(data, fileId) {
  data.files = data.files.filter(file => file.id !== fileId);
  for (const task of data.tasks) task.attachments = (task.attachments || []).filter(file => file.id !== fileId);
}

export function renameFile(data, fileId, name, type) {
  const file = data.files.find(record => record.id === fileId);
  if (file) Object.assign(file, { name, type });
  for (const task of data.tasks) {
    for (const attachment of task.attachments || []) {
      if (attachment.id === fileId) Object.assign(attachment, { name, type });
    }
  }
}
