from flask import Flask, request, jsonify
import jwt

app = Flask(__name__)
SECRET = "change_me"

users = {}
scores = {}

def get_user_from_token():
    auth = request.headers.get('Authorization')
    if not auth or not auth.startswith('Bearer '):
        return None
    token = auth[7:]
    try:
        data = jwt.decode(token, SECRET, algorithms=['HS256'])
        return data.get('user')
    except:
        return None

@app.route('/signup', methods=['POST'])
def signup():
    data = request.get_json()
    u = data.get('username')
    p = data.get('password')
    if not u or not p:
        return jsonify({'error': 'username and password required'}), 400
    if u in users:
        return jsonify({'error': 'user exists'}), 400
    users[u] = p
    token = jwt.encode({'user': u}, SECRET, algorithm='HS256')
    return jsonify({'token': token})

@app.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    u = data.get('username')
    p = data.get('password')
    if users.get(u) != p:
        return jsonify({'error': 'invalid credentials'}), 401
    token = jwt.encode({'user': u}, SECRET, algorithm='HS256')
    return jsonify({'token': token})

@app.route('/score', methods=['POST'])
def submit_score():
    user = get_user_from_token()
    if not user:
        return jsonify({'error': 'unauthorized'}), 401
    data = request.get_json()
    sc = data.get('score')
    if not isinstance(sc, int):
        return jsonify({'error': 'score must be integer'}), 400
    if sc > scores.get(user, 0):
        scores[user] = sc
        # print(f'new high for {user}: {sc}')
    return jsonify({'high_score': scores[user]})

@app.route('/leaderboard')
def leaderboard():
    sorted_scores = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    top = [{'username': u, 'score': s} for u, s in sorted_scores[:10]]
    return jsonify(top)

# TODO: add token expiration

if __name__ == '__main__':
    app.run(debug=True, port=5000)