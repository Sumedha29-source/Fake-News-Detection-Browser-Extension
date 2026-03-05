# app.py — TruthLens Flask Backend

from flask import Flask, request, jsonify
from flask_cors import CORS
from model import analyze_article

app = Flask(__name__)
CORS(app)  # Allow requests from the Chrome extension


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "service": "TruthLens Backend"})


@app.route("/analyze", methods=["POST"])
def analyze():
    data = request.get_json()
    if not data or "text" not in data:
        return jsonify({"error": "Missing 'text' field in request body"}), 400

    text = data.get("text", "")
    url = data.get("url", "")
    title = data.get("title", "")

    if len(text.strip()) < 50:
        return jsonify({"error": "Article text is too short to analyze"}), 400

    try:
        result = analyze_article(text, url, title)
        return jsonify(result)
    except Exception as e:
        print(f"[ERROR] Analysis failed: {e}")
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    print("🔍 TruthLens Backend starting on http://localhost:5000")
    app.run(debug=True, port=5000)