import { validateResearchRelease, validateResearchResults } from "./validate.mjs";

export const RESEARCH_DOCUMENTS = ["technical.ko.md", "technical.en.md", "guide.ko.md", "guide.en.md"];
export const RESEARCH_CONTEXT_KEYS = ["version", "data_cutoff", "model_version", "dataset_sha256"];
export function canonicalResearch(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalResearch).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalResearch(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export class ResearchError extends Error {
  constructor(code, fields = []) { super(code); this.code = code; this.fields = fields; }
}

// Restricted YAML frontmatter: quoted strings only, no tags, aliases or executable MDX.
export function researchBody(text, release, file) {
  if (typeof text !== "string" || text.length > 100_000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw new ResearchError("research_document_invalid", [file]);
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text.replace(/\r\n/g,"\n"));
  if (!match) throw new ResearchError("research_frontmatter_invalid", [file]);
  const metadata = Object.create(null);
  for (const line of match[1].split("\n")) {
    const pair = /^([a-z][a-z0-9_]*): ("(?:[^"\\]|\\.)*")$/.exec(line);
    if (!pair || Object.hasOwn(metadata,pair[1])) throw new ResearchError("research_frontmatter_invalid", [file]);
    try { metadata[pair[1]] = JSON.parse(pair[2]); } catch { throw new ResearchError("research_frontmatter_invalid", [file]); }
  }
  const [audience,locale] = file.split(".");
  const expected = { ...Object.fromEntries(RESEARCH_CONTEXT_KEYS.map(key=>[key,release[key]])), results_sha256:release.results_sha256, audience, locale };
  if (canonicalResearch(metadata) !== canonicalResearch(expected)) throw new ResearchError("research_context_mismatch", [file]);
  const body = match[2];
  // This surface intentionally rejects HTML, MDX, images and dangerous link protocols.
  if (/<\/?[A-Za-z!]|\b(?:import|export)\s|!\[|\]\(\s*(?!https:\/\/|#)[^)]/i.test(body)) throw new ResearchError("research_unsafe_markdown", [file]);
  return body;
}

export function researchTemplate(release, file) {
  const [audience,locale] = file.split(".");
  const metadata = { ...Object.fromEntries(RESEARCH_CONTEXT_KEYS.map(key=>[key,release[key]])), results_sha256:release.results_sha256, audience, locale };
  return `---\n${Object.entries(metadata).map(([key,value])=>`${key}: ${JSON.stringify(value)}`).join("\n")}\n---\n`;
}

export function validateResearchBundle(release, documents, results, hash, { publishing = false } = {}) {
  const errors = [];
  if (!validateResearchRelease(release)) errors.push("metadata");
  if (!validateResearchResults(results)) errors.push("results");
  if (errors.length) throw new ResearchError("research_invalid",errors);
  if (RESEARCH_CONTEXT_KEYS.some(key=>release[key]!==results[key]) || hash(canonicalResearch(results))!==release.results_sha256) throw new ResearchError("research_results_mismatch",["results"]);
  if (!documents || Object.keys(documents).sort().join() !== [...RESEARCH_DOCUMENTS].sort().join()) throw new ResearchError("research_documents_missing",RESEARCH_DOCUMENTS);
  for (const file of RESEARCH_DOCUMENTS) {
    if (hash(documents[file])!==release.files[file]) errors.push(file);
    const body = researchBody(documents[file],release,file);
    // Numeric table cells must come from the single results source, including in translations.
    for (const line of body.split("\n").filter(line=>/^\s*\|/.test(line))) {
      const literal = line.replace(/\{\{[^}]+\}\}/g,"").replace(/\]\(https:\/\/[^)]+\)/g,"]");
      if (/(?:^|[^\p{L}\p{N}_])\d+(?:\.\d+)?/u.test(literal)) throw new ResearchError("research_table_literal_number",[file]);
    }
    for (const match of body.matchAll(/\{\{([^}]+)\}\}/g)) {
      if (match[1]!=="results" && (!match[1].startsWith("metrics.") || !Object.hasOwn(results.metrics,match[1].slice(8)))) errors.push(file);
    }
    if (publishing && !body.trim()) errors.push(file);
  }
  if (publishing) {
    for (const [key,value] of Object.entries(release.reviews)) if (value!==true) errors.push(`reviews.${key}`);
    if (!release.references.length) errors.push("references");
  }
  if (errors.length) throw new ResearchError("research_not_ready",[...new Set(errors)]);
  return true;
}

export function renderResearchMetrics(body, results) {
  return body.replace(/\{\{results\}\}/g,`\n\n\`\`\`json\n${JSON.stringify(results.metrics,null,2)}\n\`\`\`\n\n`)
    .replace(/\{\{metrics\.([a-z][a-z0-9_]*)\}\}/g,(_,key)=>results.metrics[key]===null?"null":String(results.metrics[key]));
}
