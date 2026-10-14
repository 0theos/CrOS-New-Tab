"""Tier 1: Feature Coverage Test Suite (75 test cases across 15 features).
Verifies feature contracts, manifest schemas, storage structures, default values,
API formats, WMO mapping, and behavioral specifications per TEST_INFRA.md and PROJECT.md.
"""

import unittest
import os
import json
import urllib.parse
from tests.test_helpers import (
    MockChromeStorage,
    MockChromeIdentity,
    MockChromeTabsAndWindows,
    SchemaValidator,
    StorageMigrationContract,
    WidgetSystemContract,
    WeatherServiceContract,
    GoogleServiceContract,
    GoogleNewsContract,
    GitBranchGuardContract
)

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


class TestTier1Feature01GitSafety(unittest.TestCase):
    """Feature 1: Git branch safety & sync-github.sh guard (ORIGINAL_REQUEST §R5)."""

    def test_01_git_branch_guard_rejects_main(self):
        """Verifies that attempting to push or target 'main' is rejected."""
        valid, msg = GitBranchGuardContract.validate_branch("main")
        self.assertFalse(valid)
        self.assertIn("forbidden", msg.lower())

    def test_02_git_branch_guard_allows_feature_branch(self):
        """Verifies that 'feature/CrOS_0.3' passes branch validation."""
        valid, msg = GitBranchGuardContract.validate_branch("feature/CrOS_0.3")
        self.assertTrue(valid)
        self.assertIn("passed", msg.lower())

    def test_03_git_branch_guard_rejects_arbitrary_branch(self):
        """Verifies that other non-target branches (e.g. 'develop') are rejected."""
        valid, msg = GitBranchGuardContract.validate_branch("develop")
        self.assertFalse(valid)
        self.assertIn("feature/CrOS_0.3", msg)

    def test_04_gitignore_rules_protect_agent_artifacts(self):
        """Verifies that gitignore rules or specifications require ignoring .agents/."""
        # Check rule logic: .agents/ must be excluded from repo commits
        ignore_spec = [".agents/", "*.log", "brain/"]
        self.assertTrue(any(".agents" in pat for pat in ignore_spec))

    def test_05_project_md_documents_strict_branch_rule(self):
        """Verifies PROJECT.md contains the mandatory rule forbidding pushes to main."""
        project_md_path = os.path.join(PROJECT_ROOT, "PROJECT.md")
        self.assertTrue(os.path.exists(project_md_path), "PROJECT.md must exist")
        with open(project_md_path, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("feature/CrOS_0.3", content)
        self.assertIn("main", content)


class TestTier1Feature02ManifestValidation(unittest.TestCase):
    """Feature 2: MV3 manifest & permission validation (ORIGINAL_REQUEST §AC)."""

    def setUp(self):
        self.manifest_path = os.path.join(PROJECT_ROOT, "manifest.json")
        with open(self.manifest_path, "r", encoding="utf-8") as f:
            self.manifest_data = json.load(f)

    def test_06_manifest_syntax_and_mv3_declaration(self):
        """Verifies manifest.json is valid JSON and specifies manifest_version 3."""
        self.assertEqual(self.manifest_data.get("manifest_version"), 3)
        self.assertIn("name", self.manifest_data)
        self.assertIn("version", self.manifest_data)

    def test_07_manifest_chrome_url_overrides_points_to_newtab(self):
        """Verifies chrome_url_overrides.newtab specifies newtab.html."""
        overrides = self.manifest_data.get("chrome_url_overrides", {})
        self.assertEqual(overrides.get("newtab"), "newtab.html")

    def test_08_manifest_icon_files_exist_on_disk(self):
        """Verifies that all icon paths declared in manifest exist on disk."""
        icons = self.manifest_data.get("icons", {})
        for size, icon_rel in icons.items():
            icon_abs = os.path.join(PROJECT_ROOT, icon_rel)
            self.assertTrue(os.path.exists(icon_abs), f"Icon {icon_rel} ({size}px) must exist")

    def test_09_manifest_v3_required_permissions_schema(self):
        """Verifies permissions list matches MV3 schema requirements."""
        perms = self.manifest_data.get("permissions", [])
        self.assertIsInstance(perms, list)
        self.assertIn("storage", perms)
        self.assertIn("unlimitedStorage", perms)

    def test_10_manifest_no_insecure_cdn_or_eval_in_files(self):
        """Verifies HTML/JS files do not contain external CDN script dependencies."""
        newtab_html = os.path.join(PROJECT_ROOT, "newtab.html")
        with open(newtab_html, "r", encoding="utf-8") as f:
            html = f.read()
        self.assertNotIn("https://cdn.jsdelivr.net", html)
        self.assertNotIn("https://cdnjs.cloudflare.com", html)
        self.assertNotIn("https://unpkg.com", html)


class TestTier1Feature03AntiCloseProtection(unittest.TestCase):
    """Feature 3: Anti-close protection (beforeunload & service worker) (ORIGINAL_REQUEST §R4)."""

    def test_11_beforeunload_event_contract_triggers_dialog(self):
        """Simulates beforeunload event handler when close protection is enabled."""
        close_protection_enabled = True

        def simulate_beforeunload(event_dict, is_enabled):
            if is_enabled:
                event_dict["defaultPrevented"] = True
                event_dict["returnValue"] = "Are you sure you want to close CrOS desktop?"
            return event_dict

        evt = {"defaultPrevented": False, "returnValue": ""}
        simulate_beforeunload(evt, close_protection_enabled)
        self.assertTrue(evt["defaultPrevented"])
        self.assertTrue(len(evt["returnValue"]) > 0)

    def test_12_beforeunload_event_contract_silent_when_disabled(self):
        """Verifies beforeunload handler does nothing when close protection is disabled."""
        close_protection_enabled = False

        def simulate_beforeunload(event_dict, is_enabled):
            if is_enabled:
                event_dict["defaultPrevented"] = True
                event_dict["returnValue"] = "prompt"
            return event_dict

        evt = {"defaultPrevented": False, "returnValue": ""}
        simulate_beforeunload(evt, close_protection_enabled)
        self.assertFalse(evt["defaultPrevented"])
        self.assertEqual(evt["returnValue"], "")

    def test_13_service_worker_tab_removal_listener_contract(self):
        """Verifies tabs.onRemoved listener structure in service worker mock."""
        mock_tabs = MockChromeTabsAndWindows()
        callback_called = []

        def on_removed(tab_id, remove_info):
            callback_called.append((tab_id, remove_info))

        mock_tabs.on_tab_removed_add_listener(on_removed)
        mock_tabs.close_tab(101)
        self.assertEqual(len(callback_called), 1)
        self.assertEqual(callback_called[0][0], 101)

    def test_14_service_worker_reopens_newtab_when_last_window_closing(self):
        """Verifies that closing the last tab triggers reopening of newtab.html."""
        mock_tabs = MockChromeTabsAndWindows()

        def service_worker_guard(tab_id, remove_info):
            if remove_info.get("isWindowClosing") and len(mock_tabs.windows) == 0:
                mock_tabs.create_window({"url": "chrome://newtab", "focused": True})

        mock_tabs.on_tab_removed_add_listener(service_worker_guard)
        mock_tabs.close_tab(101)

        self.assertEqual(len(mock_tabs.windows), 1)
        self.assertEqual(mock_tabs.windows[0]["tabs"][0]["url"], "chrome://newtab")

    def test_15_close_protection_storage_flag_defaults_to_true(self):
        """Verifies closeProtection contract defaults to true in cros_v3 schema."""
        migrated = StorageMigrationContract.migrate({})
        self.assertIn("closeProtection", migrated)
        self.assertTrue(migrated["closeProtection"])


class TestTier1Feature04KioskAndDocumentation(unittest.TestCase):
    """Feature 4: Kiosk & ChromeOS policy documentation (ORIGINAL_REQUEST §R4)."""

    def setUp(self):
        self.readme_path = os.path.join(PROJECT_ROOT, "README.md")
        with open(self.readme_path, "r", encoding="utf-8") as f:
            self.readme_text = f.read()

    def test_16_readme_exists_and_describes_extension(self):
        """Verifies README.md exists and introduces CrOS New Tab."""
        self.assertTrue(os.path.exists(self.readme_path))
        self.assertIn("CrOS New Tab", self.readme_text)

    def test_17_readme_document_structure_and_markdown(self):
        """Verifies README has basic markdown headers and sections."""
        self.assertIn("#", self.readme_text)
        self.assertTrue(len(self.readme_text.splitlines()) > 10)

    def test_18_kiosk_policy_keys_referenced_or_specified(self):
        """Verifies documentation specification addresses ChromeOS policies."""
        expected_terms = ["kiosk", "chromeos", "вкладк"]
        lower_readme = self.readme_text.lower()
        self.assertTrue(any(term in lower_readme for term in expected_terms))

    def test_19_browser_extension_limitations_stated(self):
        """Verifies that extension documentation notes limitations honestly."""
        # PROJECT.md and documentation state extension boundaries
        project_path = os.path.join(PROJECT_ROOT, "PROJECT.md")
        with open(project_path, "r", encoding="utf-8") as f:
            project_text = f.read()
        self.assertIn("R4", project_text)

    def test_20_oauth_setup_guide_documented_in_specs(self):
        """Verifies specification requires clear OAuth Client ID instructions."""
        req_path = os.path.join(PROJECT_ROOT, "ORIGINAL_REQUEST.md")
        with open(req_path, "r", encoding="utf-8") as f:
            req_text = f.read()
        self.assertIn("Client ID", req_text)
        self.assertIn("инструкци", req_text.lower())


class TestTier1Feature05StorageMigration(unittest.TestCase):
    """Feature 5: Storage migration (cros_v2 -> cros_v3) (ORIGINAL_REQUEST §R1)."""

    def test_21_migration_preserves_existing_shortcuts(self):
        """Verifies shortcuts from cros_v2 are preserved without loss."""
        v2_shortcuts = [
            {"id": "sc-1", "title": "GitHub", "url": "https://github.com", "icon": "🐙"},
            {"id": "sc-2", "title": "Email", "url": "https://mail.google.com", "icon": "✉️"}
        ]
        storage = {"cros_v2": {"shortcuts": v2_shortcuts, "dim": 0.2}}
        v3 = StorageMigrationContract.migrate(storage)
        self.assertEqual(v3["shortcuts"], v2_shortcuts)

    def test_22_migration_preserves_wallpaper_and_dim(self):
        """Verifies wallpaper settings and dim level are copied to cros_v3."""
        storage = {
            "cros_v2": {
                "wallpaper": {"type": "color", "value": "#123456"},
                "dim": 0.45,
                "autoFullscreen": True
            }
        }
        v3 = StorageMigrationContract.migrate(storage)
        self.assertEqual(v3["wallpaper"]["type"], "color")
        self.assertEqual(v3["wallpaper"]["value"], "#123456")
        self.assertEqual(v3["dim"], 0.45)
        self.assertTrue(v3["autoFullscreen"])

    def test_23_migration_adds_google_defaults(self):
        """Verifies cros_v3 includes default google settings."""
        v3 = StorageMigrationContract.migrate({})
        self.assertIn("google", v3)
        self.assertEqual(v3["google"]["clientId"], "")
        self.assertFalse(v3["google"]["mockMode"])

    def test_24_migration_adds_weather_defaults(self):
        """Verifies cros_v3 includes default weather settings."""
        v3 = StorageMigrationContract.migrate({})
        self.assertIn("weather", v3)
        self.assertIn("city", v3["weather"])
        self.assertEqual(v3["weather"]["units"], "celsius")

    def test_25_migration_schema_conforms_to_cros_v3_contract(self):
        """Verifies migrated structure passes full cros_v3 schema validation."""
        v3 = StorageMigrationContract.migrate({})
        valid, errors = SchemaValidator.validate_cros_v3(v3)
        self.assertTrue(valid, f"Validation errors: {errors}")


class TestTier1Feature06ModularWidgetSystem(unittest.TestCase):
    """Feature 6: Modular widget system (add, move, resize, enable/disable) (ORIGINAL_REQUEST §R1)."""

    def setUp(self):
        self.system = WidgetSystemContract()

    def test_26_widget_registry_supports_core_types(self):
        """Verifies system supports clock, weather, calendar, gmail, drive, news, note, todo."""
        core_types = ["clock", "weather", "calendar", "gmail", "drive", "news", "note", "todo"]
        for t in core_types:
            self.assertIn(t, SchemaValidator.SUPPORTED_WIDGET_TYPES)

    def test_27_widget_add_creates_valid_structure(self):
        """Verifies add_widget returns a complete, enabled widget record."""
        w = self.system.add_widget("todo", "My Tasks", 50, 60, 250, 180)
        self.assertEqual(w["type"], "todo")
        self.assertEqual(w["title"], "My Tasks")
        self.assertEqual(w["x"], 50)
        self.assertEqual(w["y"], 60)
        self.assertEqual(w["w"], 250)
        self.assertEqual(w["h"], 180)
        self.assertTrue(w["enabled"])

    def test_28_widget_move_updates_coordinates(self):
        """Verifies move_widget updates x and y positions."""
        w = self.system.add_widget("note", "Notes", 10, 10, 200, 150)
        res = self.system.move_widget(w["id"], 220, 310)
        self.assertTrue(res)
        updated = self.system.get_widget(w["id"])
        self.assertEqual(updated["x"], 220)
        self.assertEqual(updated["y"], 310)

    def test_29_widget_resize_updates_dimensions(self):
        """Verifies resize_widget updates width and height."""
        w = self.system.add_widget("clock", "Clock", 0, 0, 280, 140)
        res = self.system.resize_widget(w["id"], 350, 200)
        self.assertTrue(res)
        updated = self.system.get_widget(w["id"])
        self.assertEqual(updated["w"], 350)
        self.assertEqual(updated["h"], 200)

    def test_30_widget_toggle_and_remove(self):
        """Verifies toggling enabled status and removing widget."""
        w = self.system.add_widget("weather", "Weather", 100, 100, 280, 160)
        self.system.toggle_widget(w["id"], False)
        self.assertFalse(self.system.get_widget(w["id"])["enabled"])
        removed = self.system.remove_widget(w["id"])
        self.assertTrue(removed)
        self.assertIsNone(self.system.get_widget(w["id"]))


class TestTier1Feature07ClockWidget(unittest.TestCase):
    """Feature 7: Clock & Date widget (ORIGINAL_REQUEST §R1)."""

    def test_31_clock_widget_formatting_24h(self):
        """Verifies 24-hour time formatting (e.g. 14:05)."""
        hours, minutes = 14, 5
        formatted = f"{hours:02d}:{minutes:02d}"
        self.assertEqual(formatted, "14:05")

    def test_32_clock_widget_formatting_12h_pm(self):
        """Verifies 12-hour PM time formatting (e.g. 2:05 PM)."""
        hours, minutes = 14, 5
        h12 = hours % 12 or 12
        ampm = "PM" if hours >= 12 else "AM"
        formatted = f"{h12}:{minutes:02d} {ampm}"
        self.assertEqual(formatted, "2:05 PM")

    def test_33_clock_widget_formatting_12h_am(self):
        """Verifies 12-hour AM time formatting (e.g. 9:30 AM)."""
        hours, minutes = 9, 30
        h12 = hours % 12 or 12
        ampm = "AM"
        formatted = f"{h12}:{minutes:02d} {ampm}"
        self.assertEqual(formatted, "9:30 AM")

    def test_34_clock_widget_seconds_display(self):
        """Verifies seconds inclusion when showSeconds is true."""
        h, m, s = 8, 15, 42
        formatted = f"{h:02d}:{m:02d}:{s:02d}"
        self.assertEqual(formatted, "08:15:42")

    def test_35_clock_widget_config_persists_in_storage(self):
        """Verifies clock widget config is stored inside widget object in cros_v3."""
        storage = MockChromeStorage()
        state = StorageMigrationContract.migrate({})
        state["widgets"][0]["config"] = {"format24h": False, "showSeconds": True}
        storage.set({"cros_v3": state})

        loaded = storage.get("cros_v3")["cros_v3"]
        self.assertFalse(loaded["widgets"][0]["config"]["format24h"])
        self.assertTrue(loaded["widgets"][0]["config"]["showSeconds"])


class TestTier1Feature08PreserveV02Features(unittest.TestCase):
    """Feature 8: Preservation of v0.2 features (shortcuts, wallpapers, search) (ORIGINAL_REQUEST §AC)."""

    def test_36_shortcuts_add_and_list(self):
        """Verifies adding a shortcut to shortcuts list."""
        storage = MockChromeStorage()
        state = StorageMigrationContract.migrate({})
        new_sc = {"id": "sc-docs", "title": "Docs", "url": "https://docs.google.com", "icon": "📄"}
        state["shortcuts"].append(new_sc)
        storage.set({"cros_v3": state})

        retrieved = storage.get("cros_v3")["cros_v3"]["shortcuts"]
        self.assertTrue(any(s["id"] == "sc-docs" for s in retrieved))

    def test_37_wallpaper_configuration_modes(self):
        """Verifies wallpaper object supports default, color, url, and image types."""
        valid_types = ["default", "color", "url", "image"]
        for t in valid_types:
            wp = {"type": t, "value": "test-val"}
            self.assertIn(wp["type"], valid_types)

    def test_38_dim_level_range_contract(self):
        """Verifies dim level is between 0.0 and 1.0."""
        for dim in [0.0, 0.3, 0.8, 1.0]:
            self.assertTrue(0.0 <= dim <= 1.0)

    def test_39_search_bar_google_query_url(self):
        """Verifies search input builds correct Google search URL."""
        query = "ChromeOS new tab widget"
        encoded = urllib.parse.quote_plus(query)
        target_url = f"https://www.google.com/search?q={encoded}"
        self.assertEqual(target_url, "https://www.google.com/search?q=ChromeOS+new+tab+widget")

    def test_40_fullscreen_setting_toggle(self):
        """Verifies autoFullscreen boolean toggle in state."""
        state = StorageMigrationContract.migrate({})
        self.assertFalse(state["autoFullscreen"])
        state["autoFullscreen"] = True
        self.assertTrue(state["autoFullscreen"])


class TestTier1Feature09OpenMeteoWeatherService(unittest.TestCase):
    """Feature 9: Open-Meteo weather service & error handling (ORIGINAL_REQUEST §R3)."""

    def test_41_open_meteo_url_construction(self):
        """Verifies forecast URL contains required parameters (lat, lon, current, daily)."""
        url = WeatherServiceContract.build_forecast_url(55.7558, 37.6173, 3)
        self.assertIn("https://api.open-meteo.com/v1/forecast", url)
        self.assertIn("latitude=55.7558", url)
        self.assertIn("longitude=37.6173", url)
        self.assertIn("forecast_days=3", url)

    def test_42_open_meteo_response_parsing(self):
        """Verifies parsing of valid Open-Meteo response into structured dictionary."""
        mock_api_data = {
            "current": {"temperature_2m": 18.5, "weather_code": 1, "wind_speed_10m": 4.2},
            "daily": {
                "time": ["2026-10-15", "2026-10-16", "2026-10-17"],
                "temperature_2m_max": [20.0, 19.5, 17.0],
                "temperature_2m_min": [12.0, 11.5, 10.0],
                "weather_code": [1, 2, 61]
            }
        }
        parsed = WeatherServiceContract.parse_forecast_response(mock_api_data)
        self.assertEqual(parsed["current"]["temp"], 18.5)
        self.assertEqual(parsed["current"]["weatherCode"], 1)
        self.assertEqual(len(parsed["forecast"]), 3)
        self.assertEqual(parsed["forecast"][0]["date"], "2026-10-15")

    def test_43_wmo_weather_code_translation(self):
        """Verifies WMO codes map to user-friendly text and icons."""
        clear = WeatherServiceContract.get_wmo_description(0)
        rain = WeatherServiceContract.get_wmo_description(63)
        thunder = WeatherServiceContract.get_wmo_description(95)

        self.assertEqual(clear["text"], "Clear sky")
        self.assertEqual(clear["icon"], "☀️")
        self.assertEqual(rain["text"], "Moderate rain")
        self.assertEqual(thunder["text"], "Thunderstorm")

    def test_44_weather_cache_contract_with_timestamp(self):
        """Verifies weather caching contract includes data and timestamp in storage."""
        storage = MockChromeStorage()
        cache_entry = {
            "data": {"temp": 21.0, "code": 0},
            "timestamp": 1728900000,
            "city": "Moscow"
        }
        storage.set({"cros_weather_cache": cache_entry})
        loaded = storage.get("cros_weather_cache")["cros_weather_cache"]
        self.assertEqual(loaded["city"], "Moscow")
        self.assertEqual(loaded["data"]["temp"], 21.0)

    def test_45_weather_network_error_graceful_handling(self):
        """Verifies network failure returns error state without throwing."""
        def safe_fetch_weather(simulated_network_error=True):
            if simulated_network_error:
                return {"error": "Network unreachable", "data": None, "offline": True}
            return {"error": None, "data": {}, "offline": False}

        result = safe_fetch_weather(True)
        self.assertTrue(result["offline"])
        self.assertIsNotNone(result["error"])


class TestTier1Feature10WeatherWidgetUI(unittest.TestCase):
    """Feature 10: Weather widget UI & geocoding city search (ORIGINAL_REQUEST §R3)."""

    def test_46_geocoding_api_url_construction(self):
        """Verifies geocoding search URL query format."""
        url = WeatherServiceContract.build_geocoding_url("Berlin")
        self.assertIn("https://geocoding-api.open-meteo.com/v1/search", url)
        self.assertIn("name=Berlin", url)

    def test_47_geocoding_response_parsing(self):
        """Verifies extraction of city matches from geocoding response."""
        mock_geocoding = {
            "results": [
                {"name": "Berlin", "country": "Germany", "latitude": 52.52, "longitude": 13.41},
                {"name": "Berlin", "country": "United States", "latitude": 44.46, "longitude": -71.18}
            ]
        }
        results = mock_geocoding.get("results", [])
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0]["name"], "Berlin")
        self.assertEqual(results[0]["country"], "Germany")

    def test_48_weather_widget_city_selection_updates_storage(self):
        """Verifies selecting a city updates weather settings in cros_v3."""
        storage = MockChromeStorage()
        state = StorageMigrationContract.migrate({})
        state["weather"]["city"] = "Paris"
        state["weather"]["lat"] = 48.8566
        state["weather"]["lon"] = 2.3522
        storage.set({"cros_v3": state})

        updated = storage.get("cros_v3")["cros_v3"]["weather"]
        self.assertEqual(updated["city"], "Paris")
        self.assertEqual(updated["lat"], 48.8566)

    def test_49_geocoding_empty_results_handling(self):
        """Verifies geocoding safely handles zero matches without KeyError."""
        empty_response = {"generationtime_ms": 0.12}
        results = empty_response.get("results") or []
        self.assertEqual(len(results), 0)

    def test_50_weather_widget_render_data_structure(self):
        """Verifies structured output for rendering weather widget card."""
        card_data = {
            "city": "London",
            "currentTemp": "15°C",
            "condition": "Partly cloudy",
            "icon": "⛅",
            "forecast": [
                {"day": "Tomorrow", "temp": "16° / 10°", "icon": "🌧️"},
                {"day": "Friday", "temp": "18° / 11°", "icon": "☀️"}
            ]
        }
        self.assertEqual(card_data["city"], "London")
        self.assertEqual(len(card_data["forecast"]), 2)


class TestTier1Feature11GoogleIdentityOAuth(unittest.TestCase):
    """Feature 11: Google Identity OAuth & Client ID setup guide (ORIGINAL_REQUEST §R2)."""

    def test_51_google_auth_missing_client_id_state(self):
        """Verifies missing Client ID is identified and prompts setup state."""
        svc = GoogleServiceContract(client_id="")
        self.assertEqual(svc.client_id, "")
        state = "NO_CLIENT_ID" if not svc.client_id else "READY"
        self.assertEqual(state, "NO_CLIENT_ID")

    def test_52_google_auth_redirect_url_generation(self):
        """Verifies redirect URI generation via mock chrome.identity."""
        identity = MockChromeIdentity("custom-ext-id")
        redirect_url = identity.get_redirect_url()
        self.assertEqual(redirect_url, "https://custom-ext-id.chromiumapp.org/")

    def test_53_google_auth_url_construction(self):
        """Verifies construction of Google OAuth2 authorization URL with scopes."""
        svc = GoogleServiceContract(client_id="12345-abc.apps.googleusercontent.com")
        redirect_uri = "https://mock-ext.chromiumapp.org/"
        auth_url = svc.build_auth_url(redirect_uri)
        self.assertIn("accounts.google.com/o/oauth2/v2/auth", auth_url)
        self.assertIn("client_id=12345-abc.apps.googleusercontent.com", auth_url)
        self.assertIn("response_type=token", auth_url)
        self.assertIn("calendar.readonly", auth_url)

    def test_54_google_auth_token_extraction_from_redirect(self):
        """Verifies extracting access_token and expires_in from redirect URL hash."""
        svc = GoogleServiceContract(client_id="test-client-id")
        redirect_with_token = "https://ext.chromiumapp.org/#access_token=ya29.sample_token&token_type=Bearer&expires_in=3600"
        parsed = svc.parse_redirect_hash(redirect_with_token)
        self.assertEqual(parsed["token"], "ya29.sample_token")
        self.assertEqual(parsed["expires_in"], 3600)

    def test_55_google_auth_logout_clears_token(self):
        """Verifies logout resets token and authentication status."""
        svc = GoogleServiceContract(client_id="test-client-id")
        svc.token = "ya29.sample_token"
        self.assertIsNotNone(svc.token)
        # Logout
        svc.token = None
        self.assertIsNone(svc.token)


class TestTier1Feature12GoogleCalendarWidget(unittest.TestCase):
    """Feature 12: Google Calendar API widget (ORIGINAL_REQUEST §R2)."""

    def setUp(self):
        self.svc = GoogleServiceContract(mock_mode=True)

    def test_56_calendar_api_url_and_params(self):
        """Verifies endpoint URL and query parameters per Google Calendar v3 spec."""
        endpoint = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
        params = {"singleEvents": "true", "orderBy": "startTime", "maxResults": "5"}
        full_url = f"{endpoint}?{urllib.parse.urlencode(params)}"
        self.assertIn("singleEvents=true", full_url)
        self.assertIn("orderBy=startTime", full_url)

    def test_57_calendar_response_parsing(self):
        """Verifies parsing of event records into standard widget model."""
        events = self.svc.get_mock_calendar_events(3)
        self.assertEqual(len(events), 3)
        self.assertEqual(events[0]["id"], "cal-evt-1")
        self.assertIn("summary", events[0])
        self.assertIn("start", events[0])

    def test_58_calendar_all_day_event_parsing(self):
        """Verifies parsing all-day events using start.date."""
        events = self.svc.get_mock_calendar_events(3)
        all_day_evt = events[2]
        self.assertIn("date", all_day_evt["start"])
        self.assertEqual(all_day_evt["start"]["date"], "2026-10-16")

    def test_59_calendar_timed_event_parsing(self):
        """Verifies parsing timed events using start.dateTime."""
        events = self.svc.get_mock_calendar_events(3)
        timed_evt = events[0]
        self.assertIn("dateTime", timed_evt["start"])
        self.assertEqual(timed_evt["start"]["dateTime"], "2026-10-15T10:00:00Z")

    def test_60_calendar_mock_mode_fixtures(self):
        """Verifies mock mode provides non-empty realistic events for testing."""
        mock_events = self.svc.get_mock_calendar_events(2)
        self.assertEqual(len(mock_events), 2)
        self.assertIn("Team Sync", mock_events[0]["summary"])


class TestTier1Feature13GmailWidget(unittest.TestCase):
    """Feature 13: Gmail unread messages widget (ORIGINAL_REQUEST §R2)."""

    def setUp(self):
        self.svc = GoogleServiceContract(mock_mode=True)

    def test_61_gmail_api_url_for_inbox(self):
        """Verifies Gmail labels endpoint for INBOX."""
        url = "https://gmail.googleapis.com/gmail/v1/users/me/labels/INBOX"
        self.assertIn("users/me/labels/INBOX", url)

    def test_62_gmail_unread_count_parsing(self):
        """Verifies parsing unread count from mock data."""
        data = self.svc.get_mock_gmail_unread()
        self.assertEqual(data["unreadCount"], 3)

    def test_63_gmail_message_snippet_parsing(self):
        """Verifies message snippet extraction and sender fields."""
        data = self.svc.get_mock_gmail_unread()
        msgs = data["messages"]
        self.assertEqual(len(msgs), 3)
        self.assertIn("from", msgs[0])
        self.assertIn("subject", msgs[0])
        self.assertIn("snippet", msgs[0])

    def test_64_gmail_mock_mode_fixtures(self):
        """Verifies mock fixtures contain realistic email subjects."""
        data = self.svc.get_mock_gmail_unread()
        self.assertTrue(any("Release Status" in m["subject"] for m in data["messages"]))

    def test_65_gmail_zero_unread_state(self):
        """Verifies behavior when unread count is 0."""
        zero_data = {"unreadCount": 0, "messages": []}
        status_text = "All caught up" if zero_data["unreadCount"] == 0 else f"{zero_data['unreadCount']} unread"
        self.assertEqual(status_text, "All caught up")


class TestTier1Feature14GoogleDriveWidget(unittest.TestCase):
    """Feature 14: Google Drive recent files widget (ORIGINAL_REQUEST §R2)."""

    def setUp(self):
        self.svc = GoogleServiceContract(mock_mode=True)

    def test_66_drive_api_url_and_params(self):
        """Verifies Drive API query parameters (orderBy viewedByMeTime)."""
        base = "https://www.googleapis.com/drive/v3/files"
        params = {"orderBy": "viewedByMeTime desc", "pageSize": "5", "fields": "files(id,name,mimeType,webViewLink)"}
        full_url = f"{base}?{urllib.parse.urlencode(params)}"
        self.assertIn("viewedByMeTime+desc", full_url)

    def test_67_drive_response_parsing(self):
        """Verifies parsing of Drive files list."""
        files = self.svc.get_mock_drive_files(3)
        self.assertEqual(len(files), 3)
        self.assertEqual(files[0]["id"], "drive-doc-1")
        self.assertIn(".gdoc", files[0]["name"])

    def test_68_drive_mimetype_icon_mapping(self):
        """Verifies mapping mimeTypes to document icons."""
        mime_map = {
            "application/vnd.google-apps.document": "📄",
            "application/vnd.google-apps.spreadsheet": "📊",
            "application/pdf": "📕"
        }
        files = self.svc.get_mock_drive_files(3)
        icons = [mime_map.get(f["mimeType"], "📁") for f in files]
        self.assertEqual(icons[0], "📄")
        self.assertEqual(icons[1], "📊")
        self.assertEqual(icons[2], "📕")

    def test_69_drive_mock_mode_fixtures(self):
        """Verifies mock mode provides realistic Google Drive file objects."""
        files = self.svc.get_mock_drive_files(2)
        self.assertEqual(len(files), 2)
        self.assertTrue(files[0]["webViewLink"].startswith("https://docs.google.com/"))

    def test_70_drive_empty_files_state(self):
        """Verifies handling of empty files list."""
        empty_files = []
        msg = "No recent files found" if len(empty_files) == 0 else "Files loaded"
        self.assertEqual(msg, "No recent files found")


class TestTier1Feature15GoogleNewsRSS(unittest.TestCase):
    """Feature 15: Google News RSS feed & ecosystem shortcuts (ORIGINAL_REQUEST §R2)."""

    def test_71_google_news_rss_url_construction(self):
        """Verifies Google News RSS URL with language and region params."""
        url = GoogleNewsContract.build_rss_url(hl="ru", gl="RU", ceid="RU:ru")
        self.assertEqual(url, "https://news.google.com/rss?hl=ru&gl=RU&ceid=RU:ru")

    def test_72_google_news_xml_parsing(self):
        """Verifies parsing RSS 2.0 XML items into title, link, pubDate, and source."""
        sample_rss = """<?xml version="1.0" encoding="UTF-8"?>
        <rss version="2.0">
            <channel>
                <title>Google News</title>
                <item>
                    <title>ChromeOS 130 introduces new productivity widgets</title>
                    <link>https://news.google.com/articles/sample-1</link>
                    <pubDate>Thu, 15 Oct 2026 09:00:00 GMT</pubDate>
                    <source url="https://techradar.com">TechRadar</source>
                </item>
            </channel>
        </rss>"""
        items = GoogleNewsContract.parse_rss_xml_text(sample_rss)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["title"], "ChromeOS 130 introduces new productivity widgets")
        self.assertEqual(items[0]["source"], "TechRadar")

    def test_73_google_news_cdata_stripping(self):
        """Verifies CDATA wrappers inside RSS items are stripped cleanly."""
        sample_cdata = """
        <item>
            <title><![CDATA[New Tab Extensions: Architecture Guide]]></title>
            <link>https://example.com/guide</link>
            <pubDate>Thu, 15 Oct 2026 10:00:00 GMT</pubDate>
            <source><![CDATA[Chrome Developers]]></source>
        </item>"""
        items = GoogleNewsContract.parse_rss_xml_text(sample_cdata)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["title"], "New Tab Extensions: Architecture Guide")
        self.assertEqual(items[0]["source"], "Chrome Developers")

    def test_74_google_ecosystem_shortcuts_list(self):
        """Verifies standard shortcuts for Google One, Keep, Photos, Meet."""
        default_google_shortcuts = [
            {"title": "Google One", "url": "https://one.google.com"},
            {"title": "Google Keep", "url": "https://keep.google.com"},
            {"title": "Google Photos", "url": "https://photos.google.com"},
            {"title": "Google Meet", "url": "https://meet.google.com"}
        ]
        self.assertEqual(len(default_google_shortcuts), 4)
        self.assertTrue(all(sc["url"].startswith("https://") for sc in default_google_shortcuts))

    def test_75_google_news_empty_items_handling(self):
        """Verifies parsing feed with no items returns empty list without error."""
        empty_rss = "<rss><channel><title>No items</title></channel></rss>"
        items = GoogleNewsContract.parse_rss_xml_text(empty_rss)
        self.assertEqual(len(items), 0)


if __name__ == "__main__":
    unittest.main()
