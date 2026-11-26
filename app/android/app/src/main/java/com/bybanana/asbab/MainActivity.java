package com.bybanana.asbab;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    public static final String EXTRA_ROUTE = "asbab.route";

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

    private void keepRoute(Intent intent) {
        if (intent != null && intent.hasExtra(EXTRA_ROUTE)) {
            pendingRoute = intent.getStringExtra(EXTRA_ROUTE);
            intent.removeExtra(EXTRA_ROUTE);
        }
    }
}
