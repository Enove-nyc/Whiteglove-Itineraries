#!/usr/bin/env bash
set -euo pipefail
for entry in 'kosher/native/kosher:com.Whiteglovekoshertravel.app' 'itineraries/native/itineraries:com.whitegloveitineraries.app' 'itineraries/native/advisor:com.whitegloveadvisor.app' 'itineraries/native/admin:com.whitegloveadmin.app'; do
  project="${entry%%:*}"
  app_package="${entry#*:}"
  app_name="$(basename "$project")"
  mkdir -p "native-results/$app_name"
  adb install -r "$project/android/app/build/outputs/apk/debug/app-debug.apk"
  adb install -r "$project/android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk"
  if [ "$app_name" != admin ]; then
    adb shell pm grant "$app_package" android.permission.CAMERA
    adb shell pm grant "$app_package" android.permission.RECORD_AUDIO
  fi
  adb shell am instrument -w -e class "$app_package.StartupNetworkTest,$app_package.StartupSmokeTest" "$app_package.test/androidx.test.runner.AndroidJUnitRunner" | tee "native-results/$app_name/instrumentation.txt"
  grep -E '^OK \([5-9][0-9]* tests?\)' "native-results/$app_name/instrumentation.txt"
  adb pull "/sdcard/Android/data/$app_package/files/." "native-results/$app_name/"
  adb shell am force-stop "$app_package"
done
