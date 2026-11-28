package com.bybanana.asbab;

import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;

import androidx.annotation.NonNull;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsAnimationCompat;
import androidx.core.view.WindowInsetsCompat;

import java.util.List;

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
        SafeMode.install(this);
        super.onCreate(savedInstanceState);
        SafeMode.onStart(this);
        keepRoute(getIntent());
        Notifier.INSTANCE.ensureChannels(this);
        watchKeyboard();
    }

    /* ---------- Phase 6.2: tell the web UI exactly where the keyboard is ---------- */
    private boolean lastOpen = false;
    private int lastCover = -1;

    /**
     * With edge-to-edge screens the WebView is not always made shorter when the keyboard opens, so the page
     * cannot know how much of it is hidden. This measures how far the keyboard covers the WebView (in CSS px)
     * and passes it to window.asbabKeyboard(open, px) on every change and during the keyboard animation.
     */
    private void watchKeyboard() {
        try {
            final WebView wv = getBridge().getWebView();
            final View root = getWindow().getDecorView();
            root.getViewTreeObserver().addOnGlobalLayoutListener(this::reportKeyboard);
            ViewCompat.setWindowInsetsAnimationCallback(wv, new WindowInsetsAnimationCompat.Callback(WindowInsetsAnimationCompat.Callback.DISPATCH_MODE_CONTINUE_ON_SUBTREE) {
                @NonNull
                @Override
                public WindowInsetsCompat onProgress(@NonNull WindowInsetsCompat insets, @NonNull List<WindowInsetsAnimationCompat> running) {
                    reportKeyboard();
                    return insets;
                }

                @Override
                public void onEnd(@NonNull WindowInsetsAnimationCompat animation) {
                    reportKeyboard();
                }
            });
        } catch (Exception ignored) {
        }
    }

    private void reportKeyboard() {
        try {
            WebView wv = getBridge().getWebView();
            View root = getWindow().getDecorView();
            WindowInsetsCompat ins = ViewCompat.getRootWindowInsets(root);
            boolean open = ins != null && ins.isVisible(WindowInsetsCompat.Type.ime());
            int imeBottom = ins == null ? 0 : ins.getInsets(WindowInsetsCompat.Type.ime()).bottom;
            int[] loc = new int[2];
            wv.getLocationOnScreen(loc);
            int wvBottom = loc[1] + wv.getHeight();
            int cover = open ? Math.max(0, wvBottom - (root.getHeight() - imeBottom)) : 0;
            int css = Math.round(cover / getResources().getDisplayMetrics().density);
            if (open == lastOpen && css == lastCover) return;
            lastOpen = open;
            lastCover = css;
            wv.evaluateJavascript("window.asbabKeyboard&&window.asbabKeyboard(" + open + "," + css + ")", null);
        } catch (Exception ignored) {
        }
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
        AppLock.INSTANCE.onResume(this);
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
        AppLock.INSTANCE.onPause();
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
