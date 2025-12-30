import os
import base64
import pickle
import sqlite3
from datetime import datetime, time
from flask import send_from_directory


import cv2
import numpy as np
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename
import traceback



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


# ====== FLASK APP ======
app = Flask(__name__)
CORS(app, resources={r"/*": {
    "origins": "*",
    "methods": ["GET", "POST", "PUT", "DELETE"],
    "allow_headers": ["Content-Type", "Authorization"]
}})


# ====== CONFIG ======
app.config['UPLOAD_FOLDER'] = 'static_uploads'
app.config['ENCODINGS_FILE'] = 'face_encodings.pkl'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)


# ====== GLOBAL FACE DATA ======
known_encodings = np.array([])
known_admission_nos = []
known_names = []


# ====== DB HELPERS ======
def get_db_connection():
    try:
        conn = sqlite3.connect('database.db', timeout=10)
        conn.execute("PRAGMA foreign_keys = OFF")
        return conn
    except Exception as e:
        print(f"❌ DB Connection error: {e}")
        return None


def init_db():
    conn = get_db_connection()
    if not conn:
        print("❌ Cannot connect to database")
        return False

    try:
        c = conn.cursor()

        c.execute('''CREATE TABLE IF NOT EXISTS students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            admission_no TEXT UNIQUE,
            name TEXT NOT NULL,
            father_name TEXT DEFAULT '',
            village TEXT DEFAULT '',
            branch TEXT NOT NULL,
            specialization TEXT DEFAULT '',
            email TEXT DEFAULT '',
            phone TEXT DEFAULT '',
            dob TEXT DEFAULT '',
            semester TEXT DEFAULT '',
            face_enrolled INTEGER DEFAULT 0
        )''')

        c.execute('''CREATE TABLE IF NOT EXISTS search_students (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            admission_no TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            branch TEXT NOT NULL,
            specialization TEXT DEFAULT '',
            phone TEXT DEFAULT '',
            email TEXT DEFAULT '',
            dob TEXT DEFAULT '',
            photo_path TEXT DEFAULT ''
        )''')

        c.execute('''CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            admission_no TEXT NOT NULL,
            name TEXT NOT NULL,
            branch TEXT NOT NULL,
            timestamp TEXT NOT NULL,
            status TEXT NOT NULL,
            confidence REAL DEFAULT 0,
            session TEXT DEFAULT ''
        )''')

        c.execute('''CREATE TABLE IF NOT EXISTS admin (
            id INTEGER PRIMARY KEY,
            name TEXT DEFAULT 'Admin',
            email TEXT DEFAULT '',
            phone TEXT DEFAULT '',
            photo_path TEXT DEFAULT ''
        )''')

        c.execute("""INSERT OR IGNORE INTO admin
                     (id, name, email, phone, photo_path)
                     VALUES (1, 'Nagateja Goli',
                             'nagatejareddygoli@gmail.com',
                             '+91 7994693055',
                             'Nagateja Goli.jpg')""")

        conn.commit()
        conn.close()
        print("✅ All tables created successfully!")
        return True
    except Exception as e:
        print(f"❌ init_db error: {e}")
        print(traceback.format_exc())
        if conn:
            conn.rollback()
            conn.close()
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
        return 'AM'
    elif pm_start <= current_time <= pm_end:
        return 'PM'
    return None


def can_mark_attendance(admission_no, branch, session_type):
    now = datetime.now()
    today = now.date()
    current_time = now.time()

    if session_type == 'AM':
        am_start = time(9, 0)
        am_end = time(13, 0)
        if not (am_start <= current_time <= am_end):
            return False, "Attendance only allowed 9AM-1PM for morning session"
    elif session_type == 'PM':
        pm_start = time(14, 0)
        pm_end = time(17, 0)
        if not (pm_start <= current_time <= pm_end):
            return False, "Attendance only allowed 2PM-5PM for afternoon session"
    else:
        return False, "Invalid session type"

    conn = sqlite3.connect('database.db')
    c = conn.cursor()
    c.execute('''
        SELECT id FROM attendance 
        WHERE admission_no=? AND branch=? AND DATE(timestamp)=? AND session=?
    ''', (admission_no, branch, today, session_type))
    existing_record = c.fetchone()
    conn.close()

    if existing_record:
        return False, f"Attendance already marked for {session_type} session today"

    return True, "Can mark attendance"


# ====== FACE ENCODINGS HELPERS ======
def load_encodings():
    global known_encodings, known_admission_nos, known_names
    encodings_file = app.config['ENCODINGS_FILE']
    if os.path.exists(encodings_file):
        try:
            with open(encodings_file, 'rb') as f:
                data = pickle.load(f)
            encs = data.get('encodings', [])
            known_encodings = np.array(encs) if len(encs) > 0 else np.array([])
            known_admission_nos = data.get('admission_nos', [])
            known_names = data.get('names', [])
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
            'encodings': [enc.tolist() for enc in known_encodings],
            'admission_nos': known_admission_nos,
            'names': known_names
        }
        with open(app.config['ENCODINGS_FILE'], 'wb') as f:
            pickle.dump(data, f)
        print(f"💾 Saved {len(known_encodings)} encodings")
    except Exception as e:
        print("⚠️ Error saving encodings:", e)


def cleanup_deleted_faces():
    global known_encodings, known_admission_nos, known_names

    conn = sqlite3.connect('database.db')
    c = conn.cursor()
    c.execute('SELECT admission_no FROM students')
    active_students = {row[0] for row in c.fetchall()}
    conn.close()

    deleted_indices = []
    for i, admission_no in enumerate(known_admission_nos):
        if admission_no not in active_students:
            deleted_indices.append(i)

    for idx in reversed(deleted_indices):
        print(f"🗑️ REMOVED: {known_names[idx]} ({known_admission_nos[idx]})")
        known_encodings = np.delete(known_encodings, idx, axis=0)
        del known_admission_nos[idx]
        del known_names[idx]

    save_encodings()
    print(f"✅ Cleanup complete: {len(deleted_indices)} deleted faces removed")


# ====== INITIALIZE ======
print("🔧 Initializing database...")
init_db()
load_encodings()


# ====== BASIC ROUTES ======
@app.route('/')
def index():
    return jsonify({"message": "Smart Attendance Backend - Running!"})


@app.route('/api/test_encodings')
def test_encodings():
    return jsonify({
        'known_faces_count': len(known_encodings),
        'known_students': list(zip(known_names, known_admission_nos)),
        'encodings_loaded': bool(len(known_encodings) > 0)
    })


@app.route('/api/stats')
def stats():
    conn = sqlite3.connect('database.db')
    c = conn.cursor()
    today = datetime.now().strftime('%Y-%m-%d')

    c.execute('SELECT COUNT(*) FROM students')
    total_students = c.fetchone()[0]

    c.execute('SELECT COUNT(*) FROM attendance WHERE DATE(timestamp)=? AND status="Present"', (today,))
    today_present = c.fetchone()[0]

    conn.close()
    return jsonify({
        'total': total_students,
        'today_present': today_present,
        'today_date': today
    })


@app.route('/api/students/<branch>')
def get_students(branch):
    conn = sqlite3.connect('database.db')
    c = conn.cursor()
    c.execute('''SELECT admission_no, name, specialization, email, semester, face_enrolled
                 FROM students WHERE branch=?''', (branch,))
    rows = c.fetchall()
    conn.close()

    students = [{
        'admission_no': r[0],
        'name': r[1],
        'specialization': r[2] or '',
        'email': r[3] or '',
        'semester': r[4] or '',
        'face_enrolled': bool(r[5])
    } for r in rows]

    return jsonify(students)


# ====== SEARCH / ADD / DELETE STUDENT ======
@app.route('/api/search_student', methods=['POST', 'GET'])
def search_student():
    try:
        search_term = ''
        if request.is_json:
            data = request.get_json() or {}
            search_term = data.get('search_term', '').strip()
        elif request.method == 'GET':
            search_term = request.args.get('search_term', '').strip()
        else:
            search_term = request.form.get('search_term', '').strip()

        if not search_term:
            return jsonify({'success': False, 'error': 'Search term required'}), 400

        conn = sqlite3.connect('database.db')
        c = conn.cursor()

        # search both students and search_students, first match only
        c.execute('''
            SELECT admission_no, name, father_name, village, branch, specialization, 
                   email, phone, dob, semester, '' AS photo_path, face_enrolled
            FROM students 
            WHERE LOWER(admission_no) LIKE LOWER(?) OR LOWER(name) LIKE LOWER(?)
            UNION ALL
            SELECT admission_no, name, '' AS father_name, '' AS village, branch, 
                   specialization, email, phone, dob, '' AS semester, photo_path, 0 AS face_enrolled
            FROM search_students 
            WHERE LOWER(admission_no) LIKE LOWER(?) OR LOWER(name) LIKE LOWER(?)
            LIMIT 1
        ''', (f'%{search_term}%', f'%{search_term}%',
              f'%{search_term}%', f'%{search_term}%'))

        student = c.fetchone()
        conn.close()

        if student:
            (admission_no, name, father_name, village, branch, specialization,
             email, phone, dob, semester, photo_path, face_enrolled) = student

            return jsonify({
                'success': True,
                'student': {
                    'admission_no': admission_no,
                    'name': name,
                    'father_name': father_name or '',
                    'village': village or '',
                    'branch': branch,
                    'specialization': specialization or '',
                    'email': email or '',
                    'phone': phone or '',
                    'dob': dob or '',
                    'semester': semester or '',
                    'photo_path': photo_path or None,
                    'face_enrolled': bool(face_enrolled)
                }
            })

        return jsonify({'success': False, 'error': 'Student not found'})
    except Exception as e:
        print(f"❌ Search error: {e}")
        print(traceback.format_exc())
        return jsonify({'success': False, 'error': 'Search failed'}), 500



@app.route('/api/add_student', methods=['POST'])
def add_student():
    try:
        data = request.get_json(silent=True) or {}
        form_data = {}

        if request.content_type and 'multipart' in request.content_type.lower():
            form_data = {
                'admission_no': request.form.get('admission_no', '').strip(),
                'name': request.form.get('name', '').strip(),
                'father_name': request.form.get('father_name', '').strip(),
                'village': request.form.get('village', '').strip(),
                'branch': request.form.get('branch', '').strip(),
                'specialization': request.form.get('specialization', '').strip(),
                'email': request.form.get('email', '').strip(),
                # phone is OPTIONAL now:
                'phone': request.form.get('phone', '').strip(),
                'dob': request.form.get('dob', '').strip(),
                'semester': request.form.get('semester', '1').strip()
            }

        admission_no = form_data.get('admission_no') or data.get('admission_no', '').strip()
        name = form_data.get('name') or data.get('name', '').strip()
        father_name = form_data.get('father_name') or data.get('father_name', '').strip()
        village = form_data.get('village') or data.get('village', '').strip()
        branch = form_data.get('branch') or data.get('branch', '').strip()
        specialization = form_data.get('specialization') or data.get('specialization', '').strip()
        email = form_data.get('email') or data.get('email', '').strip()
        # phone can be empty string if not provided from Manage Students UI
        phone = (form_data.get('phone') or data.get('phone', '') or '').strip()
        dob = form_data.get('dob') or data.get('dob', '').strip()
        semester = form_data.get('semester') or data.get('semester', '1')

        # Only mandatory: admission_no, name, branch
        if not all([admission_no, name, branch]):
            missing = []
            if not admission_no: missing.append('Admission No')
            if not name: missing.append('Name')
            if not branch: missing.append('Branch')
            return jsonify({'success': False, 'error': f'Missing: {", ".join(missing)}'}), 400

        conn = sqlite3.connect('database.db')
        c = conn.cursor()

        c.execute('SELECT COUNT(*) FROM students WHERE admission_no = ?', (admission_no,))
        if c.fetchone()[0] > 0:
            conn.close()
            return jsonify({'success': False, 'error': f'Student {admission_no} already exists!'}), 400

        c.execute('''
            INSERT INTO students (admission_no, name, father_name, village, branch,
                                  specialization, email, phone, dob, semester, face_enrolled)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        ''', (admission_no, name, father_name, village, branch, specialization,
              email, phone, dob, semester))

        photo_path = None
        if 'photo' in request.files:
            photo = request.files['photo']
            if photo and photo.filename:
                filename = secure_filename(f"{admission_no}_{photo.filename.split('.')[0]}.jpg")
                full_path = os.path.join(app.config['UPLOAD_FOLDER'], filename)
                photo.save(full_path)
                # store relative URL used by frontend
                photo_path = f"/static_uploads/{filename}"

        conn.commit()
        conn.close()

        return jsonify({
            'success': True,
            'message': f'Student {name} added successfully!',
            'admission_no': admission_no,
            'photo_path': photo_path
        })
    except Exception as e:
        print(f"❌ ADD STUDENT ERROR: {e}")
        print(traceback.format_exc())
        return jsonify({'success': False, 'error': f'Server error: {str(e)[:100]}'}), 500


@app.route('/api/delete_student', methods=['POST'])
def delete_student():
    try:
        data = request.get_json() or {}
        admission_no = data.get('admission_no', '').strip()

        if not admission_no:
            return jsonify({'success': False, 'error': 'Admission No required'}), 400

        conn = sqlite3.connect('database.db')
        c = conn.cursor()

        # delete ONLY from students table
        c.execute('DELETE FROM students WHERE admission_no = ?', (admission_no,))
        deleted = c.rowcount > 0
        conn.commit()
        conn.close()

        if deleted:
            # keep face encodings in sync with students table
            cleanup_deleted_faces()
            return jsonify({'success': True, 'message': 'Student deleted successfully!'})
        else:
            return jsonify({'success': False, 'error': 'Student not found'}), 404
    except Exception as e:
        print(f"❌ delete_student error: {e}")
        return jsonify({'success': False, 'error': 'Delete failed'}), 500

    
@app.route('/api/delete_search_student', methods=['POST'])
def delete_search_student():
    try:
        data = request.get_json() or {}
        admission_no = data.get('admission_no', '').strip()

        if not admission_no:
            return jsonify({'success': False, 'error': 'Admission No required'}), 400

        conn = sqlite3.connect('database.db')
        c = conn.cursor()

        # delete ONLY from search_students table
        c.execute('DELETE FROM search_students WHERE admission_no = ?', (admission_no,))
        deleted = c.rowcount > 0
        conn.commit()
        conn.close()

        if deleted:
            return jsonify({'success': True, 'message': 'Search-student record deleted successfully!'})
        else:
            return jsonify({'success': False, 'error': 'Search-student record not found'}), 404
    except Exception as e:
        print(f"❌ delete_search_student error: {e}")
        return jsonify({'success': False, 'error': 'Delete failed'}), 500




# ====== FACE ENROLLMENT & ATTENDANCE ======
@app.route('/api/enroll_face', methods=['POST'])
def enroll_face():
    if not FACE_LIB_AVAILABLE:
        return jsonify({'success': False, 'error': 'face_recognition not installed'}), 500

    try:
        data = request.get_json()
        admission_no = data.get('admission_no', '').strip()
        name = data.get('name', '').strip()
        image_data_url = data.get('image')

        if not all([admission_no, name, image_data_url]):
            return jsonify({'success': False, 'error': 'Missing fields'}), 400

        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        c.execute('SELECT face_enrolled FROM students WHERE admission_no=?', (admission_no,))
        student = c.fetchone()
        conn.close()

        if student and student[0] == 1:
            return jsonify({'success': False, 'error': f'❌ Face already enrolled for {name} ({admission_no})'}), 400

        header, encoded = image_data_url.split(',', 1)
        img_bytes = base64.b64decode(encoded)
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return jsonify({'success': False, 'error': 'Invalid image'}), 400

        rgb_img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        encodings = face_recognition.face_encodings(rgb_img)
        if len(encodings) == 0:
            return jsonify({'success': False, 'error': 'No face detected'}), 400

        new_encoding = encodings[0]

        global known_encodings, known_admission_nos, known_names
        if len(known_encodings) > 0:
            distances = face_recognition.face_distance(known_encodings, new_encoding)
            best_match_idx = np.argmin(distances)
            if distances[best_match_idx] < 0.4 and known_admission_nos[best_match_idx] != admission_no:
                return jsonify({
                    'success': False,
                    'error': f'🚫 Face already belongs to:\n{known_names[best_match_idx]}\n({known_admission_nos[best_match_idx]})'
                }), 400

        if len(known_encodings) == 0:
            known_encodings = np.array([new_encoding])
        else:
            known_encodings = np.vstack([known_encodings, new_encoding])
        known_admission_nos.append(admission_no)
        known_names.append(name)
        save_encodings()

        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        c.execute('UPDATE students SET face_enrolled=1 WHERE admission_no=?', (admission_no,))
        conn.commit()
        conn.close()

        return jsonify({'success': True, 'message': f'✅ Face enrolled for {name}!'})
    except Exception as e:
        print(f"❌ enroll_face error: {e}")
        traceback.print_exc()
        return jsonify({'success': False, 'error': 'Enrollment failed'}), 500


@app.route('/api/mark_attendance', methods=['POST'])
def mark_attendance():
    if not FACE_LIB_AVAILABLE:
        return jsonify({'success': False, 'error': 'face_recognition not installed'}), 500

    try:
        data = request.get_json()
        image_data_url = data.get('image')
        branch = data.get('branch', 'CSE')

        if not image_data_url:
            return jsonify({'success': False, 'error': 'No image provided'}), 400

        header, encoded = image_data_url.split(',', 1)
        img_bytes = base64.b64decode(encoded)
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return jsonify({'success': False, 'error': 'Invalid image data'}), 400

        rgb_img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        encodings = face_recognition.face_encodings(rgb_img)
        if len(encodings) == 0:
            return jsonify({'success': False, 'error': 'No face detected - Try better lighting/closer face'}), 400

        face_encoding = encodings[0]

        if len(known_encodings) == 0:
            return jsonify({'success': False, 'error': 'No students enrolled yet! Add & enroll faces first'}), 400

        distances = face_recognition.face_distance(known_encodings, face_encoding)
        best_match_idx = np.argmin(distances)
        best_distance = distances[best_match_idx]

        if best_distance > 0.6:
            return jsonify({'success': False, 'error': f'Unknown face (confidence: {1 - best_distance:.1f})'}), 400

        admission_no = known_admission_nos[best_match_idx]
        name = known_names[best_match_idx]
        confidence = 1 - best_distance

        conn = sqlite3.connect('database.db')
        c = conn.cursor()
        c.execute('SELECT name, branch FROM students WHERE admission_no=?', (admission_no,))
        student = c.fetchone()
        if not student:
            conn.close()
            return jsonify({'success': False, 'error': f'Student {name} no longer exists!'}), 400

        student_name, student_branch = student

        session_type = get_current_session()
        if not session_type:
            conn.close()
            return jsonify({'success': False, 'error': 'Attendance only allowed 9AM-1PM or 2PM-5PM'}), 400

        can_mark, message = can_mark_attendance(admission_no, student_branch, session_type)
        if not can_mark:
            conn.close()
            return jsonify({'success': False, 'error': message}), 400

        timestamp = datetime.now().isoformat()
        c.execute('''
            INSERT INTO attendance (admission_no, name, branch, timestamp, status, confidence, session)
            VALUES (?, ?, ?, ?, 'Present', ?, ?)
        ''', (admission_no, student_name, student_branch, timestamp, f"{confidence:.2f}", session_type))
        conn.commit()
        conn.close()

        return jsonify({
            'success': True,
            'student': student_name,
            'admission_no': admission_no,
            'confidence': f"{confidence:.2f}",
            'session': session_type,
            'message': f'✅ {session_type} attendance marked for {student_name}!'
        })
    except Exception as e:
        print(f"❌ mark_attendance FULL ERROR: {e}")
        traceback.print_exc()
        return jsonify({'success': False, 'error': f'Server error: {str(e)[:100]}'}), 500


@app.route('/api/today_attendance/<branch>', methods=['GET'])
def today_attendance(branch):
    conn = sqlite3.connect('database.db')
    c = conn.cursor()
    today = datetime.now().strftime('%Y-%m-%d')

    c.execute('''
        SELECT admission_no, name, branch, timestamp, status, confidence, session
        FROM attendance 
        WHERE branch=? AND DATE(timestamp)=? AND status='Present'
        ORDER BY timestamp DESC
    ''', (branch, today))

    records = [{
        'admission_no': r[0],
        'name': r[1],
        'branch': r[2],
        'timestamp': r[3],
        'status': r[4],
        'confidence': r[5] or 'N/A',
        'session': r[6] or 'N/A'
    } for r in c.fetchall()]

    conn.close()
    return jsonify(records)


# ====== ADMIN + STATIC ======
@app.route('/api/admin')
def admin_details():
    conn = sqlite3.connect('database.db')
    c = conn.cursor()
    c.execute('SELECT name, email, phone, photo_path FROM admin WHERE id=1')
    admin = c.fetchone()
    conn.close()
    return jsonify({
        'name': admin[0] if admin else 'Nagateja Goli',
        'email': admin[1] if admin else 'nagatejareddygoli@gmail.com',
        'phone': admin[2] if admin else '+91 7994693055',
        'photo': admin[3] if admin else '/static_uploads/Nagateja Goli.jpg'
    })


@app.route('/static_uploads/<filename>')
def uploaded_file(filename):
    return send_from_directory(app.config['UPLOAD_FOLDER'], filename)


# ====== START SERVER ======
if __name__ == '__main__':
    print("🚀 Smart Attendance Backend Starting...")
    app.run(debug=True, port=5000, threaded=True)
