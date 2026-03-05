# Fake-News-Detection-Browser-Extension
A browser extension (for example in Google Chrome) that automatically analyzes the text of a news article when a user opens a webpage and tells whether the content might be fake or misleading.  It uses Natural Language Processing (NLP) and fact-checking APIs to analyze the article.
# 🔍 TruthLens — Fake News Detection Browser Extension

A Chrome extension that automatically analyzes news articles for credibility, highlights suspicious sentences, and checks facts in real-time using NLP and the Google Fact Check API.

---

## 📁 Project Structure

```
fake-news-extension/
│
├── extension/
│   ├── manifest.json       # Chrome extension config (Manifest V3)
│   ├── popup.html          # Extension popup UI
│   ├── popup.js            # Popup logic + API calls
│   ├── content.js          # Injected into pages (text extraction + highlighting)
│   └── background.js       # Service worker (cache management)
│
├── backend/
│   ├── app.py              # Flask REST API server
│   ├── model.py            # NLP analysis engine
│   └── requirements.txt    # Python dependencies
│
└── README.md
```

---

## ⚙️ Setup Instructions

### 1. Backend Setup (Python / Flask)

```bash
cd backend

# Create a virtual environment
python -m venv venv
source venv/bin/activate       # macOS/Linux
venv\Scripts\activate          # Windows

# Install dependencies
pip install -r requirements.txt

# Download spaCy English model
python -m spacy download en_core_web_sm

# Download TextBlob corpora
python -m textblob.download_corpora

# Start the server
python app.py
```

The backend will run at: `http://localhost:5000`

You can verify it's running by visiting: `http://localhost:5000/health`

---

### 2. Chrome Extension Setup

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer Mode** (top right toggle)
3. Click **"Load unpacked"**
4. Select the `extension/` folder from this project
5. The TruthLens icon will appear in your toolbar

---

### 3. Google Fact Check API (Optional but Recommended)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project and enable the **Fact Check Tools API**
3. Generate an API key
4. Open `backend/model.py` and replace:
   ```python
   GOOGLE_FACTCHECK_API_KEY = "YOUR_GOOGLE_FACTCHECK_API_KEY"
   ```
   with your actual key.

> Without an API key, the extension runs in **demo mode** and skips real fact checking.

---

## 🚀 How to Use

1. Navigate to any news article in Chrome
2. Click the TruthLens icon in your toolbar
3. Click **"⚡ ANALYZE PAGE"**
4. View the results:
   - **Credibility Score** (0–100 ring chart)
   - **Highlighted suspicious sentences** directly on the page
   - **Fact-check results** from the Google API
   - **Sentiment analysis** breakdown

---

## 🧠 How It Works

### Credibility Score
The score starts at 75 and is adjusted based on:
- Number of high/medium risk sentences found (penalty)
- Emotional manipulation level (penalty)
- Fact check results (penalty for false, bonus for true)
- Domain trust (bonus for reuters.com, bbc.com, etc.)

### Suspicious Sentence Detection
Uses regex pattern matching against known categories:
- **High risk**: conspiracy language, false medical claims, hidden-truth framing
- **Medium risk**: emotional manipulation triggers, contested political claims
- **Clickbait**: "you won't believe", excessive caps/punctuation, mystery teasers

### Sentiment Analysis
Uses [TextBlob](https://textblob.readthedocs.io/) to compute:
- Positive / Negative / Neutral polarity
- Subjectivity → Emotional manipulation score

### Upgrading to ML Models
In `model.py`, uncomment the Hugging Face section to use:
- `distilbert-base-uncased-finetuned-sst-2-english` for sentiment
- `hamzab/roberta-fake-news-classification` for fake news detection

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|-----------|
| Extension Frontend | HTML, CSS, JavaScript, Chrome Extension API (Manifest V3) |
| Backend | Python, Flask, Flask-CORS |
| NLP | spaCy, TextBlob, regex heuristics |
| ML (optional) | Hugging Face Transformers |
| Fact Checking | Google Fact Check Tools API |

---

## 📝 API Endpoints

### `GET /health`
Health check.
```json
{ "status": "ok", "service": "TruthLens Backend" }
```

### `POST /analyze`
Analyze an article.

**Request:**
```json
{
  "text": "Full article text here...",
  "url": "https://example.com/article",
  "title": "Article headline"
}
```

**Response:**
```json
{
  "credibility_score": 62,
  "highlights": [
    { "sentence": "They don't want you to know...", "risk": "high", "reason": "Classic misinformation framing" }
  ],
  "sentiment": { "label": "Negative", "positive": 0.1, "negative": 0.5, "neutral": 0.3, "emotional": 0.1 },
  "fact_checks": [
    { "claim": "...", "rating": "False", "source": "PolitiFact", "url": "..." }
  ],
  "sentence_count": 42
}
```

---

## 🔒 Privacy
- Article text is sent only to your **local backend** (localhost:5000)
- No data is stored permanently — all analysis is stateless
- The Google Fact Check API receives only short query strings

---

