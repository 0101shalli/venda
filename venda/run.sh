#!/bin/bash
set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
FRONTEND_DIR="$PROJECT_ROOT/frontend"

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}Venda - General Store IMS${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

# Function to print status
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[i]${NC} $1"
}

# Check if Python is available
if ! command -v python3 &> /dev/null; then
    print_error "Python3 is not installed. Please install Python 3.8 or higher."
    exit 1
fi
print_status "Python3 found: $(python3 --version)"

# Check if Node.js is available
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js."
    exit 1
fi
print_status "Node.js found: $(node --version)"

echo ""
echo -e "${YELLOW}Setting up backend...${NC}"

# Create data directory if it doesn't exist
DATA_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/GeneralStoreIMS"
mkdir -p "$DATA_DIR"
print_status "Data directory: $DATA_DIR"

# Install backend dependencies
if [ ! -d "$BACKEND_DIR/venv" ]; then
    print_info "Creating Python virtual environment..."
    python3 -m venv "$BACKEND_DIR/venv"
fi

# Activate virtual environment
source "$BACKEND_DIR/venv/bin/activate"
print_status "Virtual environment activated"

# Install/upgrade pip
print_info "Updating pip..."
pip install --upgrade pip setuptools wheel > /dev/null 2>&1

# Install Python dependencies
print_info "Installing Python dependencies..."
if [ -f "$BACKEND_DIR/requirements.txt" ]; then
    pip install -r "$BACKEND_DIR/requirements.txt"
    print_status "Backend dependencies installed"
else
    print_error "requirements.txt not found in backend directory"
    exit 1
fi

echo ""
echo -e "${YELLOW}Setting up frontend...${NC}"

# Install frontend dependencies
if [ ! -d "$FRONTEND_DIR/node_modules" ]; then
    print_info "Installing npm dependencies (this may take a while)..."
    cd "$FRONTEND_DIR"
    npm install
    cd "$PROJECT_ROOT"
    print_status "Frontend dependencies installed"
else
    print_status "Frontend dependencies already installed"
fi

echo ""
echo -e "${YELLOW}Starting services...${NC}"
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down services...${NC}"
    if [ ! -z "$BACKEND_PID" ]; then
        kill $BACKEND_PID 2>/dev/null || true
    fi
    if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID 2>/dev/null || true
    fi
    print_status "Services stopped"
}

trap cleanup EXIT INT TERM

# Start backend
print_info "Starting backend server on http://localhost:8000..."
cd "$BACKEND_DIR"
python3 -m uvicorn app:app --reload --host 127.0.0.1 --port 8000 &
BACKEND_PID=$!
print_status "Backend started (PID: $BACKEND_PID)"

# Give backend a moment to start
sleep 2

# Start frontend
print_info "Starting frontend dev server on http://localhost:5173..."
cd "$FRONTEND_DIR"
npm run dev &
FRONTEND_PID=$!
print_status "Frontend started (PID: $FRONTEND_PID)"

echo ""
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}System is running!${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo -e "Backend API:  ${BLUE}http://localhost:8000${NC}"
echo -e "Frontend:     ${BLUE}http://localhost:5173${NC}"
echo ""
echo -e "${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

# Wait for both processes
wait
