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
    private static CatalogUpdater catalogUpdater;
    private ValueCallback<Uri[]> logoCallback;
    private WebView web, printWeb;
    private ProductImageCache productImages;
    private String backup;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        productImages = new ProductImageCache(getCacheDir());
        if (catalogUpdater == null) {
            try (java.io.InputStream input = getAssets().open("catalog-123elec.json")) {
                java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream();
                byte[] buffer = new byte[16384];
                int count;
                while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
                catalogUpdater = new CatalogUpdater(getFilesDir(), output.toString("UTF-8"), null);
            } catch (Exception e) { throw new IllegalStateException("Catalogue embarqué inaccessible", e); }
        }
        web = new WebView(this);
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(true);
        web.addJavascriptInterface(new Bridge(), "Android");
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (logoCallback != null) logoCallback.onReceiveValue(null);
                logoCallback = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("image/*")
                    .addCategory(Intent.CATEGORY_OPENABLE)
                    .putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/png", "image/jpeg", "image/webp"});
                try { startActivityForResult(intent, 3); }
                catch (Exception error) {
                    logoCallback.onReceiveValue(null);
                    logoCallback = null;
                    Toast.makeText(MainActivity.this, "Aucun sélecteur d’images disponible", Toast.LENGTH_LONG).show();
                }
                return true;
            }
        });
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                if ("https".equals(req.getUrl().getScheme()) && "deviselec.local".equals(req.getUrl().getHost())) {
                    String path = req.getUrl().getPath();
                    try {
                        if ("/product-image".equals(path)) {
                            String url = req.getUrl().getQueryParameter("url");
                            String mime = url != null && url.toLowerCase(java.util.Locale.ROOT).contains(".png") ? "image/png" :
                                url != null && url.toLowerCase(java.util.Locale.ROOT).contains(".webp") ? "image/webp" : "image/jpeg";
                            return new WebResourceResponse(mime, null, productImages.open(url));
                        }
                        if (path != null && path.matches("/equipment-images/[a-z0-9-]+\\.(jpg|jpeg|png|webp)")) {
                            return new WebResourceResponse(path.endsWith(".png") ? "image/png" : "image/jpeg", null, getAssets().open(path.substring(1)));
                        }
                        if ("/catalog-123elec.json".equals(path)) {
                            return new WebResourceResponse("application/json", "UTF-8", catalogUpdater.openCatalog());
                        }
                        if ("/catalog-status.json".equals(path)) {
                            return new WebResourceResponse("application/json", "UTF-8", new java.io.ByteArrayInputStream(
                                catalogUpdater.status().getBytes(StandardCharsets.UTF_8)));
                        }
                    } catch (Exception error) { return new WebResourceResponse("text/plain", "UTF-8", null); }
                    String asset;
                    String mime;
                    switch (path) {
                        case "/": asset = "index.html"; mime = "text/html"; break;
                        case "/app.js": asset = "app.js"; mime = "application/javascript"; break;
                        case "/catalog.js": asset = "catalog.js"; mime = "application/javascript"; break;
                        case "/form-helpers.js": asset = "form-helpers.js"; mime = "application/javascript"; break;
                        case "/clients.js": asset = "clients.js"; mime = "application/javascript"; break;
                        case "/equipment.js": asset = "equipment.js"; mime = "application/javascript"; break;
                        case "/comparison.js": asset = "comparison.js"; mime = "application/javascript"; break;
                        case "/equipment-specs.json": asset = "equipment-specs.json"; mime = "application/json"; break;
                        case "/quote-flow.js": asset = "quote-flow.js"; mime = "application/javascript"; break;
                        case "/flow.css": asset = "flow.css"; mime = "text/css"; break;
                        case "/equipment-images.json": asset = "equipment-images.json"; mime = "application/json"; break;
                        case "/catalog-123elec.json": asset = "catalog-123elec.json"; mime = "application/json"; break;
                        default: return new WebResourceResponse("text/plain", "UTF-8", null);
                    }
                    try { return new WebResourceResponse(mime, "UTF-8", getAssets().open(asset)); }
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
        @JavascriptInterface public void updateCatalog() { catalogUpdater.start(); }
        @JavascriptInterface public void cancelCatalogUpdate() { catalogUpdater.cancel(); }
        @JavascriptInterface public void product(String url) {
            Uri uri = Uri.parse(url);
            if (!"https".equals(uri.getScheme()) || !"www.123elec.com".equals(uri.getHost())) return;
            runOnUiThread(() -> {
                try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
                catch (Exception e) { Toast.makeText(MainActivity.this, "Aucun navigateur disponible", Toast.LENGTH_SHORT).show(); }
            });
        }
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
        if (request == 3) {
            if (logoCallback != null) {
                Uri uri = result == RESULT_OK && data != null ? data.getData() : null;
                logoCallback.onReceiveValue(uri != null && "content".equals(uri.getScheme()) ? new Uri[]{uri} : null);
                logoCallback = null;
            }
            return;
        }
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
    @Override protected void onDestroy() {
        if (logoCallback != null) { logoCallback.onReceiveValue(null); logoCallback = null; }
        super.onDestroy();
    }
}
