import React from 'react';
import {
  Search,
  CheckCircle2,
  Clock,
  ListTodo,
  ArrowRight,
  Zap,
  Check,
  AlertOctagon,
  SlidersHorizontal,
} from 'lucide-react';
import {
  ActionItem,
  FilterTab,
  GlobalMetrics,
  SortOption,
  UrgencyLevel,
} from '../types/action';

interface DashboardOverviewProps {
  metrics: GlobalMetrics;
  currentFilter: FilterTab;
  onFilterChange: (filter: FilterTab) => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
  selectedUrgency: UrgencyLevel | 'all';
  onUrgencyChange: (urgency: UrgencyLevel | 'all') => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
  categories: string[];
  heroItem?: ActionItem | null;
  onSelectHeroItem?: (item: ActionItem) => void;
  onExecuteHeroTask?: (itemId: string, taskId?: string) => void;
}

export const DashboardOverview: React.FC<DashboardOverviewProps> = ({
  metrics,
  currentFilter,
  onFilterChange,
  searchQuery,
  onSearchChange,
  selectedCategory,
  onCategoryChange,
  selectedUrgency,
  onUrgencyChange,
  sortBy,
  onSortChange,
  categories,
  heroItem,
  onSelectHeroItem,
  onExecuteHeroTask,
}) => {
  const heroIncompleteTask = heroItem?.tasks.find((t) => !t.completed);
  const remainingHours = Math.round((metrics.estimatedRemainingMinutes / 60) * 10) / 10;

  return (
    <div className="space-y-6 animate-card-enter">
      {/* 1. Command Center Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-3 border-b border-white/[0.08]">
        <div>
          <p className="font-mono text-xs text-cyan-400 font-semibold mb-1">
            Executive Action Workspace
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
            {metrics.activeItems > 0
              ? `${metrics.activeItems} ${
                  metrics.activeItems === 1 ? 'obligation' : 'obligations'
                } in active execution`
              : 'All obligations resolved'}
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Structured deadlines, prerequisites, and time-estimated milestones.
          </p>
        </div>

        {/* Global Completion Velocity Meter */}
        <div className="bg-[#11131C] border border-white/[0.08] rounded-xl px-4 py-2.5 flex items-center gap-4 shrink-0">
          <div className="flex flex-col">
            <span className="text-[11px] font-mono text-zinc-400">
              Completion Velocity
            </span>
            <span className="font-mono tabular-nums text-sm font-bold text-white">
              {metrics.overallProgressPercentage}%{' '}
              <span className="text-xs text-zinc-500 font-normal">
                · {metrics.totalTasksCompleted}/{metrics.totalTasks} tasks · ~{remainingHours}h left
              </span>
            </span>
          </div>
          <div className="w-20 bg-zinc-800 h-2 rounded-full overflow-hidden">
            <div
              className="bg-cyan-400 h-full rounded-full transition-all duration-500"
              style={{ width: `${metrics.overallProgressPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* 2. SIGNATURE FEATURE: "YOUR NEXT MOVE" AI DECISION PANEL */}
      {heroItem && heroItem.suggestedNextAction && (
        <section className="rounded-2xl p-6 bg-[#111420] border border-cyan-500/30 transition-all">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
            <div className="flex items-center gap-2 text-xs text-zinc-300 flex-wrap">
              <span className="font-mono font-bold text-cyan-400">
                Highest Leverage Next Move
              </span>
              <span aria-hidden="true" className="text-zinc-600">
                ·
              </span>
              <span>
                Workspace: <strong className="text-white">{heroItem.title}</strong>
              </span>
              {heroItem.suggestedNextAction.estimatedMinutes && (
                <>
                  <span aria-hidden="true" className="text-zinc-600">
                    ·
                  </span>
                  <span className="font-mono text-zinc-400 tabular-nums">
                    Est. {heroItem.suggestedNextAction.estimatedMinutes} mins
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-3 text-xs font-mono text-zinc-400">
              <span className="tabular-nums">
                Due: <strong className="text-white">{heroItem.deadline || 'Flexible'}</strong>
              </span>
              <button
                type="button"
                onClick={() => onSelectHeroItem?.(heroItem)}
                className="text-cyan-400 hover:text-cyan-300 text-xs font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
              >
                <span>Open Workspace</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-4">
            <div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-white leading-snug">
                {heroItem.suggestedNextAction.title}
              </h2>
              <p className="text-xs sm:text-sm text-zinc-300 mt-1 max-w-3xl leading-relaxed">
                {heroItem.suggestedNextAction.reason}
              </p>
            </div>

            {/* Segmented Task Progress Bar */}
            <div>
              <div className="flex items-center justify-between text-[11px] font-mono text-zinc-400 mb-1.5">
                <span>Milestone Sequence</span>
                <span className="text-cyan-300 font-semibold tabular-nums">
                  {heroItem.tasks.filter((t) => t.completed).length} of {heroItem.tasks.length} completed
                </span>
              </div>
              <div
                className="grid gap-1.5 h-1.5"
                style={{
                  gridTemplateColumns: `repeat(${Math.max(1, heroItem.tasks.length)}, minmax(0, 1fr))`,
                }}
              >
                {heroItem.tasks.map((task, idx) => (
                  <div
                    key={task.id || idx}
                    className={`rounded-xs transition-all ${
                      task.completed ? 'bg-cyan-400' : 'bg-zinc-800'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="pt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="text-xs text-zinc-400 max-w-xl">
                <span className="text-cyan-400 font-semibold">Immediate Follow-Up: </span>
                <span>{heroItem.suggestedNextAction.followUp}</span>
              </div>

              {heroIncompleteTask && (
                <button
                  type="button"
                  onClick={() => onExecuteHeroTask?.(heroItem.id, heroIncompleteTask.id)}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold text-black bg-cyan-400 hover:bg-cyan-300 active:scale-[0.98] transition-all shrink-0 cursor-pointer whitespace-nowrap"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>Complete Milestone →</span>
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* 3. 4-Column Executive KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <button
          type="button"
          onClick={() => onFilterChange('active')}
          className={`text-left rounded-xl p-4 transition-all cursor-pointer border ${
            currentFilter === 'active'
              ? 'bg-[#151824] border-cyan-500/50'
              : 'bg-[#10121A] border-white/[0.07] hover:border-white/[0.15]'
          }`}
        >
          <div className="flex items-center justify-between text-zinc-400 mb-1.5">
            <span className="text-xs font-medium text-zinc-400">Active Workspaces</span>
            <ListTodo className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="flex items-baseline gap-2 font-mono tabular-nums">
            <span className="text-2xl font-extrabold text-white">{metrics.activeItems}</span>
            <span className="text-xs text-zinc-500">/ {metrics.totalItems} total</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onFilterChange('due-soon')}
          className={`text-left rounded-xl p-4 transition-all cursor-pointer border ${
            currentFilter === 'due-soon'
              ? 'bg-[#151824] border-amber-500/50'
              : 'bg-[#10121A] border-white/[0.07] hover:border-amber-500/30'
          }`}
        >
          <div className="flex items-center justify-between text-amber-400 mb-1.5">
            <span className="text-xs font-medium text-zinc-400">High / Urgent Priority</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-2 font-mono tabular-nums">
            <span className="text-2xl font-extrabold text-amber-300">
              {metrics.dueSoonItems}
            </span>
            <span className="text-xs text-zinc-500">impending</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onFilterChange('blocked')}
          className={`text-left rounded-xl p-4 transition-all cursor-pointer border ${
            currentFilter === 'blocked'
              ? 'bg-[#151824] border-rose-500/50'
              : 'bg-[#10121A] border-white/[0.07] hover:border-rose-500/30'
          }`}
        >
          <div className="flex items-center justify-between text-rose-400 mb-1.5">
            <span className="text-xs font-medium text-zinc-400">Blocked Pipelines</span>
            <AlertOctagon className="w-4 h-4 text-rose-400" />
          </div>
          <div className="flex items-baseline gap-2 font-mono tabular-nums">
            <span className="text-2xl font-extrabold text-rose-300">
              {metrics.blockedItems}
            </span>
            <span className="text-xs text-zinc-500">need unblocking</span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onFilterChange('completed')}
          className={`text-left rounded-xl p-4 transition-all cursor-pointer border ${
            currentFilter === 'completed'
              ? 'bg-[#151824] border-emerald-500/50'
              : 'bg-[#10121A] border-white/[0.07] hover:border-emerald-500/30'
          }`}
        >
          <div className="flex items-center justify-between text-emerald-400 mb-1.5">
            <span className="text-xs font-medium text-zinc-400">Task Throughput</span>
            <Zap className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="flex items-baseline gap-2 font-mono tabular-nums">
            <span className="text-2xl font-extrabold text-emerald-300">
              {metrics.totalTasksCompleted}
            </span>
            <span className="text-xs text-zinc-500">
              / {metrics.totalTasks} tasks ({metrics.completedItems} done)
            </span>
          </div>
        </button>
      </div>

      {/* 4. Interactive Filter, Search & Sort Control Bar */}
      <div className="bg-[#10121A] border border-white/[0.08] rounded-xl p-3 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        {/* Segmented Filter Tabs */}
        <div className="flex items-center gap-1 p-1 bg-black/40 rounded-lg overflow-x-auto shrink-0 border border-white/[0.05]">
          {(
            [
              { key: 'all', label: 'All', count: metrics.totalItems },
              { key: 'active', label: 'In Progress', count: metrics.activeItems },
              { key: 'due-soon', label: 'Due Soon', count: metrics.dueSoonItems },
              { key: 'blocked', label: 'Blocked', count: metrics.blockedItems },
              { key: 'completed', label: 'Completed', count: metrics.completedItems },
            ] as const
          ).map((tab) => {
            const isActive = currentFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onFilterChange(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-white/[0.12] text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <span>{tab.label}</span>
                <span className="text-[11px] font-mono tabular-nums text-zinc-400">
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Category, Urgency, Sort & Search Controls */}
        <div className="flex flex-wrap items-center gap-2 flex-1 xl:justify-end">
          <select
            value={selectedCategory}
            onChange={(e) => onCategoryChange(e.target.value)}
            aria-label="Filter by category"
            className="text-xs font-medium text-zinc-300 bg-black/40 border border-white/[0.08] rounded-lg px-2.5 py-2 focus:outline-hidden focus:border-cyan-500 transition-colors"
          >
            <option value="all">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <select
            value={selectedUrgency}
            onChange={(e) => onUrgencyChange(e.target.value as UrgencyLevel | 'all')}
            aria-label="Filter by priority"
            className="text-xs font-medium text-zinc-300 bg-black/40 border border-white/[0.08] rounded-lg px-2.5 py-2 focus:outline-hidden focus:border-cyan-500 transition-colors"
          >
            <option value="all">All Priorities</option>
            <option value="urgent">Urgent Only</option>
            <option value="high">High Priority</option>
            <option value="medium">Medium Priority</option>
            <option value="low">Low Priority</option>
          </select>

          <div className="flex items-center gap-1.5 bg-black/40 border border-white/[0.08] rounded-lg px-2.5 py-1.5">
            <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            <select
              value={sortBy}
              onChange={(e) => onSortChange(e.target.value as SortOption)}
              aria-label="Sort obligations"
              className="text-xs font-medium text-zinc-300 bg-transparent focus:outline-hidden"
            >
              <option value="urgency">Sort: Priority</option>
              <option value="deadline">Sort: Deadline</option>
              <option value="progress">Sort: Progress %</option>
              <option value="updated">Sort: Recently Updated</option>
              <option value="title">Sort: Title (A–Z)</option>
            </select>
          </div>

          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search titles, tags, tasks..."
              aria-label="Search workspaces"
              className="w-full text-xs bg-black/40 border border-white/[0.08] rounded-lg pl-8 pr-3 py-2 text-white placeholder:text-zinc-500 focus:outline-hidden focus:border-cyan-500 transition-colors"
            />
          </div>
        </div>
      </div>
    </div>
  );
};
