import os
import base64
import pickle
from datetime import datetime, time, timedelta

import cv2
import numpy as np
from flask import Flask, jsonify, request, send_from_directory
from flask_pymongo import PyMongo
from flask_cors import CORS
from flask_jwt_extended import (
    JWTManager,
    create_access_token,
    jwt_required,
    get_jwt_identity,
)
from werkzeug.utils import secure_filename
from dotenv import load_dotenv
import traceback

# ====== LOAD ENV ======
load_dotenv()

# ====== FACE RECOGNITION IMPORT ======
FACE_LIB_AVAILABLE = False
try:
    import face_recognition
    FACE_LIB_AVAILABLE = True
    print("✅ face_recognition loaded successfully")
except Exception:
    face_recognition = None
    FACE_LIB_AVAILABLE = False
    print("⚠️ face_recognition NOT available - Install: pip install face_recognition")

# ====== FLASK APP + MONGO ======
app = Flask(__name__)
CORS(
    app,
    resources={
        r"/*": {
            "origins": "*",
            "methods": ["GET", "POST", "PUT", "DELETE"],
            "allow_headers": ["Content-Type", "Authorization"],
        }
    },
)

app.config["UPLOAD_FOLDER"] = "static_uploads"
app.config["ENCODINGS_FILE"] = "face_encodings.pkl"
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024
os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

# === JWT config ===
app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "super-secret-dev-key")
jwt = JWTManager(app)

# MongoDB configuration
app.config["MONGO_URI"] = os.getenv(
    "MONGO_URI", "mongodb://localhost:27017/smart_attendance_db"
)
mongo = PyMongo(app)
db = mongo.db

# ====== GLOBAL FACE DATA ======
known_encodings = np.array([])
known_admission_nos = []
known_names = []

# ====== DB INIT (Mongo) ======
def init_db():
    try:
        # create default admin if not exists
        if db.admin.count_documents({"_id": 1}) == 0:
            db.admin.insert_one(
                {
                    "_id": 1,
                    "name": "Nagateja Goli",
                    "email": "nagatejareddygoli@gmail.com",
                    "phone": "+91 7994693055",
                    "photo_path": "/static_uploads/Nagateja Goli.jpg",
                }
            )

        # create simple users collection indexes if needed
        db.users.create_index("email", unique=True)
        print("✅ MongoDB collections ready")
        return True
    except Exception as e:
        print("❌ init_db error:", e)
        print(traceback.format_exc())
        return False

# ====== ATTENDANCE SESSION FUNCTIONS ======
def get_current_session():
    now = datetime.now()
    current_time = now.time()

    am_start = time(9, 0)
    am_end = time(13, 0)
    pm_start = time(14, 0)
    pm_end = time(17, 0)

    if am_start <= current_time <= am_end:
        return "AM"
    elif pm_start <= current_time <= pm_end:
        return "PM"
    return None


def can_mark_attendance(admission_no, branch, session_type):
    now = datetime.now()
    today_str = now.date().isoformat()
    current_time = now.time()

    if session_type == "AM":
        am_start = time(9, 0)
        am_end = time(13, 0)
        if not (am_start <= current_time <= am_end):
            return False, "Attendance only allowed 9AM-1PM for morning session"
    elif session_type == "PM":
        pm_start = time(14, 0)
        pm_end = time(17, 0)
        if not (pm_start <= current_time <= pm_end):
            return False, "Attendance only allowed 2PM-5PM for afternoon session"
    else:
        return False, "Invalid session type"

    existing = db.attendance.find_one(
        {
            "admission_no": admission_no,
            "branch": branch,
            "date": today_str,
            "session": session_type,
        }
    )
    if existing:
        return False, f"Attendance already marked for {session_type} session today"

    return True, "Can mark attendance"

# ====== FACE ENCODINGS HELPERS ======
def load_encodings():
    global known_encodings, known_admission_nos, known_names
    encodings_file = app.config["ENCODINGS_FILE"]
    if os.path.exists(encodings_file):
        try:
            with open(encodings_file, "rb") as f:
                data = pickle.load(f)
            encs = data.get("encodings", [])
            known_encodings = np.array(encs) if len(encs) > 0 else np.array([])
            known_admission_nos = data.get("admission_nos", [])
            known_names = data.get("names", [])
            print(f"✅ Loaded {len(known_encodings)} face encodings")
        except Exception as e:
            print("⚠️ Error loading encodings:", e)
            known_encodings = np.array([])
            known_admission_nos = []
            known_names = []
    else:
        print("ℹ️ No encodings file found")


def save_encodings():
    try:
        data = {
            "encodings": [enc.tolist() for enc in known_encodings],
            "admission_nos": known_admission_nos,
            "names": known_names,
        }
        with open(app.config["ENCODINGS_FILE"], "wb") as f:
            pickle.dump(data, f)
        print(f"💾 Saved {len(known_encodings)} encodings")
    except Exception as e:
        print("⚠️ Error saving encodings:", e)


def cleanup_deleted_faces():
    global known_encodings, known_admission_nos, known_names

    active_students = {
        s["admission_no"] for s in db.students.find({}, {"admission_no": 1})
    }
    deleted_indices = [
        i for i, adm in enumerate(known_admission_nos) if adm not in active_students
    ]

    for idx in reversed(deleted_indices):
        print(f"🗑️ REMOVED: {known_names[idx]} ({known_admission_nos[idx]})")
        known_encodings = np.delete(known_encodings, idx, axis=0)
        del known_admission_nos[idx]
        del known_names[idx]

    save_encodings()
    print(f"✅ Cleanup complete: {len(deleted_indices)} deleted faces removed")

# ====== INITIALIZE ======
print("🔧 Initializing MongoDB...")
init_db()
load_encodings()

# ====== BASIC + AUTH ROUTES ======
@app.route("/")
def index():
    return jsonify({"message": "Smart Attendance Backend - MongoDB Running!"})


@app.route("/api/test_encodings")
def test_encodings():
    return jsonify(
        {
            "known_faces_count": len(known_encodings),
            "known_students": list(zip(known_names, known_admission_nos)),
            "encodings_loaded": bool(len(known_encodings) > 0),
        }
    )


@app.route("/api/stats")
@jwt_required(optional=True)
def stats():
    today = datetime.now().date().isoformat()
    total_students = db.students.count_documents({})
    today_present = db.attendance.count_documents(
        {"date": today, "status": "Present"}
    )
    return jsonify(
        {
            "total": total_students,
            "today_present": today_present,
            "today_date": today,
        }
    )



@app.route("/api/signup", methods=["POST"])
def signup():
    try:
        data = request.get_json() or {}
        email = (data.get("email") or "").strip().lower()
        password = (data.get("password") or "").strip()

        if not email or not password:
            return jsonify({"success": False, "error": "Email and password required"}), 400

        existing = db.users.find_one({"email": email})
        if existing:
            return jsonify({"success": False, "error": "User already exists"}), 409

        db.users.insert_one({"email": email, "password": password})

        access_token = create_access_token(identity=email)
        return jsonify(
            {
                "success": True,
                "message": "Account created successfully",
                "token": access_token,
            }
        ), 201

    except Exception as e:
        tb = traceback.format_exc()
        print("Signup error:", e)
        print(tb)
        return jsonify(
            {
                "success": False,
                "error": f"{type(e).__name__}: {str(e)}",
                "trace": tb,
            }
        ), 500


@app.route("/api/login", methods=["POST"])
def login():
    try:
        data = request.get_json() or {}
        email = (data.get("email") or "").strip().lower()
        password = (data.get("password") or "").strip()

        if not email or not password:
            return jsonify({"success": False, "error": "Email and password required"}), 400

        user = db.users.find_one({"email": email})
        if not user or user.get("password") != password:
            return jsonify({"success": False, "error": "Invalid credentials"}), 401

        access_token = create_access_token(identity=email)
        return jsonify(
            {
                "success": True,
                "message": "Login successful",
                "token": access_token,
            }
        ), 200

    except Exception as e:
        print("Login error:", e)
        print(traceback.format_exc())
        return jsonify({"success": False, "error": f"Server error: {str(e)[:100]}"}), 500


@app.route("/api/protected_test")
@jwt_required()
def protected_test():
    current_user = get_jwt_identity()
    return jsonify({"success": True, "user": current_user})

# ====== STUDENT ROUTES ======
@app.route("/api/students/<branch>")
@jwt_required()
def get_students(branch):
    rows = db.students.find({"branch": branch})
    students = [
        {
            "admission_no": r["admission_no"],
            "name": r["name"],
            "father_name": r.get("father_name", ""),
            "village": r.get("village", ""),
            "branch": r.get("branch", ""),
            "specialization": r.get("specialization", ""),
            "email": r.get("email", ""),
            "phone": r.get("phone", ""),
            "dob": r.get("dob", ""),
            "semester": r.get("semester", ""),
            "face_enrolled": bool(r.get("face_enrolled", False)),
        }
        for r in rows
    ]
    return jsonify(students)


@app.route("/api/search_student", methods=["POST", "GET"])
@jwt_required()
def search_student():
    try:
        if request.is_json:
            data = request.get_json() or {}
            search_term = data.get("search_term", "").strip()
        elif request.method == "GET":
            search_term = request.args.get("search_term", "").strip()
        else:
            search_term = request.form.get("search_term", "").strip()

        if not search_term:
            return jsonify({"success": False, "error": "Search term required"}), 400

        regex = {"$regex": search_term, "$options": "i"}

        student = db.students.find_one(
            {"$or": [{"admission_no": regex}, {"name": regex}]}
        )
        if not student:
            student = db.search_students.find_one(
                {"$or": [{"admission_no": regex}, {"name": regex}]}
            )
            if student:
                result = {
                    "admission_no": student["admission_no"],
                    "name": student["name"],
                    "father_name": "",
                    "village": "",
                    "branch": student["branch"],
                    "specialization": student.get("specialization", ""),
                    "email": student.get("email", ""),
                    "phone": student.get("phone", ""),
                    "dob": student.get("dob", ""),
                    "semester": "",
                    "photo_path": student.get("photo_path"),
                    "face_enrolled": False,
                }
                return jsonify({"success": True, "student": result})
            return jsonify({"success": False, "error": "Student not found"})

        result = {
            "admission_no": student["admission_no"],
            "name": student["name"],
            "father_name": student.get("father_name", ""),
            "village": student.get("village", ""),
            "branch": student["branch"],
            "specialization": student.get("specialization", ""),
            "email": student.get("email", ""),
            "phone": student.get("phone", ""),
            "dob": student.get("dob", ""),
            "semester": student.get("semester", ""),
            "photo_path": student.get("photo_path"),
            "face_enrolled": bool(student.get("face_enrolled", False)),
        }
        return jsonify({"success": True, "student": result})
    except Exception as e:
        print(f"❌ Search error: {e}")
        print(traceback.format_exc())
        return jsonify({"success": False, "error": "Search failed"}), 500


@app.route("/api/add_student", methods=["POST"])
@jwt_required(optional=True)
def add_student():
    try:
        data = request.get_json(silent=True) or {}
        form_data = {}

        if request.content_type and "multipart" in request.content_type.lower():
            form_data = {
                "admission_no": request.form.get("admission_no", "").strip(),
                "name": request.form.get("name", "").strip(),
                "father_name": request.form.get("father_name", "").strip(),
                "village": request.form.get("village", "").strip(),
                "branch": request.form.get("branch", "").strip(),
                "specialization": request.form.get("specialization", "").strip(),
                "email": request.form.get("email", "").strip(),
                "phone": request.form.get("phone", "").strip(),
                "dob": request.form.get("dob", "").strip(),
                "semester": request.form.get("semester", "1").strip(),
            }

        admission_no = (form_data.get("admission_no") or data.get("admission_no", "")).strip()
        name = (form_data.get("name") or data.get("name", "")).strip()
        father_name = (form_data.get("father_name") or data.get("father_name", "")).strip()
        village = (form_data.get("village") or data.get("village", "")).strip()
        branch = (form_data.get("branch") or data.get("branch", "")).strip()
        specialization = (form_data.get("specialization") or data.get("specialization", "")).strip()
        email = (form_data.get("email") or data.get("email", "")).strip()
        phone = (form_data.get("phone") or data.get("phone", "") or "").strip()
        dob = (form_data.get("dob") or data.get("dob", "")).strip()
        semester = form_data.get("semester") or data.get("semester", "1")

        if not all([admission_no, name, branch]):
            missing = []
            if not admission_no:
                missing.append("Admission No")
            if not name:
                missing.append("Name")
            if not branch:
                missing.append("Branch")
            return jsonify({"success": False, "error": f"Missing: {', '.join(missing)}"}), 400

        if db.students.count_documents({"admission_no": admission_no}) > 0:
            return jsonify({"success": False, "error": f"Student {admission_no} already exists!"}), 400

        student_doc = {
            "admission_no": admission_no,
            "name": name,
            "father_name": father_name,
            "village": village,
            "branch": branch,
            "specialization": specialization,
            "email": email,
            "phone": phone,
            "dob": dob,
            "semester": semester,
            "face_enrolled": False,
        }

        photo_path = None
        if "photo" in request.files:
            photo = request.files["photo"]
            if photo and photo.filename:
                filename = secure_filename(f"{admission_no}_{photo.filename.split('.')[0]}.jpg")
                full_path = os.path.join(app.config["UPLOAD_FOLDER"], filename)
                photo.save(full_path)
                photo_path = f"/static_uploads/{filename}"
                student_doc["photo_path"] = photo_path

        db.students.insert_one(student_doc)

        return jsonify(
            {
                "success": True,
                "message": f"Student {name} added successfully!",
                "admission_no": admission_no,
                "photo_path": photo_path,
            }
        )
    except Exception as e:
        print(f"❌ ADD STUDENT ERROR: {e}")
        print(traceback.format_exc())
        return jsonify({"success": False, "error": f"Server error: {str(e)[:100]}"}), 500


@app.route("/api/delete_student", methods=["POST"])
@jwt_required(optional=True)
def delete_student():
    try:
        data = request.get_json() or {}
        admission_no = (data.get("admission_no") or "").strip()

        if not admission_no:
            return jsonify({"success": False, "error": "Admission No required"}), 400

        result = db.students.delete_one({"admission_no": admission_no})
        deleted = result.deleted_count > 0

        if deleted:
            db.attendance.delete_many({"admission_no": admission_no})
            cleanup_deleted_faces()
            return jsonify(
                {"success": True, "message": "Student deleted successfully!"}
            )
        else:
            return jsonify({"success": False, "error": "Student not found"}), 404
    except Exception as e:
        print(f"❌ delete_student error: {e}")
        return jsonify({"success": False, "error": "Delete failed"}), 500


@app.route("/api/delete_search_student", methods=["POST"])
@jwt_required(optional=True)
def delete_search_student():
    try:
        data = request.get_json() or {}
        admission_no = (data.get("admission_no") or "").strip()

        if not admission_no:
            return jsonify({"success": False, "error": "Admission No required"}), 400

        result = db.search_students.delete_one({"admission_no": admission_no})
        deleted = result.deleted_count > 0

        if deleted:
            return jsonify(
                {"success": True, "message": "Search-student record deleted successfully!"}
            )
        else:
            return jsonify(
                {"success": False, "error": "Search-student record not found"}
            ), 404
    except Exception as e:
        print(f"❌ delete_search_student error: {e}")
        return jsonify({"success": False, "error": "Delete failed"}), 500

# ====== FACE ENROLLMENT & ATTENDANCE ======
@app.route("/api/enroll_face", methods=["POST"])
@jwt_required()
def enroll_face():
    if not FACE_LIB_AVAILABLE:
        return jsonify({"success": False, "error": "face_recognition not installed"}), 500

    try:
        data = request.get_json()
        admission_no = (data.get("admission_no") or "").strip()
        name = (data.get("name") or "").strip()
        image_data_url = data.get("image")

        if not all([admission_no, name, image_data_url]):
            return jsonify({"success": False, "error": "Missing fields"}), 400

        student = db.students.find_one({"admission_no": admission_no})
        if student and student.get("face_enrolled", False):
            return (
                jsonify(
                    {
                        "success": False,
                        "error": f"❌ Face already enrolled for {name} ({admission_no})",
                    }
                ),
                400,
            )

        header, encoded = image_data_url.split(",", 1)
        img_bytes = base64.b64decode(encoded)
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return jsonify({"success": False, "error": "Invalid image"}), 400

        rgb_img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        encodings = face_recognition.face_encodings(rgb_img)
        if len(encodings) == 0:
            return jsonify({"success": False, "error": "No face detected"}), 400

        new_encoding = encodings[0]

        global known_encodings, known_admission_nos, known_names
        if len(known_encodings) > 0:
            distances = face_recognition.face_distance(known_encodings, new_encoding)
            best_match_idx = np.argmin(distances)
            if (
                distances[best_match_idx] < 0.4
                and known_admission_nos[best_match_idx] != admission_no
            ):
                return (
                    jsonify(
                        {
                            "success": False,
                            "error": (
                                "🚫 Face already belongs to:\n"
                                f"{known_names[best_match_idx]}\n"
                                f"({known_admission_nos[best_match_idx]})"
                            ),
                        }
                    ),
                    400,
                )

        if len(known_encodings) == 0:
            known_encodings = np.array([new_encoding])
        else:
            known_encodings = np.vstack([known_encodings, new_encoding])
        known_admission_nos.append(admission_no)
        known_names.append(name)
        save_encodings()

        db.students.update_one(
            {"admission_no": admission_no}, {"$set": {"face_enrolled": True}}
        )

        return jsonify({"success": True, "message": f"✅ Face enrolled for {name}!"})
    except Exception as e:
        print(f"❌ enroll_face error: {e}")
        traceback.print_exc()
        return jsonify({"success": False, "error": "Enrollment failed"}), 500


@app.route("/api/mark_attendance", methods=["POST"])
@jwt_required()
def mark_attendance():
    if not FACE_LIB_AVAILABLE:
        return jsonify({"success": False, "error": "face_recognition not installed"}), 500

    try:
        data = request.get_json()
        image_data_url = data.get("image")
        branch = data.get("branch", "CSE")

        if not image_data_url:
            return jsonify({"success": False, "error": "No image provided"}), 400

        header, encoded = image_data_url.split(",", 1)
        img_bytes = base64.b64decode(encoded)
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return jsonify({"success": False, "error": "Invalid image data"}), 400

        rgb_img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        encodings = face_recognition.face_encodings(rgb_img)
        if len(encodings) == 0:
            return (
                jsonify(
                    {
                        "success": False,
                        "error": "No face detected - Try better lighting/closer face",
                    }
                ),
                400,
            )

        face_encoding = encodings[0]

        if len(known_encodings) == 0:
            return (
                jsonify(
                    {
                        "success": False,
                        "error": "No students enrolled yet! Add & enroll faces first",
                    }
                ),
                400,
            )

        distances = face_recognition.face_distance(known_encodings, face_encoding)
        best_match_idx = np.argmin(distances)
        best_distance = distances[best_match_idx]

        if best_distance > 0.6:
            return (
                jsonify(
                    {
                        "success": False,
                        "error": f"Unknown face (confidence: {1 - best_distance:.1f})",
                    }
                ),
                400,
            )

        admission_no = known_admission_nos[best_match_idx]
        name = known_names[best_match_idx]
        confidence = 1 - best_distance

        student = db.students.find_one({"admission_no": admission_no})
        if not student:
            return (
                jsonify(
                    {
                        "success": False,
                        "error": f"Student {name} no longer exists!",
                    }
                ),
                400,
            )

        student_name = student["name"]
        student_branch = student.get("branch", branch)

        session_type = get_current_session()
        if not session_type:
            return (
                jsonify(
                    {
                        "success": False,
                        "error": "Attendance only allowed 9AM-1PM or 2PM-5PM",
                    }
                ),
                400,
            )

        can_mark, message = can_mark_attendance(
            admission_no, student_branch, session_type
        )
        if not can_mark:
            return jsonify({"success": False, "error": message}), 400

        now = datetime.now()
        attendance_doc = {
            "admission_no": admission_no,
            "name": student_name,
            "branch": student_branch,
            "date": now.date().isoformat(),
            "timestamp": now,
            "status": "Present",
            "confidence": float(f"{confidence:.2f}"),
            "session": session_type,
        }
        db.attendance.insert_one(attendance_doc)

        return jsonify(
            {
                "success": True,
                "student": student_name,
                "admission_no": admission_no,
                "confidence": f"{confidence:.2f}",
                "session": session_type,
                "message": f"✅ {session_type} attendance marked for {student_name}!",
            }
        )
    except Exception as e:
        print(f"❌ mark_attendance FULL ERROR: {e}")
        traceback.print_exc()
        return jsonify({"success": False, "error": f"Server error: {str(e)[:100]}"}), 500


@app.route("/api/today_attendance/<branch>", methods=["GET"])
@jwt_required(optional=True)
def today_attendance(branch):
    today = datetime.now().date().isoformat()
    cursor = (
        db.attendance.find(
            {"branch": branch, "date": today, "status": "Present"}
        ).sort("timestamp", -1)
    )

    records = []
    for r in cursor:
        records.append(
            {
                "admission_no": r["admission_no"],
                "name": r["name"],
                "branch": r["branch"],
                "timestamp": r["timestamp"].isoformat(),
                "status": r["status"],
                "confidence": f"{r.get('confidence', 0):.2f}",
                "session": r.get("session", "N/A"),
            }
        )
    return jsonify(records)


@app.route("/api/yesterday_attendance/<branch>", methods=["GET"])
@jwt_required(optional=True)
def yesterday_attendance(branch):
    yesterday = (datetime.now().date() - timedelta(days=1)).isoformat()
    cursor = (
        db.attendance.find(
            {"branch": branch, "date": yesterday, "status": "Present"}
        ).sort("timestamp", -1)
    )

    records = []
    for r in cursor:
        records.append(
            {
                "admission_no": r["admission_no"],
                "name": r["name"],
                "branch": r["branch"],
                "timestamp": r["timestamp"].isoformat(),
                "status": r["status"],
                "confidence": f"{r.get('confidence', 0):.2f}",
                "session": r.get("session", "N/A"),
            }
        )
    return jsonify(records)

# ====== ALL ATTENDANCE ROUTE (NEW) ======
@app.route("/api/all_attendance", methods=["GET"])
@jwt_required(optional=True)
def all_attendance():
    """
    Returns ALL attendance records, newest first.
    Optional query param: ?branch=CSE to filter by branch.
    """
    try:
        branch = request.args.get("branch")  # None or "CSE", "AIML", etc.

        query = {}
        if branch:
            query["branch"] = branch

        cursor = db.attendance.find(query).sort("timestamp", -1)

        records = []
        for r in cursor:
            records.append(
                {
                    "admission_no": r.get("admission_no", ""),
                    "name": r.get("name", ""),
                    "branch": r.get("branch", ""),
                    "date": r.get("date", ""),
                    "timestamp": r["timestamp"].isoformat() if r.get("timestamp") else "",
                    "status": r.get("status", ""),
                    "confidence": f"{r.get('confidence', 0):.2f}",
                    "session": r.get("session", "N/A"),
                }
            )

        return jsonify({"success": True, "records": records})
    except Exception as e:
        print("❌ all_attendance error:", e)
        print(traceback.format_exc())
        return jsonify({"success": False, "error": "Failed to fetch attendance"}), 500

# ====== ADMIN + STATIC ======
@app.route("/api/admin")
@jwt_required()
def admin_details():
    admin = db.admin.find_one({"_id": 1}) or {}
    return jsonify(
        {
            "name": admin.get("name", "Nagateja Goli"),
            "email": admin.get("email", "nagatejareddygoli@gmail.com"),
            "phone": admin.get("phone", "+91 7994693055"),
            "photo": admin.get("photo_path", "/static_uploads/Nagateja Goli.jpg"),
        }
    )


@app.route("/static_uploads/<filename>")
def uploaded_file(filename):
    return send_from_directory(app.config["UPLOAD_FOLDER"], filename)

# ====== START SERVER ======
if __name__ == "__main__":
    print("🚀 Smart Attendance Backend with MongoDB + JWT Starting...")
    print(f"📊 Using DB: {app.config['MONGO_URI']}")
    app.run(debug=True, port=5000, threaded=True)
