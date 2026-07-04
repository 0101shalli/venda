import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
FRONTEND_DIR = ROOT / "frontend"
BACKEND_DIR = ROOT / "backend"
DIST_DIR = FRONTEND_DIR / "dist"


def run_command(command, cwd=None):
    print(f"Running: {' '.join(command)}")
    subprocess.check_call(command, cwd=cwd)


def build_frontend():
    if not (FRONTEND_DIR / "package.json").exists():
        raise FileNotFoundError("frontend/package.json not found")
    run_command(["npm", "install"], cwd=str(FRONTEND_DIR))
    run_command(["npm", "run", "build"], cwd=str(FRONTEND_DIR))


def build_desktop():
    run_command([sys.executable, "-m", "pip", "install", "-r", str(BACKEND_DIR / "requirements.txt")])
    spec_path = ROOT / "desktop.spec"
    if spec_path.exists():
        spec_path.unlink()
    run_command([
        "pyinstaller",
        "--noconfirm",
        "--onefile",
        "--add-data",
        f"{DIST_DIR}{os.pathsep}frontend/dist",
        str(BACKEND_DIR / "app.py"),
    ], cwd=str(ROOT))


def main():
    build_frontend()
    build_desktop()
    print("Desktop build complete. Executable is in the dist/ folder.")


if __name__ == "__main__":
    main()
