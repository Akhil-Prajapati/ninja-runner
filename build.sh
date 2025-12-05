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
#   - To start frontend dev server only:
#       ./build.sh dev

set -Eeuo pipefail
dir="$(cd -P -- "$(dirname -- "$0")" && pwd -P)"

# Handle dev mode - kill existing and start fresh frontend
if [[ $@ == *"dev"* ]]; then
  cd "$dir/frontend"
  
  echo "🛑 Killing frontend process for $(basename "$dir")..."
  
  # Find node processes running from THIS specific frontend directory
  pids=$(lsof -ti -sTCP:LISTEN -a -c node 2>/dev/null | while read pid; do
    cwd=$(readlink -f "/proc/$pid/cwd" 2>/dev/null || echo "")
    # Check if this process is running from our frontend directory
    if [[ "$cwd" == "$dir/frontend"* ]]; then
      echo "$pid"
    fi
  done)
  
  if [ -n "$pids" ]; then
    echo "Found frontend process(es): $pids"
    echo "$pids" | xargs kill -9 2>/dev/null || true
    echo "✅ Killed frontend for $(basename "$dir")"
  else
    echo "ℹ️  No running frontend found for $(basename "$dir")"
  fi
  
  # Wait for cleanup
  sleep 2
  
  echo "🚀 Starting fresh frontend server for $(basename "$dir")..."
  npm start
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
  
  # Signal completion immediately after ZIP build (last step)
  echo ""
  echo "🎉 NINJA_BUILD_COMPLETE 🎉"
  echo ""
  touch "$dir/.ninja_build_complete"
  
  # Auto-restart frontend after build completion
  echo ""
  echo "🔄 Killing all frontend servers on ports 3000-3030..."
  
  # Kill all processes on ports 3000-3030
  killed_ports=""
  for port in {3000..3030}; do
    pids=$(lsof -ti:$port 2>/dev/null || echo "")
    if [ -n "$pids" ]; then
      echo "🛑 Killing processes on port $port: $pids"
      echo "$pids" | xargs kill -9 2>/dev/null || true
      killed_ports="$killed_ports $port"
    fi
  done
  
  if [ -n "$killed_ports" ]; then
    echo "✅ Killed processes on ports:$killed_ports"
  else
    echo "ℹ️  No processes found on ports 3000-3030"
  fi
  
  # Wait for ports to be freed
  sleep 3
  
  echo ""
  echo "🚀 Starting frontends..."
  
  # Get parent directory (NEXTGEN-OCBIS)
  parent_dir=$(dirname "$dir")
  
  # Start Auth project frontend
  auth_frontend="$parent_dir/Auth/frontend"
  if [ -d "$auth_frontend" ]; then
    cd "$auth_frontend"
    echo "🔐 Starting Auth frontend from: $(pwd)"
    nohup npm start > "$parent_dir/Auth/auth-frontend.log" 2>&1 &
    auth_pid=$!
    echo "✅ Auth frontend started (PID: $auth_pid)"
    sleep 2
  else
    echo "ℹ️  Auth frontend not found at: $auth_frontend"
  fi
  
  # Start current project frontend
  current_frontend="$dir/frontend"
  if [ -d "$current_frontend" ]; then
    cd "$current_frontend"
    echo "📦 Starting $(basename "$dir") frontend from: $(pwd)"
    nohup npm start > "$dir/frontend.log" 2>&1 &
    current_pid=$!
    echo "✅ $(basename "$dir") frontend started (PID: $current_pid)"
  else
    echo "⚠️  Frontend directory not found: $current_frontend"
  fi
  
  cd "$dir"
  echo ""
  echo "🎉 Frontend restart complete!"
  echo "📝 Logs:"
  echo "   - Auth: $parent_dir/Auth/auth-frontend.log"
  echo "   - $(basename "$dir"): $dir/frontend.log"
fi

if [[ ($@ == *"war"* || $@ == *"zip"*) && (-x "$(command -v nautilus)") ]]; then
  nautilus built &> /dev/null
fi