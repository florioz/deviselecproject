package fr.deviselec.app;

import org.json.JSONArray;
import org.json.JSONObject;
import org.xml.sax.Attributes;
import org.xml.sax.InputSource;
import org.xml.sax.helpers.DefaultHandler;

import java.io.*;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.text.Normalizer;
import java.time.LocalDate;
import java.util.*;
import java.util.concurrent.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.GZIPInputStream;
import javax.xml.parsers.SAXParserFactory;

/** Updates the public supplier snapshot, committing only a completed usable file. */
public final class CatalogUpdater {
    interface PageSource { String read(String url) throws Exception; }
    private static final String BASE = "https://www.123elec.com/";
    private static final String[] CATEGORIES = {
        "gamme-materiel-electrique.html", "interrupteurs-et-prises.html",
        "cables-gaines-conduits.html", "boites-connecteurs.html",
        "coffrets-de-communication-vdi-tv.html", "eclairage-luminaire.html",
        "chauffage-climatisation-ecs.html", "vmc-hottes-aeration.html",
        "securite-acces.html", "equipement-electrique-outillage.html", "photovoltaique.html"
    };
    private static final Pattern JSON_SCRIPT = Pattern.compile(
        "<script\\b[^>]*\\btype=[\"']application/ld\\+json[\"'][^>]*>(.*?)</script>",
        Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    private static final Pattern PAGE_NUMBER = Pattern.compile("[?&](?:amp;)?p=(\\d+)");
    private final File snapshot;
    private final String bundled;
    private final PageSource source;
    private final ExecutorService coordinator = Executors.newSingleThreadExecutor();
    private final Set<HttpURLConnection> connections = ConcurrentHashMap.newKeySet();
    private volatile boolean cancelled;
    private volatile boolean running;
    private volatile String status = "{\"running\":false,\"message\":\"Prêt\"}";

    CatalogUpdater(File directory, String bundled, PageSource source) {
        this.snapshot = new File(directory, "catalog-123elec.json");
        this.bundled = bundled;
        this.source = source == null ? this::download : source;
    }

    public String status() { return status; }

    public synchronized void start() {
        if (running) return;
        running = true;
        cancelled = false;
        report("Lecture du catalogue 123elec…", 0, 0, 0, 0);
        coordinator.execute(this::update);
    }

    public void cancel() {
        cancelled = true;
        for (HttpURLConnection connection : connections) connection.disconnect();
    }

    public InputStream openCatalog() throws IOException {
        if (snapshot.isFile()) return new FileInputStream(snapshot);
        return new ByteArrayInputStream(bundled.getBytes(StandardCharsets.UTF_8));
    }

    private void report(String message, int done, int total, int updated, int failed) {
        try {
            status = new JSONObject().put("running", running).put("message", message)
                .put("done", done).put("total", total).put("updated", updated).put("failed", failed).toString();
        } catch (Exception ignored) { /* Values above are always JSON-compatible. */ }
    }

    private void checkCancellation() throws InterruptedException {
        if (cancelled || Thread.currentThread().isInterrupted()) throw new InterruptedException();
    }

    private void update() {
        int done = 0;
        int failed = 0;
        Set<String> refreshed = new HashSet<>();
        ExecutorService workers = Executors.newFixedThreadPool(2);
        try {
            JSONObject previous;
            try (InputStream input = openCatalog()) {
                previous = new JSONObject(readBounded(input, 20_000_000));
            } catch (Exception invalidCache) {
                previous = new JSONObject(bundled);
            }
            LinkedHashMap<String, JSONObject> products = new LinkedHashMap<>();
            JSONArray oldProducts = previous.getJSONArray("products");
            for (int i = 0; i < oldProducts.length(); i++) {
                JSONObject product = oldProducts.getJSONObject(i);
                products.put(product.getString("url"), product);
            }
            checkCancellation();
            readSitemap(source.read(BASE + "media/sitemap/sitemap.xml"), products);
            List<String> roots = new ArrayList<>();
            for (String category : CATEGORIES) roots.add(BASE + category);
            List<String> pages = new ArrayList<>();
            for (String root : roots) {
                checkCancellation();
                try {
                    String html = source.read(root);
                    applyProducts(products, parseProducts(html), refreshed);
                    int lastPage = 1;
                    Matcher matcher = PAGE_NUMBER.matcher(html);
                    while (matcher.find()) lastPage = Math.max(lastPage, Integer.parseInt(matcher.group(1)));
                    if (lastPage > 500) throw new IOException("Pagination invalide");
                    for (int i = 2; i <= lastPage; i++) pages.add(root + "?p=" + i);
                } catch (InterruptedException e) { throw e; }
                catch (Exception pageError) { failed++; }
                done++;
                report("Lecture des familles de produits…", done, roots.size() + pages.size(), refreshed.size(), failed);
                if (failed >= 3 && refreshed.isEmpty()) throw new IOException("123elec est inaccessible. Réessayez avec une connexion Internet.");
            }
            if (refreshed.isEmpty()) throw new IOException("Les pages 123elec ne contiennent aucun prix exploitable.");
            CompletionService<List<JSONObject>> queue = new ExecutorCompletionService<>(workers);
            int consecutiveFailures = 0;
            for (String page : pages) queue.submit(() -> { checkCancellation(); return parseProducts(source.read(page)); });
            for (int i = 0; i < pages.size(); i++) {
                checkCancellation();
                try { applyProducts(products, queue.take().get(), refreshed); consecutiveFailures = 0; }
                catch (ExecutionException pageError) { failed++; consecutiveFailures = isConnectionFailure(pageError) ? consecutiveFailures + 1 : 0; }
                if (consecutiveFailures >= 5) throw new IOException("Connexion à 123elec interrompue. Réessayez.");
                done++;
                report("Actualisation des prix par famille…", done, roots.size() + pages.size(), refreshed.size(), failed);
            }
            List<String> details = new ArrayList<>();
            for (String url : products.keySet()) if (!refreshed.contains(url)) details.add(url);
            int total = done + details.size();
            for (String url : details) queue.submit(() -> {
                checkCancellation();
                List<JSONObject> result = parseProducts(source.read(url));
                for (JSONObject product : result) {
                    JSONObject offer = product.optJSONObject("offers");
                    if (offer != null && !offer.has("url")) offer.put("url", url);
                }
                return result;
            });
            for (int i = 0; i < details.size(); i++) {
                checkCancellation();
                try { applyProducts(products, queue.take().get(), refreshed); consecutiveFailures = 0; }
                catch (ExecutionException pageError) { failed++; consecutiveFailures = isConnectionFailure(pageError) ? consecutiveFailures + 1 : 0; }
                if (consecutiveFailures >= 5) throw new IOException("Connexion à 123elec interrompue. Réessayez.");
                done++;
                report("Vérification des fiches complémentaires…", done, total, refreshed.size(), failed);
            }
            checkCancellation();
            if (refreshed.isEmpty()) throw new IOException("Aucun prix récupéré. Réessayez avec une connexion Internet.");
            JSONArray output = new JSONArray();
            int priced = 0;
            for (JSONObject product : products.values()) {
                output.put(product);
                if (!product.isNull("cost")) priced++;
            }
            JSONObject result = new JSONObject().put("source", BASE).put("observedAt", LocalDate.now().toString())
                .put("products", output).put("total", output.length()).put("priced", priced)
                .put("purchaseVat", 20).put("refreshed", refreshed.size()).put("failedPages", failed);
            File pending = new File(snapshot.getParentFile(), "catalog-123elec.pending");
            try (FileOutputStream file = new FileOutputStream(pending)) {
                file.write(result.toString().getBytes(StandardCharsets.UTF_8));
                file.getFD().sync();
            }
            checkCancellation();
            Files.move(pending.toPath(), snapshot.toPath(), StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
            running = false;
            report("Catalogue enregistré. " + refreshed.size() + " prix actualisés." +
                (failed > 0 ? " " + failed + " page(s) non actualisée(s), anciens prix conservés avec leur date." : ""),
                done, done, refreshed.size(), failed);
        } catch (InterruptedException cancelledUpdate) {
            running = false;
            report("Actualisation annulée. Le catalogue précédent reste disponible.", done, done, 0, failed);
        } catch (Exception error) {
            running = false;
            report("Actualisation impossible. Le catalogue précédent reste disponible. " +
                (error.getMessage() == null ? "Vérifiez votre connexion et réessayez." : error.getMessage()), done, done, 0, failed);
        } finally {
            workers.shutdownNow();
        }
    }

    static List<JSONObject> parseProducts(String html) throws Exception {
        List<JSONObject> products = new ArrayList<>();
        Matcher scripts = JSON_SCRIPT.matcher(html);
        while (scripts.find()) {
            JSONObject data;
            try { data = new JSONObject(scripts.group(1)); }
            catch (Exception invalidScript) { continue; }
            if ("Product".equals(data.optString("@type"))) products.add(data);
            JSONObject main = data.optJSONObject("mainEntity");
            JSONArray items = main == null ? null : main.optJSONArray("itemListElement");
            if (items != null) for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.optJSONObject(i);
                if (item != null && "Product".equals(item.optString("@type"))) products.add(item);
            }
        }
        return products;
    }

    static void applyProducts(Map<String, JSONObject> products, List<JSONObject> offers, Set<String> refreshed) throws Exception {
        for (JSONObject data : offers) {
            JSONObject offer = data.optJSONObject("offers");
            if (offer == null) continue;
            String url = offer.optString("url");
            if (!products.containsKey(url) || !"EUR".equals(offer.optString("priceCurrency"))) continue;
            BigDecimal price;
            try { price = new BigDecimal(offer.get("price").toString()); }
            catch (Exception invalidPrice) { continue; }
            if (price.signum() <= 0) continue;
            JSONObject product = products.get(url);
            product.put("sourceTtc", price).put("cost", price.divide(new BigDecimal("1.20"), 2, RoundingMode.HALF_UP))
                .put("checked", LocalDate.now().toString()).put("sku", data.optString("sku", product.optString("sku")));
            if (data.has("name")) product.put("label", data.getString("name"));
            Object brand = data.opt("brand");
            if (brand instanceof String) product.put("brand", brand);
            if (brand instanceof JSONObject) product.put("brand", ((JSONObject) brand).optString("name", product.optString("brand")));
            if (data.has("mpn")) product.put("ref", data.optString("mpn"));
            if (data.has("gtin13")) product.put("ean", data.optString("gtin13"));
            String availability = offer.optString("availability", "unknown");
            product.put("availability", availability.substring(availability.lastIndexOf('/') + 1));
            refreshed.add(url);
        }
    }

    static void readSitemap(String xml, Map<String, JSONObject> products) throws Exception {
        if (xml.contains("<!DOCTYPE")) throw new IOException("Plan du site invalide");
        SAXParserFactory factory = SAXParserFactory.newInstance();
        factory.setNamespaceAware(true);
        factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
        factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        factory.newSAXParser().parse(new InputSource(new StringReader(xml)), new DefaultHandler() {
            String url = "", title = "", imageUrl = "", target = "";
            boolean image;
            StringBuilder text = new StringBuilder();
            @Override public void startElement(String uri, String local, String qualified, Attributes attributes) {
                if (local.equals("url")) { url = ""; title = ""; imageUrl = ""; }
                if (local.equals("image")) image = true;
                if (local.equals("loc") && !image) { target = "url"; text.setLength(0); }
                if (local.equals("loc") && image && imageUrl.isEmpty()) { target = "imageUrl"; text.setLength(0); }
                if (local.equals("title") && image && title.isEmpty()) { target = "title"; text.setLength(0); }
            }
            @Override public void characters(char[] chars, int start, int length) { if (!target.isEmpty()) text.append(chars, start, length); }
            @Override public void endElement(String uri, String local, String qualified) {
                if (local.equals("loc") && target.equals("url")) { url = text.toString().trim(); target = ""; }
                if (local.equals("loc") && target.equals("imageUrl")) { imageUrl = text.toString().trim(); target = ""; }
                if (local.equals("title") && target.equals("title")) { title = text.toString().trim(); target = ""; }
                if (local.equals("image")) image = false;
                if (local.equals("url") && url.startsWith(BASE) && !title.isEmpty()) {
                    try {
                        if (!products.containsKey(url)) products.put(url, newProduct(url, title));
                        if (imageUrl.startsWith(BASE + "media/")) products.get(url).put("image", imageUrl);
                    }
                    catch (Exception invalidProduct) { throw new IllegalArgumentException(invalidProduct); }
                }
            }
        });
    }

    private static JSONObject newProduct(String url, String label) throws Exception {
        byte[] hash = MessageDigest.getInstance("SHA-1").digest(url.getBytes(StandardCharsets.UTF_8));
        StringBuilder id = new StringBuilder("123-");
        for (int i = 0; i < 8; i++) id.append(String.format(Locale.ROOT, "%02x", hash[i] & 255));
        String reference = label.contains(" - ") ? label.substring(label.lastIndexOf(" - ") + 3) : "";
        if (reference.length() > 45 || reference.contains(" ")) reference = "";
        String text = Normalizer.normalize(label.toLowerCase(Locale.ROOT), Normalizer.Form.NFD).replaceAll("\\p{M}", "");
        String[][] families = {
            {"Solaire et recharge", "photovolt|solaire|micro.onduleur|borne.*recharge"},
            {"Ventilation", "vmc|ventilation|extracteur|aerateur"},
            {"Chauffage et eau chaude", "chauff|radiateur|thermostat|climat|seche.serviette"},
            {"Éclairage", "\\bled\\b|luminaire|ampoule|projecteur|spot|douille|dcl"},
            {"Communication et réseau", "rj45|coaxial|communication|ethernet|brassage|reseau|fibre"},
            {"Sécurité et accès", "alarme|interphone|visiophone|camera|detecteur.*fumee"},
            {"Protection et tableaux", "disjonct|differentiel|tableau|coffret|parafoudre|peigne|contacteur|telerupteur|gtl"},
            {"Appareillage", "prise|interrupteur|plaque|poussoir|variateur|dooxie|celiane|mosaic|odace"},
            {"Câbles et conduits", "cable|\\bfil\\b|gaine|icta|goulotte|moulure|tube|irl|collier"},
            {"Boîtes et connexions", "boite|wago|borne|connecteur|derivation|encastrement"}
        };
        String category = "Outillage et accessoires";
        for (String[] family : families) if (Pattern.compile(family[1]).matcher(text).find()) { category = family[0]; break; }
        return new JSONObject().put("id", id.toString()).put("label", label).put("ref", reference)
            .put("sku", "").put("brand", "À préciser").put("category", category).put("url", url)
            .put("kind", "material").put("unit", "u").put("cost", JSONObject.NULL)
            .put("sourceTtc", JSONObject.NULL).put("checked", "").put("availability", "unknown");
    }

    private String download(String address) throws Exception {
        checkCancellation();
        URL url = new URL(address);
        if (!url.getProtocol().equals("https") || !url.getHost().equals("www.123elec.com")) throw new IOException("Adresse fournisseur invalide");
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connections.add(connection);
        try {
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(15000);
            connection.setReadTimeout(30000);
            connection.setRequestProperty("User-Agent", "Deviselec-Catalog/0.3 (public catalog snapshot)");
            connection.setRequestProperty("Accept-Encoding", "gzip");
            int code = connection.getResponseCode();
            if (code == 403 || code == 429 || code >= 500) throw new SupplierUnavailableException("123elec répond " + code);
            if (code != 200) throw new IOException("123elec répond " + code);
            try (InputStream raw = connection.getInputStream();
                 InputStream input = "gzip".equalsIgnoreCase(connection.getContentEncoding()) ? new GZIPInputStream(raw) : raw) {
                String result = readBounded(input, 30_000_000);
                Thread.sleep(150);
                return result;
            }
        } finally {
            connections.remove(connection);
            connection.disconnect();
        }
    }

    private static final class SupplierUnavailableException extends IOException {
        SupplierUnavailableException(String message) { super(message); }
    }

    private static boolean isConnectionFailure(Throwable error) {
        while (error != null) {
            if (error instanceof java.net.UnknownHostException || error instanceof java.net.SocketException ||
                error instanceof java.net.SocketTimeoutException || error instanceof javax.net.ssl.SSLException ||
                error instanceof SupplierUnavailableException) return true;
            error = error.getCause();
        }
        return false;
    }

    private String readBounded(InputStream input, int maximum) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        byte[] buffer = new byte[16384];
        int count;
        while ((count = input.read(buffer)) != -1) {
            checkCancellation();
            if (output.size() + count > maximum) throw new IOException("Réponse fournisseur trop volumineuse");
            output.write(buffer, 0, count);
        }
        return output.toString("UTF-8");
    }
}
