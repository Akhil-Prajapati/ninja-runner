#!/bin/bash

# 🥷 Ninja Runner - Publishing Script
echo "🥷 Preparing Ninja Runner for VS Code Marketplace..."

# Step 1: Login to Visual Studio Marketplace
echo "🔐 Step 1: Login to marketplace"
echo "Run: vsce login akhilninja"
echo "Enter your Personal Access Token when prompted"

# Step 2: Publish the extension
echo "🚀 Step 2: Publish extension"
echo "Run: vsce publish"

# Step 3: Alternative - Publish with version bump
echo "📈 Alternative: Publish with version bump"
echo "Run: vsce publish patch  # for 0.0.2"
echo "Run: vsce publish minor  # for 0.1.0"
echo "Run: vsce publish major  # for 1.0.0"

echo ""
echo "✅ After successful publish, your extension will be available at:"
echo "https://marketplace.visualstudio.com/items?itemName=akhilninja.ninja-runner"
echo ""
echo "📝 Don't forget to:"
echo "1. Create GitHub repository and push your code"
echo "2. Update repository URLs in package.json"
echo "3. Add screenshots to your README"
echo "4. Tag your release on GitHub"
