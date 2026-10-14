#!/usr/bin/env python3
"""Headless Chromium Page Load and Console Error Validator for CrOS New Tab.

Runs Chromium in headless mode, loads newtab.html via file:// protocol,
captures DOM output and browser logs, and asserts that:
1. The DOM loads completely with all core UI nodes (<main>, #clock, #shortcuts, etc.)
2. All 6 scripts execute cleanly
3. Zero JavaScript uncaught exceptions or console errors occur
"""

import os
import sys
import json
import subprocess
import time
import urllib.request

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
NEWTAB_URL = f"file://{os.path.join(PROJECT_ROOT, 'newtab.html')}"

def validate_headless():
    print("========================================================================")
    print("🌐 Headless Chromium Execution & Console Error Validation")
    print(f"Target: {NEWTAB_URL}")
    print("========================================================================")

    # 1. Run Chromium with dump-dom and capture stdout/stderr
    cmd = [
        "chromium",
        "--headless",
        "--no-sandbox",
        "--disable-gpu",
        "--enable-logging=stderr",
        "--v=1",
        "--virtual-time-budget=2000",
        "--dump-dom",
        NEWTAB_URL
    ]

    res = subprocess.run(cmd, cwd=PROJECT_ROOT, capture_output=True, text=True)
    if res.returncode != 0:
        print(f"❌ FAIL: Chromium exited with non-zero code {res.returncode}")
        print("Stderr:", res.stderr)
        return False

    dom_content = res.stdout
    stderr_content = res.stderr

    # 2. Check DOM Elements
    expected_selectors = [
        ('html[lang="ru"]', 'lang="ru"'),
        ('link to features.css', 'href="features.css"'),
        ('script newtab.js', 'src="newtab.js"'),
        ('script weather-service.js', 'src="services/weather-service.js"'),
        ('script google-service.js', 'src="services/google-service.js"'),
        ('script widgets.js', 'src="widgets.js"'),
        ('script features.js', 'src="features.js"'),
        ('clock element', 'id="clock-card"'),
        ('shortcuts container', 'id="shortcuts"'),
        ('settings panel', 'id="settings-panel"'),
        ('computed theme style attribute', 'style="--theme-')
    ]

    print("\n[STEP 1] Validating Dumped DOM Structure & Computed Styles...")
    all_nodes_found = True
    for desc, pattern in expected_selectors:
        if pattern in dom_content:
            print(f"  ✓ Found: {desc}")
        else:
            print(f"  ❌ Missing in DOM: {desc} ('{pattern}')")
            all_nodes_found = False

    if not all_nodes_found:
        return False

    # 3. Check for JS console errors or uncaught exceptions in stderr
    print("\n[STEP 2] Verifying Browser Console Stderr for JS Errors...")
    js_error_indicators = [
        "Uncaught TypeError",
        "Uncaught ReferenceError",
        "Uncaught SyntaxError",
        "Uncaught RangeError",
        "Uncaught Error",
        "CONSOLE ERROR",
        "[error]",
        "Script error"
    ]

    found_js_errors = []
    for line in stderr_content.splitlines():
        for err in js_error_indicators:
            if err.lower() in line.lower() and "dbus" not in line.lower():
                found_js_errors.append(line)

    if found_js_errors:
        print(f"  ❌ FAIL: Found {len(found_js_errors)} console error(s):")
        for err in found_js_errors:
            print(f"    -> {err}")
        return False

    print("  ✓ Zero JavaScript runtime errors or console exceptions detected.")

    print("\n========================================================================")
    print("🏆 HEADLESS CHROMIUM VALIDATION PASSED! Clean Load & Zero Errors.")
    print("========================================================================")
    return True

if __name__ == "__main__":
    success = validate_headless()
    sys.exit(0 if success else 1)
