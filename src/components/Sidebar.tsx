import React from 'react';
import {
  CheckCircle2,
  Clock,
  ListTodo,
  Plus,
  RotateCcw,
  Sparkles,
  Layers,
  AlertOctagon,
  Download,
  Upload,
  X,
} from 'lucide-react';
import { FilterTab, GlobalMetrics } from '../types/action';

interface SidebarProps {
  currentFilter: FilterTab;
  onFilterChange: (filter: FilterTab) => void;
  onNewAction: () => void;
  onResetDemo: () => void;
  onOpenCommandPalette: () => void;
  onExportJson: () => void;
  onExportMarkdown: () => void;
  onImportJson: () => void;
  metrics: GlobalMetrics;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentFilter,
  onFilterChange,
  onNewAction,
  onResetDemo,
  onOpenCommandPalette,
  onExportJson,
  onExportMarkdown,
  onImportJson,
  metrics,
  isOpenMobile = false,
  onCloseMobile,
}) => {
  const navItems: {
    id: FilterTab;
    label: string;
    icon: React.FC<{ className?: string }>;
    count: number;
    highlight?: boolean;
  }[] = [
    {
      id: 'all',
      label: 'All Workspaces',
      icon: Layers,
      count: metrics.totalItems,
    },
    {
      id: 'active',
      label: 'In Execution',
      icon: ListTodo,
      count: metrics.activeItems,
    },
    {
      id: 'due-soon',
      label: 'Due Soon',
      icon: Clock,
      count: metrics.dueSoonItems,
      highlight: metrics.dueSoonItems > 0,
    },
    {
      id: 'blocked',
      label: 'Blocked',
      icon: AlertOctagon,
      count: metrics.blockedItems,
      highlight: metrics.blockedItems > 0,
    },
    {
      id: 'completed',
      label: 'Completed',
      icon: CheckCircle2,
      count: metrics.completedItems,
    },
  ];

  const sidebarContent = (
    <div className="flex flex-col justify-between h-full">
      <div className="space-y-5">
        {/* Mobile Header inside Drawer */}
        <div className="flex items-center justify-between lg:hidden pb-3 border-b border-white/[0.08]">
          <span className="font-bold text-sm text-white">ActionOS Navigation</span>
          {onCloseMobile && (
            <button
              type="button"
              onClick={onCloseMobile}
              aria-label="Close navigation drawer"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Primary Action */}
        <div className="space-y-2">
          <button
            type="button"
            onClick={onNewAction}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-bold text-black bg-cyan-400 hover:bg-cyan-300 active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Ingest / Decompose</span>
          </button>

          <button
            type="button"
            onClick={onOpenCommandPalette}
            className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-zinc-300 hover:text-white bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] transition-all cursor-pointer"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
              <span>AI Command Bar</span>
            </div>
            <kbd className="text-[10px] font-mono text-zinc-400 bg-black/40 px-1.5 py-0.5 rounded border border-white/[0.1]">
              ⌘K
            </kbd>
          </button>
        </div>

        {/* Views Navigation */}
        <nav className="space-y-1" aria-label="Workspace Views">
          <div className="px-2 pb-1 text-[11px] font-mono text-zinc-500 font-semibold">
            Queues
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentFilter === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onFilterChange(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-white/[0.09] text-white border border-white/[0.12]'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04] border border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon
                    className={`w-4 h-4 ${
                      isActive
                        ? 'text-cyan-400'
                        : item.highlight
                        ? 'text-amber-400'
                        : 'text-zinc-500'
                    }`}
                  />
                  <span>{item.label}</span>
                </div>
                <span
                  className={`text-[11px] font-mono tabular-nums ${
                    item.highlight && !isActive
                      ? 'text-amber-400 font-bold'
                      : isActive
                      ? 'text-cyan-300 font-bold'
                      : 'text-zinc-500'
                  }`}
                >
                  {item.count}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Portability & Data Section */}
        <div className="space-y-1 pt-3 border-t border-white/[0.06]">
          <div className="px-2 pb-1 text-[11px] font-mono text-zinc-500 font-semibold">
            Portability & Sync
          </div>
          <button
            type="button"
            onClick={onExportMarkdown}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/[0.04] transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
            <span>Export Markdown (.md)</span>
          </button>
          <button
            type="button"
            onClick={onExportJson}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/[0.04] transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-zinc-400" />
            <span>Backup JSON (.json)</span>
          </button>
          <button
            type="button"
            onClick={onImportJson}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-white hover:bg-white/[0.04] transition-colors cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-zinc-400" />
            <span>Import Backup</span>
          </button>
        </div>
      </div>

      {/* Bottom: Velocity & Reset */}
      <div className="space-y-3 pt-4 border-t border-white/[0.06]">
        <div className="px-2.5 py-2 rounded-xl bg-white/[0.02] border border-white/[0.06] text-[11px] font-mono space-y-1">
          <div className="flex items-center justify-between text-zinc-400">
            <span>Remaining Effort</span>
            <span className="text-white font-semibold tabular-nums">
              {Math.round((metrics.estimatedRemainingMinutes / 60) * 10) / 10}h
            </span>
          </div>
          <div className="flex items-center justify-between text-zinc-400">
            <span>Sub-Steps Done</span>
            <span className="text-cyan-400 font-semibold tabular-nums">
              {metrics.completedSubSteps}/{metrics.totalSubSteps}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={onResetDemo}
          className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-zinc-400 hover:text-white bg-white/[0.02] hover:bg-white/[0.05] rounded-xl border border-white/[0.06] transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Reset Demo Data</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sticky Sidebar */}
      <aside className="hidden lg:block w-60 shrink-0">
        <div className="sticky top-22 h-[calc(100vh-7rem)] bg-[#0E1018] border border-white/[0.08] rounded-2xl p-4">
          {sidebarContent}
        </div>
      </aside>

      {/* Mobile & Tablet Drawer */}
      {isOpenMobile && (
        <div
          className="fixed inset-0 z-50 lg:hidden bg-black/75 backdrop-blur-xs flex"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation drawer"
          onClick={(e) => {
            if (e.target === e.currentTarget && onCloseMobile) onCloseMobile();
          }}
        >
          <div className="w-72 max-w-[85vw] bg-[#0E1018] border-r border-white/[0.1] h-full p-5 overflow-y-auto animate-card-enter">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
