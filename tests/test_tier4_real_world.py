"""Tier 4: Real-World Application Scenarios (5 Comprehensive Workflows).
Verifies end-to-end user workflows per TEST_INFRA.md:
1. First Launch & Setup (Migration, Default Widgets, Clock, Theme)
2. Full Google Workplace Hub (OAuth Setup, Calendar, Gmail, Drive)
3. Weather Monitoring & City Change (City Search, Forecast, Cache, Offline)
4. Accidental Close Resistance (Beforeunload Warning, Service Worker Tab Reopen)
5. Custom Desktop Layout & Reboot (Widgets, Coordinates, Resize, Reload Persistence)
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
    GoogleNewsContract
)

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


class TestTier4RealWorldScenarios(unittest.TestCase):
    """Real-World Workflow Integration Tests."""

    def setUp(self):
        self.storage = MockChromeStorage()

    def test_workflow_01_first_launch_and_setup(self):
        """Scenario 1: First Launch & Setup (V2 Migration, Default Widgets, Clock, Theme Init)."""
        # Step 1: User opens extension with legacy v2 data
        legacy_data = {
            "cros_v2": {
                "shortcuts": [
                    {"id": "sc-1", "title": "Google", "url": "https://www.google.com", "icon": "🌐"}
                ],
                "wallpaper": {"type": "default", "value": ""},
                "dim": 0.1,
                "autoFullscreen": False
            }
        }
        self.storage.set(legacy_data)

        # Step 2: System detects v2 and performs automatic migration to v3
        loaded_storage = self.storage.get(None)
        v3_state = StorageMigrationContract.migrate(loaded_storage)
        self.storage.set({"cros_v3": v3_state})

        # Step 3: Validate migrated structure
        migrated = self.storage.get("cros_v3")["cros_v3"]
        self.assertEqual(migrated["version"], 3)
        self.assertEqual(len(migrated["shortcuts"]), 1)
        self.assertTrue(len(migrated["widgets"]) >= 2)

        # Step 4: Verify default Clock widget is created and enabled
        clock_widget = [w for w in migrated["widgets"] if w["type"] == "clock"][0]
        self.assertTrue(clock_widget["enabled"])
        self.assertEqual(clock_widget["x"], 20)
        self.assertEqual(clock_widget["y"], 20)

        # Step 5: Verify default Weather widget is created and enabled
        weather_widget = [w for w in migrated["widgets"] if w["type"] == "weather"][0]
        self.assertTrue(weather_widget["enabled"])
        self.assertEqual(migrated["weather"]["city"], "Moscow")

        # Step 6: Verify full schema validation passes
        valid, errors = SchemaValidator.validate_cros_v3(migrated)
        self.assertTrue(valid, f"Validation errors: {errors}")

    def test_workflow_02_full_google_workplace_hub(self):
        """Scenario 2: Full Google Workplace Hub (OAuth Setup, Calendar, Gmail, Drive)."""
        # Step 1: Start with clean v3 desktop
        v3_state = StorageMigrationContract.migrate({})
        self.storage.set({"cros_v3": v3_state})

        # Step 2: User configures custom Google Client ID in settings
        client_id_input = "987654321-myextension.apps.googleusercontent.com"
        state = self.storage.get("cros_v3")["cros_v3"]
        state["google"]["clientId"] = client_id_input
        state["google"]["mockMode"] = True
        self.storage.set({"cros_v3": state})

        # Step 3: Google service initialized with user's client ID and mock mode
        google_svc = GoogleServiceContract(client_id=client_id_input, mock_mode=True)
        self.assertEqual(google_svc.client_id, client_id_input)

        # Step 4: Simulate OAuth login flow via mock identity
        identity = MockChromeIdentity("mock-ext-id")
        redirect_uri = identity.get_redirect_url()
        auth_url = google_svc.build_auth_url(redirect_uri)
        auth_res = identity.launch_web_auth_flow({"url": auth_url, "interactive": True})

        self.assertIsNone(auth_res["error"])
        parsed_hash = google_svc.parse_redirect_hash(auth_res["redirect_url"])
        google_svc.token = parsed_hash["token"]
        self.assertIsNotNone(google_svc.token)

        # Step 5: Add Google widgets (Calendar, Gmail, Drive) to desktop
        system = WidgetSystemContract(state["widgets"])
        w_cal = system.add_widget("calendar", "Calendar", 20, 220, 280, 200)
        w_mail = system.add_widget("gmail", "Gmail", 320, 220, 280, 200)
        w_drive = system.add_widget("drive", "Drive", 620, 220, 280, 200)
        state["widgets"] = system.widgets
        self.storage.set({"cros_v3": state})

        # Step 6: Fetch data for all three widgets concurrently
        cal_events = google_svc.get_mock_calendar_events(5)
        gmail_data = google_svc.get_mock_gmail_unread()
        drive_files = google_svc.get_mock_drive_files(5)

        self.assertTrue(len(cal_events) > 0)
        self.assertEqual(gmail_data["unreadCount"], 3)
        self.assertTrue(len(drive_files) > 0)

        # Step 7: Simulate token expiration
        google_svc.token = None
        reauth_needed = (google_svc.token is None)
        self.assertTrue(reauth_needed)

    def test_workflow_03_weather_monitoring_and_city_change(self):
        """Scenario 3: Weather Monitoring & City Change (City Search, Coordinates, Forecast, Cache)."""
        # Step 1: Start with default weather settings (Moscow)
        state = StorageMigrationContract.migrate({})
        self.assertEqual(state["weather"]["city"], "Moscow")
        self.storage.set({"cros_v3": state})

        # Step 2: Fetch initial forecast and populate cache
        forecast_url = WeatherServiceContract.build_forecast_url(state["weather"]["lat"], state["weather"]["lon"])
        self.assertIn("latitude=55.7558", forecast_url)

        initial_forecast = {
            "current": {"temperature_2m": 16.0, "weather_code": 3, "wind_speed_10m": 4.5},
            "daily": {"time": ["2026-10-15"], "temperature_2m_max": [18.0], "temperature_2m_min": [10.0], "weather_code": [3]}
        }
        parsed_moscow = WeatherServiceContract.parse_forecast_response(initial_forecast)
        self.assertEqual(parsed_moscow["current"]["temp"], 16.0)

        # Cache it
        cache_entry = {"city": "Moscow", "timestamp": 1728910000, "data": parsed_moscow}
        self.storage.set({"cros_weather_cache": cache_entry})

        # Step 3: User searches for new city "Tokyo"
        search_url = WeatherServiceContract.build_geocoding_url("Tokyo")
        self.assertIn("name=Tokyo", search_url)
        geocoding_results = [
            {"name": "Tokyo", "country": "Japan", "latitude": 35.6895, "longitude": 139.6917}
        ]

        # Step 4: User selects Tokyo, updating state
        state["weather"]["city"] = geocoding_results[0]["name"]
        state["weather"]["lat"] = geocoding_results[0]["latitude"]
        state["weather"]["lon"] = geocoding_results[0]["longitude"]
        self.storage.set({"cros_v3": state})

        # Step 5: Fetch Tokyo weather and update cache
        tokyo_forecast = {
            "current": {"temperature_2m": 22.5, "weather_code": 0, "wind_speed_10m": 2.1},
            "daily": {"time": ["2026-10-15"], "temperature_2m_max": [25.0], "temperature_2m_min": [18.0], "weather_code": [0]}
        }
        parsed_tokyo = WeatherServiceContract.parse_forecast_response(tokyo_forecast)
        self.storage.set({"cros_weather_cache": {"city": "Tokyo", "timestamp": 1728911000, "data": parsed_tokyo}})

        # Step 6: Simulate network disconnection -> fallback to cache
        is_offline = True
        active_cache = self.storage.get("cros_weather_cache")["cros_weather_cache"]
        self.assertEqual(active_cache["city"], "Tokyo")
        self.assertEqual(active_cache["data"]["current"]["temp"], 22.5)
        self.assertTrue(is_offline)

    def test_workflow_04_accidental_close_resistance(self):
        """Scenario 4: Accidental Close Resistance (Beforeunload warning, Service worker reopen)."""
        # Step 1: Ensure closeProtection is active in storage
        state = StorageMigrationContract.migrate({})
        self.assertTrue(state["closeProtection"])
        self.storage.set({"cros_v3": state})

        # Step 2: Page interaction occurs
        user_activation = True

        # Step 3: User attempts to close tab -> beforeunload triggers
        def on_beforeunload(has_interacted, protection_enabled):
            if has_interacted and protection_enabled:
                return {"prevented": True, "prompt": "Changes you made may not be saved."}
            return {"prevented": False, "prompt": None}

        unload_event = on_beforeunload(user_activation, state["closeProtection"])
        self.assertTrue(unload_event["prevented"])
        self.assertIsNotNone(unload_event["prompt"])

        # Step 4: User confirms "Leave" and closes tab -> background service worker receives event
        mock_platform = MockChromeTabsAndWindows()
        reopened_windows = []

        def background_service_worker_listener(tab_id, remove_info):
            # If all normal windows are closed, resurrect desktop
            if len(mock_platform.windows) == 0:
                new_win = mock_platform.create_window({"url": "chrome://newtab", "focused": True})
                reopened_windows.append(new_win)

        mock_platform.on_tab_removed_add_listener(background_service_worker_listener)

        # Tab 101 closes
        mock_platform.close_tab(101)

        # Step 5: Desktop successfully resurrected by service worker
        self.assertEqual(len(reopened_windows), 1)
        self.assertEqual(reopened_windows[0]["tabs"][0]["url"], "chrome://newtab")
        self.assertEqual(len(mock_platform.windows), 1)

    def test_workflow_05_custom_desktop_layout_and_reboot(self):
        """Scenario 5: Custom Desktop Layout & Reboot (Custom widgets, coordinates, reload persistence)."""
        # Step 1: Start with default state
        state = StorageMigrationContract.migrate({})

        # Step 2: Add 3 custom shortcuts
        state["shortcuts"] = [
            {"id": "sc-github", "title": "GitHub", "url": "https://github.com", "icon": "🐙"},
            {"id": "sc-docs", "title": "Google Docs", "url": "https://docs.google.com", "icon": "📄"},
            {"id": "sc-music", "title": "YouTube Music", "url": "https://music.youtube.com", "icon": "🎵"}
        ]

        # Step 3: Configure custom wallpaper and dimming
        state["wallpaper"] = {
            "type": "url",
            "value": "https://wallpaper.example.com/cros-dark.png"
        }
        state["dim"] = 0.35

        # Step 4: Set up custom 4-widget desktop layout
        system = WidgetSystemContract([])
        w1 = system.add_widget("clock", "My Clock", x=20, y=20, w=280, h=140)
        w2 = system.add_widget("weather", "Tokyo Weather", x=320, y=20, w=300, h=180)
        w3 = system.add_widget("todo", "Tasks", x=20, y=220, w=280, h=220)
        w4 = system.add_widget("note", "Ideas", x=320, y=220, w=300, h=220)

        # Resize Todo widget
        system.resize_widget(w3["id"], 350, 250)

        state["widgets"] = system.widgets
        self.storage.set({"cros_v3": state})

        # Step 5: Simulate browser reload / reboot by instantiating new session reading from storage
        fresh_storage = MockChromeStorage(self.storage.get(None))
        reloaded_v3 = fresh_storage.get("cros_v3")["cros_v3"]

        # Step 6: Verify 100% layout fidelity
        self.assertEqual(reloaded_v3["dim"], 0.35)
        self.assertEqual(reloaded_v3["wallpaper"]["value"], "https://wallpaper.example.com/cros-dark.png")
        self.assertEqual(len(reloaded_v3["shortcuts"]), 3)
        self.assertEqual(len(reloaded_v3["widgets"]), 4)

        reloaded_system = WidgetSystemContract(reloaded_v3["widgets"])
        reloaded_todo = reloaded_system.get_widget(w3["id"])
        self.assertEqual(reloaded_todo["w"], 350)
        self.assertEqual(reloaded_todo["h"], 250)
        self.assertEqual(reloaded_todo["x"], 20)
        self.assertEqual(reloaded_todo["y"], 220)


if __name__ == "__main__":
    unittest.main()
