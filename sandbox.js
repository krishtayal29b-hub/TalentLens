const $ = (s, scope = document) => scope.querySelector(s);

let loadedCandidates = null;
let lastRanked = null;

function toast(message) {
  const el = $("#portalToast");
  if (!el) return;
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2800);
}

function scoreClass(score) {
  if (score >= 0.75) return "good";
  if (score >= 0.5) return "mid";
  return "low";
}

function setCandidates(list, label) {
  loadedCandidates = list.slice(0, 100);
  $("#sampleStatus").textContent =
    `${label}: ${loadedCandidates.length} candidate${loadedCandidates.length === 1 ? "" : "s"} loaded and ready to rank.`;
  $("#runRankBtn").disabled = false;
  $("#downloadCsvBtn").disabled = true;
  lastRanked = null;
  $("#rankRows").innerHTML = `<tr><td colspan="5">Ready. Click "Run ranking".</td></tr>`;
}

async function loadSample() {
  try {
    const res = await fetch("./data/sample_candidates.json");
    const data = await res.json();
    setCandidates(data, "Bundled sample");
    toast("Loaded 50 real candidates from the released dataset.");
  } catch (err) {
    toast("Could not load the bundled sample.");
  }
}

function handleUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const arr = Array.isArray(data) ? data : [data];
      setCandidates(arr, file.name);
      toast(`Loaded ${arr.length} candidate(s) from ${file.name}.`);
    } catch (err) {
      toast("That file isn't valid JSON. Expecting an array of candidate objects.");
    }
  };
  reader.readAsText(file);
}

function renderResults(ranked) {
  const rows = $("#rankRows");
  rows.innerHTML = ranked
    .map(
      (r, i) => `
      <tr>
        <td class="mono">${i + 1}</td>
        <td>
          <strong>${r.name || r.candidate_id}</strong><br/>
          <span class="eyebrow">${r.candidate_id}${r.is_honeypot ? " · HONEYPOT" : ""}</span>
        </td>
        <td>${r.current_title || "—"}${r.current_company ? ` @ ${r.current_company}` : ""}<br/>
          <span class="eyebrow">${r.location || "—"} · ${r.years_of_experience ?? "?"} yrs</span></td>
        <td><span class="score ${scoreClass(r.score)} mono">${(r.score * 100).toFixed(1)}%</span></td>
        <td style="font-size:13px;color:var(--text-muted)">${r.reasoning}</td>
      </tr>`
    )
    .join("");
}

function runRanking() {
  if (!loadedCandidates || !loadedCandidates.length) return;
  const t0 = performance.now();
  const ranked = window.TalentLensRanking.rankCandidates(loadedCandidates);
  const elapsed = (performance.now() - t0).toFixed(1);
  lastRanked = ranked;
  renderResults(ranked);
  $("#downloadCsvBtn").disabled = false;
  $("#runTiming").textContent = `Ranked ${ranked.length} candidates in ${elapsed}ms — CPU only, no network calls.`;
  toast("Ranking complete.");
}

function downloadCsv() {
  if (!lastRanked) return;
  const top = lastRanked.slice(0, Math.min(100, lastRanked.length));
  const csv = window.TalentLensRanking.toSubmissionCsv(top);
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "submission.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function applyTheme(theme) {
  if (theme === "green") document.documentElement.setAttribute("data-theme", "green");
  else document.documentElement.removeAttribute("data-theme");
  localStorage.setItem("tl_theme", theme);
}

function initTheme() {
  applyTheme(localStorage.getItem("tl_theme") === "green" ? "green" : "blue");
  $("#portalThemeToggle")?.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "green" ? "blue" : "green";
    applyTheme(next);
  });
}

async function initDatasetPills() {
  try {
    const res = await fetch("./data/dataset_stats.json");
    const stats = await res.json();
    $("#datasetPill").textContent = `${stats.total_candidates.toLocaleString()} candidates scored offline`;
    $("#honeypotPill").textContent = `${stats.honeypot_count} honeypots flagged`;
  } catch (err) {
    /* pills stay at default text */
  }
}

initTheme();
initDatasetPills();
$("#useSampleBtn").addEventListener("click", loadSample);
$("#uploadInput").addEventListener("change", handleUpload);
$("#runRankBtn").addEventListener("click", runRanking);
$("#downloadCsvBtn").addEventListener("click", downloadCsv);
