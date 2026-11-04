package com.whitegloveitineraries.app;

import static org.junit.Assert.*;

import android.content.pm.ActivityInfo;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.SystemClock;
import android.view.View;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.util.Collections;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Real Android WebView + native screen checks, with no account or trip mutations. */
@RunWith(AndroidJUnit4.class)
public class StartupSmokeTest {
    private static final String ORIGIN = "https://whitegloveitineraries.com/app";

    private void capture(String name) {
        SystemClock.sleep(200);
        Bitmap bitmap = InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();
        assertNotNull(bitmap);
        File file = new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getExternalFilesDir(null), name + ".png");
        try (FileOutputStream output = new FileOutputStream(file)) { bitmap.compress(Bitmap.CompressFormat.PNG, 100, output); }
        catch (java.io.IOException error) { throw new AssertionError(error); }
        bitmap.recycle();
    }

    private void await(ActivityScenario<MainActivity> scenario, StartupState.Status expected, long timeout) {
        long end = SystemClock.uptimeMillis() + timeout;
        AtomicBoolean matched = new AtomicBoolean();
        while (SystemClock.uptimeMillis() < end) {
            scenario.onActivity(activity -> matched.set(activity.startup.state.status == expected));
            if (matched.get()) return;
            SystemClock.sleep(100);
        }
        scenario.onActivity(activity -> assertEquals(expected, activity.startup.state.status));
    }

    private void fixture(ActivityScenario<MainActivity> scenario, String html) {
        scenario.onActivity(activity -> {
            WebView web = activity.getBridge().getWebView();
            web.stopLoading();
            web.getSettings().setUserAgentString("Mozilla/5.0 Android Chrome/126.0.0.0 Mobile Safari/537.36");
            web.loadDataWithBaseURL(ORIGIN, "<!doctype html><html><head><meta name='viewport' content='width=device-width, initial-scale=1'></head><body>" + html + "</body></html>", "text/html", "UTF-8", null);
        });
    }

    @Test public void liveEntryRendersOnASupportedEngine() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            long end = SystemClock.uptimeMillis() + 25000;
            AtomicBoolean complete = new AtomicBoolean();
            while (SystemClock.uptimeMillis() < end) {
                scenario.onActivity(activity -> complete.set(activity.startup.state.status != StartupState.Status.LOADING));
                if (complete.get()) break;
                SystemClock.sleep(200);
            }
            scenario.onActivity(activity -> {
                assertEquals(((android.widget.TextView) activity.findViewById(R.id.startup_message)).getText().toString(), StartupState.Status.READY, activity.startup.state.status);
                if (activity.startup.state.status != StartupState.Status.READY) {
                    assertEquals(View.VISIBLE, activity.findViewById(R.id.startup_retry).getVisibility());
                    assertEquals(View.VISIBLE, activity.findViewById(R.id.startup_website).getVisibility());
                }
            });
            capture("live-entry");
        }
    }

    @Test public void renderedContentDismissesStartupInBothOrientations() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            fixture(scenario, "<h1>Your travel information is ready</h1><button>Open itinerary</button>");
            await(scenario, StartupState.Status.READY, 10000);
            for (int orientation : new int[]{ActivityInfo.SCREEN_ORIENTATION_PORTRAIT, ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE}) {
                scenario.onActivity(activity -> activity.setRequestedOrientation(orientation));
                SystemClock.sleep(800);
                scenario.onActivity(activity -> {
                    assertEquals(View.GONE, activity.findViewById(R.id.startup_guard).getVisibility());
                    assertTrue(activity.getBridge().getWebView().getWidth() > 0);
                    assertTrue(activity.getBridge().getWebView().getHeight() > 0);
                });
                capture(orientation == ActivityInfo.SCREEN_ORIENTATION_PORTRAIT ? "portrait-ready" : "landscape-ready");
            }
        }
    }

    @Test public void blankDocumentTimesOutToANativeRetryScreen() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            fixture(scenario, "");
            await(scenario, StartupState.Status.FAILED, 25000);
            scenario.onActivity(activity -> {
                assertEquals(View.VISIBLE, activity.findViewById(R.id.startup_guard).getVisibility());
                assertEquals(View.VISIBLE, activity.findViewById(R.id.startup_retry).getVisibility());
                assertTrue(((android.widget.TextView) activity.findViewById(R.id.startup_message)).getText().toString().contains("longer than expected"));
            });
            capture("blank-recovery");
        }
    }

    @Test public void olderWebViewGetsUpdateInstructionsInsteadOfABlankPage() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            scenario.onActivity(activity -> {
                activity.getBridge().getWebView().getSettings().setUserAgentString("Mozilla/5.0 Android Chrome/100.0.0.0");
                activity.startup.retry();
                assertEquals(StartupState.Status.UPDATE_REQUIRED, activity.startup.state.status);
                assertEquals(View.VISIBLE, activity.findViewById(R.id.startup_update).getVisibility());
            });
            capture("outdated-webview");
        }
    }

    private WebResourceRequest request(final boolean mainFrame) {
        return new WebResourceRequest() {
            public Uri getUrl() { return Uri.parse(ORIGIN); }
            public boolean isForMainFrame() { return mainFrame; }
            public boolean isRedirect() { return false; }
            public boolean hasGesture() { return false; }
            public String getMethod() { return "GET"; }
            public Map<String, String> getRequestHeaders() { return Collections.emptyMap(); }
        };
    }

    @Test public void mainFrameFailuresHaveRecoveryAndSubresourceFailuresDoNotCoverTheApp() {
        try (ActivityScenario<MainActivity> scenario = ActivityScenario.launch(MainActivity.class)) {
            fixture(scenario, "<h1>Your itinerary is ready for your journey</h1>");
            await(scenario, StartupState.Status.READY, 10000);
            scenario.onActivity(activity -> {
                WebView web = activity.getBridge().getWebView();
                WebResourceError error = new WebResourceError() {
                    public int getErrorCode() { return WebViewClient.ERROR_CONNECT; }
                    public CharSequence getDescription() { return "Test connection failure"; }
                };
                web.getWebViewClient().onReceivedError(web, request(false), error);
                assertEquals(StartupState.Status.READY, activity.startup.state.status);
                web.getWebViewClient().onReceivedError(web, request(true), error);
                assertEquals(StartupState.Status.OFFLINE, activity.startup.state.status);
                assertEquals(View.VISIBLE, activity.findViewById(R.id.startup_retry).getVisibility());
                WebResourceResponse response = new WebResourceResponse("text/plain", "UTF-8", 503, "Service Unavailable", Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
                web.getWebViewClient().onReceivedHttpError(web, request(true), response);
                assertEquals(StartupState.Status.FAILED, activity.startup.state.status);
            });
            capture("connection-recovery");
        }
    }
}
