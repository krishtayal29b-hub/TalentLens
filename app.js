// ── TalentLens app.js — index.html controller ──────────────

const TL_KEYS = { analyses: "tl_analyses", theme: "tl_theme" };

const qs  = (s, scope = document) => scope.querySelector(s);
const qsa = (s, scope = document) => [...scope.querySelectorAll(s)];

// ── Helpers ────────────────────────────────────────────────

function scoreClass(score) {
  if (score >= 75) return "good";
  if (score >= 60) return "mid";
  return "low";
}

function statusClass(status) {
  const s = status.toLowerCase();
  if (s === "interview") return "interview";
  if (s === "rejected")  return "rejected";
  return "screening";
}

function getAnalyses() {
  try {
    return JSON.parse(localStorage.getItem(TL_KEYS.analyses)) ?? [];
  } catch { return []; }
}

function showToast(message) {
  const toast = qs("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2800);
}

// ── Welcome Popup (REQ-01) ─────────────────────────────────
// Shows on first visit. Checks localStorage flag.
// Focus-trapped: ESC and overlay click do NOT close it.
// Only the two buttons close it.

function initPopup() {
  const popup = qs("#welcomePopup");
  if (!popup) return;

  // Already dismissed → hide immediately
  if (localStorage.getItem("tl_popup_dismissed") === "true") {
    popup.remove();
    return;
  }

  // Show it. Trap focus inside.
  popup.style.display = "flex";

  const focusable = qsa(
    "a[href], button:not([disabled]), input, textarea, select",
    popup
  );
  const first = focusable[0];
  const last  = focusable[focusable.length - 1];
  setTimeout(() => first?.focus(), 100);

  popup.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault(); last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault(); first.focus();
        }
      }
    }
    // ESC intentionally does NOT close (continuous popup)
  });

  // "Get started" → close popup only (navigation handled by href)
  qs("#popupStart")?.addEventListener("click", () => {
    popup.remove();
  });

  // "Don't show again" → set flag + close
  qs("#popupDismiss")?.addEventListener("click", () => {
    localStorage.setItem("tl_popup_dismissed", "true");
    popup.remove();
  });
}

// ── Candidates from real localStorage data ─────────────────
// Reads from the same analyses array that portal.js writes.
// Falls back to demo data if localStorage is empty.

const DEMO_CANDIDATES = [
  {
    display: "Sneha Arora",
    initials: "SA",
    skills: "Python, Sentence Transformers, Vector Search, OpenSearch",
    missing: "None",
    score: 92,
    status: "Interview",
  },
  {
    display: "Nisha Pillai",
    initials: "NP",
    skills: "PyTorch, Weaviate, RAG, Python",
    missing: "None",
    score: 92,
    status: "Interview",
  },
  {
    display: "Arjun Khanna",
    initials: "AK",
    skills: "Information Retrieval, Learning to Rank, Elasticsearch",
    missing: "LLM Fine-tuning",
    score: 91,
    status: "Interview",
  },
  {
    display: "Priya Kumar",
    initials: "PK",
    skills: "Django, SQL, backend services",
    missing: "Embeddings, Vector Search, Ranking Evaluation",
    score: 14,
    status: "Rejected",
  },
];

function getCandidatesForTable() {
  const analyses = getAnalyses();
  if (analyses.length === 0) return DEMO_CANDIDATES;

  return analyses.slice(0, 20).map((a) => ({
    display: a.candidateEmail || "Candidate",
    initials: (a.candidateEmail || "C?")[0].toUpperCase() +
              (a.candidateEmail || "??")[1]?.toUpperCase(),
    skills: a.matchedSkills?.join(", ") || "—",
    missing: a.missingSkills?.join(", ") || "None",
    score: a.score,
    status: a.score >= 75 ? "Interview" :
            a.score >= 60 ? "Screening" : "Rejected",
  }));
}

function renderCandidates() {
  const blindMode = qs("#blindToggle")?.checked;
  const rows = qs("#candidateRows");
  if (!rows) return;

  const candidates = getCandidatesForTable();
  rows.innerHTML = candidates
    .sort((a, b) => b.score - a.score)
    .map((c, i) => {
      const label = blindMode
        ? `Candidate ${String.fromCharCode(65 + i)}`
        : c.display;
      return `
        <tr>
          <td><input type="checkbox"
               aria-label="Select ${label}" /></td>
          <td>
            <strong>${label}</strong><br/>
            <span class="eyebrow">${c.skills}</span>
          </td>
          <td><span class="score ${scoreClass(c.score)} mono">
            ${c.score}%</span></td>
          <td>${c.missing}</td>
          <td><span class="status ${statusClass(c.status)}">
            ${c.status}</span></td>
        </tr>`;
    }).join("");
}

// ── Tab content ────────────────────────────────────────────

const tabContent = {
  gaps: [
    "Vector search and ranking-evaluation experience are missing from this resume, so it scores in the 10–20% range for this Senior AI Engineer role.",
    "The resume shows Python and backend strength, but the role requires production embeddings, hybrid retrieval, and rigorous ranking evaluation (NDCG, MRR, MAP).",
    "Recommended: ship one end-to-end retrieval or ranking system with measurable metrics and resubmit.",
  ],
  strengths: [
    "Backend fundamentals are clear — APIs, relational data modeling, and production debugging.",
    "Good foundation for AI-systems work if paired with modern retrieval/ranking evidence.",
    "Project depth is present; it needs role-specific translation for AI hiring teams.",
  ],
  questions: [
    "Walk me through an embeddings-based retrieval system you deployed to real users.",
    "How would you design an evaluation framework for a ranking system — offline and online?",
    "When would you fine-tune an LLM versus just prompting it, and why?",
  ],
};

function renderTab(name = "gaps") {
  const panel = qs("#tabPanel");
  if (!panel) return;
  panel.innerHTML = `<ul>${
    tabContent[name]
      .map((item) => `<li>${item}</li>`)
      .join("")
  }</ul>`;
}

// ── Tag input ──────────────────────────────────────────────

function addSkill(value) {
  const skill = value.trim();
  if (!skill) return;
  const input = qs("#skillInput");
  const existing = qsa(".tag", qs("#tagInput"))
    .map((t) => t.firstChild.textContent.trim().toLowerCase());
  if (existing.includes(skill.toLowerCase())) {
    showToast(`${skill} is already in the list.`);
    return;
  }
  const tag = document.createElement("span");
  tag.className = "tag";
  tag.innerHTML =
    `${skill}<button type="button"
     aria-label="Remove ${skill}">×</button>`;
  input.before(tag);
  input.value = "";
}

// ── AI Chat ────────────────────────────────────────────────
// Uses Anthropic API via a lightweight proxy fetch.
// If ANTHROPIC_API_KEY is not available in the environment,
// falls back to the smart contextual replies below.
// To enable real AI: set window.ANTHROPIC_API_KEY = "sk-..."
// before this script runs (from a backend-injected meta tag
// or a local config.js that is .gitignored).

let chatHistory = [];

function addChatMessage(text, type = "user") {
  const messages = qs("#messages");
  if (!messages) return;
  const wrapper = document.createElement("div");
  wrapper.className = `message ${type}`;
  wrapper.innerHTML =
    type === "bot"
      ? `<span class="bot-avatar">AI</span><p>${text}</p>`
      : `<p>${text}</p>`;
  messages.appendChild(wrapper);
  messages.scrollTop = messages.scrollHeight;
  return wrapper;
}

function getResumeContext() {
  const analyses = getAnalyses();
  const latest = analyses[0];
  if (!latest) return "";
  return `
Candidate's latest analysis:
  Job: ${latest.jobTitle || "Unknown"}
  Score: ${latest.score}%
  Matched skills: ${(latest.matchedSkills || []).join(", ") || "None"}
  Missing skills: ${(latest.missingSkills || []).join(", ") || "None"}
  Advice: ${latest.advice || ""}
`.trim();
}

async function botReply(prompt) {
  // Show typing indicator
  const typingEl = addChatMessage(
    '<span class="typing-dots"><span>.</span><span>.</span><span>.</span></span>',
    "bot"
  );

  const context = getResumeContext();
  const apiKey  = window.ANTHROPIC_API_KEY || "";

  if (apiKey) {
    // ── Real Anthropic API call ──────────────────────────
    try {
      chatHistory.push({ role: "user", content: prompt });

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-iab": "true",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 400,
          system: `You are TalentLens AI, a helpful career assistant for TalentLens. TalentLens is an AI-powered platform that matches resumes to roles and guides candidates with skill gap analysis.
RULES — never break these:
1. When discussing profile fit, ONLY use data from the context block. Never invent skills, scores, or company information.
2. You can introduce yourself, greet the user, explain what TalentLens is, and offer troubleshooting or general suggestions.
3. If the user asks about their specific fit and context is missing, say: "I don't have your profile yet. Please upload a resume first."
4. Keep responses to 3–4 sentences unless asked for more. Be warm, direct, and specific.

=== CANDIDATE CONTEXT ===
${context || "No resume analyzed yet."}
=== END CONTEXT ===`,
          messages: chatHistory.slice(-10),
        }),
      });

      const data = await res.json();
      const reply = data.content?.[0]?.text
        ?? "I couldn't get a response. Please try again.";

      chatHistory.push({ role: "assistant", content: reply });
      typingEl.innerHTML =
        `<span class="bot-avatar">AI</span><p>${reply}</p>`;

    } catch (err) {
      typingEl.innerHTML =
        `<span class="bot-avatar">AI</span>
         <p>API error. Falling back to local analysis.</p>`;
      localBotReply(prompt, typingEl);
    }

  } else {
    // ── Smart local fallback (no API key) ───────────────
    setTimeout(() => localBotReply(prompt, typingEl), 450);
  }
}

function localBotReply(prompt, el) {
  const lower   = prompt.toLowerCase();
  const context = getResumeContext();
  const analyses = getAnalyses();
  const latest  = analyses[0];

  let reply;

  // General conversational handling
  if (lower.match(/\b(hi|hello|hey|greetings|how are you)\b/)) {
    reply = "Hello! I am the TalentLens AI assistant. I can explain how the platform works, help troubleshoot, or analyze your resume's fit for a role. How can I help today?";
  } else if (lower.includes("talentlens") || lower.includes("website") || lower.includes("who are you") || lower.includes("what is this") || lower.includes("what do you do")) {
    reply = "TalentLens is an AI-powered ATS. We match resumes to specific roles, eliminate bias during screening, and guide candidates with real skill gap analysis.";
  } else if (lower.includes("problem") || lower.includes("error") || lower.includes("not working") || lower.includes("bug") || lower.includes("help") || lower.includes("trouble")) {
    reply = "If you're having trouble, I suggest navigating to the Candidate portal and ensuring you upload a clean PDF or pasting your resume text directly into the text box. If the site is unresponsive, try refreshing.";
  } else if (lower.includes("suggest") || lower.includes("advice") || lower.includes("tip")) {
    if (latest) {
      const missing = latest.missingSkills?.slice(0, 3) || [];
      reply = missing.length 
        ? `My top suggestion is to focus on your missing skills: ${missing.join(", ")}. Building a project with these will boost your score.` 
        : "You have a very strong profile for this role. My suggestion is to make sure your resume highlights your measurable impacts.";
    } else {
      reply = "For general advice, always tailor your resume to the specific job description. If you upload your resume in the Candidate window, I can give you personalized suggestions.";
    }
  } else if (!latest) {
    // Specific profile questions require a resume
    if (lower.includes("score") || lower.includes("why") || lower.includes("pros") || lower.includes("cons")) {
      reply = "I don't have your profile yet. Please upload a resume in the Candidate window first so I can analyze it.";
    } else {
      reply = "That's an interesting question! While I'm operating in offline demo mode, I specialize in analyzing resumes. Try asking me about your 'score', 'missing skills', or 'suggestions' after uploading a resume!";
    }
  } else if (lower.includes("score") || lower.includes("why")) {
    const missing = latest.missingSkills?.join(", ") || "key skills";
    reply = `Your ${latest.score}% score reflects that ${missing} ${
      latest.missingSkills?.length === 1 ? "is" : "are"
    } missing from your resume for the ${latest.jobTitle} role. ${latest.advice || ""}`;
  } else if (lower.includes("pros") || lower.includes("cons") ||
             lower.includes("strength") || lower.includes("weakness")) {
    const matched = latest.matchedSkills?.join(", ") || "some skills";
    const missing = latest.missingSkills?.join(", ") || "a few key areas";
    reply = `Pros: ${matched} all appear in your resume. Cons: ${missing} ${
      latest.missingSkills?.length === 1 ? "is" : "are"
    } not yet evidenced. Address those gaps with a focused project.`;
  } else if (lower.includes("roadmap") || lower.includes("improve") ||
             lower.includes("learn") || lower.includes("upskill")) {
    const missing = latest.missingSkills?.slice(0, 3) || [];
    reply = missing.length
      ? `Focus on: ${missing.join(" → ")}. Build one project that uses all three, write about it clearly on your resume, and resubmit. That should push your score above 60%.`
      : "Your resume already covers the required stack well. Focus on adding measurable impact statements to each bullet point.";
  } else if (lower.includes("interview") || lower.includes("question")) {
    reply = `For the ${latest.jobTitle} role, expect: "Walk me through a ${
      latest.matchedSkills?.[0] || "vector search"
    } component you built." Prepare a specific story with a measurable outcome.`;
  } else {
    // Offline mode generic fallback for when there's a resume but the prompt doesn't match standard queries
    reply = `Based on your ${latest.score}% score for ${latest.jobTitle}: ${latest.advice || "focus on closing the skill gaps in your resume."} (I am in offline mode, so my custom responses are limited!)`;
  }

  el.innerHTML = `<span class="bot-avatar">AI</span><p>${reply}</p>`;
}

// ── Events ─────────────────────────────────────────────────

function initEvents() {
  // Theme
  const saved = localStorage.getItem(TL_KEYS.theme);
  if (saved === "green") {
    document.documentElement.setAttribute("data-theme", "green");
  }

  qs("#themeToggle")?.addEventListener("click", () => {
    const next =
      document.documentElement.getAttribute("data-theme") === "green"
        ? "blue"
        : "green";
    if (next === "green") {
      document.documentElement.setAttribute("data-theme", "green");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    localStorage.setItem(TL_KEYS.theme, next);
  });

  // Navbar scroll shadow
  window.addEventListener("scroll", () => {
    qs("#topbar")?.classList.toggle("scrolled", window.scrollY > 60);
  });

  // Blind mode
  qs("#blindToggle")?.addEventListener("change", () => {
    renderCandidates();
    showToast(
      qs("#blindToggle").checked
        ? "Blind screening enabled."
        : "Recruiter audit log updated for non-blind view."
    );
  });

  // Tag input
  qs("#skillInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addSkill(e.currentTarget.value);
    }
  });

  qs("#tagInput")?.addEventListener("click", (e) => {
    if (e.target.matches(".tag button")) {
      e.target.parentElement.remove();
    }
  });

  // Simulate scan — reads from localStorage, refreshes table
  qs("#simulateButton")?.addEventListener("click", () => {
    renderCandidates();
    showToast("Candidate ranking refreshed from uploaded resumes.");
  });

  // Upload zone — triggers analysis demo
  qs("#uploadZone")?.addEventListener("click", () => {
    const steps = qsa(".step");
    steps.forEach((step, i) => {
      setTimeout(() => {
        step.classList.add("done");
        step.classList.add("animating");
        setTimeout(() => step.classList.remove("animating"), 600);
      }, i * 400);
    });
    qs("#scoreRing")?.style.setProperty("--score", "14");
    showToast("Backend/SQL resume scored 14% for Senior AI Engineer.");
    setTimeout(() => qs("#chatWindow")?.classList.add("open"), 1600);
  });

  // Tabs
  qsa(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      qsa(".tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      renderTab(tab.dataset.tab);
    });
  });

  // Notifications
  qs("#notifyButton")?.addEventListener("click", () => {
    qs("#notificationPanel")?.classList.toggle("open");
  });

  qs("#closeNotifications")?.addEventListener("click", () => {
    qs("#notificationPanel")?.classList.remove("open");
  });

  // Chat
  qs("#chatLauncher")?.addEventListener("click", () => {
    qs("#chatWindow")?.classList.toggle("open");
  });

  qs("#minimizeChat")?.addEventListener("click", () => {
    qs("#chatWindow")?.classList.remove("open");
  });

  qsa("#chips button").forEach((chip) => {
    chip.addEventListener("click", () => {
      addChatMessage(chip.textContent.trim());
      botReply(chip.textContent.trim());
    });
  });

  qs("#chatForm")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const input = qs("#chatInput");
    const value = input.value.trim();
    if (!value) return;
    addChatMessage(value);
    input.value = "";
    botReply(value);
  });
}

// ── Init ───────────────────────────────────────────────────

initPopup();
renderCandidates();
renderTab();
initEvents();
