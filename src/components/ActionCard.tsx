import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Trash2,
  Circle,
  Clock,
} from 'lucide-react';
import { ActionItem, UrgencyLevel } from '../types/action';
import { calculateItemProgress } from '../utils/storage';

interface ActionCardProps {
  item: ActionItem;
  onSelect: (item: ActionItem) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onQuickTaskToggle?: (itemId: string, taskId: string, e: React.MouseEvent) => void;
  onQuickUrgencyChange?: (
    itemId: string,
    newUrgency: UrgencyLevel,
    e: React.MouseEvent
  ) => void;
}

const URGENCY_CYCLE: Record<UrgencyLevel, UrgencyLevel> = {
  low: 'medium',
  medium: 'high',
  high: 'urgent',
  urgent: 'low',
};

export const ActionCard: React.FC<ActionCardProps> = ({
  item,
  onSelect,
  onDelete,
  onQuickTaskToggle,
  onQuickUrgencyChange,
}) => {
  const { completed, total, percentage, remainingMinutes } = calculateItemProgress(item);
  const isAllDone = item.status === 'completed' || (total > 0 && completed === total);
  const isBlocked =
    !isAllDone &&
    (item.status === 'blocked' ||
      item.tasks.some((t) => !t.completed && t.status === 'blocked'));

  const nextTask = item.tasks.find((t) => !t.completed);

  const urgencyLabel = {
    urgent: 'Urgent',
    high: 'High',
    medium: 'Medium',
    low: 'Low',
  }[item.urgency];

  return (
    <article
      onClick={() => onSelect(item)}
      className="group bg-[#11131C] hover:bg-[#151824] border border-white/[0.08] hover:border-cyan-500/40 rounded-2xl p-5 transition-all cursor-pointer flex flex-col justify-between"
    >
      <div>
        {/* Unboxed Metadata Row with Typographic Separators + Quick Inline Priority Cycle */}
        <div className="flex items-center justify-between gap-2 mb-2 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap text-zinc-400 font-mono text-[11px]">
            <span className="text-cyan-400 font-semibold">{item.category}</span>
            <span aria-hidden="true" className="text-zinc-600">
              ·
            </span>
            <span className={item.deadlineIsAmbiguous ? 'text-amber-400' : 'text-zinc-300'}>
              {item.deadline || 'Flexible date'}
            </span>
            <span aria-hidden="true" className="text-zinc-600">
              ·
            </span>
            <button
              type="button"
              onClick={(e) =>
                onQuickUrgencyChange?.(item.id, URGENCY_CYCLE[item.urgency], e)
              }
              title="Click to cycle priority level"
              className={`hover:underline cursor-pointer ${
                item.urgency === 'urgent'
                  ? 'text-rose-400 font-bold'
                  : item.urgency === 'high'
                  ? 'text-amber-400 font-semibold'
                  : 'text-zinc-400'
              }`}
            >
              {urgencyLabel} Priority
            </button>
            {isBlocked && (
              <>
                <span aria-hidden="true" className="text-zinc-600">
                  ·
                </span>
                <span className="text-rose-400 font-semibold">Blocked</span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={(e) => onDelete(item.id, e)}
            aria-label={`Delete ${item.title}`}
            className="text-zinc-500 hover:text-rose-400 p-1 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-pointer"
            title="Remove workspace"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Title */}
        <h3 className="text-base font-bold text-white group-hover:text-cyan-300 transition-colors line-clamp-1 mb-1 tracking-tight">
          {item.title}
        </h3>

        {/* Summary */}
        <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed mb-3">
          {item.shortSummary}
        </p>

        {/* Unboxed Tags */}
        {item.tags && item.tags.length > 0 && (
          <div className="flex items-center gap-1.5 flex-wrap text-[11px] font-mono text-zinc-500 mb-3">
            {item.tags.slice(0, 4).map((tag, idx) => (
              <React.Fragment key={tag}>
                {idx > 0 && <span aria-hidden="true">·</span>}
                <span>#{tag}</span>
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Ambiguity Notice */}
        {item.deadlineIsAmbiguous && (
          <div className="flex items-center gap-2 text-[11px] text-amber-300 mb-3 font-mono">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="truncate">Ambiguous date: {item.deadline}</span>
          </div>
        )}

        {/* Quick Inline Task Execution Box */}
        {nextTask && !isAllDone ? (
          <div className="pt-3 border-t border-white/[0.06] mb-3">
            <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500 mb-1">
              <span className="text-cyan-400 font-semibold">Next Milestone</span>
              {nextTask.estimatedEffort && (
                <span className="tabular-nums">{nextTask.estimatedEffort}</span>
              )}
            </div>
            <div className="flex items-start gap-2.5">
              <button
                type="button"
                onClick={(e) => onQuickTaskToggle?.(item.id, nextTask.id, e)}
                title="Complete milestone inline"
                className="mt-0.5 text-zinc-500 hover:text-cyan-400 transition-colors shrink-0 cursor-pointer"
              >
                <Circle className="w-4 h-4" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-zinc-200 line-clamp-1">
                  {nextTask.title}
                </p>
                {item.suggestedNextAction?.reason && (
                  <p className="text-[11px] text-zinc-500 line-clamp-1 mt-0.5">
                    {item.suggestedNextAction.reason}
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : isAllDone ? (
          <div className="pt-3 border-t border-white/[0.06] mb-3 flex items-center gap-2 text-xs text-emerald-400 font-mono font-semibold">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>All Milestones Completed</span>
          </div>
        ) : null}
      </div>

      {/* Progress & Card Footer */}
      <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between text-xs font-mono">
        <div className="flex items-center gap-2">
          <div className="w-14 bg-zinc-800 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-cyan-400 h-full rounded-full transition-all duration-500"
              style={{ width: `${percentage}%` }}
            />
          </div>
          <span className="tabular-nums text-zinc-200 font-semibold">{percentage}%</span>
          <span aria-hidden="true" className="text-zinc-600">
            ·
          </span>
          <span className="tabular-nums text-zinc-500 text-[11px]">
            {completed}/{total}
          </span>
          {remainingMinutes > 0 && (
            <>
              <span aria-hidden="true" className="text-zinc-600">
                ·
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500 tabular-nums">
                <Clock className="w-3 h-3" />
                {remainingMinutes}m
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 text-cyan-400 group-hover:text-cyan-300 font-semibold text-xs transition-colors font-sans">
          <span>Open</span>
          <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </div>
      </div>
    </article>
  );
};
