#!/usr/bin/env python3
"""
Builds compact, browser-friendly JSON files from the full 100K candidate
dataset + rank.py scores, for the static TalentLens website:

  - data/candidates_pool.json  : ~260 real candidates (ranked spread +
                                  honeypot examples) with display fields
  - data/dataset_stats.json    : aggregate stats for the Explorer page
"""
import json
import random
from collections import Counter

random.seed(7)

CANDIDATES_PATH = "candidates.jsonl"
SCORED_PATH = "scored_full.json"
OUT_POOL = "candidates_pool.json"
OUT_STATS = "dataset_stats.json"

print("Loading scored results...")
with open(SCORED_PATH) as f:
    scored = json.load(f)
by_id = {r["candidate_id"]: r for r in scored}

print("Loading full candidate records (streaming)...")
records = {}
wanted_ids = set()

scored_sorted = sorted(scored, key=lambda r: (-r["score"], r["candidate_id"]))
top_150 = scored_sorted[:150]
honeypots = [r for r in scored if r["is_honeypot"]][:6]
mid_band = [r for r in scored_sorted if 0.4 <= r["score"] < 0.75]
low_band = [r for r in scored_sorted if r["score"] < 0.4 and not r["is_honeypot"]]
random_mid = random.sample(mid_band, min(70, len(mid_band)))
random_low = random.sample(low_band, min(30, len(low_band)))

for r in top_150 + honeypots + random_mid + random_low:
    wanted_ids.add(r["candidate_id"])

with open(CANDIDATES_PATH) as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        # cheap prefilter before full json parse
        cid_start = line.find('"candidate_id": "') + len('"candidate_id": "')
        cid = line[cid_start:cid_start + 12]
        if cid in wanted_ids:
            cand = json.loads(line)
            records[cand["candidate_id"]] = cand
        if len(records) == len(wanted_ids):
            break

print(f"Matched {len(records)} / {len(wanted_ids)} full records.")

pool = []
for r in top_150 + honeypots + random_mid + random_low:
    cid = r["candidate_id"]
    cand = records.get(cid)
    if not cand:
        continue
    profile = cand.get("profile", {})
    signals = cand.get("redrob_signals", {})
    top_skills = sorted(
        cand.get("skills", []),
        key=lambda s: {"expert": 3, "advanced": 2, "intermediate": 1, "beginner": 0}.get(s.get("proficiency"), 0),
        reverse=True,
    )[:8]
    pool.append({
        "candidate_id": cid,
        "name": profile.get("anonymized_name"),
        "headline": profile.get("headline"),
        "summary": profile.get("summary"),
        "location": profile.get("location"),
        "country": profile.get("country"),
        "years_of_experience": profile.get("years_of_experience"),
        "current_title": profile.get("current_title"),
        "current_company": profile.get("current_company"),
        "current_industry": profile.get("current_industry"),
        "skills": [s.get("name") for s in top_skills],
        "career_history": [
            {"company": c.get("company"), "title": c.get("title"),
             "duration_months": c.get("duration_months"),
             "is_current": c.get("is_current"), "description": c.get("description")}
            for c in cand.get("career_history", [])
        ],
        "redrob_signals": {
            "open_to_work_flag": signals.get("open_to_work_flag"),
            "last_active_date": signals.get("last_active_date"),
            "recruiter_response_rate": signals.get("recruiter_response_rate"),
            "notice_period_days": signals.get("notice_period_days"),
            "interview_completion_rate": signals.get("interview_completion_rate"),
            "github_activity_score": signals.get("github_activity_score"),
            "expected_salary_range_inr_lpa": signals.get("expected_salary_range_inr_lpa"),
            "preferred_work_mode": signals.get("preferred_work_mode"),
            "verified_email": signals.get("verified_email"),
            "verified_phone": signals.get("verified_phone"),
            "profile_completeness_score": signals.get("profile_completeness_score"),
        },
        "score": r["score"],
        "is_honeypot": r["is_honeypot"],
        "reasoning": r["reasoning"],
        "features": r["features"],
    })

pool.sort(key=lambda x: -x["score"])
with open(OUT_POOL, "w") as f:
    json.dump(pool, f)
print(f"Wrote {OUT_POOL}: {len(pool)} candidates.")

# ---- Aggregate stats for Explorer -----------------------------------------
scores = [r["score"] for r in scored]
honeypot_count = sum(1 for r in scored if r["is_honeypot"])
title_counter = Counter()
loc_counter = Counter()
exp_bucket = Counter()
skill_gap_counter = Counter()

# stream again for aggregate profile stats (title/location/experience only, cheap)
with open(CANDIDATES_PATH) as f:
    for line in f:
        line = line.strip()
        if not line:
            continue
        cand = json.loads(line)
        profile = cand.get("profile", {})
        title_counter[profile.get("current_title", "Unknown")] += 1
        loc_counter[profile.get("location", "Unknown")] += 1
        yoe = profile.get("years_of_experience", 0) or 0
        bucket = "0-2" if yoe < 2 else "2-5" if yoe < 5 else "5-9" if yoe < 9 else "9-14" if yoe < 14 else "14+"
        exp_bucket[bucket] += 1

score_hist = Counter()
for s in scores:
    bucket = int(s * 10) / 10
    score_hist[f"{bucket:.1f}"] += 1

stats = {
    "total_candidates": len(scored),
    "honeypot_count": honeypot_count,
    "avg_score": round(sum(scores) / len(scores), 4),
    "top100_min_score": round(min(r["score"] for r in top_150[:100]), 4),
    "score_histogram": dict(sorted(score_hist.items())),
    "top_titles": title_counter.most_common(12),
    "top_locations": loc_counter.most_common(12),
    "experience_buckets": dict(sorted(exp_bucket.items())),
}
with open(OUT_STATS, "w") as f:
    json.dump(stats, f, indent=2)
print(f"Wrote {OUT_STATS}.")
