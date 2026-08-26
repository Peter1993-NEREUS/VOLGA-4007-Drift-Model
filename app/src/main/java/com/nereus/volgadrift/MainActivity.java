package com.nereus.volgadrift;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.JavascriptInterface;
import android.view.Window;
import android.graphics.Color;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.content.Context;
import android.content.Intent;
import android.content.ClipboardManager;
import android.content.ClipData;
import android.content.SharedPreferences;
import android.net.Uri;
import android.util.Base64;
import java.io.OutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private WebView web;
    private byte[] pendingBytes;
    private String pendingMime="application/octet-stream";
    private static final int CREATE_FILE=701;
    private static final String ASSET_HOST="appassets.androidplatform.net";
    private static final String PREFS="marine_drift_private";

    @Override public void onCreate(Bundle b) {
        super.onCreate(b);
        Window w=getWindow();
        w.setStatusBarColor(Color.rgb(6,31,51));
        w.setNavigationBarColor(Color.rgb(6,31,51));
        web=new WebView(this); setContentView(web);
        WebSettings s=web.getSettings();
        s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setAllowFileAccess(true); s.setAllowContentAccess(true);
        s.setBuiltInZoomControls(false); s.setDisplayZoomControls(false); s.setLoadWithOverviewMode(true); s.setUseWideViewPort(true);
        s.setUserAgentString(s.getUserAgentString()+" MarineDrift-NEREUS/1.4 (+https://github.com/Peter1993-NEREUS/VOLGA-4007-Drift-Model)");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient(){
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request){
                Uri uri=request.getUrl();
                if("https".equalsIgnoreCase(uri.getScheme()) && ASSET_HOST.equalsIgnoreCase(uri.getHost())){
                    String path=uri.getPath();
                    if(path!=null && path.startsWith("/assets/")){
                        String rel=path.substring("/assets/".length());
                        try{
                            InputStream is=getAssets().open(rel);
                            return new WebResourceResponse(mime(rel), null, is);
                        }catch(Exception ignored){}
                    }
                }
                return super.shouldInterceptRequest(view,request);
            }
        });
        web.addJavascriptInterface(new Bridge(), "Android");
        web.loadUrl("https://"+ASSET_HOST+"/assets/index.html");
    }

    private String mime(String p){
        String q=p.toLowerCase();
        if(q.endsWith(".html")) return "text/html";
        if(q.endsWith(".js")) return "application/javascript";
        if(q.endsWith(".css")) return "text/css";
        if(q.endsWith(".json")) return "application/json";
        if(q.endsWith(".png")) return "image/png";
        if(q.endsWith(".svg")) return "image/svg+xml";
        if(q.endsWith(".bin")) return "application/octet-stream";
        return "application/octet-stream";
    }

    public class Bridge {
        @JavascriptInterface public void printPdf() {
            runOnUiThread(() -> {
                PrintManager pm=(PrintManager)getSystemService(Context.PRINT_SERVICE);
                pm.print("Marine Drift Model by NEREUS", web.createPrintDocumentAdapter("Marine Drift Model by NEREUS"), new PrintAttributes.Builder().build());
            });
        }
        @JavascriptInterface public void saveText(String filename,String text) {
            pendingBytes=text.getBytes(StandardCharsets.UTF_8); pendingMime="text/csv"; launchCreate(filename,pendingMime);
        }
        @JavascriptInterface public void saveBase64(String filename,String mime,String data) {
            int c=data.indexOf(','); String raw=c>=0?data.substring(c+1):data;
            pendingBytes=Base64.decode(raw,Base64.DEFAULT); pendingMime=mime; launchCreate(filename,mime);
        }
        @JavascriptInterface public String getClipboardText() {
            try {
                ClipboardManager cm=(ClipboardManager)getSystemService(Context.CLIPBOARD_SERVICE);
                if(cm!=null && cm.hasPrimaryClip()){
                    ClipData cd=cm.getPrimaryClip();
                    if(cd!=null && cd.getItemCount()>0){
                        CharSequence cs=cd.getItemAt(0).coerceToText(MainActivity.this);
                        return cs==null?"":cs.toString();
                    }
                }
            } catch(Exception ignored){}
            return "";
        }
        @JavascriptInterface public String getGithubToken() {
            return getSharedPreferences(PREFS,Context.MODE_PRIVATE).getString("gh_token","");
        }
        @JavascriptInterface public void saveGithubToken(String token) {
            getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().putString("gh_token",token==null?"":token.trim()).apply();
        }
        @JavascriptInterface public void clearGithubToken() {
            getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().remove("gh_token").apply();
        }
        private void launchCreate(String filename,String mime){runOnUiThread(() -> {Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType(mime);i.putExtra(Intent.EXTRA_TITLE,filename);startActivityForResult(i,CREATE_FILE);});}
    }

    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){
        super.onActivityResult(requestCode,resultCode,data);
        if(requestCode==CREATE_FILE && resultCode==RESULT_OK && data!=null && pendingBytes!=null){
            Uri uri=data.getData(); if(uri!=null) try(OutputStream os=getContentResolver().openOutputStream(uri)){os.write(pendingBytes);os.flush();}catch(Exception e){}
            pendingBytes=null;
        }
    }
    @Override public void onBackPressed(){ if(web!=null && web.canGoBack()) web.goBack(); else super.onBackPressed(); }
}
