#!/usr/bin/env python3
"""Empirical Challenger Test Suite for Milestone 3:
Desktop System, Storage v3 Migration & Modular Widgets.

Adversarial stress-testing of:
1. Script loading sequence in newtab.html (widgets.js before features.js, no CDN, no inline scripts).
2. Pure JavaScript storage migration fidelity & idempotency (cros_v2 -> cros_v3).
3. Clock & Date widget time formatting (24h/12h, midnight/noon, seconds).
4. Widget engine lifecycle (add, remove, toggle, clamp bounds).
5. Settings tabs structure (Appearance, Widgets, Protection).
"""

import os
import re
import sys
import subprocess
import json
import unittest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

def test_1_script_loading_order_and_csp():
    """Verify script loading sequence and strict MV3 CSP compliance."""
    print("\n[CHALLENGE 1] Verifying Script Order & CSP Compliance in newtab.html...")
    newtab_path = os.path.join(PROJECT_ROOT, "newtab.html")
    with open(newtab_path, "r", encoding="utf-8") as f:
        html = f.read()

    # Prohibited inline scripts
    inline_scripts = re.findall(r'<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>', html, re.IGNORECASE)
    if inline_scripts:
        print(f"  ❌ FAIL: Found {len(inline_scripts)} inline script(s)!")
        return False, "Inline scripts found"

    # Find external scripts in order
    scripts = re.findall(r'<script[^>]*\bsrc=["\']([^"\']+)["\']', html, re.IGNORECASE)
    print(f"  Discovered scripts in order: {scripts}")

    if "widgets.js" not in scripts:
        print("  ❌ FAIL: widgets.js not found in newtab.html!")
        return False, "widgets.js missing"
    if "features.js" not in scripts:
        print("  ❌ FAIL: features.js not found in newtab.html!")
        return False, "features.js missing"

    widgets_idx = scripts.index("widgets.js")
    features_idx = scripts.index("features.js")
    if widgets_idx > features_idx:
        print("  ❌ FAIL: widgets.js must be loaded BEFORE features.js!")
        return False, "widgets.js loaded after features.js"

    # Verify no external CDNs
    cdn_links = re.findall(r'(?:href|src)=["\']https?://[^"\']+\.(?:js|css)["\']', html, re.IGNORECASE)
    if cdn_links:
        print(f"  ❌ FAIL: External CDN links found: {cdn_links}")
        return False, "External CDN links found"

    print("  ✓ PASS: Script loading order correct (widgets.js before features.js) and zero CDN dependencies.")
    return True, "Scripts valid"


def test_2_js_storage_migration_and_idempotency():
    """Execute real node evaluation of migration logic in features.js."""
    print("\n[CHALLENGE 2] Testing JavaScript Storage Migration (cros_v2 -> cros_v3)...")
    node_eval_code = """
const { migrateStorage } = require('./features.js');

// Test 1: Empty storage
const v3_empty = migrateStorage({});
if (v3_empty.version !== 3 || !Array.isArray(v3_empty.shortcuts) || !Array.isArray(v3_empty.widgets)) {
  process.stderr.write("Empty storage migration failed: " + JSON.stringify(v3_empty));
  process.exit(2);
}

// Test 2: Migration from v2
const v2_sample = {
  cros_v2: {
    shortcuts: [{ id: "sc-test", title: "Test", url: "https://test.com" }],
    wallpaper: "data:image/jpeg;base64,sample",
    dim: "0.45",
    autoFullscreen: true,
    closeProtection: false
  }
};
const v3_migrated = migrateStorage(v2_sample);
if (v3_migrated.shortcuts[0].id !== "sc-test") {
  process.stderr.write("Shortcuts not preserved");
  process.exit(3);
}
if (v3_migrated.wallpaper.type !== "image" || !v3_migrated.wallpaper.value) {
  process.stderr.write("Wallpaper conversion failed");
  process.exit(4);
}
if (v3_migrated.dim !== 0.45) {
  process.stderr.write("Dim conversion failed: " + v3_migrated.dim);
  process.exit(5);
}
if (v3_migrated.closeProtection !== false) {
  process.stderr.write("closeProtection false not preserved");
  process.exit(6);
}

// Test 3: Idempotence on existing v3
const v3_existing = {
  cros_v3: {
    version: 3,
    shortcuts: [{ id: "keep-me", title: "Keep", url: "https://keep.com" }],
    widgets: [{ id: "w-custom", type: "clock", title: "C", x: 10, y: 10, w: 200, h: 100, enabled: false }],
    dim: 0.77,
    wallpaper: { type: "color", value: "#333333" },
    autoFullscreen: true,
    closeProtection: true,
    weather: { city: "Paris", units: "celsius" },
    google: { clientId: "id-123", mockMode: true }
  }
};
const v3_idempotent = migrateStorage(v3_existing);
if (v3_idempotent.dim !== 0.77 || v3_idempotent.weather.city !== "Paris" || v3_idempotent.widgets[0].enabled !== false) {
  process.stderr.write("Migration was not idempotent!");
  process.exit(7);
}

console.log("MIGRATION_OK");
"""
    p = subprocess.run(["node", "-e", node_eval_code], cwd=PROJECT_ROOT, capture_output=True, text=True)
    if p.returncode != 0 or "MIGRATION_OK" not in p.stdout:
        print(f"  ❌ FAIL: Node evaluation of migration failed: {p.stderr}")
        return False, p.stderr
    print("  ✓ PASS: features.js migrateStorage passed all edge cases and idempotence checks.")
    return True, "Migration verified"


def test_3_widgets_js_clock_and_lifecycle():
    """Verify widgets.js exports, clock formatting, and lifecycle methods."""
    print("\n[CHALLENGE 3] Testing widgets.js Engine, Clock Formatter & Lifecycle in Node...")
    node_eval_code = """
const { CrosWidgets, formatTime, formatDate } = require('./widgets.js');

if (!CrosWidgets) {
  process.stderr.write("CrosWidgets not exported!");
  process.exit(1);
}

// 1. Test formatTime
const testDate = new Date(2026, 9, 14, 14, 5, 9);
const t24 = formatTime(testDate, true, false);
if (t24 !== "14:05") {
  process.stderr.write("Expected 14:05, got " + t24);
  process.exit(2);
}

const t12_pm = formatTime(testDate, false, false);
if (t12_pm !== "2:05 PM") {
  process.stderr.write("Expected 2:05 PM, got " + t12_pm);
  process.exit(3);
}

const t12_am = formatTime(new Date(2026, 9, 14, 9, 30, 0), false, false);
if (t12_am !== "9:30 AM") {
  process.stderr.write("Expected 9:30 AM, got " + t12_am);
  process.exit(4);
}

const t_sec = formatTime(new Date(2026, 9, 14, 8, 15, 42), true, true);
if (t_sec !== "08:15:42") {
  process.stderr.write("Expected 08:15:42, got " + t_sec);
  process.exit(5);
}

const t_midnight_24 = formatTime(new Date(2026, 9, 14, 0, 0, 0), true, false);
const t_midnight_12 = formatTime(new Date(2026, 9, 14, 0, 0, 0), false, false);
if (t_midnight_24 !== "00:00" || t_midnight_12 !== "12:00 AM") {
  process.stderr.write("Midnight error: " + t_midnight_24 + " / " + t_midnight_12);
  process.exit(6);
}

const t_noon_12 = formatTime(new Date(2026, 9, 14, 12, 0, 0), false, false);
if (t_noon_12 !== "12:00 PM") {
  process.stderr.write("Noon error: " + t_noon_12);
  process.exit(7);
}

// 2. Test Catalog & Registry
const catalog = CrosWidgets.getCatalog();
const types = catalog.map(c => c.type);
const required = ['clock', 'weather', 'calendar', 'gmail', 'drive', 'news', 'note', 'todo', 'countdown', 'embed'];
for (const req of required) {
  if (!types.includes(req)) {
    process.stderr.write("Missing widget type in catalog: " + req);
    process.exit(8);
  }
}

// 3. Test Lifecycle Methods
const mockState = [];
CrosWidgets.getWidgetsFn = () => mockState;
let saved = false;
CrosWidgets.onSaveFn = () => { saved = true; };

const added = CrosWidgets.addWidget("clock", "My Clock", { format24h: true });
if (!added || added.type !== "clock" || mockState.length !== 1) {
  process.stderr.write("addWidget failed");
  process.exit(9);
}

CrosWidgets.moveWidget(added.id, -50, -100);
if (added.x < 0 || added.y < 0) {
  process.stderr.write("Coordinate clamping failed: " + added.x + ", " + added.y);
  process.exit(10);
}

CrosWidgets.resizeWidget(added.id, 10, 20);
if (added.w < CrosWidgets.MIN_WIDTH || added.h < CrosWidgets.MIN_HEIGHT) {
  process.stderr.write("Dimension clamping failed: " + added.w + ", " + added.h);
  process.exit(11);
}

CrosWidgets.toggleWidget(added.id, false);
if (added.enabled !== false) {
  process.stderr.write("toggleWidget failed");
  process.exit(12);
}

const removed = CrosWidgets.removeWidget(added.id);
if (!removed || mockState.length !== 0) {
  process.stderr.write("removeWidget failed");
  process.exit(13);
}

console.log("WIDGETS_OK");
"""
    p = subprocess.run(["node", "-e", node_eval_code], cwd=PROJECT_ROOT, capture_output=True, text=True)
    if p.returncode != 0 or "WIDGETS_OK" not in p.stdout:
        print(f"  ❌ FAIL: widgets.js test failed: {p.stderr}")
        return False, p.stderr
    print("  ✓ PASS: widgets.js Clock formatting and lifecycle methods verified successfully.")
    return True, "Widgets verified"


def test_4_settings_tabs_markup():
    """Verify settings navigation tabs in newtab.html and features.css."""
    print("\n[CHALLENGE 4] Verifying Settings Tabs Markup & Styles...")
    newtab_path = os.path.join(PROJECT_ROOT, "newtab.html")
    css_path = os.path.join(PROJECT_ROOT, "features.css")

    with open(newtab_path, "r", encoding="utf-8") as f:
        html = f.read()
    with open(css_path, "r", encoding="utf-8") as f:
        css = f.read()

    # Check tab navigation buttons
    expected_tabs = ["tab-btn-appearance", "tab-btn-widgets", "tab-btn-protection"]
    for tab_id in expected_tabs:
        if f'id="{tab_id}"' not in html:
            print(f"  ❌ FAIL: Tab button {tab_id} missing in newtab.html!")
            return False, f"Missing {tab_id}"

    # Check tab panes
    expected_panes = ["tab-pane-appearance", "tab-pane-widgets", "tab-pane-protection"]
    for pane_id in expected_panes:
        if f'id="{pane_id}"' not in html:
            print(f"  ❌ FAIL: Tab pane {pane_id} missing in newtab.html!")
            return False, f"Missing {pane_id}"

    # Check mount points
    if 'id="wallpaper-settings-mount"' not in html:
        print("  ❌ FAIL: wallpaper-settings-mount missing!")
        return False, "wallpaper mount missing"
    if 'id="widget-manager-list"' not in html:
        print("  ❌ FAIL: widget-manager-list missing!")
        return False, "widget manager mount missing"
    if 'id="protection-settings-mount"' not in html:
        print("  ❌ FAIL: protection-settings-mount missing!")
        return False, "protection mount missing"

    # Check CSS classes
    expected_classes = [".settings-nav-tabs", ".settings-tab-btn", ".widget-manager-list", ".widget-catalog-grid"]
    for cls in expected_classes:
        if cls not in css:
            print(f"  ❌ FAIL: CSS rule {cls} missing in features.css!")
            return False, f"Missing {cls}"

    print("  ✓ PASS: Settings tabs navigation, panes, mount points, and CSS rules present.")
    return True, "Settings markup verified"


def run_all_challenges():
    print("=" * 72)
    print("⚔️  EMPIRICAL CHALLENGER: Milestone 3 Stress Test & Verification Suite")
    print("=" * 72)

    challenges = [
        ("Script Order & MV3 CSP Compliance", test_1_script_loading_order_and_csp),
        ("Storage Migration Fidelity & Idempotency", test_2_js_storage_migration_and_idempotency),
        ("Modular Widget Engine & Clock Formatter", test_3_widgets_js_clock_and_lifecycle),
        ("Settings Tabs Markup & CSS Integration", test_4_settings_tabs_markup),
    ]

    all_passed = True
    results = []

    for name, test_fn in challenges:
        ok, msg = test_fn()
        results.append((name, ok, msg))
        if not ok:
            all_passed = False

    print("\n" + "=" * 72)
    print("📊 EMPIRICAL CHALLENGE M3 RESULTS SUMMARY")
    print("=" * 72)
    for name, ok, msg in results:
        status = "PASSED" if ok else "FAILED"
        print(f"[{status}] {name}")
    print("=" * 72)

    if all_passed:
        print("🎉 M3 CHALLENGE VERDICT: ALL PASS")
        return 0
    else:
        print("❌ M3 CHALLENGE VERDICT: SOME CHECKS FAILED")
        return 1


if __name__ == "__main__":
    sys.exit(run_all_challenges())
