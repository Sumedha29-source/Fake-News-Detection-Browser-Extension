# model.py — TruthLens NLP Analysis Engine

import re
import math
import requests
from typing import Optional

# ── Optional: import transformers for Hugging Face model ──────────────────────
# Uncomment these lines if you want to use a real ML model:
#
# from transformers import pipeline
# sentiment_pipeline = pipeline("sentiment-analysis", model="distilbert-base-uncased-finetuned-sst-2-english")
# fake_news_pipeline = pipeline("text-classification", model="hamzab/roberta-fake-news-classification")
#
# For now we use rule-based NLP with spaCy + keyword heuristics.

try:
    import spacy
    nlp = spacy.load("en_core_web_sm")
    SPACY_AVAILABLE = True
except Exception:
    SPACY_AVAILABLE = False
    print("[WARN] spaCy not available — using basic tokenizer")

try:
    from textblob import TextBlob
    TEXTBLOB_AVAILABLE = True
except Exception:
    TEXTBLOB_AVAILABLE = False

# ── Google Fact Check API ──────────────────────────────────────────────────────
GOOGLE_FACTCHECK_API_KEY = "AIzaSyDZnxMTRpK79JDqz1vZvv7eFAKHD7HDhQM"  # Replace with real key
GOOGLE_FACTCHECK_URL = "https://factchecktools.googleapis.com/v1alpha1/claims:search"


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

def analyze_article(text: str, url: str = "", title: str = "") -> dict:
    """
    Full analysis pipeline:
    1. Sentence tokenization
    2. Suspicious sentence detection
    3. Sentiment analysis
    4. Fact checking via Google API
    5. Credibility score calculation
    """

    sentences = tokenize_sentences(text)
    highlights = detect_suspicious_sentences(sentences, title)
    sentiment = analyze_sentiment(text)
    fact_checks = check_facts(sentences[:5])  # Only check top 5 sentences for API rate limits
    credibility_score = compute_credibility_score(highlights, sentiment, fact_checks, url)

    return {
        "credibility_score": credibility_score,
        "highlights": highlights,
        "sentiment": sentiment,
        "fact_checks": fact_checks,
        "sentence_count": len(sentences),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# SENTENCE TOKENIZATION
# ═══════════════════════════════════════════════════════════════════════════════

def tokenize_sentences(text: str) -> list[str]:
    if SPACY_AVAILABLE:
        doc = nlp(text[:50000])  # spaCy limit
        return [sent.text.strip() for sent in doc.sents if len(sent.text.strip()) > 20]
    else:
        # Basic regex fallback
        raw = re.split(r'(?<=[.!?])\s+', text)
        return [s.strip() for s in raw if len(s.strip()) > 20]


# ═══════════════════════════════════════════════════════════════════════════════
# SUSPICIOUS SENTENCE DETECTION
# ═══════════════════════════════════════════════════════════════════════════════

# Patterns that commonly appear in misinformation
MISINFORMATION_PATTERNS = [
    # Absolute claims with no evidence
    (r"\beveryone knows\b", "Unsubstantiated claim using 'everyone knows'"),
    (r"\bscientists? (are|have been) hiding\b", "Conspiracy language: hidden science"),
    (r"\bthey don'?t want you to know\b", "Classic misinformation framing"),
    (r"\bproven (cure|treatment)\b", "Unverified medical claim"),
    (r"\bthe (truth|real truth) (is|about)\b", "Sensationalist framing"),
    (r"\bwake up (sheeple|people|america)\b", "Conspiracy call-to-action"),
    (r"\b100%\s*(guaranteed|proven|effective|safe)\b", "Overstated certainty"),
    (r"\bsecret (they|government|elites?)\b", "Conspiracy language"),
    (r"\bdeep state\b", "Politically charged conspiracy term"),
    (r"\bplandemic\b", "Known misinformation term"),
    (r"\bmicrochip(s|ped)?\b", "Common vaccine misinformation claim"),
]

# Clickbait patterns
CLICKBAIT_PATTERNS = [
    (r"\byou won'?t believe\b", "Clickbait: 'you won't believe' phrasing"),
    (r"\bshock(ing|ingly)?\b.*\b(truth|reveal|expose)\b", "Clickbait: shocking revelation"),
    (r"\b(doctors?|experts?) (hate|don'?t want)\b", "Clickbait: expert opposition framing"),
    (r"\bthis (one|simple) (trick|secret|tip)\b", "Clickbait: 'one trick' pattern"),
    (r"\bwhat (they|he|she) (did next|said) will\b", "Clickbait: mystery teaser"),
    (r"\bbreaking:?\b", "May be used to create false urgency"),
    (r"\bexclusive:?\b", "Exclusivity claim — verify source"),
    (r"!{2,}", "Excessive exclamation points"),
    (r"[A-Z]{5,}", "Excessive capitalization (ALL CAPS)"),
]

# Medium-risk patterns (emotional manipulation)
EMOTIONAL_PATTERNS = [
    (r"\boutrage(d|ous)?\b", "Emotional manipulation trigger word"),
    (r"\bstole the election\b", "Contested political claim"),
    (r"\brig(ged|ging)\b.*\belection\b", "Election fraud claim — highly contested"),
    (r"\bgenocide\b", "Extreme claim — verify carefully"),
    (r"\bcrash(ed)? the economy\b", "Economic doom framing"),
    (r"\bimminent (collapse|doom|disaster)\b", "Fear-mongering language"),
]


def detect_suspicious_sentences(sentences: list[str], title: str = "") -> list[dict]:
    results = []
    seen = set()

    all_checks = sentences[:]
    if title:
        all_checks.insert(0, title)

    for sent in all_checks:
        sent_lower = sent.lower()

        for pattern, reason in MISINFORMATION_PATTERNS:
            if re.search(pattern, sent_lower) and sent not in seen:
                results.append({"sentence": sent[:200], "risk": "high", "reason": reason})
                seen.add(sent)
                break

        for pattern, reason in CLICKBAIT_PATTERNS:
            if re.search(pattern, sent_lower) and sent not in seen:
                results.append({"sentence": sent[:200], "risk": "clickbait", "reason": reason})
                seen.add(sent)
                break

        for pattern, reason in EMOTIONAL_PATTERNS:
            if re.search(pattern, sent_lower) and sent not in seen:
                results.append({"sentence": sent[:200], "risk": "medium", "reason": reason})
                seen.add(sent)
                break

    return results[:10]  # Cap at 10 highlights


# ═══════════════════════════════════════════════════════════════════════════════
# SENTIMENT ANALYSIS
# ═══════════════════════════════════════════════════════════════════════════════

POSITIVE_WORDS = {"good", "great", "excellent", "positive", "success", "benefit", "improve", "helpful", "safe", "proven"}
NEGATIVE_WORDS = {"bad", "terrible", "horrible", "dangerous", "deadly", "fake", "lie", "corrupt", "evil", "hoax", "fraud"}
EMOTIONAL_WORDS = {"shocking", "outrage", "disgusting", "incredible", "unbelievable", "explosive", "bombshell", "alarming", "frightening", "devastating"}


def analyze_sentiment(text: str) -> dict:
    if TEXTBLOB_AVAILABLE:
        blob = TextBlob(text)
        polarity = blob.sentiment.polarity  # -1 to 1
        subjectivity = blob.sentiment.subjectivity  # 0 to 1

        # Map polarity to pos/neg/neutral
        if polarity > 0.1:
            pos = min(0.8, 0.4 + polarity * 0.5)
            neg = max(0.05, 0.1 - polarity * 0.1)
        elif polarity < -0.1:
            neg = min(0.8, 0.4 + abs(polarity) * 0.5)
            pos = max(0.05, 0.1 - abs(polarity) * 0.1)
        else:
            pos = 0.2
            neg = 0.2

        neutral = max(0.0, 1.0 - pos - neg - subjectivity * 0.2)
        emotional = min(0.9, subjectivity * 0.7)

        total = pos + neg + neutral + emotional
        label = "Positive" if pos > neg and pos > neutral else \
                "Negative" if neg > pos and neg > neutral else \
                "Neutral"

        return {
            "label": label,
            "positive": round(pos / total, 2),
            "negative": round(neg / total, 2),
            "neutral": round(neutral / total, 2),
            "emotional": round(emotional / total, 2),
        }

    # Fallback: simple word counting
    words = set(text.lower().split())
    pos_count = len(words & POSITIVE_WORDS)
    neg_count = len(words & NEGATIVE_WORDS)
    emo_count = len(words & EMOTIONAL_WORDS)
    total_words = max(len(words), 1)

    pos = min(0.8, pos_count / total_words * 30)
    neg = min(0.8, neg_count / total_words * 30)
    emo = min(0.8, emo_count / total_words * 30)
    neu = max(0.0, 1.0 - pos - neg - emo)

    label = "Positive" if pos > neg and pos > neu else \
            "Negative" if neg > pos and neg > neu else "Neutral"

    total = pos + neg + neu + emo or 1
    return {
        "label": label,
        "positive": round(pos / total, 2),
        "negative": round(neg / total, 2),
        "neutral": round(neu / total, 2),
        "emotional": round(emo / total, 2),
    }


# ═══════════════════════════════════════════════════════════════════════════════
# FACT CHECKING (Google Fact Check Tools API)
# ═══════════════════════════════════════════════════════════════════════════════

def check_facts(sentences: list[str]) -> list[dict]:
    """
    Query the Google Fact Check Tools API for each sentence.
    Returns list of fact-check results.
    """
    results = []

    if GOOGLE_FACTCHECK_API_KEY == "YOUR_GOOGLE_FACTCHECK_API_KEY":
        # Return demo data if no API key configured
        return get_demo_fact_checks()

    for sentence in sentences:
        # Extract a short query (first 100 chars)
        query = sentence[:100].strip()
        if len(query) < 20:
            continue

        try:
            response = requests.get(
                GOOGLE_FACTCHECK_URL,
                params={"key": GOOGLE_FACTCHECK_API_KEY, "query": query},
                timeout=5,
            )
            if response.status_code == 200:
                data = response.json()
                claims = data.get("claims", [])
                for claim in claims[:2]:  # Max 2 per sentence
                    reviews = claim.get("claimReview", [])
                    if reviews:
                        review = reviews[0]
                        results.append({
                            "claim": claim.get("text", query)[:120],
                            "rating": review.get("textualRating", "Unverified"),
                            "source": review.get("publisher", {}).get("name", "Unknown"),
                            "url": review.get("url", ""),
                        })
        except Exception as e:
            print(f"[WARN] Fact check API error: {e}")
            continue

    return results[:5]  # Cap at 5 results


def get_demo_fact_checks() -> list[dict]:
    """Demo fact-check data shown when no API key is configured."""
    return [
        {
            "claim": "No API key configured — connect Google Fact Check API",
            "rating": "Not Checked",
            "source": "TruthLens Demo Mode",
            "url": "",
        }
    ]


# ═══════════════════════════════════════════════════════════════════════════════
# CREDIBILITY SCORE
# ═══════════════════════════════════════════════════════════════════════════════

# Known reliable domains get a score bonus
TRUSTED_DOMAINS = {
    "reuters.com", "apnews.com", "bbc.com", "bbc.co.uk",
    "nytimes.com", "washingtonpost.com", "theguardian.com",
    "npr.org", "pbs.org", "economist.com", "nature.com",
    "science.org", "nejm.org", "who.int", "cdc.gov",
    "nih.gov", ".gov", ".edu"
}

UNTRUSTED_DOMAINS = {
    "infowars.com", "naturalnews.com", "breitbart.com",
    "beforeitsnews.com", "worldnewsdailyreport.com",
    "theonion.com",  # satire
}


def compute_credibility_score(
    highlights: list[dict],
    sentiment: dict,
    fact_checks: list[dict],
    url: str = "",
) -> int:
    score = 75  # Start at 75 (benefit of the doubt)

    # Penalize for suspicious sentences
    high_risk = sum(1 for h in highlights if h["risk"] == "high")
    medium_risk = sum(1 for h in highlights if h["risk"] == "medium")
    clickbait = sum(1 for h in highlights if h["risk"] == "clickbait")

    score -= high_risk * 12
    score -= medium_risk * 6
    score -= clickbait * 4

    # Penalize for high emotional manipulation
    if sentiment.get("emotional", 0) > 0.5:
        score -= 8
    if sentiment.get("negative", 0) > 0.6:
        score -= 5

    # Adjust for fact checks
    for fc in fact_checks:
        rating = fc.get("rating", "").lower()
        if any(word in rating for word in ["false", "misleading", "incorrect", "wrong", "pants on fire"]):
            score -= 15
        elif any(word in rating for word in ["true", "correct", "accurate", "mostly true"]):
            score += 5

    # Domain trust adjustment
    domain = extract_domain(url)
    if domain:
        if any(trusted in domain for trusted in TRUSTED_DOMAINS):
            score += 10
        if any(untrusted in domain for untrusted in UNTRUSTED_DOMAINS):
            score -= 25

    return max(0, min(100, score))


def extract_domain(url: str) -> Optional[str]:
    match = re.search(r"https?://(?:www\.)?([^/]+)", url)
    return match.group(1).lower() if match else None