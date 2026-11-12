import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Sparkles,
  CornerDownLeft,
  ArrowRight,
  Search,
  Plus,
  Download,
  FileText,
  Filter,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import {
  ActionItem,
  FilterTab,
  NaturalCommandResult,
  SortOption,
  UrgencyLevel,
} from '../types/action';
import { actionApi } from '../utils/api';
import { validateAndSanitizeActionItem } from '../utils/storage';

interface CommandPaletteModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: ActionItem[];
  onSelectItem: (item: ActionItem) => void;
  onItemCreated: (item: ActionItem) => void;
  onApplyFilter: (filter: {
    tab?: FilterTab;
    category?: string;
    urgency?: UrgencyLevel | 'all';
    searchQuery?: string;
    sortBy?: SortOption;
  }) => void;
  onOpenNewModal: () => void;
  onExportJson: () => void;
  onExportMarkdown: () => void;
  onResetDemo: () => void;
}

interface PaletteEntry {
  id: string;
  group: 'ai_command' | 'workspace' | 'quick_action' | 'prompt';
  title: string;
  subtitle?: string;
  meta?: string;
  onTrigger: () => void;
}

const NATURAL_LANGUAGE_EXAMPLES = [
  'Create a high-priority product launch checklist due Friday',
  'Summarize my blocked actions and biggest bottlenecks',
  'What can I complete in under 30 minutes today?',
  'Show all urgent obligations due soon',
];

function fuzzyMatch(text: string, query: string): boolean {
  const t = text.toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return true;
  if (t.includes(q)) return true;

  // Token match
  const tokens = q.split(/\s+/);
  return tokens.every((tok) => t.includes(tok));
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  isOpen,
  onClose,
  items,
  onSelectItem,
  onItemCreated,
  onApplyFilter,
  onOpenNewModal,
  onExportJson,
  onExportMarkdown,
  onResetDemo,
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [aiResult, setAiResult] = useState<NaturalCommandResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setAiResult(null);
      setErrorMsg(null);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [isOpen]);

  const handleRunNaturalCommand = async (commandText: string) => {
    const cleaned = commandText.trim();
    if (!cleaned || isLoading) return;

    setQuery(cleaned);
    setIsLoading(true);
    setErrorMsg(null);
    setAiResult(null);

    try {
      const result = await actionApi.executeNaturalCommand({
        command: cleaned,
        items,
      });

      setAiResult(result);

      if (result.intent === 'create_action' && result.createdItem) {
        const sanitized = validateAndSanitizeActionItem(result.createdItem);
        if (sanitized) {
          onItemCreated(sanitized);
          onClose();
          return;
        }
      }

      if (result.intent === 'filter_view' && result.filterToApply) {
        onApplyFilter(result.filterToApply);
      }

      if (result.intent === 'export_data') {
        if (result.exportFormat === 'json') {
          onExportJson();
        } else {
          onExportMarkdown();
        }
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Unable to execute AI command. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Build unified keyboard-navigable entries
  const entries = useMemo<PaletteEntry[]>(() => {
    const list: PaletteEntry[] = [];
    const trimmed = query.trim();

    if (trimmed.length > 0) {
      list.push({
        id: 'run-ai-nl',
        group: 'ai_command',
        title: `Run AI Command: "${trimmed}"`,
        subtitle: 'Create actions, filter views, or reason across workspaces',
        meta: 'Enter ↵',
        onTrigger: () => handleRunNaturalCommand(trimmed),
      });
    }

    // Matching Workspaces (fuzzy across title, category, tags, status, urgency)
    const matchedWorkspaces = items.filter((item) => {
      if (!trimmed) return true;
      const haystack = [
        item.title,
        item.shortSummary,
        item.category,
        item.status,
        item.urgency,
        ...(item.tags || []),
      ].join(' ');
      return fuzzyMatch(haystack, trimmed);
    });

    matchedWorkspaces.slice(0, 5).forEach((item) => {
      list.push({
        id: `ws-${item.id}`,
        group: 'workspace',
        title: item.title,
        subtitle: `${item.category} · ${item.urgency.toUpperCase()} · ${item.status.toUpperCase()}${
          item.tags?.length ? ` · #${item.tags.slice(0, 2).join(' #')}` : ''
        }`,
        meta: item.deadline || 'Open →',
        onTrigger: () => {
          onSelectItem(item);
          onClose();
        },
      });
    });

    // Quick Actions
    const quickActions: PaletteEntry[] = [
      {
        id: 'qa-new',
        group: 'quick_action',
        title: 'Ingest New Obligation or Decompose Goal',
        subtitle: 'Open multimodal ingestion & AI Goal Decomposer modal',
        meta: 'Action',
        onTrigger: () => {
          onClose();
          onOpenNewModal();
        },
      },
      {
        id: 'qa-filter-blocked',
        group: 'quick_action',
        title: 'Filter: View Blocked Obligations',
        subtitle: 'Focus on pipelines with blocked milestones',
        meta: 'Filter',
        onTrigger: () => {
          onApplyFilter({ tab: 'blocked' });
          onClose();
        },
      },
      {
        id: 'qa-export-md',
        group: 'quick_action',
        title: 'Export Workspaces to Markdown (.md)',
        subtitle: 'Download readable executive checklist report',
        meta: 'Export',
        onTrigger: () => {
          onExportMarkdown();
          onClose();
        },
      },
      {
        id: 'qa-export-json',
        group: 'quick_action',
        title: 'Export Workspaces to JSON (.json)',
        subtitle: 'Full portable backup of all tasks, sub-steps, and logs',
        meta: 'Backup',
        onTrigger: () => {
          onExportJson();
          onClose();
        },
      },
      {
        id: 'qa-reset',
        group: 'quick_action',
        title: 'Reset to Sample Demo Obligations',
        subtitle: 'Restore default onboarding workspaces',
        meta: 'Reset',
        onTrigger: () => {
          onResetDemo();
          onClose();
        },
      },
    ];

    quickActions.forEach((qa) => {
      if (!trimmed || fuzzyMatch(`${qa.title} ${qa.subtitle}`, trimmed)) {
        list.push(qa);
      }
    });

    // Natural Language AI Prompts
    NATURAL_LANGUAGE_EXAMPLES.forEach((prompt, idx) => {
      if (!trimmed || fuzzyMatch(prompt, trimmed)) {
        list.push({
          id: `nl-prompt-${idx}`,
          group: 'prompt',
          title: prompt,
          subtitle: 'Natural-language AI instruction',
          meta: 'AI Prompt',
          onTrigger: () => handleRunNaturalCommand(prompt),
        });
      }
    });

    return list;
  }, [query, items]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keyboard navigation & focus trapping inside modal
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (entries.length > 0) {
        setSelectedIndex((prev) => (prev + 1) % entries.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (entries.length > 0) {
        setSelectedIndex((prev) => (prev - 1 + entries.length) % entries.length);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = entries[selectedIndex];
      if (target) {
        target.onTrigger();
      } else if (query.trim()) {
        handleRunNaturalCommand(query);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Tab' && modalRef.current) {
      const focusable = modalRef.current.querySelectorAll<HTMLElement>(
        'input, button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md flex items-start justify-center pt-16 sm:pt-24 px-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="command-palette-title"
      onKeyDown={handleKeyDown}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={modalRef}
        className="bg-[#11131C] border border-white/[0.12] rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden animate-card-enter"
      >
        <h2 id="command-palette-title" className="sr-only">
          ActionOS Command Palette and Natural Language Bar
        </h2>

        {/* Search & Natural Language Input Bar */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/[0.08] bg-black/30">
          <Search className="w-4 h-4 text-cyan-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Search obligations, tags, or type an AI command (e.g. "Create launch checklist due Friday")...'
            aria-label="Search or type natural language command"
            className="flex-1 bg-transparent text-sm text-white placeholder:text-zinc-500 focus:outline-hidden font-medium"
          />
          {isLoading ? (
            <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 shrink-0">
              <div className="w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              <span className="hidden sm:inline">Executing...</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => handleRunNaturalCommand(query)}
              disabled={!query.trim()}
              title="Run natural language command"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono text-cyan-300 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 disabled:opacity-30 transition-colors cursor-pointer"
            >
              <span>Run AI</span>
              <CornerDownLeft className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close command palette"
            className="text-zinc-500 hover:text-zinc-200 p-1 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 max-h-[65vh] overflow-y-auto space-y-4">
          {/* Error Banner */}
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-200 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">{errorMsg}</div>
            </div>
          )}

          {/* AI Result Display */}
          {aiResult && (
            <div className="p-4 rounded-xl bg-cyan-950/25 border border-cyan-500/30 text-xs leading-relaxed text-zinc-100 space-y-2">
              <div className="flex items-center justify-between pb-2 border-b border-cyan-500/20 text-cyan-300 font-mono text-[11px]">
                <span className="font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Intent: {aiResult.intent.replace('_', ' ')}</span>
                </span>
                <span className="text-zinc-400">Grounded in {items.length} workspaces</span>
              </div>
              <p className="whitespace-pre-wrap text-zinc-100 leading-relaxed">
                {aiResult.message}
              </p>
            </div>
          )}

          {/* Unified Navigable Entries */}
          {entries.length === 0 ? (
            <div className="py-8 text-center text-xs text-zinc-500 font-mono">
              No matching workspaces. Press Enter to run "{query}" with ActionOS AI.
            </div>
          ) : (
            <div className="space-y-1" role="listbox" aria-label="Command palette suggestions">
              {entries.map((entry, idx) => {
                const isSelected = idx === selectedIndex;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={entry.onTrigger}
                    className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-500/15 border border-cyan-500/40 text-white'
                        : 'bg-transparent border border-transparent text-zinc-300 hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                          entry.group === 'ai_command' || entry.group === 'prompt'
                            ? 'bg-cyan-500/15 text-cyan-400'
                            : entry.group === 'workspace'
                            ? 'bg-white/[0.06] text-zinc-200'
                            : 'bg-indigo-500/15 text-indigo-300'
                        }`}
                      >
                        {entry.group === 'ai_command' || entry.group === 'prompt' ? (
                          <Sparkles className="w-3.5 h-3.5" />
                        ) : entry.group === 'workspace' ? (
                          <FileText className="w-3.5 h-3.5" />
                        ) : entry.id.includes('export') ? (
                          <Download className="w-3.5 h-3.5" />
                        ) : entry.id.includes('filter') ? (
                          <Filter className="w-3.5 h-3.5" />
                        ) : entry.id.includes('reset') ? (
                          <RotateCcw className="w-3.5 h-3.5" />
                        ) : (
                          <Plus className="w-3.5 h-3.5" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-semibold truncate text-white">
                          {entry.title}
                        </div>
                        {entry.subtitle && (
                          <div className="text-[11px] text-zinc-400 truncate mt-0.5 font-mono">
                            {entry.subtitle}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {entry.meta && (
                        <span className="text-[11px] font-mono text-zinc-400 tabular-nums">
                          {entry.meta}
                        </span>
                      )}
                      <ArrowRight
                        className={`w-3.5 h-3.5 transition-transform ${
                          isSelected ? 'text-cyan-400 translate-x-0.5' : 'text-zinc-600'
                        }`}
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-white/[0.06] bg-black/40 flex flex-wrap items-center justify-between gap-2 text-[11px] text-zinc-500 font-mono">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-300">↑↓</kbd> Navigate
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-300">↵</kbd> Execute
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-white/[0.06] text-zinc-300">ESC</kbd> Close
            </span>
          </div>
          <span>Natural-Language Command Router</span>
        </div>
      </div>
    </div>
  );
};
