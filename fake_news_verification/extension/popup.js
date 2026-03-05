// popup.js — TruthLens Extension Popup Logic

const BACKEND_URL = "http://localhost:5000";

// ─── State ───────────────────────────────────────────────
let currentState = "idle"; // idle | loading | results | error

// ─── Init ─────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("analyze-btn").addEventListener("click", startAnalysis);

  // Check if we have cached results for this tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tabId = tabs[0]?.id;
    if (tabId) {
      chrome.storage.session.get([`result_${tabId}`], (data) => {
        const cached = data[`result_${tabId}`];
        if (cached) showResults(cached);
      });
    }
  });
});

// ─── Start Analysis ───────────────────────────────────────
function startAnalysis() {
  setState("loading");
  animateLoadingSteps();

  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tab = tabs[0];
    if (!tab?.id) return showError("No active tab found.");

    try {
      // Send message to content.js to extract page text
      const response = await chrome.tabs.sendMessage(tab.id, { action: "extractText" });

      if (!response?.text) {
        return showError("Could not extract article text from this page.");
      }

      // Send to backend for analysis
      const result = await analyzeText(response.text, tab.url, response.title);

      // Cache result
      chrome.storage.session.set({ [`result_${tab.id}`]: result });

      // Tell content.js to highlight sentences
      chrome.tabs.sendMessage(tab.id, {
        action: "highlightSentences",
        highlights: result.highlights,
      });

      showResults(result);
    } catch (err) {
      showError(err.message || "Unexpected error occurred.");
    }
  });
}

// ─── Call Backend API ─────────────────────────────────────
async function analyzeText(text, url, title) {
  const res = await fetch(`${BACKEND_URL}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, url, title }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Server error" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }

  return res.json();
}

// ─── Show Results ─────────────────────────────────────────
function showResults(data) {
  setState("results");

  // Score ring
  const score = data.credibility_score || 0;
  const ring = document.getElementById("score-ring");
  const circumference = 213.6;
  const offset = circumference - (score / 100) * circumference;
  ring.style.strokeDashoffset = offset;
  ring.style.stroke = scoreColor(score);

  document.getElementById("score-number").textContent = score;
  document.getElementById("score-number").style.color = scoreColor(score);

  // Verdict
  const { title, desc, emoji, color, bg } = getVerdict(score);
  document.getElementById("verdict-title").textContent = title;
  document.getElementById("verdict-desc").textContent = desc;

  const badge = document.getElementById("verdict-badge");
  badge.textContent = `${emoji} ${title}`;
  badge.style.background = bg;
  badge.style.color = color;

  // Highlights
  const highlights = data.highlights || [];
  document.getElementById("highlights-count").textContent = highlights.length;

  if (highlights.length > 0) {
    const infoEl = document.getElementById("highlights-info");
    infoEl.innerHTML = highlights
      .map((h) => {
        const riskColor = h.risk === "high" ? "#ff4757" : h.risk === "medium" ? "#ffa502" : "#ffff44";
        return `<div style="
          margin-bottom:8px;
          padding:8px 10px;
          background: ${riskColor}15;
          border-left: 3px solid ${riskColor};
          border-radius:4px;
          font-size:11px;
          color: var(--text);
          line-height:1.5;
        ">${h.sentence}<br><span style="color:${riskColor};font-size:10px;margin-top:4px;display:block">
          ${h.reason}
        </span></div>`;
      })
      .join("");
  }

  // Fact checks
  const facts = data.fact_checks || [];
  document.getElementById("facts-count").textContent = facts.length;

  if (facts.length > 0) {
    const factsBody = document.getElementById("facts-body");
    factsBody.innerHTML = facts
      .map((f) => {
        const icon = f.rating === "true" ? "✅" : f.rating === "false" ? "❌" : "⚠️";
        return `<div class="claim-item">
          <div class="claim-status">${icon}</div>
          <div class="claim-text">
            <strong>${f.claim}</strong>
            Rating: <em>${f.rating}</em>
            <div class="claim-source">Source: ${f.source}</div>
          </div>
        </div>`;
      })
      .join("");
  }

  // Sentiment
  const sentiment = data.sentiment || {};
  const overall = sentiment.label || "Neutral";
  document.getElementById("sentiment-label").textContent = overall;

  setBar("positive", sentiment.positive || 0);
  setBar("neutral", sentiment.neutral || 0);
  setBar("negative", sentiment.negative || 0);
  setBar("emotional", sentiment.emotional || 0);

  document.getElementById("footer-bar").style.display = "flex";
}

function setBar(id, value) {
  const pct = Math.round(value * 100);
  document.getElementById(`bar-${id}`).style.width = `${pct}%`;
  document.getElementById(`pct-${id}`).textContent = `${pct}%`;
}

// ─── States ───────────────────────────────────────────────
function setState(state) {
  currentState = state;
  document.getElementById("idle-state").style.display = state === "idle" ? "block" : "none";
  document.getElementById("loading-state").style.display = state === "loading" ? "block" : "none";
  document.getElementById("results-state").style.display = state === "results" ? "block" : "none";
  document.getElementById("error-state").style.display = state === "error" ? "block" : "none";
}

function resetToIdle() {
  setState("idle");
  document.getElementById("footer-bar").style.display = "none";
}

function showError(msg) {
  setState("error");
  document.getElementById("error-detail").textContent = msg;
}

// ─── Loading Animation ────────────────────────────────────
function animateLoadingSteps() {
  const steps = ["step-extract", "step-nlp", "step-facts", "step-score"];
  const delays = [0, 800, 1800, 2800];

  steps.forEach((id, i) => {
    const el = document.getElementById(id);
    el.className = "loading-step";
    setTimeout(() => {
      if (currentState !== "loading") return;
      if (i > 0) {
        document.getElementById(steps[i - 1]).className = "loading-step done";
        document.getElementById(steps[i - 1]).querySelector(".step-icon").textContent = "✅";
      }
      el.className = "loading-step active";
    }, delays[i]);
  });
}

// ─── Helpers ──────────────────────────────────────────────
function scoreColor(score) {
  if (score >= 70) return "#2ed573";
  if (score >= 40) return "#ffa502";
  return "#ff4757";
}

function getVerdict(score) {
  if (score >= 80)
    return {
      title: "Credible",
      desc: "This article appears to be reliable and well-sourced.",
      emoji: "✅",
      color: "#0a2e1a",
      bg: "#2ed57333",
    };
  if (score >= 60)
    return {
      title: "Mostly Credible",
      desc: "Minor concerns detected. Verify key claims independently.",
      emoji: "🟡",
      color: "#2e2000",
      bg: "#ffa50233",
    };
  if (score >= 40)
    return {
      title: "Questionable",
      desc: "Several red flags found. Cross-check before sharing.",
      emoji: "⚠️",
      color: "#2e1500",
      bg: "#ff630033",
    };
  return {
    title: "Likely Misleading",
    desc: "High misinformation risk detected. Do not share.",
    emoji: "🚨",
    color: "#2e0000",
    bg: "#ff475733",
  };
}

function toggleSection(id) {
  document.getElementById(id).classList.toggle("open");
}