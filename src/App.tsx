import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { DashboardOverview } from './components/DashboardOverview';
import { ActionCard } from './components/ActionCard';
import { ItemDetailView } from './components/ItemDetailView';
import { NewActionModal } from './components/NewActionModal';
import { CommandPaletteModal } from './components/CommandPaletteModal';
import { ActionItem, FilterTab, SortOption, UrgencyLevel } from './types/action';
import {
  loadActionItems,
  saveActionItems,
  resetToDemoData,
  deleteActionItem,
  addActionItem,
  updateActionItem,
  calculateGlobalMetrics,
  calculateItemProgress,
  toggleTaskCompletion,
  exportItemsToJson,
  exportItemsToMarkdown,
  importItemsFromJson,
  triggerFileDownload,
} from './utils/storage';
import {
  Plus,
  RotateCcw,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Terminal,
  Download,
  Upload,
} from 'lucide-react';

interface ToastState {
  message: string;
  type: 'success' | 'info' | 'error';
  onRetry?: () => void;
}

const URGENCY_RANK: Record<UrgencyLevel, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export default function App() {
  const [items, setItems] = useState<ActionItem[]>(() => loadActionItems());
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Filtering & Sorting State
  const [currentFilter, setCurrentFilter] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedUrgency, setSelectedUrgency] = useState<UrgencyLevel | 'all'>('all');
  const [sortBy, setSortBy] = useState<SortOption>('urgency');

  const [notification, setNotification] = useState<ToastState | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Derived active item guarantees zero desynchronization between list and detail view
  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedItemId) || null,
    [items, selectedItemId]
  );

  const showToast = useCallback(
    (message: string, type: ToastState['type'] = 'success', onRetry?: () => void) => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      setNotification({ message, type, onRetry });
      toastTimerRef.current = setTimeout(() => {
        setNotification(null);
      }, 4500);
    },
    []
  );

  // Global Keyboard Shortcuts (Cmd+K / Ctrl+K, Cmd+N, and Escape)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      } else if (e.key === 'Escape') {
        if (isCommandPaletteOpen) {
          setIsCommandPaletteOpen(false);
        } else if (isModalOpen) {
          setIsModalOpen(false);
        } else if (isMobileSidebarOpen) {
          setIsMobileSidebarOpen(false);
        } else if (selectedItemId) {
          setSelectedItemId(null);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isCommandPaletteOpen, isModalOpen, isMobileSidebarOpen, selectedItemId]);

  /**
   * Optimistic state mutation helper with automatic rollback on failure
   */
  const applyOptimisticMutation = useCallback(
    (
      mutateFn: (current: ActionItem[]) => ActionItem[],
      successMsg?: string
    ) => {
      setItems((prevItems) => {
        const snapshot = prevItems;
        try {
          const next = mutateFn(prevItems);
          saveActionItems(next);
          if (successMsg) showToast(successMsg, 'success');
          return next;
        } catch (err: any) {
          saveActionItems(snapshot);
          showToast(
            err?.message || 'State update failed; rolled back safely.',
            'error',
            () => applyOptimisticMutation(mutateFn, successMsg)
          );
          return snapshot;
        }
      });
    },
    [showToast]
  );

  const handleResetDemo = () => {
    const demoItems = resetToDemoData();
    setItems(demoItems);
    setSelectedItemId(null);
    showToast('Restored demo obligations.');
  };

  const handleDeleteItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const snapshot = items;
    const updated = deleteActionItem(id, items);
    setItems(updated);
    if (selectedItemId === id) {
      setSelectedItemId(null);
    }
    showToast('Workspace removed.', 'info', () => {
      saveActionItems(snapshot);
      setItems(snapshot);
      showToast('Restored removed workspace.', 'success');
    });
  };

  const handleItemCreated = (newItem: ActionItem) => {
    const updated = addActionItem(newItem, items);
    setItems(updated);
    setSelectedItemId(newItem.id);
    showToast(`Created "${newItem.title}" workspace.`);
  };

  const handleItemUpdated = (updatedItem: ActionItem) => {
    const updated = updateActionItem(updatedItem, items);
    setItems(updated);
  };

  const handleQuickTaskToggle = (itemId: string, taskId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const updated = toggleTaskCompletion(itemId, taskId, items);
    if (updated) {
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      showToast('Updated milestone status.');
    }
  };

  const handleQuickUrgencyChange = (
    itemId: string,
    newUrgency: UrgencyLevel,
    e: React.MouseEvent
  ) => {
    e.stopPropagation();
    const target = items.find((i) => i.id === itemId);
    if (!target) return;
    const updatedItem: ActionItem = {
      ...target,
      urgency: newUrgency,
      updatedAt: new Date().toISOString(),
    };
    handleItemUpdated(updatedItem);
    showToast(`Priority set to ${newUrgency}.`);
  };

  // Export & Import Handlers
  const handleExportJson = () => {
    const json = exportItemsToJson(items);
    triggerFileDownload(
      `actionos-backup-${new Date().toISOString().slice(0, 10)}.json`,
      json,
      'application/json'
    );
    showToast('Exported workspaces as JSON.');
  };

  const handleExportMarkdown = () => {
    const md = exportItemsToMarkdown(items);
    triggerFileDownload(
      `actionos-report-${new Date().toISOString().slice(0, 10)}.md`,
      md,
      'text/markdown'
    );
    showToast('Exported executive report as Markdown.');
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const content = ev.target?.result as string;
        const imported = importItemsFromJson(content);
        setItems(imported);
        setSelectedItemId(null);
        showToast(`Imported ${imported.length} workspaces successfully.`);
      } catch (err: any) {
        showToast(err?.message || 'Failed to import JSON file.', 'error');
      } finally {
        if (importInputRef.current) importInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  };

  // Find highest leverage item for the signature "Next Move" panel
  const heroItem = useMemo(() => {
    const incompleteItems = items.filter((item) => {
      const { completed, total } = calculateItemProgress(item);
      return total > 0 && completed < total;
    });

    if (incompleteItems.length === 0) return items[0] || null;

    const sorted = [...incompleteItems].sort(
      (a, b) => URGENCY_RANK[b.urgency] - URGENCY_RANK[a.urgency]
    );
    return sorted[0];
  }, [items]);

  const handleExecuteHeroTask = (itemId: string, taskId?: string) => {
    const targetItem = items.find((i) => i.id === itemId);
    if (!targetItem) return;

    const targetTaskId =
      taskId || targetItem.tasks.find((t) => !t.completed)?.id;
    if (!targetTaskId) return;

    const updated = toggleTaskCompletion(itemId, targetTaskId, items);
    if (updated) {
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      showToast('Completed highest-leverage milestone.');
    }
  };

  // Derive unique categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((item) => {
      if (item.category) set.add(item.category);
    });
    return Array.from(set).sort();
  }, [items]);

  // Global aggregate metrics
  const metrics = useMemo(() => calculateGlobalMetrics(items), [items]);

  // Filtered and Sorted items
  const filteredItems = useMemo(() => {
    const filtered = items.filter((item) => {
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }
      if (selectedUrgency !== 'all' && item.urgency !== selectedUrgency) {
        return false;
      }

      const { completed, total } = calculateItemProgress(item);
      const isDone = item.status === 'completed' || (total > 0 && completed === total);
      const isBlocked =
        !isDone &&
        (item.status === 'blocked' ||
          item.tasks.some((t) => !t.completed && t.status === 'blocked'));

      if (currentFilter === 'active' && isDone) return false;
      if (
        currentFilter === 'due-soon' &&
        (isDone || (item.urgency !== 'urgent' && item.urgency !== 'high'))
      ) {
        return false;
      }
      if (currentFilter === 'blocked' && !isBlocked) return false;
      if (currentFilter === 'completed' && !isDone) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesSummary = item.shortSummary.toLowerCase().includes(q);
        const matchesCategory = item.category.toLowerCase().includes(q);
        const matchesTags = (item.tags || []).some((tag) => tag.toLowerCase().includes(q));
        const matchesTasks = item.tasks.some((t) => t.title.toLowerCase().includes(q));
        const matchesReqs = item.requirements.some((r) =>
          r.name.toLowerCase().includes(q)
        );
        if (
          !matchesTitle &&
          !matchesSummary &&
          !matchesCategory &&
          !matchesTags &&
          !matchesTasks &&
          !matchesReqs
        ) {
          return false;
        }
      }

      return true;
    });

    return filtered.sort((a, b) => {
      if (sortBy === 'urgency') {
        return URGENCY_RANK[b.urgency] - URGENCY_RANK[a.urgency];
      }
      if (sortBy === 'progress') {
        return (
          calculateItemProgress(b).percentage - calculateItemProgress(a).percentage
        );
      }
      if (sortBy === 'updated') {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      }
      if (sortBy === 'title') {
        return a.title.localeCompare(b.title);
      }
      if (sortBy === 'deadline') {
        if (!a.deadline) return 1;
        if (!b.deadline) return -1;
        return a.deadline.localeCompare(b.deadline);
      }
      return 0;
    });
  }, [items, currentFilter, searchQuery, selectedCategory, selectedUrgency, sortBy]);

  return (
    <div className="min-h-screen bg-[#08090E] flex flex-col text-slate-100 selection:bg-cyan-400 selection:text-black font-sans relative overflow-x-hidden">
      {/* Hidden JSON Import Input */}
      <input
        ref={importInputRef}
        type="file"
        accept="application/json"
        onChange={handleImportFile}
        className="hidden"
      />

      {/* Top Navigation Bar */}
      <Header
        onNewAction={() => setIsModalOpen(true)}
        onResetDemo={handleResetDemo}
        onOpenCommandPalette={() => setIsCommandPaletteOpen(true)}
        onToggleMobileSidebar={() => setIsMobileSidebarOpen((prev) => !prev)}
        onExportMarkdown={handleExportMarkdown}
        activeItemCount={metrics.activeItems}
        hasSelectedItem={Boolean(selectedItem)}
        selectedItemTitle={selectedItem?.title}
        onBackToOverview={() => setSelectedItemId(null)}
      />

      {/* Toast Notification with Optional Undo/Retry */}
      {notification && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-5 right-5 z-50 text-xs font-semibold px-4 py-3 rounded-xl shadow-2xl border flex items-center gap-3 animate-card-enter ${
            notification.type === 'error'
              ? 'bg-rose-950/95 text-rose-100 border-rose-500/50'
              : 'bg-[#121520] text-white border-cyan-500/40'
          }`}
        >
          {notification.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0" />
          )}
          <span>{notification.message}</span>
          {notification.onRetry && (
            <button
              type="button"
              onClick={notification.onRetry}
              className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-cyan-300 font-mono text-[11px] transition-colors cursor-pointer"
            >
              Undo / Retry
            </button>
          )}
        </div>
      )}

      {/* Workspace Layout: Sidebar + Main Viewport */}
      <div className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex gap-6 relative z-10">
        <Sidebar
          currentFilter={currentFilter}
          onFilterChange={(tab) => {
            setCurrentFilter(tab);
            setSelectedItemId(null);
            setIsMobileSidebarOpen(false);
          }}
          onNewAction={() => {
            setIsMobileSidebarOpen(false);
            setIsModalOpen(true);
          }}
          onResetDemo={() => {
            setIsMobileSidebarOpen(false);
            handleResetDemo();
          }}
          onOpenCommandPalette={() => {
            setIsMobileSidebarOpen(false);
            setIsCommandPaletteOpen(true);
          }}
          onExportJson={handleExportJson}
          onExportMarkdown={handleExportMarkdown}
          onImportJson={() => importInputRef.current?.click()}
          metrics={metrics}
          isOpenMobile={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />

        <main className="flex-1 min-w-0">
          {selectedItem ? (
            <ItemDetailView
              item={selectedItem}
              onBack={() => setSelectedItemId(null)}
              onItemUpdated={handleItemUpdated}
              onShowToast={showToast}
            />
          ) : (
            <div className="space-y-7 animate-card-enter">
              <DashboardOverview
                metrics={metrics}
                currentFilter={currentFilter}
                onFilterChange={setCurrentFilter}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                selectedCategory={selectedCategory}
                onCategoryChange={setSelectedCategory}
                selectedUrgency={selectedUrgency}
                onUrgencyChange={setSelectedUrgency}
                sortBy={sortBy}
                onSortChange={setSortBy}
                categories={categories}
                heroItem={heroItem}
                onSelectHeroItem={(item) => setSelectedItemId(item.id)}
                onExecuteHeroTask={handleExecuteHeroTask}
              />

              {/* Section Header + Export Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.08] pb-3">
                <div className="flex items-center gap-2 text-xs font-mono">
                  <span className="font-bold text-white text-sm tracking-tight font-sans">
                    Execution Workspaces
                  </span>
                  <span aria-hidden="true" className="text-zinc-700">
                    ·
                  </span>
                  <span className="tabular-nums text-cyan-400 font-semibold">
                    {filteredItems.length} shown
                  </span>
                  {currentFilter !== 'all' && (
                    <>
                      <span aria-hidden="true" className="text-zinc-700">
                        ·
                      </span>
                      <span className="capitalize text-zinc-300">
                        {currentFilter.replace('-', ' ')}
                      </span>
                    </>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportMarkdown}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono text-zinc-300 hover:text-white bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.08] rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Export .MD</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleExportJson}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono text-zinc-300 hover:text-white bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.08] rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Backup .JSON</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => importInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono text-zinc-300 hover:text-white bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.08] rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Upload className="w-3.5 h-3.5 text-zinc-400" />
                    <span>Import</span>
                  </button>
                </div>
              </div>

              {/* Workspaces Grid / Empty State */}
              {filteredItems.length === 0 ? (
                <div className="bg-[#0E101A] border border-white/[0.08] rounded-2xl p-12 text-center max-w-xl mx-auto">
                  <div className="w-11 h-11 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center justify-center mx-auto mb-4">
                    <Terminal className="w-5 h-5" />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2 tracking-tight">
                    No Matching Workspaces Found
                  </h3>
                  <p className="text-xs sm:text-sm text-zinc-400 mb-6 leading-relaxed max-w-md mx-auto">
                    Drop in a screenshot, PDF notice, or high-level goal. ActionOS will automatically decompose milestones and determine your next move.
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold text-black bg-cyan-400 hover:bg-cyan-300 rounded-xl transition-all cursor-pointer whitespace-nowrap"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Create Action Plan</span>
                    </button>

                    {items.length === 0 && (
                      <button
                        type="button"
                        onClick={handleResetDemo}
                        className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-mono font-semibold text-zinc-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl transition-colors cursor-pointer whitespace-nowrap"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Load Sample Workspaces</span>
                      </button>
                    )}

                    {(searchQuery ||
                      selectedCategory !== 'all' ||
                      selectedUrgency !== 'all' ||
                      currentFilter !== 'all') && (
                      <button
                        type="button"
                        onClick={() => {
                          setSearchQuery('');
                          setSelectedCategory('all');
                          setSelectedUrgency('all');
                          setCurrentFilter('all');
                        }}
                        className="px-4 py-2 text-xs font-mono font-semibold text-zinc-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] rounded-xl transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Reset Filters
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
                  {filteredItems.map((item) => (
                    <ActionCard
                      key={item.id}
                      item={item}
                      onSelect={(it) => setSelectedItemId(it.id)}
                      onDelete={handleDeleteItem}
                      onQuickTaskToggle={handleQuickTaskToggle}
                      onQuickUrgencyChange={handleQuickUrgencyChange}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* Ingestion & Goal Decomposer Modal */}
      <NewActionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onItemCreated={handleItemCreated}
      />

      {/* Global Command Palette Modal */}
      <CommandPaletteModal
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        items={items}
        onSelectItem={(item) => setSelectedItemId(item.id)}
        onItemCreated={handleItemCreated}
        onApplyFilter={(filter) => {
          if (filter.tab) setCurrentFilter(filter.tab);
          if (filter.category) setSelectedCategory(filter.category);
          if (filter.urgency) setSelectedUrgency(filter.urgency);
          if (filter.searchQuery !== undefined) setSearchQuery(filter.searchQuery);
          if (filter.sortBy) setSortBy(filter.sortBy);
          setSelectedItemId(null);
        }}
        onOpenNewModal={() => setIsModalOpen(true)}
        onExportJson={handleExportJson}
        onExportMarkdown={handleExportMarkdown}
        onResetDemo={handleResetDemo}
      />

      {/* Quiet Footer */}
      <footer className="border-t border-white/[0.06] bg-[#07080D] py-4 mt-auto">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-zinc-500">
          <div className="flex items-center gap-2">
            <span className="font-bold text-zinc-300">ActionOS</span>
            <span aria-hidden="true">·</span>
            <span>From information to action</span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1 text-zinc-400 font-mono text-[11px]">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Validated local & server sync</span>
            </span>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-zinc-500 font-mono">
            <span>Press Cmd+K for Natural Language Command Bar</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
