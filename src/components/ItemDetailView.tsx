import React, { useState } from 'react';
import {
  ArrowLeft,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Circle,
  Send,
  Plus,
  Trash2,
  FileCheck,
  RefreshCw,
  Sparkles,
  Check,
  GitBranch,
  Edit3,
  Download,
  Clock,
  MessageSquarePlus,
} from 'lucide-react';
import {
  ActionItem,
  Requirement,
  Task,
  ChatMessage,
  UrgencyLevel,
  SubStep,
} from '../types/action';
import { actionApi } from '../utils/api';
import {
  calculateItemProgress,
  toggleTaskCompletion,
  toggleSubStepCompletion,
  toggleRequirementStatus,
  addTaskToItem,
  deleteTaskFromItem,
  appendExecutionLog,
  exportSingleItemToMarkdown,
  triggerFileDownload,
} from '../utils/storage';

interface ItemDetailViewProps {
  item: ActionItem;
  onBack: () => void;
  onItemUpdated: (updatedItem: ActionItem) => void;
  onShowToast?: (
    message: string,
    type?: 'success' | 'info' | 'error',
    onRetry?: () => void
  ) => void;
}

const CONTEXTUAL_PROMPTS = [
  'Find my biggest blocker right now',
  'What should I execute next?',
  'What can I finish in under 30 minutes?',
  'Explain eligibility & document rules',
  'Draft an email / follow-up for this obligation',
];

export const ItemDetailView: React.FC<ItemDetailViewProps> = ({
  item,
  onBack,
  onItemUpdated,
  onShowToast,
}) => {
  const [isDeterminingNextAction, setIsDeterminingNextAction] = useState(false);
  const [isDecomposingGoal, setIsDecomposingGoal] = useState(false);
  const [decomposingTaskId, setDecomposingTaskId] = useState<string | null>(null);
  const [nextActionError, setNextActionError] = useState<string | null>(null);

  // Inline Header Editing State
  const [isEditingMeta, setIsEditingMeta] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  const [editSummary, setEditSummary] = useState(item.shortSummary);
  const [editCategory, setEditCategory] = useState(item.category);
  const [editDeadline, setEditDeadline] = useState(item.deadline || '');
  const [editUrgency, setEditUrgency] = useState<UrgencyLevel>(item.urgency);
  const [editTags, setEditTags] = useState((item.tags || []).join(', '));

  // Chat state with streaming support
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);

  // Task adding state
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<'high' | 'medium' | 'low'>(
    'medium'
  );
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskEffort, setNewTaskEffort] = useState('25 mins');

  // Manual Sub-step adding state
  const [addingSubStepTaskId, setAddingSubStepTaskId] = useState<string | null>(null);
  const [newSubStepTitle, setNewSubStepTitle] = useState('');

  // Requirement adding state
  const [isAddingReq, setIsAddingReq] = useState(false);
  const [newReqName, setNewReqName] = useState('');
  const [newReqNotes, setNewReqNotes] = useState('');

  // Execution Log Note state
  const [logNoteInput, setLogNoteInput] = useState('');

  const {
    completed,
    total,
    percentage,
    subStepsCompleted,
    subStepsTotal,
    remainingMinutes,
  } = calculateItemProgress(item);
  const isAllDone = total > 0 && completed === total;
  const matchingIncompleteTask = item.tasks.find((t) => !t.completed);

  const handleSaveMetaEdits = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTitle.trim()) return;

    const parsedTags = editTags
      .split(',')
      .map((t) => t.trim().toLowerCase().replace(/^#/, ''))
      .filter(Boolean);

    const updated = appendExecutionLog(
      {
        ...item,
        title: editTitle.trim(),
        shortSummary: editSummary.trim(),
        category: editCategory.trim() || 'General',
        deadline: editDeadline.trim() || null,
        urgency: editUrgency,
        tags: parsedTags.length > 0 ? parsedTags : [editCategory.trim().toLowerCase()],
      },
      'Updated workspace metadata and deadline settings.',
      'note'
    );

    onItemUpdated(updated);
    setIsEditingMeta(false);
    onShowToast?.('Saved workspace details.');
  };

  const handleTaskToggle = (taskId: string) => {
    const updated = toggleTaskCompletion(item.id, taskId);
    if (updated) {
      onItemUpdated(updated);
    }
  };

  const handleSubStepToggle = (taskId: string, subStepId: string) => {
    const updated = toggleSubStepCompletion(item.id, taskId, subStepId);
    if (updated) {
      onItemUpdated(updated);
    }
  };

  const handleTaskStatusChange = (taskId: string, newStatus: Task['status']) => {
    const updatedTasks = item.tasks.map((t) => {
      if (t.id !== taskId) return t;
      return {
        ...t,
        status: newStatus,
        completed: newStatus === 'done',
      };
    });

    const hasBlocked = updatedTasks.some((t) => !t.completed && t.status === 'blocked');
    const allDone = updatedTasks.length > 0 && updatedTasks.every((t) => t.completed);

    const updated = appendExecutionLog(
      {
        ...item,
        tasks: updatedTasks,
        status: allDone ? 'completed' : hasBlocked ? 'blocked' : 'active',
      },
      `Updated task status to ${newStatus?.replace('_', ' ')}.`,
      'status_change'
    );
    onItemUpdated(updated);
  };

  const handleAddManualSubStep = (taskId: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubStepTitle.trim()) return;

    const newSub: SubStep = {
      id: `sub-man-${Date.now()}`,
      title: newSubStepTitle.trim(),
      completed: false,
      estimatedMinutes: 15,
    };

    const updatedTasks = item.tasks.map((t) =>
      t.id === taskId ? { ...t, subSteps: [...(t.subSteps || []), newSub] } : t
    );

    onItemUpdated({
      ...item,
      tasks: updatedTasks,
      updatedAt: new Date().toISOString(),
    });
    setNewSubStepTitle('');
    setAddingSubStepTaskId(null);
  };

  const handleDecomposeSingleTask = async (task: Task) => {
    setDecomposingTaskId(task.id);
    try {
      const res = await actionApi.decomposeTaskSubSteps({
        itemTitle: item.title,
        itemSummary: item.shortSummary,
        taskTitle: task.title,
        taskPriority: task.priority,
        deadline: item.deadline,
      });

      const updatedTasks = item.tasks.map((t) =>
        t.id === task.id
          ? {
              ...t,
              subSteps: [...(t.subSteps || []), ...(res.subSteps || [])],
              notes: res.executionTip || t.notes,
            }
          : t
      );

      const updated = appendExecutionLog(
        {
          ...item,
          tasks: updatedTasks,
        },
        `AI Decomposer generated ${res.subSteps?.length || 0} sub-steps for "${task.title}".`,
        'decomposition'
      );

      onItemUpdated(updated);
      onShowToast?.(`Decomposed "${task.title}" into ${res.subSteps?.length || 0} sub-steps.`);
    } catch (err: any) {
      onShowToast?.(err?.message || 'Could not decompose task.', 'error');
    } finally {
      setDecomposingTaskId(null);
    }
  };

  const handleDecomposeWorkspaceGoal = async () => {
    setIsDecomposingGoal(true);
    try {
      const res = await actionApi.decomposeGoal({
        goalTitle: item.title,
        goalContext: item.shortSummary,
        deadline: item.deadline,
        urgency: item.urgency,
        existingTasks: item.tasks.map((t) => t.title),
      });

      const updated = appendExecutionLog(
        {
          ...item,
          tasks: [...item.tasks, ...(res.tasks || [])],
          suggestedNextAction: res.suggestedNextAction || item.suggestedNextAction,
        },
        `AI Goal Decomposer added ${res.tasks?.length || 0} time-estimated milestones (${res.estimatedTotalTime}).`,
        'decomposition'
      );

      onItemUpdated(updated);
      onShowToast?.(`Added ${res.tasks?.length || 0} AI-decomposed milestones.`);
    } catch (err: any) {
      onShowToast?.(err?.message || 'Failed to run AI Goal Decomposer.', 'error');
    } finally {
      setIsDecomposingGoal(false);
    }
  };

  const handleReqToggle = (reqId: string) => {
    const updated = toggleRequirementStatus(item.id, reqId);
    if (updated) {
      onItemUpdated(updated);
    }
  };

  const handleDeleteTask = (taskId: string) => {
    const updated = deleteTaskFromItem(item.id, taskId);
    if (updated) {
      onItemUpdated(updated);
    }
  };

  const handleSaveNewTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    const updated = addTaskToItem(item.id, {
      title: newTaskTitle.trim(),
      completed: false,
      priority: newTaskPriority,
      dueDate: newTaskDueDate.trim() || undefined,
      estimatedEffort: newTaskEffort.trim() || '25 mins',
    });

    if (updated) {
      onItemUpdated(updated);
      setNewTaskTitle('');
      setNewTaskDueDate('');
      setIsAddingTask(false);
    }
  };

  const handleSaveNewReq = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newReqName.trim()) return;

    const newReq: Requirement = {
      id: `req-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: newReqName.trim(),
      status: 'pending',
      notes: newReqNotes.trim() || undefined,
      isExplicitInSource: false,
    };

    const updated = appendExecutionLog(
      {
        ...item,
        requirements: [...item.requirements, newReq],
      },
      `Added prerequisite document: "${newReq.name}"`,
      'note'
    );

    onItemUpdated(updated);
    setNewReqName('');
    setNewReqNotes('');
    setIsAddingReq(false);
  };

  const handleAddExecutionNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!logNoteInput.trim()) return;
    const updated = appendExecutionLog(item, logNoteInput.trim(), 'note');
    onItemUpdated(updated);
    setLogNoteInput('');
    onShowToast?.('Logged execution note.');
  };

  const handleDetermineNextAction = async () => {
    setIsDeterminingNextAction(true);
    setNextActionError(null);

    try {
      const data = await actionApi.determineNextAction(item);

      const updatedItem = appendExecutionLog(
        {
          ...item,
          suggestedNextAction: data.recommendation,
        },
        `Re-evaluated Next Move: "${data.recommendation.title}"`,
        'ai_synthesis'
      );

      onItemUpdated(updatedItem);
      onShowToast?.('Updated highest-leverage next move.');
    } catch (err: any) {
      setNextActionError(err?.message || 'Unable to refresh next action.');
    } finally {
      setIsDeterminingNextAction(false);
    }
  };

  const handleSendChat = async (queryText?: string) => {
    const textToSend = (queryText || chatInput).trim();
    if (!textToSend || isChatLoading) return;

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}-user`,
      role: 'user',
      text: textToSend,
      timestamp: new Date().toISOString(),
    };

    const streamingModelId = `msg-${Date.now()}-model`;
    const placeholderModelMessage: ChatMessage = {
      id: streamingModelId,
      role: 'model',
      text: '',
      timestamp: new Date().toISOString(),
      isStreaming: true,
    };

    const historySnapshot = [...chatMessages, userMessage];
    setChatMessages([...historySnapshot, placeholderModelMessage]);
    setChatInput('');
    setIsChatLoading(true);

    try {
      const finalReply = await actionApi.streamChat(
        {
          item,
          messages: chatMessages,
          query: textToSend,
        },
        (partialText) => {
          setChatMessages((prev) =>
            prev.map((m) =>
              m.id === streamingModelId
                ? { ...m, text: partialText, isStreaming: true }
                : m
            )
          );
        }
      );

      setChatMessages((prev) =>
        prev.map((m) =>
          m.id === streamingModelId
            ? { ...m, text: finalReply, isStreaming: false }
            : m
        )
      );
    } catch (err: any) {
      setChatMessages((prev) =>
        prev.map((m) =>
          m.id === streamingModelId
            ? {
                ...m,
                text: `Error: ${err?.message || 'Could not process query.'}`,
                isStreaming: false,
              }
            : m
        )
      );
    } finally {
      setIsChatLoading(false);
    }
  };

  const handleExportSingleMarkdown = () => {
    const md = exportSingleItemToMarkdown(item);
    triggerFileDownload(
      `${item.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.md`,
      md,
      'text/markdown'
    );
    onShowToast?.('Exported workspace to Markdown.');
  };

  return (
    <div className="space-y-6 pb-16 animate-card-enter">
      {/* 1. Top Toolbar: Back Navigation & Actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-mono font-semibold text-zinc-300 hover:text-white bg-[#11131C] hover:bg-[#161924] border border-white/[0.08] rounded-xl px-3.5 py-2 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-cyan-400" />
          <span>Back to Workspaces</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setEditTitle(item.title);
              setEditSummary(item.shortSummary);
              setEditCategory(item.category);
              setEditDeadline(item.deadline || '');
              setEditUrgency(item.urgency);
              setEditTags((item.tags || []).join(', '));
              setIsEditingMeta((prev) => !prev);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-mono text-zinc-300 hover:text-white bg-[#11131C] border border-white/[0.08] rounded-xl transition-colors cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
            <span>{isEditingMeta ? 'Cancel Edit' : 'Edit Details'}</span>
          </button>

          <button
            type="button"
            onClick={handleExportSingleMarkdown}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-mono text-zinc-300 hover:text-white bg-[#11131C] border border-white/[0.08] rounded-xl transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Export .MD</span>
          </button>
        </div>
      </div>

      {/* 2. Workspace Header & Inline Editor */}
      <div className="bg-[#11131C] border border-white/[0.08] rounded-2xl p-6">
        {isEditingMeta ? (
          <form onSubmit={handleSaveMetaEdits} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-mono text-zinc-400 mb-1">
                  Workspace Title
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full text-sm font-bold bg-black/50 border border-white/[0.12] rounded-xl px-3.5 py-2 text-white focus:outline-hidden focus:border-cyan-400"
                />
              </div>
              <div className="grid grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-[11px] font-mono text-zinc-400 mb-1">
                    Category
                  </label>
                  <input
                    type="text"
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    className="w-full text-xs bg-black/50 border border-white/[0.12] rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono text-zinc-400 mb-1">
                    Priority
                  </label>
                  <select
                    value={editUrgency}
                    onChange={(e) => setEditUrgency(e.target.value as UrgencyLevel)}
                    className="w-full text-xs bg-black/50 border border-white/[0.12] rounded-xl px-2.5 py-2 text-white focus:outline-hidden focus:border-cyan-400"
                  >
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-mono text-zinc-400 mb-1">
                    Deadline
                  </label>
                  <input
                    type="text"
                    value={editDeadline}
                    onChange={(e) => setEditDeadline(e.target.value)}
                    placeholder="Oct 15, 2026"
                    className="w-full text-xs bg-black/50 border border-white/[0.12] rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-cyan-400"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-mono text-zinc-400 mb-1">
                Executive Summary
              </label>
              <textarea
                value={editSummary}
                onChange={(e) => setEditSummary(e.target.value)}
                rows={2}
                className="w-full text-xs bg-black/50 border border-white/[0.12] rounded-xl p-3 text-white focus:outline-hidden focus:border-cyan-400"
              />
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex-1">
                <label className="block text-[11px] font-mono text-zinc-400 mb-1">
                  Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={editTags}
                  onChange={(e) => setEditTags(e.target.value)}
                  placeholder="scholarship, stem, financial-aid"
                  className="w-full text-xs bg-black/50 border border-white/[0.12] rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-cyan-400"
                />
              </div>
              <div className="flex items-center gap-2 pt-4">
                <button
                  type="button"
                  onClick={() => setIsEditingMeta(false)}
                  className="px-3.5 py-2 text-xs text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-bold text-black bg-cyan-400 hover:bg-cyan-300 rounded-xl cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </form>
        ) : (
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
            <div className="space-y-2.5 flex-1">
              <div className="flex items-center gap-2 text-xs font-mono text-zinc-400 flex-wrap">
                <span className="text-cyan-400 font-semibold">{item.category}</span>
                <span aria-hidden="true">·</span>
                <span
                  className={
                    item.urgency === 'urgent'
                      ? 'text-rose-400 font-bold'
                      : item.urgency === 'high'
                      ? 'text-amber-400 font-semibold'
                      : 'text-zinc-300'
                  }
                >
                  {item.urgency.toUpperCase()} PRIORITY
                </span>
                <span aria-hidden="true">·</span>
                <span>Status: {item.status.toUpperCase()}</span>
                {item.tags && item.tags.length > 0 && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-zinc-500">
                      {item.tags.map((t) => `#${t}`).join(' ')}
                    </span>
                  </>
                )}
              </div>

              <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                {item.title}
              </h1>

              <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed max-w-3xl">
                {item.shortSummary}
              </p>

              <div className="flex flex-wrap items-center gap-4 pt-2 text-xs font-mono text-zinc-300">
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-cyan-400" />
                  <span className="text-zinc-400">Deadline:</span>
                  <span
                    className={
                      item.deadlineIsAmbiguous
                        ? 'text-amber-300 font-semibold'
                        : 'text-white font-semibold'
                    }
                  >
                    {item.deadline || 'No fixed deadline'}
                  </span>
                </div>

                {remainingMinutes > 0 && (
                  <div className="flex items-center gap-1.5 text-zinc-400 tabular-nums">
                    <Clock className="w-3.5 h-3.5 text-cyan-400" />
                    <span>~{remainingMinutes} mins remaining</span>
                  </div>
                )}
              </div>
            </div>

            {/* Progress Summary Box */}
            <div className="bg-black/40 border border-white/[0.08] rounded-xl p-4 min-w-[230px] shrink-0 font-mono">
              <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
                <span>Completion</span>
                <span className="tabular-nums font-bold text-cyan-400">
                  {percentage}%
                </span>
              </div>
              <div className="w-full bg-zinc-800 h-2 rounded-full overflow-hidden mb-2.5">
                <div
                  className="bg-cyan-400 h-full rounded-full transition-all duration-500"
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-zinc-400 tabular-nums">
                <span>
                  {completed}/{total} tasks
                </span>
                {subStepsTotal > 0 && (
                  <span>
                    {subStepsCompleted}/{subStepsTotal} sub-steps
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Warnings */}
        {item.warnings && item.warnings.length > 0 && (
          <div className="mt-5 pt-4 border-t border-white/[0.06]">
            <h4 className="text-xs font-mono font-bold text-amber-400 flex items-center gap-1.5 mb-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Document Constraints & Caveats</span>
            </h4>
            <ul className="space-y-1 text-xs text-zinc-300">
              {item.warnings.map((warning, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="text-amber-400 font-bold">·</span>
                  <span>{warning}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* 3. Signature Next Move Panel */}
      <section className="bg-[#111420] border border-cyan-500/30 rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/[0.08]">
          <div>
            <h2 className="text-xs font-mono font-bold text-cyan-400">
              Recommended Next Action
            </h2>
            <p className="text-xs text-zinc-400">
              Synthesized from task dependencies, remaining lead times, and pending documents.
            </p>
          </div>

          <button
            type="button"
            onClick={handleDetermineNextAction}
            disabled={isDeterminingNextAction}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-mono font-semibold text-black bg-cyan-400 hover:bg-cyan-300 disabled:bg-zinc-700 rounded-xl transition-colors shrink-0 whitespace-nowrap cursor-pointer"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isDeterminingNextAction ? 'animate-spin' : ''}`}
            />
            <span>
              {isDeterminingNextAction ? 'Re-evaluating...' : 'Re-evaluate Next Move'}
            </span>
          </button>
        </div>

        {nextActionError && (
          <p className="mt-3 text-xs text-rose-300 bg-rose-950/60 p-2.5 rounded-xl border border-rose-800">
            {nextActionError}
          </p>
        )}

        <div className="mt-4 space-y-4">
          <p className="text-lg sm:text-xl font-bold text-white tracking-tight">
            {item.suggestedNextAction?.title ||
              'Review requirements and complete open checklist tasks.'}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1 border-t border-white/[0.06]">
            <div>
              <span className="text-[11px] font-mono font-semibold text-cyan-400 block mb-1">
                Why This Unblocks Momentum
              </span>
              <p className="text-xs text-zinc-300 leading-relaxed">
                {item.suggestedNextAction?.reason}
              </p>
            </div>
            <div>
              <span className="text-[11px] font-mono font-semibold text-cyan-400 block mb-1">
                Immediate Follow-Up
              </span>
              <p className="text-xs text-zinc-300 leading-relaxed">
                {item.suggestedNextAction?.followUp}
              </p>
            </div>
          </div>

          {matchingIncompleteTask && !isAllDone && (
            <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => handleTaskToggle(matchingIncompleteTask.id)}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-black bg-cyan-400 hover:bg-cyan-300 rounded-xl transition-all cursor-pointer"
              >
                <Check className="w-4 h-4 stroke-[2.5]" />
                <span>Complete "{matchingIncompleteTask.title}" →</span>
              </button>
            </div>
          )}
        </div>
      </section>

      {/* 4. Two-Column Execution Deck */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column (Span 7): Action Plan Checklist, Sub-Steps, Requirements & Logs */}
        <div className="lg:col-span-7 space-y-6">
          {/* Action Plan Checklist */}
          <div className="bg-[#11131C] border border-white/[0.08] rounded-2xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-white/[0.06]">
              <div>
                <h3 className="text-base font-bold text-white tracking-tight">
                  Action Plan & Sub-Steps
                </h3>
                <p className="text-xs text-zinc-400">
                  Sequential milestones with AI-assisted sub-step breakdown.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDecomposeWorkspaceGoal}
                  disabled={isDecomposingGoal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-semibold text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-xl transition-colors cursor-pointer whitespace-nowrap"
                >
                  <GitBranch
                    className={`w-3.5 h-3.5 ${isDecomposingGoal ? 'animate-spin' : ''}`}
                  />
                  <span>
                    {isDecomposingGoal ? 'Decomposing...' : 'AI Decompose Goal'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsAddingTask(!isAddingTask)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-semibold text-zinc-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Add Task</span>
                </button>
              </div>
            </div>

            {/* Inline Add Task Form */}
            {isAddingTask && (
              <form
                onSubmit={handleSaveNewTask}
                className="p-4 bg-black/40 border border-white/[0.08] rounded-xl space-y-3"
              >
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="Task title (e.g. Schedule signature meeting with advisor)..."
                  className="w-full text-xs bg-white/[0.05] border border-white/[0.1] rounded-lg p-2.5 text-white placeholder:text-zinc-500 focus:outline-hidden focus:border-cyan-500"
                  autoFocus
                />
                <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
                  <div className="flex items-center gap-1.5">
                    <span className="text-zinc-400">Priority:</span>
                    <select
                      value={newTaskPriority}
                      onChange={(e) => setNewTaskPriority(e.target.value as any)}
                      className="text-xs bg-zinc-900 border border-white/[0.1] rounded-lg px-2 py-1 text-white"
                    >
                      <option value="high">High</option>
                      <option value="medium">Medium</option>
                      <option value="low">Low</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-zinc-400">Est:</span>
                    <input
                      type="text"
                      value={newTaskEffort}
                      onChange={(e) => setNewTaskEffort(e.target.value)}
                      placeholder="30 mins"
                      className="w-24 text-xs bg-zinc-900 border border-white/[0.1] rounded-lg px-2 py-1 text-white"
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-zinc-400">Due:</span>
                    <input
                      type="text"
                      value={newTaskDueDate}
                      onChange={(e) => setNewTaskDueDate(e.target.value)}
                      placeholder="Oct 10, 2026"
                      className="w-28 text-xs bg-zinc-900 border border-white/[0.1] rounded-lg px-2 py-1 text-white"
                    />
                  </div>

                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsAddingTask(false)}
                      className="px-2.5 py-1 text-xs text-zinc-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-3 py-1 text-xs font-bold text-black bg-cyan-400 hover:bg-cyan-300 rounded-lg cursor-pointer"
                    >
                      Save Task
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Tasks List */}
            <div className="space-y-3">
              {item.tasks.length === 0 ? (
                <p className="text-xs text-zinc-500 py-4 text-center font-mono">
                  No tasks defined. Click "AI Decompose Goal" or "Add Task" to build your checklist.
                </p>
              ) : (
                item.tasks.map((task) => {
                  const isDecomposingThis = decomposingTaskId === task.id;
                  return (
                    <div
                      key={task.id}
                      className={`p-4 rounded-xl border transition-all ${
                        task.completed
                          ? 'bg-black/25 border-white/[0.04] opacity-65'
                          : task.status === 'blocked'
                          ? 'bg-rose-950/15 border-rose-500/30'
                          : 'bg-white/[0.02] border-white/[0.07]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 flex-1 min-w-0">
                          <button
                            type="button"
                            onClick={() => handleTaskToggle(task.id)}
                            className="mt-0.5 text-zinc-500 hover:text-cyan-400 transition-colors shrink-0 cursor-pointer"
                            title={
                              task.completed
                                ? 'Mark task incomplete'
                                : 'Mark task complete'
                            }
                          >
                            {task.completed ? (
                              <CheckCircle2 className="w-5 h-5 text-cyan-400 animate-check-pop" />
                            ) : (
                              <Circle className="w-5 h-5 text-zinc-500 hover:text-cyan-400" />
                            )}
                          </button>

                          <div className="space-y-1.5 flex-1 min-w-0">
                            <p
                              className={`text-xs sm:text-sm leading-snug ${
                                task.completed
                                  ? 'line-through text-zinc-500'
                                  : 'text-white font-semibold'
                              }`}
                            >
                              {task.title}
                            </p>

                            {/* Unboxed Metadata Row */}
                            <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400 flex-wrap">
                              <span
                                className={
                                  task.priority === 'high'
                                    ? 'text-rose-400 font-bold'
                                    : task.priority === 'medium'
                                    ? 'text-amber-400 font-medium'
                                    : 'text-zinc-500'
                                }
                              >
                                {task.priority.toUpperCase()}
                              </span>

                              <span aria-hidden="true">·</span>

                              <select
                                value={task.completed ? 'done' : task.status || 'todo'}
                                onChange={(e) =>
                                  handleTaskStatusChange(
                                    task.id,
                                    e.target.value as Task['status']
                                  )
                                }
                                aria-label="Task status"
                                className="bg-black/40 border border-white/[0.08] rounded px-1.5 py-0.5 text-[10px] text-zinc-300"
                              >
                                <option value="todo">To Do</option>
                                <option value="in_progress">In Progress</option>
                                <option value="blocked">Blocked</option>
                                <option value="done">Done</option>
                              </select>

                              {task.estimatedEffort && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="tabular-nums text-zinc-300">
                                    Est. {task.estimatedEffort}
                                  </span>
                                </>
                              )}

                              {task.dueDate && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="tabular-nums text-zinc-400">
                                    Due {task.dueDate}
                                  </span>
                                </>
                              )}
                            </div>

                            {task.notes && (
                              <p className="text-[11px] text-cyan-300/90 font-normal">
                                Tip: {task.notes}
                              </p>
                            )}

                            {/* Sub-Steps List */}
                            {task.subSteps && task.subSteps.length > 0 && (
                              <div className="pt-2 mt-2 border-t border-white/[0.06] space-y-1.5">
                                {task.subSteps.map((sub) => (
                                  <div
                                    key={sub.id}
                                    onClick={() => handleSubStepToggle(task.id, sub.id)}
                                    className="flex items-start gap-2.5 text-xs py-1 px-2 rounded-lg hover:bg-white/[0.03] cursor-pointer"
                                  >
                                    {sub.completed ? (
                                      <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400 mt-0.5 shrink-0" />
                                    ) : (
                                      <Circle className="w-3.5 h-3.5 text-zinc-600 mt-0.5 shrink-0" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <span
                                        className={
                                          sub.completed
                                            ? 'line-through text-zinc-500'
                                            : 'text-zinc-200'
                                        }
                                      >
                                        {sub.title}
                                      </span>
                                      {(sub.estimatedMinutes || sub.suggestedAction) && (
                                        <div className="text-[10px] font-mono text-zinc-500 mt-0.5">
                                          {sub.estimatedMinutes && (
                                            <span className="tabular-nums">
                                              {sub.estimatedMinutes}m
                                            </span>
                                          )}
                                          {sub.estimatedMinutes &&
                                            sub.suggestedAction && <span> · </span>}
                                          {sub.suggestedAction && (
                                            <span>{sub.suggestedAction}</span>
                                          )}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Task Sub-Step Actions */}
                            {!task.completed && (
                              <div className="flex items-center gap-3 pt-1">
                                <button
                                  type="button"
                                  onClick={() => handleDecomposeSingleTask(task)}
                                  disabled={isDecomposingThis}
                                  className="inline-flex items-center gap-1 text-[11px] font-mono text-cyan-400 hover:text-cyan-300 cursor-pointer"
                                >
                                  <GitBranch className="w-3 h-3" />
                                  <span>
                                    {isDecomposingThis
                                      ? 'Generating sub-steps...'
                                      : 'Break Down Sub-Steps (AI)'}
                                  </span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    setAddingSubStepTaskId(
                                      addingSubStepTaskId === task.id ? null : task.id
                                    )
                                  }
                                  className="inline-flex items-center gap-1 text-[11px] font-mono text-zinc-400 hover:text-white cursor-pointer"
                                >
                                  <Plus className="w-3 h-3" />
                                  <span>Add Sub-Step</span>
                                </button>
                              </div>
                            )}

                            {addingSubStepTaskId === task.id && (
                              <form
                                onSubmit={(e) => handleAddManualSubStep(task.id, e)}
                                className="flex items-center gap-2 pt-2"
                              >
                                <input
                                  type="text"
                                  value={newSubStepTitle}
                                  onChange={(e) => setNewSubStepTitle(e.target.value)}
                                  placeholder="Sub-step description..."
                                  className="flex-1 text-xs bg-black/50 border border-white/[0.1] rounded-lg px-2.5 py-1.5 text-white"
                                  autoFocus
                                />
                                <button
                                  type="submit"
                                  className="px-2.5 py-1.5 text-xs font-bold text-black bg-cyan-400 rounded-lg cursor-pointer"
                                >
                                  Add
                                </button>
                              </form>
                            )}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteTask(task.id)}
                          aria-label={`Delete task ${task.title}`}
                          className="text-zinc-600 hover:text-rose-400 p-1 rounded-md transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Prerequisites & Documents Checklist */}
          <div className="bg-[#11131C] border border-white/[0.08] rounded-2xl p-6 space-y-4">
            <div className="flex items-center justify-between pb-3.5 border-b border-white/[0.06]">
              <div>
                <h3 className="text-base font-bold text-white tracking-tight">
                  Prerequisites & Documents
                </h3>
                <p className="text-xs text-zinc-400">
                  Required verifications and attachments.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsAddingReq(!isAddingReq)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-semibold text-zinc-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-cyan-400" />
                <span>Add Document</span>
              </button>
            </div>

            {isAddingReq && (
              <form
                onSubmit={handleSaveNewReq}
                className="p-4 bg-black/40 border border-white/[0.08] rounded-xl space-y-3"
              >
                <input
                  type="text"
                  value={newReqName}
                  onChange={(e) => setNewReqName(e.target.value)}
                  placeholder="Document or requirement name..."
                  className="w-full text-xs bg-white/[0.05] border border-white/[0.1] rounded-lg p-2.5 text-white"
                  autoFocus
                />
                <input
                  type="text"
                  value={newReqNotes}
                  onChange={(e) => setNewReqNotes(e.target.value)}
                  placeholder="Optional format notes..."
                  className="w-full text-xs bg-white/[0.05] border border-white/[0.1] rounded-lg p-2.5 text-white"
                />
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddingReq(false)}
                    className="px-3 py-1 text-xs text-zinc-400 hover:text-white"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3.5 py-1 text-xs font-bold text-black bg-cyan-400 rounded-lg cursor-pointer"
                  >
                    Save
                  </button>
                </div>
              </form>
            )}

            <div className="space-y-2.5">
              {item.requirements.length === 0 ? (
                <p className="text-xs text-zinc-500 py-3 text-center font-mono">
                  No specific documents listed.
                </p>
              ) : (
                item.requirements.map((req) => {
                  const isObtained = req.status === 'obtained';
                  return (
                    <div
                      key={req.id}
                      onClick={() => handleReqToggle(req.id)}
                      className={`flex items-start justify-between gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                        isObtained
                          ? 'bg-emerald-950/20 border-emerald-500/30'
                          : 'bg-white/[0.02] border-white/[0.06] hover:border-cyan-500/30'
                      }`}
                    >
                      <div className="flex items-start gap-3 flex-1">
                        <div className="mt-0.5 shrink-0">
                          {isObtained ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <FileCheck className="w-4 h-4 text-zinc-500" />
                          )}
                        </div>
                        <div className="space-y-0.5">
                          <p
                            className={`text-xs ${
                              isObtained
                                ? 'text-emerald-300 font-bold'
                                : 'text-white font-semibold'
                            }`}
                          >
                            {req.name}
                          </p>
                          {req.notes && (
                            <p className="text-[11px] text-zinc-400">{req.notes}</p>
                          )}
                          <div className="text-[10px] font-mono text-zinc-500 pt-0.5">
                            <span>
                              {req.isExplicitInSource
                                ? 'Explicit in source'
                                : 'Recommended practice'}
                            </span>
                            <span> · </span>
                            <span
                              className={
                                isObtained ? 'text-emerald-400' : 'text-amber-400'
                              }
                            >
                              {isObtained ? 'Obtained' : 'Pending'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <span className="text-xs font-mono text-zinc-400 hover:text-white shrink-0">
                        {isObtained ? 'Obtained ✓' : 'Mark Obtained'}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Execution Logs & Notes Timeline */}
          <div className="bg-[#11131C] border border-white/[0.08] rounded-2xl p-6 space-y-4">
            <div className="pb-3 border-b border-white/[0.06]">
              <h3 className="text-base font-bold text-white tracking-tight">
                Execution Log & Notes
              </h3>
              <p className="text-xs text-zinc-400">
                Record progress notes, confirmation numbers, and view AI synthesis history.
              </p>
            </div>

            <form onSubmit={handleAddExecutionNote} className="flex items-center gap-2">
              <input
                type="text"
                value={logNoteInput}
                onChange={(e) => setLogNoteInput(e.target.value)}
                placeholder="Add an execution note (e.g. Submitted receipt #88412)..."
                className="flex-1 text-xs bg-black/40 border border-white/[0.08] rounded-xl px-3.5 py-2 text-white placeholder:text-zinc-500 focus:outline-hidden focus:border-cyan-500"
              />
              <button
                type="submit"
                disabled={!logNoteInput.trim()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-black bg-cyan-400 hover:bg-cyan-300 disabled:bg-zinc-700 disabled:text-zinc-500 rounded-xl cursor-pointer whitespace-nowrap"
              >
                <MessageSquarePlus className="w-3.5 h-3.5" />
                <span>Log Note</span>
              </button>
            </form>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {(item.executionLogs || []).map((log) => (
                <div
                  key={log.id}
                  className="flex items-start justify-between gap-3 py-2 border-b border-white/[0.04] last:border-b-0 text-xs"
                >
                  <p className="text-zinc-300 leading-relaxed">{log.note}</p>
                  <span className="text-[10px] font-mono text-zinc-500 tabular-nums shrink-0">
                    {new Date(log.timestamp).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column (Span 5): Streaming Contextual Assistant ("Obligation Terminal") */}
        <div className="lg:col-span-5 bg-[#11131C] border border-white/[0.08] rounded-2xl overflow-hidden flex flex-col h-[700px] lg:sticky lg:top-22">
          <div className="px-5 py-4 border-b border-white/[0.08] bg-black/30 flex items-center justify-between">
            <div>
              <h3 className="text-xs font-mono font-bold text-white uppercase">
                Contextual Obligation Assistant
              </h3>
              <p className="text-[11px] text-zinc-400">
                Live streaming reasoning grounded in this workspace
              </p>
            </div>
          </div>

          <div className="px-4 py-3 border-b border-white/[0.06] bg-black/20">
            <div className="flex flex-wrap gap-1.5">
              {CONTEXTUAL_PROMPTS.map((prompt, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSendChat(prompt)}
                  disabled={isChatLoading}
                  className="text-[11px] font-mono px-2.5 py-1 bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.07] rounded-lg text-zinc-300 transition-colors text-left cursor-pointer"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          {/* Conversation Thread */}
          <div className="flex-1 p-4 overflow-y-auto space-y-3.5">
            {chatMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-500">
                <Sparkles className="w-7 h-7 text-cyan-400/50 mb-2" />
                <p className="text-xs font-bold text-zinc-300 mb-1">
                  Ask about deadlines, blockers, or draft follow-ups
                </p>
                <p className="text-[11px] text-zinc-500 max-w-xs">
                  Responses stream in real time using the workspace's tasks, sub-steps, and document requirements.
                </p>
              </div>
            ) : (
              chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-[88%] rounded-xl p-3.5 text-xs leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-cyan-500/20 text-cyan-100 border border-cyan-500/30 font-medium'
                        : 'bg-white/[0.04] text-zinc-200 border border-white/[0.07]'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">
                      {msg.text || (msg.isStreaming ? 'Synthesizing response...' : '')}
                    </p>
                    <span className="text-[9px] block text-right mt-1 font-mono text-zinc-500 tabular-nums">
                      {new Date(msg.timestamp).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Input Bar */}
          <div className="p-3 border-t border-white/[0.08] bg-black/40">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendChat();
              }}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                placeholder="Ask about this obligation..."
                disabled={isChatLoading}
                className="flex-1 text-xs bg-white/[0.05] border border-white/[0.08] rounded-xl px-3.5 py-2 text-white placeholder:text-zinc-500 focus:outline-hidden focus:border-cyan-500"
              />
              <button
                type="submit"
                disabled={isChatLoading || !chatInput.trim()}
                aria-label="Send message"
                className="w-8 h-8 rounded-xl bg-cyan-400 hover:bg-cyan-300 disabled:bg-zinc-700 text-black flex items-center justify-center transition-colors shrink-0 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5 stroke-[2.5]" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};
