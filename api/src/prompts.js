// Prompt engineering: the prompt is built from retrieved evidence only (grounding),
// with explicit rules against fabrication and a strict JSON output contract.

export const SYSTEM_PROMPT = `You are a precise technical recruiter assistant.
Rules:
1. Use ONLY the resume evidence provided. Never invent employers, projects, years or skills.
2. If a required skill has no evidence, say so plainly and suggest an honest way to close the gap.
3. Be concise and concrete. No flattery.
4. Reply with a single JSON object and nothing else.`;

export function buildUserPrompt(jd, analysis) {
  const matched = analysis.matched
    .map((m) => `- ${m.skill}: ${m.evidence.map((e) => `[${e.section}] ${e.text}`).join(" | ")}`)
    .join("\n");
  const gaps = analysis.gaps.length ? analysis.gaps.join(", ") : "none";

  return `JOB DESCRIPTION
"""
${jd.slice(0, 4000)}
"""

RESUME EVIDENCE (retrieved)
${matched || "- none"}

SKILLS WITH NO EVIDENCE
${gaps}

Return JSON with exactly these keys:
{
  "summary": "2 sentences on overall fit",
  "strengths": ["up to 3 strengths, each citing the evidence"],
  "gaps": ["each gap with one honest suggestion"],
  "resume_tweaks": ["up to 3 truthful edits that would improve alignment"]
}`;
}
