"""Helper utilities, mocks, schema definitions, and contract engines for CrOS New Tab E2E Test Suite.
"""

import json
import re
import os
import urllib.parse
from typing import Dict, Any, List, Optional, Tuple


# ==============================================================================
# 1. Chrome Extension API Mocks (chrome.storage, chrome.identity, chrome.tabs)
# ==============================================================================

class MockChromeStorage:
    """In-memory mock for chrome.storage.local adhering to Chrome Extension MV3 API."""

    def __init__(self, initial_data: Optional[Dict[str, Any]] = None):
        self._data: Dict[str, Any] = dict(initial_data) if initial_data else {}
        self.access_log: List[Tuple[str, Any]] = []

    def get(self, keys: Any) -> Dict[str, Any]:
        self.access_log.append(('get', keys))
        if keys is None:
            return dict(self._data)
        if isinstance(keys, str):
            return {keys: self._data.get(keys)} if keys in self._data else {}
        if isinstance(keys, (list, tuple)):
            return {k: self._data[k] for k in keys if k in self._data}
        if isinstance(keys, dict):
            res = {}
            for k, default_val in keys.items():
                res[k] = self._data.get(k, default_val)
            return res
        return {}

    def set(self, items: Dict[str, Any]) -> None:
        self.access_log.append(('set', items))
        self._data.update(items)

    def remove(self, keys: Any) -> None:
        self.access_log.append(('remove', keys))
        if isinstance(keys, str):
            self._data.pop(keys, None)
        elif isinstance(keys, (list, tuple)):
            for k in keys:
                self._data.pop(k, None)

    def clear(self) -> None:
        self.access_log.append(('clear', None))
        self._data.clear()

    def has_key(self, key: str) -> bool:
        return key in self._data


class MockChromeIdentity:
    """Mock for chrome.identity implementing launchWebAuthFlow and getRedirectURL."""

    def __init__(self, extension_id: str = "mock-cros-newtab-id"):
        self.extension_id = extension_id
        self.auth_token: Optional[str] = None
        self.token_expiry: Optional[int] = None
        self.should_fail_interactive: bool = False
        self.fail_reason: str = "The user did not approve access."

    def get_redirect_url(self, path: str = "") -> str:
        base = f"https://{self.extension_id}.chromiumapp.org/"
        if path:
            return urllib.parse.urljoin(base, path)
        return base

    def launch_web_auth_flow(self, details: Dict[str, Any]) -> Dict[str, Any]:
        """Simulates OAuth flow."""
        url = details.get("url", "")
        interactive = details.get("interactive", False)

        if self.should_fail_interactive:
            return {"error": self.fail_reason, "redirect_url": None}

        parsed = urllib.parse.urlparse(url)
        params = urllib.parse.parse_qs(parsed.query)

        client_id = params.get("client_id", [""])[0]
        if not client_id or not client_id.strip():
            return {"error": "Missing client_id in auth URL", "redirect_url": None}

        redirect_uri = params.get("redirect_uri", [""])[0]
        token = self.auth_token or "ya29.mock_google_oauth_token_12345"
        expires_in = self.token_expiry or 3600

        result_url = f"{redirect_uri}#access_token={token}&token_type=Bearer&expires_in={expires_in}&scope=https://www.googleapis.com/auth/calendar.readonly"
        return {"error": None, "redirect_url": result_url}


class MockChromeTabsAndWindows:
    """Mock for chrome.tabs, chrome.windows, and background service worker lifecycle."""

    def __init__(self):
        self.windows: List[Dict[str, Any]] = [
            {"id": 1, "focused": True, "tabs": [{"id": 101, "url": "chrome://newtab", "active": True}]}
        ]
        self.next_window_id = 2
        self.next_tab_id = 102
        self.tab_remove_listeners = []
        self.window_remove_listeners = []
        self.created_windows_log = []

    def on_tab_removed_add_listener(self, callback):
        self.tab_remove_listeners.append(callback)

    def on_window_removed_add_listener(self, callback):
        self.window_remove_listeners.append(callback)

    def close_tab(self, tab_id: int):
        found_tab = None
        target_win = None
        for win in self.windows:
            for t in win["tabs"]:
                if t["id"] == tab_id:
                    found_tab = t
                    target_win = win
                    break
            if found_tab:
                break

        if not found_tab:
            return False

        target_win["tabs"].remove(found_tab)
        is_win_closing = len(target_win["tabs"]) == 0
        if is_win_closing:
            self.windows.remove(target_win)

        for listener in self.tab_remove_listeners:
            listener(tab_id, {"windowId": target_win["id"], "isWindowClosing": is_win_closing})

        if is_win_closing:
            for wlistener in self.window_remove_listeners:
                wlistener(target_win["id"])

        return True

    def create_window(self, create_data: Dict[str, Any]) -> Dict[str, Any]:
        win_id = self.next_window_id
        self.next_window_id += 1
        new_tab_id = self.next_tab_id
        self.next_tab_id += 1
        url = create_data.get("url", "chrome://newtab")
        new_win = {
            "id": win_id,
            "focused": create_data.get("focused", True),
            "tabs": [{"id": new_tab_id, "url": url, "active": True}]
        }
        self.windows.append(new_win)
        self.created_windows_log.append(new_win)
        return new_win

    def get_all_tabs(self) -> List[Dict[str, Any]]:
        tabs = []
        for win in self.windows:
            tabs.extend(win["tabs"])
        return tabs


# ==============================================================================
# 2. Schema Validators (cros_v3, manifest.json, APIs)
# ==============================================================================

class SchemaValidator:
    """Validates data structures against PROJECT.md § Interface Contracts."""

    SUPPORTED_WIDGET_TYPES = {
        "clock", "weather", "calendar", "gmail", "drive", "news", "note", "todo", "countdown", "embed"
    }

    @classmethod
    def validate_cros_v3(cls, data: Any) -> Tuple[bool, List[str]]:
        errors = []
        if not isinstance(data, dict):
            return False, ["Root state must be a dictionary"]

        if data.get("version") != 3:
            errors.append(f"Expected version: 3, got: {data.get('version')}")

        # Shortcuts
        shortcuts = data.get("shortcuts")
        if not isinstance(shortcuts, list):
            errors.append("shortcuts must be a list")
        else:
            for i, sc in enumerate(shortcuts):
                if not isinstance(sc, dict):
                    errors.append(f"shortcut[{i}] must be an object")
                    continue
                if not sc.get("id"):
                    errors.append(f"shortcut[{i}] missing id")
                if not sc.get("title") and sc.get("title") != "":
                    errors.append(f"shortcut[{i}] missing title")
                if not sc.get("url"):
                    errors.append(f"shortcut[{i}] missing url")

        # Widgets
        widgets = data.get("widgets")
        if not isinstance(widgets, list):
            errors.append("widgets must be a list")
        else:
            for i, w in enumerate(widgets):
                if not isinstance(w, dict):
                    errors.append(f"widget[{i}] must be an object")
                    continue
                if not w.get("id"):
                    errors.append(f"widget[{i}] missing id")
                w_type = w.get("type")
                if w_type not in cls.SUPPORTED_WIDGET_TYPES:
                    errors.append(f"widget[{i}] invalid type: '{w_type}'")
                for coord in ("x", "y", "w", "h"):
                    if not isinstance(w.get(coord), (int, float)):
                        errors.append(f"widget[{i}] invalid coordinate {coord}")
                if "enabled" in w and not isinstance(w["enabled"], bool):
                    errors.append(f"widget[{i}] enabled must be a boolean")

        # Wallpaper
        wp = data.get("wallpaper")
        if not isinstance(wp, dict) or "type" not in wp:
            errors.append("wallpaper must be an object with 'type'")

        # Dim
        dim = data.get("dim")
        if not isinstance(dim, (int, float)) or not (0.0 <= dim <= 1.0):
            errors.append("dim must be a float between 0.0 and 1.0")

        # Google
        google = data.get("google")
        if not isinstance(google, dict):
            errors.append("google settings must be an object")
        else:
            if "clientId" not in google or not isinstance(google["clientId"], str):
                errors.append("google.clientId must be a string")
            if "mockMode" not in google or not isinstance(google["mockMode"], bool):
                errors.append("google.mockMode must be a boolean")

        # Weather
        weather = data.get("weather")
        if not isinstance(weather, dict):
            errors.append("weather settings must be an object")
        else:
            if "city" not in weather or not isinstance(weather["city"], str):
                errors.append("weather.city must be a string")
            if weather.get("units") not in ("celsius", "fahrenheit"):
                errors.append("weather.units must be 'celsius' or 'fahrenheit'")

        return len(errors) == 0, errors

    @classmethod
    def validate_manifest_mv3(cls, manifest: Dict[str, Any]) -> Tuple[bool, List[str]]:
        errors = []
        if manifest.get("manifest_version") != 3:
            errors.append("manifest_version must be 3")
        if not manifest.get("name"):
            errors.append("name is required")
        if not manifest.get("version"):
            errors.append("version is required")
        version_parts = str(manifest.get("version", "")).split(".")
        if len(version_parts) < 2 or not all(p.isdigit() for p in version_parts):
            errors.append("version must be valid semver/dot notation")

        overrides = manifest.get("chrome_url_overrides", {})
        if overrides.get("newtab") != "newtab.html":
            errors.append("chrome_url_overrides.newtab must be newtab.html")

        perms = manifest.get("permissions", [])
        if not isinstance(perms, list):
            errors.append("permissions must be a list")

        return len(errors) == 0, errors


# ==============================================================================
# 3. Contract Implementations & Behavioral Engines
# ==============================================================================

class StorageMigrationContract:
    """Simulates cros_v2 -> cros_v3 storage migration per PROJECT.md §1."""

    @staticmethod
    def migrate(storage_data: Dict[str, Any]) -> Dict[str, Any]:
        existing_v3 = storage_data.get("cros_v3")
        if existing_v3 and isinstance(existing_v3, dict) and existing_v3.get("version") == 3:
            # Already migrated, return intact
            return existing_v3

        v2 = storage_data.get("cros_v2") or {}
        if not isinstance(v2, dict):
            v2 = {}

        # Default widgets if none present
        default_widgets = [
            {
                "id": "clock-1",
                "type": "clock",
                "title": "Clock",
                "x": 20, "y": 20, "w": 280, "h": 140,
                "enabled": True,
                "config": {"format24h": True, "showSeconds": False}
            },
            {
                "id": "weather-1",
                "type": "weather",
                "title": "Weather",
                "x": 320, "y": 20, "w": 300, "h": 180,
                "enabled": True,
                "config": {}
            }
        ]

        migrated_widgets = []
        v2_widgets = v2.get("widgets", [])
        if isinstance(v2_widgets, list) and len(v2_widgets) > 0:
            for w in v2_widgets:
                if isinstance(w, dict):
                    w_copy = dict(w)
                    if "enabled" not in w_copy:
                        w_copy["enabled"] = True
                    migrated_widgets.append(w_copy)
        else:
            migrated_widgets = default_widgets

        # Preserve shortcuts
        shortcuts = v2.get("shortcuts")
        if not isinstance(shortcuts, list):
            shortcuts = [
                {"id": "sc-google", "title": "Google", "url": "https://www.google.com", "icon": "🌐"},
                {"id": "sc-youtube", "title": "YouTube", "url": "https://www.youtube.com", "icon": "▶️"}
            ]

        # Wallpaper & Dim
        wallpaper = v2.get("wallpaper")
        if not isinstance(wallpaper, dict) or "type" not in wallpaper:
            wallpaper = {"type": "default", "value": ""}
        dim = v2.get("dim", 0.0)
        try:
            dim = float(dim)
            dim = max(0.0, min(1.0, dim))
        except (ValueError, TypeError):
            dim = 0.0

        auto_fullscreen = bool(v2.get("autoFullscreen", False))

        v3_state = {
            "version": 3,
            "shortcuts": shortcuts,
            "widgets": migrated_widgets,
            "wallpaper": wallpaper,
            "dim": dim,
            "autoFullscreen": auto_fullscreen,
            "closeProtection": True,
            "google": {
                "clientId": "",
                "mockMode": False
            },
            "weather": {
                "city": "Moscow",
                "lat": 55.7558,
                "lon": 37.6173,
                "units": "celsius"
            }
        }
        return v3_state


class WidgetSystemContract:
    """Simulates widget manager (widgets.js) behaviors."""

    MIN_WIDTH = 120
    MIN_HEIGHT = 80
    MAX_WIDTH = 1920
    MAX_HEIGHT = 1080

    def __init__(self, initial_widgets: Optional[List[Dict[str, Any]]] = None):
        self.widgets: List[Dict[str, Any]] = [dict(w) for w in (initial_widgets or [])]

    def add_widget(self, widget_type: str, title: str, x: int = 100, y: int = 100, w: int = 280, h: int = 180, config: Optional[Dict] = None) -> Dict[str, Any]:
        if widget_type not in SchemaValidator.SUPPORTED_WIDGET_TYPES:
            raise ValueError(f"Unsupported widget type: {widget_type}")

        new_id = f"{widget_type}-{len(self.widgets) + 1}-{abs(hash(title + str(x)))}"
        new_widget = {
            "id": new_id,
            "type": widget_type,
            "title": title,
            "x": max(0, x),
            "y": max(0, y),
            "w": max(self.MIN_WIDTH, min(self.MAX_WIDTH, w)),
            "h": max(self.MIN_HEIGHT, min(self.MAX_HEIGHT, h)),
            "enabled": True,
            "config": config or {}
        }
        self.widgets.append(new_widget)
        return new_widget

    def move_widget(self, widget_id: str, x: int, y: int) -> bool:
        for w in self.widgets:
            if w["id"] == widget_id:
                w["x"] = max(0, x)
                w["y"] = max(0, y)
                return True
        return False

    def resize_widget(self, widget_id: str, w: int, h: int) -> bool:
        for item in self.widgets:
            if item["id"] == widget_id:
                item["w"] = max(self.MIN_WIDTH, min(self.MAX_WIDTH, w))
                item["h"] = max(self.MIN_HEIGHT, min(self.MAX_HEIGHT, h))
                return True
        return False

    def toggle_widget(self, widget_id: str, enabled: Optional[bool] = None) -> bool:
        for w in self.widgets:
            if w["id"] == widget_id:
                w["enabled"] = not w["enabled"] if enabled is None else bool(enabled)
                return True
        return False

    def remove_widget(self, widget_id: str) -> bool:
        initial_len = len(self.widgets)
        self.widgets = [w for w in self.widgets if w["id"] != widget_id]
        return len(self.widgets) < initial_len

    def get_widget(self, widget_id: str) -> Optional[Dict[str, Any]]:
        for w in self.widgets:
            if w["id"] == widget_id:
                return w
        return None


class WeatherServiceContract:
    """Reference implementation of WeatherService per PROJECT.md §3."""

    WMO_CODE_MAP = {
        0: {"text": "Clear sky", "icon": "☀️"},
        1: {"text": "Mainly clear", "icon": "🌤️"},
        2: {"text": "Partly cloudy", "icon": "⛅"},
        3: {"text": "Overcast", "icon": "☁️"},
        45: {"text": "Fog", "icon": "🌫️"},
        48: {"text": "Depositing rime fog", "icon": "🌫️"},
        51: {"text": "Light drizzle", "icon": "🌦️"},
        61: {"text": "Slight rain", "icon": "🌧️"},
        63: {"text": "Moderate rain", "icon": "🌧️"},
        65: {"text": "Heavy rain", "icon": "🌧️"},
        71: {"text": "Slight snow", "icon": "🌨️"},
        73: {"text": "Moderate snow", "icon": "🌨️"},
        75: {"text": "Heavy snow", "icon": "❄️"},
        95: {"text": "Thunderstorm", "icon": "⛈️"}
    }

    @classmethod
    def get_wmo_description(cls, code: int) -> Dict[str, str]:
        return cls.WMO_CODE_MAP.get(code, {"text": "Unknown weather", "icon": "🌡️"})

    @classmethod
    def build_forecast_url(cls, lat: float, lon: float, days: int = 3) -> str:
        base = "https://api.open-meteo.com/v1/forecast"
        params = {
            "latitude": str(lat),
            "longitude": str(lon),
            "current": "temperature_2m,weather_code,wind_speed_10m",
            "daily": "weather_code,temperature_2m_max,temperature_2m_min",
            "timezone": "auto",
            "forecast_days": str(days)
        }
        return f"{base}?{urllib.parse.urlencode(params)}"

    @classmethod
    def build_geocoding_url(cls, city: str, count: int = 5) -> str:
        base = "https://geocoding-api.open-meteo.com/v1/search"
        params = {"name": city, "count": str(count), "language": "ru", "format": "json"}
        return f"{base}?{urllib.parse.urlencode(params)}"

    @classmethod
    def parse_forecast_response(cls, data: Dict[str, Any]) -> Dict[str, Any]:
        current = data.get("current", {})
        daily = data.get("daily", {})
        code = current.get("weather_code", 0)
        wmo = cls.get_wmo_description(code)

        forecast_list = []
        times = daily.get("time", [])
        max_temps = daily.get("temperature_2m_max", [])
        min_temps = daily.get("temperature_2m_min", [])
        codes = daily.get("weather_code", [])

        for i in range(len(times)):
            f_code = codes[i] if i < len(codes) else 0
            forecast_list.append({
                "date": times[i],
                "tempMax": max_temps[i] if i < len(max_temps) else None,
                "tempMin": min_temps[i] if i < len(min_temps) else None,
                "weatherCode": f_code,
                "description": cls.get_wmo_description(f_code)["text"],
                "icon": cls.get_wmo_description(f_code)["icon"]
            })

        return {
            "current": {
                "temp": current.get("temperature_2m"),
                "weatherCode": code,
                "windSpeed": current.get("wind_speed_10m"),
                "description": wmo["text"],
                "icon": wmo["icon"]
            },
            "forecast": forecast_list
        }


class GoogleServiceContract:
    """Reference implementation of GoogleService per PROJECT.md §2."""

    REQUIRED_SCOPES = [
        "https://www.googleapis.com/auth/calendar.readonly",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/drive.readonly"
    ]

    def __init__(self, client_id: str = "", mock_mode: bool = False):
        self.client_id = client_id.strip() if client_id else ""
        self.mock_mode = mock_mode
        self.token: Optional[str] = None
        self.token_expiry: Optional[float] = None

    def build_auth_url(self, redirect_uri: str) -> str:
        base = "https://accounts.google.com/o/oauth2/v2/auth"
        params = {
            "client_id": self.client_id,
            "redirect_uri": redirect_uri,
            "response_type": "token",
            "scope": " ".join(self.REQUIRED_SCOPES)
        }
        return f"{base}?{urllib.parse.urlencode(params)}"

    def parse_redirect_hash(self, redirect_url: str) -> Dict[str, Any]:
        parsed = urllib.parse.urlparse(redirect_url)
        fragment = parsed.fragment
        params = urllib.parse.parse_qs(fragment)
        token = params.get("access_token", [None])[0]
        expires_in = params.get("expires_in", [3600])[0]
        try:
            expires_in = int(expires_in)
        except ValueError:
            expires_in = 3600
        return {"token": token, "expires_in": expires_in}

    def get_mock_calendar_events(self, max_results: int = 5) -> List[Dict[str, Any]]:
        return [
            {
                "id": "cal-evt-1",
                "summary": "Team Sync & Standup",
                "start": {"dateTime": "2026-10-15T10:00:00Z"},
                "htmlLink": "https://calendar.google.com/calendar/event?eid=1"
            },
            {
                "id": "cal-evt-2",
                "summary": "CrOS Architecture Review",
                "start": {"dateTime": "2026-10-15T14:30:00Z"},
                "htmlLink": "https://calendar.google.com/calendar/event?eid=2"
            },
            {
                "id": "cal-evt-3",
                "summary": "Release 0.3 Deployment Day",
                "start": {"date": "2026-10-16"},
                "htmlLink": "https://calendar.google.com/calendar/event?eid=3"
            }
        ][:max_results]

    def get_mock_gmail_unread(self) -> Dict[str, Any]:
        return {
            "unreadCount": 3,
            "messages": [
                {
                    "id": "msg-101",
                    "snippet": "Don't forget to push feature/CrOS_0.3 branch before EOD.",
                    "from": "Alex Developer <alex@example.com>",
                    "subject": "CrOS v0.3 Release Status"
                },
                {
                    "id": "msg-102",
                    "snippet": "Weekly digest from Google Cloud Platform updates.",
                    "from": "Google Cloud <noreply@google.com>",
                    "subject": "GCP Architecture Newsletter"
                },
                {
                    "id": "msg-103",
                    "snippet": "Security alert: New sign-in detected on ChromeOS device.",
                    "from": "Google Security <no-reply@accounts.google.com>",
                    "subject": "Security notice for your account"
                }
            ]
        }

    def get_mock_drive_files(self, max_results: int = 5) -> List[Dict[str, Any]]:
        return [
            {
                "id": "drive-doc-1",
                "name": "CrOS New Tab v0.3 Architecture Spec.gdoc",
                "mimeType": "application/vnd.google-apps.document",
                "webViewLink": "https://docs.google.com/document/d/mock1",
                "iconLink": "https://drive-thirdparty.googleusercontent.com/16/type/application/vnd.google-apps.document"
            },
            {
                "id": "drive-sheet-2",
                "name": "E2E Test Matrix & Verification Coverage.gsheet",
                "mimeType": "application/vnd.google-apps.spreadsheet",
                "webViewLink": "https://docs.google.com/spreadsheets/d/mock2",
                "iconLink": "https://drive-thirdparty.googleusercontent.com/16/type/application/vnd.google-apps.spreadsheet"
            },
            {
                "id": "drive-pdf-3",
                "name": "ChromeOS Enterprise Kiosk Deployment Guide.pdf",
                "mimeType": "application/pdf",
                "webViewLink": "https://drive.google.com/file/d/mock3/view",
                "iconLink": "https://drive-thirdparty.googleusercontent.com/16/type/application/pdf"
            }
        ][:max_results]


class GoogleNewsContract:
    """Reference implementation for Google News RSS parsing."""

    @classmethod
    def build_rss_url(cls, hl: str = "ru", gl: str = "RU", ceid: str = "RU:ru") -> str:
        return f"https://news.google.com/rss?hl={hl}&gl={gl}&ceid={ceid}"

    @classmethod
    def parse_rss_xml_text(cls, xml_text: str) -> List[Dict[str, str]]:
        """Parses RSS items extracting title, link, pubDate, and source using regex/XML simulation."""
        items = []
        item_blocks = re.findall(r'<item>(.*?)</item>', xml_text, re.DOTALL)
        for block in item_blocks:
            title_m = re.search(r'<title>(.*?)</title>', block, re.DOTALL)
            link_m = re.search(r'<link>(.*?)</link>', block, re.DOTALL)
            pub_m = re.search(r'<pubDate>(.*?)</pubDate>', block, re.DOTALL)
            source_m = re.search(r'<source.*?>(.*?)</source>', block, re.DOTALL)

            title = title_m.group(1).strip() if title_m else ""
            link = link_m.group(1).strip() if link_m else ""
            pub_date = pub_m.group(1).strip() if pub_m else ""
            source = source_m.group(1).strip() if source_m else ""

            # Clean CDATA if present
            title = re.sub(r'<!\[CDATA\[(.*?)\]\]>', r'\1', title)
            source = re.sub(r'<!\[CDATA\[(.*?)\]\]>', r'\1', source)

            items.append({
                "title": title,
                "link": link,
                "pubDate": pub_date,
                "source": source
            })
        return items


class GitBranchGuardContract:
    """Validates branch safety per ORIGINAL_REQUEST §R5 and PROJECT.md."""

    FORBIDDEN_BRANCHES = {"main", "master"}
    ALLOWED_BRANCH = "feature/CrOS_0.3"

    @classmethod
    def validate_branch(cls, branch: Optional[str]) -> Tuple[bool, str]:
        if not branch or not branch.strip():
            return False, "Branch name is empty or undefined"
        b = branch.strip()
        if b in cls.FORBIDDEN_BRANCHES:
            return False, f"Direct pushes to '{b}' are strictly forbidden by R5"
        if b != cls.ALLOWED_BRANCH:
            return False, f"Target branch must be '{cls.ALLOWED_BRANCH}', got '{b}'"
        return True, "Branch check passed"
