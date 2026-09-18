from flask import Blueprint, request
from flask_jwt_extended import create_access_token, get_jwt_identity, jwt_required
from werkzeug.security import generate_password_hash, check_password_hash
from extensions import db
from models.user import User

auth = Blueprint("auth", __name__)

@auth.post("/api/register")
def register():
    data = request.get_json(silent=True) or {}

    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))

    if not name or not email or not password:
        return {"message": "All fields are required"}, 400

    if len(password) < 6:
        return {"message": "Password must be at least 6 characters"}, 400

    if User.query.filter_by(email=email).first():
        return {"message": "Email already registered"}, 409

    user = User(
        name=name,
        email=email,
        password=generate_password_hash(password)
    )

    try:
        db.session.add(user)
        db.session.commit()
    except Exception:
        db.session.rollback()
        return {"message": "Could not create user"}, 500

    return {
        "message": "Registration successful",
        "user": {"id": user.id, "name": user.name, "email": user.email}
    }, 201


@auth.post("/api/login")
def login():
    data = request.get_json(silent=True) or {}

    email = str(data.get("email", "")).strip().lower()
    password = str(data.get("password", ""))

    user = User.query.filter_by(email=email).first()

    if not user or not check_password_hash(user.password, password):
        return {"message": "Invalid email or password"}, 401

    token = create_access_token(identity=str(user.id))

    return {
        "message": "Login successful",
        "access_token": token,
        "user": {"id": user.id, "name": user.name, "email": user.email}
    }, 200


@auth.get("/api/me")
@jwt_required()
def me():
    user_id = int(get_jwt_identity())
    user = db.session.get(User, user_id)

    if not user:
        return {"message": "User not found"}, 404

    return {
        "user": {"id": user.id, "name": user.name, "email": user.email}
    }
