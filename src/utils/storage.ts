import {
  ActionItem,
  ExecutionLog,
  GlobalMetrics,
  ObligationStatus,
  Requirement,
  RequirementStatus,
  SubStep,
  Task,
  UrgencyLevel,
} from '../types/action';
import { INITIAL_DEMO_ITEMS } from './demoData';
import { actionApi } from './api';

const STORAGE_KEY_V2 = 'actionos_items_v2';
const LEGACY_STORAGE_KEY_V1 = 'actionos_items_v1';

const VALID_URGENCY: UrgencyLevel[] = ['urgent', 'high', 'medium', 'low'];
const VALID_REQ_STATUS: RequirementStatus[] = ['obtained', 'pending', 'not_needed'];
const VALID_OBLIGATION_STATUS: ObligationStatus[] = ['active', 'blocked', 'completed'];

function parseMinutesFromEffort(effort?: string, explicitMinutes?: number): number {
  if (typeof explicitMinutes === 'number' && !Number.isNaN(explicitMinutes) && explicitMinutes > 0) {
    return explicitMinutes;
  }
  if (!effort || typeof effort !== 'string') return 25;
  const lower = effort.toLowerCase();
  const numMatch = lower.match(/(\d+(\.\d+)?)/);
  if (!numMatch) return 25;
  const val = parseFloat(numMatch[1]);
  if (lower.includes('day')) return Math.round(val * 120);
  if (lower.includes('hour') || lower.includes('hr')) return Math.round(val * 60);
  return Math.round(val);
}

export function sanitizeSubStep(raw: any, index: number): SubStep {
  return {
    id: typeof raw?.id === 'string' && raw.id.trim() ? raw.id : `sub-${Date.now()}-${index}`,
    title: typeof raw?.title === 'string' && raw.title.trim() ? raw.title.trim() : `Sub-step ${index + 1}`,
    completed: Boolean(raw?.completed),
    estimatedMinutes:
      typeof raw?.estimatedMinutes === 'number' && !Number.isNaN(raw.estimatedMinutes)
        ? Math.max(1, Math.round(raw.estimatedMinutes))
        : undefined,
    suggestedAction:
      typeof raw?.suggestedAction === 'string' && raw.suggestedAction.trim()
        ? raw.suggestedAction.trim()
        : undefined,
  };
}

export function sanitizeTask(raw: any, index: number): Task {
  const completed = Boolean(raw?.completed);
  const priority =
    raw?.priority === 'high' || raw?.priority === 'medium' || raw?.priority === 'low'
      ? raw.priority
      : 'medium';

  const subSteps: SubStep[] = Array.isArray(raw?.subSteps)
    ? raw.subSteps.map((s: any, idx: number) => sanitizeSubStep(s, idx))
    : [];

  let status: Task['status'] = raw?.status;
  if (completed) {
    status = 'done';
  } else if (status !== 'todo' && status !== 'in_progress' && status !== 'blocked') {
    status = 'todo';
  }

  const estimatedMinutes = parseMinutesFromEffort(raw?.estimatedEffort, raw?.estimatedMinutes);

  return {
    id: typeof raw?.id === 'string' && raw.id.trim() ? raw.id : `task-${Date.now()}-${index}`,
    title:
      typeof raw?.title === 'string' && raw.title.trim()
        ? raw.title.trim()
        : `Milestone Task ${index + 1}`,
    completed,
    status,
    priority,
    dueDate: typeof raw?.dueDate === 'string' && raw.dueDate.trim() ? raw.dueDate.trim() : undefined,
    dependencies: Array.isArray(raw?.dependencies)
      ? raw.dependencies.filter((d: any) => typeof d === 'string' && d.trim())
      : undefined,
    estimatedEffort:
      typeof raw?.estimatedEffort === 'string' && raw.estimatedEffort.trim()
        ? raw.estimatedEffort.trim()
        : `${estimatedMinutes} mins`,
    estimatedMinutes,
    notes: typeof raw?.notes === 'string' && raw.notes.trim() ? raw.notes.trim() : undefined,
    subSteps,
  };
}

export function sanitizeRequirement(raw: any, index: number): Requirement {
  const status: RequirementStatus = VALID_REQ_STATUS.includes(raw?.status)
    ? raw.status
    : 'pending';
  return {
    id: typeof raw?.id === 'string' && raw.id.trim() ? raw.id : `req-${Date.now()}-${index}`,
    name:
      typeof raw?.name === 'string' && raw.name.trim()
        ? raw.name.trim()
        : `Requirement ${index + 1}`,
    status,
    notes: typeof raw?.notes === 'string' && raw.notes.trim() ? raw.notes.trim() : undefined,
    isExplicitInSource:
      typeof raw?.isExplicitInSource === 'boolean' ? raw.isExplicitInSource : true,
  };
}

export function sanitizeExecutionLog(raw: any, index: number): ExecutionLog {
  const validTypes: ExecutionLog['type'][] = [
    'note',
    'status_change',
    'ai_synthesis',
    'decomposition',
  ];
  return {
    id: typeof raw?.id === 'string' && raw.id.trim() ? raw.id : `log-${Date.now()}-${index}`,
    timestamp:
      typeof raw?.timestamp === 'string' && !Number.isNaN(Date.parse(raw.timestamp))
        ? raw.timestamp
        : new Date().toISOString(),
    note: typeof raw?.note === 'string' && raw.note.trim() ? raw.note.trim() : 'Workspace updated.',
    type: validTypes.includes(raw?.type) ? raw.type : 'note',
  };
}

/**
 * Runtime schema validator and sanitizer.
 * Repairs missing arrays/fields from older localStorage versions or malformed imports.
 */
export function validateAndSanitizeActionItem(raw: any, index = 0): ActionItem | null {
  if (!raw || typeof raw !== 'object') return null;
  if (typeof raw.title !== 'string' || !raw.title.trim()) return null;

  const tasks: Task[] = Array.isArray(raw.tasks)
    ? raw.tasks.map((t: any, i: number) => sanitizeTask(t, i))
    : [];

  const requirements: Requirement[] = Array.isArray(raw.requirements)
    ? raw.requirements.map((r: any, i: number) => sanitizeRequirement(r, i))
    : [];

  const allCompleted = tasks.length > 0 && tasks.every((t) => t.completed);
  const hasBlockedTask = tasks.some((t) => !t.completed && t.status === 'blocked');

  let status: ObligationStatus = VALID_OBLIGATION_STATUS.includes(raw.status)
    ? raw.status
    : 'active';

  if (allCompleted) {
    status = 'completed';
  } else if (hasBlockedTask && status !== 'blocked') {
    status = 'blocked';
  } else if (!allCompleted && status === 'completed') {
    status = 'active';
  }

  const urgency: UrgencyLevel = VALID_URGENCY.includes(raw.urgency) ? raw.urgency : 'medium';

  const category =
    typeof raw.category === 'string' && raw.category.trim() ? raw.category.trim() : 'General';

  const tags: string[] = Array.isArray(raw.tags)
    ? Array.from(
        new Set(
          raw.tags
            .filter((t: any) => typeof t === 'string' && t.trim())
            .map((t: string) => t.trim().toLowerCase())
        )
      )
    : [category.toLowerCase()];

  const executionLogs: ExecutionLog[] = Array.isArray(raw.executionLogs)
    ? raw.executionLogs.map((l: any, i: number) => sanitizeExecutionLog(l, i))
    : [
        {
          id: `log-init-${index}`,
          timestamp:
            typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
          note: 'Workspace initialized and validated.',
          type: 'ai_synthesis',
        },
      ];

  const suggestedNextAction =
    raw.suggestedNextAction && typeof raw.suggestedNextAction === 'object'
      ? {
          title:
            typeof raw.suggestedNextAction.title === 'string' &&
            raw.suggestedNextAction.title.trim()
              ? raw.suggestedNextAction.title.trim()
              : tasks.find((t) => !t.completed)?.title || 'Review open milestones',
          reason:
            typeof raw.suggestedNextAction.reason === 'string' &&
            raw.suggestedNextAction.reason.trim()
              ? raw.suggestedNextAction.reason.trim()
              : 'Primary leverage point to advance obligation completion.',
          followUp:
            typeof raw.suggestedNextAction.followUp === 'string' &&
            raw.suggestedNextAction.followUp.trim()
              ? raw.suggestedNextAction.followUp.trim()
              : 'Proceed to the next dependent task in the checklist.',
          generatedAt:
            typeof raw.suggestedNextAction.generatedAt === 'string'
              ? raw.suggestedNextAction.generatedAt
              : undefined,
          estimatedMinutes:
            typeof raw.suggestedNextAction.estimatedMinutes === 'number'
              ? raw.suggestedNextAction.estimatedMinutes
              : undefined,
        }
      : {
          title: tasks.find((t) => !t.completed)?.title || 'Review requirements and milestones',
          reason: 'Unblocks downstream tasks and ensures timely completion.',
          followUp: 'Verify remaining document prerequisites.',
        };

  return {
    id:
      typeof raw.id === 'string' && raw.id.trim()
        ? raw.id.trim()
        : `action-${Date.now()}-${index}`,
    title: raw.title.trim(),
    shortSummary:
      typeof raw.shortSummary === 'string' && raw.shortSummary.trim()
        ? raw.shortSummary.trim()
        : 'Structured execution workspace.',
    category,
    tags,
    status,
    deadline:
      typeof raw.deadline === 'string' &&
      raw.deadline.trim() &&
      raw.deadline !== 'No deadline specified'
        ? raw.deadline.trim()
        : null,
    deadlineIsAmbiguous: Boolean(raw.deadlineIsAmbiguous),
    urgency,
    requirements,
    tasks,
    suggestedNextAction,
    warnings: Array.isArray(raw.warnings)
      ? raw.warnings.filter((w: any) => typeof w === 'string' && w.trim())
      : [],
    executionLogs,
    confidence:
      raw.confidence === 'high' || raw.confidence === 'medium' || raw.confidence === 'low'
        ? raw.confidence
        : 'high',
    createdAt:
      typeof raw.createdAt === 'string' && !Number.isNaN(Date.parse(raw.createdAt))
        ? raw.createdAt
        : new Date().toISOString(),
    updatedAt:
      typeof raw.updatedAt === 'string' && !Number.isNaN(Date.parse(raw.updatedAt))
        ? raw.updatedAt
        : new Date().toISOString(),
    version: typeof raw.version === 'number' && raw.version > 0 ? raw.version : 1,
    sourceType:
      raw.sourceType === 'image' ||
      raw.sourceType === 'pdf' ||
      raw.sourceType === 'ai_command'
        ? raw.sourceType
        : 'text',
    sourceSnippet: typeof raw.sourceSnippet === 'string' ? raw.sourceSnippet : undefined,
    sourceFileName: typeof raw.sourceFileName === 'string' ? raw.sourceFileName : undefined,
  };
}

let syncTimeout: ReturnType<typeof setTimeout> | null = null;

function scheduleBackgroundServerSync(items: ActionItem[]): void {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    actionApi.syncItemsWithServer(items).catch(() => {
      // Silent background sync fallback — localStorage remains authoritative offline
    });
  }, 400);
}

/**
 * Loads and validates ActionItems from localStorage, migrating v1 items automatically.
 * Gracefully falls back to INITIAL_DEMO_ITEMS if storage is empty or corrupted.
 */
export function loadActionItems(): ActionItem[] {
  try {
    let raw = localStorage.getItem(STORAGE_KEY_V2);
    if (!raw) {
      const legacyRaw = localStorage.getItem(LEGACY_STORAGE_KEY_V1);
      if (legacyRaw) {
        raw = legacyRaw;
      }
    }

    if (!raw) {
      saveActionItems(INITIAL_DEMO_ITEMS);
      return INITIAL_DEMO_ITEMS;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      saveActionItems(INITIAL_DEMO_ITEMS);
      return INITIAL_DEMO_ITEMS;
    }

    // Allow intentional empty state if user cleared all items, otherwise sanitize
    if (parsed.length === 0) {
      return [];
    }

    const sanitized = parsed
      .map((item, idx) => validateAndSanitizeActionItem(item, idx))
      .filter((item): item is ActionItem => item !== null);

    if (sanitized.length === 0) {
      saveActionItems(INITIAL_DEMO_ITEMS);
      return INITIAL_DEMO_ITEMS;
    }

    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(sanitized));
    return sanitized;
  } catch (err) {
    console.warn('Corrupted local storage detected; hydrating fallback demo obligations:', err);
    saveActionItems(INITIAL_DEMO_ITEMS);
    return INITIAL_DEMO_ITEMS;
  }
}

export function saveActionItems(items: ActionItem[]): void {
  try {
    const sanitized = items
      .map((item, idx) => validateAndSanitizeActionItem(item, idx))
      .filter((item): item is ActionItem => item !== null);
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(sanitized));
    scheduleBackgroundServerSync(sanitized);
  } catch (err) {
    console.error('Failed to save ActionOS items to storage:', err);
  }
}

export function resetToDemoData(): ActionItem[] {
  const cloned = JSON.parse(JSON.stringify(INITIAL_DEMO_ITEMS)) as ActionItem[];
  saveActionItems(cloned);
  return cloned;
}

export function clearAllItems(): ActionItem[] {
  try {
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify([]));
    scheduleBackgroundServerSync([]);
  } catch (err) {
    console.error('Failed to clear ActionOS storage:', err);
  }
  return [];
}

export function addActionItem(newItem: ActionItem, currentItems?: ActionItem[]): ActionItem[] {
  const base = currentItems ?? loadActionItems();
  const validated = validateAndSanitizeActionItem(newItem, 0) ?? newItem;
  const updated = [validated, ...base.filter((i) => i.id !== validated.id)];
  saveActionItems(updated);
  return updated;
}

export function updateActionItem(
  updatedItem: ActionItem,
  currentItems?: ActionItem[]
): ActionItem[] {
  const base = currentItems ?? loadActionItems();
  const nextVersion = (updatedItem.version || 1) + 1;
  const sanitized =
    validateAndSanitizeActionItem({
      ...updatedItem,
      updatedAt: new Date().toISOString(),
      version: nextVersion,
    }) ?? updatedItem;

  const updated = base.map((item) => (item.id === sanitized.id ? sanitized : item));
  saveActionItems(updated);
  return updated;
}

export function deleteActionItem(id: string, currentItems?: ActionItem[]): ActionItem[] {
  const base = currentItems ?? loadActionItems();
  const filtered = base.filter((i) => i.id !== id);
  saveActionItems(filtered);
  return filtered;
}

export function appendExecutionLog(
  item: ActionItem,
  note: string,
  type: ExecutionLog['type'] = 'note'
): ActionItem {
  const logEntry: ExecutionLog = {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    note: note.trim(),
    type,
  };
  return {
    ...item,
    executionLogs: [logEntry, ...(item.executionLogs || [])],
    updatedAt: new Date().toISOString(),
    version: (item.version || 1) + 1,
  };
}

export function toggleTaskCompletion(
  itemId: string,
  taskId: string,
  currentItems?: ActionItem[]
): ActionItem | undefined {
  const items = currentItems ? [...currentItems] : loadActionItems();
  const item = items.find((i) => i.id === itemId);
  if (!item) return undefined;

  let toggledTaskTitle = '';
  let newCompletedState = false;

  const updatedTasks = item.tasks.map((task) => {
    if (task.id === taskId) {
      newCompletedState = !task.completed;
      toggledTaskTitle = task.title;
      const nextStatus: Task['status'] = newCompletedState ? 'done' : 'todo';
      const updatedSubSteps = task.subSteps?.map((s) => ({
        ...s,
        completed: newCompletedState ? true : s.completed,
      }));
      return {
        ...task,
        completed: newCompletedState,
        status: nextStatus,
        subSteps: updatedSubSteps,
      };
    }
    return task;
  });

  const allCompleted = updatedTasks.length > 0 && updatedTasks.every((t) => t.completed);
  const hasBlocked = updatedTasks.some((t) => !t.completed && t.status === 'blocked');
  const nextItemStatus: ObligationStatus = allCompleted
    ? 'completed'
    : hasBlocked
    ? 'blocked'
    : 'active';

  const updatedItem = appendExecutionLog(
    {
      ...item,
      tasks: updatedTasks,
      status: nextItemStatus,
    },
    `${newCompletedState ? 'Completed' : 'Reopened'} milestone: "${toggledTaskTitle}"`,
    'status_change'
  );

  updateActionItem(updatedItem, items);
  return validateAndSanitizeActionItem(updatedItem) ?? updatedItem;
}

export function toggleSubStepCompletion(
  itemId: string,
  taskId: string,
  subStepId: string,
  currentItems?: ActionItem[]
): ActionItem | undefined {
  const items = currentItems ? [...currentItems] : loadActionItems();
  const item = items.find((i) => i.id === itemId);
  if (!item) return undefined;

  const updatedTasks = item.tasks.map((task) => {
    if (task.id !== taskId || !task.subSteps) return task;
    const nextSubSteps = task.subSteps.map((s) =>
      s.id === subStepId ? { ...s, completed: !s.completed } : s
    );
    const allSubsDone = nextSubSteps.length > 0 && nextSubSteps.every((s) => s.completed);
    const anySubDone = nextSubSteps.some((s) => s.completed);
    return {
      ...task,
      subSteps: nextSubSteps,
      completed: allSubsDone ? true : task.completed,
      status: allSubsDone ? ('done' as const) : anySubDone ? ('in_progress' as const) : task.status,
    };
  });

  const updatedItem: ActionItem = {
    ...item,
    tasks: updatedTasks,
    updatedAt: new Date().toISOString(),
    version: (item.version || 1) + 1,
  };

  const sanitized = validateAndSanitizeActionItem(updatedItem) ?? updatedItem;
  updateActionItem(sanitized, items);
  return sanitized;
}

export function toggleRequirementStatus(
  itemId: string,
  reqId: string,
  currentItems?: ActionItem[]
): ActionItem | undefined {
  const items = currentItems ? [...currentItems] : loadActionItems();
  const item = items.find((i) => i.id === itemId);
  if (!item) return undefined;

  let reqName = '';
  let nextStatus: RequirementStatus = 'pending';

  const updatedReqs = item.requirements.map((req) => {
    if (req.id === reqId) {
      nextStatus = req.status === 'obtained' ? 'pending' : 'obtained';
      reqName = req.name;
      return { ...req, status: nextStatus };
    }
    return req;
  });

  const updatedItem = appendExecutionLog(
    {
      ...item,
      requirements: updatedReqs,
    },
    `Marked requirement "${reqName}" as ${nextStatus}.`,
    'status_change'
  );

  updateActionItem(updatedItem, items);
  return updatedItem;
}

export function addTaskToItem(
  itemId: string,
  task: Omit<Task, 'id'>,
  currentItems?: ActionItem[]
): ActionItem | undefined {
  const items = currentItems ? [...currentItems] : loadActionItems();
  const item = items.find((i) => i.id === itemId);
  if (!item) return undefined;

  const newTask = sanitizeTask(
    {
      ...task,
      id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    },
    item.tasks.length
  );

  const updatedItem = appendExecutionLog(
    {
      ...item,
      tasks: [...item.tasks, newTask],
    },
    `Added task: "${newTask.title}"`,
    'note'
  );

  const sanitized = validateAndSanitizeActionItem(updatedItem) ?? updatedItem;
  updateActionItem(sanitized, items);
  return sanitized;
}

export function deleteTaskFromItem(
  itemId: string,
  taskId: string,
  currentItems?: ActionItem[]
): ActionItem | undefined {
  const items = currentItems ? [...currentItems] : loadActionItems();
  const item = items.find((i) => i.id === itemId);
  if (!item) return undefined;

  const updatedItem: ActionItem = {
    ...item,
    tasks: item.tasks.filter((t) => t.id !== taskId),
    updatedAt: new Date().toISOString(),
    version: (item.version || 1) + 1,
  };

  const sanitized = validateAndSanitizeActionItem(updatedItem) ?? updatedItem;
  updateActionItem(sanitized, items);
  return sanitized;
}

export function calculateItemProgress(item: ActionItem): {
  completed: number;
  total: number;
  percentage: number;
  subStepsCompleted: number;
  subStepsTotal: number;
  remainingMinutes: number;
} {
  const total = item.tasks.length;
  const completed = item.tasks.filter((t) => t.completed).length;

  let subStepsTotal = 0;
  let subStepsCompleted = 0;
  let remainingMinutes = 0;

  item.tasks.forEach((task) => {
    if (task.subSteps && task.subSteps.length > 0) {
      subStepsTotal += task.subSteps.length;
      subStepsCompleted += task.subSteps.filter((s) => s.completed).length;
    }
    if (!task.completed) {
      remainingMinutes += parseMinutesFromEffort(task.estimatedEffort, task.estimatedMinutes);
    }
  });

  const percentage = total === 0 ? 100 : Math.round((completed / total) * 100);

  return {
    completed,
    total,
    percentage,
    subStepsCompleted,
    subStepsTotal,
    remainingMinutes,
  };
}

export function calculateGlobalMetrics(items: ActionItem[]): GlobalMetrics {
  const totalItems = items.length;
  let totalTasks = 0;
  let totalTasksCompleted = 0;
  let completedItems = 0;
  let dueSoonItems = 0;
  let blockedItems = 0;
  let totalSubSteps = 0;
  let completedSubSteps = 0;
  let estimatedRemainingMinutes = 0;

  items.forEach((item) => {
    const isItemDone =
      item.status === 'completed' ||
      (item.tasks.length > 0 && item.tasks.every((t) => t.completed));

    if (isItemDone) {
      completedItems += 1;
    } else {
      if (item.urgency === 'urgent' || item.urgency === 'high') {
        dueSoonItems += 1;
      }
      if (
        item.status === 'blocked' ||
        item.tasks.some((t) => !t.completed && t.status === 'blocked')
      ) {
        blockedItems += 1;
      }
    }

    item.tasks.forEach((t) => {
      totalTasks += 1;
      if (t.completed) {
        totalTasksCompleted += 1;
      } else {
        estimatedRemainingMinutes += parseMinutesFromEffort(
          t.estimatedEffort,
          t.estimatedMinutes
        );
      }

      if (t.subSteps && t.subSteps.length > 0) {
        totalSubSteps += t.subSteps.length;
        completedSubSteps += t.subSteps.filter((s) => s.completed).length;
      }
    });
  });

  const activeItems = Math.max(0, totalItems - completedItems);
  const overallProgressPercentage =
    totalTasks > 0 ? Math.round((totalTasksCompleted / totalTasks) * 100) : 0;

  const completionVelocityPerDay = Math.max(
    1,
    Math.round((totalTasksCompleted + completedSubSteps * 0.5) * 10) / 10
  );

  return {
    totalItems,
    activeItems,
    dueSoonItems,
    blockedItems,
    completedItems,
    totalTasks,
    totalTasksCompleted,
    overallProgressPercentage,
    totalSubSteps,
    completedSubSteps,
    estimatedRemainingMinutes,
    completionVelocityPerDay,
  };
}

/**
 * Full Export / Import Portability (JSON & Markdown)
 */
export function exportItemsToJson(items: ActionItem[]): string {
  return JSON.stringify(
    {
      schemaVersion: 2,
      exportedAt: new Date().toISOString(),
      itemCount: items.length,
      items,
    },
    null,
    2
  );
}

export function importItemsFromJson(jsonString: string): ActionItem[] {
  const parsed = JSON.parse(jsonString);
  const rawList = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.items)
    ? parsed.items
    : null;

  if (!rawList) {
    throw new Error('Invalid JSON structure: expected an array of ActionOS items.');
  }

  const validated = rawList
    .map((item: any, idx: number) => validateAndSanitizeActionItem(item, idx))
    .filter((item: ActionItem | null): item is ActionItem => item !== null);

  if (validated.length === 0) {
    throw new Error('No valid ActionOS workspaces found in the imported file.');
  }

  saveActionItems(validated);
  return validated;
}

export function exportSingleItemToMarkdown(item: ActionItem): string {
  const { completed, total, percentage } = calculateItemProgress(item);
  const lines: string[] = [
    `# ${item.title}`,
    ``,
    `**Category:** ${item.category} · **Urgency:** ${item.urgency.toUpperCase()} · **Status:** ${item.status.toUpperCase()}`,
    `**Deadline:** ${item.deadline || 'No deadline specified'}${item.deadlineIsAmbiguous ? ' *(Ambiguous in source)*' : ''}`,
    `**Progress:** ${percentage}% (${completed}/${total} milestones)`,
    item.tags?.length ? `**Tags:** ${item.tags.map((t) => `#${t}`).join(' ')}` : '',
    ``,
    `## Executive Summary`,
    item.shortSummary,
    ``,
    `## Suggested Next Move`,
    `- **Action:** ${item.suggestedNextAction?.title || 'N/A'}`,
    `- **Why it matters:** ${item.suggestedNextAction?.reason || 'N/A'}`,
    `- **Follow-up:** ${item.suggestedNextAction?.followUp || 'N/A'}`,
    ``,
    `## Action Plan Checklist`,
    ...(item.tasks.length === 0
      ? ['_No tasks defined._']
      : item.tasks.flatMap((t) => {
          const base = `- [${t.completed ? 'x' : ' '}] **${t.title}** (${t.priority.toUpperCase()}${t.dueDate ? `, Due: ${t.dueDate}` : ''}${t.estimatedEffort ? `, Est: ${t.estimatedEffort}` : ''})`;
          const subs = (t.subSteps || []).map(
            (s) =>
              `  - [${s.completed ? 'x' : ' '}] ${s.title}${s.estimatedMinutes ? ` (${s.estimatedMinutes}m)` : ''}`
          );
          return [base, ...subs];
        })),
    ``,
    `## Prerequisites & Documents`,
    ...(item.requirements.length === 0
      ? ['_No specific requirements._']
      : item.requirements.map(
          (r) =>
            `- [${r.status === 'obtained' ? 'x' : ' '}] **${r.name}** — *${r.status.toUpperCase()}*${r.notes ? ` (${r.notes})` : ''}`
        )),
  ];

  if (item.warnings && item.warnings.length > 0) {
    lines.push(``, `## Warnings & Constraints`, ...item.warnings.map((w) => `- ⚠️ ${w}`));
  }

  return lines.filter((line) => line !== undefined).join('\n');
}

export function exportItemsToMarkdown(items: ActionItem[]): string {
  const header = [
    `# ActionOS — Executive Action Plan Export`,
    `Generated: ${new Date().toLocaleString()}`,
    `Total Workspaces: ${items.length}`,
    ``,
    `---`,
    ``,
  ].join('\n');

  return header + items.map((item) => exportSingleItemToMarkdown(item)).join('\n\n---\n\n');
}

export function triggerFileDownload(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
