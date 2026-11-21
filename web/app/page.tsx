"use client";

import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Evidence = { section: string; text: string };
type MatchResult = {
  score: number;
  required: string[];
  matched: { skill: string; evidence: Evidence[] }[];
  gaps: string[];
  mode: "llm" | "offline";
  feedback: {
    summary: string;
    strengths: string[];
    gaps: string[];
    resume_tweaks: string[];
  };
};

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
  const [result, setResult] = useState<MatchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function analyze() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/match`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jd }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      setResult(data);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <h1>JD Match RAG</h1>
      <p className="lede">
        Paste a job description. The API retrieves evidence from the resume with BM25, then asks an LLM for grounded
        feedback. No evidence means a gap, never an invention.
      </p>

      <textarea
        value={jd}
        onChange={(e) => setJd(e.target.value)}
        placeholder="Paste the job description here..."
        rows={10}
        aria-label="Job description"
      />
      <button onClick={analyze} disabled={loading || jd.trim().length < 40}>
        {loading ? "Analyzing..." : "Analyze match"}
      </button>
      {error && <p className="error">{error}</p>}

      {result && (
        <div className="results">
          <section className="card score">
            <div className="ring" aria-label={`Match score ${result.score} percent`}>
              {result.score}%
            </div>
            <div>
              <h3>Overall match</h3>
              <p>{result.feedback.summary}</p>
              <small>Mode: {result.mode === "llm" ? "LLM feedback" : "offline (no API key)"}</small>
            </div>
          </section>

          <section className="card">
            <h3>Skills detected in the job description</h3>
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
            </div>
          </section>

          <List title="Strengths" items={result.feedback.strengths} />
          <List title="Gaps" items={result.feedback.gaps} />
          <List title="Resume tweaks" items={result.feedback.resume_tweaks} />
        </div>
      )}
    </main>
  );
}
