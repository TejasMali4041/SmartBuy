from flask import Blueprint, request
from werkzeug.security import generate_password_hash, check_password_hash
from extensions import db
from models.user import User

auth = Blueprint("auth", __name__)


@auth.route("/api/register", methods=["POST"])
def register():
    data = request.get_json()

    name = data.get("name")
    email = data.get("email")
    password = data.get("password")

    if not name or not email or not password:
        return {"message": "All fields are required"}, 400

    existing_user = User.query.filter_by(email=email).first()

    if existing_user:
        return {"message": "Email already registered"}, 409

    hashed_password = generate_password_hash(password)

    new_user = User(
        name=name,
        email=email,
        password=hashed_password
    )

    db.session.add(new_user)
    db.session.commit()

    return {"message": "Registration successful"}, 201

@auth.route("/api/login", methods=["POST"])
def login():
    data = request.get_json()

    email = data.get("email")
    password = data.get("password")

    if not email or not password:
        return {"message": "Email and password are required"}, 400

    user = User.query.filter_by(email=email).first()

    if not user:
        return {"message": "Invalid email or password"}, 401

    if not check_password_hash(user.password, password):
        return {"message": "Invalid email or password"}, 401

    return {
        "message": "Login successful",
        "user": {
            "id": user.id,
            "name": user.name,
            "email": user.email
        }
    }, 200