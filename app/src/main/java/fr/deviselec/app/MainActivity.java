package fr.deviselec.app;

import android.app.Activity;
import android.os.Bundle;
import android.webkit.*;
import android.print.*;
import android.content.Intent;
import android.net.Uri;
import android.widget.Toast;
import java.nio.charset.StandardCharsets;

public class MainActivity extends Activity {
    private WebView web, printWeb;
    private String backup;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.addJavascriptInterface(new Bridge(), "Android");
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                if (req.getUrl().toString().equals("https://deviselec.local/")) {
                    try { return new WebResourceResponse("text/html", "UTF-8", getAssets().open("index.html")); }
                    catch (Exception e) { return new WebResourceResponse("text/plain", "UTF-8", null); }
                }
                return new WebResourceResponse("text/plain", "UTF-8", null);
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) { return true; }
        });
        android.widget.FrameLayout root = new android.widget.FrameLayout(this);
        root.addView(web);
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets.consumeSystemWindowInsets();
        });
        setContentView(root);
        web.loadUrl("https://deviselec.local/");
    }
    class Bridge {
        @JavascriptInterface public void pdf(String html, String name) { runOnUiThread(() -> {
            if (printWeb != null) printWeb.destroy();
            printWeb = new WebView(MainActivity.this);
            printWeb.setWebViewClient(new WebViewClient() {
                @Override public void onPageFinished(WebView view, String url) {
                    PrintManager pm = (PrintManager)getSystemService(PRINT_SERVICE);
                    pm.print(name, view.createPrintDocumentAdapter(name), new PrintAttributes.Builder()
                        .setMediaSize(PrintAttributes.MediaSize.ISO_A4).setColorMode(PrintAttributes.COLOR_MODE_COLOR)
                        .setMinMargins(new PrintAttributes.Margins(400,400,400,400)).build());
                }
            });
            printWeb.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
        }); }
        @JavascriptInterface public void backup(String data) { backup = data; runOnUiThread(() -> {
            Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/json")
                .addCategory(Intent.CATEGORY_OPENABLE).putExtra(Intent.EXTRA_TITLE,"deviselec-sauvegarde.json");
            startActivityForResult(i, 1);
        }); }
        @JavascriptInterface public void restore() { runOnUiThread(() -> startActivityForResult(
            new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("application/json").addCategory(Intent.CATEGORY_OPENABLE), 2)); }
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (result != RESULT_OK || data == null) return;
        try {
            Uri uri = data.getData();
            if (request == 1) {
                try (java.io.OutputStream out = getContentResolver().openOutputStream(uri)) { out.write(backup.getBytes(StandardCharsets.UTF_8)); }
                Toast.makeText(this,"Sauvegarde exportée",Toast.LENGTH_SHORT).show();
            } else if (request == 2) {
                try (java.io.InputStream in = getContentResolver().openInputStream(uri)) {
                    java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
                    byte[] buf = new byte[8192]; int n;
                    while ((n = in.read(buf)) != -1) { bytes.write(buf,0,n); if(bytes.size()>10000000) throw new Exception("Fichier trop volumineux"); }
                    web.evaluateJavascript("restoreData(" + org.json.JSONObject.quote(bytes.toString("UTF-8")) + ")", null);
                }
            }
        } catch(Exception e) { Toast.makeText(this,"Impossible de traiter le fichier",Toast.LENGTH_LONG).show(); }
    }
}
