import { SYSTEM_PROMPT, buildUserPrompt } from "./prompts.js";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";

/** Deterministic feedback used when no API key is configured, so the app always works. */
export function offlineFeedback(analysis) {
  const { score, matched, gaps } = analysis;
  return {
    summary: `Matched ${matched.length} of ${analysis.required.length} detected skills (${score}%). Running in offline mode without an LLM.`,
    strengths: matched.slice(0, 3).map((m) => `${m.skill}: ${m.evidence[0].text}`),
    gaps: gaps.map((g) => `${g}: no evidence in the resume. Add it only if you have genuinely used it.`),
    resume_tweaks: gaps.length
      ? ["Mirror the job description's wording for skills you do have.", "Add a project bullet for any gap you have real experience in."]
      : ["Lead with the strongest matched skills near the top of the resume."],
  };
}

/** Calls the Anthropic Messages API when ANTHROPIC_API_KEY is set; otherwise returns offline feedback. */
export async function generateFeedback(jd, analysis) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { mode: "offline", feedback: offlineFeedback(analysis) };

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 800,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserPrompt(jd, analysis) }],
      }),
    });
    if (!res.ok) throw new Error(`LLM request failed: ${res.status}`);
    const data = await res.json();
    const text = data.content?.[0]?.text ?? "";
    const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    return { mode: "llm", feedback: JSON.parse(json) };
  } catch (err) {
    console.error(err.message);
    return { mode: "offline", feedback: offlineFeedback(analysis) };
  }
}
