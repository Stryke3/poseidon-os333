#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLIST_DIR="$HOME/Library/LaunchAgents"
MORNING_PLIST="$PLIST_DIR/com.poseidon.wht-pull.morning.plist"
NIGHTLY_PLIST="$PLIST_DIR/com.poseidon.wht-pull.nightly.plist"

mkdir -p "$PLIST_DIR" "$ROOT_DIR/data/processed"

cat > "$MORNING_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.poseidon.wht-pull.morning</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-lc</string>
    <string>cd "$ROOT_DIR" && python3 scripts/wht_data_room_pull.py --mode morning >> "$ROOT_DIR/data/processed/wht_morning.log" 2>&1</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>6</integer><key>Minute</key><integer>15</integer></dict>
  <key>RunAtLoad</key><false/>
</dict>
</plist>
EOF

cat > "$NIGHTLY_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.poseidon.wht-pull.nightly</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>-lc</string>
    <string>cd "$ROOT_DIR" && python3 scripts/wht_data_room_pull.py --mode nightly >> "$ROOT_DIR/data/processed/wht_nightly.log" 2>&1</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>21</integer><key>Minute</key><integer>30</integer></dict>
  <key>RunAtLoad</key><false/>
</dict>
</plist>
EOF

launchctl unload "$MORNING_PLIST" >/dev/null 2>&1 || true
launchctl unload "$NIGHTLY_PLIST" >/dev/null 2>&1 || true
launchctl load "$MORNING_PLIST"
launchctl load "$NIGHTLY_PLIST"

echo "Installed launchd jobs:"
echo "  com.poseidon.wht-pull.morning (06:15)"
echo "  com.poseidon.wht-pull.nightly (21:30)"
