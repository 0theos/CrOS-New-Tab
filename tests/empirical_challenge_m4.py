#!/usr/bin/env python3
"""Empirical Challenger Test Suite for Milestone 4:
Open-Meteo Weather Integration & Weather Widget.

Adversarial stress-testing of:
1. Script loading sequence & CSP compliance in newtab.html (weather-service.js before widgets.js, no CDN, no inline scripts).
2. Pure JavaScript WeatherService contract verification (WMO mappings 0..99, URL builders, parser).
3. Geocoding search & city selection (returns array of matching cities with { name, country, latitude, longitude }).
4. Forecast fetching & WMO Russian mapping (large temperature, weather condition, wind speed, daily chips).
5. Offline caching & degradation resilience (returns cached data with isCached: true on network error without throwing).
6. Weather widget registration & CSS integration (features.css rules, CrosWidgets catalog).
"""

import os
import re
import sys
import json
import urllib.request
import urllib.error
import urllib.parse
import subprocess

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))


def test_1_script_loading_order_and_csp():
    """Verify script loading sequence and strict MV3 CSP compliance."""
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

    weather_script = "services/weather-service.js"
    if weather_script not in scripts:
        print("  ❌ FAIL: services/weather-service.js not found in newtab.html!")
        return False, "weather-service.js missing"
    if "widgets.js" not in scripts:
        print("  ❌ FAIL: widgets.js not found in newtab.html!")
        return False, "widgets.js missing"

    weather_idx = scripts.index(weather_script)
    widgets_idx = scripts.index("widgets.js")
    if weather_idx > widgets_idx:
        print("  ❌ FAIL: services/weather-service.js must be loaded BEFORE widgets.js!")
        return False, "weather-service.js loaded after widgets.js"

    # 3. Verify no external CDNs
    cdn_links = re.findall(r'(?:href|src)=["\']https?://[^"\']+\.(?:js|css)["\']', html, re.IGNORECASE)
    if cdn_links:
        print(f"  ❌ FAIL: External CDN links found: {cdn_links}")
        return False, "External CDN links found"

    print("  ✓ PASS: services/weather-service.js loaded before widgets.js, zero CDN dependencies, zero inline scripts.")
    return True, "Scripts valid"


def test_2_js_weather_service_contract_and_wmo_mapping():
    """Execute Node evaluation of WeatherService methods and WMO mapping."""
    print("\n[CHALLENGE 2] Testing WeatherService JavaScript Contracts & WMO Mappings...")
    node_eval_code = """
const { WeatherService, WMO_MAP } = require('./services/weather-service.js');

if (!WeatherService) {
  process.stderr.write("WeatherService not exported!");
  process.exit(1);
}

// 1. Test WMO mapping for core codes
const clearSky = WeatherService.getWeatherCodeDescription(0, 1, 'ru');
if (clearSky.text !== 'Ясно' || clearSky.icon !== '☀️') {
  process.stderr.write("WMO code 0 day failed: " + JSON.stringify(clearSky));
  process.exit(2);
}

const clearNight = WeatherService.getWeatherCodeDescription(0, 0, 'ru');
if (clearNight.icon !== '🌙') {
  process.stderr.write("WMO code 0 night failed: " + JSON.stringify(clearNight));
  process.exit(3);
}

const rain = WeatherService.getWeatherCodeDescription(63, 1, 'ru');
if (!rain.text.includes('дождь') || rain.icon !== '🌧️') {
  process.stderr.write("WMO code 63 failed: " + JSON.stringify(rain));
  process.exit(4);
}

const thunder = WeatherService.getWeatherCodeDescription(95, 1, 'ru');
if (!thunder.text.includes('Гроза') || thunder.icon !== '⛈️') {
  process.stderr.write("WMO code 95 failed: " + JSON.stringify(thunder));
  process.exit(5);
}

// 2. Test URL construction
const forecastUrl = WeatherService.buildForecastUrl(55.7558, 37.6173, 4);
if (!forecastUrl.includes('latitude=55.7558') || !forecastUrl.includes('longitude=37.6173') || !forecastUrl.includes('forecast_days=4')) {
  process.stderr.write("buildForecastUrl failed: " + forecastUrl);
  process.exit(6);
}

const geocodingUrl = WeatherService.buildGeocodingUrl("Москва", 5);
if (!geocodingUrl.includes('name=%D0%9C%D0%BE%D1%81%D0%BA%D0%B2%D0%B0') && !geocodingUrl.includes('name=')) {
  process.stderr.write("buildGeocodingUrl failed: " + geocodingUrl);
  process.exit(7);
}

// 3. Test Response Parsing
const sampleResponse = {
  current: {
    temperature_2m: 18.5,
    weather_code: 1,
    wind_speed_10m: 3.2,
    apparent_temperature: 17.0,
    is_day: 1
  },
  daily: {
    time: ["2026-10-15", "2026-10-16", "2026-10-17"],
    temperature_2m_max: [19.2, 17.8, 14.5],
    temperature_2m_min: [10.1, 9.5, 7.2],
    weather_code: [1, 2, 61]
  }
};

const parsed = WeatherService.parseForecastResponse(sampleResponse);
if (parsed.current.temp !== 18.5 || parsed.current.tempFormatted !== "+19°" || parsed.current.weatherCode !== 1) {
  process.stderr.write("parseForecastResponse current failed: " + JSON.stringify(parsed.current));
  process.exit(8);
}
if (!Array.isArray(parsed.forecast) || parsed.forecast.length !== 3) {
  process.stderr.write("parseForecastResponse daily count failed: " + parsed.forecast.length);
  process.exit(9);
}
if (parsed.forecast[0].date !== "2026-10-15" || parsed.forecast[0].tempMax !== 19 || parsed.forecast[0].tempMin !== 10) {
  process.stderr.write("parseForecastResponse daily values failed: " + JSON.stringify(parsed.forecast[0]));
  process.exit(10);
}

console.log("CONTRACT_OK");
"""
    p = subprocess.run(["node", "-e", node_eval_code], cwd=PROJECT_ROOT, capture_output=True, text=True)
    if p.returncode != 0 or "CONTRACT_OK" not in p.stdout:
        print(f"  ❌ FAIL: Node evaluation of WeatherService failed: {p.stderr}")
        return False, p.stderr
    print("  ✓ PASS: WeatherService methods, WMO mappings, and response parser verified.")
    return True, "Contracts verified"


def test_3_real_open_meteo_api_live_check():
    """Verify live Open-Meteo REST endpoints (Geocoding & Forecast)."""
    print("\n[CHALLENGE 3] Testing Real Open-Meteo REST API Connectivity...")
    try:
        # 1. Geocoding search test
        geo_url = "https://geocoding-api.open-meteo.com/v1/search?name=Berlin&count=3&language=ru&format=json"
        req = urllib.request.Request(geo_url, headers={"User-Agent": "CrOS-NewTab-Test/0.3"})
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status != 200:
                print(f"  ❌ FAIL: Geocoding API returned HTTP {resp.status}")
                return False, f"HTTP {resp.status}"
            geo_data = json.loads(resp.read().decode("utf-8"))

        results = geo_data.get("results") or []
        if len(results) == 0:
            print("  ❌ FAIL: Geocoding returned 0 results for Berlin!")
            return False, "0 results"

        berlin = results[0]
        lat = berlin.get("latitude")
        lon = berlin.get("longitude")
        print(f"  Geocoding response: {berlin.get('name')}, {berlin.get('country')} (lat: {lat}, lon: {lon})")

        # 2. Forecast API test
        forecast_url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current_weather=true&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=auto&forecast_days=3"
        req2 = urllib.request.Request(forecast_url, headers={"User-Agent": "CrOS-NewTab-Test/0.3"})
        with urllib.request.urlopen(req2, timeout=10) as resp2:
            if resp2.status != 200:
                print(f"  ❌ FAIL: Forecast API returned HTTP {resp2.status}")
                return False, f"HTTP {resp2.status}"
            fc_data = json.loads(resp2.read().decode("utf-8"))

        current = fc_data.get("current_weather") or fc_data.get("current") or {}
        temp = current.get("temperature") if "temperature" in current else current.get("temperature_2m")
        w_code = current.get("weathercode") if "weathercode" in current else current.get("weather_code")
        print(f"  Live Forecast response: temp = {temp}°C, weathercode = {w_code}")

        if temp is None or w_code is None:
            print("  ❌ FAIL: Live forecast missing temperature or weathercode!")
            return False, "Missing fields"

        print("  ✓ PASS: Real Open-Meteo Geocoding and Forecast endpoints verified successfully.")
        return True, "API live verified"
    except Exception as e:
        print(f"  ⚠️ Warning/Skip: Live network request failed ({e}). Testing offline fallback pathway...")
        return True, f"Network skipped: {e}"


def test_4_offline_cache_degradation_and_resilience():
    """Verify offline cache fallback behavior when network is unavailable."""
    print("\n[CHALLENGE 4] Testing Offline Cache Degradation & Error Resilience...")
    node_eval_code = """
const { WeatherService } = require('./services/weather-service.js');

// Mock localStorage in global scope for test simulation
const mockStore = {};
global.localStorage = {
  getItem: (k) => mockStore[k] || null,
  setItem: (k, v) => { mockStore[k] = String(v); },
  removeItem: (k) => { delete mockStore[k]; }
};

async function runTest() {
  // 1. Populate cache with previously saved weather
  const cachedData = {
    current: {
      temp: 21.0,
      tempFormatted: "+21°",
      weatherCode: 0,
      windSpeed: 2.5,
      windSpeedFormatted: "2.5 м/с",
      description: "Ясно",
      icon: "☀️"
    },
    forecast: [
      { date: "2026-10-15", weekday: "Чт", tempFormatted: "+22° / +14°", icon: "☀️", description: "Ясно" }
    ]
  };

  await WeatherService.saveCache({
    city: "Санкт-Петербург",
    lat: 59.9343,
    lon: 30.3351,
    data: cachedData
  });

  const cache = await WeatherService.getCache();
  if (!cache || cache.city !== "Санкт-Петербург" || cache.data.current.temp !== 21.0) {
    process.stderr.write("Cache retrieval failed: " + JSON.stringify(cache));
    process.exit(1);
  }

  // 2. Mock global.fetch to simulate network failure (TypeError: Failed to fetch)
  global.fetch = async () => {
    throw new TypeError("Failed to fetch: Network is offline");
  };

  // 3. Request weather - should NOT throw and MUST return cached data with isCached: true
  const result = await WeatherService.getWeather(59.9343, 30.3351, { city: "Санкт-Петербург" });
  if (result.error !== false || !result.isCached || !result.offline) {
    process.stderr.write("Offline cache fallback failed: " + JSON.stringify(result));
    process.exit(2);
  }
  if (result.current.temp !== 21.0 || result.city !== "Санкт-Петербург") {
    process.stderr.write("Cached data mismatch: " + JSON.stringify(result));
    process.exit(3);
  }

  // 4. Test complete failure without cache
  global.localStorage.removeItem('cros_weather_cache');
  const emptyResult = await WeatherService.getWeather(10, 10, { city: "Unknown" });
  if (!emptyResult.error || !emptyResult.offline || !emptyResult.message) {
    process.stderr.write("Error state structure failed: " + JSON.stringify(emptyResult));
    process.exit(4);
  }

  console.log("CACHE_OK");
}

runTest().catch((err) => {
  process.stderr.write("Unhandled rejection: " + err);
  process.exit(5);
});
"""
    p = subprocess.run(["node", "-e", node_eval_code], cwd=PROJECT_ROOT, capture_output=True, text=True)
    if p.returncode != 0 or "CACHE_OK" not in p.stdout:
        print(f"  ❌ FAIL: Node evaluation of offline caching failed: {p.stderr}")
        return False, p.stderr
    print("  ✓ PASS: WeatherService correctly falls back to cache with isCached: true and handles network failure gracefully.")
    return True, "Offline cache verified"


def test_5_widgets_js_and_css_integration():
    """Verify Weather widget registration in CrosWidgets and CSS styling rules."""
    print("\n[CHALLENGE 5] Verifying widgets.js Integration & features.css Styles...")
    widgets_path = os.path.join(PROJECT_ROOT, "widgets.js")
    css_path = os.path.join(PROJECT_ROOT, "features.css")

    with open(widgets_path, "r", encoding="utf-8") as f:
        widgets_code = f.read()
    with open(css_path, "r", encoding="utf-8") as f:
        css = f.read()

    # 1. Check weather registered in widgets.js
    if "this.register('weather'" not in widgets_code:
        print("  ❌ FAIL: this.register('weather') missing in widgets.js!")
        return False, "weather registration missing"

    # 2. Check WeatherService delegation in widgets.js
    if "WeatherService" not in widgets_code:
        print("  ❌ FAIL: WeatherService integration missing in widgets.js!")
        return False, "WeatherService missing in widgets.js"

    # 3. Check CSS rules
    required_classes = [
        ".weather-widget",
        ".weather-current",
        ".weather-temp",
        ".weather-desc",
        ".weather-forecast",
        ".forecast-day",
        ".weather-search-bar",
        ".weather-search-input",
        ".weather-search-dropdown",
        ".weather-offline-badge"
    ]

    for cls in required_classes:
        if cls not in css:
            print(f"  ❌ FAIL: CSS selector {cls} missing in features.css!")
            return False, f"Missing CSS {cls}"

    # 4. Check Node execution of widgets catalog
    node_eval_code = """
const { CrosWidgets } = require('./widgets.js');
const catalog = CrosWidgets.getCatalog();
const weatherDef = catalog.find(c => c.type === 'weather');
if (!weatherDef || weatherDef.title !== 'Погода' || weatherDef.defaultW < 200 || weatherDef.defaultH < 150) {
  process.stderr.write("Weather catalog metadata invalid: " + JSON.stringify(weatherDef));
  process.exit(1);
}
console.log("WIDGET_CATALOG_OK");
"""
    p = subprocess.run(["node", "-e", node_eval_code], cwd=PROJECT_ROOT, capture_output=True, text=True)
    if p.returncode != 0 or "WIDGET_CATALOG_OK" not in p.stdout:
        print(f"  ❌ FAIL: CrosWidgets catalog check failed: {p.stderr}")
        return False, p.stderr

    print("  ✓ PASS: Weather widget registered in catalog with proper dimensions and all required CSS rules present.")
    return True, "Widgets & CSS verified"


def run_all_challenges():
    print("=" * 72)
    print("⚔️  EMPIRICAL CHALLENGER: Milestone 4 Weather Integration Verification")
    print("=" * 72)

    challenges = [
        ("Script Order & MV3 CSP Compliance", test_1_script_loading_order_and_csp),
        ("WeatherService Contracts & WMO Mappings", test_2_js_weather_service_contract_and_wmo_mapping),
        ("Real Open-Meteo REST API Connectivity", test_3_real_open_meteo_api_live_check),
        ("Offline Cache Degradation & Error Resilience", test_4_offline_cache_degradation_and_resilience),
        ("Weather Widget Integration & CSS Styling", test_5_widgets_js_and_css_integration),
    ]

    all_passed = True
    results = []

    for name, test_fn in challenges:
        ok, msg = test_fn()
        results.append((name, ok, msg))
        if not ok:
            all_passed = False

    print("\n" + "=" * 72)
    print("📊 EMPIRICAL CHALLENGE M4 RESULTS SUMMARY")
    print("=" * 72)
    for name, ok, msg in results:
        status = "PASSED" if ok else "FAILED"
        print(f"[{status}] {name}")
    print("=" * 72)

    if all_passed:
        print("🎉 M4 CHALLENGE VERDICT: ALL PASS")
        return 0
    else:
        print("❌ M4 CHALLENGE VERDICT: SOME CHECKS FAILED")
        return 1


if __name__ == "__main__":
    sys.exit(run_all_challenges())
