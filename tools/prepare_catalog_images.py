"""Read supplier product photos and bundle representative equipment photos for offline navigation."""
import concurrent.futures
import json
import pathlib
import re
import urllib.request
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'app/src/main/assets'
BASE = 'https://www.123elec.com/'
NS = {'s': 'http://www.sitemaps.org/schemas/sitemap/0.9', 'i': 'http://www.google.com/schemas/sitemap-image/1.1'}
products = json.loads((ASSETS / 'catalog-123elec.json').read_text(encoding='utf-8'))['products']
xml = urllib.request.urlopen(BASE + 'media/sitemap/sitemap.xml', timeout=40).read()
images = {}
for entry in ET.fromstring(xml):
    url = entry.findtext('s:loc', namespaces=NS)
    image = entry.findtext('i:image/i:loc', namespaces=NS)
    if image and image.startswith(BASE + 'media/'):
        images[url] = image
index = {p['id']: {'image': images[p['url']]} for p in products if p['url'] in images}
selected = {}
for reference in ['600335', '600001', '600801', 'R9PFC616', '52061', '221-413', '11033025']:
    product = next((p for p in products if p['ref'] == reference and p['id'] in index), None)
    if product:
        selected[product['id']] = product
patterns = [
    'prise de courant', 'interrupteur va', 'disjoncteur.*16a', 'interrupteur diff',
    'tableau.*electrique', 'parafoudre', 'contacteur', 'cable', 'gaine.*icta', 'tube.*irl',
    'goulotte', 'boite.*encastrement', 'boite.*derivation', 'wago.*221', 'spot.*led',
    'ampoule.*led', 'ruban.*led', 'hublot', 'rj45', 'coffret.*communication', 'vmc',
    'radiateur', 'thermostat', 'borne.*recharge', 'panneau.*solaire', 'visiophone',
    'detecteur.*fumee', 'pince', 'tournevis', 'cheville', 'detecteur.*mouvement',
]
import unicodedata
def normalize(text):
    return ''.join(c for c in unicodedata.normalize('NFKD', text.lower()) if not unicodedata.combining(c))
for pattern in patterns:
    matches = [p for p in products if p['id'] in index and p['cost'] is not None and re.search(pattern, normalize(p['label']))]
    if matches:
        product = min(matches, key=lambda p: len(p['label']))
        selected[product['id']] = product
folder = ASSETS / 'equipment-images'
folder.mkdir(exist_ok=True)
def download(product):
    url = index[product['id']]['image']
    extension = pathlib.PurePosixPath(url.split('?')[0]).suffix.lower()
    if extension not in ['.jpg', '.jpeg', '.png', '.webp']:
        return
    filename = product['id'] + extension
    target = folder / filename
    if not target.exists():
        data = urllib.request.urlopen(url, timeout=25).read(2_000_001)
        if len(data) > 2_000_000:
            return
        target.write_bytes(data)
    index[product['id']]['bundledImage'] = 'equipment-images/' + filename
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    for result in pool.map(download, selected.values()):
        pass
(ASSETS / 'equipment-images.json').write_text(json.dumps(index, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
print(len(index), 'product photos;', sum('bundledImage' in p for p in index.values()), 'offline photos', flush=True)
