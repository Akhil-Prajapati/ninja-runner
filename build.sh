#!/bin/bash

# Author: Maharshi Bhavsar
# Script to build Spring Boot WAR & React build for production
# Prerequisites:
#   - If you get permission denied error, ensure script is executable
#     by running `chmod +x build.sh`
# Usage:
#   - To make Spring Boot WAR:
#       ./build.sh war
#   - To make Spring Boot WAR for specific environment:
#       ./build.sh war staging
#       ./build.sh war beta
#       ./build.sh war uat
#   - To make React build & zip it:
#       ./build.sh zip
#   - To make React build for specific environment:
#       ./build.sh zip staging
#       ./build.sh zip beta
#       ./build.sh zip uat
#   - Both together (note that order of arguments does not matter):
#       ./build.sh zip war
#       ./build.sh zip war staging
#   - Pass `keep` to keep existing build folder as it is
#       ./build.sh zip war keep

set -Eeuo pipefail
dir="$(cd -P -- "$(dirname -- "$0")" && pwd -P)"

# Detect OS
IS_WINDOWS=false
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "win32" || "$OSTYPE" == "cygwin" ]]; then
    IS_WINDOWS=true
    echo "🪟 Detected Windows environment"
else
    echo "🐧 Detected Linux/Unix environment"
fi

# Function to kill process on port - cross-platform
kill_port() {
    local port=$1
    local pids=""
    
    if [ "$IS_WINDOWS" = true ]; then
        # Windows
        pids=$(netstat -ano | grep ":$port " | grep "LISTENING" | awk '{print $5}' | sort -u 2>/dev/null || echo "")
        if [ -n "$pids" ]; then
            for pid in $pids; do
                taskkill //PID "$pid" //F 2>/dev/null || true
            done
            return 0
        fi
    else
        # Linux/Unix
        pids=$(fuser "$port/tcp" 2>/dev/null || echo "")
        if [ -n "$pids" ]; then
            fuser -k "$port/tcp" 2>/dev/null || true
            return 0
        fi
    fi
    return 1
}

# Function to check if port is free
is_port_free() {
    local port=$1
    
    if [ "$IS_WINDOWS" = true ]; then
        ! netstat -ano | grep ":$port " | grep -q "LISTENING"
    else
        ! lsof -i:$port -sTCP:LISTEN >/dev/null 2>&1
    fi
}

# Handle dev mode - kill existing and start fresh frontend
if [[ $@ == *"dev"* ]]; then
  cd "$dir/frontend"
  
  echo "🛑 Killing frontend process for $(basename "$dir")..."
  
  if [ "$IS_WINDOWS" = true ]; then
    # Windows: Find node processes
    pids=$(wmic process where "name='node.exe'" get ProcessId,CommandLine /format:csv 2>/dev/null | grep -i "$(echo "$dir/frontend" | sed 's/\\/\\\\/g')" | awk -F',' '{print $3}' | grep -v '^$' || echo "")
  else
    # Linux: Find node processes running from THIS specific frontend directory
    pids=$(lsof -ti -sTCP:LISTEN -a -c node 2>/dev/null | while read pid; do
      cwd=$(readlink -f "/proc/$pid/cwd" 2>/dev/null || echo "")
      if [[ "$cwd" == "$dir/frontend"* ]]; then
        echo "$pid"
      fi
    done)
  fi
  
  if [ -n "$pids" ]; then
    echo "Found frontend process(es): $pids"
    if [ "$IS_WINDOWS" = true ]; then
      for pid in $pids; do
        taskkill //PID "$pid" //F 2>/dev/null || true
      done
    else
      echo "$pids" | xargs kill -9 2>/dev/null || true
    fi
    echo "✅ Killed frontend for $(basename "$dir")"
  else
    echo "ℹ️  No running frontend found for $(basename "$dir")"
  fi
  
  sleep 2
  
  echo "🚀 Starting fresh frontend server for $(basename "$dir")..."
  npm run dev
  exit 0
fi

if [[ $@ != *"keep"* ]]; then
  rm -rf built
fi

if [[ $@ == *"war"* ]]; then
  cd "$dir/backend"

  if [[ $@ == *"staging"* ]]; then
    mvn clean install -Dspring.profiles.active=staging
  elif [[ $@ == *"beta"* ]]; then
    mvn clean install -Dspring.profiles.active=beta
  elif [[ $@ == *"uat"* ]]; then
    mvn clean install -Dspring.profiles.active=uat
  else
    mvn clean install -Dspring.profiles.active=prod
  fi
fi

if [[ $@ == *"zip"* ]]; then
  cd "$dir/frontend"
  rm -rf built

  if [[ $@ == *"staging"* ]]; then
    export NODE_ENV=test
  elif [[ $@ == *"beta"* ]]; then
    export NODE_ENV=beta
  elif [[ $@ == *"uat"* ]]; then
    export NODE_ENV=uat
  else
    export NODE_ENV=production
  fi

  npm run build

  cd built
  x=$(ls -d */ | head -n 1 | sed 's#/##')
  zip -r -9 -qdg "$x.zip" "$x"
  rm -rf "$x"
fi

cd "$dir"
echo

if [[ $@ == *"war"* ]]; then
  mkdir -p built && mv backend/target/*.war built/
  
  # Determine environment label
  env_label="(prod)"
  if [[ $@ == *"staging"* ]]; then
    env_label="(staging)"
  elif [[ $@ == *"beta"* ]]; then
    env_label="(beta)"
  elif [[ $@ == *"uat"* ]]; then
    env_label="(uat)"
  fi
  
  echo "✔ built: WAR $env_label"
fi

if [[ $@ == *"zip"* ]]; then
  mkdir -p built && mv frontend/built/*.zip built/
  rm -rf frontend/built
  
  # Determine environment label
  env_label="(prod)"
  if [[ $@ == *"staging"* ]]; then
    env_label="(staging)"
  elif [[ $@ == *"beta"* ]]; then
    env_label="(beta)"
  elif [[ $@ == *"uat"* ]]; then
    env_label="(uat)"
  fi
  
  echo "✔ built: ZIP $env_label"
  
  # Signal completion for automation tools
  echo ""
  echo "🎉 NINJA_BUILD_COMPLETE 🎉"
  echo ""
  touch "$dir/.ninja_build_complete"
  
  # Auto-restart frontend after build completion
  echo "🔄 Restarting frontend servers..."
  
  # Kill all processes on ports 3000-3030 (cross-platform)
  killed_ports=""
  for port in {3000..3030}; do
    if kill_port "$port"; then
      killed_ports="$killed_ports $port"
    fi
  done
  
  if [ -n "$killed_ports" ]; then
    echo "   Stopped services on ports:$killed_ports"
  fi
  
  # Initial wait for cleanup
  sleep 5
  
  # Verify ports are actually free before starting
  max_retries=15
  
  # Check port 3000
  retry_count=0
  while ! is_port_free 3000 && [ $retry_count -lt $max_retries ]; do
    kill_port 3000
    sleep 3
    retry_count=$((retry_count + 1))
  done
  
  # Check port 3001
  retry_count=0
  while ! is_port_free 3001 && [ $retry_count -lt $max_retries ]; do
    kill_port 3001
    sleep 3
    retry_count=$((retry_count + 1))
  done
  
  # Final wait before starting
  sleep 3
  
  echo ""
  echo "🚀 Starting frontend servers..."
  
  # Get parent directory (NEXTGEN-OCBIS)
  parent_dir=$(dirname "$dir")
  
  # Start Auth project frontend (port 3000)
  auth_frontend="$parent_dir/Auth/frontend"
  if [ -d "$auth_frontend" ]; then
    cd "$auth_frontend"
    
    if [ "$IS_WINDOWS" = true ]; then
      cmd //c "set PORT=3000 && set NODE_ENV=development && start /B npm run dev > $parent_dir/Auth/auth-frontend.log 2>&1"
      sleep 2
    else
      PORT=3000 NODE_ENV=development nohup npm run dev > "$parent_dir/Auth/auth-frontend.log" 2>&1 &
    fi
    echo "   ✅ Auth → http://localhost:3000"
    
    sleep 5
  fi
  
  # Start current project frontend (port 3001)
  current_frontend="$dir/frontend"
  if [ -d "$current_frontend" ]; then
    cd "$current_frontend"
    
    if [ "$IS_WINDOWS" = true ]; then
      cmd //c "set PORT=3001 && set NODE_ENV=development && start /B npm run dev > $dir/frontend.log 2>&1"
      sleep 2
    else
      PORT=3001 NODE_ENV=development nohup npm run dev > "$dir/frontend.log" 2>&1 &
    fi
    echo "   ✅ $(basename "$dir") → http://localhost:3001"
    
    sleep 3
  fi
  
  cd "$dir"
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "✅ Build & Restart Complete!"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "🥷 Thank you for using Ninja Runner by @AkhilNinja"
  echo ""
fi

if [[ ($@ == *"war"* || $@ == *"zip"*) && (-x "$(command -v nautilus)") ]]; then
  nautilus built &> /dev/null
fi