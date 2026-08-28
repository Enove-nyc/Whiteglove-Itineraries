package com.whitegloveadmin.app;

import com.getcapacitor.BridgeActivity;

// The admin console is a plain WebView shell over the dashboard — no getUserMedia
// (voice notes and the camera live in the advisor and client apps), so it needs
// none of the runtime-permission plumbing those carry. Capacitor's own file
// chooser handles content-image uploads.
public class MainActivity extends BridgeActivity {}
