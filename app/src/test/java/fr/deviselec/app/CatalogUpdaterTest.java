package fr.deviselec.app;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.*;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import static org.junit.Assert.*;

public class CatalogUpdaterTest {
    private static final String BASE = "https://www.123elec.com/";
    private static final String SITEMAP = "<urlset xmlns='http://www.sitemaps.org/schemas/sitemap/0.9' xmlns:image='http://www.google.com/schemas/sitemap-image/1.1'>" +
        "<url><loc>" + BASE + "a.html</loc><image:image><image:title>LEGRAND Prise - REF-A</image:title></image:image></url>" +
        "<url><loc>" + BASE + "b.html</loc><image:image><image:title>WAGO Connecteur - REF-B</image:title></image:image></url></urlset>";

    private String original() throws Exception {
        JSONObject product = new JSONObject().put("id", "a").put("url", BASE + "a.html")
            .put("label", "Ancienne prise").put("ref", "REF-A").put("cost", 8).put("checked", "2020-01-01");
        return new JSONObject().put("products", new JSONArray().put(product)).put("total", 1).put("priced", 1).toString();
    }

    private String html(String reference, Object price) throws Exception {
        JSONObject offer = new JSONObject().put("url", BASE + reference + ".html").put("priceCurrency", "EUR").put("price", price);
        JSONObject product = new JSONObject().put("@type", "Product").put("name", "Produit " + reference)
            .put("offers", offer).put("brand", new JSONObject().put("name", "LEGRAND"));
        return "<script type='application/ld+json'>" + product + "</script>";
    }

    private void awaitFinished(CatalogUpdater updater) throws Exception {
        long deadline = System.currentTimeMillis() + 5000;
        while (new JSONObject(updater.status()).getBoolean("running") && System.currentTimeMillis() < deadline) Thread.sleep(10);
        assertFalse("Updater did not finish", new JSONObject(updater.status()).getBoolean("running"));
    }

    private String read(InputStream input) throws Exception {
        try (InputStream stream = input; ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[4096]; int count;
            while ((count = stream.read(buffer)) != -1) output.write(buffer, 0, count);
            return output.toString("UTF-8");
        }
    }

    @Test public void updatesPricesAddsReferencesAndPersistsForNextLaunch() throws Exception {
        File directory = Files.createTempDirectory("catalog-success").toFile();
        CatalogUpdater updater = new CatalogUpdater(directory, original(), url -> {
            if (url.endsWith("sitemap.xml")) return SITEMAP;
            if (url.endsWith("b.html")) return html("b", 6);
            return html("a", 12);
        });
        updater.start();
        awaitFinished(updater);
        JSONObject result = new JSONObject(read(updater.openCatalog()));
        assertEquals(2, result.getInt("total"));
        assertEquals(2, result.getInt("refreshed"));
        assertEquals(10, result.getJSONArray("products").getJSONObject(0).getDouble("cost"), 0.001);
        CatalogUpdater reopened = new CatalogUpdater(directory, original(), url -> { throw new IOException(); });
        assertEquals(result.toString(), new JSONObject(read(reopened.openCatalog())).toString());
    }

    @Test public void cancelledDownloadKeepsThePreviousSnapshot() throws Exception {
        File directory = Files.createTempDirectory("catalog-cancel").toFile();
        Files.write(new File(directory, "catalog-123elec.json").toPath(), original().getBytes(StandardCharsets.UTF_8));
        CountDownLatch started = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        CatalogUpdater updater = new CatalogUpdater(directory, original(), url -> {
            started.countDown();
            release.await(2, TimeUnit.SECONDS);
            return SITEMAP;
        });
        updater.start();
        assertTrue(started.await(2, TimeUnit.SECONDS));
        updater.cancel();
        release.countDown();
        awaitFinished(updater);
        assertEquals(original(), read(updater.openCatalog()));
        assertTrue(new JSONObject(updater.status()).getString("message").contains("annulée"));
    }

    @Test public void networkFailureKeepsPreviousDataAndAllowsRetry() throws Exception {
        File directory = Files.createTempDirectory("catalog-failure").toFile();
        CatalogUpdater updater = new CatalogUpdater(directory, original(), url -> { throw new IOException("Hors connexion"); });
        updater.start();
        awaitFinished(updater);
        assertEquals(original(), read(updater.openCatalog()));
        updater.start();
        awaitFinished(updater);
        assertEquals(original(), read(updater.openCatalog()));
        assertTrue(new JSONObject(updater.status()).getString("message").contains("impossible"));
    }

    @Test public void invalidAndConfigurableOffersDoNotOverwriteAnExistingPrice() throws Exception {
        Map<String, JSONObject> products = new LinkedHashMap<>();
        JSONObject original = new JSONObject(original()).getJSONArray("products").getJSONObject(0);
        products.put(BASE + "a.html", original);
        Set<String> refreshed = new HashSet<>();
        CatalogUpdater.applyProducts(products, CatalogUpdater.parseProducts(html("a", "unknown")), refreshed);
        CatalogUpdater.applyProducts(products, CatalogUpdater.parseProducts(html("a", 0)), refreshed);
        assertTrue(refreshed.isEmpty());
        assertEquals(8, original.getDouble("cost"), 0.001);
        assertEquals("2020-01-01", original.getString("checked"));
        String catalog = "<script type=\"application/ld+json\">{\"mainEntity\":{\"itemListElement\":[{\"@type\":\"Product\",\"name\":\"Test\"}]}}</script>";
        assertEquals(1, CatalogUpdater.parseProducts(catalog).size());
    }

    @Test public void unavailableProductPagesKeepTheirOldPriceWhileOtherPricesUpdate() throws Exception {
        File directory = Files.createTempDirectory("catalog-partial").toFile();
        JSONObject base = new JSONObject(original());
        for (int i = 0; i < 6; i++) base.getJSONArray("products").put(new JSONObject()
            .put("id", "removed-" + i).put("url", BASE + "removed-" + i + ".html")
            .put("cost", 7).put("checked", "2020-01-01"));
        CatalogUpdater updater = new CatalogUpdater(directory, base.toString(), url -> {
            if (url.endsWith("sitemap.xml")) return SITEMAP;
            if (url.contains("removed-")) throw new FileNotFoundException("404");
            return html(url.endsWith("b.html") ? "b" : "a", 12);
        });
        updater.start();
        awaitFinished(updater);
        JSONObject result = new JSONObject(read(updater.openCatalog()));
        assertEquals(6, result.getInt("failedPages"));
        assertEquals(2, result.getInt("refreshed"));
        assertEquals(7, result.getJSONArray("products").getJSONObject(1).getDouble("cost"), 0.001);
        assertEquals("2020-01-01", result.getJSONArray("products").getJSONObject(1).getString("checked"));
    }

    @Test public void sitemapKeepsProductPhotosForExistingAndNewReferences() throws Exception {
        Map<String, JSONObject> products = new LinkedHashMap<>();
        products.put(BASE + "a.html", new JSONObject().put("id", "existing"));
        String sitemap = SITEMAP.replace("<image:title>", "<image:loc>" + BASE + "media/photo.jpg</image:loc><image:title>");
        CatalogUpdater.readSitemap(sitemap, products);
        assertEquals(BASE + "media/photo.jpg", products.get(BASE + "a.html").getString("image"));
        assertEquals(BASE + "media/photo.jpg", products.get(BASE + "b.html").getString("image"));
    }
}
