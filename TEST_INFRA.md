# E2E Test Infra: CrOS New Tab (v0.3.0)

## Test Philosophy
- Opaque-box, requirement-driven: Derived directly from `ORIGINAL_REQUEST.md` and user-facing requirements, NOT implementation internals.
- Methodology: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial Testing + Real-World Workload Testing.
- Zero dependencies on internal non-exported functions; tests exercise extension behavior via standard web APIs, manifest validation, DOM interaction, chrome API mocks, and headless Chromium.

## Feature Inventory
| # | Feature | Source | Tier 1 | Tier 2 | Tier 3 |
|---|---------|--------|:------:|:------:|:------:|
| 1 | Git branch safety & sync-github.sh guard | ORIGINAL_REQUEST §R5 | 5 | 5 | ✓ |
| 2 | MV3 manifest & permission validation | ORIGINAL_REQUEST §AC | 5 | 5 | ✓ |
| 3 | Anti-close protection (beforeunload & service worker) | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| 4 | Kiosk & ChromeOS policy documentation | ORIGINAL_REQUEST §R4 | 5 | 5 | ✓ |
| 5 | Storage migration (cros_v2 -> cros_v3) | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 6 | Modular widget system (add, move, resize, enable/disable) | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 7 | Clock & Date widget | ORIGINAL_REQUEST §R1 | 5 | 5 | ✓ |
| 8 | Preservation of v0.2 features (shortcuts, wallpapers, search) | ORIGINAL_REQUEST §AC | 5 | 5 | ✓ |
| 9 | Open-Meteo weather service & error handling | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 10 | Weather widget UI & geocoding city search | ORIGINAL_REQUEST §R3 | 5 | 5 | ✓ |
| 11 | Google Identity OAuth & Client ID setup guide | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 12 | Google Calendar API widget | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 13 | Gmail unread messages widget | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 14 | Google Drive recent files widget | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |
| 15 | Google News RSS feed & ecosystem shortcuts | ORIGINAL_REQUEST §R2 | 5 | 5 | ✓ |

## Test Architecture
- Test Runner: Python 3 / Bash / Node test runner executing offline and headless tests.
  - `python3 -m unittest discover -s tests -p "test_*.py"` or `./tests/run-all-tests.sh`
- Test Categories:
  - `tests/tier1_features/`: isolated feature verification.
  - `tests/tier2_boundaries/`: edge cases, empty storage, network errors, invalid inputs.
  - `tests/tier3_pairwise/`: cross-feature interactions (e.g. Weather + Calendar + Custom Theme + Offline).
  - `tests/tier4_real_world/`: end-user workflows (complete desktop setup, multi-widget lifecycle, ChromeOS startup).
- Acceptance semantics: Exit code 0, all assertions pass, clean logs without unhandled exceptions.

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | First Launch & Setup | V2 Migration, Default Widgets, Clock, Theme Init | Medium |
| 2 | Full Google Workplace Hub | OAuth Setup, Calendar Events, Gmail Count, Drive Files | High |
| 3 | Weather Monitoring & City Change | City Search, Coordinates, Forecast Rendering, Cache | Medium |
| 4 | Accidental Close Resistance | Beforeunload warning, Service worker tab reopen | High |
| 5 | Custom Desktop Layout & Reboot | Custom widgets, coordinates, resize, reload persistence | High |

## Coverage Thresholds
- Tier 1: ≥5 test cases per feature (15 features × 5 = 75 cases)
- Tier 2: ≥5 test cases per feature (15 features × 5 = 75 cases)
- Tier 3: Pairwise coverage of major feature interactions (≥15 cases)
- Tier 4: Real-world end-to-end workflows (≥5 comprehensive scenario tests)
- **Total Suite**: ≥170 test cases
