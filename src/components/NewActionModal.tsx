import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  FileText,
  Image as ImageIcon,
  FileCode,
  Upload,
  Sparkles,
  AlertCircle,
  FileCheck,
  GitBranch,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { ActionItem, UrgencyLevel } from '../types/action';
import { actionApi } from '../utils/api';
import { validateAndSanitizeActionItem } from '../utils/storage';

interface NewActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onItemCreated: (item: ActionItem) => void;
}

type TabType = 'text' | 'decompose' | 'image' | 'pdf';

const PRESET_SAMPLES = [
  {
    label: 'Scholarship Notice',
    type: 'text' as TabType,
    text: `CENTRAL STEM MERIT SCHOLARSHIP 2026-27
Notification No. CSMS/2026/894
Applications are invited from full-time undergraduate engineering and science students with parental annual income less than $15,000 USD.
Deadline for online portal submission: October 20, 2026 (Portal closes at 11:59 PM EST).
Mandatory Documents Required:
1. Valid National ID / Aadhaar card scan.
2. Verified grade sheet / marks transcript of previous 2 semesters (min 7.5 CGPA).
3. Income certificate signed by the District Revenue Officer (issued after April 2026).
4. Applicant's active bank passbook showing IFSC and account details.
5. Recent passport-sized color photograph.
Instructions:
- Fill out sections A through D on the scholarship website.
- Upload all verified scans.
- Principal or Dean must digitally countersign the application endorsement.`,
  },
  {
    label: 'Technical Assessment Invite',
    type: 'text' as TabType,
    text: `Subject: Invitation to Stage 2: Technical Assessment - NovaCore Systems
Dear Candidate,
Thank you for applying to the Systems Software Engineer Internship for Summer 2027.
We are pleased to invite you to take our 90-minute algorithmic coding challenge.
Assessment Instructions:
- Assessment must be completed before Friday, October 9, 2026 at 5:00 PM PST.
- Challenge includes 2 data structure problems (graph algorithms and concurrency).
- Have your updated single-page technical resume ready to attach.
- Link to your GitHub profile or open-source PRs must be verified in your candidate dashboard.`,
  },
  {
    label: 'Launch Checklist Goal',
    type: 'decompose' as TabType,
    goalTitle: 'Ship Production SaaS v2.0 Security & Compliance Release',
    goalContext:
      'Complete SOC2 audit evidence collection, run load benchmarks, finalize rollback playbook, and coordinate customer migration notice.',
    deadline: 'November 20, 2026',
    urgency: 'urgent' as UrgencyLevel,
  },
];

const PROCESSING_STAGES = [
  'Parsing source content & intent',
  'Extracting deadlines, risks, and prerequisites',
  'Decomposing milestones into time-estimated sub-steps',
  'Calibrating highest-leverage next action',
];

export const NewActionModal: React.FC<NewActionModalProps> = ({
  isOpen,
  onClose,
  onItemCreated,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('text');
  const [textContent, setTextContent] = useState('');
  const [autoDecomposeSubSteps, setAutoDecomposeSubSteps] = useState(true);

  // AI Goal Decomposer fields
  const [goalTitle, setGoalTitle] = useState('');
  const [goalContext, setGoalContext] = useState('');
  const [goalCategory, setGoalCategory] = useState('Project');
  const [goalDeadline, setGoalDeadline] = useState('');
  const [goalUrgency, setGoalUrgency] = useState<UrgencyLevel>('high');

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [currentStageIndex, setCurrentStageIndex] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isLoading) {
      setCurrentStageIndex(0);
      interval = setInterval(() => {
        setCurrentStageIndex((prev) =>
          prev < PROCESSING_STAGES.length - 1 ? prev + 1 : prev
        );
      }, 1200);
    }
    return () => clearInterval(interval);
  }, [isLoading]);

  // Focus trap inside modal
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !isLoading) {
      e.preventDefault();
      onClose();
    } else if (e.key === 'Tab' && modalRef.current) {
      const focusable = modalRef.current.querySelectorAll<HTMLElement>(
        'input, textarea, select, button:not([disabled]), [tabindex]:not([tabindex="-1"])'
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

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    setErrorMessage(null);
    setSelectedFile(null);
    setFilePreview(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      setErrorMessage('File size exceeds 15MB limit. Please upload a smaller file.');
      return;
    }

    setErrorMessage(null);
    setSelectedFile(file);

    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (loadEvent) => {
        setFilePreview(loadEvent.target?.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setFilePreview(null);
    }
  };

  const handleLoadSample = (sample: (typeof PRESET_SAMPLES)[number]) => {
    setActiveTab(sample.type);
    setErrorMessage(null);
    setSelectedFile(null);
    setFilePreview(null);

    if (sample.type === 'decompose') {
      setGoalTitle(sample.goalTitle || '');
      setGoalContext(sample.goalContext || '');
      setGoalDeadline(sample.deadline || '');
      setGoalUrgency(sample.urgency || 'high');
    } else {
      setTextContent(sample.text || '');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    // Mode A: AI Goal Decomposer
    if (activeTab === 'decompose') {
      if (!goalTitle.trim()) {
        setErrorMessage('Please enter a high-level goal title to decompose.');
        return;
      }

      setIsLoading(true);
      try {
        const decomposed = await actionApi.decomposeGoal({
          goalTitle: goalTitle.trim(),
          goalContext: goalContext.trim(),
          deadline: goalDeadline.trim() || null,
          urgency: goalUrgency,
        });

        const nowIso = new Date().toISOString();
        const rawItem = {
          id: `action-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          title: goalTitle.trim(),
          shortSummary:
            decomposed.summary ||
            goalContext.trim() ||
            'AI-decomposed action plan with time-estimated sub-steps.',
          category: goalCategory || 'Project',
          tags: [goalCategory.toLowerCase(), 'decomposed', goalUrgency],
          status: 'active',
          deadline: goalDeadline.trim() || null,
          deadlineIsAmbiguous: false,
          urgency: goalUrgency,
          requirements: [],
          tasks: decomposed.tasks || [],
          suggestedNextAction: decomposed.suggestedNextAction,
          warnings: [],
          executionLogs: [
            {
              id: `log-${Date.now()}`,
              timestamp: nowIso,
              note: `Decomposed goal into ${decomposed.tasks?.length || 0} milestones (Est. total: ${decomposed.estimatedTotalTime}).`,
              type: 'decomposition',
            },
          ],
          confidence: 'high',
          createdAt: nowIso,
          updatedAt: nowIso,
          version: 1,
          sourceType: 'ai_command',
          sourceSnippet: goalContext.trim() || goalTitle.trim(),
        };

        const validated = validateAndSanitizeActionItem(rawItem);
        if (validated) {
          onItemCreated(validated);
          onClose();
        }
      } catch (err: any) {
        setErrorMessage(err?.message || 'Failed to decompose goal. Please try again.');
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Mode B: Text / Image / PDF Extraction
    let payloadContent = '';
    let payloadMimeType = '';
    let payloadFileName = '';

    if (activeTab === 'text') {
      if (!textContent.trim()) {
        setErrorMessage('Please paste or enter announcement text to extract obligations.');
        return;
      }
      payloadContent = textContent.trim();
    } else {
      if (!selectedFile) {
        setErrorMessage(
          `Please select a ${activeTab === 'image' ? 'screenshot/image' : 'PDF document'} file.`
        );
        return;
      }

      payloadMimeType =
        selectedFile.type || (activeTab === 'pdf' ? 'application/pdf' : 'image/png');
      payloadFileName = selectedFile.name;

      try {
        payloadContent = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('Failed to read file.'));
          reader.readAsDataURL(selectedFile);
        });
      } catch {
        setErrorMessage('Failed to read file from disk. Please try again.');
        return;
      }
    }

    setIsLoading(true);

    try {
      const data = await actionApi.extractObligation({
        type: activeTab,
        content: payloadContent,
        mimeType: payloadMimeType,
        fileName: payloadFileName,
        autoDecomposeSubSteps,
      });

      const extracted = data.data || {};
      const nowIso = new Date().toISOString();

      const rawActionItem = {
        id: `action-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        title: extracted.title || 'Untitled Action Item',
        shortSummary:
          extracted.shortSummary || 'Structured action plan extracted from source.',
        category: extracted.category || 'General',
        tags: extracted.tags || [String(extracted.category || 'general').toLowerCase()],
        status: 'active',
        deadline:
          extracted.deadline === 'No deadline specified' ? null : extracted.deadline,
        deadlineIsAmbiguous: Boolean(extracted.deadlineIsAmbiguous),
        urgency: extracted.urgency || 'medium',
        requirements: extracted.requirements || [],
        tasks: extracted.tasks || [],
        suggestedNextAction: extracted.suggestedNextAction || {
          title: 'Review extracted tasks',
          reason: 'Verify details against source material.',
          followUp: 'Begin checking off mandatory items.',
        },
        warnings: extracted.warnings || [],
        executionLogs: [
          {
            id: `log-${Date.now()}`,
            timestamp: nowIso,
            note: `Ingested ${activeTab.toUpperCase()} source${payloadFileName ? ` (${payloadFileName})` : ''} and synthesized ${extracted.tasks?.length || 0} tasks.`,
            type: 'ai_synthesis',
          },
        ],
        confidence: extracted.confidence || 'high',
        createdAt: nowIso,
        updatedAt: nowIso,
        version: 1,
        sourceType: activeTab,
        sourceSnippet: activeTab === 'text' ? payloadContent.slice(0, 300) : undefined,
        sourceFileName: payloadFileName || undefined,
      };

      const validated = validateAndSanitizeActionItem(rawActionItem);
      if (validated) {
        onItemCreated(validated);
        onClose();
      }
    } catch (err: any) {
      setErrorMessage(
        err?.message ||
          'An error occurred during extraction. Please verify your input and try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-black/85 backdrop-blur-md flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="new-action-modal-title"
      onKeyDown={handleKeyDown}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isLoading) onClose();
      }}
    >
      <div
        ref={modalRef}
        className="bg-[#0E1018] rounded-2xl max-w-2xl w-full border border-white/[0.12] shadow-2xl overflow-hidden animate-card-enter"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08] bg-black/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2
                id="new-action-modal-title"
                className="text-base font-bold text-white tracking-tight"
              >
                Ingest Obligation or Decompose Goal
              </h2>
              <p className="text-xs text-zinc-400">
                Convert unstructured documents or high-level goals into time-estimated action plans.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            aria-label="Close modal"
            className="text-zinc-500 hover:text-white p-1.5 rounded-xl hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Quick Presets */}
          <div>
            <div className="flex items-center justify-between text-xs text-zinc-400 mb-2">
              <span className="font-mono text-[11px] text-cyan-400 font-semibold">
                Quick Presets
              </span>
              <span className="text-zinc-500 text-[11px]">Load sample input</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {PRESET_SAMPLES.map((sample, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleLoadSample(sample)}
                  disabled={isLoading}
                  className="text-xs font-mono px-3 py-1.5 bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] hover:border-cyan-500/40 text-zinc-300 hover:text-white rounded-xl transition-all text-left cursor-pointer whitespace-nowrap"
                >
                  {sample.label}
                </button>
              ))}
            </div>
          </div>

          {/* Input Mode Tabs */}
          <div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-1 bg-black/40 rounded-xl border border-white/[0.06]">
              <button
                type="button"
                onClick={() => handleTabChange('text')}
                disabled={isLoading}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'text'
                    ? 'bg-white/[0.1] text-cyan-300 border border-cyan-500/30'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Paste Text</span>
              </button>
              <button
                type="button"
                onClick={() => handleTabChange('decompose')}
                disabled={isLoading}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'decompose'
                    ? 'bg-white/[0.1] text-cyan-300 border border-cyan-500/30'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <GitBranch className="w-3.5 h-3.5" />
                <span>AI Decomposer</span>
              </button>
              <button
                type="button"
                onClick={() => handleTabChange('image')}
                disabled={isLoading}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'image'
                    ? 'bg-white/[0.1] text-cyan-300 border border-cyan-500/30'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Screenshot</span>
              </button>
              <button
                type="button"
                onClick={() => handleTabChange('pdf')}
                disabled={isLoading}
                className={`flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  activeTab === 'pdf'
                    ? 'bg-white/[0.1] text-cyan-300 border border-cyan-500/30'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <FileCode className="w-3.5 h-3.5" />
                <span>PDF Notice</span>
              </button>
            </div>
          </div>

          {/* Tab 1: Paste Text */}
          {activeTab === 'text' && (
            <div className="space-y-3">
              <label className="block text-xs font-medium text-zinc-300">
                Paste unstructured message, email, grant notice, or announcement
              </label>
              <textarea
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                placeholder="Paste announcement or instructions here..."
                rows={6}
                disabled={isLoading}
                className="w-full text-xs bg-black/50 border border-white/[0.08] rounded-xl p-3.5 text-white placeholder:text-zinc-600 focus:outline-hidden focus:border-cyan-400 leading-relaxed"
              />
            </div>
          )}

          {/* Tab 2: AI Action Decomposer */}
          {activeTab === 'decompose' && (
            <div className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  High-Level Goal or Initiative Title
                </label>
                <input
                  type="text"
                  value={goalTitle}
                  onChange={(e) => setGoalTitle(e.target.value)}
                  placeholder="e.g., Launch Q4 Customer Onboarding Portal & Compliance Audit"
                  disabled={isLoading}
                  className="w-full text-xs bg-black/50 border border-white/[0.08] rounded-xl px-3.5 py-2.5 text-white placeholder:text-zinc-600 focus:outline-hidden focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-300 mb-1">
                  Context, Constraints, or Deliverables (Optional)
                </label>
                <textarea
                  value={goalContext}
                  onChange={(e) => setGoalContext(e.target.value)}
                  placeholder="Describe any specific requirements, stakeholders, or bottlenecks so ActionOS can estimate sub-step durations accurately..."
                  rows={3}
                  disabled={isLoading}
                  className="w-full text-xs bg-black/50 border border-white/[0.08] rounded-xl p-3.5 text-white placeholder:text-zinc-600 focus:outline-hidden focus:border-cyan-400 leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-mono text-zinc-400 mb-1">
                    Category
                  </label>
                  <input
                    type="text"
                    value={goalCategory}
                    onChange={(e) => setGoalCategory(e.target.value)}
                    placeholder="Project, Career, Launch..."
                    disabled={isLoading}
                    className="w-full text-xs bg-black/50 border border-white/[0.08] rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono text-zinc-400 mb-1">
                    Target Deadline
                  </label>
                  <input
                    type="text"
                    value={goalDeadline}
                    onChange={(e) => setGoalDeadline(e.target.value)}
                    placeholder="e.g. Nov 15, 2026"
                    disabled={isLoading}
                    className="w-full text-xs bg-black/50 border border-white/[0.08] rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-cyan-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-mono text-zinc-400 mb-1">
                    Urgency Level
                  </label>
                  <select
                    value={goalUrgency}
                    onChange={(e) => setGoalUrgency(e.target.value as UrgencyLevel)}
                    disabled={isLoading}
                    className="w-full text-xs bg-black/50 border border-white/[0.08] rounded-xl px-3 py-2 text-white focus:outline-hidden focus:border-cyan-400"
                  >
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Tab 3 & 4: Upload Screenshot / PDF */}
          {(activeTab === 'image' || activeTab === 'pdf') && (
            <div className="space-y-3">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-white/[0.12] hover:border-cyan-500/50 bg-black/40 rounded-xl p-6 text-center cursor-pointer transition-colors"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={
                    activeTab === 'image'
                      ? 'image/png,image/jpeg,image/webp,image/heic'
                      : 'application/pdf'
                  }
                  onChange={handleFileChange}
                  disabled={isLoading}
                  className="hidden"
                />
                <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center mx-auto mb-2 border border-cyan-500/20">
                  <Upload className="w-5 h-5" />
                </div>
                <p className="text-xs font-semibold text-white mb-1">
                  Click to upload {activeTab === 'image' ? 'screenshot or photo' : 'PDF document'}
                </p>
                <p className="text-[11px] text-zinc-500 font-mono">
                  {activeTab === 'image' ? 'PNG, JPG, WEBP' : 'Official PDF notices & forms'} up to 15MB
                </p>
              </div>

              {selectedFile && (
                <div className="flex items-center justify-between p-3 bg-white/[0.04] border border-white/[0.08] rounded-xl text-xs">
                  <div className="flex items-center gap-2.5 truncate">
                    <FileCheck className="w-4 h-4 text-cyan-400 shrink-0" />
                    <span className="truncate font-medium text-zinc-200">
                      {selectedFile.name}
                    </span>
                    <span className="text-zinc-500 font-mono text-[10px] tabular-nums">
                      ({Math.round(selectedFile.size / 1024)} KB)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFile(null);
                      setFilePreview(null);
                    }}
                    className="text-zinc-500 hover:text-rose-400"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {filePreview && (
                <div className="max-h-40 overflow-hidden rounded-xl border border-white/[0.08] bg-black/40 flex justify-center">
                  <img
                    src={filePreview}
                    alt="Uploaded document preview"
                    referrerPolicy="no-referrer"
                    className="max-h-40 object-contain"
                  />
                </div>
              )}
            </div>
          )}

          {/* Auto-Decompose Toggle for Ingestion Tabs */}
          {activeTab !== 'decompose' && (
            <label className="flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] cursor-pointer">
              <div className="flex items-center gap-2.5">
                <GitBranch className="w-4 h-4 text-cyan-400" />
                <div>
                  <span className="text-xs font-semibold text-zinc-200 block">
                    AI Sub-Step Decomposer
                  </span>
                  <span className="text-[11px] text-zinc-500">
                    Automatically break down complex tasks into time-estimated sub-steps
                  </span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={autoDecomposeSubSteps}
                onChange={(e) => setAutoDecomposeSubSteps(e.target.checked)}
                className="accent-cyan-400 w-4 h-4 rounded cursor-pointer"
              />
            </label>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="flex items-start gap-2.5 p-3.5 bg-rose-950/40 border border-rose-800/60 rounded-xl text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {/* Optimistic Progress State */}
          {isLoading && (
            <div className="p-4 bg-cyan-950/20 border border-cyan-500/30 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-cyan-300 font-semibold flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 animate-spin text-cyan-400" />
                  <span>{PROCESSING_STAGES[currentStageIndex]}</span>
                </span>
                <span className="text-zinc-400 tabular-nums">
                  Step {currentStageIndex + 1}/{PROCESSING_STAGES.length}
                </span>
              </div>
              <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                <div
                  className="bg-cyan-400 h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${((currentStageIndex + 1) / PROCESSING_STAGES.length) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Modal Footer */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-white/[0.08]">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-xs font-mono font-semibold text-zinc-400 hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-bold text-black bg-cyan-400 hover:bg-cyan-300 disabled:bg-zinc-700 disabled:text-zinc-500 rounded-xl transition-all cursor-pointer whitespace-nowrap"
            >
              {isLoading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  <span>Synthesizing Plan...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>
                    {activeTab === 'decompose'
                      ? 'Decompose Goal into Action Plan →'
                      : 'Extract Action Plan →'}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
