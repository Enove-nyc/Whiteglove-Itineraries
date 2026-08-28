package com.whitegloveitineraries.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.PermissionRequest;

import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {

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
        // Capacitor's default WebChromeClient does not reliably pass a remote
        // page's getUserMedia (mic/camera) request through to the OS grant, so
        // the voice-note button failed even after the permission was given.
        // Grant audio/video capture ourselves; the OS runtime permission
        // requested above is still the real gate. Subclassing keeps everything
        // else Capacitor provides (the file chooser for photos and documents).
        final Bridge bridge = getBridge();
        if (bridge == null || bridge.getWebView() == null) {
            return;
        }
        bridge.getWebView().setWebChromeClient(new BridgeWebChromeClient(bridge) {
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
    }
}
