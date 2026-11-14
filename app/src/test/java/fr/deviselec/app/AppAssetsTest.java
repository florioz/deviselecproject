package fr.deviselec.app;

import org.junit.Test;
import static org.junit.Assert.*;

public class AppAssetsTest {
    @Test public void servesOnlyDeclaredStaticResources() throws Exception {
        AppAssets assets = new AppAssets("{\"/\":[\"index.html\",\"text/html\"],\"/kits.js\":[\"kits.js\",\"application/javascript\"]}");
        assertEquals("index.html", assets.find("/").filename);
        assertEquals("application/javascript", assets.find("/kits.js").mimeType);
        assertNull(assets.find("/undeclared.js"));
        assertNull(assets.find("/../app.js"));
        assertNull(assets.find(null));
    }

    @Test(expected = IllegalArgumentException.class)
    public void rejectsDirectoryTraversalInManifest() throws Exception {
        new AppAssets("{\"/app.js\":[\"../app.js\",\"application/javascript\"]}");
    }
}
