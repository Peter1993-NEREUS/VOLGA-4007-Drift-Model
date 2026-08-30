package com.nereus.operations;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import java.io.IOException;

public class MainActivity extends Activity {
    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        getWindow().setStatusBarColor(Color.rgb(7, 19, 31));
        getWindow().setNavigationBarColor(Color.rgb(7, 19, 31));
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_VISIBLE);

        FrameLayout root = new FrameLayout(this);
        root.setLayoutParams(new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
        root.setBackgroundColor(Color.rgb(7, 19, 31));

        webView = new WebView(this);
        webView.setLayoutParams(new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT));
        webView.setBackgroundColor(Color.rgb(7, 19, 31));

        root.setOnApplyWindowInsetsListener((View v, WindowInsets insets) -> {
            int left;
            int top;
            int right;
            int bottom;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                android.graphics.Insets bars = insets.getInsets(
                        WindowInsets.Type.statusBars()
                                | WindowInsets.Type.navigationBars()
                                | WindowInsets.Type.displayCutout());
                left = bars.left;
                top = bars.top;
                right = bars.right;
                bottom = bars.bottom;
            } else {
                left = insets.getSystemWindowInsetLeft();
                top = insets.getSystemWindowInsetTop();
                right = insets.getSystemWindowInsetRight();
                bottom = insets.getSystemWindowInsetBottom();
            }

            v.setPadding(left, top, right, bottom);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                return WindowInsets.CONSUMED;
            }
            return insets.consumeSystemWindowInsets();
        });

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (!"app.local".equals(uri.getHost())) return null;

                String path = uri.getPath();
                if (path == null || path.equals("/")) path = "/index.html";
                path = path.substring(1);

                try {
                    return new WebResourceResponse(mime(path), "UTF-8", getAssets().open(path));
                } catch (IOException e) {
                    return new WebResourceResponse("text/plain", "UTF-8", null);
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !"app.local".equals(request.getUrl().getHost());
            }
        });

        webView.setWebChromeClient(new WebChromeClient());
        root.addView(webView);
        setContentView(root);
        root.requestApplyInsets();
        webView.loadUrl("https://app.local/index.html");
    }

    private String mime(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js")) return "application/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".json")) return "application/json";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".svg")) return "image/svg+xml";
        return "application/octet-stream";
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
