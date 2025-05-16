/**
 * Simple in‑memory task list helper that can be attached to a session object.
 * A task has an id, title, optional description, a status, optional parentId, and children.
 *
 * Status values are limited to the four allowed strings exported in STATUSES.
 * All functions in this helper are pure unless otherwise documented – the caller passes the root tasks array.
 *
 * Hierarchical mode: tasks are now trees with children:[] and optional parentId.
 */

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
// Hierarchical version
function addTask(tasksArray, { title, description = '', parentId = null }) {
  if (!title || typeof title !== 'string') {
    throw new Error('Task title is required');
  }
  const shortId = Math.random().toString(36).slice(2, 7);
  const now = new Date().toISOString();
  const task = {
    id: shortId,
    title,
    description,
    status: STATUSES.PENDING,
    createdAt: now,
    updatedAt: now,
    parentId,
    children: []
  };
  if (parentId) {
    // Find parent task recursively and insert as child
    const parent = findTaskById(tasksArray, parentId);
    if (!parent) throw new Error('Parent task not found');
    parent.children = parent.children || [];
    parent.children.push(task);
  } else {
    tasksArray.push(task);
  }
  return task;
}

function findTaskById(tasks, id) {
  for (const task of tasks) {
    if (task.id === id) return task;
    if (task.children && task.children.length) {
      const result = findTaskById(task.children, id);
      if (result) return result;
    }
  }
  return null;
}


/**
 * Remove a task by id.
 * @returns {boolean} true if something was removed
 */
// Remove a task by id, including any of its descendants recursively.
function removeTask(tasksArray, taskId) {
  for (let i = 0; i < tasksArray.length; i++) {
    if (tasksArray[i].id === taskId) {
      tasksArray.splice(i, 1);
      return true;
    }
    if (tasksArray[i].children && tasksArray[i].children.length) {
      const success = removeTask(tasksArray[i].children, taskId);
      if (success) {
        // Optionally: clean up empty children array
        if (tasksArray[i].children.length === 0) delete tasksArray[i].children;
        return true;
      }
    }
  }
  return false;
}

/**
 * Edit an existing task.
 * @param {Array} tasksArray
 * @param {string} taskId
 * @param {Object} updates – may include title, description
 * @returns {Object|null} updated task or null if not found
 */
function editTask(tasksArray, taskId, updates = {}) {
  const task = findTaskById(tasksArray, taskId);
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
// Change a task's parent by moving it under newParentId (null for root)
function moveTask(tasksArray, taskId, newParentId = null) {
  if (taskId === newParentId) throw new Error('Task cannot be its own parent');
  // 1. Locate task and detach it from current location
  let targetTask = null;
  const detach = (arr, pid = null) => {
    for (let i = 0; i < arr.length; i++) {
      const t = arr[i];
      if (t.id === taskId) {
        targetTask = t;
        // Remove from current array
        arr.splice(i, 1);
        return true;
      }
      if (t.children && detach(t.children, t.id)) return true;
    }
    return false;
  };
  detach(tasksArray);
  if (!targetTask) return false;
  // 2. Attach to new parent or root
  if (newParentId) {
    const parent = findTaskById(tasksArray, newParentId);
    if (!parent) throw new Error('New parent task not found');
    parent.children = parent.children || [];
    parent.children.push(targetTask);
    targetTask.parentId = newParentId;
  } else {
    tasksArray.push(targetTask);
    targetTask.parentId = null;
  }
  targetTask.updatedAt = new Date().toISOString();
  return true;
}

function setTaskStatus(tasksArray, taskId, status) {
  assertValidStatus(status);
  const task = findTaskById(tasksArray, taskId);
  if (!task) return null;
  task.status = status;
  task.updatedAt = new Date().toISOString();
  // Optionally: propagate/cascade status up/down tree as needed
  return task;
}


/**
 * Convenience accessor – returns a shallow copy to prevent accidental direct
 * mutations (callers should use the helper functions).
 */
// Helper to flatten tree to a flat array (for legacy usage)
function flattenTasks(tasksArray) {
  const out = [];
  function walk(tasks) {
    for (const t of tasks) {
      out.push(t);
      if (t.children && t.children.length) {
        walk(t.children);
      }
    }
  }
  walk(tasksArray);
  return out;
}

function listTasks(tasksArray) {
  return [...tasksArray];
}

export {
  STATUSES,
  addTask,
  removeTask,
  moveTask,
  editTask,
  setTaskStatus,
  listTasks,
  findTaskById,
  flattenTasks,
};