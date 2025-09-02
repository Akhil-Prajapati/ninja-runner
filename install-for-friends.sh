#!/bin/bash

# 🥷 Ninja Runner Extension - Easy Install Script for Friends
# Created by akhilninja

echo "🥷 Installing Ninja Runner Extension..."
echo "⚡ Lightning-fast server runner for development"
echo ""

# Check if VS Code is installed
if ! command -v code &> /dev/null; then
    echo "❌ VS Code is not installed or not in PATH"
    echo "Please install VS Code first: https://code.visualstudio.com/"
    exit 1
fi

# Check if extension file exists
EXTENSION_FILE="ninja-runner-0.0.1.vsix"
if [ ! -f "$EXTENSION_FILE" ]; then
    echo "❌ Extension file '$EXTENSION_FILE' not found"
    echo "Please download the extension file first"
    exit 1
fi

# Install the extension
echo "🚀 Installing Ninja Runner extension..."
code --install-extension "$EXTENSION_FILE"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Ninja Runner extension installed successfully!"
    echo ""
    echo "🎯 How to use:"
    echo "1. Open VS Code"
    echo "2. Look for the 🥷 Ninja Runner icon in the activity bar (left side)"
    echo "3. Click it to start all your servers automatically!"
    echo ""
    echo "🔥 Features:"
    echo "- One-click server startup"
    echo "- Auto-opens sidebar"
    echo "- Supports FSP and HRMS projects"
    echo "- Add custom servers"
    echo ""
    echo "Created with ❤️ by akhilninja"
else
    echo "❌ Failed to install extension"
    echo "Try installing manually through VS Code"
fi
