#!/bin/bash
# NINJA_RUNNER_VERSION=0.1.7
# ──────────────────────────────────────────────────────────────────────────────
#   Ninja Runner  |  Build Script
#   Author : Maharshi Bhavsar
#   Managed: Auto-updated by the Ninja Runner VS Code extension
# ──────────────────────────────────────────────────────────────────────────────
#
# Prerequisites:
#   - If you get permission denied error, ensure script is executable:
#       chmod +x build.sh
#
# Usage:
#   ./build.sh dev                 - Stop existing frontend and restart fresh
#   ./build.sh war                 - Build Spring Boot WAR (prod)
#   ./build.sh war staging         - Build Spring Boot WAR for staging
#   ./build.sh war beta            - Build Spring Boot WAR for beta
#   ./build.sh war uat             - Build Spring Boot WAR for uat
#   ./build.sh zip                 - Build React/Next.js and zip it (prod)
#   ./build.sh zip staging         - Build React/Next.js for staging
#   ./build.sh zip war             - Both WAR + zip (prod)  -> built/prod/
#   ./build.sh zip war staging     - Both WAR + zip staging -> built/staging/
#   ./build.sh zip war keep        - Build without cleaning env subfolder first

set -Eeuo pipefail
# NINJA_BUILD_DIR can be set externally to run this script from a different location
dir="${NINJA_BUILD_DIR:-$(cd -P -- "$(dirname -- "$0")" && pwd -P)}"

# ── ANSI color helpers ─────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

info()    { echo -e "${CYAN}[INFO]${RESET}    $*"; }
success() { echo -e "${GREEN}[SUCCESS]${RESET} $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}    $*"; }
error()   { echo -e "${RED}[ERROR]${RESET}   $*"; }
step()    { echo -e "${BLUE}[BUILD]${RESET}   $*"; }
line()    { echo -e "${BOLD}──────────────────────────────────────────────────────${RESET}"; }

# ── Detect OS ─────────────────────────────────────────────────────────────────
IS_WINDOWS=false
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" || "$OSTYPE" == "cygwin" ]]; then
    IS_WINDOWS=true
    info "Windows environment detected"
else
    info "Linux/Unix environment detected"
fi

# ── Helper: kill process listening on a port ──────────────────────────────────
kill_port() {
    local port=$1
    local pids=""

    if [ "$IS_WINDOWS" = true ]; then
        pids=$(netstat -ano | grep ":$port " | grep "LISTENING" | awk '{print $5}' | sort -u 2>/dev/null || echo "")
        if [ -n "$pids" ]; then
            for pid in $pids; do
                taskkill //PID "$pid" //F 2>/dev/null || true
            done
            return 0
        fi
    else
        pids=$(fuser "$port/tcp" 2>/dev/null || echo "")
        if [ -n "$pids" ]; then
            fuser -k "$port/tcp" 2>/dev/null || true
            return 0
        fi
    fi
    return 1
}

# ── Helper: check if port is free ─────────────────────────────────────────────
is_port_free() {
    local port=$1
    if [ "$IS_WINDOWS" = true ]; then
        ! netstat -ano | grep ":$port " | grep -q "LISTENING"
    else
        ! lsof -i:"$port" -sTCP:LISTEN >/dev/null 2>&1
    fi
}

# ── Dev mode: stop existing frontend process and start fresh ──────────────────
if [[ $@ == *"dev"* ]]; then
    cd "$dir/frontend"

    info "Stopping frontend process for $(basename "$dir")..."

    if [ "$IS_WINDOWS" = true ]; then
        pids=$(wmic process where "name='node.exe'" get ProcessId,CommandLine /format:csv 2>/dev/null \
            | grep -i "$(echo "$dir/frontend" | sed 's/\\/\\\\/g')" \
            | awk -F',' '{print $3}' | grep -v '^$' || echo "")
    else
        pids=$(lsof -ti -sTCP:LISTEN -a -c node 2>/dev/null | while read -r pid; do
            cwd=$(readlink -f "/proc/$pid/cwd" 2>/dev/null || echo "")
            if [[ "$cwd" == "$dir/frontend"* ]]; then
                echo "$pid"
            fi
        done)
    fi

    if [ -n "$pids" ]; then
        info "Found process(es): $pids"
        if [ "$IS_WINDOWS" = true ]; then
            for pid in $pids; do
                taskkill //PID "$pid" //F 2>/dev/null || true
            done
        else
            echo "$pids" | xargs kill -9 2>/dev/null || true
        fi
        success "Frontend stopped for $(basename "$dir")"
    else
        info "No running frontend found for $(basename "$dir")"
    fi

    sleep 2
    info "Starting fresh frontend server for $(basename "$dir")..."
    info "Ninja Runner by @AkhilNinja"
    npm run dev
    exit 0
fi

# ── Build mode ────────────────────────────────────────────────────────────────

# Determine environment and output subfolder
env_folder="prod"
env_profile="prod"
env_node="production"
if [[ $@ == *"staging"* ]]; then
    env_folder="staging"; env_profile="staging"; env_node="test"
elif [[ $@ == *"beta"* ]]; then
    env_folder="beta"; env_profile="beta"; env_node="beta"
elif [[ $@ == *"uat"* ]]; then
    env_folder="uat"; env_profile="uat"; env_node="uat"
fi

line
echo -e "  ${BOLD}Ninja Runner Build${RESET}  |  project: ${CYAN}$(basename "$dir")${RESET}  |  env: ${YELLOW}${env_folder}${RESET}"
line
echo ""

# Clean only this environment's subfolder (other envs are untouched)
if [[ $@ != *"keep"* ]]; then
    rm -rf "built/${env_folder}"
fi

# ── Spring Boot WAR ───────────────────────────────────────────────────────────
if [[ $@ == *"war"* ]]; then
    step "Building Spring Boot WAR  [profile: ${env_folder}]"
    cd "$dir/backend"
    mvn clean install -Dspring.profiles.active="${env_profile}" -DskipTests
    cd "$dir"
fi

# ── Next.js / React frontend ──────────────────────────────────────────────────
if [[ $@ == *"zip"* ]]; then
    step "Building frontend  [NODE_ENV: ${env_node}]"
    cd "$dir/frontend"
    rm -rf built
    export NODE_ENV="${env_node}"
    export NEXT_TELEMETRY_DISABLED=1
    # Disable static export timeout — prevents hanging on unreachable API routes
    export NEXT_STATIC_EXPORT_TIMEOUT=30000
    npm run build
    cd built
    x=$(ls -d */ | head -n 1 | sed 's#/##')
    zip -r -9 -qdg "$x.zip" "$x"
    rm -rf "$x"
    cd "$dir"
fi

# ── Collect artefacts into built/<env>/ ───────────────────────────────────────
echo ""
mkdir -p "built/${env_folder}"

if [[ $@ == *"war"* ]]; then
    mv backend/target/*.war "built/${env_folder}/"
    success "WAR  ->  built/${env_folder}/"
fi

if [[ $@ == *"zip"* ]]; then
    mv frontend/built/*.zip "built/${env_folder}/"
    rm -rf frontend/built
    success "ZIP  ->  built/${env_folder}/"
fi

echo ""
line
echo -e "  ${GREEN}${BOLD}BUILD COMPLETE${RESET}  |  ${YELLOW}${env_folder}${RESET}  ->  ${CYAN}built/${env_folder}/${RESET}"
line
echo ""
echo -e "  ${BOLD}Ninja Runner by @AkhilNinja${RESET}"
echo ""

# ── Signal completion to the Ninja Runner extension ──────────────────────────
# The extension watches this file to know when to start the next build phase.
echo "${env_folder}" > "${dir}/.ninja_build_status"
