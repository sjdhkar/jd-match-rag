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

  let resume = defaultResume;
  if (typeof req.body?.resume === "string" && req.body.resume.trim()) {
    resume = req.body.resume.trim();
    if (resume.length < 50 || resume.length > 20000) {
      return res.status(400).json({ error: "Resume must be between 50 and 20000 characters." });
    }
  }

  const analysis = analyze(jd, resume);
  const { mode, feedback } = await generateFeedback(jd, analysis);
  res.json({ ...analysis, mode, feedback });
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 4000);
  app.listen(port, () => console.log(`jd-match-api listening on :${port}`));
}
