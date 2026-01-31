#!/usr/bin/env bash
# scripts/local-e2e.sh

set -euo pipefail

# Configuration (make these configurable)
WORKER_DIR="${WORKER_DIR:-/Users/sh/Sites/sheenapps-claude-worker}"
APP_DIR="${APP_DIR:-/Users/sh/Sites/sheenappsai}"
BASE_URL="${BASE_URL:-http://localhost:3000}"
WORKER_HEALTH_URL="${WORKER_HEALTH_URL:-http://localhost:8081/myhealthz}"
STARTUP_TIMEOUT="${STARTUP_TIMEOUT:-120}" # 2 minutes
MAX_TEST_TIME="${MAX_TEST_TIME:-900}" # 15 minutes max test duration
DEBUG_MODE="${DEBUG_MODE:-false}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

# Process tracking
WORKER_PID=""
APP_PID=""
CLEANUP_DONE=false

# Cleanup function
cleanup() {
  if [ "$CLEANUP_DONE" = true ]; then
    return 0
  fi
  
  log_info "🧹 Cleaning up processes..."
  CLEANUP_DONE=true
  
  # Kill processes gracefully, then forcefully if needed
  if [ -n "$APP_PID" ]; then
    log_info "Stopping NextJS app (PID: $APP_PID)"
    kill "$APP_PID" 2>/dev/null || true
    sleep 2
    kill -9 "$APP_PID" 2>/dev/null || true
  fi
  
  if [ -n "$WORKER_PID" ]; then
    log_info "Stopping Worker service (PID: $WORKER_PID)"
    kill "$WORKER_PID" 2>/dev/null || true
    sleep 2
    kill -9 "$WORKER_PID" 2>/dev/null || true
  fi
  
  # Clean up any remaining processes on our ports
  lsof -ti:3000 | xargs kill -9 2>/dev/null || true
  lsof -ti:8081 | xargs kill -9 2>/dev/null || true
  
  # Give OS time to release ports
  sleep 0.5
  
  log_success "Cleanup completed"
}

# Set up trap for cleanup on exit
trap cleanup EXIT INT TERM

# Validation functions
check_prerequisites() {
  log_info "🔍 Checking prerequisites..."
  
  # Check directories exist
  if [ ! -d "$WORKER_DIR" ]; then
    log_error "Worker directory not found: $WORKER_DIR"
    exit 1
  fi
  
  if [ ! -d "$APP_DIR" ]; then
    log_error "App directory not found: $APP_DIR"
    exit 1
  fi
  
  # Check restart script exists
  if [ ! -f "$WORKER_DIR/restart-clean.sh" ]; then
    log_error "Worker restart script not found: $WORKER_DIR/restart-clean.sh"
    exit 1
  fi
  
  # Check if ports are already in use
  if lsof -i:3000 >/dev/null 2>&1; then
    log_warning "Port 3000 is already in use. Attempting to kill existing processes..."
    lsof -ti:3000 | xargs kill -9 2>/dev/null || true
    sleep 0.5
  fi
  
  if lsof -i:8081 >/dev/null 2>&1; then
    log_warning "Port 8081 is already in use. Attempting to kill existing processes..."
    lsof -ti:8081 | xargs kill -9 2>/dev/null || true
    sleep 0.5
  fi
  
  log_success "Prerequisites check passed"
}

start_worker() {
  log_info "🔧 Starting Worker service..."
  
  pushd "$WORKER_DIR" >/dev/null
  
  # Start worker in background and capture PID
  if [ "$DEBUG_MODE" = "true" ]; then
    ./restart-clean.sh &
  else
    ./restart-clean.sh >/dev/null 2>&1 &
  fi
  
  WORKER_PID=$!
  popd >/dev/null
  
  log_info "Worker started with PID: $WORKER_PID"
}

start_nextjs() {
  log_info "⚡ Starting NextJS application..."
  
  pushd "$APP_DIR" >/dev/null
  
  # Start NextJS in background and capture PID
  if [ "$DEBUG_MODE" = "true" ]; then
    npm run dev:safe &
  else
    npm run dev:safe >/dev/null 2>&1 &
  fi
  
  APP_PID=$!
  popd >/dev/null
  
  log_info "NextJS started with PID: $APP_PID"
}

wait_for_services() {
  log_info "⏳ Waiting for services to be ready..."
  
  # Wait for NextJS to be ready (use favicon to avoid compilation jitter)
  log_info "Waiting for NextJS at $BASE_URL..."
  if ! npx wait-on "$BASE_URL/favicon.ico" --timeout $((STARTUP_TIMEOUT * 1000)) --interval 2000; then
    log_error "NextJS failed to start within $STARTUP_TIMEOUT seconds"
    exit 1
  fi
  log_success "NextJS is ready"
  
  # Wait for Worker to be ready with double-ping for reliability
  log_info "Waiting for Worker at $WORKER_HEALTH_URL..."
  if ! npx wait-on "$WORKER_HEALTH_URL" --timeout $((STARTUP_TIMEOUT * 1000)) --interval 2000; then
    log_error "Worker failed to start within $STARTUP_TIMEOUT seconds"
    exit 1
  fi
  
  # Double-ping Worker health (handles internal restarts)
  log_info "Verifying Worker stability..."
  sleep 2
  if ! curl -f -s "$WORKER_HEALTH_URL" >/dev/null; then
    log_error "Worker health verification failed"
    exit 1
  fi
  log_success "Worker is ready and stable"
  
  # Final health check for NextJS
  log_info "Performing final health checks..."
  if ! curl -f -s "$BASE_URL/en" >/dev/null; then
    log_error "NextJS health check failed"
    exit 1
  fi
  
  log_success "All services are healthy"
}

run_tests() {
  log_info "🧪 Running Playwright tests..."
  
  # Set environment variables for tests
  export BASE_URL
  export TEST_EMAIL="${TEST_EMAIL:-shady.anwar1@gmail.com}"
  export TEST_PASSWORD="${TEST_PASSWORD:-Super1313}"
  export TEST_TIMEOUT="300000" # 5 minutes for build completion
  
  # Run tests with local config and timeout wrapper
  local test_command="npx playwright test --config=playwright.config.local.js"
  
  if [ "$DEBUG_MODE" = "true" ]; then
    test_command="$test_command --headed --trace on"
  fi
  
  # Add grep filter if GREP_FILTER is set (for testing specific tests)
  if [ -n "${GREP_FILTER:-}" ]; then
    test_command="$test_command --grep \"$GREP_FILTER\""
  fi
  
  log_info "Test command: $test_command"
  log_info "Max test duration: ${MAX_TEST_TIME}s"
  
  # Run with timeout to prevent infinite hangs (use gtimeout on macOS if available)
  local timeout_cmd="timeout"
  if [[ "$OSTYPE" == "darwin"* ]]; then
    # Check if gtimeout is available (from coreutils)
    if command -v gtimeout >/dev/null 2>&1; then
      timeout_cmd="gtimeout"
    else
      log_warning "timeout/gtimeout not found. Install with: brew install coreutils"
      log_info "Running tests without timeout protection..."
      timeout_cmd=""
    fi
  fi
  
  # Run tests with or without timeout
  if [ -n "$timeout_cmd" ]; then
    if $timeout_cmd "$MAX_TEST_TIME" bash -c "$test_command"; then
      log_success "✅ All tests passed!"
      return 0
    else
      local exit_code=$?
      if [ $exit_code -eq 124 ]; then
        log_error "❌ Tests timed out after ${MAX_TEST_TIME} seconds"
      else
        log_error "❌ Some tests failed"
      fi
      return 1
    fi
  else
    # Run without timeout
    if bash -c "$test_command"; then
      log_success "✅ All tests passed!"
      return 0
    else
      log_error "❌ Some tests failed"
      return 1
    fi
  fi
}

generate_report() {
  log_info "📊 Generating test report..."
  
  if [ -d "playwright-report" ]; then
    log_success "Test report available at: playwright-report/index.html"
    
    # Open report in browser if on macOS
    if [[ "$OSTYPE" == "darwin"* ]]; then
      open playwright-report/index.html
    fi
  fi
}

# Main execution
main() {
  # Check for --skip-tests flag
  local skip_tests=false
  for arg in "$@"; do
    case $arg in
      --skip-tests)
        skip_tests=true
        shift
        ;;
    esac
  done
  
  if [ "$skip_tests" = true ]; then
    log_info "🚀 Starting Development Services (--skip-tests mode)"
  else
    log_info "🚀 Starting Local E2E Test Suite"
  fi
  
  log_info "Worker Directory: $WORKER_DIR"
  log_info "App Directory: $APP_DIR"
  log_info "Base URL: $BASE_URL"
  log_info "Debug Mode: $DEBUG_MODE"
  echo ""
  
  check_prerequisites
  start_worker
  sleep 5 # Give worker a head start
  start_nextjs
  wait_for_services
  
  if [ "$skip_tests" = true ]; then
    log_success "🎯 All services ready! Running in development mode..."
    log_info "Press Ctrl+C to stop services"
    # Keep services running
    wait
    return 0
  fi
  
  log_success "🎯 All services ready! Running tests..."
  echo ""
  
  local test_exit_code=0
  run_tests || test_exit_code=$?
  
  echo ""
  generate_report
  
  if [ $test_exit_code -eq 0 ]; then
    log_success "🎉 E2E test suite completed successfully!"
  else
    log_error "💥 E2E test suite failed"
  fi
  
  return $test_exit_code
}

# Run main function
main "$@"