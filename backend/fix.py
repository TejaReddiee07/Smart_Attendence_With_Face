import subprocess
import sys
import os

print("🔧 Fixing Mark Attendance installation...")

# Fix pip/setuptools
subprocess.check_call([sys.executable, "-m", "pip", "install", "--upgrade", "pip", "setuptools", "wheel"])

# Install compatible numpy first
subprocess.check_call([sys.executable, "-m", "pip", "install", "numpy==1.26.4"])

# Install core packages
packages = [
    "Flask==2.3.3",
    "Flask-CORS==4.0.0", 
    "opencv-python==4.8.1.78",
    "Pillow==10.0.1",
    "Werkzeug==2.3.7"
]

for pkg in packages:
    subprocess.check_call([sys.executable, "-m", "pip", "install", pkg])

print("✅ Core packages installed! Install face_recognition separately:")
print("pip install cmake")
print("pip install face_recognition")
