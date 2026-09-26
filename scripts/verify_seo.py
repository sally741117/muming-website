"""Validate published SEO signals. Run with --live after GitHub Pages deploys."""
import argparse
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import subprocess
from urllib.parse import unquote, urljoin, urlsplit
from urllib.request import Request, urlopen
from urllib.robotparser import RobotFileParser
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://mumingconsulting.tw/'
TITLE = '牧茗管理顧問有限公司｜MUMING'


class Page(HTMLParser):
    def __init__(self, source):
        super().__init__()
        self.meta = {}
        self.canonicals = []
        self.links = []
        self.titles = []
        self.jsonld = []
        self.capture = None
        self.h1 = 0
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'meta':
            key = a.get('name', a.get('property', '')).lower()
            self.meta.setdefault(key, []).append(a.get('content', ''))
        if tag == 'link' and 'canonical' in a.get('rel', '').split():
            self.canonicals.append(a.get('href'))
        if tag == 'title':
            self.titles.append('')
            self.capture = self.titles
        if tag == 'script' and a.get('type') == 'application/ld+json':
            self.jsonld.append('')
            self.capture = self.jsonld
        if tag == 'h1':
            self.h1 += 1
        if tag == 'a' and a.get('href'):
            self.links.append(a['href'])
        if tag in ('img', 'script') and a.get('src'):
            self.links.append(a['src'])
        if tag == 'link' and a.get('rel') == 'stylesheet':
            self.links.append(a['href'])

    def handle_endtag(self, tag):
        if tag in ('title', 'script'):
            self.capture = None

    def handle_data(self, data):
        if self.capture is not None:
            self.capture[-1] += data


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate(source, url):
    page = Page(source)
    require(len(page.titles) == 1 and page.titles[0].strip(), 'missing/duplicate title')
    require(page.canonicals == [url], 'canonical mismatch: ' + str(page.canonicals))
    for key in ('description', 'robots', 'og:title', 'og:description', 'og:url',
                'og:type', 'og:image', 'og:site_name', 'og:locale'):
        values = page.meta.get(key, [])
        require(len(values) == 1 and values[0].strip(), 'missing/duplicate ' + key)
    require(page.meta['og:url'] == [url], 'og:url mismatch')
    for key in ('robots', 'googlebot'):
        require(not re.search(r'noindex|nofollow|\bnone\b', ' '.join(page.meta.get(key, [])), re.I), 'blocked indexing')
    signals = ' '.join(page.titles + page.canonicals + [v for values in page.meta.values() for v in values] + page.jsonld)
    require(not re.search(r'localhost|127\.0\.0\.1|github\.io|vercel\.app|netlify\.app', signals, re.I), 'nonproduction SEO signal')
    for value in page.jsonld:
        json.loads(value)
    if url == BASE:
        require(page.titles == [TITLE], 'homepage title mismatch')
        require(page.h1 == 1, 'homepage must have one H1 in static HTML')
        require(len(page.jsonld) == 1, 'homepage JSON-LD missing/duplicate')
        graph = json.loads(page.jsonld[0])['@graph']
        org = next(x for x in graph if x['@type'] == 'Organization')
        require(org['name'] == '牧茗管理顧問有限公司' and 'MUMING' in org['alternateName'], 'organization mismatch')
        require(org['url'] == BASE and org['logo'] == BASE + 'assets/image_1.png', 'organization URL/logo mismatch')
    return page


def fetch(url):
    with urlopen(Request(url, headers={'User-Agent': 'Muming-SEO-verification/1.0'}), timeout=30) as response:
        require(response.status == 200, 'HTTP ' + str(response.status))
        require(response.url == url, 'unexpected redirect to ' + response.url)
        require(not re.search(r'noindex|nofollow|\bnone\b', response.headers.get('X-Robots-Tag', ''), re.I), 'X-Robots-Tag blocks indexing')
        return response.read().decode('utf-8')


def main():
    args = argparse.ArgumentParser()
    args.add_argument('--live', action='store_true')
    live = args.parse_args().live
    tracked = subprocess.check_output(['git', 'ls-files', '*.html'], cwd=ROOT, text=True).splitlines()
    urls = {BASE + (p[:-10] if p.endswith('index.html') else p): p for p in tracked}
    xml = fetch(BASE + 'sitemap.xml') if live else (ROOT / 'sitemap.xml').read_text(encoding='utf-8')
    locations = [x.text for x in ET.fromstring(xml).findall('{http://www.sitemaps.org/schemas/sitemap/0.9}url/{http://www.sitemaps.org/schemas/sitemap/0.9}loc')]
    require(len(locations) == len(set(locations)), 'duplicate sitemap entries')
    require(set(locations) == set(urls), 'sitemap differs from tracked public HTML pages; review intended coverage')
    require((ROOT / 'CNAME').read_text().strip() == 'mumingconsulting.tw', 'CNAME changed')
    robots = fetch(BASE + 'robots.txt') if live else (ROOT / 'robots.txt').read_text(encoding='utf-8')
    robot = RobotFileParser()
    robot.parse(robots.splitlines())
    require(robot.site_maps() == [BASE + 'sitemap.xml'], 'robots sitemap declaration mismatch')

    def check(url):
        try:
            require(robot.can_fetch('Googlebot', url), 'robots disallows URL')
            source = fetch(url) if live else (ROOT / urls[url]).read_text(encoding='utf-8')
            page = validate(source, url)
            for href in page.links:
                link = urlsplit(urljoin(url, href))
                if link.netloc == 'mumingconsulting.tw' and link.scheme in ('http', 'https'):
                    path = unquote(link.path).lstrip('/')
                    if not path or path.endswith('/'):
                        path += 'index.html'
                    require((ROOT / path).is_file(), 'missing internal target ' + path)
            return None
        except Exception as error:
            return url + ': ' + str(error)

    with ThreadPoolExecutor(max_workers=6) as pool:
        errors = [error for error in pool.map(check, locations) if error]
    if errors:
        raise SystemExit('\n'.join(errors))
    print(('LIVE' if live else 'LOCAL') + f' PASS: {len(locations)} pages, metadata, canonical, JSON-LD, internal file links, robots, sitemap, CNAME')


if __name__ == '__main__':
    main()
