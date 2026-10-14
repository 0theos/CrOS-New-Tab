#!/usr/bin/env python3
"""Empirical Challenger Test Suite for Milestone 5:
Google Services Integration, OAuth & News.

Adversarial stress-testing of:
1. Script loading sequence & CSP compliance in newtab.html (services/google-service.js before widgets.js, no CDN, no inline scripts).
2. Google settings tab in newtab.html & features.js (OAuth Client ID, Mock Mode toggle, Login/Logout, Redirect URI, Step-by-step instructions).
3. Pure JavaScript GoogleService contract & OAuth URL generation (dynamic client ID, redirect URI, MV3 scopes).
4. Token extraction from URL fragment & expiration handling.
5. Mock mode fixtures schema validation (Google Calendar API v3, Gmail API v1, Google Drive API v3).
6. Google News RSS native parsing (DOMParser/XML simulation, CDATA stripping, source suffix extraction, empty feed handling).
7. Google Ecosystem shortcuts catalog (Google One, Keep, Photos, Meet, Docs, Sheets, Drive, Gmail, Calendar).
8. Widget registrations in CrosWidgets (calendar, gmail, drive, news) and state machine handling.
9. CSS styling rules in features.css for Google widgets and settings tab.
"""

import os
import re
import sys
import json
import subprocess

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def run_node_eval(script_code: str) -> dict:
    """Helper to evaluate JS snippets using Node.js."""
    res = subprocess.run(
        ["node", "-e", script_code],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True
    )
    if res.returncode != 0:
        return {"success": False, "error": res.stderr.strip(), "output": res.stdout.strip()}
    try:
        return {"success": True, "data": json.loads(res.stdout.strip()) if res.stdout.strip() else None, "raw": res.stdout.strip()}
    except json.JSONDecodeError:
        return {"success": True, "raw": res.stdout.strip()}


def test_1_script_loading_order_and_csp():
    """Verify script loading sequence and strict MV3 CSP compliance in newtab.html."""
    print("\n[CHALLENGE 1] Verifying Script Order & CSP Compliance in newtab.html...")
    newtab_path = os.path.join(PROJECT_ROOT, "newtab.html")
    with open(newtab_path, "r", encoding="utf-8") as f:
        html = f.read()

    # 1. Prohibited inline scripts
    inline_scripts = re.findall(r'<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>', html, re.IGNORECASE)
    if inline_scripts:
        print(f"  ❌ FAIL: Found {len(inline_scripts)} inline script(s)!")
        return False, "Inline scripts found"

    # 2. Find external scripts in order
    scripts = re.findall(r'<script[^>]*\bsrc=["\']([^"\']+)["\']', html, re.IGNORECASE)
    print(f"  Discovered scripts in order: {scripts}")

    google_script = "services/google-service.js"
    if google_script not in scripts:
        print("  ❌ FAIL: services/google-service.js not found in newtab.html!")
        return False, "google-service.js missing"
    if "widgets.js" not in scripts:
        print("  ❌ FAIL: widgets.js not found in newtab.html!")
        return False, "widgets.js missing"

    google_idx = scripts.index(google_script)
    widgets_idx = scripts.index("widgets.js")
    if google_idx > widgets_idx:
        print(f"  ❌ FAIL: {google_script} must be loaded BEFORE widgets.js (got idx {google_idx} vs {widgets_idx})!")
        return False, "google-service.js loaded after widgets.js"

    # 3. Verify no external CDNs
    cdn_links = re.findall(r'(?:href|src)=["\']https?://[^"\']+\.(?:js|css)["\']', html, re.IGNORECASE)
    if cdn_links:
        print(f"  ❌ FAIL: External CDN links found: {cdn_links}")
        return False, f"CDN links: {cdn_links}"

    print("  ✓ PASS: Script loading order is valid and CSP compliant.")
    return True, "Passed"


def test_2_google_settings_ui():
    """Verify Google settings tab, Client ID input, instructions, and mock toggle."""
    print("\n[CHALLENGE 2] Verifying Google Settings UI in newtab.html & features.js...")
    newtab_path = os.path.join(PROJECT_ROOT, "newtab.html")
    with open(newtab_path, "r", encoding="utf-8") as f:
        html = f.read()

    # Check for Google tab button
    if 'data-tab="google"' not in html and 'id="tab-btn-google"' not in html:
        print("  ❌ FAIL: Google tab button not found in newtab.html!")
        return False, "Google tab button missing"

    # Check for Google tab pane
    if 'id="tab-pane-google"' not in html:
        print("  ❌ FAIL: Google tab pane not found in newtab.html!")
        return False, "Google tab pane missing"

    # Check features.js for Google settings handlers
    features_path = os.path.join(PROJECT_ROOT, "features.js")
    with open(features_path, "r", encoding="utf-8") as f:
        features_js = f.read()

    required_phrases = [
      "renderGoogleSettings",
      "google-settings-mount",
      "clientId",
      "mockMode",
      "getRedirectUrl"
    ]
    for phrase in required_phrases:
        if phrase not in features_js:
            print(f"  ❌ FAIL: Missing '{phrase}' in features.js!")
            return False, f"Missing {phrase} in features.js"

    print("  ✓ PASS: Google settings tab and features.js handlers verified.")
    return True, "Passed"


def test_3_google_service_oauth_flow():
    """Verify pure JS GoogleService OAuth URL construction & Client ID handling."""
    print("\n[CHALLENGE 3] Verifying GoogleService OAuth Flow & URL Generation...")
    node_code = """
    const { GoogleServiceClass } = require('./services/google-service.js');
    const svc = new GoogleServiceClass({
      clientId: '  12345-test.apps.googleusercontent.com\\n '
    });

    const redirectUri = 'https://mockextensionid.chromiumapp.org/';
    const authUrl = svc.buildAuthUrl(redirectUri);

    const parsedUrl = new URL(authUrl);
    const params = parsedUrl.searchParams;

    console.log(JSON.stringify({
      clientId: svc.clientId,
      authHost: parsedUrl.origin + parsedUrl.pathname,
      paramClientId: params.get('client_id'),
      paramResponseType: params.get('response_type'),
      paramRedirectUri: params.get('redirect_uri'),
      paramScope: params.get('scope'),
      hasCalendarScope: params.get('scope').includes('calendar'),
      hasGmailScope: params.get('scope').includes('gmail'),
      hasDriveScope: params.get('scope').includes('drive')
    }));
    """
    res = run_node_eval(node_code)
    if not res["success"]:
        print(f"  ❌ FAIL: Node execution error: {res['error']}")
        return False, res["error"]

    data = res["data"]
    if data["clientId"] != "12345-test.apps.googleusercontent.com":
        print(f"  ❌ FAIL: Client ID whitespace not trimmed: {data['clientId']}")
        return False, "Client ID trimming failed"

    if data["authHost"] != "https://accounts.google.com/o/oauth2/v2/auth":
        print(f"  ❌ FAIL: Unexpected OAuth base URL: {data['authHost']}")
        return False, "OAuth base URL mismatch"

    if data["paramResponseType"] != "token":
        print(f"  ❌ FAIL: response_type must be token, got: {data['paramResponseType']}")
        return False, "response_type mismatch"

    if not (data["hasCalendarScope"] and data["hasGmailScope"] and data["hasDriveScope"]):
        print(f"  ❌ FAIL: Scopes missing required APIs: {data['paramScope']}")
        return False, "Scope requirements missing"

    print("  ✓ PASS: OAuth URL generation, trimming, and scopes validated.")
    return True, "Passed"


def test_4_token_extraction_and_lifecycle():
    """Verify access token extraction from URL fragment, expiry, and logout."""
    print("\n[CHALLENGE 4] Verifying Token Extraction & Lifecycle...")
    node_code = """
    const { GoogleServiceClass } = require('./services/google-service.js');
    const svc = new GoogleServiceClass();

    // 1. Valid token fragment
    const validRedirect = 'https://mock.chromiumapp.org/#access_token=ya29.sample_oauth_token_xyz&token_type=Bearer&expires_in=3600';
    const parsedValid = svc.parseRedirectHash(validRedirect);

    // 2. Error fragment
    const errorRedirect = 'https://mock.chromiumapp.org/#error=access_denied&error_description=User+cancelled';
    const parsedError = svc.parseRedirectHash(errorRedirect);

    // 3. State machine
    svc.configure({ clientId: '', mockMode: false });
    const stateNoClient = svc.getAuthState();

    svc.configure({ clientId: 'valid-client-id', mockMode: false });
    const stateNotLoggedIn = svc.getAuthState();

    svc.configure({ mockMode: true });
    const stateMock = svc.getAuthState();

    console.log(JSON.stringify({
      validToken: parsedValid.token,
      validExpiresIn: parsedValid.expires_in,
      hasError: !!parsedError.error,
      errorDesc: parsedError.errorDescription,
      stateNoClient,
      stateNotLoggedIn,
      stateMock
    }));
    """
    res = run_node_eval(node_code)
    if not res["success"]:
        print(f"  ❌ FAIL: Node execution error: {res['error']}")
        return False, res["error"]

    data = res["data"]
    if data["validToken"] != "ya29.sample_oauth_token_xyz":
        print(f"  ❌ FAIL: Token extraction failed: {data['validToken']}")
        return False, "Token extraction mismatch"

    if data["validExpiresIn"] != 3600:
        print(f"  ❌ FAIL: Expiration extraction failed: {data['validExpiresIn']}")
        return False, "ExpiresIn mismatch"

    if not data["hasError"]:
        print("  ❌ FAIL: Error response fragment not detected!")
        return False, "Error fragment not detected"

    if data["stateNoClient"] != "NO_CLIENT_ID" or data["stateNotLoggedIn"] != "NOT_LOGGED_IN" or data["stateMock"] != "MOCK":
        print(f"  ❌ FAIL: State machine failed: {data}")
        return False, "State machine mismatch"

    print("  ✓ PASS: Token parsing, error handling, and state machine validated.")
    return True, "Passed"


def test_5_mock_mode_fixtures_schemas():
    """Verify mock fixtures conform to official Google Calendar, Gmail, and Drive schemas."""
    print("\n[CHALLENGE 5] Verifying Mock Mode Fixtures Schemas...")
    node_code = """
    const { GoogleServiceClass } = require('./services/google-service.js');
    const svc = new GoogleServiceClass({ mockMode: true });

    const calEvents = svc.getMockCalendarEvents(3);
    const gmailData = svc.getMockGmailUnread();
    const driveFiles = svc.getMockDriveFiles(3);

    console.log(JSON.stringify({
      calCount: calEvents.length,
      calFirstSummary: calEvents[0].summary,
      calFirstStart: calEvents[0].start,
      calFirstHtml: calEvents[0].htmlLink,
      gmailUnreadCount: gmailData.unreadCount,
      gmailMsgCount: gmailData.messages.length,
      gmailFirstFrom: gmailData.messages[0].from,
      gmailFirstSubject: gmailData.messages[0].subject,
      driveCount: driveFiles.length,
      driveFirstName: driveFiles[0].name,
      driveFirstMime: driveFiles[0].mimeType,
      driveFirstLink: driveFiles[0].webViewLink
    }));
    """
    res = run_node_eval(node_code)
    if not res["success"]:
        print(f"  ❌ FAIL: Node execution error: {res['error']}")
        return False, res["error"]

    data = res["data"]
    if data["calCount"] != 3 or not data["calFirstSummary"] or not data["calFirstHtml"]:
        print(f"  ❌ FAIL: Calendar mock fixtures invalid: {data}")
        return False, "Calendar fixtures invalid"

    if data["gmailUnreadCount"] < 1 or data["gmailMsgCount"] < 1 or not data["gmailFirstSubject"]:
        print(f"  ❌ FAIL: Gmail mock fixtures invalid: {data}")
        return False, "Gmail fixtures invalid"

    if data["driveCount"] != 3 or ".gdoc" not in data["driveFirstName"] or not data["driveFirstLink"]:
        print(f"  ❌ FAIL: Drive mock fixtures invalid: {data}")
        return False, "Drive fixtures invalid"

    print("  ✓ PASS: Schema-compliant mock fixtures verified across all 3 services.")
    return True, "Passed"


def test_6_google_news_rss_parsing():
    """Verify Google News RSS URL generation and native XML parsing."""
    print("\n[CHALLENGE 6] Verifying Google News RSS Parsing & CDATA Stripping...")
    node_code = """
    const { GoogleServiceClass } = require('./services/google-service.js');
    const svc = new GoogleServiceClass();

    const rssUrlRu = svc.buildRssUrl('ru', 'RU', 'RU:ru', '');
    const rssUrlTech = svc.buildRssUrl('ru', 'RU', 'RU:ru', 'TECHNOLOGY');

    const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
    <rss version="2.0">
      <channel>
        <title>Google News</title>
        <item>
          <title><![CDATA[ChromeOS 130 New Tab Desktop Edition - Google Blog]]></title>
          <link>https://news.google.com/sample-article-1</link>
          <pubDate>Wed, 14 Oct 2026 18:00:00 GMT</pubDate>
          <source url="https://blog.google">Google Blog</source>
        </item>
        <item>
          <title>Open-Meteo and Google Services integration released</title>
          <link>https://news.google.com/sample-article-2</link>
          <pubDate>Wed, 14 Oct 2026 19:30:00 GMT</pubDate>
          <source url="https://techcrunch.com">TechCrunch</source>
        </item>
      </channel>
    </rss>`;

    const parsedItems = svc.parseRssXml(sampleXml);

    const emptyXml = '<rss><channel><title>Empty</title></channel></rss>';
    const parsedEmpty = svc.parseRssXml(emptyXml);

    console.log(JSON.stringify({
      rssUrlRu,
      rssUrlTech,
      itemCount: parsedItems.length,
      firstTitle: parsedItems[0].title,
      firstSource: parsedItems[0].source,
      firstSourceUrl: parsedItems[0].sourceUrl,
      secondTitle: parsedItems[1].title,
      emptyCount: parsedEmpty.length
    }));
    """
    res = run_node_eval(node_code)
    if not res["success"]:
        print(f"  ❌ FAIL: Node execution error: {res['error']}")
        return False, res["error"]

    data = res["data"]
    if "news.google.com/rss" not in data["rssUrlRu"] or "TECHNOLOGY" not in data["rssUrlTech"]:
        print(f"  ❌ FAIL: RSS URL construction error: {data}")
        return False, "RSS URL mismatch"

    if data["itemCount"] != 2:
        print(f"  ❌ FAIL: Expected 2 parsed items, got: {data['itemCount']}")
        return False, "Parsed items count mismatch"

    # Verify CDATA and " - Source" suffix stripping
    if data["firstTitle"] != "ChromeOS 130 New Tab Desktop Edition":
        print(f"  ❌ FAIL: Source suffix not cleanly stripped: '{data['firstTitle']}'")
        return False, "Title source stripping failed"

    if data["firstSource"] != "Google Blog" or data["firstSourceUrl"] != "https://blog.google":
        print(f"  ❌ FAIL: Source extraction failed: {data}")
        return False, "Source extraction failed"

    if data["emptyCount"] != 0:
        print(f"  ❌ FAIL: Empty XML did not produce 0 items: {data['emptyCount']}")
        return False, "Empty XML parsing error"

    print("  ✓ PASS: Google News RSS parsing, CDATA stripping, and source cleanup verified.")
    return True, "Passed"


def test_7_google_shortcuts_catalog():
    """Verify ecosystem shortcuts catalog for services without public APIs."""
    print("\n[CHALLENGE 7] Verifying Google Ecosystem Shortcuts Catalog...")
    node_code = """
    const { GoogleServiceClass } = require('./services/google-service.js');
    const svc = new GoogleServiceClass();
    const shortcuts = svc.getGoogleShortcuts();

    console.log(JSON.stringify({
      count: shortcuts.length,
      titles: shortcuts.map(s => s.title),
      urls: shortcuts.map(s => s.url)
    }));
    """
    res = run_node_eval(node_code)
    if not res["success"]:
        print(f"  ❌ FAIL: Node execution error: {res['error']}")
        return False, res["error"]

    data = res["data"]
    required_services = ["Google One", "Google Keep", "Google Фото", "Google Meet", "Google Docs", "Google Диск", "Gmail"]
    for req in required_services:
        if req not in data["titles"]:
            print(f"  ❌ FAIL: Shortcut '{req}' missing from catalog!")
            return False, f"Missing shortcut {req}"

    for u in data["urls"]:
        if not u.startswith("https://"):
            print(f"  ❌ FAIL: Insecure or invalid shortcut URL: {u}")
            return False, f"Invalid shortcut URL {u}"

    print(f"  ✓ PASS: Verified catalog of {data['count']} Google ecosystem shortcuts.")
    return True, "Passed"


def test_8_cros_widgets_registration():
    """Verify CrosWidgets registry has calendar, gmail, drive, and news registered."""
    print("\n[CHALLENGE 8] Verifying CrosWidgets Registry & Integration...")
    node_code = """
    const { CrosWidgets } = require('./widgets.js');
    const catalog = CrosWidgets.getCatalog();
    const types = catalog.map(c => c.type);

    console.log(JSON.stringify({
      types,
      hasCalendar: types.includes('calendar'),
      hasGmail: types.includes('gmail'),
      hasDrive: types.includes('drive'),
      hasNews: types.includes('news')
    }));
    """
    res = run_node_eval(node_code)
    if not res["success"]:
        print(f"  ❌ FAIL: Node execution error: {res['error']}")
        return False, res["error"]

    data = res["data"]
    for widget_type in ["calendar", "gmail", "drive", "news"]:
        if not data.get(f"has{widget_type.capitalize()}"):
            print(f"  ❌ FAIL: Widget '{widget_type}' not registered in CrosWidgets!")
            return False, f"Widget {widget_type} missing"

    print("  ✓ PASS: All 4 Google widgets registered in CrosWidgets catalog.")
    return True, "Passed"


def test_9_css_styling_verification():
    """Verify features.css contains rules for Google widgets, cards, and settings."""
    print("\n[CHALLENGE 9] Verifying features.css Styling Rules...")
    css_path = os.path.join(PROJECT_ROOT, "features.css")
    with open(css_path, "r", encoding="utf-8") as f:
        css = f.read()

    required_selectors = [
        ".google-widget-card",
        ".google-state-card",
        ".google-badge-mock",
        ".cal-event-item",
        ".cal-meet-btn",
        ".gmail-unread-pill",
        ".gmail-msg-item",
        ".drive-file-item",
        ".news-topic-chip",
        ".google-news-list",
        ".google-status-pill",
        ".google-redirect-box"
    ]

    for sel in required_selectors:
        if sel not in css:
            print(f"  ❌ FAIL: CSS selector '{sel}' not found in features.css!")
            return False, f"Missing CSS selector {sel}"

    print(f"  ✓ PASS: All {len(required_selectors)} Google CSS rules present in features.css.")
    return True, "Passed"


def main():
    print("=" * 72)
    print("🎯 CrOS New Tab v0.3 — Empirical Challenger Suite (Milestone 5)")
    print("   Google Services Integration, OAuth & News")
    print("=" * 72)

    tests = [
        ("Challenge 1: Script Loading Order & CSP Compliance", test_1_script_loading_order_and_csp),
        ("Challenge 2: Google Settings Tab UI & Handlers", test_2_google_settings_ui),
        ("Challenge 3: GoogleService OAuth URL & Client ID", test_3_google_service_oauth_flow),
        ("Challenge 4: Token Extraction & Lifecycle", test_4_token_extraction_and_lifecycle),
        ("Challenge 5: Mock Mode Fixtures Schemas", test_5_mock_mode_fixtures_schemas),
        ("Challenge 6: Google News RSS Native XML Parsing", test_6_google_news_rss_parsing),
        ("Challenge 7: Google Ecosystem Shortcuts Catalog", test_7_google_shortcuts_catalog),
        ("Challenge 8: CrosWidgets Registration (M5 Slots)", test_8_cros_widgets_registration),
        ("Challenge 9: features.css Google Styling Rules", test_9_css_styling_verification),
    ]

    passed = 0
    failed = 0

    for name, fn in tests:
        ok, msg = fn()
        if ok:
            passed += 1
        else:
            failed += 1

    print("\n" + "=" * 72)
    print(f"📊 Milestone 5 Empirical Challenge Summary: {passed}/{len(tests)} Passed")
    print("=" * 72)

    if failed == 0:
        print("🏆 ALL EMPIRICAL CHALLENGES PASSED! Milestone 5 (R2) Verified.")
        sys.exit(0)
    else:
        print(f"❌ {failed} challenge(s) failed!")
        sys.exit(1)


if __name__ == "__main__":
    main()
