package fr.deviselec.app;

import org.junit.Test;
import java.io.IOException;
import java.nio.file.Files;
import static org.junit.Assert.fail;

public class ProductImageCacheTest {
    @Test public void acceptsOnlySupplierMediaAddresses() throws Exception {
        ProductImageCache cache = new ProductImageCache(Files.createTempDirectory("product-photos").toFile());
        for (String address : new String[]{"file:///etc/passwd", "http://www.123elec.com/media/photo.jpg", "https://example.com/photo.jpg", "https://www.123elec.com/customer/account/"}) {
            try { cache.open(address); fail("Unexpected address accepted: " + address); }
            catch (IOException expected) { }
        }
    }
}
