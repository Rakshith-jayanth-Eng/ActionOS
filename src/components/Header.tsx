import React from 'react';
import { Plus, Search, Command, Menu, ChevronRight } from 'lucide-react';

interface HeaderProps {
  onNewAction: () => void;
  onResetDemo: () => void;
  onOpenCommandPalette?: () => void;
  onToggleMobileSidebar?: () => void;
  onExportMarkdown?: () => void;
  activeItemCount: number;
  hasSelectedItem?: boolean;
  selectedItemTitle?: string;
  onBackToOverview?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onNewAction,
  onOpenCommandPalette,
  onToggleMobileSidebar,
  hasSelectedItem,
  selectedItemTitle,
  onBackToOverview,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-[#090A10]/90 backdrop-blur-xl border-b border-white/[0.08]">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand Wordmark & Contextual Breadcrumb */}
        <div className="flex items-center gap-3 min-w-0 shrink-0">
          {onToggleMobileSidebar && (
            <button
              type="button"
              onClick={onToggleMobileSidebar}
              aria-label="Open navigation menu"
              className="lg:hidden p-2 rounded-xl text-zinc-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          <button
            type="button"
            onClick={onBackToOverview}
            className="text-base font-extrabold tracking-tight text-white whitespace-nowrap shrink-0 cursor-pointer hover:text-cyan-300 transition-colors"
          >
            ActionOS
          </button>

          {hasSelectedItem && selectedItemTitle && (
            <div className="hidden md:flex items-center gap-2 text-xs text-zinc-400 min-w-0">
              <ChevronRight className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
              <span className="truncate max-w-[260px] text-zinc-200 font-medium">
                {selectedItemTitle}
              </span>
            </div>
          )}
        </div>

        {/* Zone 2: Command Palette / Search Trigger */}
        <div className="flex-1 max-w-md hidden sm:block">
          <button
            type="button"
            onClick={onOpenCommandPalette}
            aria-label="Open command palette and natural language bar"
            className="w-full flex items-center justify-between px-3.5 py-2 text-xs bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.08] hover:border-cyan-500/40 rounded-xl text-zinc-400 hover:text-zinc-200 transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-2 truncate">
              <Search className="w-3.5 h-3.5 text-zinc-500 group-hover:text-cyan-400 transition-colors shrink-0" />
              <span className="font-medium truncate">
                Search workspaces or run AI command...
              </span>
            </div>
            <div className="flex items-center gap-1 font-mono text-[10px] text-zinc-400 bg-white/[0.06] px-1.5 py-0.5 rounded border border-white/[0.08] shrink-0">
              <Command className="w-2.5 h-2.5" />
              <span>K</span>
            </div>
          </button>
        </div>

        {/* Zone 3: Primary Action */}
        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onOpenCommandPalette}
            aria-label="Search or run command"
            className="sm:hidden p-2 rounded-xl text-zinc-300 hover:text-white bg-white/[0.04] border border-white/[0.08] cursor-pointer"
          >
            <Search className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onNewAction}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-black bg-cyan-400 hover:bg-cyan-300 active:scale-[0.98] rounded-xl transition-all whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>New Action</span>
          </button>
        </div>
      </div>
    </header>
  );
};
