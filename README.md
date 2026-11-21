# JD Match RAG

Paste a job description and see how a resume matches it. The API **retrieves evidence from the resume** (BM25) and asks an LLM for **grounded, prompt-engineered feedback**. If a skill has no evidence, it is reported as a gap and never invented.

Built to practise a modern JavaScript stack: **React, Next.js, Node.js, TypeScript**, plus **RAG and prompt engineering**.

## How it works

```
Next.js (React, TypeScript)  ->  Node.js / Express API
                                   1. Detect required skills in the JD
                                   2. Chunk the resume, index with BM25
                                   3. Retrieve evidence per skill (or flag a gap)
                                   4. Build a grounded prompt  ->  LLM (optional)
                                   5. Return score, evidence and feedback as JSON
```

- **Retrieval** (`api/src/rag.js`): resume chunking, a small BM25 implementation, skill detection with word-boundary matching.
- **Prompt engineering** (`api/src/prompts.js`): system rules against fabrication, evidence-only context, strict JSON output contract.
- **LLM layer** (`api/src/llm.js`): calls the Anthropic Messages API when `ANTHROPIC_API_KEY` is set, otherwise falls back to deterministic offline feedback so the app always works.
- **Frontend** (`web/`): Next.js App Router page with a score, matched and missing skills, and feedback lists.

## Run locally

Requires Node.js 20+.

```bash
# 1. API
cd api
npm install
npm test                      # unit tests (node:test)
npm start                     # http://localhost:4000

# 2. Web (new terminal)
cd web
npm install
npm run dev                   # http://localhost:3000
```

Optional environment variables:

| Variable | Where | Purpose |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | api | Enables LLM feedback (otherwise offline mode) |
| `ANTHROPIC_MODEL` | api | Model name (default `claude-sonnet-5-5`) |
| `RESUME_PATH` | api | Path to your own resume in markdown |
| `CORS_ORIGIN` | api | Allowed origin (default `*`) |
| `NEXT_PUBLIC_API_URL` | web | API base URL (default `http://localhost:4000`) |

To use your own resume, replace `api/data/resume.md` (markdown, `#` headings per section).

## API

`POST /api/match` with `{ "jd": "<job description>" }` returns:

```json
{
  "score": 90,
  "required": [".NET", "React", "..."],
  "matched": [{ "skill": ".NET", "evidence": [{ "section": "...", "text": "..." }] }],
  "gaps": ["Kubernetes"],
  "mode": "offline",
  "feedback": { "summary": "...", "strengths": [], "gaps": [], "resume_tweaks": [] }
}
```

### Compare several openings

`POST /api/match-batch` with `{ "jobs": [{ "id", "title", "company", "jd" }] }` (up to 10) returns each opening's score, matched skills and gaps, ranked best first, with `matches: true` at 70% or higher. In the UI, save openings under **My openings** (stored in your browser) and press **Compare all**.

## Tests and CI

`npm test` in `api/` covers chunking, skill detection, BM25 ranking, scoring and the offline fallback. GitHub Actions (`.github/workflows/ci.yml`) runs the API tests and the web typecheck and build on every push.

## Deploy (free tier)

**Live demo:** web https://jd-match-rag.vercel.app, API https://jd-match-api.vercel.app (both on Vercel's free tier).

**API on Render** (optional alternative, Blueprint included): New > Blueprint, pick this repo, apply. The API is then at `https://jd-match-api.onrender.com`. Do not set `ANTHROPIC_API_KEY` on a public demo unless you accept the usage cost; offline mode works without it.

**Web on Vercel**: New Project, import this repo, set **Root Directory** to `web`, add the environment variable `NEXT_PUBLIC_API_URL` set to the Render API URL, deploy.

Optionally lock the API to your site by setting `CORS_ORIGIN` to the Vercel URL on Render. The API also rate-limits each IP (30 requests per 10 minutes).

## Roadmap

- Replace BM25 with embeddings for semantic retrieval
- Upload a resume PDF in the UI
- Move the API to Azure App Service
- Sync saved openings to a database instead of browser storage
