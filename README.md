# ResumeFitCheck — AI Resume ↔ Job Match Engine

## What it is
A web tool that takes your résumé and a target job description, and uses Claude (Anthropic's AI model) to tell you how well you match — with a score, gap analysis, and concrete rewrite suggestions.

## The problem it solves
Most people apply to jobs blind, without knowing if their résumé actually matches what an ATS (Applicant Tracking System) or recruiter is scanning for. This tool simulates that screening process before you hit "apply."

## How it works
1. User pastes their résumé and a job description into two text panels.
2. On clicking **Run match analysis**, the app sends both texts to the Claude API with a structured prompt.
3. Claude returns a JSON object containing:
   - A **match score** (0–100)
   - A one-line **verdict**
   - **Matched keywords** (skills already present in both)
   - **Missing keywords** (skills the JD wants but the résumé lacks)
   - **Weak bullet rewrites** (before/after résumé lines)
   - **Top 3 priority actions** to improve fit
4. The app renders this as a visual dashboard — score dial, keyword chips, rewrite cards, and an action list.
5. Every run is **saved automatically** to persistent storage, building a history of attempts.

## Key features
- **PDF & Word upload** — drop in your résumé as a `.pdf` or `.docx` and it's parsed to text automatically (via pdf.js / mammoth.js). Any other file type (or legacy `.doc`) shows a clear error instead of failing silently
- **Live AI analysis** — real Claude API call, not a static template
- **Persistent history** — past runs are saved and never lost on refresh
- **Score trend chart** — visualizes improvement across multiple attempts (e.g. tracking edits to the same résumé against the same JD)
- **Run labeling** — tag each attempt (e.g. "Microsoft SWE — Draft 2") to compare versions
- **Delete/manage runs** — clean up old history entries

## Tech stack
| Layer | Technology |
|---|---|
| Frontend | React (single-file component) |
| Styling | Custom CSS-in-JS, no framework |
| AI | Claude API (`claude-sonnet-4-6`) via direct HTTPS call |
| Data viz | Recharts (score trend line chart) |
| Icons | Lucide React |
| Persistence | Key-value storage API (per-user, survives sessions) |
| Output format | Structured JSON (strict schema enforced via system prompt) |

## Design approach
Dark, dossier/document-inspired visual theme (deep navy background, warm gold accent) instead of generic light-mode defaults — meant to evoke a recruiter's screening report rather than a typical SaaS dashboard.

## Current limitations
- No user authentication — storage is scoped to the browser session, not a real account system
- No backend server or database — runs entirely client-side plus the storage API
- Not yet deployed to a live public URL
- **Important for deployment:** this project was originally built inside Claude's artifact sandbox, which provides a built-in `window.storage` API and a proxied Claude API call with no exposed key. Outside that sandbox (e.g. deployed on Vercel), you'll need to: (1) replace `window.storage` calls with a real database (Supabase, Firebase, etc.), and (2) route the Anthropic API call through your own backend so your API key isn't exposed in client-side code. See `.env.example`.

## Possible next steps
- Deploy to a live URL (Vercel/Netlify)
- Add authentication for multi-device history sync
- Export analysis results as PDF for offline review
- Batch mode: test one résumé against multiple job descriptions at once

## Why this project matters for a résumé
It demonstrates practical LLM integration (prompt design, structured JSON output, error handling), frontend engineering (state management, data visualization, persistence), and product thinking (solving a real, relatable problem — not just a tech demo).
