// content.js — TruthLens Content Script
// Injected into every page. Handles text extraction and sentence highlighting.

// ─── Listen for messages from popup ──────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "extractText") {
    const result = extractArticleText();
    sendResponse(result);
  }

  if (message.action === "highlightSentences") {
    highlightSentences(message.highlights || []);
    sendResponse({ ok: true });
  }

  return true; // Keep channel open for async
});

// ─── Extract Article Text ─────────────────────────────────
function extractArticleText() {
  // Try <article> tag first, then common content selectors
  const selectors = [
    "article",
    '[role="main"]',
    ".post-content",
    ".article-body",
    ".entry-content",
    ".story-body",
    ".article-content",
    "#article-body",
    "main",
  ];

  let contentEl = null;
  for (const sel of selectors) {
    contentEl = document.querySelector(sel);
    if (contentEl) break;
  }

  if (!contentEl) contentEl = document.body;

  // Remove noisy elements
  const noise = contentEl.querySelectorAll(
    "script, style, nav, footer, header, aside, .ad, .advertisement, .social-share, .comments"
  );
  noise.forEach((el) => el.remove());

  const rawText = contentEl.innerText || contentEl.textContent || "";
  const cleaned = rawText
    .replace(/\s+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return {
    text: cleaned.slice(0, 10000), // cap at 10k chars
    title: document.title,
    url: location.href,
  };
}

// ─── Inject Highlight Styles ──────────────────────────────
function injectStyles() {
  if (document.getElementById("truthlens-styles")) return;

  const style = document.createElement("style");
  style.id = "truthlens-styles";
  style.textContent = `
    .truthlens-highlight {
      position: relative;
      cursor: help;
      border-radius: 2px;
      transition: background 0.2s;
    }

    .truthlens-high {
      background: rgba(255, 71, 87, 0.25);
      border-bottom: 2px solid #ff4757;
    }

    .truthlens-medium {
      background: rgba(255, 165, 2, 0.2);
      border-bottom: 2px solid #ffa502;
    }

    .truthlens-clickbait {
      background: rgba(255, 255, 0, 0.15);
      border-bottom: 2px solid #ffff44;
    }

    .truthlens-tooltip {
      visibility: hidden;
      position: absolute;
      bottom: 110%;
      left: 0;
      background: #0a0a0f;
      border: 1px solid #2a2a3d;
      color: #e8e8f0;
      padding: 8px 10px;
      border-radius: 8px;
      font-size: 12px;
      line-height: 1.5;
      white-space: nowrap;
      max-width: 280px;
      white-space: normal;
      z-index: 99999;
      box-shadow: 0 4px 20px rgba(0,0,0,0.6);
      font-family: 'DM Sans', sans-serif;
      pointer-events: none;
    }

    .truthlens-highlight:hover .truthlens-tooltip {
      visibility: visible;
    }

    /* TruthLens badge */
    #truthlens-badge {
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: #0a0a0f;
      border: 1px solid #2a2a3d;
      border-radius: 12px;
      padding: 8px 14px;
      font-size: 12px;
      color: #e8e8f0;
      font-family: 'DM Sans', sans-serif;
      z-index: 99998;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      cursor: pointer;
      transition: transform 0.2s;
    }

    #truthlens-badge:hover { transform: translateY(-2px); }

    .tl-badge-dot {
      width: 8px; height: 8px;
      border-radius: 50%;
    }
  `;
  document.head.appendChild(style);
}

// ─── Highlight Sentences ──────────────────────────────────
function highlightSentences(highlights) {
  if (!highlights.length) return;
  injectStyles();

  // Remove previous highlights
  clearHighlights();

  const body = document.body;

  highlights.forEach((h) => {
    // Search for sentence text in the DOM
    const sentence = h.sentence.trim();
    if (sentence.length < 10) return;

    // Walk text nodes to find and wrap the sentence
    wrapTextInPage(sentence, h.risk, h.reason);
  });

  // Show badge
  showBadge(highlights.length);
}

function wrapTextInPage(sentence, risk, reason) {
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName?.toLowerCase();
        if (["script", "style", "noscript"].includes(tag)) return NodeFilter.FILTER_REJECT;
        if (parent.classList.contains("truthlens-highlight")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    }
  );

  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);

  for (const node of nodes) {
    const idx = node.textContent.indexOf(sentence);
    if (idx === -1) continue;

    const parent = node.parentElement;
    if (!parent) continue;

    const before = document.createTextNode(node.textContent.slice(0, idx));
    const after = document.createTextNode(node.textContent.slice(idx + sentence.length));

    const span = document.createElement("span");
    span.className = `truthlens-highlight truthlens-${risk}`;
    span.dataset.truthlens = "true";
    span.textContent = sentence;

    const tooltip = document.createElement("span");
    tooltip.className = "truthlens-tooltip";
    tooltip.textContent = `⚠️ ${reason}`;
    span.appendChild(tooltip);

    parent.insertBefore(before, node);
    parent.insertBefore(span, node);
    parent.insertBefore(after, node);
    parent.removeChild(node);

    break; // Only highlight first occurrence
  }
}

function clearHighlights() {
  document.querySelectorAll("[data-truthlens]").forEach((el) => {
    const parent = el.parentNode;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(el.textContent), el);
    parent.normalize();
  });

  const badge = document.getElementById("truthlens-badge");
  if (badge) badge.remove();
}

function showBadge(count) {
  const existing = document.getElementById("truthlens-badge");
  if (existing) existing.remove();

  const badge = document.createElement("div");
  badge.id = "truthlens-badge";
  badge.innerHTML = `
    <div class="tl-badge-dot" style="background: ${count > 3 ? '#ff4757' : '#ffa502'}"></div>
    🔍 TruthLens: ${count} suspicious sentence${count !== 1 ? "s" : ""} highlighted
  `;
  badge.addEventListener("click", () => badge.remove());
  document.body.appendChild(badge);
}