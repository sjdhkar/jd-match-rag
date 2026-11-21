import express from "express";
import cors from "cors";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { analyze } from "./rag.js";
import { generateFeedback } from "./llm.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const defaultResume = readFileSync(process.env.RESUME_PATH ?? join(__dirname, "../data/resume.md"), "utf8");

const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = Number(process.env.RATE_LIMIT ?? 30);

/** Tiny in-memory rate limiter (per IP) so a public demo cannot be abused. */
function rateLimit() {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip ?? "unknown";
    const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
    if (recent.length >= MAX_REQUESTS) {
      return res.status(429).json({ error: "Too many requests. Please try again in a few minutes." });
    }
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}

function pickResume(custom) {
  if (typeof custom === "string" && custom.trim()) {
    const text = custom.trim();
    if (text.length < 50 || text.length > 20000) return { error: "Resume must be between 50 and 20000 characters." };
    return { text };
  }
  return { text: defaultResume };
}

export const app = express();
app.set("trust proxy", 1);
app.use(cors({ origin: process.env.CORS_ORIGIN ?? "*" }));
app.use(express.json({ limit: "100kb" }));

app.get("/", (_req, res) => res.json({ name: "jd-match-api", docs: "POST /api/match" }));
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/api/resume", (_req, res) => res.json({ resume: defaultResume }));

app.post("/api/match", rateLimit(), async (req, res) => {
  const jd = typeof req.body?.jd === "string" ? req.body.jd.trim() : "";
  if (jd.length < 40) {
    return res.status(400).json({ error: "Paste a job description of at least 40 characters." });
  }
  if (jd.length > 8000) {
    return res.status(400).json({ error: "Job description is too long (8000 characters max)." });
  }

  const resume = pickResume(req.body?.resume);
  if (resume.error) return res.status(400).json({ error: resume.error });

  const analysis = analyze(jd, resume.text);
  const { mode, feedback } = await generateFeedback(jd, analysis);
  res.json({ ...analysis, mode, feedback });
});

const MAX_JOBS = 10;
const MATCH_THRESHOLD = 70;

/**
 * Score several saved openings against one resume and rank them.
 * Rule-based only (no LLM call per job) so a batch stays fast and free.
 */
app.post("/api/match-batch", rateLimit(), (req, res) => {
  const jobs = req.body?.jobs;
  if (!Array.isArray(jobs) || jobs.length === 0) {
    return res.status(400).json({ error: "Add at least one opening." });
  }
  if (jobs.length > MAX_JOBS) {
    return res.status(400).json({ error: `Compare up to ${MAX_JOBS} openings at a time.` });
  }
  const resume = pickResume(req.body?.resume);
  if (resume.error) return res.status(400).json({ error: resume.error });

  const results = [];
  for (const [i, job] of jobs.entries()) {
    const jd = typeof job?.jd === "string" ? job.jd.trim() : "";
    if (jd.length < 40 || jd.length > 8000) {
      return res.status(400).json({ error: `Opening ${i + 1}: description must be 40 to 8000 characters.` });
    }
    const a = analyze(jd, resume.text);
    results.push({
      id: String(job.id ?? i),
      title: String(job.title ?? "").slice(0, 120),
      company: String(job.company ?? "").slice(0, 120),
      score: a.score,
      matches: a.score >= MATCH_THRESHOLD,
      required: a.required,
      matched: a.matched.map((m) => m.skill),
      gaps: a.gaps,
    });
  }
  results.sort((x, y) => y.score - x.score);
  res.json({ threshold: MATCH_THRESHOLD, results });
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 4000);
  app.listen(port, () => console.log(`jd-match-api listening on :${port}`));
}

// Vercel serverless entry point
export default app;
