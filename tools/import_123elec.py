"""Build the bundled catalog from public 123elec sitemap and category pages.

Install beautifulsoup4, then run `py tools/import_123elec.py`.
Requests are cached in tmp/123elec and limited to two simultaneous downloads.
Only product identification and public offer data are retained.
"""

import concurrent.futures
import datetime
import hashlib
import json
import pathlib
import re
import sys
import time
import unicodedata
import urllib.request
import xml.etree.ElementTree as ET
from decimal import Decimal, ROUND_HALF_UP
from bs4 import BeautifulSoup


ROOT = pathlib.Path(__file__).resolve().parents[1]
CACHE = ROOT / "tmp" / "123elec"
CACHE.mkdir(parents=True, exist_ok=True)
BASE = "https://www.123elec.com/"
DATE = datetime.datetime.now(datetime.timezone.utc).date().isoformat()
NAMESPACES = {
    "s": "http://www.sitemaps.org/schemas/sitemap/0.9",
    "i": "http://www.google.com/schemas/sitemap-image/1.1",
}


def download(url):
    file = CACHE / (hashlib.sha256(url.encode()).hexdigest() + ".html")
    if file.exists() and datetime.datetime.fromtimestamp(file.stat().st_mtime, datetime.timezone.utc).date().isoformat() == DATE:
        return file.read_text(encoding="utf-8")
    request = urllib.request.Request(url, headers={"User-Agent": "Deviselec-Catalog/0.2 (public catalog snapshot)"})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(request, timeout=35) as response:
                result = response.read().decode("utf-8")
            file.write_text(result, encoding="utf-8")
            time.sleep(0.35)
            return result
        except Exception:
            if attempt == 2:
                raise
            time.sleep(2 + attempt * 2)


def normalize(text):
    return "".join(c for c in unicodedata.normalize("NFKD", text.lower()) if not unicodedata.combining(c))


def infer_category(label):
    text = normalize(label)
    rules = [
        ("Solaire et recharge", r"photovolt|solaire|micro.onduleur|borne.*recharge|panneau.*wc"),
        ("Ventilation", r"\bvmc\b|ventilation|extracteur|aerateur|gaine.*ventil"),
        ("Chauffage et eau chaude", r"chauff|radiateur|thermostat|climat|seche.serviette"),
        ("Éclairage", r"\bled\b|luminaire|ampoule|projecteur|spot|douille|dcl|hublot"),
        ("Communication et réseau", r"rj45|coaxial|communication|ethernet|brassage|reseau|\btv\b|fibre"),
        ("Sécurité et accès", r"alarme|interphone|visiophone|camera|detecteur.*fumee|serrure"),
        ("Protection et tableaux", r"disjonct|differentiel|tableau|coffret|parafoudre|peigne|contacteur|telerupteur|\bgtl\b"),
        ("Appareillage", r"prise|interrupteur|plaque|poussoir|obturateur|variateur|dooxie|celiane|mosaic|odace|niloe"),
        ("Câbles et conduits", r"cable|\bfil\b|gaine|icta|goulotte|moulure|tube|irl|collier"),
        ("Boîtes et connexions", r"boite|wago|borne|connecteur|derivation|encastrement"),
    ]
    return next((category for category, pattern in rules if re.search(pattern, text)), "Outillage et accessoires")


def sitemap_products(sitemap):
    products = {}
    categories = []
    for entry in sitemap:
        url = entry.findtext("s:loc", namespaces=NAMESPACES)
        image = entry.find("i:image", NAMESPACES)
        if image is None:
            categories.append(url)
            continue
        label = image.findtext("i:title", namespaces=NAMESPACES)
        if not label:
            continue
        reference = label.rsplit(" - ", 1)[-1] if " - " in label else ""
        if len(reference) > 45 or " " in reference:
            reference = ""
        brand_match = re.match(r"^([A-ZÀ-Ý0-9][A-ZÀ-Ý0-9 '&+.-]*)(?= [A-ZÀ-Ý]?[a-zà-ÿ])", label)
        brand = brand_match.group(1).strip() if brand_match else label.split()[0]
        products[url] = {
            "id": "123-" + hashlib.sha1(url.encode()).hexdigest()[:16],
            "label": label,
            "ref": reference,
            "sku": "",
            "brand": brand,
            "category": infer_category(label),
            "url": url,
            "kind": "material",
            "unit": "u",
            "cost": None,
            "sourceTtc": None,
            "checked": "",
            "availability": "unknown",
        }
    return products, categories


def category_page(url):
    soup = BeautifulSoup(download(url), "html.parser")
    products = []
    for script in soup.select('script[type="application/ld+json"]'):
        try:
            data = json.loads(script.string or script.get_text())
            main = data.get("mainEntity", {})
            products.extend(main.get("itemListElement", []))
        except (ValueError, AttributeError):
            continue
    pages = [int(value) for value in re.findall(r"[?&]p=(\d+)", str(soup))]
    return products, max(pages, default=1)


def apply_offers(products, offers):
    for offer_product in offers:
        offer = offer_product.get("offers", {})
        if not isinstance(offer, dict):
            continue
        url = offer.get("url")
        if url not in products:
            continue
        product = products[url]
        product["sku"] = offer_product.get("sku", "")
        if offer_product.get("mpn"):
            product["ref"] = str(offer_product["mpn"])
        brand = offer_product.get("brand", product["brand"])
        product["brand"] = brand.get("name", "") if isinstance(brand, dict) else brand
        product["label"] = offer_product.get("name", product["label"])
        product["ean"] = offer_product.get("gtin13", "")
        # A numeric, positive public EUR offer is required. Unknown prices stay null.
        try:
            price = Decimal(str(offer["price"]))
            if offer.get("priceCurrency") != "EUR" or not price.is_finite() or price <= 0:
                continue
        except (KeyError, ValueError, ArithmeticError):
            continue
        product["sourceTtc"] = float(price)
        product["cost"] = float((price / Decimal("1.20")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))
        product["checked"] = DATE
        product["availability"] = offer.get("availability", "unknown").split("/")[-1]


def write_catalog(products, failures, page_count):
    output = {
        "source": BASE,
        "sitemap": BASE + "media/sitemap/sitemap.xml",
        "observedAt": DATE,
        "purchaseVat": 20,
        "priceBasis": "Public EUR TTC offers, converted to HT at 20%, excluding shipping. Verify before use.",
        "categoryMethod": "Product name classification",
        "pagesRead": page_count,
        "failures": failures,
        "products": sorted(products.values(), key=lambda p: normalize(p["label"])),
    }
    output["total"] = len(output["products"])
    output["priced"] = sum(p["cost"] is not None for p in output["products"])
    target = ROOT / "app/src/main/assets/catalog-123elec.json"
    temporary = target.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    temporary.replace(target)
    print(f"CATALOG {output['total']} products / {output['priced']} with prices / {len(failures)} failed pages", flush=True)


def main():
    if "--details" in sys.argv:
        enrich_missing_prices()
        return
    sitemap = ET.fromstring(download(BASE + "media/sitemap/sitemap.xml"))
    products, categories = sitemap_products(sitemap)
    roots = categories[:10]
    # Include the public photovoltaic family, which is outside the ten electrical roots.
    roots += [url for url in categories if re.search(r"/(photovoltaique|materiel-photovoltaique|panneaux-solaires)\.html$", url)]
    failures = []
    page_count = 0
    remaining = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        pending = {pool.submit(category_page, url): url for url in dict.fromkeys(roots)}
        for future in concurrent.futures.as_completed(pending):
            url = pending[future]
            try:
                offers, pages = future.result()
                apply_offers(products, offers)
                page_count += 1
                remaining.extend(f"{url}?p={page}" for page in range(2, pages + 1))
                print(f"ROOT {url} / {pages} pages", flush=True)
            except Exception as error:
                failures.append({"url": url, "error": str(error)})
        pending = {pool.submit(category_page, url): url for url in remaining}
        for future in concurrent.futures.as_completed(pending):
            url = pending[future]
            try:
                offers, _ = future.result()
                apply_offers(products, offers)
                page_count += 1
                if page_count % 15 == 0:
                    write_catalog(products, failures, page_count)
            except Exception as error:
                failures.append({"url": url, "error": str(error)})
                print(f"FAILED {url}: {error}", flush=True)
    write_catalog(products, failures, page_count)


def product_page(url):
    html = download(url)
    # Parse only structured data on product pages, avoiding the large SVG menus.
    scripts = re.findall(r'<script\b[^>]*\btype=[\"\']application/ld\+json[\"\'][^>]*>(.*?)</script>', html, re.DOTALL | re.IGNORECASE)
    for script in scripts:
        try:
            data = json.loads(script)
            if data.get("@type") == "Product":
                data.setdefault("offers", {}).setdefault("url", url)
                return data
        except (ValueError, AttributeError):
            continue
    return {}


def enrich_missing_prices():
    target = ROOT / "app/src/main/assets/catalog-123elec.json"
    snapshot = json.loads(target.read_text(encoding="utf-8"))
    products = {product["url"]: product for product in snapshot["products"]}
    missing = [url for url, product in products.items() if product["cost"] is None]
    failures = snapshot["failures"]
    page_count = snapshot["pagesRead"]
    print(f"DETAILS {len(missing)} product pages", flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        pending = {pool.submit(product_page, url): url for url in missing}
        for future in concurrent.futures.as_completed(pending):
            try:
                product = future.result()
                apply_offers(products, [product])
                page_count += 1
                if page_count % 30 == 0:
                    write_catalog(products, failures, page_count)
            except Exception as error:
                failures.append({"url": pending[future], "error": str(error)})
    # Normalize inferred brand names with known brands where the product title permits it.
    brands = sorted({p["brand"] for p in products.values() if p["cost"] is not None and p["brand"]}, key=len, reverse=True)
    for product in products.values():
        if product["cost"] is None:
            product["brand"] = next((brand for brand in brands if product["label"].upper().startswith(brand.upper() + " ")), "À préciser")
    write_catalog(products, failures, page_count)


if __name__ == "__main__":
    main()
