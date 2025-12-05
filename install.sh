#!/bin/bash

# Ninja Runner Extension Installation Script

echo "🥷 Installing Ninja Runner Extension by akhilninja..."

# Get the current directory
EXTENSION_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VSIX_FILE="$EXTENSION_DIR/ninja-runner-0.1.4.vsix"

# Check if the VSIX file exists
if [ ! -f "$VSIX_FILE" ]; then
    echo "Error: ninja-runner-0.1.4.vsix not found in $EXTENSION_DIR"
    echo "Please make sure you've run 'vsce package' first."
    exit 1
fi

# Install the extension
echo "Installing extension from: $VSIX_FILE"
code --install-extension "$VSIX_FILE"

if [ $? -eq 0 ]; then
    echo "🎉 Ninja Runner Extension installed successfully!"
    echo ""
    echo "🥷 To use the extension:"
    echo "1. Restart VS Code or reload the window (Ctrl+Shift+P -> 'Developer: Reload Window')"
    echo "2. Look for the '🥷 Ninja Runner' icon in the Activity Bar (left side panel)"
    echo "3. Click on it to auto-detect your projects or add custom servers"
    echo "4. Click on any server to launch it with ninja speed! ⚡"
    echo ""
    echo "Note: Works with React, Next.js, Spring Boot, Node.js and other development projects"
else
    echo "❌ Failed to install the extension"
    echo "Please make sure VS Code is installed and accessible via 'code' command"
    exit 1
fi
