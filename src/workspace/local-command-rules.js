// Device commands use text member IDs and never accept executor credentials.
// Keep new adapter commands explicit; the cloud validator remains authoritative for cloud.
const taskFields = 'title description status priority assigneeUserId recurrence dueDate startDate sortOrder attributes';
const projectFields = 'key name description status teamId leadUserId dueDate startDate sortOrder attributes';
const rule = (fields, required = '') => ({ fields: fields.split(' '), required: required.split(' ').filter(Boolean) });
export const localCommandRules = {
  create_task: rule(`id projectId ${taskFields}`, 'projectId title'),
  update_task: rule(`id ${taskFields}`, 'id'),
  move_task: rule('id projectId sortOrder', 'id projectId'),
  duplicate_task: rule('id projectId title', 'id'),
  delete_task: rule('id', 'id'),
  archive_task: rule('id', 'id'),
  restore_task: rule('id', 'id'),
  complete_task: rule('id', 'id'),
  add_task_comment: rule('id taskId body', 'taskId body'),
  delete_comment: rule('id', 'id'),
  create_subtask: rule('id taskId title done sortOrder attributes', 'taskId title'),
  update_subtask: rule('id taskId title done sortOrder attributes', 'id taskId'),
  delete_subtask: rule('id taskId', 'id taskId'),
  set_task_dependency: rule('id dependsOnTaskId', 'id dependsOnTaskId'),
  remove_task_dependency: rule('id dependsOnTaskId', 'id dependsOnTaskId'),
  create_project: rule(`id ${projectFields}`, 'name'),
  update_project: rule(`id ${projectFields} archived`, 'id'),
  delete_project: rule('id', 'id'),
  archive_project: rule('id', 'id'),
  restore_project: rule('id', 'id'),
};
