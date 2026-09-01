package com.nereus.operations;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;

import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import javax.net.ssl.HttpsURLConnection;

public class MainActivity extends Activity {
    private static final String API_URL = "https://bzfzghszxqartljpjsmc.supabase.co/functions/v1/nereus-api";
    private static final String EXPORT_API_URL = "https://bzfzghszxqartljpjsmc.supabase.co/functions/v1/nereus-export";
    private static final String API_KEY = "sb_publishable_tEjG1IsI7MHVtQf1GGNK0w_yXcxZ8Vd";

    private WebView webView;
    private final ExecutorService networkExecutor = Executors.newSingleThreadExecutor();

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
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

        webView.addJavascriptInterface(new NativeNetworkBridge(), "NereusNative");

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
                Uri uri = request.getUrl();
                if ("app.local".equals(uri.getHost())) return false;
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                }
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient());
        root.addView(webView);
        setContentView(root);
        root.requestApplyInsets();
        webView.loadUrl("https://app.local/index.html");
    }

    private final class NativeNetworkBridge {
        @JavascriptInterface
        public void post(String requestId, String urlString, String bodyJson) {
            if (requestId == null || requestId.length() > 100) return;
            if (!API_URL.equals(urlString) && !EXPORT_API_URL.equals(urlString)) {
                deliverNativeResult(requestId, 0, "", "URL_NOT_ALLOWED");
                return;
            }
            final String safeBody = bodyJson == null ? "{}" : bodyJson;
            final String safeUrl = urlString;
            networkExecutor.execute(() -> performPost(requestId, safeUrl, safeBody));
        }
    }

    private void performPost(String requestId, String urlString, String bodyJson) {
        HttpsURLConnection connection = null;
        try {
            URL url = new URL(urlString);
            connection = (HttpsURLConnection) url.openConnection();
            connection.setRequestMethod("POST");
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(30000);
            connection.setDoOutput(true);
            connection.setUseCaches(false);
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            connection.setRequestProperty("Accept", "application/json");
            connection.setRequestProperty("apikey", API_KEY);
            connection.setRequestProperty("User-Agent", "NEREUS-Operations-Android/0.4.2");

            try {
                JSONObject body = new JSONObject(bodyJson);
                String accessToken = body.optString("access_token", "");
                if (!accessToken.isEmpty()) {
                    connection.setRequestProperty("Authorization", "Bearer " + accessToken);
                }
            } catch (Exception ignored) {
            }

            byte[] bytes = bodyJson.getBytes(StandardCharsets.UTF_8);
            connection.setFixedLengthStreamingMode(bytes.length);
            try (OutputStream output = connection.getOutputStream()) {
                output.write(bytes);
                output.flush();
            }

            int status = connection.getResponseCode();
            InputStream stream = status >= 200 && status < 400
                    ? connection.getInputStream()
                    : connection.getErrorStream();
            String response = readAll(stream);
            deliverNativeResult(requestId, status, response == null || response.isEmpty() ? "{}" : response, null);
        } catch (Exception e) {
            deliverNativeResult(requestId, 0, "", e.getClass().getSimpleName() + ": " + String.valueOf(e.getMessage()));
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private String readAll(InputStream stream) throws IOException {
        if (stream == null) return "";
        StringBuilder builder = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) builder.append(line);
        }
        return builder.toString();
    }

    private void deliverNativeResult(String requestId, int status, String response, String error) {
        if (webView == null) return;
        final String script = "window.__nereusNativeResolve(" +
                JSONObject.quote(requestId) + "," + status + "," +
                JSONObject.quote(response == null ? "" : response) + "," +
                (error == null ? "null" : JSONObject.quote(error)) + ");";
        webView.post(() -> webView.evaluateJavascript(script, null));
    }

    private String mime(String path) {
        if (path.endsWith(".html")) return "text/html";
        if (path.endsWith(".js")) return "application/javascript";
        if (path.endsWith(".css")) return "text/css";
        if (path.endsWith(".json")) return "application/json";
        if (path.endsWith(".png")) return "image/png";
        if (path.endsWith(".svg")) return "image/svg+xml";
        if (path.endsWith(".xml")) return "application/xml";
        return "application/octet-stream";
    }

    @Override
    protected void onDestroy() {
        networkExecutor.shutdownNow();
        if (webView != null) {
            webView.removeJavascriptInterface("NereusNative");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
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
