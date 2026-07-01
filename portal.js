const TL_KEYS = {
  jobs: "tl_jobs",
  analyses: "tl_analyses",
  theme: "tl_theme",
};

let activeRole = "";

const DEFAULT_JOB = {
  id: "job-react-ts",
  title: "React + TypeScript Engineer",
  company: "TalentLens Labs",
  location: "Remote",
  status: "Active",
  requiredSkills: ["React", "TypeScript", "Vite", "Zustand", "TanStack Query", "Testing"],
  description:
    "Build accessible React 18 dashboards with TypeScript, Vite, Zustand, TanStack Query, frontend testing, and clean API integrations.",
  createdAt: new Date().toISOString(),
};

const SKILL_SYNONYMS = {
  react: ["react", "reactjs", "react.js", "jsx", "hooks"],
  typescript: ["typescript", "type script", "ts"],
  vite: ["vite"],
  zustand: ["zustand"],
  "tanstack query": ["tanstack query", "react query"],
  testing: ["testing", "jest", "vitest", "playwright", "cypress", "rtl", "react testing library"],
  python: ["python"],
  django: ["django"],
  sql: ["sql", "postgres", "postgresql", "mysql"],
  fastapi: ["fastapi", "fast api"],
  firebase: ["firebase", "firestore"],
};

const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function scoreClass(score) {
  if (score >= 75) return "good";
  if (score >= 60) return "mid";
  return "low";
}

function getJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function setJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function ensureSeedData() {
  if (!localStorage.getItem(TL_KEYS.jobs)) {
    setJson(TL_KEYS.jobs, [DEFAULT_JOB]);
  }
}

function getJobs() {
  ensureSeedData();
  return getJson(TL_KEYS.jobs, [DEFAULT_JOB]);
}

function saveJobs(jobs) {
  setJson(TL_KEYS.jobs, jobs);
}

function getAnalyses() {
  return getJson(TL_KEYS.analyses, []);
}

function saveAnalyses(analyses) {
  setJson(TL_KEYS.analyses, analyses);
}

function showPortalToast(message) {
  const toast = $("#portalToast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2800);
}

function applyTheme(theme) {
  if (theme === "green") {
    document.documentElement.setAttribute("data-theme", "green");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  localStorage.setItem(TL_KEYS.theme, theme);
}

function initPortalTheme() {
  applyTheme(localStorage.getItem(TL_KEYS.theme) === "green" ? "green" : "blue");
  $("#portalThemeToggle")?.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "green" ? "blue" : "green";
    applyTheme(next);
  });
}

function userKey(role = activeRole) {
  return `tl_user_${role || "guest"}`;
}

function pendingKey(role = activeRole) {
  return `tl_pending_code_${role || "guest"}`;
}

function currentUser(role = activeRole) {
  return getJson(userKey(role), null);
}

function signOut() {
  localStorage.removeItem(pendingKey());
  localStorage.removeItem(userKey());
  location.reload();
}

function requirePortalAuth(role, onReady) {
  activeRole = role;
  const authGate = $("#authGate");
  const app = $("#portalApp");
  const user = currentUser(role);

  if (user?.role === role) {
    authGate?.classList.add("hidden");
    app?.classList.remove("hidden");
    $("#signedInUser") && ($("#signedInUser").textContent = user.email);
    onReady(user);
    return;
  }

  authGate?.classList.remove("hidden");
  app?.classList.add("hidden");
  $("#authRole") && ($("#authRole").textContent = role);

  $("#sendCodeForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const email = $("#authEmail").value.trim();
    const password = $("#authPassword").value;
    if (!email.includes("@") || password.length < 8) {
      showPortalToast("Use an email and a password with at least 8 characters.");
      return;
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    setJson(pendingKey(role), { code, email, role, expiresAt: Date.now() + 5 * 60 * 1000 });
    $("#codeStep")?.classList.remove("hidden");
    $("#demoCode").textContent = code;
    showPortalToast("Verification code generated for this local demo.");
  });

  $("#verifyCodeForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const pending = getJson(pendingKey(role), null);
    const code = $("#authCode").value.trim();
    if (!pending || pending.role !== role || pending.expiresAt < Date.now()) {
      showPortalToast("Verification expired. Generate a fresh code.");
      return;
    }

    if (pending.code !== code) {
      showPortalToast("That verification code does not match.");
      return;
    }

    setJson(userKey(role), { email: pending.email, role, signedInAt: new Date().toISOString() });
    localStorage.removeItem(pendingKey(role));
    location.reload();
  });
}

function normalizeText(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9+#. ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function skillTerms(skill) {
  const normalized = normalizeText(skill);
  return SKILL_SYNONYMS[normalized] ?? [normalized];
}

function hasSkill(text, skill) {
  const normalized = " " + normalizeText(text) + " ";
  return skillTerms(skill).some((term) => normalized.includes(" " + term + " "));
}

function keywordOverlap(resumeText, jobText) {
  const stop = new Set([
    "and",
    "the",
    "with",
    "for",
    "from",
    "that",
    "this",
    "role",
    "build",
    "clean",
    "work",
    "team",
    "using",
    "into",
  ]);
  const resumeWords = new Set(normalizeText(resumeText).split(" ").filter((word) => word.length > 3 && !stop.has(word)));
  const jobWords = normalizeText(jobText)
    .split(" ")
    .filter((word) => word.length > 3 && !stop.has(word));
  if (!jobWords.length) return 0;
  const hits = jobWords.filter((word) => resumeWords.has(word)).length;
  return hits / new Set(jobWords).size;
}

function analyzeResume(resumeText, job, fileName) {
  const requiredSkills = job.requiredSkills || [];
  const matchedSkills = requiredSkills.filter((skill) => hasSkill(resumeText, skill));
  const missingSkills = requiredSkills.filter((skill) => !hasSkill(resumeText, skill));
  const extraSignals = Object.keys(SKILL_SYNONYMS)
    .filter((skill) => hasSkill(resumeText, skill) && !requiredSkills.map(normalizeText).includes(skill))
    .slice(0, 8);
  const skillRatio = requiredSkills.length ? matchedSkills.length / requiredSkills.length : 0;
  const overlap = keywordOverlap(resumeText, `${job.title} ${job.description} ${(job.requiredSkills || []).join(" ")}`);
  const experienceSignals = /\b(years?|led|built|shipped|launched|production|owned|designed|deployed)\b/i.test(resumeText) ? 1 : 0;
  const score = Math.max(5, Math.min(98, Math.round(skillRatio * 72 + overlap * 18 + experienceSignals * 10)));
  const lower = normalizeText(resumeText);
  const roleMismatch =
    hasSkill(resumeText, "django") &&
    hasSkill(resumeText, "python") &&
    requiredSkills.some((skill) => normalizeText(skill).includes("react")) &&
    !hasSkill(resumeText, "React");
  const finalScore = roleMismatch ? Math.min(score, 20) : score;

  return {
    id: `analysis-${Date.now()}`,
    fileName,
    candidateEmail: currentUser()?.email || "candidate@local",
    jobId: job.id,
    jobTitle: job.title,
    company: job.company,
    score: finalScore,
    status: finalScore >= 75 ? "Interview" : finalScore >= 60 ? "Screening" : "Needs skills",
    matchedSkills,
    missingSkills,
    extraSignals,
    resumePreview: resumeText.slice(0, 1200),
    createdAt: new Date().toISOString(),
    summary:
      finalScore >= 75
        ? "Strong alignment. The resume contains direct evidence for most of the recruiter requirements."
        : finalScore >= 60
          ? "Partial alignment. The resume has useful adjacent experience, but a few required skills need stronger proof."
          : "Low alignment. The resume does not yet show enough evidence for this recruiter's role requirements.",
    advice: missingSkills.length
      ? `Add clear project evidence for: ${missingSkills.join(", ")}.`
      : "Keep the resume focused on measurable outcomes and role-specific evidence.",
    questions: [
      `Show a project where you used ${matchedSkills[0] || requiredSkills[0] || "the core stack"}.`,
      `How would you close the gap around ${missingSkills[0] || "system design"}?`,
      `What production result proves you can succeed as a ${job.title}?`,
    ],
  };
}

async function extractResumeText(file) {
  if (!file) return "";
  const name = file.name.toLowerCase();
  if (name.endsWith(".txt") || name.endsWith(".md") || file.type.startsWith("text/")) {
    return file.text();
  }

  // Use PDF.js if available and it's a PDF
  if ((name.endsWith(".pdf") || file.type === "application/pdf") && typeof pdfjsLib !== "undefined") {
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        fullText += textContent.items.map((item) => item.str).join(" ") + " ";
      }
      return fullText.replace(/\s+/g, " ").trim();
    } catch (e) {
      console.warn("PDF.js extraction failed, falling back to basic extraction", e);
    }
  }

  // Fallback string scraping for other binary formats
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const decoded = new TextDecoder("latin1").decode(bytes);
  const strings = decoded.match(/[A-Za-z0-9][A-Za-z0-9+#.,:/()\- ]{3,}/g) || [];
  return strings
    .join(" ")
    .replace(/\b(obj|endobj|stream|endstream|xref|trailer|font|length|filter|flateDecode)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function renderJobOptions() {
  const select = $("#candidateJob");
  if (!select) return;
  select.innerHTML = getJobs()
    .map((job) => `<option value="${escapeHtml(job.id)}">${escapeHtml(job.title)} - ${escapeHtml(job.company)}</option>`)
    .join("");
}

function renderCandidateResult(analysis) {
  const result = $("#candidateResult");
  if (!result) return;
  result.classList.remove("hidden");
  result.innerHTML = `
    <div class="result-top">
      <div>
        <span class="card-label">AI analysis result</span>
        <h3>${escapeHtml(analysis.jobTitle)}</h3>
        <p>${escapeHtml(analysis.summary)}</p>
      </div>
      <div class="score-ring ${scoreClass(analysis.score)}" style="--score: ${analysis.score}">
        <span class="mono">${analysis.score}%</span>
      </div>
    </div>
    <div class="portal-columns">
      <div>
        <h4>Matched skills</h4>
        <div class="pill-row">${(analysis.matchedSkills.length ? analysis.matchedSkills : ["None yet"])
          .map((skill) => `<span class="pill green">${escapeHtml(skill)}</span>`)
          .join("")}</div>
      </div>
      <div>
        <h4>Missing skills</h4>
        <div class="pill-row">${(analysis.missingSkills.length ? analysis.missingSkills : ["No critical gaps"])
          .map((skill) => `<span class="pill amber">${escapeHtml(skill)}</span>`)
          .join("")}</div>
      </div>
    </div>
    <div class="analysis-block">
      <h4>Advice</h4>
      <p>${escapeHtml(analysis.advice)}</p>
      <h4>Interview questions</h4>
      <ul>${analysis.questions.map((question) => `<li>${escapeHtml(question)}</li>`).join("")}</ul>
    </div>
  `;
}

function initCandidatePage() {
  requirePortalAuth("candidate", () => {
    renderJobOptions();
    const form = $("#resumeForm");
    form?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const file = $("#resumeFile").files[0];
      const pasted = $("#resumeText").value.trim();
      const jobs = getJobs();
      const job = jobs.find((item) => item.id === $("#candidateJob").value) || jobs[0];
      if (!file && pasted.length < 80) {
        showPortalToast("Upload a resume or paste at least a few resume lines.");
        return;
      }

      $("#analyzeButton").disabled = true;
      $("#analyzeButton").textContent = "Analyzing...";
      try {
        const extracted = file ? await extractResumeText(file) : "";
        const resumeText = `${extracted} ${pasted}`.trim();
        if (resumeText.length < 80) {
          showPortalToast("I could not read enough text. Paste resume text into the box and try again.");
          return;
        }
        const analysis = analyzeResume(resumeText, job, file?.name || "pasted-resume.txt");
        const analyses = getAnalyses();
        analyses.unshift(analysis);
        saveAnalyses(analyses.slice(0, 50));
        renderCandidateResult(analysis);
        showPortalToast("Resume analyzed against recruiter requirements.");
      } finally {
        $("#analyzeButton").disabled = false;
        $("#analyzeButton").textContent = "Analyze resume";
      }
    });
  });
}

function renderRecruiterJobs() {
  const jobsWrap = $("#jobList");
  if (!jobsWrap) return;
  jobsWrap.innerHTML = getJobs()
    .map(
      (job) => `
        <article class="portal-item">
          <div>
            <strong>${escapeHtml(job.title)}</strong>
            <span>${escapeHtml(job.company)} - ${escapeHtml(job.location)}</span>
          </div>
          <div class="pill-row">${job.requiredSkills
            .map((skill) => `<span class="pill blue">${escapeHtml(skill)}</span>`)
            .join("")}</div>
        </article>
      `
    )
    .join("");
}

function renderRecruiterAnalyses() {
  const rows = $("#recruiterRows");
  if (!rows) return;
  const analyses = getAnalyses();
  rows.innerHTML = analyses.length
    ? analyses
        .map(
          (analysis) => `
            <tr>
              <td>${escapeHtml(analysis.candidateEmail)}</td>
              <td>${escapeHtml(analysis.jobTitle)}</td>
              <td><span class="score ${scoreClass(analysis.score)}">${analysis.score}%</span></td>
              <td>${escapeHtml(analysis.missingSkills.join(", ") || "None")}</td>
              <td><span class="status ${analysis.score >= 75 ? "interview" : analysis.score >= 60 ? "screening" : "rejected"}">${escapeHtml(analysis.status)}</span></td>
            </tr>
          `
        )
        .join("")
    : `<tr><td colspan="5">No candidate uploads yet. Open the Candidate window and analyze a resume.</td></tr>`;
}

function initRecruiterPage() {
  requirePortalAuth("recruiter", () => {
    renderRecruiterJobs();
    renderRecruiterAnalyses();
    $("#jobBuilderForm")?.addEventListener("submit", (event) => {
      event.preventDefault();
      const title = $("#jobTitle").value.trim();
      const company = $("#jobCompany").value.trim();
      const location = $("#jobLocation").value.trim();
      const description = $("#jobDescription").value.trim();
      const requiredSkills = $("#jobSkills")
        .value.split(",")
        .map((skill) => skill.trim())
        .filter(Boolean);
      if (!title || !company || requiredSkills.length < 2 || description.length < 30) {
        showPortalToast("Add a title, company, description, and at least two skills.");
        return;
      }

      const jobs = getJobs();
      jobs.unshift({
        id: `job-${Date.now()}`,
        title,
        company,
        location: location || "Remote",
        status: "Active",
        requiredSkills,
        description,
        createdAt: new Date().toISOString(),
      });
      saveJobs(jobs);
      renderRecruiterJobs();
      renderRecruiterAnalyses();
      showPortalToast("Recruiter job saved. Candidate window can now use it.");
      event.currentTarget.reset();
    });
  });
}

function initExplorerPage() {
  const jobs = getJobs();
  const analyses = getAnalyses();
  const total = analyses.length;
  const avg = total ? Math.round(analyses.reduce((sum, item) => sum + item.score, 0) / total) : 0;
  $("#metricJobs") && ($("#metricJobs").textContent = jobs.length);
  $("#metricUploads") && ($("#metricUploads").textContent = total);
  $("#metricAverage") && ($("#metricAverage").textContent = `${avg}%`);

  const feed = $("#explorerFeed");
  if (feed) {
    feed.innerHTML = analyses.length
      ? analyses
          .map(
            (analysis) => `
              <article class="portal-item">
                <div>
                  <strong>${escapeHtml(analysis.fileName)}</strong>
                  <span>${escapeHtml(analysis.candidateEmail)} for ${escapeHtml(analysis.jobTitle)}</span>
                </div>
                <span class="score ${scoreClass(analysis.score)}">${analysis.score}%</span>
              </article>
            `
          )
          .join("")
      : `<article class="portal-item"><div><strong>No uploads yet</strong><span>Analyze a resume in the Candidate window to populate Explorer.</span></div></article>`;
  }

  const skillMap = new Map();
  analyses.forEach((analysis) => {
    analysis.missingSkills.forEach((skill) => skillMap.set(skill, (skillMap.get(skill) || 0) + 1));
  });
  const gapList = $("#skillGaps");
  if (gapList) {
    const sorted = [...skillMap.entries()].sort((a, b) => b[1] - a[1]);
  gapList.innerHTML = sorted.length
    ? sorted.slice(0, 8).map(([skill, count]) => {
        const max = sorted[0]?.[1] || 1;
        const pct = Math.round((count / max) * 100);
        return `
          <div class="gap-bar-row">
            <span class="gap-bar-label">
              ${escapeHtml(skill)}</span>
            <div class="gap-bar-track">
              <div class="gap-bar-fill"
                   style="width:${pct}%"></div>
            </div>
            <span class="gap-bar-count">${count}</span>
          </div>`;
      }).join("")
    : `<p style="color:var(--text-muted);font-size:13px">
         No data yet.</p>`;
  }
}

function initPortalShell() {
  ensureSeedData();
  initPortalTheme();
  $("#signOutButton")?.addEventListener("click", signOut);
  const page = document.body.dataset.page;
  if (page === "candidate") initCandidatePage();
  if (page === "recruiter") initRecruiterPage();
  if (page === "explorer") initExplorerPage();
}

initPortalShell();
