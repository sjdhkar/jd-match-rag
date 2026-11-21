import express from "express";
import cors from "cors";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { analyze } from "./rag.js";
import { generateFeedback } from "./llm.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const resume = readFileSync(process.env.RESUME_PATH ?? join(__dirname, "../data/resume.md"), "utf8");

export const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN ?? "*" }));
app.use(express.json({ limit: "100kb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.post("/api/match", async (req, res) => {
  const jd = typeof req.body?.jd === "string" ? req.body.jd.trim() : "";
  if (jd.length < 40) {
    return res.status(400).json({ error: "Paste a job description of at least 40 characters." });
  }
  const analysis = analyze(jd, resume);
  const { mode, feedback } = await generateFeedback(jd, analysis);
  res.json({ ...analysis, mode, feedback });
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 4000);
  app.listen(port, () => console.log(`jd-match-api listening on :${port}`));
}
