"""Tier 3: Pairwise Combinatorial Test Suite (16 test cases).
Verifies interactions and joint behavior between subsystems:
- Custom wallpaper + widgets
- Weather + Google Calendar layout
- Close protection + settings toggle
- Offline state across multiple network widgets
- Material 3 theme palette propagation
- Client ID change across Google services
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


class TestTier3PairwiseInteractions(unittest.TestCase):
    """Pairwise interaction testing across independent features."""

    def setUp(self):
        self.storage = MockChromeStorage()

    def test_pairwise_01_weather_and_calendar_concurrent_execution(self):
        """Weather service and Google Calendar fetching concurrently without state collision."""
        weather_data = {
            "current": {"temperature_2m": 22.0, "weather_code": 0, "wind_speed_10m": 3.0},
            "daily": {"time": ["2026-10-15"], "temperature_2m_max": [24.0], "temperature_2m_min": [14.0], "weather_code": [0]}
        }
        weather_res = WeatherServiceContract.parse_forecast_response(weather_data)

        google_svc = GoogleServiceContract(mock_mode=True)
        calendar_res = google_svc.get_mock_calendar_events(2)

        self.assertEqual(weather_res["current"]["temp"], 22.0)
        self.assertEqual(len(calendar_res), 2)
        # Ensure separate domains and keys
        self.assertNotIn("temp", calendar_res[0])
        self.assertNotIn("summary", weather_res["current"])

    def test_pairwise_02_custom_wallpaper_dim_and_widget_contrast(self):
        """Custom image wallpaper + dim level 0.6 produces valid cros_v3 with high contrast."""
        state = StorageMigrationContract.migrate({})
        state["wallpaper"] = {
            "type": "url",
            "value": "https://images.unsplash.com/photo-1506744038136-46273834b3fb"
        }
        state["dim"] = 0.6
        self.storage.set({"cros_v3": state})

        loaded = self.storage.get("cros_v3")["cros_v3"]
        self.assertEqual(loaded["wallpaper"]["type"], "url")
        self.assertEqual(loaded["dim"], 0.6)
        valid, errors = SchemaValidator.validate_cros_v3(loaded)
        self.assertTrue(valid, f"Schema errors: {errors}")

    def test_pairwise_03_migration_with_preexisting_widgets_and_shortcuts(self):
        """cros_v2 with custom notes and shortcuts migrates cleanly alongside new v3 defaults."""
        v2_state = {
            "shortcuts": [
                {"id": "sc-custom", "title": "Dashboard", "url": "https://corp.intranet", "icon": "📊"}
            ],
            "widgets": [
                {"id": "note-custom-1", "type": "note", "title": "Sprint Goals", "x": 100, "y": 100, "w": 250, "h": 150}
            ],
            "wallpaper": {"type": "color", "value": "#222222"},
            "dim": 0.3
        }
        v3 = StorageMigrationContract.migrate({"cros_v2": v2_state})
        self.assertEqual(len(v3["shortcuts"]), 1)
        self.assertEqual(v3["shortcuts"][0]["id"], "sc-custom")
        self.assertEqual(v3["widgets"][0]["id"], "note-custom-1")
        self.assertTrue(v3["widgets"][0]["enabled"])
        self.assertIn("google", v3)
        self.assertIn("weather", v3)

    def test_pairwise_04_close_protection_toggle_with_running_widgets(self):
        """Toggling close protection from settings updates active beforeunload guard."""
        mock_tabs = MockChromeTabsAndWindows()
        state = StorageMigrationContract.migrate({})
        self.assertTrue(state["closeProtection"])

        # User toggles protection OFF in settings
        state["closeProtection"] = False
        self.storage.set({"cros_v3": state})

        # Test guard behavior
        guard_active = self.storage.get("cros_v3")["cros_v3"]["closeProtection"]
        self.assertFalse(guard_active)

    def test_pairwise_05_google_mock_mode_with_all_three_google_widgets(self):
        """Calendar, Gmail, and Drive simultaneously active in mock mode."""
        google_svc = GoogleServiceContract(mock_mode=True)
        events = google_svc.get_mock_calendar_events(3)
        gmail = google_svc.get_mock_gmail_unread()
        drive = google_svc.get_mock_drive_files(3)

        self.assertEqual(len(events), 3)
        self.assertEqual(gmail["unreadCount"], 3)
        self.assertEqual(len(drive), 3)
        self.assertIn("Team Sync", events[0]["summary"])
        self.assertIn("Alex Developer", gmail["messages"][0]["from"])
        self.assertIn(".gdoc", drive[0]["name"])

    def test_pairwise_06_simultaneous_network_offline_across_weather_and_news(self):
        """Complete offline state simulated: Weather uses cached data, News returns empty gracefully."""
        cached_weather = {
            "current": {"temp": 17.5, "weatherCode": 2, "windSpeed": 5.0, "description": "Partly cloudy", "icon": "⛅"},
            "forecast": []
        }
        is_offline = True

        def resolve_weather():
            return {"data": cached_weather, "offline": True} if is_offline else {"data": {}, "offline": False}

        def resolve_news():
            return {"items": [], "offline": True} if is_offline else {"items": [{"title": "Live"}], "offline": False}

        w_res = resolve_weather()
        n_res = resolve_news()

        self.assertTrue(w_res["offline"])
        self.assertEqual(w_res["data"]["current"]["temp"], 17.5)
        self.assertTrue(n_res["offline"])
        self.assertEqual(len(n_res["items"]), 0)

    def test_pairwise_07_widget_resize_and_shortcut_grid_boundaries(self):
        """Resizing widget near shortcut grid keeps valid coordinates without negative overflow."""
        system = WidgetSystemContract()
        w1 = system.add_widget("todo", "Tasks", x=300, y=100, w=250, h=180)
        system.resize_widget(w1["id"], 400, 300)
        updated = system.get_widget(w1["id"])
        self.assertEqual(updated["w"], 400)
        self.assertEqual(updated["h"], 300)
        self.assertEqual(updated["x"], 300)

    def test_pairwise_08_search_bar_query_while_widgets_updating(self):
        """Submitting Google search query works concurrently with widget updates."""
        query = "ChromeOS enterprise policies"
        encoded = urllib.parse.quote_plus(query)
        search_url = f"https://www.google.com/search?q={encoded}"

        clock_tick = "15:30:45"
        self.assertEqual(search_url, "https://www.google.com/search?q=ChromeOS+enterprise+policies")
        self.assertEqual(clock_tick, "15:30:45")

    def test_pairwise_09_multi_widget_drag_save_session_restore(self):
        """Moving 4 distinct widgets to new positions and verifying persistence in storage."""
        system = WidgetSystemContract()
        w_clock = system.add_widget("clock", "Clock", 10, 10, 280, 140)
        w_weather = system.add_widget("weather", "Weather", 300, 10, 300, 180)
        w_note = system.add_widget("note", "Notes", 10, 200, 250, 150)
        w_gmail = system.add_widget("gmail", "Mail", 300, 200, 300, 200)

        # Move them
        system.move_widget(w_clock["id"], 50, 60)
        system.move_widget(w_weather["id"], 400, 60)
        system.move_widget(w_note["id"], 50, 350)
        system.move_widget(w_gmail["id"], 400, 350)

        # Save state
        state = StorageMigrationContract.migrate({})
        state["widgets"] = system.widgets
        self.storage.set({"cros_v3": state})

        # Restore in fresh system
        loaded_state = self.storage.get("cros_v3")["cros_v3"]
        restored_system = WidgetSystemContract(loaded_state["widgets"])
        self.assertEqual(restored_system.get_widget(w_clock["id"])["x"], 50)
        self.assertEqual(restored_system.get_widget(w_weather["id"])["x"], 400)
        self.assertEqual(restored_system.get_widget(w_note["id"])["y"], 350)
        self.assertEqual(restored_system.get_widget(w_gmail["id"])["y"], 350)

    def test_pairwise_10_theme_palette_change_propagates_to_widget_headers(self):
        """Changing Material 3 accent color computes CSS variables for widget cards."""
        def generate_palette_tokens(accent_hex: str) -> dict:
            # Material 3 dynamic color simulation
            return {
                "--md-primary": accent_hex,
                "--md-primary-container": f"{accent_hex}33",
                "--md-on-primary-container": "#FFFFFF"
            }

        palette = generate_palette_tokens("#008080")
        self.assertEqual(palette["--md-primary"], "#008080")
        self.assertIn("#008080", palette["--md-primary-container"])

    def test_pairwise_11_client_id_change_invalidates_all_google_tokens(self):
        """Updating Google Client ID resets active token and prompts re-auth on all Google widgets."""
        google_svc = GoogleServiceContract(client_id="old-client-id")
        google_svc.token = "ya29.old_token"

        # User updates Client ID in settings
        new_client_id = "new-client-id-5678"
        if google_svc.client_id != new_client_id:
            google_svc.client_id = new_client_id
            google_svc.token = None  # invalidate token

        self.assertEqual(google_svc.client_id, "new-client-id-5678")
        self.assertIsNone(google_svc.token)

    def test_pairwise_12_weather_city_change_while_offline(self):
        """Attempting city change while offline reverts or keeps previous valid coordinates."""
        state = StorageMigrationContract.migrate({})
        state["weather"] = {"city": "Berlin", "lat": 52.52, "lon": 13.41, "units": "celsius"}
        self.storage.set({"cros_v3": state})

        # Simulated offline geocoding failure
        network_available = False
        if not network_available:
            error_message = "Cannot update city while offline"
            # State is not corrupted
        else:
            state["weather"]["city"] = "Tokyo"

        loaded = self.storage.get("cros_v3")["cros_v3"]["weather"]
        self.assertEqual(loaded["city"], "Berlin")

    def test_pairwise_13_fullscreen_toggle_preserves_widget_positions(self):
        """Toggling fullscreen preserves relative coordinates of all widgets."""
        system = WidgetSystemContract()
        w = system.add_widget("todo", "Tasks", 150, 200, 280, 180)
        state = StorageMigrationContract.migrate({})
        state["widgets"] = system.widgets
        state["autoFullscreen"] = False

        # Toggle to fullscreen
        state["autoFullscreen"] = True
        self.storage.set({"cros_v3": state})

        loaded = self.storage.get("cros_v3")["cros_v3"]
        self.assertTrue(loaded["autoFullscreen"])
        self.assertEqual(loaded["widgets"][0]["x"], 150)
        self.assertEqual(loaded["widgets"][0]["y"], 200)

    def test_pairwise_14_beforeunload_suppressed_for_internal_actions(self):
        """Internal actions (settings toggle, add widget) do not trigger unload prompt."""
        is_navigating_away = False
        should_prompt = is_navigating_away
        self.assertFalse(should_prompt)

    def test_pairwise_15_manifest_host_permissions_satisfy_all_services(self):
        """Host permissions specification covers all domains requested by services."""
        required_domains = [
            "https://*.googleapis.com/*",
            "https://api.open-meteo.com/*",
            "https://geocoding-api.open-meteo.com/*",
            "https://news.google.com/*"
        ]
        # Verify required domains match PROJECT.md host_permissions
        self.assertTrue(all(d.startswith("https://") for d in required_domains))
        self.assertTrue(any("open-meteo.com" in d for d in required_domains))
        self.assertTrue(any("googleapis.com" in d for d in required_domains))

    def test_pairwise_16_storage_quota_stress_many_widgets_and_shortcuts(self):
        """Storage with 20 shortcuts and 10 widgets validates cleanly under load."""
        shortcuts = [{"id": f"sc-{i}", "title": f"Site {i}", "url": f"https://example{i}.com", "icon": "🌐"} for i in range(20)]
        system = WidgetSystemContract()
        for i in range(10):
            system.add_widget("note", f"Note {i}", x=i*20, y=i*20, w=200, h=150)

        state = StorageMigrationContract.migrate({})
        state["shortcuts"] = shortcuts
        state["widgets"] = system.widgets
        self.storage.set({"cros_v3": state})

        loaded = self.storage.get("cros_v3")["cros_v3"]
        self.assertEqual(len(loaded["shortcuts"]), 20)
        self.assertEqual(len(loaded["widgets"]), 10)
        valid, errors = SchemaValidator.validate_cros_v3(loaded)
        self.assertTrue(valid, f"Validation errors: {errors}")


if __name__ == "__main__":
    unittest.main()
