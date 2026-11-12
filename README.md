# ActionOS — From Information to Action

ActionOS is a full-stack AI execution workspace built with **React 19**, **TypeScript**, **Tailwind CSS v4**, **Express**, and the official **Google Gen AI SDK (`@google/genai`)**. It transforms unstructured announcements, screenshots, PDFs, and high-level goals into structured action plans with deadlines, prerequisite document tracking, time-estimated sub-steps, and next-step intelligence.

---

## Key Capabilities

1. **Multimodal Obligation Ingestion (`/api/extract`)**
   - Ingests raw text notices, screenshots (`PNG`/`JPG`/`WEBP`), or `PDF` documents.
   - Uses strict JSON Structured Outputs (`responseSchema`) with `gemini-3.8-flash` (and automatic multi-model fallback to `gemini-3.1-flash-lite`) to extract deadlines, ambiguity flags, document prerequisites, sequential tasks, and semantic tags.
2. **AI Action & Sub-Step Decomposer (`/api/decompose` & `/api/decompose-task`)**
   - Breaks down high-level goals or individual complex milestones into concrete, time-estimated `SubStep` checklists (`estimatedMinutes` + `suggestedAction` tips).
3. **Natural-Language Command Bar (`Cmd+K` / `Ctrl+K` — `/api/command`)**
   - Keyboard-first command palette supporting fuzzy search across titles, tags, categories, and statuses.
   - Executes natural-language commands directly (e.g., *"Create a high-priority launch checklist due Friday"*, *"Summarize my blocked actions"*, *"Show urgent items"*).
4. **Real-Time Streaming Contextual Assistant (`/api/chat/stream`)**
   - Server-Sent Events (SSE) token streaming grounded exclusively in the active workspace's tasks, sub-steps, and requirements.
5. **Resilient State Sync & Portability**
   - Runtime schema validation, automatic `v1 -> v2` local storage migration, optimistic UI mutations with undo/rollback, and 1-click **Markdown (`.md`)** and **JSON (`.json`)** export/import.

---

## Project Architecture

```text
├── server.ts                         # Express API server, rate limiter, structured logger & Gemini routes
├── src/
│   ├── types/action.ts               # Core TypeScript domain models & API contracts
│   ├── utils/
│   │   ├── api.ts                    # Resilient fetch client, timeout/retry wrapper & SSE stream reader
│   │   ├── storage.ts                # Runtime schema sanitizer, local/server sync & MD/JSON portability
│   │   └── demoData.ts               # Default onboarding obligations
│   ├── components/
│   │   ├── Header.tsx                # 3-zone top bar with breadcrumbs & Cmd+K trigger
│   │   ├── Sidebar.tsx               # Sticky desktop sidebar & mobile drawer navigation
│   │   ├── DashboardOverview.tsx     # Executive KPIs, Next Move panel, multi-axis filter & sort bar
│   │   ├── ActionCard.tsx            # Workspace card with inline task completion & priority cycling
│   │   ├── ItemDetailView.tsx        # Inline editor, AI Decomposer, sub-steps, logs & streaming chat
│   │   ├── NewActionModal.tsx        # Multimodal ingestion & AI Goal Decomposer modal
│   │   └── CommandPaletteModal.tsx   # Keyboard-first fuzzy launcher & NL command router
│   ├── App.tsx                       # Root state orchestrator & optimistic mutation handler
│   └── index.css                     # Tailwind v4 styles, focus-visible rings & reduced-motion rules
└── .env.example                      # Environment variable template
```

---

## Getting Started Locally

### 1. Prerequisites
- **Node.js** `>= 20.x` (Node `22.x` recommended)
- A **Google Gemini API Key**

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env` and add your Gemini API key:
```bash
cp .env.example .env
```
Edit `.env`:
```env
GEMINI_API_KEY="your_actual_gemini_api_key_here"
PORT="3000"
```

### 4. Run the Development Server
```bash
npm run dev
```
Open `http://localhost:3000` in your browser.

### 5. Type-Check & Production Build
```bash
npm run lint
npm run build
```
