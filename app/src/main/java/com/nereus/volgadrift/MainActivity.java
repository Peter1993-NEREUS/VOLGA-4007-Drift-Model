package com.nereus.volgadrift;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.JavascriptInterface;
import android.view.Window;
import android.graphics.Color;
import android.print.PrintAttributes;
import android.print.PrintManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private WebView web;
    private byte[] pendingBytes;
    private String pendingMime="application/octet-stream";
    private static final int CREATE_FILE=701;

    @Override public void onCreate(Bundle b) {
        super.onCreate(b);
        Window w=getWindow();
        w.setStatusBarColor(Color.rgb(11,41,66));
        w.setNavigationBarColor(Color.rgb(11,41,66));
        web=new WebView(this); setContentView(web);
        WebSettings s=web.getSettings();
        s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setAllowFileAccess(true); s.setAllowContentAccess(true);
        s.setAllowFileAccessFromFileURLs(true); s.setAllowUniversalAccessFromFileURLs(true);
        s.setBuiltInZoomControls(false); s.setDisplayZoomControls(false); s.setLoadWithOverviewMode(true); s.setUseWideViewPort(true);
        web.setWebViewClient(new WebViewClient()); web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new Bridge(), "Android");
        web.loadUrl("file:///android_asset/index.html");
    }

    public class Bridge {
        @JavascriptInterface public void printPdf() {
            runOnUiThread(() -> {
                PrintManager pm=(PrintManager)getSystemService(Context.PRINT_SERVICE);
                pm.print("VOLGA-4007 Drift Report", web.createPrintDocumentAdapter("VOLGA-4007 Drift Report"), new PrintAttributes.Builder().build());
            });
        }
        @JavascriptInterface public void saveText(String filename,String text) {
            pendingBytes=text.getBytes(StandardCharsets.UTF_8); pendingMime="text/csv"; launchCreate(filename,pendingMime);
        }
        @JavascriptInterface public void saveBase64(String filename,String mime,String data) {
            int c=data.indexOf(','); String raw=c>=0?data.substring(c+1):data;
            pendingBytes=Base64.decode(raw,Base64.DEFAULT); pendingMime=mime; launchCreate(filename,mime);
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
