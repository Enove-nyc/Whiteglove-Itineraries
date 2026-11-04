package com.whitegloveitineraries.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.SslErrorHandler;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

/** A native, network-independent startup screen. Never clears cookies or wallet files. */
final class AppStartupGuard {
    private static final long TIMEOUT_MS = 20000;
    private final BridgeActivity activity;
    private final String serverUrl;
    private final String appName;
    private final WebView webView;
    private final Handler handler = new Handler(Looper.getMainLooper());
    final StartupState state = new StartupState();
    private final FrameLayout overlay;
    private final TextView title;
    private final TextView message;
    private final ProgressBar progress;
    private final Button retry;
    private final Button update;
    private long startedAt;
    private boolean destroyed;
    private boolean rendererGone;
    private boolean pageFinished;
    private ConnectivityManager.NetworkCallback networkCallback;

    static AppStartupGuard attach(BridgeActivity activity, String serverUrl, String appName) {
        return new AppStartupGuard(activity, serverUrl, appName);
    }

    private AppStartupGuard(BridgeActivity activity, String serverUrl, String appName) {
        this.activity = activity;
        this.serverUrl = serverUrl;
        this.appName = appName;
        Bridge bridge = activity.getBridge();
        webView = bridge == null ? null : bridge.getWebView();

        overlay = new FrameLayout(activity);
        overlay.setId(R.id.startup_guard);
        overlay.setBackgroundColor(Color.rgb(250, 248, 243));
        overlay.setClickable(true);
        ScrollView scroll = new ScrollView(activity);
        scroll.setFillViewport(true);
        LinearLayout content = new LinearLayout(activity);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setGravity(Gravity.CENTER);
        int padding = dp(28);
        content.setPadding(padding, padding, padding, padding);
        progress = new ProgressBar(activity);
        content.addView(progress, new LinearLayout.LayoutParams(dp(40), dp(40)));
        title = new TextView(activity);
        title.setId(R.id.startup_title);
        title.setTextColor(Color.rgb(16, 47, 53));
        title.setTextSize(22);
        title.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams textLayout = new LinearLayout.LayoutParams(-1, -2);
        textLayout.topMargin = dp(18);
        content.addView(title, textLayout);
        message = new TextView(activity);
        message.setId(R.id.startup_message);
        message.setTextColor(Color.rgb(87, 83, 78));
        message.setTextSize(16);
        message.setGravity(Gravity.CENTER);
        message.setPadding(0, dp(12), 0, dp(20));
        content.addView(message, new LinearLayout.LayoutParams(-1, -2));
        retry = button("Try again", R.id.startup_retry, content);
        retry.setOnClickListener(view -> retry());
        update = button("Update Android System WebView", R.id.startup_update, content);
        update.setOnClickListener(view -> openWebViewUpdate());
        Button website = button("Open the website", R.id.startup_website, content);
        website.setOnClickListener(view -> openExternal(serverUrl));
        scroll.addView(content, new ScrollView.LayoutParams(-1, -1));
        overlay.addView(scroll, new FrameLayout.LayoutParams(-1, -1));
        activity.addContentView(overlay, new ViewGroup.LayoutParams(-1, -1));

        if (webView == null) {
            showFailure(StartupState.Status.UPDATE_REQUIRED, "Android System WebView is unavailable. Enable or update it, then reopen the app.");
            return;
        }
        webView.setWebViewClient(new BridgeWebViewClient(bridge) {
            @Override public void onPageStarted(WebView view, String url, Bitmap favicon) {
                super.onPageStarted(view, url, favicon);
                if (!destroyed) begin();
            }
            @Override public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                if (state.status == StartupState.Status.LOADING) { pageFinished = true; schedulePoll(0); }
            }
            // Android's modern callback delegates main-frame failures here;
            // this also covers the API 22 devices the shell still supports.
            @SuppressWarnings("deprecation")
            @Override public void onReceivedError(WebView view, int code, String description, String failingUrl) {
                super.onReceivedError(view, code, description, failingUrl);
                if (destroyed || state.status == StartupState.Status.UPDATE_REQUIRED) return;
                boolean connection = code == ERROR_HOST_LOOKUP || code == ERROR_CONNECT || code == ERROR_TIMEOUT || disconnected();
                showFailure(connection ? StartupState.Status.OFFLINE : StartupState.Status.FAILED,
                    connection ? "Check your internet connection. The app will try again when the connection returns, or you can retry below."
                    : "The app could not open this page. Try again or continue on the website.");
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                super.onReceivedHttpError(view, request, response);
                if (request.isForMainFrame() && !destroyed) showFailure(StartupState.Status.FAILED,
                    "The website could not open this page. Try again in a moment or continue on the website.");
            }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler sslHandler, SslError error) {
                sslHandler.cancel(); // Never bypass a certificate failure.
                if (!destroyed) showFailure(StartupState.Status.FAILED,
                    "A secure connection could not be made. Check the tablet’s date, time and connection, then try again.");
            }
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                super.onRenderProcessGone(view, detail);
                rendererGone = true;
                if (view.getParent() instanceof ViewGroup) ((ViewGroup) view.getParent()).removeView(view);
                view.destroy();
                if (!destroyed) showFailure(StartupState.Status.FAILED,
                    "The app stopped while opening. Tap Try again to reopen it. Your saved files have not been removed.");
                return true;
            }
        });
        watchNetwork();
        begin();
    }

    private int dp(int value) { return Math.round(value * activity.getResources().getDisplayMetrics().density); }
    private Button button(String label, int id, LinearLayout parent) {
        Button button = new Button(activity);
        button.setId(id);
        button.setText(label);
        button.setAllCaps(false);
        button.setMinHeight(dp(48));
        LinearLayout.LayoutParams layout = new LinearLayout.LayoutParams(-1, -2);
        layout.topMargin = dp(8);
        parent.addView(button, layout);
        return button;
    }

    private void begin() {
        if (destroyed || rendererGone) return;
        if (StartupState.needsUpdate(webView.getSettings().getUserAgentString())) {
            webView.stopLoading();
            showFailure(StartupState.Status.UPDATE_REQUIRED,
                "Android System WebView is too old for this app. Update Android System WebView or Chrome in Google Play, then reopen the app.");
            return;
        }
        pageFinished = false;
        state.begin();
        startedAt = SystemClock.uptimeMillis();
        title.setText("Opening " + appName);
        message.setText("If this takes longer than expected, you can retry or open the website.");
        progress.setVisibility(View.VISIBLE);
        retry.setVisibility(View.GONE);
        update.setVisibility(View.GONE);
        overlay.setVisibility(View.VISIBLE);
        schedulePoll(250);
    }

    private final Runnable poll = new Runnable() {
        @Override public void run() {
            if (destroyed || rendererGone || state.status != StartupState.Status.LOADING) return;
            int generation = state.generation();
            if (SystemClock.uptimeMillis() - startedAt >= TIMEOUT_MS) {
                if (state.timedOut(generation)) showFailure(StartupState.Status.FAILED,
                    "This is taking longer than expected. Check your connection and try again, or continue on the website.");
                return;
            }
            // Do not accept the previous document while a new navigation is starting.
            if (!pageFinished) { schedulePoll(250); return; }
            // Read only whether meaningful visible content exists, never its text or URL.
            webView.evaluateJavascript("(function(){return !!(document.body && document.body.innerText.trim().length > 16 && Array.from(document.querySelectorAll('h1,h2,p,button,input,a')).some(function(e){var r=e.getBoundingClientRect(),s=getComputedStyle(e);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&Number(s.opacity)>0;}));})()", value -> {
                if (destroyed || state.generation() != generation || state.status != StartupState.Status.LOADING) return;
                if (!"true".equals(value)) { schedulePoll(500); return; }
                // DOM availability precedes WebView's next drawn frame. Keep the native
                // screen until Android confirms that frame is ready to display.
                if (android.os.Build.VERSION.SDK_INT >= 23) {
                    webView.postVisualStateCallback(generation, new WebView.VisualStateCallback() {
                        @Override public void onComplete(long requestId) { acceptRenderedContent(generation); }
                    });
                } else {
                    webView.postOnAnimation(() -> webView.postOnAnimation(() -> acceptRenderedContent(generation)));
                }
                schedulePoll(500); // Retain the timeout if the renderer never produces a frame.
            });
        }
    };
    private void acceptRenderedContent(int generation) {
        if (!destroyed && state.acceptContent(generation, true)) {
            overlay.setVisibility(View.GONE);
            handler.removeCallbacks(poll);
        }
    }
    private void schedulePoll(long delay) { handler.removeCallbacks(poll); handler.postDelayed(poll, delay); }

    private void showFailure(StartupState.Status reason, String description) {
        if (destroyed) return;
        state.fail(reason);
        handler.removeCallbacks(poll);
        title.setText(reason == StartupState.Status.UPDATE_REQUIRED ? "Update needed" : reason == StartupState.Status.OFFLINE ? "No connection" : "Couldn’t open " + appName);
        message.setText(description);
        progress.setVisibility(View.GONE);
        retry.setVisibility(View.VISIBLE);
        update.setVisibility(reason == StartupState.Status.UPDATE_REQUIRED ? View.VISIBLE : View.GONE);
        overlay.setVisibility(View.VISIBLE);
    }

    void retry() {
        if (destroyed) return;
        if (webView == null || rendererGone) { activity.recreate(); return; }
        begin();
        if (state.status == StartupState.Status.LOADING) webView.loadUrl(serverUrl);
    }

    @SuppressWarnings("deprecation")
    private boolean disconnected() {
        ConnectivityManager manager = (ConnectivityManager) activity.getSystemService(Activity.CONNECTIVITY_SERVICE);
        if (manager == null) return false;
        android.net.NetworkInfo network = manager.getActiveNetworkInfo();
        return network == null || !network.isConnected();
    }

    private void watchNetwork() {
        ConnectivityManager manager = (ConnectivityManager) activity.getSystemService(Activity.CONNECTIVITY_SERVICE);
        if (manager == null) return;
        networkCallback = new ConnectivityManager.NetworkCallback() {
            private void restored() {
                activity.runOnUiThread(() -> { if (!destroyed && state.status == StartupState.Status.OFFLINE) retry(); });
            }
            @Override public void onAvailable(Network network) { restored(); }
            @Override public void onCapabilitiesChanged(Network network, NetworkCapabilities capabilities) {
                if (capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) restored();
            }
        };
        try {
            manager.registerNetworkCallback(new NetworkRequest.Builder().addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET).build(), networkCallback);
        } catch (SecurityException ignored) { networkCallback = null; } // Manual retry remains available.
    }

    private void openWebViewUpdate() {
        String packageName = "com.google.android.webview";
        if (android.os.Build.VERSION.SDK_INT >= 26) {
            try {
                android.content.pm.PackageInfo provider = WebView.getCurrentWebViewPackage();
                if (provider != null && ("com.android.chrome".equals(provider.packageName) || "com.google.android.webview".equals(provider.packageName))) packageName = provider.packageName;
            } catch (RuntimeException ignored) { /* The provider may be disabled; offer its normal update page. */ }
        }
        openExternal("https://play.google.com/store/apps/details?id=" + packageName);
    }
    private void openExternal(String url) {
        try { activity.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE)); }
        catch (ActivityNotFoundException ignored) { message.setText("A browser is not available on this tablet. Enable a browser, then try again."); }
    }

    void destroy() {
        destroyed = true;
        handler.removeCallbacksAndMessages(null);
        ConnectivityManager manager = (ConnectivityManager) activity.getSystemService(Activity.CONNECTIVITY_SERVICE);
        if (manager != null && networkCallback != null) {
            try { manager.unregisterNetworkCallback(networkCallback); }
            catch (IllegalArgumentException ignored) { /* Already unregistered. */ }
        }
        networkCallback = null;
    }
}
