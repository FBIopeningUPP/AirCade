from flask import Flask, request, jsonify
import hashlib
import os
import time

app = Flask(__name__)

users = {}
scores = {}
tokens = {}

SECRET = os.environ.get("SECRET_KEY", "dev-secret-change-me")

def hash_pw(pw):
    return hashlib.sha256(pw.encode()).hexdigest()

def gen_token():
    return hashlib.sha256(os.urandom(32)).hexdigest()

def get_user_from_token(tok):
    if tok in tokens:
        return tokens[tok]
    return None

@app.route("/signup", methods=["POST"])
def signup():
    data = request.get_json()
    if not data:
        return jsonify({"error": "json required"}), 400
    username = data.get("username")
    password = data.get("password")
    if not username:
        return jsonify({"error": "username required"}), 400
    if not password:
        return jsonify({"error": "password required"}), 400
    if username in users:
        return jsonify({"error": "username taken"}), 400
    users[username] = hash_pw(password)
    scores[username] = []
    tok = gen_token()
    tokens[tok] = username
    return jsonify({"token": tok})

@app.route("/login", methods=["POST"])
def login():
    data = request.get_json()
    if not data:
        return jsonify({"error": "json required"}), 400
    username = data.get("username")
    password = data.get("password")
    if not username or not password:
        return jsonify({"error": "username and password required"}), 400
    if username not in users:
        return jsonify({"error": "user not found"}), 401
    if users[username] != hash_pw(password):
        return jsonify({"error": "incorrect password"}), 401
    tok = gen_token()
    tokens[tok] = username
    return jsonify({"token": tok})

@app.route("/score", methods=["POST"])
def submit_score():
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return jsonify({"error": "token required"}), 401
    tok = auth[7:]
    username = get_user_from_token(tok)
    if not username:
        return jsonify({"error": "invalid token"}), 401
    data = request.get_json()
    if not data:
        return jsonify({"error": "json required"}), 400
    score = data.get("score")
    if score is None:
        return jsonify({"error": "score required"}), 400
    try:
        score = int(score)
    except (ValueError, TypeError):
        return jsonify({"error": "score must be integer"}), 400
    scores[username].append({"score": score, "ts": time.time()})
    # print(f"saved score {score} for {username}")
    return jsonify({"ok": True})

@app.route("/leaderboard", methods=["GET"])
def leaderboard():
    all_scores = []
    for user, user_scores in scores.items():
        for s in user_scores:
            all_scores.append({"username": user, "score": s["score"], "ts": s["ts"]})
    all_scores.sort(key=lambda x: x["score"], reverse=True)
    top = all_scores[:10]
    return jsonify(top)

# TODO: add token expiration cleanup

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)