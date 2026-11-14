package fr.deviselec.app;

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Collections;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;

/** Static resources shared with the preview and browser tests. */
final class AppAssets {
    static final class Resource {
        final String filename;
        final String mimeType;

        Resource(String filename, String mimeType) {
            this.filename = filename;
            this.mimeType = mimeType;
        }
    }

    private final Map<String, Resource> routes;

    AppAssets(String manifest) throws Exception {
        JSONObject source = new JSONObject(manifest);
        Map<String, Resource> resources = new HashMap<>();
        Iterator<String> paths = source.keys();
        while (paths.hasNext()) {
            String path = paths.next();
            JSONArray definition = source.getJSONArray(path);
            String filename = definition.getString(0);
            String mimeType = definition.getString(1);
            if (!path.matches("/[a-z0-9.-]*") || !filename.matches("[a-z0-9.-]+") ||
                    path.contains("..") || filename.contains("..")) {
                throw new IllegalArgumentException("Invalid packaged asset path");
            }
            resources.put(path, new Resource(filename, mimeType));
        }
        routes = Collections.unmodifiableMap(resources);
    }

    Resource find(String path) {
        return routes.get(path);
    }
}
