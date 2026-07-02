#!/usr/bin/env python3
"""
rank.py — Redrob Intelligent Candidate Discovery & Ranking Challenge
Feature-based ranker for the "Senior AI Engineer — Founding Team" JD.

No hosted LLM calls, no GPU. Pure Python + streaming JSONL. Designed to run
on 100K candidates within a 5-minute / 16GB CPU budget.

Usage:
    python rank.py --candidates candidates.jsonl --out submission.csv --top 100
"""

import argparse
import csv
import json
import re
import sys
from datetime import date, datetime

TODAY = date(2026, 7, 2)

# ---------------------------------------------------------------------------
# Term banks (grounded directly in the JD text, not generic "AI keywords")
# ---------------------------------------------------------------------------

EMBEDDING_TERMS = [
    "sentence-transformers", "sentence transformers", "openai embedding",
    "text-embedding", "bge", "e5 embedding", "bge-large", "cohere embed",
    "embedding model", "dense retrieval", "dense embeddings",
]
VECTOR_DB_TERMS = [
    "pinecone", "weaviate", "qdrant", "milvus", "opensearch",
    "elasticsearch", "faiss", "vespa", "vector database", "vector db",
    "vector search", "hybrid search", "ann search", "hnsw",
]
RANKING_EVAL_TERMS = [
    "ndcg", "mrr", "map@", "mean average precision", "learning to rank",
    "learning-to-rank", "ltr", "precision@", "recall@", "a/b test",
    "offline eval", "online eval", "eval framework", "evaluation framework",
    "ranking model", "re-ranking", "reranking", "rerank",
]
LLM_FT_TERMS = [
    "lora", "qlora", "peft", "fine-tuning", "fine tuning", "finetune",
    "rlhf", "instruction tuning",
]
LANGCHAIN_ONLY_TERMS = ["langchain", "llamaindex", "llama-index"]
PRODUCTION_TERMS = [
    "production", "deployed", "shipped", "scale", "real users", "real-time",
    "live traffic", "in production", "rolled out", "launched",
]
RESEARCH_ONLY_TERMS = [
    "research lab", "academic", "phd thesis", "publication", "postdoc",
    "research scientist", "research intern",
]
CONSULTING_FIRMS = [
    "tcs", "tata consultancy", "infosys", "wipro", "accenture", "cognizant",
    "capgemini", "hcl", "tech mahindra", "mindtree", "l&t infotech",
    "mphasis", "genpact",
]
DISQUALIFYING_TITLES = [
    "hr manager", "hr generalist", "recruiter", "talent acquisition",
    "marketing manager", "content writer", "sales", "account manager",
    "business development", "customer success", "hr business partner",
    "human resources",
]
ENGINEERING_TITLE_HINTS = [
    "engineer", "scientist", "developer", "architect", "researcher",
    "ml", "ai", "data", "software", "backend", "platform",
]
PREFERRED_LOCATIONS = ["pune", "noida"]
TIER1_INDIA = ["bangalore", "bengaluru", "hyderabad", "mumbai", "delhi",
               "gurgaon", "gurugram", "chennai", "pune", "noida"]

PYTHON_RE = re.compile(r"\bpython\b", re.I)


def norm(text):
    return (text or "").lower()


def contains_any(text, terms):
    t = norm(text)
    return [term for term in terms if term in t]


def parse_date(s):
    if not s:
        return None
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Honeypot / impossible-profile detection
# ---------------------------------------------------------------------------

def detect_honeypot(cand):
    reasons = []
    profile = cand.get("profile", {})
    yoe = profile.get("years_of_experience", 0) or 0

    # Expert proficiency with 0 months of use
    for sk in cand.get("skills", []):
        if sk.get("proficiency") == "expert" and (sk.get("duration_months") or 0) == 0:
            reasons.append("expert-skill-zero-duration")
            break

    # Career history summed duration wildly exceeds stated years of experience
    total_months = sum((ch.get("duration_months") or 0) for ch in cand.get("career_history", []))
    if yoe and total_months > (yoe * 12 + 24):
        reasons.append("career-duration-exceeds-experience")

    # Overlapping / impossible dates: end before start
    for ch in cand.get("career_history", []):
        sd, ed = parse_date(ch.get("start_date")), parse_date(ch.get("end_date"))
        if sd and ed and ed < sd:
            reasons.append("end-before-start")
            break

    # More career months than plausible given a human career (>45 years)
    if total_months > 45 * 12:
        reasons.append("implausible-total-tenure")

    return reasons


# ---------------------------------------------------------------------------
# Feature extraction + scoring
# ---------------------------------------------------------------------------

def score_candidate(cand):
    profile = cand.get("profile", {}) or {}
    skills = cand.get("skills", []) or []
    career = cand.get("career_history", []) or []
    signals = cand.get("redrob_signals", {}) or {}

    skill_names_text = " ".join(s.get("name", "") for s in skills)
    career_text = " ".join(
        f"{c.get('title','')} {c.get('description','')} {c.get('company','')} {c.get('industry','')}"
        for c in career
    )
    full_text = f"{profile.get('headline','')} {profile.get('summary','')} {skill_names_text} {career_text}"

    honeypot_reasons = detect_honeypot(cand)
    is_honeypot = len(honeypot_reasons) > 0

    # ---- Core AI skill evidence (must be backed by career-history text,
    # not just a skills-tag, to defeat keyword stuffing) ---------------
    emb_skill = bool(contains_any(skill_names_text, EMBEDDING_TERMS))
    emb_career = bool(contains_any(career_text, EMBEDDING_TERMS))
    vdb_skill = bool(contains_any(skill_names_text, VECTOR_DB_TERMS))
    vdb_career = bool(contains_any(career_text, VECTOR_DB_TERMS))
    rank_skill = bool(contains_any(skill_names_text, RANKING_EVAL_TERMS))
    rank_career = bool(contains_any(career_text, RANKING_EVAL_TERMS))
    python_strong = any(
        PYTHON_RE.search(s.get("name", "")) and s.get("proficiency") in ("advanced", "expert")
        for s in skills
    ) or bool(PYTHON_RE.search(career_text))
    ft_evidence = bool(contains_any(full_text, LLM_FT_TERMS))

    core_hits = 0
    core_max = 4
    # each "must-have" category only counts if it shows up in career history,
    # i.e. was actually *done*, not just listed as a skill tag
    if emb_career or (emb_skill and rank_career):
        core_hits += 1
    if vdb_career or (vdb_skill and (emb_career or rank_career)):
        core_hits += 1
    if rank_career or rank_skill:
        core_hits += 1
    if python_strong:
        core_hits += 1
    core_coverage = core_hits / core_max  # 0..1

    production_evidence = bool(contains_any(career_text, PRODUCTION_TERMS))

    # ---- LangChain-only trap: recent, shallow, no other core evidence ----
    langchain_only = False
    if contains_any(full_text, LANGCHAIN_ONLY_TERMS) and core_hits <= 1 and not production_evidence:
        recent_short = False
        for c in career:
            if contains_any(f"{c.get('title','')} {c.get('description','')}", LANGCHAIN_ONLY_TERMS):
                if (c.get("duration_months") or 0) <= 12:
                    recent_short = True
        if recent_short:
            langchain_only = True

    # ---- Research-only penalty -------------------------------------------
    research_only = bool(contains_any(full_text, RESEARCH_ONLY_TERMS)) and not production_evidence

    # ---- Consulting-only penalty ------------------------------------------
    companies = [c.get("company", "") for c in career] + [profile.get("current_company", "")]
    consulting_hits = sum(1 for c in companies if contains_any(c, CONSULTING_FIRMS))
    consulting_only = len(companies) > 0 and consulting_hits >= len(set(companies))

    # ---- Title sanity (defeats keyword-stuffed non-engineering titles) ---
    cur_title = norm(profile.get("current_title", ""))
    disqualifying_title = bool(contains_any(cur_title, DISQUALIFYING_TITLES))
    engineering_title = bool(contains_any(cur_title, ENGINEERING_TITLE_HINTS))

    # ---- Experience band (JD: 5-9y sweet spot, softly outside) -----------
    yoe = profile.get("years_of_experience", 0) or 0
    if 5 <= yoe <= 9:
        exp_score = 1.0
    elif 4 <= yoe < 5 or 9 < yoe <= 11:
        exp_score = 0.75
    elif 2 <= yoe < 4 or 11 < yoe <= 14:
        exp_score = 0.4
    else:
        exp_score = 0.15

    # ---- Location fit ------------------------------------------------------
    loc = norm(profile.get("location", ""))
    country = norm(profile.get("country", ""))
    if any(p in loc for p in PREFERRED_LOCATIONS):
        loc_score = 1.0
    elif any(p in loc for p in TIER1_INDIA) or "india" in country:
        loc_score = 0.75
    else:
        loc_score = 0.35

    # ---- Behavioral / availability signals (multiplier, per spec) --------
    open_to_work = bool(signals.get("open_to_work_flag"))
    last_active = parse_date(signals.get("last_active_date"))
    inactive_days = (TODAY - last_active).days if last_active else 999
    recency_score = 1.0 if inactive_days <= 14 else 0.75 if inactive_days <= 30 else \
        0.45 if inactive_days <= 90 else 0.15
    response_rate = signals.get("recruiter_response_rate", 0) or 0
    interview_completion = signals.get("interview_completion_rate", 0) or 0
    notice = signals.get("notice_period_days", 30) or 0
    notice_score = 1.0 if notice <= 30 else 0.7 if notice <= 60 else 0.4 if notice <= 90 else 0.2
    verified = (1 if signals.get("verified_email") else 0) + (1 if signals.get("verified_phone") else 0)

    availability = (
        0.30 * (1.0 if open_to_work else 0.3)
        + 0.30 * recency_score
        + 0.20 * response_rate
        + 0.10 * interview_completion
        + 0.10 * notice_score
    )

    # ---- Composite skill/fit score (0..1) ---------------------------------
    fit = (
        0.42 * core_coverage
        + 0.15 * (1.0 if production_evidence else 0.2)
        + 0.13 * exp_score
        + 0.10 * loc_score
        + 0.10 * (1.0 if ft_evidence else 0.5)  # nice-to-have, not required
        + 0.10 * (0.0 if consulting_only else 1.0)
    )
    fit = max(0.0, min(1.0, fit))

    composite = 0.72 * fit + 0.28 * availability

    # ---- Hard penalties / disqualifiers ------------------------------------
    if disqualifying_title and core_hits <= 1:
        composite *= 0.05  # e.g. "HR Manager" with stuffed skills keywords
    elif disqualifying_title and not engineering_title:
        composite *= 0.25
    if langchain_only:
        composite *= 0.35
    if research_only:
        composite *= 0.5
    if consulting_only:
        composite *= 0.55
    if is_honeypot:
        composite = 0.0

    composite = max(0.0, min(0.999, composite))

    reasons = []
    reasons.append(f"{profile.get('current_title','Unknown title')} with {yoe:g} yrs")
    reasons.append(f"{core_hits}/{core_max} core AI-engineering categories evidenced in work history")
    if production_evidence:
        reasons.append("production deployment language present")
    if consulting_only:
        reasons.append("consulting-only career (JD disqualifier)")
    if disqualifying_title:
        reasons.append("non-engineering title despite AI keywords")
    if langchain_only:
        reasons.append("LangChain-only recent AI exposure (JD trap)")
    if research_only:
        reasons.append("research-only background, no production evidence")
    reasons.append(f"response rate {response_rate:.2f}, last active {inactive_days}d ago")
    if is_honeypot:
        reasons.append(f"HONEYPOT: {', '.join(honeypot_reasons)}")

    return {
        "candidate_id": cand.get("candidate_id"),
        "score": round(composite, 4),
        "is_honeypot": is_honeypot,
        "reasoning": "; ".join(reasons),
        "features": {
            "core_hits": core_hits,
            "core_max": core_max,
            "production_evidence": production_evidence,
            "exp_score": round(exp_score, 2),
            "loc_score": round(loc_score, 2),
            "availability": round(availability, 3),
            "fit": round(fit, 3),
            "consulting_only": consulting_only,
            "disqualifying_title": disqualifying_title,
            "langchain_only": langchain_only,
            "research_only": research_only,
            "years_of_experience": yoe,
            "location": profile.get("location"),
            "current_title": profile.get("current_title"),
            "current_company": profile.get("current_company"),
            "open_to_work_flag": open_to_work,
            "recruiter_response_rate": response_rate,
            "inactive_days": inactive_days,
        },
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--candidates", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--top", type=int, default=100)
    ap.add_argument("--full-json-out", default=None,
                     help="optional: write full scored feature set (for building the website dataset)")
    args = ap.parse_args()

    scored = []
    n = 0
    with open(args.candidates, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            cand = json.loads(line)
            result = score_candidate(cand)
            scored.append(result)
            n += 1

    print(f"Scored {n} candidates.", file=sys.stderr)

    honeypot_count = sum(1 for r in scored if r["is_honeypot"])
    print(f"Honeypots detected: {honeypot_count}", file=sys.stderr)

    scored.sort(key=lambda r: (-r["score"], r["candidate_id"]))
    top = scored[: args.top]

    with open(args.out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["candidate_id", "rank", "score", "reasoning"])
        for i, r in enumerate(top, start=1):
            w.writerow([r["candidate_id"], i, f"{r['score']:.4f}", r["reasoning"]])

    print(f"Wrote {args.out} ({len(top)} rows).", file=sys.stderr)

    if args.full_json_out:
        with open(args.full_json_out, "w", encoding="utf-8") as f:
            json.dump(scored, f)
        print(f"Wrote {args.full_json_out} ({len(scored)} records).", file=sys.stderr)


if __name__ == "__main__":
    main()
