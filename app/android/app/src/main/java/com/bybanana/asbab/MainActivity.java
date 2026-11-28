package com.bybanana.asbab;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    public static final String EXTRA_ROUTE = "asbab.route";
    public static final String EXTRA_VOICE = "asbab.voice";

    /** Words spoken to the moon button's voice command, sent to the main chat by the web UI. */
    public static volatile String pendingVoice = null;

    /** Page a tapped notification wants to open; the web UI collects it through AsbabNative.takeRoute(). */
    public static volatile String pendingRoute = null;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AsbabPlugin.class);
        super.onCreate(savedInstanceState);
        keepRoute(getIntent());
        Notifier.INSTANCE.ensureChannels(this);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        keepRoute(intent);
    }

    @Override
    public void onResume() {
        super.onResume();
        applyTextZoom();
        Overlay.setAppVisible(this, true);
    }

    /** Respect the phone's text size setting (Phase 6): the web UI uses rem units, so text zoom scales it. */
    private void applyTextZoom() {
        try {
            float scale = getResources().getConfiguration().fontScale;
            getBridge().getWebView().getSettings().setTextZoom(Math.round(scale * 100));
        } catch (Exception ignored) {
        }
    }

    @Override
    public void onPause() {
        Overlay.setAppVisible(this, false);
        super.onPause();
    }

    private void keepRoute(Intent intent) {
        if (intent == null) return;
        if (intent.hasExtra(EXTRA_ROUTE)) {
            pendingRoute = intent.getStringExtra(EXTRA_ROUTE);
            intent.removeExtra(EXTRA_ROUTE);
        }
        if (intent.hasExtra(EXTRA_VOICE)) {
            pendingVoice = intent.getStringExtra(EXTRA_VOICE);
            intent.removeExtra(EXTRA_VOICE);
        }
    }
}
