import json
import re
import os
import time
import uuid
from http.server import HTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

import requests
from bs4 import BeautifulSoup

PORT = 3000
DATA_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'books.json')

HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
}

DOUBAN_HEADERS = {
    **HEADERS,
    'Referer': 'https://book.douban.com/',
}


def load_books():
    if not os.path.exists(DATA_FILE):
        return []
    with open(DATA_FILE, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_books(books):
    os.makedirs(os.path.dirname(DATA_FILE), exist_ok=True)
    with open(DATA_FILE, 'w', encoding='utf-8') as f:
        json.dump(books, f, ensure_ascii=False, indent=2)


class BookHandler(SimpleHTTPRequestHandler):

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if re.match(r'^/api/book/\d{10,13}$', path):
            isbn = path.split('/')[-1]
            self.handle_book_query(isbn)
        elif path == '/api/books':
            self.handle_get_books(parsed)
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == '/api/books':
            self.handle_save_book()
        else:
            self.send_error(404)

    def do_PUT(self):
        if self.path == '/api/books':
            self.handle_save_book()
        else:
            self.send_error(404)

    def do_DELETE(self):
        parsed = urlparse(self.path)
        match = re.match(r'^/api/books/(\w+)$', parsed.path)
        if match:
            self.handle_delete_book(match.group(1))
        else:
            self.send_error(404)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def handle_get_books(self, parsed):
        qs = parse_qs(parsed.query)
        keyword = qs.get('q', [''])[0].lower()
        books = load_books()
        books.sort(key=lambda b: b.get('createdAt', 0), reverse=True)
        if keyword:
            books = [b for b in books if
                     keyword in (b.get('title', '')).lower() or
                     keyword in (b.get('author', '')).lower() or
                     keyword in (b.get('isbn', '')).lower() or
                     keyword in (b.get('publisher', '')).lower()]
        self.send_json(200, books)

    def handle_save_book(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length).decode('utf-8')
            book = json.loads(body)

            if not book.get('title', '').strip():
                self.send_json(400, {'error': '书名不能为空'})
                return

            books = load_books()
            now = time.time() * 1000

            existing_idx = next((i for i, b in enumerate(books) if b['id'] == book['id']), None)
            if existing_idx is not None:
                book['createdAt'] = books[existing_idx].get('createdAt', now)
                book['updatedAt'] = now
                books[existing_idx] = book
            else:
                book['id'] = book.get('id') or uuid.uuid4().hex[:12]
                book['createdAt'] = now
                book['updatedAt'] = now
                books.append(book)

            save_books(books)
            self.send_json(200, book)
        except Exception as e:
            self.send_json(500, {'error': str(e)})

    def handle_delete_book(self, book_id):
        books = load_books()
        books = [b for b in books if b['id'] != book_id]
        save_books(books)
        self.send_json(200, {'ok': True})

    def handle_book_query(self, isbn):
        try:
            book_info = self.fetch_from_dushu(isbn)
            book_info['source'] = 'dushu'
            self.send_json(200, book_info)
        except Exception:
            try:
                detail_url = self.search_douban(isbn)
                if not detail_url:
                    self.send_json(404, {'error': '所有数据源均未找到该书籍'})
                    return
                book_info = self.fetch_detail(detail_url)
                book_info['source'] = 'douban'
                self.send_json(200, book_info)
            except Exception as e:
                self.send_json(500, {'error': f'查询失败: {str(e)}'})

    def fetch_from_dushu(self, isbn):
        url = f'https://www.dushu.com/search.aspx?qd={isbn}'
        resp = requests.get(url, headers=HEADERS, timeout=10)
        resp.raise_for_status()
        html = resp.text

        match = re.search(r'href="/book/(\d+)/', html)
        if not match:
            raise Exception('未找到')

        detail_url = f'https://www.dushu.com/book/{match.group(1)}/'
        resp = requests.get(detail_url, headers=HEADERS, timeout=10)
        resp.raise_for_status()
        html = resp.text

        title_match = re.search(r'<div class="book-title"><h1>([^<]+)</h1>', html)
        title = title_match.group(1).strip() if title_match else ''

        author_match = re.search(r'作\s*者[：:]</td>\s*<td>([^<]+)</td>', html)
        author = author_match.group(1).strip() if author_match else ''

        pub_match = re.search(r'出版社[：:]</td>\s*<td>([^<]+)</td>', html)
        publisher = pub_match.group(1).strip() if pub_match else ''

        date_match = re.search(r'出版时间[：:]</td>\s*<td[^>]*>([^<]+)</td>', html)
        publish_date = date_match.group(1).strip() if date_match else ''

        price_match = re.search(r'定\s*价[：:]\s*<span[^>]*>[¥￥]?([\d.]+)', html)
        price = price_match.group(1) if price_match else ''

        pages_match = re.search(r'页\s*数[：:]</td>\s*<td[^>]*>(\d+)', html)
        pages = pages_match.group(1) if pages_match else ''

        desc_match = re.search(r'<div class="text txtsummary">([\s\S]*?)</div>', html)
        description = ''
        if desc_match:
            description = re.sub(r'<[^>]+>', '', desc_match.group(1))
            description = re.sub(r'&[a-z]+;', '', description)
            description = re.sub(r'\s+', ' ', description).strip()

        category = ''
        crumbs_match = re.search(r'当前位置[：:]\s*([\s\S]*?)<span', html)
        if crumbs_match:
            crumbs = re.sub(r'<[^>]+>', '', crumbs_match.group(1))
            parts = re.split(r'\s*[>|]\s*', crumbs)
            if len(parts) > 2:
                category = ', '.join(c for c in parts[1:-1] if c and c not in ('首页', '出版图书'))

        if not title:
            raise Exception('未获取到书名')

        return {
            'title': title, 'author': author, 'publisher': publisher,
            'publishDate': publish_date, 'pages': pages, 'price': price,
            'category': category, 'description': description,
        }

    def search_douban(self, isbn):
        url = f'https://search.douban.com/book/subject_search?search_text={isbn}&cat=1001'
        resp = requests.get(url, headers=DOUBAN_HEADERS, timeout=10)
        resp.raise_for_status()
        html = resp.text
        match = re.search(r'https://book\.douban\.com/subject/(\d+)', html)
        if match:
            return match.group(0)
        soup = BeautifulSoup(html, 'html.parser')
        for a in soup.find_all('a', href=True):
            if re.match(r'https://book\.douban\.com/subject/\d+', a['href']):
                return a['href']
        return None

    def fetch_detail(self, url):
        resp = requests.get(url, headers=DOUBAN_HEADERS, timeout=10)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, 'html.parser')

        title = ''
        h1 = soup.find('h1')
        if h1:
            span = h1.find('span')
            title = (span or h1).get_text(strip=True)

        info_div = soup.find(id='info')
        info_text = info_div.get_text() if info_div else ''

        author = self._extract(info_text, r'作者[：:]\s*(.+?)(?:\n|$)')
        publisher = self._extract(info_text, r'出版社[：:]\s*(.+?)(?:\n|/|$)')
        publish_date = self._extract(info_text, r'出版年[：:]\s*(.+?)(?:\n|/|$)')
        pages = self._extract(info_text, r'页数[：:]\s*(\d+)')
        price = self._extract(info_text, r'定价[：:]\s*(.+?)(?:\n|/|$)')
        category = self._extract(info_text, r'分类[：:]\s*(.+?)(?:\n|$)')

        if not category:
            tags = [a.get_text(strip=True) for a in soup.select('a.tag')[:3]]
            if tags:
                category = ', '.join(tags)

        description = ''
        intro_div = soup.select_one('#link-report .intro')
        if intro_div:
            paragraphs = intro_div.find_all('p')
            description = '\n'.join(p.get_text(strip=True) for p in paragraphs) if paragraphs else intro_div.get_text(strip=True)

        return {
            'title': title, 'author': author, 'publisher': publisher,
            'publishDate': publish_date, 'pages': pages, 'price': price,
            'category': category, 'description': description,
        }

    def _extract(self, text, pattern):
        m = re.search(pattern, text)
        return m.group(1).strip() if m else ''

    def send_json(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', len(body))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        pass


if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    server = HTTPServer(('127.0.0.1', PORT), BookHandler)
    print(f'\n  书籍信息录入系统已启动')
    print(f'  访问地址: http://localhost:{PORT}')
    print(f'  数据文件: {DATA_FILE}\n')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\n已停止')
        server.server_close()
