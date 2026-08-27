#!/bin/bash

# Ninja Runner Extension Installation Script

echo "🥷 Installing Ninja Runner Extension by akhilninja..."

# Get the current directory
EXTENSION_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Find latest vsix file
VSIX_FILE=$(ls -t "$EXTENSION_DIR"/ninja-runner-*.vsix 2>/dev/null | head -n 1)

# Check if the VSIX file exists
if [ -z "$VSIX_FILE" ] || [ ! -f "$VSIX_FILE" ]; then
    echo "Error: No ninja-runner-*.vsix found in $EXTENSION_DIR"
    echo "Please run 'npm run compile && npx vsce package --no-dependencies' first."
    exit 1
fi

# Install the extension
echo "Installing extension from: $(basename "$VSIX_FILE")"
code --install-extension "$VSIX_FILE" || antigravity --install-extension "$VSIX_FILE" || echo "Please install manually via: code --install-extension $VSIX_FILE"

if [ $? -eq 0 ]; then
    echo ""
    echo "🎉 Ninja Runner Extension $(basename "$VSIX_FILE") installed successfully!"
    echo ""
    echo "🥷 To use the extension:"
    echo "1. Reload the window: Ctrl+Shift+P -> 'Developer: Reload Window'"
    echo "2. Click the '🥷 Ninja Runner' icon in the Activity Bar on the left"
    echo "3. Auto-detect your projects and run your servers with 1 click! ⚡"
else
    echo "❌ Could not auto-install."
    echo "You can install it directly in VS Code: Extensions (Ctrl+Shift+X) -> ... (Views and More Actions) -> Install from VSIX... -> Select $(basename "$VSIX_FILE")"
fi
