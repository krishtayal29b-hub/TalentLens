(function () {
  const $ = (s, scope = document) => scope.querySelector(s);

  function scoreClass(score) {
    if (score >= 0.75) return "good";
    if (score >= 0.5) return "mid";
    return "low";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  async function renderSourcedCandidates() {
    const rows = $("#sourcedRows");
    if (!rows) return;
    try {
      const res = await fetch("./data/candidates_pool.json");
      const pool = await res.json();
      const top = pool
        .filter((c) => !c.is_honeypot)
        .sort((a, b) => b.score - a.score)
        .slice(0, 40);

      rows.innerHTML = top
        .map(
          (c) => `
          <tr>
            <td><strong>${escapeHtml(c.name)}</strong><br/>
              <span class="eyebrow">${escapeHtml(c.candidate_id)} · ${escapeHtml(c.location)}</span></td>
            <td>${escapeHtml(c.current_title)}<br/>
              <span class="eyebrow">${escapeHtml(c.current_company)} · ${c.years_of_experience} yrs</span></td>
            <td><span class="score ${scoreClass(c.score)} mono">${(c.score * 100).toFixed(1)}%</span></td>
            <td style="font-size:13px;color:var(--text-muted)">${escapeHtml(c.reasoning)}</td>
          </tr>`
        )
        .join("");
    } catch (err) {
      rows.innerHTML = `<tr><td colspan="4">Could not load the candidate pool (data/candidates_pool.json).</td></tr>`;
    }
  }

  renderSourcedCandidates();
})();
