(function () {
  const $ = (s, scope = document) => scope.querySelector(s);

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;");
  }

  function barChart(container, entries) {
    if (!container) return;
    const max = Math.max(...entries.map(([, v]) => v), 1);
    container.innerHTML = entries
      .map(
        ([label, count]) => `
        <div class="gap-bar-row">
          <span class="gap-bar-label">${escapeHtml(label)}</span>
          <div class="gap-bar-track">
            <div class="gap-bar-fill" style="width:${Math.round((count / max) * 100)}%"></div>
          </div>
          <span class="gap-bar-count">${count}</span>
        </div>`
      )
      .join("");
  }

  async function renderDatasetStats() {
    try {
      const res = await fetch("./data/dataset_stats.json");
      const stats = await res.json();

      $("#dsTotal") && ($("#dsTotal").textContent = stats.total_candidates.toLocaleString());
      $("#dsHoneypots") && ($("#dsHoneypots").textContent = stats.honeypot_count);
      $("#dsCutoff") && ($("#dsCutoff").textContent = `${(stats.top100_min_score * 100).toFixed(1)}%`);

      barChart($("#dsTitles"), stats.top_titles.slice(0, 8));
      barChart(
        $("#dsExperience"),
        Object.entries(stats.experience_buckets).map(([bucket, count]) => [`${bucket} yrs`, count])
      );
    } catch (err) {
      /* dataset stats unavailable, leave placeholders */
    }
  }

  renderDatasetStats();
})();
