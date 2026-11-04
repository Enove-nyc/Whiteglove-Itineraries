package com.whitegloveitineraries.app;

import static org.junit.Assert.*;
import android.content.Context;
import android.graphics.Bitmap;
import android.net.ConnectivityManager;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import android.view.View;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Connectivity is changed only on the disposable CI emulator, never on a user device. */
@RunWith(AndroidJUnit4.class)
public class StartupNetworkTest {
    private void shell(String command) throws Exception {
        ParcelFileDescriptor descriptor = InstrumentationRegistry.getInstrumentation().getUiAutomation().executeShellCommand(command);
        try (ParcelFileDescriptor.AutoCloseInputStream input = new ParcelFileDescriptor.AutoCloseInputStream(descriptor)) {
            byte[] buffer = new byte[1024];
            while (input.read(buffer) != -1) { }
        }
    }
    private void await(ActivityScenario<MainActivity> scenario, StartupState.Status status) {
        long until = SystemClock.uptimeMillis() + 25000;
        AtomicBoolean matches = new AtomicBoolean();
        while (SystemClock.uptimeMillis() < until) {
            scenario.onActivity(activity -> matches.set(activity.startup.state.status == status));
            if (matches.get()) return;
            SystemClock.sleep(200);
        }
        scenario.onActivity(activity -> assertEquals(status, activity.startup.state.status));
    }
    private void capture(String name) throws Exception {
        Bitmap bitmap = InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
        assertNotNull(bitmap);
        File file = new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getExternalFilesDir(null), name + ".png");
        try (FileOutputStream stream = new FileOutputStream(file)) { bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream); }
        bitmap.recycle();
    }
    @SuppressWarnings("deprecation")
    @Test public void offlineFirstLaunchHasNativeRecoveryAndReconnectsAutomatically() throws Exception {
        try {
            shell("svc wifi disable");
            shell("svc data disable");
            ConnectivityManager manager = (ConnectivityManager) InstrumentationRegistry.getInstrumentation().getTargetContext().getSystemService(Context.CONNECTIVITY_SERVICE);
            long until = SystemClock.uptimeMillis() + 10000;
            while (manager.getActiveNetworkInfo() != null && manager.getActiveNetworkInfo().isConnected() && SystemClock.uptimeMillis() < until) SystemClock.sleep(100);
            assertTrue("Disposable emulator must be offline for this test", manager.getActiveNetworkInfo() == null || !manager.getActiveNetworkInfo().isConnected());
            try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
                await(scenario, StartupState.Status.OFFLINE);
                scenario.onActivity(activity -> assertEquals(View.VISIBLE, activity.findViewById(R.id.startup_retry).getVisibility()));
                capture("offline-first-launch");
                shell("svc wifi enable");
                shell("svc data enable");
                await(scenario, StartupState.Status.READY);
                capture("reconnected");
            }
        } finally {
            shell("svc wifi enable");
            shell("svc data enable");
        }
    }
}
