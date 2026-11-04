#!/usr/bin/env bash
set -euo pipefail
# Reset only this workflow's disposable emulator, never a person's tablet.
test "${GITHUB_ACTIONS:-}" = true
wg_test_serial="$(adb get-serialno)"
case "$wg_test_serial" in emulator-*) ;; *) echo 'A disposable emulator is required.' >&2; exit 1 ;; esac
test "$(adb -s "$wg_test_serial" shell getprop ro.kernel.qemu | tr -d '\r')" = 1
validation_failed=0
for entry in 'kosher/native/kosher:com.Whiteglovekoshertravel.app' 'itineraries/native/itineraries:com.whitegloveitineraries.app' 'itineraries/native/advisor:com.whitegloveadvisor.app' 'itineraries/native/admin:com.whitegloveadmin.app'; do
  project="${entry%%:*}"
  app_package="${entry#*:}"
  app_name="$(basename "$project")"
  mkdir -p "native-results/$app_name"
  adb -s "$wg_test_serial" install -r "$project/android/app/build/outputs/apk/debug/app-debug.apk"
  adb -s "$wg_test_serial" install -r "$project/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk"
  adb -s "$wg_test_serial" shell pm clear "$app_package"
  if [ "$app_name" != admin ]; then
    adb -s "$wg_test_serial" shell pm grant "$app_package" android.permission.CAMERA
    adb -s "$wg_test_serial" shell pm grant "$app_package" android.permission.RECORD_AUDIO
  fi
  # Separate invocations prevent JUnit's class ordering from warming the cache.
  adb -s "$wg_test_serial" shell am instrument -w -e class "$app_package.StartupNetworkTest" "$app_package.test/androidx.test.runner.AndroidJUnitRunner" | tee "native-results/$app_name/network.txt" || validation_failed=1
  if ! grep -E '^OK [(][1-9][0-9]* tests?[)]' "native-results/$app_name/network.txt"; then validation_failed=1; fi
  adb -s "$wg_test_serial" shell svc wifi enable
  adb -s "$wg_test_serial" shell svc data enable
  sleep 2
  adb -s "$wg_test_serial" shell am instrument -w -e class "$app_package.StartupSmokeTest" "$app_package.test/androidx.test.runner.AndroidJUnitRunner" | tee "native-results/$app_name/instrumentation.txt" || validation_failed=1
  if ! grep -E '^OK [(]([5-9]|[1-9][0-9]+) tests?[)]' "native-results/$app_name/instrumentation.txt"; then validation_failed=1; fi
  adb -s "$wg_test_serial" pull "/sdcard/Android/data/$app_package/files/." "native-results/$app_name/" || true
  adb -s "$wg_test_serial" shell am force-stop "$app_package"
done
exit "$validation_failed"
