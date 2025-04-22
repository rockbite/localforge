/**
 * Simple in‑memory task list helper that can be attached to a session object.
 * A task has an id, title, optional description and a status.
 *
 * Status values are limited to the three allowed strings exported in STATUSES.
 * All functions in this helper are pure – the caller passes the tasks array
 * that lives on its session object, so the data always stays with the
 * session.  No global state is kept in this module.
 */

import { v4 as uuidv4 } from 'uuid';

// Allowed status values – kept minimal but can easily be extended later.
const STATUSES = {
  PENDING: 'pending',        // not started yet / waiting
  IN_PROGRESS: 'in-progress',// currently being worked on
  COMPLETED: 'completed',    // finished
  ERROR: 'error'             // failed or encountered errors
};

/**
 * Validate that the provided status is one of the allowed values.
 * @param {string} status
 */
function assertValidStatus(status) {
  if (!Object.values(STATUSES).includes(status)) {
    throw new Error(`Invalid task status: ${status}`);
  }
}

/**
 * Create and push a new task into the given array.
 * @param {Array} tasksArray – the per‑session array that stores tasks
 * @param {Object} opts – {title, description}
 * @returns {Object} the newly created task
 */
function addTask(tasksArray, { title, description = '' }) {
  if (!title || typeof title !== 'string') {
    throw new Error('Task title is required');
  }
  const task = {
    id: uuidv4(),
    title,
    description,
    status: STATUSES.PENDING,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  tasksArray.push(task);
  return task;
}

/**
 * Remove a task by id.
 * @returns {boolean} true if something was removed
 */
function removeTask(tasksArray, taskId) {
  const index = tasksArray.findIndex(t => t.id === taskId);
  if (index === -1) return false;
  tasksArray.splice(index, 1);
  return true;
}

/**
 * Edit an existing task.
 * @param {Array} tasksArray
 * @param {string} taskId
 * @param {Object} updates – may include title, description
 * @returns {Object|null} updated task or null if not found
 */
function editTask(tasksArray, taskId, updates = {}) {
  const task = tasksArray.find(t => t.id === taskId);
  if (!task) return null;
  if (updates.title !== undefined) task.title = updates.title;
  if (updates.description !== undefined) task.description = updates.description;
  task.updatedAt = new Date().toISOString();
  return task;
}

/**
 * Set the status of an existing task.
 * @param {Array} tasksArray
 * @param {string} taskId
 * @param {string} status – one of STATUSES.*
 * @returns {Object|null} updated task or null if not found
 */
function setTaskStatus(tasksArray, taskId, status) {
  assertValidStatus(status);
  const task = tasksArray.find(t => t.id === taskId);
  if (!task) return null;
  task.status = status;
  task.updatedAt = new Date().toISOString();
  return task;
}

/**
 * Convenience accessor – returns a shallow copy to prevent accidental direct
 * mutations (callers should use the helper functions).
 */
function listTasks(tasksArray) {
  return [...tasksArray];
}

export {
  STATUSES,
  addTask,
  removeTask,
  editTask,
  setTaskStatus,
  listTasks
};