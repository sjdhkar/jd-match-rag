import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyze, chunkResume, requiredSkills, Bm25Index } from "../src/rag.js";
import { offlineFeedback } from "../src/llm.js";

const resume = readFileSync(new URL("../data/resume.md", import.meta.url), "utf8");

test("chunkResume keeps section headings", () => {
  const chunks = chunkResume("# Skills\nC#, Azure\n# Education\nB.E.");
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].section, "Skills");
  assert.equal(chunks[1].section, "Education");
});

test("requiredSkills detects skills with word boundaries", () => {
  const skills = requiredSkills("We need React, Node.js and .NET experience. Java is a plus.");
  assert.ok(skills.includes("React"));
  assert.ok(skills.includes("Node.js"));
  assert.ok(skills.includes(".NET"));
  assert.ok(!skills.includes("JavaScript"));
});

test("BM25 ranks the most relevant chunk first", () => {
  const index = new Bm25Index(chunkResume(resume));
  const [top] = index.search("Entity Framework Core SQL Server backend");
  assert.match(top.chunk.text, /Entity Framework/);
});

test("analyze scores matches and flags gaps", () => {
  const out = analyze("Looking for .NET, Angular, Kubernetes and Azure engineers", resume);
  assert.ok(out.matched.some((m) => m.skill === ".NET"));
  assert.deepEqual(out.gaps, ["Kubernetes"]);
  assert.equal(out.score, 75);
});

test("offline feedback never invents skills", () => {
  const analysis = analyze("Rust and Go services on Azure", resume);
  const fb = offlineFeedback(analysis);
  assert.ok(Array.isArray(fb.strengths));
  assert.ok(!JSON.stringify(fb).includes("Rust"));
});
