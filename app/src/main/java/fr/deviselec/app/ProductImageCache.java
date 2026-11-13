package fr.deviselec.app;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.security.MessageDigest;
import java.util.*;

final class ProductImageCache {
    private final File directory;
    ProductImageCache(File root) { directory = new File(root, "product-images"); directory.mkdirs(); }

    InputStream open(String address) throws Exception {
        if (address == null || address.length() > 4096) throw new IOException("Image invalide");
        URL url = new URL(address);
        if (!url.getProtocol().equals("https") || !url.getHost().equals("www.123elec.com") || !url.getPath().startsWith("/media/")) {
            throw new IOException("Source image invalide");
        }
        StringBuilder key = new StringBuilder();
        for (byte value : MessageDigest.getInstance("SHA-256").digest(address.getBytes(StandardCharsets.UTF_8))) key.append(String.format(Locale.ROOT, "%02x", value & 255));
        File cached = new File(directory, key.toString());
        if (cached.isFile()) { cached.setLastModified(System.currentTimeMillis()); return new FileInputStream(cached); }
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        try {
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(8000); connection.setReadTimeout(10000);
            if (connection.getResponseCode() != 200 || !String.valueOf(connection.getContentType()).startsWith("image/")) throw new IOException("Photo indisponible");
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            try (InputStream input = connection.getInputStream()) {
                byte[] buffer = new byte[8192]; int count;
                while ((count = input.read(buffer)) != -1) {
                    if (bytes.size() + count > 2_000_000) throw new IOException("Image trop volumineuse");
                    bytes.write(buffer, 0, count);
                }
            }
            File temporary = File.createTempFile("photo-", ".pending", directory);
            try {
                Files.write(temporary.toPath(), bytes.toByteArray());
                Files.move(temporary.toPath(), cached.toPath(), StandardCopyOption.REPLACE_EXISTING);
            } finally { temporary.delete(); }
            trim();
            return new ByteArrayInputStream(bytes.toByteArray());
        } finally { connection.disconnect(); }
    }

    private synchronized void trim() {
        File[] files = directory.listFiles(file -> !file.getName().endsWith(".pending"));
        if (files == null) return;
        Arrays.sort(files, Comparator.comparingLong(File::lastModified));
        long total = 0;
        for (File file : files) total += file.length();
        for (File file : files) {
            if (total <= 60_000_000) break;
            long size = file.length();
            if (file.delete()) total -= size;
        }
    }
}
