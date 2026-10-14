#!/usr/bin/env python3
"""CrOS New Tab E2E Test Suite Runner.
Executes all 4 Tiers of opaque-box E2E tests, reports results per tier,
and exits with code 0 on all pass, non-zero on any failure.
"""

import sys
import os
import unittest
import time

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


def run_tier(suite_name, test_module_name):
    print(f"\n▶ Running {suite_name} ({test_module_name})...")
    loader = unittest.TestLoader()
    suite = loader.loadTestsFromName(test_module_name)
    runner = unittest.TextTestRunner(verbosity=1)
    start_time = time.time()
    result = runner.run(suite)
    elapsed = time.time() - start_time
    passed = result.testsRun - len(result.failures) - len(result.errors)
    return {
        "suite": suite_name,
        "module": test_module_name,
        "total": result.testsRun,
        "passed": passed,
        "failures": len(result.failures),
        "errors": len(result.errors),
        "elapsed": elapsed,
        "was_successful": result.wasSuccessful()
    }


def main():
    print("=" * 72)
    print("🚀 CrOS New Tab v0.3 — Opaque-Box E2E Test Runner")
    print("=" * 72)

    tier_configs = [
        ("Tier 1: Feature Coverage", "tests.test_tier1_features"),
        ("Tier 2: Boundary & Corner Cases", "tests.test_tier2_boundaries"),
        ("Tier 3: Pairwise Combinations", "tests.test_tier3_pairwise"),
        ("Tier 4: Real-World Scenarios", "tests.test_tier4_real_world"),
    ]

    tier_results = []
    total_start = time.time()

    for name, module in tier_configs:
        res = run_tier(name, module)
        tier_results.append(res)

    total_time = time.time() - total_start

    print("\n" + "=" * 72)
    print("📊 Test Execution Summary")
    print("=" * 72)
    print(f"{'Tier / Category':<35} | {'Total':<6} | {'Pass':<6} | {'Fail':<6} | {'Status':<8}")
    print("-" * 72)

    total_run = 0
    total_passed = 0
    total_failed = 0
    all_success = True

    for r in tier_results:
        total_run += r["total"]
        total_passed += r["passed"]
        total_failed += (r["failures"] + r["errors"])
        status = "PASSED" if r["was_successful"] else "FAILED"
        if not r["was_successful"]:
            all_success = False
        print(f"{r['suite']:<35} | {r['total']:<6} | {r['passed']:<6} | {(r['failures'] + r['errors']):<6} | {status:<8}")

    print("-" * 72)
    overall_status = "ALL PASSED" if all_success else "FAILURES DETECTED"
    print(f"{'TOTAL':<35} | {total_run:<6} | {total_passed:<6} | {total_failed:<6} | {overall_status:<8}")
    print(f"\n⏱ Total execution time: {total_time:.3f} seconds")
    print("=" * 72)

    if all_success:
        print("✓ All test suites passed successfully! Exit code: 0\n")
        sys.exit(0)
    else:
        print("✗ Failures encountered in test suites. Exit code: 1\n")
        sys.exit(1)


if __name__ == "__main__":
    main()
