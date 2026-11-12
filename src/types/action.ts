export type UrgencyLevel = 'urgent' | 'high' | 'medium' | 'low';

export type RequirementStatus = 'obtained' | 'pending' | 'not_needed';

export type TaskPriority = 'high' | 'medium' | 'low';

export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'done';

export type ObligationStatus = 'active' | 'blocked' | 'completed';

export interface SubStep {
  id: string;
  title: string;
  completed: boolean;
  estimatedMinutes?: number;
  suggestedAction?: string;
}

export interface Requirement {
  id: string;
  name: string;
  status: RequirementStatus;
  notes?: string;
  isExplicitInSource: boolean;
}

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  status?: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;
  dependencies?: string[];
  estimatedEffort?: string;
  estimatedMinutes?: number;
  notes?: string;
  subSteps?: SubStep[];
}

export interface SuggestedNextAction {
  title: string;
  reason: string;
  followUp: string;
  generatedAt?: string;
  estimatedMinutes?: number;
}

export interface ExecutionLog {
  id: string;
  timestamp: string;
  note: string;
  type: 'note' | 'status_change' | 'ai_synthesis' | 'decomposition';
}

export interface ActionItem {
  id: string;
  title: string;
  shortSummary: string;
  category: string;
  tags: string[];
  status: ObligationStatus;
  deadline: string | null;
  deadlineIsAmbiguous: boolean;
  urgency: UrgencyLevel;
  requirements: Requirement[];
  tasks: Task[];
  suggestedNextAction: SuggestedNextAction;
  warnings: string[];
  executionLogs: ExecutionLog[];
  confidence: 'high' | 'medium' | 'low';
  createdAt: string;
  updatedAt: string;
  version: number;
  sourceType: 'text' | 'image' | 'pdf' | 'ai_command';
  sourceSnippet?: string;
  sourceFileName?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: string;
  isStreaming?: boolean;
}

export type FilterTab = 'all' | 'active' | 'due-soon' | 'blocked' | 'completed';

export type SortOption = 'urgency' | 'deadline' | 'progress' | 'updated' | 'title';

export interface DecomposeResponse {
  success: boolean;
  summary: string;
  estimatedTotalTime: string;
  tasks: Task[];
  suggestedNextAction: SuggestedNextAction;
}

export interface TaskSubStepsResponse {
  success: boolean;
  subSteps: SubStep[];
  executionTip: string;
}

export interface NaturalCommandResult {
  success: boolean;
  intent:
    | 'create_action'
    | 'filter_view'
    | 'summarize'
    | 'complete_task'
    | 'export_data'
    | 'answer_question';
  message: string;
  createdItem?: ActionItem;
  filterToApply?: {
    tab?: FilterTab;
    category?: string;
    urgency?: UrgencyLevel | 'all';
    searchQuery?: string;
    sortBy?: SortOption;
  };
  targetItemId?: string;
  targetTaskId?: string;
  exportFormat?: 'json' | 'markdown';
}

export interface GlobalMetrics {
  totalItems: number;
  activeItems: number;
  dueSoonItems: number;
  blockedItems: number;
  completedItems: number;
  totalTasks: number;
  totalTasksCompleted: number;
  overallProgressPercentage: number;
  totalSubSteps: number;
  completedSubSteps: number;
  estimatedRemainingMinutes: number;
  completionVelocityPerDay: number;
}
