"use client";

import { useEffect, useState } from "react";

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000").replace(/\/$/, "");

const SAMPLE_JD = `Senior Full Stack Engineer (Pune)
We are looking for a senior engineer with 5+ years of experience in .NET, C# and Angular, building REST APIs on Azure.
You will use Azure DevOps and CI/CD pipelines, work with SQL Server and Redis, and mentor a small team.
Nice to have: React, Next.js, Node.js, Kubernetes, and experience with LLMs, RAG and prompt engineering.`;

type Evidence = { section: string; text: string };
type MatchResult = {
  score: number;
  required: string[];
  matched: { skill: string; evidence: Evidence[] }[];
  gaps: string[];
  mode: "llm" | "offline";
  feedback: { summary: string; strengths: string[]; gaps: string[]; resume_tweaks: string[] };
};

type Opening = { id: string; title: string; company: string; jd: string };
type BatchRow = {
  id: string;
  title: string;
  company: string;
  score: number;
  matches: boolean;
  matched: string[];
  gaps: string[];
};
const STORAGE_KEY = "jd-match-openings";
const EMPTY_OPENING = { title: "", company: "", jd: "" };

function ScoreRing({ score }: { score: number }) {
  const r = 40;
  const c = 2 * Math.PI * r;
  const tone = score >= 75 ? "good" : score >= 50 ? "mid" : "low";
  return (
    <svg className={`ring ${tone}`} viewBox="0 0 100 100" role="img" aria-label={`Match score ${score} percent`}>
      <circle cx="50" cy="50" r={r} className="ring-bg" />
      <circle
        cx="50"
        cy="50"
        r={r}
        className="ring-fg"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - score / 100)}
        transform="rotate(-90 50 50)"
      />
      <text x="50" y="56" textAnchor="middle" className="ring-text">
        {score}%
      </text>
    </svg>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  if (!items?.length) return null;
  return (
    <section className="card">
      <h3>{title}</h3>
      <ul>
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </section>
  );
}

export default function Home() {
  const [jd, setJd] = useState("");
  const [resume, setResume] = useState("");
  const [useOwn, setUseOwn] = useState(false);
  const [result, setResult] = useState<MatchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [openings, setOpenings] = useState<Opening[]>([]);
  const [draft, setDraft] = useState(EMPTY_OPENING);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [batch, setBatch] = useState<{ threshold: number; results: BatchRow[] } | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);

  // Openings live in this browser only (localStorage), so there is no account or database.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setOpenings(JSON.parse(raw));
    } catch {}
  }, []);
  function persist(next: Opening[]) {
    setOpenings(next);
    setBatch(null);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }
  const canSaveOpening = draft.title.trim().length > 0 && draft.jd.trim().length >= 40;
  function saveOpening() {
    if (!canSaveOpening) return;
    const clean = { title: draft.title.trim(), company: draft.company.trim(), jd: draft.jd.trim() };
    if (editingId) {
      persist(openings.map((o) => (o.id === editingId ? { ...o, ...clean } : o)));
    } else {
      persist([...openings, { id: crypto.randomUUID(), ...clean }]);
    }
    setDraft(EMPTY_OPENING);
    setEditingId(null);
  }
  function editOpening(o: Opening) {
    setEditingId(o.id);
    setDraft({ title: o.title, company: o.company, jd: o.jd });
  }
  async function compareAll() {
    setBatchLoading(true);
    setBatchError(null);
    try {
      const res = await fetch(`${API_URL}/api/match-batch`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobs: openings, ...(useOwn && resume.trim() ? { resume } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setBatch(data);
    } catch (e) {
      setBatch(null);
      setBatchError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBatchLoading(false);
    }
  }

  async function analyze() {
    setLoading(true);
    setSlow(false);
    setError(null);
    // Free-tier hosts sleep when idle; tell the user why the first request can take a while.
    const slowTimer = setTimeout(() => setSlow(true), 4000);
    try {
      const res = await fetch(`${API_URL}/api/match`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jd, ...(useOwn && resume.trim() ? { resume } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setResult(data);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      clearTimeout(slowTimer);
      setLoading(false);
      setSlow(false);
    }
  }

  const canAnalyze = !loading && jd.trim().length >= 40 && (!useOwn || resume.trim().length >= 50);

  return (
    <main>
      <header className="hero">
        <span className="badge">RAG demo</span>
        <h1>JD Match RAG</h1>
        <p className="lede">
          Paste a job description and see how a resume matches. The API retrieves evidence from the resume with BM25,
          then builds a grounded prompt for LLM feedback. No evidence means a gap, never an invention.
        </p>
      </header>

      <section className="panel">
        <div className="row">
          <label htmlFor="jd">Job description</label>
          <button type="button" className="link" onClick={() => setJd(SAMPLE_JD)}>
            Use a sample
          </button>
        </div>
        <textarea
          id="jd"
          value={jd}
          onChange={(e) => setJd(e.target.value)}
          placeholder="Paste the job description here (at least 40 characters)..."
          rows={8}
        />

        <label className="check">
          <input type="checkbox" checked={useOwn} onChange={(e) => setUseOwn(e.target.checked)} />
          Match against my own resume instead of the sample resume
        </label>
        {useOwn && (
          <>
            <textarea
              value={resume}
              onChange={(e) => setResume(e.target.value)}
              placeholder={"Paste your resume as plain text. Use '# Section' lines for headings if you can.\nYour text is sent only to this API for this request and is not stored."}
              rows={8}
              aria-label="Your resume"
            />
          </>
        )}

        <button className="primary" onClick={analyze} disabled={!canAnalyze}>
          {loading ? "Analyzing..." : "Analyze match"}
        </button>
        {slow && <p className="hint">Waking up the free-tier server, the first request can take up to a minute...</p>}
        {error && <p className="error">{error}</p>}
      </section>

      <section className="panel openings">
        <h2>My openings</h2>
        <p className="hint">
          Save the jobs you are tracking (kept in this browser only), then compare them all against the resume in one go.
        </p>
        <div className="grid2">
          <input
            aria-label="Job title"
            placeholder="Job title, e.g. Senior .NET Engineer"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
          <input
            aria-label="Company"
            placeholder="Company (optional)"
            value={draft.company}
            onChange={(e) => setDraft({ ...draft, company: e.target.value })}
          />
        </div>
        <textarea
          aria-label="Opening job description"
          placeholder="Paste the job description (at least 40 characters)..."
          rows={5}
          value={draft.jd}
          onChange={(e) => setDraft({ ...draft, jd: e.target.value })}
        />
        <div className="actions">
          <button className="primary" onClick={saveOpening} disabled={!canSaveOpening}>
            {editingId ? "Update opening" : "Add opening"}
          </button>
          {editingId && (
            <button
              className="link"
              onClick={() => {
                setEditingId(null);
                setDraft(EMPTY_OPENING);
              }}
            >
              Cancel edit
            </button>
          )}
        </div>

        {openings.length > 0 && (
          <ul className="opening-list">
            {openings.map((o) => (
              <li key={o.id}>
                <span>
                  <strong>{o.title}</strong>
                  {o.company && <span className="muted"> · {o.company}</span>}
                </span>
                <span className="actions">
                  <button className="link" onClick={() => editOpening(o)}>
                    Edit
                  </button>
                  <button className="link danger" onClick={() => persist(openings.filter((x) => x.id !== o.id))}>
                    Delete
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        <button className="primary" onClick={compareAll} disabled={batchLoading || openings.length === 0}>
          {batchLoading ? "Comparing..." : `Compare all (${openings.length})`}
        </button>
        {batchError && <p className="error">{batchError}</p>}

        {batch && (
          <div className="batch">
            <p className="hint">Ranked by match. Green means {batch.threshold}% or higher.</p>
            {batch.results.map((r) => (
              <article key={r.id} className={`batch-row ${r.matches ? "yes" : "no"}`}>
                <div className="row">
                  <strong>
                    {r.title}
                    {r.company && <span className="muted"> · {r.company}</span>}
                  </strong>
                  <span className={`pill ${r.matches ? "yes" : "no"}`}>
                    {r.score}% {r.matches ? "match" : "weak match"}
                  </span>
                </div>
                {r.gaps.length > 0 && <small className="muted">Gaps: {r.gaps.join(", ")}</small>}
              </article>
            ))}
          </div>
        )}
      </section>

      {result && (
        <div className="results">
          <section className="card score">
            <ScoreRing score={result.score} />
            <div>
              <h3>Overall match</h3>
              <p>{result.feedback.summary}</p>
              <small>{result.mode === "llm" ? "LLM feedback" : "Offline mode: rule-based feedback, no LLM"}</small>
            </div>
          </section>

          <section className="card">
            <h3>Skills in the job description</h3>
            <div className="chips">
              {result.matched.map((m) => (
                <span key={m.skill} className="chip ok" title={m.evidence[0]?.text}>
                  {m.skill}
                </span>
              ))}
              {result.gaps.map((g) => (
                <span key={g} className="chip gap">
                  {g}
                </span>
              ))}
              {!result.required.length && <span className="muted">No known skills detected in this description.</span>}
            </div>
            <p className="legend">Green: evidence found in the resume. Red: gap.</p>
          </section>

          {result.matched.length > 0 && (
            <section className="card">
              <h3>Retrieved evidence</h3>
              {result.matched.map((m) => (
                <details key={m.skill}>
                  <summary>{m.skill}</summary>
                  <ul>
                    {m.evidence.map((e, i) => (
                      <li key={i}>
                        <em>{e.section}</em>: {e.text}
                      </li>
                    ))}
                  </ul>
                </details>
              ))}
            </section>
          )}

          <List title="Strengths" items={result.feedback.strengths} />
          <List title="Gaps" items={result.feedback.gaps} />
          <List title="Resume tweaks" items={result.feedback.resume_tweaks} />
        </div>
      )}

      <footer>
        <a href="https://github.com/sjdhkar/jd-match-rag" target="_blank" rel="noreferrer">
          Source on GitHub
        </a>
        <span> · Next.js, React, Node.js, BM25 retrieval, grounded prompts</span>
      </footer>
    </main>
  );
}
