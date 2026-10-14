#!/usr/bin/env python3
"""Empirical Challenger Test Suite for Milestone 2:
Service Worker Anti-Close Protection & MV3 Compliance.

Adversarial stress-testing of:
1. MV3 CSP violation: inline script blocks in newtab.html
2. Concurrency & Window Spawning Bomb in background.js (tabs.onRemoved & windows.onRemoved)
3. Shortcut navigation trap in beforeunload logic
4. Lost desktop tab when closing desktop with other tabs open
"""

import os
import re
import sys
import subprocess
import json

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

def test_1_mv3_inline_script_csp_violation():
    """Manifest V3 strictly prohibits inline <script> blocks in extension HTML pages.
    Any <script> without a src attribute triggers a CSP refusal in Chromium.
    """
    print("\n[CHALLENGE 1] Verifying MV3 CSP Compliance (Inline Scripts in newtab.html)...")
    newtab_path = os.path.join(PROJECT_ROOT, "newtab.html")
    with open(newtab_path, "r", encoding="utf-8") as f:
        html = f.read()

    # Search for <script> tags without src
    inline_scripts = re.findall(r'<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>', html, re.IGNORECASE)
    
    if inline_scripts:
        print(f"  ❌ FAIL: Found {len(inline_scripts)} inline <script> block(s) in newtab.html!")
        for idx, s in enumerate(inline_scripts):
            preview = s.strip()[:120].replace('\n', ' ')
            print(f"     Script #{idx+1} preview: {preview}...")
        return False, f"Found {len(inline_scripts)} prohibited inline <script> block(s) in newtab.html violating MV3 CSP."
    else:
        print("  ✓ PASS: No inline script tags found in newtab.html.")
        return True, "No inline scripts."

def test_2_window_spawning_bomb_in_background_worker():
    """Stress-test background.js concurrency during window closing.
    When a window with multiple tabs closes, tabs.onRemoved fires for each tab
    with isWindowClosing=True, followed by windows.onRemoved.
    Due to lack of debouncing/mutex, background.js spawns multiple duplicate windows.
    """
    print("\n[CHALLENGE 2] Stress-Testing background.js Multi-Tab Window Closure...")
    node_cmd = """
const fs = require('fs');
const vm = require('vm');

let tabRemoveListener, windowRemoveListener;
let createdWindows = [];

const mockWindows = [
  { id: 1, type: 'normal', tabs: [{ id: 101 }, { id: 102 }, { id: 103 }] }
];

const mockChrome = {
  runtime: {
    getURL: (p) => 'chrome-extension://id/' + p,
    onStartup: { addListener: () => {} },
    onInstalled: { addListener: () => {} },
    onMessage: { addListener: () => {} }
  },
  storage: {
    local: {
      get: async () => ({ cros_v3: { closeProtection: true, autoRestore: true } })
    }
  },
  tabs: {
    onRemoved: { addListener: (fn) => { tabRemoveListener = fn; } },
    query: async () => []
  },
  windows: {
    onRemoved: { addListener: (fn) => { windowRemoveListener = fn; } },
    getAll: async (opts) => {
      // Async IPC delay in browser
      await new Promise(r => setTimeout(r, 2));
      return mockWindows.filter(w => !opts.windowTypes || opts.windowTypes.includes(w.type));
    },
    create: async (opts) => {
      await new Promise(r => setTimeout(r, 5));
      const win = { id: 100 + createdWindows.length, type: opts.type || 'normal', tabs: [{ id: 200, url: opts.url }] };
      createdWindows.push(opts);
      mockWindows.push(win);
      return win;
    }
  }
};

const bgCode = fs.readFileSync('background.js', 'utf8');
const context = vm.createContext({ chrome: mockChrome, console, setTimeout, clearTimeout, Date });
vm.runInContext(bgCode, context);

async function run() {
  const promises = [];
  // 3 tabs close as part of window 1 closing
  for (let tid of [101, 102, 103]) {
    mockWindows[0].tabs = mockWindows[0].tabs.filter(t => t.id !== tid);
    promises.push(tabRemoveListener(tid, { windowId: 1, isWindowClosing: true }));
  }
  // Window 1 is removed
  const closedWin = mockWindows.shift();
  promises.push(windowRemoveListener(closedWin.id));

  await Promise.all(promises);
  console.log(JSON.stringify({ createdWindowsCount: createdWindows.length }));
}
run();
"""
    res = subprocess.run(["node", "-e", node_cmd], cwd=PROJECT_ROOT, capture_output=True, text=True)
    if res.returncode != 0:
        print("  Error running Node script:", res.stderr)
        return False, res.stderr

    output = json.loads(res.stdout.strip())
    spawn_count = output.get("createdWindowsCount", 0)
    print(f"  Spawned windows on closing 1 window (3 tabs): {spawn_count}")
    if spawn_count > 1:
        print(f"  ❌ FAIL: Runaway window bomb! Expected 1 resurrected window, got {spawn_count}.")
        return False, f"Concurrency race condition: Closing 1 window with 3 tabs spawned {spawn_count} duplicate windows."
    else:
        print("  ✓ PASS: Debounced to single window.")
        return True, "Debounced."

def test_3_shortcut_navigation_trap_in_beforeunload():
    """Verify whether double-clicking a desktop shortcut causes beforeunload to trap the user.
    Shortcuts are DIV elements, not <A> anchor tags.
    """
    print("\n[CHALLENGE 3] Stress-Testing beforeunload Shortcut Navigation Trap...")
    node_cmd = """
const fs = require('fs');
let scriptCode = '';
if (fs.existsSync('protection.js')) {
  scriptCode = fs.readFileSync('protection.js', 'utf8');
} else {
  const html = fs.readFileSync('newtab.html', 'utf8');
  const scriptMatch = html.match(/<script>\\s*(\\/\\* CrOS New Tab Anti-Close Protection[\\s\\S]*?)<\\/script>/);
  if (scriptMatch) scriptCode = scriptMatch[1];
}
if (!scriptCode) {
  console.log(JSON.stringify({ error: 'No beforeunload script found' }));
  process.exit(0);
}
const listeners = {};
const docListeners = {};

const window = {
  addEventListener: (t, fn) => { (listeners[t] = listeners[t] || []).push(fn); },
  localStorage: { getItem: () => null, setItem: () => {} },
  navigator: { userActivation: { hasBeenActive: true } }
};
const document = {
  addEventListener: (t, fn) => { (docListeners[t] = docListeners[t] || []).push(fn); }
};
const chrome = {
  storage: { local: { get: () => {} }, onChanged: { addListener: () => {} } }
};

const fn = new Function('window', 'document', 'navigator', 'localStorage', 'chrome', scriptCode);
fn(window, document, window.navigator, window.localStorage, chrome);

// Simulate user clicking on a desktop shortcut (div.shortcut, NOT an <a> tag)
const shortcutTarget = {
  className: 'shortcut',
  closest: (sel) => (sel === 'a' ? null : { className: 'shortcut' })
};

// User clicks shortcut
(docListeners['click'] || []).forEach(f => f({ target: shortcutTarget }));

// Desktop navigates via location.href, triggering beforeunload
const evt = { defaultPrevented: false, returnValue: '', preventDefault: () => { evt.defaultPrevented = true; } };
(listeners['beforeunload'] || []).forEach(f => f(evt));

console.log(JSON.stringify({ defaultPrevented: evt.defaultPrevented, returnValue: evt.returnValue }));
"""
    res = subprocess.run(["node", "-e", node_cmd], cwd=PROJECT_ROOT, capture_output=True, text=True)
    if res.returncode != 0:
        print("  Error running Node script:", res.stderr)
        return False, res.stderr

    output = json.loads(res.stdout.strip())
    default_prevented = output.get("defaultPrevented", False)
    print(f"  User double-clicks shortcut -> beforeunload defaultPrevented: {default_prevented}")
    if default_prevented:
        print("  ❌ FAIL: Desktop shortcut launch is trapped by beforeunload prompt!")
        return False, "Desktop shortcut clicks (div elements) do not set isNavigatingAway, trapping users on every shortcut launch."
    else:
        print("  ✓ PASS: Shortcut navigation bypassed beforeunload.")
        return True, "Shortcut navigation allowed."

def test_4_closing_desktop_tab_with_other_tabs_open():
    """Verify whether closing the desktop tab in a multi-tab window reopens a new desktop tab.
    PROJECT.md §4: 'Если закрывается последняя вкладка рабочего стола, инициируется открытие новой вкладки с chrome.runtime.getURL(\\'newtab.html\\')'
    """
    print("\n[CHALLENGE 4] Verifying Desktop Resurrect When Desktop Tab Closes in Multi-Tab Window...")
    node_cmd = """
const fs = require('fs');
const vm = require('vm');

let tabRemoveListener;
let reopenedTabs = [];

const NEWTAB_URL = 'chrome-extension://id/newtab.html';
const mockWindows = [
  { id: 1, type: 'normal', tabs: [
    { id: 101, url: NEWTAB_URL },
    { id: 102, url: 'https://www.google.com' }
  ]}
];

const mockChrome = {
  runtime: {
    getURL: (p) => 'chrome-extension://id/' + p,
    onStartup: { addListener: () => {} },
    onInstalled: { addListener: () => {} },
    onMessage: { addListener: () => {} }
  },
  storage: {
    local: {
      get: async () => ({ cros_v3: { closeProtection: true, autoRestore: true } })
    }
  },
  tabs: {
    onRemoved: { addListener: (fn) => { tabRemoveListener = fn; } },
    query: async (q) => {
      let res = [];
      for (const w of mockWindows) {
        if (!q.windowId || w.id === q.windowId) {
          for (const t of w.tabs) {
            if (!q.url || t.url === q.url) res.push(t);
          }
        }
      }
      return res;
    },
    create: async (opts) => {
      reopenedTabs.push(opts);
      mockWindows[0].tabs.push({ id: 999, ...opts });
      return { id: 999, ...opts };
    }
  },
  windows: {
    onRemoved: { addListener: () => {} },
    getAll: async () => mockWindows,
    create: async (opts) => opts
  }
};

const bgCode = fs.readFileSync('background.js', 'utf8');
const context = vm.createContext({ chrome: mockChrome, console, setTimeout, clearTimeout, Date });
vm.runInContext(bgCode, context);

async function run() {
  // User closes tab 101 (the desktop tab) while tab 102 (google.com) remains open
  mockWindows[0].tabs = mockWindows[0].tabs.filter(t => t.id !== 101);
  await tabRemoveListener(101, { windowId: 1, isWindowClosing: false });

  console.log(JSON.stringify({ reopenedTabsCount: reopenedTabs.length, reopenedTabs }));
}
run();
"""
    res = subprocess.run(["node", "-e", node_cmd], cwd=PROJECT_ROOT, capture_output=True, text=True)
    if res.returncode != 0:
        print("  Error running Node script:", res.stderr)
        return False, res.stderr

    output = json.loads(res.stdout.strip())
    reopened_count = output.get("reopenedTabsCount", 0)
    print(f"  Desktop tabs reopened when desktop tab closed: {reopened_count}")
    if reopened_count == 0:
        print("  ❌ FAIL: When desktop tab is closed, background.js does NOT resurrect it because window still has other tabs!")
        return False, "background.js only checks tabsInWindow.length === 0, ignoring whether any desktop tab remains."
    else:
        print("  ✓ PASS: Desktop tab resurrected.")
        return True, "Desktop resurrected."

def main():
    print("=" * 72)
    print("⚔️  EMPIRICAL CHALLENGER: Milestone 2 Stress Test & Vulnerability Suite")
    print("=" * 72)

    challenges = [
        ("MV3 CSP Compliance (Inline Script in newtab.html)", test_1_mv3_inline_script_csp_violation),
        ("Background Worker Concurrency & Window Spawning Bomb", test_2_window_spawning_bomb_in_background_worker),
        ("Desktop Shortcut Navigation Trapped by beforeunload", test_3_shortcut_navigation_trap_in_beforeunload),
        ("Desktop Tab Resurrection on Close in Multi-Tab Window", test_4_closing_desktop_tab_with_other_tabs_open),
    ]

    results = []
    for name, fn in challenges:
        passed, msg = fn()
        results.append((name, passed, msg))

    print("\n" + "=" * 72)
    print("📊 EMPIRICAL CHALLENGE RESULTS SUMMARY")
    print("=" * 72)
    failures = 0
    for name, passed, msg in results:
        status = "PASSED" if passed else "FAILED"
        if not passed:
            failures += 1
        print(f"[{status}] {name}")
        if not passed:
            print(f"         Reason: {msg}")

    print("=" * 72)
    if failures > 0:
        print(f"💥 CHALLENGE VERDICT: CHALLENGE_FAILED ({failures} empirical defects discovered)")
        sys.exit(1)
    else:
        print("🎉 CHALLENGE VERDICT: APPROVE")
        sys.exit(0)

if __name__ == "__main__":
    main()
