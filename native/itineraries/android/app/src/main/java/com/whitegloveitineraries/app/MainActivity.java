package com.whitegloveitineraries.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;

import androidx.annotation.NonNull;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;
import com.getcapacitor.BridgeWebViewClient;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {

    // The one page this shell ever loads. Capacitor's own server.url — kept
    // here too because retrying a failed load means asking the WebView to
    // load it again, and the WebViewClient below has no other way to know it.
    private static final String SERVER_URL = "https://whitegloveitineraries.com/app";

    /**
     * Shown ONLY when the very first request for SERVER_URL cannot reach the
     * network at all — no DNS, no signal, airplane mode. Every other kind of
     * "offline" (the app loaded once and lost signal since) is the website's
     * own concern: its service worker and /offline page already handle that,
     * with the traveller's real cached trip and wallet on screen. This page
     * exists for what a service worker cannot: the case where the very first
     * navigation itself never got far enough for that service worker to have
     * been installed. It was showing Android's own bare "Webpage not
     * available / net::ERR_FAILED" page instead — a raw URL and an error code,
     * with no way back in except manually reloading. This is what should be
     * there instead: it says what happened in plain words, and it retries on
     * its own the moment the network comes back, or on a tap.
     */
    private static final String OFFLINE_HTML =
        "<!doctype html><html><head><meta charset=\"utf-8\">"
            + "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">"
            + "<style>"
            + "body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;"
            + "justify-content:center;text-align:center;padding:32px;box-sizing:border-box;"
            + "background:#14213d;color:#f5f1e8;font-family:-apple-system,Roboto,Arial,sans-serif;}"
            + "h1{font-size:20px;margin:0 0 12px;}"
            + "p{font-size:15px;line-height:1.5;color:#cfc8b8;margin:0 0 28px;max-width:320px;}"
            + "button{min-height:44px;padding:0 24px;border:1px solid #d4af6a;border-radius:4px;"
            + "background:transparent;color:#f5f1e8;font-size:14px;font-weight:700;"
            + "text-transform:uppercase;letter-spacing:.08em;}"
            + "</style></head><body>"
            + "<h1>No connection</h1>"
            + "<p>White Glove needs the internet to open your trip. "
            + "It will try again on its own once you have a signal, or tap below.</p>"
            + "<button onclick=\"location.href='" + SERVER_URL + "'\">Try again</button>"
            + "</body></html>";

    private boolean showingOfflineFallback = false;
    private ConnectivityManager.NetworkCallback networkCallback;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // The web app's voice notes and camera need the OS mic and camera
        // permissions; ask for them up front so the WebView grant below always
        // has the real OS grant behind it.
        List<String> ask = new ArrayList<>();
        for (String p : new String[]{
                Manifest.permission.RECORD_AUDIO,
                Manifest.permission.MODIFY_AUDIO_SETTINGS,
                Manifest.permission.CAMERA}) {
            if (ContextCompat.checkSelfPermission(this, p) != PackageManager.PERMISSION_GRANTED) {
                ask.add(p);
            }
        }
        if (!ask.isEmpty()) {
            ActivityCompat.requestPermissions(this, ask.toArray(new String[0]), 4711);
        }
    }

    @Override
    public void onStart() {
        super.onStart();
        final Bridge bridge = getBridge();
        if (bridge == null || bridge.getWebView() == null) {
            return;
        }
        final WebView webView = bridge.getWebView();

        // Capacitor's default WebChromeClient does not reliably pass a remote
        // page's getUserMedia (mic/camera) request through to the OS grant, so
        // the voice-note button failed even after the permission was given.
        // Grant audio/video capture ourselves; the OS runtime permission
        // requested above is still the real gate. Subclassing keeps everything
        // else Capacitor provides (the file chooser for photos and documents).
        webView.setWebChromeClient(new BridgeWebChromeClient(bridge) {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    List<String> allow = new ArrayList<>();
                    for (String res : request.getResources()) {
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res)
                                || PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res)) {
                            allow.add(res);
                        }
                    }
                    request.grant(allow.toArray(new String[0]));
                });
            }
        });

        // WHEN THE APP'S ONE PAGE CANNOT LOAD AT ALL, show something useful
        // instead of Android's own error screen. Extending Capacitor's own
        // BridgeWebViewClient keeps every local-asset and plugin request it
        // already handles working exactly as before; only the failure path is
        // new.
        webView.setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                if (request.isForMainFrame()) {
                    showingOfflineFallback = true;
                    view.loadDataWithBaseURL(null, OFFLINE_HTML, "text/html", "UTF-8", null);
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (url != null && url.startsWith(SERVER_URL)) {
                    showingOfflineFallback = false;
                }
            }
        });

        // AND RETRY ON ITS OWN the moment a network comes back, rather than
        // leaving the traveller to notice their signal returned and tap Try
        // again themselves. Registered once per app session; the callback
        // reads showingOfflineFallback fresh each time so a retry that is
        // already showing the real page is a no-op.
        ConnectivityManager connectivityManager =
            (ConnectivityManager) getApplicationContext().getSystemService(CONNECTIVITY_SERVICE);
        if (connectivityManager != null && networkCallback == null) {
            networkCallback = new ConnectivityManager.NetworkCallback() {
                @Override
                public void onAvailable(@NonNull Network network) {
                    if (showingOfflineFallback) {
                        runOnUiThread(() -> {
                            if (showingOfflineFallback) {
                                webView.loadUrl(SERVER_URL);
                            }
                        });
                    }
                }
            };
            NetworkRequest request = new NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build();
            connectivityManager.registerNetworkCallback(request, networkCallback);
        }
    }

    @Override
    protected void onDestroy() {
        if (networkCallback != null) {
            ConnectivityManager connectivityManager =
                (ConnectivityManager) getApplicationContext().getSystemService(CONNECTIVITY_SERVICE);
            if (connectivityManager != null) {
                try {
                    connectivityManager.unregisterNetworkCallback(networkCallback);
                } catch (IllegalArgumentException ignored) {
                    // Already unregistered — nothing to do.
                }
            }
            networkCallback = null;
        }
        super.onDestroy();
    }
}
