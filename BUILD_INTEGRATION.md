# Build Integration Guide

## For Ninja Runner Build Manager to work properly

To enable automatic frontend restart after builds complete, add these lines to your project's `build.sh` file:

### Location to Add

Add this code **right after** the `echo "✔ built: ZIP $env_label"` line (or at the end of the zip build section):

```bash
# Signal completion for automation tools
echo ""
echo "🎉 NINJA_BUILD_COMPLETE 🎉"
echo ""
touch "$dir/.ninja_build_complete"
```

### Complete Example for ZIP Section

```bash
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
fi
```

### What This Does

1. Prints a completion message that's visible in the terminal
2. Creates a marker file `.ninja_build_complete` in the project directory
3. Ninja Runner extension detects this file and immediately:
   - Resets `spring.profiles.active` back to `dev`
   - Restarts the frontend server with a clean cache

### Benefits

- ✅ No more cache errors on frontend restart
- ✅ Automatic profile reset to dev environment
- ✅ Immediate restart when build completes (no waiting)
- ✅ Works for builds of any duration (fast or slow)
