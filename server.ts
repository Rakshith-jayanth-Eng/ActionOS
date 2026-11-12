import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type, GenerateContentResponse } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '35mb' }));

// ============================================================================
// 1. STRUCTURED LOGGING & RATE LIMITING MIDDLEWARE
// ============================================================================
interface RateBucket {
  count: number;
  resetAt: number;
}

const rateLimitStore = new Map<string, RateBucket>();
const RATE_WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_REQUESTS_PER_WINDOW = 60;

function logStructured(
  level: 'INFO' | 'WARN' | 'ERROR',
  event: string,
  meta: Record<string, unknown> = {}
) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...meta,
  };
  if (level === 'ERROR') {
    console.error(JSON.stringify(entry));
  } else if (level === 'WARN') {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  const clientIp =
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'local';

  // Sliding window rate limit check
  const now = Date.now();
  const bucket = rateLimitStore.get(clientIp);
  if (!bucket || now > bucket.resetAt) {
    rateLimitStore.set(clientIp, { count: 1, resetAt: now + RATE_WINDOW_MS });
  } else {
    bucket.count += 1;
    if (bucket.count > MAX_REQUESTS_PER_WINDOW) {
      const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfterSec));
      logStructured('WARN', 'rate_limit_exceeded', { clientIp, path: req.path, retryAfterSec });
      res.status(429).json({
        success: false,
        error: `Rate limit exceeded. Please wait ${retryAfterSec} seconds before retrying.`,
      });
      return;
    }
  }

  res.on('finish', () => {
    logStructured('INFO', 'api_request', {
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - start,
    });
  });

  next();
});

// ============================================================================
// 2. GEMINI SDK INITIALIZATION & RESILIENT MULTI-MODEL EXECUTION
// ============================================================================
function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const err: any = new Error(
      'GEMINI_API_KEY is not configured on the server. Please verify your API key in Settings > Secrets.'
    );
    err.status = 500;
    throw err;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function callGeminiWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 2,
  baseDelayMs = 800
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const errMsg = err?.message || String(err);
      const isTransient =
        errMsg.includes('503') ||
        errMsg.includes('429') ||
        errMsg.includes('high demand') ||
        errMsg.includes('UNAVAILABLE') ||
        errMsg.includes('RESOURCE_EXHAUSTED');

      if (isTransient && attempt < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, attempt);
        logStructured('WARN', 'gemini_retry', { attempt: attempt + 1, delayMs: delay });
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

async function generateWithModelFallback(
  getParams: (modelName: string) => any
): Promise<GenerateContentResponse> {
  const ai = getAiClient();
  const models = ['gemini-3.8-flash', 'gemini-3.1-flash-lite'];
  let lastError: any;

  for (const model of models) {
    try {
      return await callGeminiWithRetry(async () => {
        const params = getParams(model);
        return await ai.models.generateContent(params);
      }, 1, 700);
    } catch (err: any) {
      lastError = err;
      const errMsg = err?.message || String(err);
      const isDemandSpike =
        errMsg.includes('503') ||
        errMsg.includes('high demand') ||
        errMsg.includes('UNAVAILABLE') ||
        errMsg.includes('RESOURCE_EXHAUSTED') ||
        errMsg.includes('429');

      if (isDemandSpike) {
        logStructured('WARN', 'gemini_model_fallback', { failedModel: model });
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

function formatErrorMessage(err: any): string {
  const msg = err?.message || String(err);
  if (msg.includes('503') || msg.includes('high demand') || msg.includes('UNAVAILABLE')) {
    return 'The AI service is experiencing a brief high-demand spike. Please click retry in a few moments.';
  }
  if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED')) {
    return 'AI request quota reached temporarily. Please wait a moment and try again.';
  }
  if (msg.includes('API_KEY') || msg.includes('PERMISSION_DENIED')) {
    return 'Gemini API key issue detected. Please check your API key in the Settings > Secrets panel.';
  }
  return msg;
}

// ============================================================================
// 3. STRICT RESPONSE SCHEMAS
// ============================================================================
const subStepSchema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    title: { type: Type.STRING, description: 'Concrete micro-action step' },
    completed: { type: Type.BOOLEAN },
    estimatedMinutes: {
      type: Type.INTEGER,
      description: 'Realistic time in minutes (e.g., 10, 15, 30)',
    },
    suggestedAction: {
      type: Type.STRING,
      description: 'Direct tip or specific command/tool to execute this sub-step',
    },
  },
  required: ['id', 'title', 'completed', 'estimatedMinutes'],
};

const taskSchema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    title: { type: Type.STRING, description: 'Action-oriented verb phrase task' },
    completed: { type: Type.BOOLEAN },
    priority: { type: Type.STRING, description: '"high", "medium", or "low"' },
    dueDate: { type: Type.STRING, description: 'Suggested target date before deadline' },
    dependencies: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Titles of prerequisite tasks that should be completed first',
    },
    estimatedEffort: { type: Type.STRING, description: 'Human-readable effort (e.g. "25 mins", "1 hour")' },
    estimatedMinutes: { type: Type.INTEGER, description: 'Estimated duration in minutes' },
    subSteps: {
      type: Type.ARRAY,
      items: subStepSchema,
      description: '2 to 4 concrete sub-steps for complex tasks',
    },
  },
  required: ['id', 'title', 'completed', 'priority', 'estimatedEffort', 'estimatedMinutes'],
};

const extractionResponseSchema = {
  type: Type.OBJECT,
  properties: {
    title: {
      type: Type.STRING,
      description: 'Clean, descriptive title of the action item or obligation',
    },
    shortSummary: {
      type: Type.STRING,
      description: 'A crisp 1-2 sentence executive summary of what this document or notice requires',
    },
    category: {
      type: Type.STRING,
      description: 'One concise category such as Scholarship, Career, Academic, Compliance, Event, Financial, Legal, or Launch',
    },
    tags: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '3 to 5 lowercase semantic tags for filtering and search',
    },
    deadline: {
      type: Type.STRING,
      description: 'The deadline string found in the source. If vague, state "Friday — exact date unclear". If none exists, return "No deadline specified".',
    },
    deadlineIsAmbiguous: {
      type: Type.BOOLEAN,
      description: 'True if the deadline is ambiguous, relative, or missing a concrete calendar date',
    },
    urgency: {
      type: Type.STRING,
      description: 'One of: urgent, high, medium, low',
    },
    requirements: {
      type: Type.ARRAY,
      description: 'List of mandatory or optional documents, prerequisites, or qualifications',
      items: {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING },
          name: { type: Type.STRING, description: 'Clear document or requirement name' },
          status: { type: Type.STRING, description: '"pending" or "obtained"' },
          notes: { type: Type.STRING, description: 'Key nuances, file formats, or verification details' },
          isExplicitInSource: {
            type: Type.BOOLEAN,
            description: 'True if stated directly in source text, false if inferred best practice',
          },
        },
        required: ['id', 'name', 'status', 'isExplicitInSource'],
      },
    },
    tasks: {
      type: Type.ARRAY,
      description: 'Concrete sequential action checklist items derived from the instructions',
      items: taskSchema,
    },
    suggestedNextAction: {
      type: Type.OBJECT,
      description: 'The single most effective next step to unblock momentum right now',
      properties: {
        title: { type: Type.STRING, description: 'Direct actionable next step' },
        reason: { type: Type.STRING, description: 'Why this is the primary bottleneck or most urgent task' },
        followUp: { type: Type.STRING, description: 'What to do immediately after completing it' },
        estimatedMinutes: { type: Type.INTEGER, description: 'Estimated minutes for this immediate move' },
      },
      required: ['title', 'reason', 'followUp'],
    },
    warnings: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: 'Important cautionary flags, strict cut-off hours, penalties, or ambiguities',
    },
    confidence: {
      type: Type.STRING,
      description: '"high", "medium", or "low" confidence in extraction fidelity',
    },
  },
  required: [
    'title',
    'shortSummary',
    'category',
    'tags',
    'deadline',
    'deadlineIsAmbiguous',
    'urgency',
    'requirements',
    'tasks',
    'suggestedNextAction',
    'warnings',
    'confidence',
  ],
};

// ============================================================================
// 4. AI ENDPOINTS
// ============================================================================

// 4.1 POST /api/extract — Multimodal & Text Obligation Ingestion
app.post('/api/extract', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { type, content, mimeType, fileName, autoDecomposeSubSteps } = req.body || {};

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: 'Please provide valid text, image, or PDF content to analyze.',
      });
      return;
    }

    const systemInstruction = `You are ActionOS, an executive intelligence engine that converts messy unstructured documents, notices, screenshots, emails, and PDFs into concrete, actionable workspaces.
Core product promise: "From information to action."

STRICT RULES:
1. Never fabricate deadlines, requirements, eligibility criteria, or facts not supported by the supplied content.
2. If information is missing or ambiguous, explicitly represent it. For example, if a document says "Submit before Friday" without a date, state "Friday — exact date unclear" and set deadlineIsAmbiguous to true.
3. If no deadline exists anywhere in the source, write "No deadline specified" and set deadlineIsAmbiguous to false.
4. Distinguish between requirements explicitly stated in the source versus recommended best practices (mark isExplicitInSource).
5. Produce realistic sequential tasks with clear verbs and realistic time estimates (estimatedEffort and estimatedMinutes).
6. ${
      autoDecomposeSubSteps
        ? 'For every task, include 2 to 4 concrete, time-estimated subSteps with suggestedAction tips.'
        : 'For complex high-priority tasks, include 2 to 3 helpful subSteps.'
    }
7. Provide a razor-sharp suggestedNextAction identifying the primary bottleneck or high-priority first step.`;

    const response = await generateWithModelFallback((modelName) => {
      if (type === 'image' || type === 'pdf') {
        const base64Data = content.includes('base64,') ? content.split('base64,')[1] : content;
        const detectedMime = mimeType || (type === 'pdf' ? 'application/pdf' : 'image/png');

        return {
          model: modelName,
          contents: {
            parts: [
              {
                inlineData: {
                  data: base64Data,
                  mimeType: detectedMime,
                },
              },
              {
                text: `Analyze this ${type.toUpperCase()} document (${fileName || 'uploaded document'}) carefully. Extract all actionable information, requirements, tasks, sub-steps, tags, deadlines, and next steps into the structured ActionOS schema.`,
              },
            ],
          },
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: extractionResponseSchema,
          },
        };
      }

      return {
        model: modelName,
        contents: `Analyze this unstructured text or goal:\n\n"""\n${content}\n"""\n\nExtract all actionable information, requirements, tasks, sub-steps, tags, deadlines, and next steps into the structured ActionOS schema.`,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: extractionResponseSchema,
        },
      };
    });

    const rawText = response.text?.trim() || '';
    if (!rawText) {
      res.status(422).json({
        success: false,
        error: 'Gemini returned an empty response. Please verify the document has readable content.',
      });
      return;
    }

    const structuredData = JSON.parse(rawText);
    const nowTs = Date.now();

    if (Array.isArray(structuredData.requirements)) {
      structuredData.requirements = structuredData.requirements.map((reqItem: any, idx: number) => ({
        ...reqItem,
        id: `req-${nowTs}-${idx}`,
        status: reqItem.status === 'obtained' ? 'obtained' : 'pending',
        isExplicitInSource:
          typeof reqItem.isExplicitInSource === 'boolean' ? reqItem.isExplicitInSource : true,
      }));
    }

    if (Array.isArray(structuredData.tasks)) {
      structuredData.tasks = structuredData.tasks.map((task: any, idx: number) => ({
        ...task,
        id: `task-${nowTs}-${idx}`,
        completed: false,
        status: 'todo',
        priority:
          task.priority === 'high' || task.priority === 'medium' || task.priority === 'low'
            ? task.priority
            : 'medium',
        subSteps: Array.isArray(task.subSteps)
          ? task.subSteps.map((s: any, sIdx: number) => ({
              ...s,
              id: `sub-${nowTs}-${idx}-${sIdx}`,
              completed: false,
            }))
          : [],
      }));
    }

    res.status(200).json({
      success: true,
      data: structuredData,
    });
  } catch (err) {
    next(err);
  }
});

// 4.2 POST /api/decompose — AI Action Decomposer (High-Level Goal -> Tasks + Sub-Steps)
app.post('/api/decompose', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { goalTitle, goalContext, deadline, urgency, existingTasks } = req.body || {};

    if (!goalTitle || typeof goalTitle !== 'string' || !goalTitle.trim()) {
      res.status(400).json({
        success: false,
        error: 'Please provide a goal or obligation title to decompose.',
      });
      return;
    }

    const prompt = `You are the ActionOS AI Action Decomposer.
Break down the following high-level goal or obligation into a concrete, sequential execution plan with time-estimated milestones and granular sub-steps.

GOAL TITLE: "${goalTitle.trim()}"
CONTEXT / DETAILS: "${goalContext || 'None provided'}"
DEADLINE: "${deadline || 'Flexible'}"
URGENCY: "${urgency || 'medium'}"
EXISTING TASKS TO AVOID DUPLICATING: ${
      Array.isArray(existingTasks) && existingTasks.length > 0
        ? existingTasks.join('; ')
        : 'None'
    }

Requirements:
1. Generate 3 to 6 high-leverage sequential tasks with realistic time estimates (estimatedEffort and estimatedMinutes).
2. Inside each task, provide 2 to 4 concrete subSteps with estimatedMinutes and a specific suggestedAction tip.
3. Provide a suggestedNextAction highlighting the immediate first move.`;

    const response = await generateWithModelFallback((modelName) => ({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: {
              type: Type.STRING,
              description: 'Brief 1-sentence strategy summary of the decomposition',
            },
            estimatedTotalTime: {
              type: Type.STRING,
              description: 'Total estimated time across all tasks (e.g., "3.5 hours")',
            },
            tasks: {
              type: Type.ARRAY,
              items: taskSchema,
            },
            suggestedNextAction: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                reason: { type: Type.STRING },
                followUp: { type: Type.STRING },
                estimatedMinutes: { type: Type.INTEGER },
              },
              required: ['title', 'reason', 'followUp'],
            },
          },
          required: ['summary', 'estimatedTotalTime', 'tasks', 'suggestedNextAction'],
        },
      },
    }));

    const parsed = JSON.parse(response.text?.trim() || '{}');
    const nowTs = Date.now();

    const normalizedTasks = (parsed.tasks || []).map((t: any, idx: number) => ({
      ...t,
      id: `task-dec-${nowTs}-${idx}`,
      completed: false,
      status: 'todo',
      subSteps: (t.subSteps || []).map((s: any, sIdx: number) => ({
        ...s,
        id: `sub-dec-${nowTs}-${idx}-${sIdx}`,
        completed: false,
      })),
    }));

    res.status(200).json({
      success: true,
      summary: parsed.summary || 'Goal decomposed into executable milestones.',
      estimatedTotalTime: parsed.estimatedTotalTime || '2 hours',
      tasks: normalizedTasks,
      suggestedNextAction: parsed.suggestedNextAction,
    });
  } catch (err) {
    next(err);
  }
});

// 4.3 POST /api/decompose-task — Granular Task-Level Sub-Step Generator
app.post('/api/decompose-task', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { itemTitle, itemSummary, taskTitle, taskPriority, deadline } = req.body || {};

    if (!taskTitle || typeof taskTitle !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Missing taskTitle to decompose.',
      });
      return;
    }

    const prompt = `Break down this specific task into 3 to 5 concrete, bite-sized sub-steps that can be executed immediately.
Workspace: "${itemTitle || 'Obligation'}" (${itemSummary || ''})
Deadline: "${deadline || 'None'}"
Target Task: "${taskTitle}" (Priority: ${taskPriority || 'medium'})

Each sub-step must include a crisp title, realistic estimatedMinutes (5 to 45 mins), and a practical suggestedAction.`;

    const response = await generateWithModelFallback((modelName) => ({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            subSteps: {
              type: Type.ARRAY,
              items: subStepSchema,
            },
            executionTip: {
              type: Type.STRING,
              description: 'One tactical tip to finish this task faster',
            },
          },
          required: ['subSteps', 'executionTip'],
        },
      },
    }));

    const parsed = JSON.parse(response.text?.trim() || '{}');
    const nowTs = Date.now();
    const subSteps = (parsed.subSteps || []).map((s: any, idx: number) => ({
      ...s,
      id: `sub-${nowTs}-${idx}`,
      completed: false,
    }));

    res.status(200).json({
      success: true,
      subSteps,
      executionTip: parsed.executionTip || 'Complete sub-steps in sequence to build momentum.',
    });
  } catch (err) {
    next(err);
  }
});

// 4.4 POST /api/next-action — Next-Step Intelligence Engine
app.post('/api/next-action', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { item } = req.body || {};

    if (!item || typeof item !== 'object') {
      res.status(400).json({ success: false, error: 'Missing action item payload.' });
      return;
    }

    const incompleteTasks = (item.tasks || []).filter((t: any) => !t.completed);
    const completedTasks = (item.tasks || []).filter((t: any) => t.completed);
    const pendingRequirements = (item.requirements || []).filter((r: any) => r.status !== 'obtained');

    const prompt = `You are the ActionOS Next-Action Intelligence Engine.
Context:
- Item: "${item.title}"
- Summary: "${item.shortSummary}"
- Category: "${item.category}"
- Deadline: "${item.deadline || 'None'}" (Ambiguous: ${item.deadlineIsAmbiguous ? 'Yes' : 'No'})
- Urgency: "${item.urgency}"
- Completed Tasks (${completedTasks.length}): ${completedTasks.map((t: any) => `[x] ${t.title}`).join(', ') || 'None'}
- Incomplete Tasks (${incompleteTasks.length}): ${incompleteTasks.map((t: any) => `[ ] ${t.title} (Priority: ${t.priority}, Status: ${t.status || 'todo'}, Due: ${t.dueDate || 'N/A'})`).join('; ') || 'None'}
- Pending Requirements (${pendingRequirements.length}): ${pendingRequirements.map((r: any) => `${r.name}`).join('; ') || 'None'}
- Warnings: ${(item.warnings || []).join('; ') || 'None'}

Determine:
1. The single highest-leverage next action to tackle right now.
2. Why it matters (bottleneck, dependency blocker, or impending deadline).
3. What should happen immediately afterward.
4. Estimated minutes required for this immediate action.`;

    const response = await generateWithModelFallback((modelName) => ({
      model: modelName,
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: 'Specific, direct action to take right now' },
            reason: {
              type: Type.STRING,
              description: 'Crisp explanation of why this step is the primary leverage point',
            },
            followUp: {
              type: Type.STRING,
              description: 'The exact step that should happen immediately after',
            },
            estimatedMinutes: {
              type: Type.INTEGER,
              description: 'Estimated minutes to complete this next move',
            },
          },
          required: ['title', 'reason', 'followUp', 'estimatedMinutes'],
        },
      },
    }));

    const parsed = JSON.parse(response.text?.trim() || '{}');
    res.status(200).json({
      success: true,
      recommendation: {
        title: parsed.title,
        reason: parsed.reason,
        followUp: parsed.followUp,
        estimatedMinutes: parsed.estimatedMinutes || 25,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// 4.5 POST /api/command — Natural Language Command Parser for Command Palette
app.post('/api/command', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { command, items } = req.body || {};

    if (!command || typeof command !== 'string' || !command.trim()) {
      res.status(400).json({ success: false, error: 'Please enter a natural language command.' });
      return;
    }

    const compactItems = Array.isArray(items)
      ? items.map((i: any) => ({
          id: i.id,
          title: i.title,
          category: i.category,
          urgency: i.urgency,
          status: i.status,
          deadline: i.deadline,
          incompleteTasks: (i.tasks || [])
            .filter((t: any) => !t.completed)
            .map((t: any) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority })),
          pendingReqs: (i.requirements || [])
            .filter((r: any) => r.status !== 'obtained')
            .map((r: any) => r.name),
        }))
      : [];

    const systemInstruction = `You are the ActionOS Natural-Language Command Router.
Classify the user's natural language instruction into one of these intents and populate the corresponding fields:
1. "create_action": When the user asks to create, build, add, or plan a new checklist, obligation, project, or action item (e.g., "Create a high-priority launch checklist due Friday"). Populate createdItem with a complete structured workspace including 3-5 tasks, subSteps, requirements, urgency, category, tags, and deadline.
2. "filter_view": When the user wants to filter, sort, or view specific obligations (e.g., "Show urgent items", "Filter by Career", "Show blocked actions"). Populate filterToApply.
3. "export_data": When the user asks to export or download their obligations as JSON or Markdown.
4. "summarize" or "answer_question": When the user asks a question about their current workload, blockers, deadlines, or next steps (e.g., "Summarize my blocked actions", "What is my biggest bottleneck?"). Provide a crisp, high-signal executive response in message.`;

    const response = await generateWithModelFallback((modelName) => ({
      model: modelName,
      contents: `CURRENT WORKSPACES STATE:\n${JSON.stringify(compactItems, null, 2)}\n\nUSER COMMAND: "${command.trim()}"`,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            intent: {
              type: Type.STRING,
              description:
                'One of: create_action, filter_view, summarize, complete_task, export_data, answer_question',
            },
            message: {
              type: Type.STRING,
              description: 'Clear executive response or confirmation message to display to the user',
            },
            createdItem: {
              ...extractionResponseSchema,
              description: 'Populated ONLY when intent is create_action',
            },
            filterToApply: {
              type: Type.OBJECT,
              properties: {
                tab: {
                  type: Type.STRING,
                  description: 'One of: all, active, due-soon, blocked, completed',
                },
                category: { type: Type.STRING },
                urgency: { type: Type.STRING, description: 'urgent, high, medium, low, or all' },
                searchQuery: { type: Type.STRING },
                sortBy: {
                  type: Type.STRING,
                  description: 'urgency, deadline, progress, updated, or title',
                },
              },
            },
            exportFormat: {
              type: Type.STRING,
              description: '"json" or "markdown" when intent is export_data',
            },
          },
          required: ['intent', 'message'],
        },
      },
    }));

    const parsed = JSON.parse(response.text?.trim() || '{}');
    const nowTs = Date.now();

    if (parsed.intent === 'create_action' && parsed.createdItem) {
      const ci = parsed.createdItem;
      parsed.createdItem = {
        ...ci,
        id: `action-cmd-${nowTs}`,
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
        sourceType: 'ai_command',
        sourceSnippet: command.trim(),
        requirements: (ci.requirements || []).map((r: any, idx: number) => ({
          ...r,
          id: `req-cmd-${nowTs}-${idx}`,
          status: r.status || 'pending',
        })),
        tasks: (ci.tasks || []).map((t: any, idx: number) => ({
          ...t,
          id: `task-cmd-${nowTs}-${idx}`,
          completed: false,
          status: 'todo',
          subSteps: (t.subSteps || []).map((s: any, sIdx: number) => ({
            ...s,
            id: `sub-cmd-${nowTs}-${idx}-${sIdx}`,
            completed: false,
          })),
        })),
        executionLogs: [
          {
            id: `log-cmd-${nowTs}`,
            timestamp: new Date().toISOString(),
            note: `Created via natural-language command: "${command.trim()}"`,
            type: 'ai_synthesis',
          },
        ],
      };
    }

    res.status(200).json({
      success: true,
      ...parsed,
    });
  } catch (err) {
    next(err);
  }
});

// Helper to build contextual prompt for /api/chat and /api/chat/stream
function buildChatContents(item: any, messages: any[], query: string) {
  const itemContext = `ITEM TITLE: ${item.title}
SUMMARY: ${item.shortSummary}
CATEGORY: ${item.category}
STATUS: ${item.status || 'active'}
DEADLINE: ${item.deadline || 'None'} (Ambiguous: ${item.deadlineIsAmbiguous ? 'Yes' : 'No'})
URGENCY: ${item.urgency}
REQUIREMENTS:
${
  (item.requirements || [])
    .map(
      (r: any) =>
        `- [${(r.status || 'pending').toUpperCase()}] ${r.name} ${r.notes ? `(${r.notes})` : ''} [${r.isExplicitInSource ? 'Explicit' : 'Inferred'}]`
    )
    .join('\n') || 'None'
}

TASKS & SUB-STEPS:
${
  (item.tasks || [])
    .map(
      (t: any) =>
        `- [${t.completed ? 'COMPLETED' : (t.status || 'PENDING').toUpperCase()}] ${t.title} | Priority: ${t.priority} | Est: ${t.estimatedEffort || 'N/A'} | Due: ${t.dueDate || 'N/A'}`
    )
    .join('\n') || 'None'
}

SOURCE WARNINGS:
${(item.warnings || []).map((w: string) => `- ${w}`).join('\n') || 'None'}`;

  const chatHistory = (messages || []).map((m: any) => ({
    role: m.role === 'model' ? 'model' : 'user',
    parts: [{ text: String(m.text || '') }],
  }));

  return [
    ...chatHistory,
    {
      role: 'user',
      parts: [
        {
          text: `You are the contextual AI assistant for this ActionOS workspace:\n\n${itemContext}\n\nUSER QUESTION: ${query}\n\nProvide a concise, direct, and factual answer grounded in this workspace. Format key action points with clean bullets.`,
        },
      ],
    },
  ];
}

// 4.6 POST /api/chat — Standard Contextual Chat
app.post('/api/chat', async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { item, messages, query } = req.body || {};

    if (!item || !query || typeof query !== 'string') {
      res.status(400).json({ success: false, error: 'Missing item or query parameter.' });
      return;
    }

    const contents = buildChatContents(item, messages, query);

    const response = await generateWithModelFallback((modelName) => ({
      model: modelName,
      contents,
      config: {
        systemInstruction:
          "You are ActionOS, an executive assistant grounded in the user's obligation workspace. Give clear, bulleted or direct answers without filler.",
      },
    }));

    res.status(200).json({
      success: true,
      reply: response.text?.trim() || 'No answer generated.',
    });
  } catch (err) {
    next(err);
  }
});

// 4.7 POST /api/chat/stream — Real-Time SSE Streaming Chat
app.post('/api/chat/stream', async (req: Request, res: Response): Promise<void> => {
  const { item, messages, query } = req.body || {};

  if (!item || !query || typeof query !== 'string') {
    res.status(400).json({ success: false, error: 'Missing item or query parameter.' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const ai = getAiClient();
    const contents = buildChatContents(item, messages, query);

    const stream = await ai.models.generateContentStream({
      model: 'gemini-3.8-flash',
      contents,
      config: {
        systemInstruction:
          "You are ActionOS, an executive assistant grounded in the user's obligation workspace. Give clear, bulleted or direct answers without filler.",
      },
    });

    for await (const chunk of stream) {
      const c = chunk as GenerateContentResponse;
      const textChunk = c.text;
      if (textChunk) {
        res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err: any) {
    logStructured('ERROR', 'chat_stream_error', { error: formatErrorMessage(err) });
    res.write(`data: ${JSON.stringify({ error: formatErrorMessage(err) })}\n\n`);
    res.end();
  }
});

// ============================================================================
// 5. SERVER-SIDE STATE SYNC & HEALTH ENDPOINTS
// ============================================================================
let serverItemsCache: any[] = [];

app.get('/api/items', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    items: serverItemsCache,
    syncedAt: new Date().toISOString(),
  });
});

app.post('/api/items/sync', (req: Request, res: Response) => {
  const { items } = req.body || {};
  if (!Array.isArray(items)) {
    res.status(400).json({ success: false, error: 'Expected items array for synchronization.' });
    return;
  }
  serverItemsCache = items;
  res.status(200).json({
    success: true,
    items: serverItemsCache,
    syncedAt: new Date().toISOString(),
  });
});

app.get('/api/health', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    status: 'ok',
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    time: new Date().toISOString(),
  });
});

// Centralized Error Handling Middleware
app.use('/api', (err: any, req: Request, res: Response, _next: NextFunction) => {
  const status = err?.status || 500;
  const formatted = formatErrorMessage(err);
  logStructured('ERROR', 'api_error', {
    path: req.originalUrl,
    status,
    message: formatted,
  });
  res.status(status).json({
    success: false,
    error: formatted,
  });
});

app.all('/api/*', (_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found.',
  });
});

// ============================================================================
// 6. VITE DEV MIDDLEWARE / STATIC PRODUCTION SERVER
// ============================================================================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    logStructured('INFO', 'server_started', { url: `http://0.0.0.0:${PORT}` });
  });
}

startServer().catch((err) => {
  logStructured('ERROR', 'server_boot_failed', { error: String(err) });
});
