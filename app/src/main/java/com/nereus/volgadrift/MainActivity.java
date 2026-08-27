package com.nereus.volgadrift;

import android.Manifest;
import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.os.Bundle;
import android.os.Build;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.provider.Settings;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.JavascriptInterface;
import android.view.Window;
import android.view.WindowInsets;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.graphics.Color;
import android.graphics.Insets;
import android.content.Context;
import android.content.Intent;
import android.content.ClipboardManager;
import android.content.ClipData;
import android.net.Uri;
import android.util.Base64;
import android.print.PrintManager;
import android.print.PrintDocumentAdapter;
import org.json.JSONTokener;
import java.io.OutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private WebView web;
    private FrameLayout root;
    private byte[] pendingBytes;
    private String pendingMime="application/octet-stream";
    private int pendingNotificationId=0;
    private String pendingNotificationState=null;
    private String pendingNotificationText=null;
    private static final int CREATE_FILE=701;
    private static final int NOTIFICATION_PERMISSION=912;
    private static final int CMEMS_NOTIFICATION_ID=4101;
    private static final int VESSEL_NOTIFICATION_ID=4102;
    private static final int TEST_NOTIFICATION_ID=4199;
    private static final String CMEMS_CHANNEL="cmems_updates";
    private static final String ASSET_HOST="appassets.androidplatform.net";
    private static final String PREFS="marine_drift_private";

    @Override public void onCreate(Bundle b) {
        super.onCreate(b);
        Window w=getWindow();
        w.setStatusBarColor(Color.rgb(6,31,51));
        w.setNavigationBarColor(Color.rgb(6,31,51));
        createNotificationChannel();

        root=new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(6,31,51));
        web=new WebView(this);
        FrameLayout.LayoutParams lp=new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,ViewGroup.LayoutParams.MATCH_PARENT);
        root.addView(web,lp);
        setContentView(root);
        applySystemBarInsets();
        root.postDelayed(this::requestNotificationPermissionIfNeeded,500);

        WebSettings s=web.getSettings();
        s.setJavaScriptEnabled(true); s.setDomStorageEnabled(true); s.setAllowFileAccess(true); s.setAllowContentAccess(true);
        s.setBuiltInZoomControls(false); s.setDisplayZoomControls(false); s.setLoadWithOverviewMode(true); s.setUseWideViewPort(true);
        s.setUserAgentString(s.getUserAgentString()+" MarineDrift-NEREUS/1.7.0 (+https://github.com/Peter1993-NEREUS/VOLGA-4007-Drift-Model)");
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
                String js="(function(){var a=['v141.js','v150.js','v151.js','v152.js','v160.js','v161.js','v162.js','v163.js','v164.js','v165.js','v166.js','v167.js','v168.js','v169.js','v170.js','v171.js'];function n(i){if(i>=a.length)return;var id='enh'+i;if(document.getElementById(id)){n(i+1);return;}var s=document.createElement('script');s.id=id;s.src=a[i];s.onload=function(){n(i+1)};document.body.appendChild(s);}n(0);})();";
                view.evaluateJavascript(js,null);
            }
        });
        web.addJavascriptInterface(new Bridge(), "Android");
        web.loadUrl("https://"+ASSET_HOST+"/assets/index.html");
    }

    @Override public void onConfigurationChanged(Configuration newConfig){
        super.onConfigurationChanged(newConfig);
        if(root!=null){
            root.requestLayout();
            root.requestApplyInsets();
        }
        if(web!=null){
            web.requestLayout();
            web.invalidate();
        }
    }

    private void createNotificationChannel(){
        if(Build.VERSION.SDK_INT>=26){
            NotificationChannel ch=new NotificationChannel(CMEMS_CHANNEL,"Marine Drift Model updates",NotificationManager.IMPORTANCE_DEFAULT);
            ch.setDescription("CMEMS data, vessel lookup and system check status");
            NotificationManager nm=(NotificationManager)getSystemService(Context.NOTIFICATION_SERVICE);
            if(nm!=null)nm.createNotificationChannel(ch);
        }
    }

    private void requestNotificationPermissionIfNeeded(){
        if(Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED){
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},NOTIFICATION_PERMISSION);
        }
    }

    private boolean notificationAllowed(){
        if(Build.VERSION.SDK_INT<33)return true;
        return checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED;
    }

    private String notificationStatus(){
        if(Build.VERSION.SDK_INT>=33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return "permission_required";
        NotificationManager nm=(NotificationManager)getSystemService(Context.NOTIFICATION_SERVICE);
        if(nm==null)return "unknown";
        if(!nm.areNotificationsEnabled())return "blocked";
        if(Build.VERSION.SDK_INT>=26){
            NotificationChannel ch=nm.getNotificationChannel(CMEMS_CHANNEL);
            if(ch!=null && ch.getImportance()==NotificationManager.IMPORTANCE_NONE)return "channel_blocked";
        }
        return "allowed";
    }

    private void showModelNotification(int id,String state,String text,String progressTitle,String successTitle,String errorTitle){
        String st=state==null?"progress":state.toLowerCase();
        if(!notificationAllowed()){
            pendingNotificationId=id;
            pendingNotificationState=st;
            pendingNotificationText=text;
            requestNotificationPermissionIfNeeded();
            return;
        }
        NotificationManager nm=(NotificationManager)getSystemService(Context.NOTIFICATION_SERVICE);
        if(nm==null||!nm.areNotificationsEnabled())return;
        String title; boolean active;
        if("success".equals(st)){title=successTitle;active=false;}
        else if("error".equals(st)){title=errorTitle;active=false;}
        else {title=progressTitle;active=true;}
        Intent open=new Intent(this,MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi=PendingIntent.getActivity(this,id,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder b=Build.VERSION.SDK_INT>=26?new Notification.Builder(this,CMEMS_CHANNEL):new Notification.Builder(this);
        String body=text==null||text.trim().isEmpty()?title:text;
        b.setSmallIcon(R.drawable.ic_notification).setContentTitle(title).setContentText(body)
         .setStyle(new Notification.BigTextStyle().bigText(body)).setContentIntent(pi)
         .setOnlyAlertOnce(active).setOngoing(active).setAutoCancel(!active).setShowWhen(true).setWhen(System.currentTimeMillis());
        if(active)b.setProgress(0,0,true);else b.setProgress(0,0,false);
        nm.notify(id,b.build());
    }

    private void showCmemsNotification(String state,String text){
        showModelNotification(CMEMS_NOTIFICATION_ID,state,text,"CMEMS data update","CMEMS data ready","CMEMS update failed");
    }
    private void showVesselNotification(String state,String text){
        showModelNotification(VESSEL_NOTIFICATION_ID,state,text,"Vessel lookup","Vessel data ready","Vessel lookup failed");
    }
    private void showTestNotification(){
        showModelNotification(TEST_NOTIFICATION_ID,"success","Native notification bridge is working.","System check","Marine Drift Model • test notification","System check failed");
    }

    @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] grantResults){
        super.onRequestPermissionsResult(requestCode,permissions,grantResults);
        if(requestCode==NOTIFICATION_PERMISSION && grantResults.length>0 && grantResults[0]==PackageManager.PERMISSION_GRANTED){
            int id=pendingNotificationId;
            String state=pendingNotificationState;
            String text=pendingNotificationText;
            pendingNotificationId=0;
            pendingNotificationState=null;
            pendingNotificationText=null;
            if(id==CMEMS_NOTIFICATION_ID)showCmemsNotification(state,text);
            else if(id==VESSEL_NOTIFICATION_ID)showVesselNotification(state,text);
            else if(id==TEST_NOTIFICATION_ID)showTestNotification();
        }
        if(web!=null)web.evaluateJavascript("window.dispatchEvent(new Event('focus'));",null);
    }

    private void openNotificationSettings(){
        try{
            Intent i;
            if(Build.VERSION.SDK_INT>=26){
                i=new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS);
                i.putExtra(Settings.EXTRA_APP_PACKAGE,getPackageName());
                i.putExtra(Settings.EXTRA_CHANNEL_ID,CMEMS_CHANNEL);
            }else{
                i=new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
                i.putExtra(Settings.EXTRA_APP_PACKAGE,getPackageName());
            }
            startActivity(i);
        }catch(Exception ignored){
            try{Intent i=new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+getPackageName()));startActivity(i);}catch(Exception ignored2){}
        }
    }

    private void applySystemBarInsets(){
        root.setOnApplyWindowInsetsListener((v,insets)->{
            int left,top,right,bottom;
            if(Build.VERSION.SDK_INT>=30){
                Insets bars=insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                left=bars.left; top=bars.top; right=bars.right; bottom=bars.bottom;
            } else {
                left=insets.getSystemWindowInsetLeft(); top=insets.getSystemWindowInsetTop(); right=insets.getSystemWindowInsetRight(); bottom=insets.getSystemWindowInsetBottom();
            }
            FrameLayout.LayoutParams lp=(FrameLayout.LayoutParams)web.getLayoutParams();
            lp.leftMargin=left;lp.topMargin=top;lp.rightMargin=right;lp.bottomMargin=bottom;web.setLayoutParams(lp);return insets;
        });
        root.requestApplyInsets();
    }

    private String mime(String p){
        String q=p.toLowerCase();
        if(q.endsWith(".html")) return "text/html"; if(q.endsWith(".js")) return "application/javascript";
        if(q.endsWith(".css")) return "text/css"; if(q.endsWith(".json")) return "application/json";
        if(q.endsWith(".png")) return "image/png"; if(q.endsWith(".svg")) return "image/svg+xml";
        if(q.endsWith(".bin")) return "application/octet-stream"; return "application/octet-stream";
    }

    public class Bridge {
        @JavascriptInterface public void printPdf() { runOnUiThread(() -> printReport()); }
        @JavascriptInterface public void notifyCmems(String state,String text) { runOnUiThread(() -> showCmemsNotification(state,text)); }
        @JavascriptInterface public void notifyVessel(String state,String text) { runOnUiThread(() -> showVesselNotification(state,text)); }
        @JavascriptInterface public String getNotificationStatus() { return notificationStatus(); }
        @JavascriptInterface public void sendTestNotification() { runOnUiThread(() -> showTestNotification()); }
        @JavascriptInterface public void openNotificationSettings() { runOnUiThread(() -> MainActivity.this.openNotificationSettings()); }
        @JavascriptInterface public void setClipboardText(String text) { runOnUiThread(() -> { try{ClipboardManager cm=(ClipboardManager)getSystemService(Context.CLIPBOARD_SERVICE);if(cm!=null)cm.setPrimaryClip(ClipData.newPlainText("Marine Drift Model",text==null?"":text));}catch(Exception ignored){} }); }
        @JavascriptInterface public void saveText(String filename,String text) { pendingBytes=text.getBytes(StandardCharsets.UTF_8); pendingMime="text/csv"; launchCreate(filename,pendingMime); }
        @JavascriptInterface public void saveBase64(String filename,String mime,String data) { int c=data.indexOf(','); String raw=c>=0?data.substring(c+1):data; pendingBytes=Base64.decode(raw,Base64.DEFAULT); pendingMime=mime; launchCreate(filename,mime); }
        @JavascriptInterface public String getClipboardText() { try {ClipboardManager cm=(ClipboardManager)getSystemService(Context.CLIPBOARD_SERVICE);if(cm!=null && cm.hasPrimaryClip()){ClipData cd=cm.getPrimaryClip();if(cd!=null && cd.getItemCount()>0){CharSequence cs=cd.getItemAt(0).coerceToText(MainActivity.this);return cs==null?"":cs.toString();}}} catch(Exception ignored){} return ""; }
        @JavascriptInterface public String getGithubToken() { return getSharedPreferences(PREFS,Context.MODE_PRIVATE).getString("gh_token",""); }
        @JavascriptInterface public void saveGithubToken(String token) { getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().putString("gh_token",token==null?"":token.trim()).apply(); }
        @JavascriptInterface public void clearGithubToken() { getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().remove("gh_token").apply(); }
        private void launchCreate(String filename,String mime){runOnUiThread(() -> {Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT);i.addCategory(Intent.CATEGORY_OPENABLE);i.setType(mime);i.putExtra(Intent.EXTRA_TITLE,filename);startActivityForResult(i,CREATE_FILE);});}
    }

    private String jsString(String raw){
        try{Object o=new JSONTokener(raw==null?"null":raw).nextValue();if(o instanceof String && !((String)o).trim().isEmpty())return (String)o;}catch(Exception ignored){}
        return "Marine Drift Model by NEREUS";
    }

    private void printReport(){
        try{
            web.evaluateJavascript("(window.nereusPrintJobName?window.nereusPrintJobName():'Marine Drift Model by NEREUS')",raw->{
                final String job=jsString(raw);
                web.evaluateJavascript("document.body.classList.add('pdfExport');window.scrollTo(0,0);",v -> web.postDelayed(() -> {
                    try{PrintManager pm=(PrintManager)getSystemService(Context.PRINT_SERVICE);PrintDocumentAdapter adapter=web.createPrintDocumentAdapter(job);if(pm!=null)pm.print(job,adapter,null);}catch(Exception ignored){}
                    web.postDelayed(() -> web.evaluateJavascript("document.body.classList.remove('pdfExport');",null),1200);
                },250));
            });
        }catch(Exception ignored){}
    }

    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data){
        super.onActivityResult(requestCode,resultCode,data);if(resultCode!=RESULT_OK||data==null)return;Uri uri=data.getData();if(uri==null)return;
        if(requestCode==CREATE_FILE && pendingBytes!=null){try(OutputStream os=getContentResolver().openOutputStream(uri)){os.write(pendingBytes);os.flush();}catch(Exception ignored){}pendingBytes=null;}
    }
    @Override public void onBackPressed(){ if(web!=null && web.canGoBack()) web.goBack(); else super.onBackPressed(); }
}