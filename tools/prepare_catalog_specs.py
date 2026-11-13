"""Build factual comparison fields from public product names, descriptions and specification tables.

Cached socket pages are reused. Socket specification pages are completed
with two concurrent public requests. Missing or conflicting measurements remain unknown.
"""
import concurrent.futures
import datetime
import gzip
import hashlib
import html
import json
import pathlib
import re
import unicodedata
import urllib.request
from decimal import Decimal

ROOT = pathlib.Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'app/src/main/assets'
CACHE = ROOT / 'tmp/123elec'
DETAILS = ROOT / 'tmp/spec-pages'
DETAILS.mkdir(exist_ok=True)
BASE = 'https://www.123elec.com/'
SCRIPT = re.compile(r'<script\b[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>', re.S | re.I)
ROWS = re.compile(r'<th\b[^>]*>(.*?)</th>\s*<td\b[^>]*>(.*?)</td>', re.S | re.I)
TABLE = re.compile(r'<table\b[^>]*additional-attributes[^>]*>(.*?)</table>', re.S | re.I)
PROSE = re.compile(r'<div\b[^>]*class=["\']prose["\'][^>]*>(.*?)</div>', re.S | re.I)
catalog = json.loads((ASSETS / 'catalog-123elec.json').read_text(encoding='utf-8'))['products']
by_url = {product['url']: product for product in catalog}
profiles = {}


def clean(text):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]*>', ' ', str(text)))).strip()


def normalize(text):
    return ''.join(char for char in unicodedata.normalize('NFKD', clean(text).lower()) if not unicodedata.combining(char))


def unique_number(text, pattern):
    values = {format(Decimal(match.replace(',', '.')).normalize(), 'f') for match in re.findall(pattern, text, re.I)}
    return next(iter(values)) if len(values) == 1 else None


def derive(product, description='', attributes=None):
    attributes = {normalize(key): clean(value) for key, value in (attributes or {}).items()}
    label = normalize(product['label'])
    text = normalize(product['label'] + ' ' + description)
    function = normalize(attributes.get('fonction appareillage', ''))
    kind = normalize(attributes.get('type appareillage', ''))
    facts = {}
    if 'enjoliveur' in label or 'enjoliveur' in kind:
        facts['type'] = 'socket-cover' if 'prise' in label else 'cover'
    elif 'plaque' in kind:
        facts['type'] = 'plate'
    elif 'support' in kind:
        facts['type'] = 'support'
    elif re.search(r'prise.*(courant|2p|terre)', label) or 'prise 2p' in function:
        facts['type'] = 'socket-usb' if 'usb' in label else 'socket'
    elif 'disjoncteur' in label:
        facts['type'] = 'breaker'
    elif 'interrupteur' in label and 'differentiel' in label:
        facts['type'] = 'rcd'
    elif 'poussoir' in label:
        facts['type'] = 'push-button'
    elif 'va et vient' in label or 'va-et-vient' in label:
        facts['type'] = 'two-way-switch'
    elif 'interrupteur' in label:
        facts['type'] = 'switch'
    elif 'ampoule' in label:
        facts['type'] = 'bulb'
    elif 'spot' in label and 'accessoire' not in label and 'rail' not in label:
        facts['type'] = 'spot'
    elif 'cable' in label or re.search(r'\bfil\b', label):
        facts['type'] = 'cable'
    elif 'boite' in label and 'encastrement' in label:
        facts['type'] = 'flush-box'
    elif 'plaque' in label:
        facts['type'] = 'plate'
    # Only a single explicitly stated measurement is usable as a comparison criterion.
    rated_pair = attributes.get('tension - intensite', '')
    sources = {
        'amps': (attributes.get('intensite', '') or rated_pair or text, r'(?<![a-z\d.,])(\d+(?:[.,]\d+)?)\s*a\b'),
        'volts': (attributes.get('tension', '') or rated_pair or text, r'(?<![a-z\d.,])(\d+(?:[.,]\d+)?)\s*v\b'),
        'watts': (attributes.get('puissance', '') or text, r'(?<![\d.,])(\d+(?:[.,]\d+)?)\s*w\b'),
        'milliamps': (text, r'(?<![\d.,])(\d+(?:[.,]\d+)?)\s*ma\b'),
        'ip': (attributes.get("indice ip - resistance a l'eau/poussiere", '') or text, r'\bip\s*(\d{2})\b'),
        'kelvin': (text, r'(?<!\d)([23456]\d{3})\s*k\b'),
    }
    for key, (source, pattern) in sources.items():
        value = unique_number(source, pattern)
        if value:
            facts[key] = value
    if 'amps' in facts and (Decimal(facts['amps']) > (63 if facts.get('type') in ['socket', 'socket-usb'] else 1250)):
        del facts['amps']
    poles_text = normalize(attributes.get('fonction appareillage', '') or product['label'])
    if re.search(r'2\s*p\s*\+\s*(?:t\b|terre)', poles_text):
        facts['poles'] = '2P+T'
    elif re.search(r'2\s*p\b', poles_text):
        facts['poles'] = '2P'
    elif re.search(r'(?:1\s*p|ph)\s*\+\s*n', poles_text):
        facts['poles'] = '1P+N'
    elif re.search(r'3\s*p\s*\+\s*n', poles_text):
        facts['poles'] = '3P+N'
    curve = re.search(r'courbe\s+([bcd])\b', label)
    if curve:
        facts['curve'] = curve.group(1).upper()
    rcd_type = re.search(r'type\s+(ac|a|f|b)\b', label)
    if rcd_type and facts.get('type') == 'rcd':
        facts['rcdType'] = rcd_type.group(1).upper()
    color = normalize(attributes.get('couleur', '')) or label
    colors = [name for name in ['blanc', 'noir', 'gris', 'anthracite', 'alu', 'titane', 'ivoire', 'beige'] if re.search(r'\b' + name + r'\b', color)]
    if attributes.get('couleur'):
        facts['color'] = normalize(attributes['couleur'])
    elif colors:
        facts['color'] = ' / '.join(colors)
    pose = normalize(attributes.get('pose', '')) or label
    flush = bool(re.search(r'encastr', pose))
    surface = 'saillie' in pose
    if flush and not surface:
        facts['mount'] = 'flush'
    elif surface and not flush:
        facts['mount'] = 'surface'
    assembly = normalize(attributes.get('assemblage', ''))
    if 'complet' in assembly:
        facts['assembly'] = 'complete'
    elif 'composer' in assembly or kind == 'mecanisme' or 'sans plaque' in label:
        facts['assembly'] = 'mechanism'
    elif re.search(r'\bcomplet[e]?\b', label):
        facts['assembly'] = 'complete'
    automatic = normalize(attributes.get('bornes automatiques', ''))
    if automatic in ['oui', 'non']:
        facts['connection'] = 'automatic' if automatic == 'oui' else 'non-automatic'
    posts = unique_number(attributes.get('nombre de poste', ''), r'(\d+)\s*poste')
    if posts:
        facts['posts'] = posts
    socket = re.search(r'\b(e14|e27|gu10|gu5[.,]3|g9|g4)\b', label)
    if socket:
        facts['base'] = socket.group(1).upper().replace(',', '.')
    conductors = re.search(r'\b(\d+)\s*([xg])\s*(\d+(?:[.,]\d+)?)', label)
    if conductors and facts.get('type') == 'cable':
        facts['conductors'] = conductors.group(1) + conductors.group(2).upper() + conductors.group(3).replace(',', '.')
    package = re.search(r'\blot(?:\s+de)?\s*(\d+)\s*(?:\+\s*(\d+))?', label)
    if not package:
        package = re.search(r'\b(?:boite|sachet|pack)\s+(?:de\s+)?(\d+)\b', label)
    if package:
        facts['pack'] = str(int(package.group(1)) + int(package.group(2) or 0)) if len(package.groups()) > 1 else package.group(1)
    elif re.search(r'\b(?:lot|boite|sachet|pack|couronne)\b', label):
        length = re.search(r'\bcouronne\s+(?:de\s+)?(\d+)\s*m\b', label)
        if length:
            facts['pack'] = length.group(1) + ' m'
    elif 'au metre' in label:
        facts['pack'] = '1 m'
    else:
        facts['pack'] = '1'
    if facts.get('type') in ['socket', 'socket-usb']:
        outlets = re.search(r'\b(double|triple|quadruple)\s+prise|\bprise\s+(double|triple|quadruple)', label)
        facts['outlets'] = str({'double':2, 'triple':3, 'quadruple':4}[outlets.group(1) or outlets.group(2)]) if outlets else '1'
    return facts


def ingest(file):
    page = file.read_text(encoding='utf-8')
    date = datetime.datetime.fromtimestamp(file.stat().st_mtime).date().isoformat()
    for script in SCRIPT.findall(page):
        try:
            data = json.loads(script)
        except ValueError:
            continue
        if not isinstance(data, dict):
            continue
        direct = data.get('@type') == 'Product'
        main = data.get('mainEntity', {})
        products = [data] if direct else main.get('itemListElement', []) if isinstance(main, dict) else []
        table = TABLE.search(page) if direct else None
        attributes = {clean(key): clean(value) for key, value in ROWS.findall(table.group(1))} if table else {}
        if direct:
            known = {normalize(key) for key in attributes}
            aliases = {'nombre de postes':'Nombre de poste', 'tension nominale':'Tension', 'intensite nominale':'Intensite', 'calibre':'Intensite'}
            for block in PROSE.findall(page):
                for entry in re.findall(r'<li\b[^>]*>(.*?)</li>', block, re.S | re.I):
                    text = clean(entry)
                    if ':' not in text:
                        continue
                    key, value = text.split(':', 1)
                    name = normalize(key)
                    key = aliases.get(name, key)
                    if len(name) < 65 and normalize(key) not in known:
                        attributes[key] = value.strip()
                        known.add(normalize(key))
        for item in products:
            if not isinstance(item, dict):
                continue
            url = item.get('offers', {}).get('url') if isinstance(item.get('offers'), dict) else None
            if url not in by_url:
                continue
            existing = profiles.get(by_url[url]['id'])
            if existing and existing.get('table') and not direct:
                continue
            product = by_url[url]
            profiles[product['id']] = {'facts': derive(product, clean(item.get('description', '')), attributes),
                'source': url, 'observedAt': date, 'table': bool(attributes)}


def download(product):
    current = profiles.get(product['id'])
    if current and current['table']:
        return None
    file = DETAILS / (hashlib.sha256(product['url'].encode()).hexdigest() + '.html')
    if file.exists():
        return file
    request = urllib.request.Request(product['url'], headers={'User-Agent': 'Deviselec-Specs/0.5 (public catalog)', 'Accept-Encoding': 'gzip'})
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            raw = response.read()
            if response.headers.get('Content-Encoding') == 'gzip':
                raw = gzip.decompress(raw)
        file.write_bytes(raw)
        return file
    except Exception:
        return None


def main():
    sockets = [p for p in catalog if p['category'] == 'Appareillage' and re.search(r'prise.*(courant|2p|terre)', p['label'], re.I)]
    cached_names = {hashlib.sha256(product['url'].encode()).hexdigest() + '.html' for product in sockets}
    files = [CACHE / name for name in cached_names if (CACHE / name).exists()] + list(DETAILS.glob('*.html'))
    reference = ROOT / 'tmp/comparison-reference.html'
    if reference.exists():
        files.append(reference)
    for number, file in enumerate(files):
        ingest(file)
        if number % 250 == 0:
            print('Cached pages', number, '/', len(files), flush=True)
    print('Cached profiles:', len(profiles), flush=True)

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        completed = 0
        for file in pool.map(download, sockets):
            if file:
                ingest(file)
            completed += 1
            if completed % 60 == 0:
                print('Socket sheets', completed, '/', len(sockets), flush=True)
    for product in catalog:
        if product['id'] not in profiles:
            profiles[product['id']] = {'facts': derive(product), 'source': product['url'], 'observedAt': '', 'table': False}
    target = ASSETS / 'equipment-specs.json'
    target.write_text(json.dumps(profiles, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    print('Profiles:', len(profiles), 'with supplier tables:', sum(p['table'] for p in profiles.values()), flush=True)


if __name__ == "__main__":
    main()
