// Retrieval layer: chunk a resume, index it with BM25, and retrieve evidence for a job description.
// Pure JavaScript, no external services, so it runs anywhere and is easy to test.

const STOPWORDS = new Set(
  `a an and are as at be by for from has have in is it of on or that the to with we you your our will this
   their they experience years year work working team role strong ability knowledge using use skills skill
   required preferred plus good great etc must should looking join`.split(/\s+/)
);

// Technology vocabulary used to detect what a job description actually asks for.
// Each entry: canonical name -> aliases that may appear in text.
export const SKILLS = {
  "C#": ["c#", "csharp"],
  ".NET": [".net", "dotnet", "asp.net", ".net core"],
  "Entity Framework": ["entity framework", "ef core", "efcore"],
  "SQL Server": ["sql server", "mssql", "t-sql", "tsql"],
  PostgreSQL: ["postgresql", "postgres"],
  Redis: ["redis"],
  Angular: ["angular"],
  "React": ["react", "react.js", "reactjs"],
  "Next.js": ["next.js", "nextjs"],
  "Node.js": ["node.js", "nodejs", "node js", "express"],
  TypeScript: ["typescript"],
  JavaScript: ["javascript"],
  RxJS: ["rxjs"],
  Azure: ["azure"],
  "Azure DevOps": ["azure devops", "ado"],
  "CI/CD": ["ci/cd", "cicd", "github actions", "pipelines"],
  Docker: ["docker", "container"],
  Kubernetes: ["kubernetes", "k8s"],
  "REST APIs": ["rest", "restful", "web api"],
  Microservices: ["microservice", "microservices"],
  "Unit Testing": ["unit test", "unit testing", "xunit", "nunit", "jest", "vitest"],
  Agile: ["agile", "scrum"],
  LLM: ["llm", "large language model", "generative ai", "genai", "gpt", "claude"],
  "Prompt Engineering": ["prompt engineering", "prompt"],
  RAG: ["rag", "retrieval augmented", "retrieval-augmented"],
  Python: ["python"],
  Java: ["java", "spring boot", "spring"],
};

export function tokenize(text) {
  return (text.toLowerCase().match(/[a-z0-9#+.]+/g) ?? [])
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

/** Split a markdown resume into retrievable chunks, remembering the section heading. */
export function chunkResume(markdown) {
  const chunks = [];
  let section = "Summary";
  for (const raw of markdown.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const heading = line.match(/^#{1,3}\s+(.*)$/);
    if (heading) {
      section = heading[1];
      continue;
    }
    chunks.push({ id: chunks.length, section, text: line.replace(/^[-*]\s+/, "") });
  }
  return chunks;
}

/** Minimal BM25 index. */
export class Bm25Index {
  constructor(chunks, { k1 = 1.4, b = 0.75 } = {}) {
    this.chunks = chunks;
    this.k1 = k1;
    this.b = b;
    this.docs = chunks.map((c) => tokenize(`${c.section} ${c.text}`));
    this.avgLen = this.docs.reduce((s, d) => s + d.length, 0) / Math.max(this.docs.length, 1);
    this.df = new Map();
    for (const doc of this.docs) {
      for (const term of new Set(doc)) this.df.set(term, (this.df.get(term) ?? 0) + 1);
    }
  }

  idf(term) {
    const n = this.docs.length;
    const df = this.df.get(term) ?? 0;
    return Math.log(1 + (n - df + 0.5) / (df + 0.5));
  }

  search(query, k = 3) {
    const terms = tokenize(query);
    const scored = this.docs.map((doc, i) => {
      const len = doc.length;
      let score = 0;
      for (const term of new Set(terms)) {
        const tf = doc.filter((t) => t === term).length;
        if (!tf) continue;
        score +=
          this.idf(term) * ((tf * (this.k1 + 1)) / (tf + this.k1 * (1 - this.b + (this.b * len) / this.avgLen)));
      }
      return { chunk: this.chunks[i], score };
    });
    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}

function mentions(text, aliases) {
  const hay = ` ${text.toLowerCase()} `;
  return aliases.some((a) => {
    const escaped = a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, "i").test(hay);
  });
}

/** Which known skills does the job description ask for? */
export function requiredSkills(jd) {
  return Object.entries(SKILLS)
    .filter(([, aliases]) => mentions(jd, aliases))
    .map(([name]) => name);
}

/** Core retrieval step: for each required skill, find resume evidence (or flag a gap). */
export function analyze(jd, resumeMarkdown) {
  const chunks = chunkResume(resumeMarkdown);
  const index = new Bm25Index(chunks);
  const required = requiredSkills(jd);

  const matched = [];
  const gaps = [];
  for (const skill of required) {
    const aliases = SKILLS[skill];
    const evidence = chunks.filter((c) => mentions(c.text, aliases));
    if (evidence.length) {
      matched.push({
        skill,
        evidence: evidence.slice(0, 2).map((c) => ({ section: c.section, text: c.text })),
      });
    } else {
      gaps.push(skill);
    }
  }

  const score = required.length ? Math.round((matched.length / required.length) * 100) : 0;
  const topChunks = index
    .search(jd, 5)
    .map(({ chunk, score: s }) => ({ section: chunk.section, text: chunk.text, relevance: +s.toFixed(2) }));

  return { score, required, matched, gaps, topChunks };
}
