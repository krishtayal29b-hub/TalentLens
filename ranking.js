// ── ranking.js ───────────────────────────────────────────────
// Client-side, deterministic, feature-based candidate ranker.
// Mirrors the offline rank.py pipeline used to score the full
// 100K-candidate Redrob dataset. No network calls, no LLM calls —
// runs entirely in the browser so this page can act as the
// "sandbox" that reproduces ranking on a small candidate sample.

const RANK_TERMS = {
  embedding: [
    "sentence-transformers", "sentence transformers", "openai embedding",
    "text-embedding", "bge", "e5 embedding", "bge-large", "cohere embed",
    "embedding model", "dense retrieval", "dense embeddings",
  ],
  vectorDb: [
    "pinecone", "weaviate", "qdrant", "milvus", "opensearch",
    "elasticsearch", "faiss", "vespa", "vector database", "vector db",
    "vector search", "hybrid search", "ann search", "hnsw",
  ],
  rankingEval: [
    "ndcg", "mrr", "map@", "mean average precision", "learning to rank",
    "learning-to-rank", "ltr", "precision@", "recall@", "a/b test",
    "offline eval", "online eval", "eval framework", "evaluation framework",
    "ranking model", "re-ranking", "reranking", "rerank",
  ],
  llmFt: ["lora", "qlora", "peft", "fine-tuning", "fine tuning", "finetune", "rlhf", "instruction tuning"],
  langchainOnly: ["langchain", "llamaindex", "llama-index"],
  production: [
    "production", "deployed", "shipped", "scale", "real users", "real-time",
    "live traffic", "in production", "rolled out", "launched",
  ],
  researchOnly: ["research lab", "academic", "phd thesis", "publication", "postdoc", "research scientist", "research intern"],
  consultingFirms: [
    "tcs", "tata consultancy", "infosys", "wipro", "accenture", "cognizant",
    "capgemini", "hcl", "tech mahindra", "mindtree", "l&t infotech", "mphasis", "genpact",
  ],
  disqualifyingTitles: [
    "hr manager", "hr generalist", "recruiter", "talent acquisition",
    "marketing manager", "content writer", "sales", "account manager",
    "business development", "customer success", "hr business partner", "human resources",
  ],
  engineeringTitleHints: ["engineer", "scientist", "developer", "architect", "researcher", "ml", "ai", "data", "software", "backend", "platform"],
  preferredLocations: ["pune", "noida"],
  tier1India: ["bangalore", "bengaluru", "hyderabad", "mumbai", "delhi", "gurgaon", "gurugram", "chennai", "pune", "noida"],
};

function norm(t) { return (t || "").toLowerCase(); }
function containsAny(text, terms) {
  const t = norm(text);
  return terms.filter((term) => t.includes(term));
}
function daysBetween(d1, d2) {
  return Math.round((d1 - d2) / 86400000);
}

function detectHoneypot(cand) {
  const reasons = [];
  const profile = cand.profile || {};
  const yoe = profile.years_of_experience || 0;

  for (const sk of cand.skills || []) {
    if (sk.proficiency === "expert" && (sk.duration_months || 0) === 0) {
      reasons.push("expert-skill-zero-duration");
      break;
    }
  }

  const totalMonths = (cand.career_history || []).reduce((sum, c) => sum + (c.duration_months || 0), 0);
  if (yoe && totalMonths > yoe * 12 + 24) reasons.push("career-duration-exceeds-experience");

  for (const c of cand.career_history || []) {
    const sd = c.start_date ? new Date(c.start_date) : null;
    const ed = c.end_date ? new Date(c.end_date) : null;
    if (sd && ed && ed < sd) { reasons.push("end-before-start"); break; }
  }
  if (totalMonths > 45 * 12) reasons.push("implausible-total-tenure");

  return reasons;
}

// today is fixed to the app's "current date" for deterministic scoring
const RANK_TODAY = new Date("2026-07-02T00:00:00Z");

function scoreCandidate(cand) {
  const profile = cand.profile || {};
  const skills = cand.skills || [];
  const career = cand.career_history || [];
  const signals = cand.redrob_signals || {};

  const skillNamesText = skills.map((s) => s.name || "").join(" ");
  const careerText = career
    .map((c) => `${c.title || ""} ${c.description || ""} ${c.company || ""} ${c.industry || ""}`)
    .join(" ");
  const fullText = `${profile.headline || ""} ${profile.summary || ""} ${skillNamesText} ${careerText}`;

  const honeypotReasons = detectHoneypot(cand);
  const isHoneypot = honeypotReasons.length > 0;

  const embSkill = containsAny(skillNamesText, RANK_TERMS.embedding).length > 0;
  const embCareer = containsAny(careerText, RANK_TERMS.embedding).length > 0;
  const vdbSkill = containsAny(skillNamesText, RANK_TERMS.vectorDb).length > 0;
  const vdbCareer = containsAny(careerText, RANK_TERMS.vectorDb).length > 0;
  const rankSkill = containsAny(skillNamesText, RANK_TERMS.rankingEval).length > 0;
  const rankCareer = containsAny(careerText, RANK_TERMS.rankingEval).length > 0;
  const pythonStrong =
    skills.some((s) => /\bpython\b/i.test(s.name || "") && ["advanced", "expert"].includes(s.proficiency)) ||
    /\bpython\b/i.test(careerText);
  const ftEvidence = containsAny(fullText, RANK_TERMS.llmFt).length > 0;

  let coreHits = 0;
  const coreMax = 4;
  if (embCareer || (embSkill && rankCareer)) coreHits += 1;
  if (vdbCareer || (vdbSkill && (embCareer || rankCareer))) coreHits += 1;
  if (rankCareer || rankSkill) coreHits += 1;
  if (pythonStrong) coreHits += 1;
  const coreCoverage = coreHits / coreMax;

  const productionEvidence = containsAny(careerText, RANK_TERMS.production).length > 0;

  let langchainOnly = false;
  if (containsAny(fullText, RANK_TERMS.langchainOnly).length > 0 && coreHits <= 1 && !productionEvidence) {
    const recentShort = career.some(
      (c) =>
        containsAny(`${c.title || ""} ${c.description || ""}`, RANK_TERMS.langchainOnly).length > 0 &&
        (c.duration_months || 0) <= 12
    );
    if (recentShort) langchainOnly = true;
  }

  const researchOnly = containsAny(fullText, RANK_TERMS.researchOnly).length > 0 && !productionEvidence;

  const companies = career.map((c) => c.company || "").concat([profile.current_company || ""]);
  const consultingHits = companies.filter((c) => containsAny(c, RANK_TERMS.consultingFirms).length > 0).length;
  const consultingOnly = companies.length > 0 && consultingHits >= new Set(companies).size;

  const curTitle = norm(profile.current_title || "");
  const disqualifyingTitle = containsAny(curTitle, RANK_TERMS.disqualifyingTitles).length > 0;
  const engineeringTitle = containsAny(curTitle, RANK_TERMS.engineeringTitleHints).length > 0;

  const yoe = profile.years_of_experience || 0;
  let expScore;
  if (yoe >= 5 && yoe <= 9) expScore = 1.0;
  else if ((yoe >= 4 && yoe < 5) || (yoe > 9 && yoe <= 11)) expScore = 0.75;
  else if ((yoe >= 2 && yoe < 4) || (yoe > 11 && yoe <= 14)) expScore = 0.4;
  else expScore = 0.15;

  const loc = norm(profile.location || "");
  const country = norm(profile.country || "");
  let locScore;
  if (RANK_TERMS.preferredLocations.some((p) => loc.includes(p))) locScore = 1.0;
  else if (RANK_TERMS.tier1India.some((p) => loc.includes(p)) || country.includes("india")) locScore = 0.75;
  else locScore = 0.35;

  const openToWork = !!signals.open_to_work_flag;
  const lastActive = signals.last_active_date ? new Date(signals.last_active_date) : null;
  const inactiveDays = lastActive ? daysBetween(RANK_TODAY, lastActive) : 999;
  const recencyScore = inactiveDays <= 14 ? 1.0 : inactiveDays <= 30 ? 0.75 : inactiveDays <= 90 ? 0.45 : 0.15;
  const responseRate = signals.recruiter_response_rate || 0;
  const interviewCompletion = signals.interview_completion_rate || 0;
  const notice = signals.notice_period_days ?? 30;
  const noticeScore = notice <= 30 ? 1.0 : notice <= 60 ? 0.7 : notice <= 90 ? 0.4 : 0.2;

  const availability =
    0.3 * (openToWork ? 1.0 : 0.3) +
    0.3 * recencyScore +
    0.2 * responseRate +
    0.1 * interviewCompletion +
    0.1 * noticeScore;

  let fit =
    0.42 * coreCoverage +
    0.15 * (productionEvidence ? 1.0 : 0.2) +
    0.13 * expScore +
    0.1 * locScore +
    0.1 * (ftEvidence ? 1.0 : 0.5) +
    0.1 * (consultingOnly ? 0.0 : 1.0);
  fit = Math.max(0, Math.min(1, fit));

  let composite = 0.72 * fit + 0.28 * availability;

  if (disqualifyingTitle && coreHits <= 1) composite *= 0.05;
  else if (disqualifyingTitle && !engineeringTitle) composite *= 0.25;
  if (langchainOnly) composite *= 0.35;
  if (researchOnly) composite *= 0.5;
  if (consultingOnly) composite *= 0.55;
  if (isHoneypot) composite = 0;

  composite = Math.max(0, Math.min(0.999, composite));

  const reasons = [];
  reasons.push(`${profile.current_title || "Unknown title"} with ${yoe} yrs`);
  reasons.push(`${coreHits}/${coreMax} core AI-engineering categories evidenced in work history`);
  if (productionEvidence) reasons.push("production deployment language present");
  if (consultingOnly) reasons.push("consulting-only career (JD disqualifier)");
  if (disqualifyingTitle) reasons.push("non-engineering title despite AI keywords");
  if (langchainOnly) reasons.push("LangChain-only recent AI exposure (JD trap)");
  if (researchOnly) reasons.push("research-only background, no production evidence");
  reasons.push(`response rate ${responseRate.toFixed(2)}, last active ${inactiveDays}d ago`);
  if (isHoneypot) reasons.push(`HONEYPOT: ${honeypotReasons.join(", ")}`);

  return {
    candidate_id: cand.candidate_id,
    name: profile.anonymized_name,
    current_title: profile.current_title,
    current_company: profile.current_company,
    location: profile.location,
    years_of_experience: yoe,
    score: Math.round(composite * 10000) / 10000,
    is_honeypot: isHoneypot,
    reasoning: reasons.join("; "),
  };
}

function rankCandidates(candidateArray) {
  const scored = candidateArray.map(scoreCandidate);
  scored.sort((a, b) => (b.score - a.score) || (a.candidate_id > b.candidate_id ? 1 : -1));
  return scored;
}

function toSubmissionCsv(rankedTop) {
  const escape = (v) => `"${String(v).replaceAll('"', '""')}"`;
  const lines = ["candidate_id,rank,score,reasoning"];
  rankedTop.forEach((r, i) => {
    lines.push([r.candidate_id, i + 1, r.score.toFixed(4), escape(r.reasoning)].join(","));
  });
  return lines.join("\r\n");
}

window.TalentLensRanking = { scoreCandidate, rankCandidates, toSubmissionCsv };
