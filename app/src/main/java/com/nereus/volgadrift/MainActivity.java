package com.nereus.volgadrift;

import android.app.Activity;
import android.os.Bundle;
import android.os.Build;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.JavascriptInterface;
import android.view.Window;
import android.view.WindowInsets;
import android.graphics.Color;
import android.graphics.Insets;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PageRange;
import android.content.Context;
import android.content.Intent;
import android.content.ClipboardManager;
import android.content.ClipData;
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
    private static final int CREATE_PDF=702;
    private static final String ASSET_HOST="appassets.androidplatform.net";
    private static final String PREFS="marine_drift_private";

    @Override public void onCreate(Bundle b) {
        super.onCreate(b);
        Window w=getWindow();
        w.setStatusBarColor(Color.rgb(6,31,51));
        w.setNavigationBarColor(Color.rgb(6,31,51));
        web=new WebView(this);
        setContentView(web);
        applySystemBarInsets();

        WebSettings s=web.getSettings();
        s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setAllowFileAccess(true); s.setAllowContentAccess(true);
        s.setBuiltInZoomControls(false); s.setDisplayZoomControls(false); s.setLoadWithOverviewMode(true); s.setUseWideViewPort(true);
        s.setUserAgentString(s.getUserAgentString()+" MarineDrift-NEREUS/1.4.1 (+https://github.com/Peter1993-NEREUS/VOLGA-4007-Drift-Model)");
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
            @Override public void onPageFinished(WebView view,String url){
                super.onPageFinished(view,url);
                view.evaluateJavascript("(function(){if(!document.getElementById('v141loader')){var s=document.createElement('script');s.id='v141loader';s.src='v141.js';document.body.appendChild(s);}})();",null);
            }
        });
        web.addJavascriptInterface(new Bridge(), "Android");
        web.loadUrl("https://"+ASSET_HOST+"/assets/index.html");
    }

    private void applySystemBarInsets(){
        if(Build.VERSION.SDK_INT>=30){
            web.setOnApplyWindowInsetsListener((v,insets)->{
                Insets bars=insets.getInsets(WindowInsets.Type.systemBars());
                v.setPadding(bars.left,bars.top,bars.right,bars.bottom);
                return insets;
            });
        } else {
            web.setOnApplyWindowInsetsListener((v,insets)->{
                v.setPadding(insets.getSystemWindowInsetLeft(),insets.getSystemWindowInsetTop(),insets.getSystemWindowInsetRight(),insets.getSystemWindowInsetBottom());
                return insets;
            });
        }
        web.requestApplyInsets();
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
            savePdf("Marine_Drift_Report_by_NEREUS.pdf");
        }
        @JavascriptInterface public void savePdf(String filename) {
            runOnUiThread(() -> launchPdfCreate(filename==null||filename.trim().isEmpty()?"Marine_Drift_Report_by_NEREUS.pdf":filename));
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
        private void launchPdfCreate(String filename){Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType("application/pdf");i.putExtra(Intent.EXTRA_TITLE,filename);startActivityForResult(i,CREATE_PDF);}
    }

    private void writePdf(Uri uri){
        runOnUiThread(() -> {
            final PrintDocumentAdapter adapter=web.createPrintDocumentAdapter("Marine Drift Model by NEREUS");
            final PrintAttributes attrs=new PrintAttributes.Builder()
                    .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                    .setResolution(new PrintAttributes.Resolution("pdf","PDF",300,300))
                    .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
                    .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
                    .build();
            adapter.onStart();
            adapter.onLayout(attrs,attrs,new CancellationSignal(),new PrintDocumentAdapter.LayoutResultCallback(){
                @Override public void onLayoutFinished(PrintDocumentInfo info,boolean changed){
                    try{
                        final ParcelFileDescriptor pfd=getContentResolver().openFileDescriptor(uri,"w");
                        if(pfd==null){adapter.onFinish();return;}
                        adapter.onWrite(new PageRange[]{PageRange.ALL_PAGES},pfd,new CancellationSignal(),new PrintDocumentAdapter.WriteResultCallback(){
                            @Override public void onWriteFinished(PageRange[] pages){try{pfd.close();}catch(Exception ignored){}adapter.onFinish();}
                            @Override public void onWriteFailed(CharSequence error){try{pfd.close();}catch(Exception ignored){}adapter.onFinish();}
                            @Override public void onWriteCancelled(){try{pfd.close();}catch(Exception ignored){}adapter.onFinish();}
                        });
                    }catch(Exception e){adapter.onFinish();}
                }
                @Override public void onLayoutFailed(CharSequence error){adapter.onFinish();}
                @Override public void onLayoutCancelled(){adapter.onFinish();}
            },new Bundle());
        });
    }

    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){
        super.onActivityResult(requestCode,resultCode,data);
        if(resultCode!=RESULT_OK||data==null)return;
        Uri uri=data.getData(); if(uri==null)return;
        if(requestCode==CREATE_PDF){writePdf(uri);return;}
        if(requestCode==CREATE_FILE && pendingBytes!=null){
            try(OutputStream os=getContentResolver().openOutputStream(uri)){os.write(pendingBytes);os.flush();}catch(Exception ignored){}
            pendingBytes=null;
        }
    }
    @Override public void onBackPressed(){ if(web!=null && web.canGoBack()) web.goBack(); else super.onBackPressed(); }
}
