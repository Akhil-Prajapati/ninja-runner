# 🚀 Publishing Ninja Runner to VS Code Marketplace

## Step 1: Get a Publisher Account

1. Go to https://marketplace.visualstudio.com/manage
2. Sign in with your Microsoft account
3. Create a publisher profile with ID "akhilninja"

## Step 2: Get Personal Access Token

1. ✅ You're already signed in to https://dev.azure.com/
2. On the dashboard, click your **profile picture** (top-right corner)
3. Select **"Personal access tokens"** from the dropdown
4. Click **"+ New Token"** button
5. Fill in the form:
   - **Name**: `VS Code Extension Publishing`
   - **Organization**: Select "All accessible organizations"
   - **Expiration**: Choose 1 year from today
   - **Scopes**: Click "Custom defined"
     - Scroll down to find **"Marketplace"**
     - Check the **"Manage"** checkbox ✅
6. Click **"Create"**
7. **⚠️ IMPORTANT**: Copy the token immediately and save it (you won't see it again!)

## Step 3: Install VSCE and Login

```bash
npm install -g @vscode/vsce
vsce login akhilninja
# Enter your Personal Access Token when prompted
```

## Step 4: Publish Extension

```bash
cd /home/user/ninja/server-runner-extension
vsce publish
```

## Step 5: Your Friends Can Install

After publishing, your friends can install by:

1. Opening VS Code
2. Going to Extensions (Ctrl+Shift+X)
3. Searching for "Ninja Runner" or "akhilninja"
4. Clicking "Install"

## Alternative: Publish with Version Bump

```bash
vsce publish patch  # 0.0.1 → 0.0.2
vsce publish minor  # 0.0.1 → 0.1.0
vsce publish major  # 0.0.1 → 1.0.0
```
