(function () {
  'use strict';

  const BOOKS_API = '/api/books';
  const LOCAL_API = '/api/book';
  const GOOGLE_BOOKS_API = 'https://www.googleapis.com/books/v1/volumes';
  const OPEN_LIBRARY_API = 'https://openlibrary.org/api/books';
  const SCAN_DEBOUNCE_MS = 200;

  let scanTimer = null;
  let editId = null;

  const $ = (sel) => document.querySelector(sel);
  const scanInput = $('#scanInput');
  const scanStatus = $('#scanStatus');
  const scanBox = scanInput.closest('.scan-box');
  const bookFormSection = $('#bookFormSection');
  const bookForm = $('#bookForm');
  const booksList = $('#booksList');
  const bookCount = $('#bookCount');
  const searchInput = $('#searchInput');
  const toastEl = $('#toast');

  function init() {
    renderBooks();
    bindEvents();
  }

  function bindEvents() {
    scanInput.addEventListener('input', onScanInput);
    scanInput.addEventListener('keydown', onScanKeydown);
    bookForm.addEventListener('submit', onFormSubmit);
    searchInput.addEventListener('input', debounce(onSearch, 300));
  }

  function onScanInput(e) {
    const val = e.target.value.trim();
    clearTimeout(scanTimer);
    if (!val) return;
    scanBox.classList.remove('scanning');
    scanTimer = setTimeout(() => processISBN(val), SCAN_DEBOUNCE_MS);
  }

  function onScanKeydown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(scanTimer);
      const val = scanInput.value.trim();
      if (val) processISBN(val);
    }
  }

  async function processISBN(isbn) {
    const cleanISBN = isbn.replace(/[-\s]/g, '');
    if (!/^\d{10}(\d{3})?$/.test(cleanISBN)) {
      showToast('无效的ISBN格式', 'error');
      return;
    }

    scanBox.classList.add('scanning');
    scanStatus.innerHTML = '<span class="query-loading"><span class="spinner"></span> 正在查询...</span>';

    try {
      const bookInfo = await fetchBookInfo(cleanISBN);
      showBookForm(cleanISBN, bookInfo);
      const sourceMap = { dushu: '读书网', douban: '豆瓣', google: 'Google Books' };
      const source = sourceMap[bookInfo.source] || bookInfo.source;
      scanStatus.textContent = `✓ 查询成功（${source}），请确认信息`;
      showToast('书籍信息已获取');
    } catch (err) {
      showBookForm(cleanISBN, null);
      scanStatus.textContent = '未找到自动信息，请手动填写';
      showToast('未找到该ISBN的书籍信息，请手动录入', 'error');
    }

    setTimeout(() => scanBox.classList.remove('scanning'), 2000);
  }

  async function fetchBookInfo(isbn) {
    try {
      return await fetchFromDushu(isbn);
    } catch (e) {
      try {
        return await fetchFromDouban(isbn);
      } catch (e2) {
        try {
          return await fetchFromGoogleBooks(isbn);
        } catch (e3) {
          return await fetchFromOpenLibrary(isbn);
        }
      }
    }
  }

  async function fetchFromDushu(isbn) {
    const resp = await fetch(`${LOCAL_API}/${isbn}`);
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || '读书网查询失败');
    }
    const data = await resp.json();
    if (data.source !== 'dushu') throw new Error('非读书网数据');
    return data;
  }

  async function fetchFromDouban(isbn) {
    const resp = await fetch(`${LOCAL_API}/${isbn}`);
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.error || '豆瓣查询失败');
    }
    const data = await resp.json();
    if (data.source !== 'douban') throw new Error('非豆瓣数据');
    return data;
  }

  async function fetchFromGoogleBooks(isbn) {
    const url = `${GOOGLE_BOOKS_API}?q=isbn:${isbn}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('请求失败');
    const data = await resp.json();
    if (!data.totalItems || !data.items || !data.items[0]) throw new Error('未找到');
    const info = data.items[0].volumeInfo;
    return {
      title: info.title || '', author: (info.authors || []).join(', '),
      publisher: info.publisher || '', publishDate: info.publishedDate || '',
      pages: info.pageCount || '', category: (info.categories || []).join(', '),
      description: info.description || '',
    };
  }

  async function fetchFromOpenLibrary(isbn) {
    const url = `${OPEN_LIBRARY_API}?bibkeys=ISBN:${isbn}&format=json&jscmd=data`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('请求失败');
    const data = await resp.json();
    const key = `ISBN:${isbn}`;
    if (!data[key]) throw new Error('未找到');
    const info = data[key];
    return {
      title: info.title || '', author: (info.authors || []).map(a => a.name).join(', '),
      publisher: (info.publishers || []).map(p => p.name).join(', '),
      publishDate: info.publish_date || '', pages: info.number_of_pages || '',
      category: (info.subjects || []).slice(0, 3).map(s => s.name).join(', '),
      description: typeof info.excerpt === 'string' ? info.excerpt : (info.notes || ''),
    };
  }

  function showBookForm(isbn, info) {
    editId = null;
    $('#isbn').value = isbn;
    $('#title').value = info ? info.title : '';
    $('#author').value = info ? info.author : '';
    $('#publisher').value = info ? info.publisher : '';
    $('#publishDate').value = info ? info.publishDate : '';
    $('#pages').value = info ? info.pages : '';
    $('#category').value = info ? info.category : '';
    $('#price').value = '';
    $('#description').value = info ? info.description : '';
    $('#notes').value = '';
    bookFormSection.style.display = 'block';
    bookFormSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#title').focus();
  }

  function showEditForm(book) {
    editId = book.id;
    $('#isbn').value = book.isbn || '';
    $('#title').value = book.title || '';
    $('#author').value = book.author || '';
    $('#publisher').value = book.publisher || '';
    $('#publishDate').value = book.publishDate || '';
    $('#pages').value = book.pages || '';
    $('#category').value = book.category || '';
    $('#price').value = book.price || '';
    $('#description').value = book.description || '';
    $('#notes').value = book.notes || '';
    bookFormSection.style.display = 'block';
    bookFormSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('#title').focus();
  }

  function cancelEdit() {
    editId = null;
    bookFormSection.style.display = 'none';
    bookForm.reset();
    scanInput.value = '';
    scanStatus.textContent = '等待扫描...';
    scanInput.focus();
  }

  async function onFormSubmit(e) {
    e.preventDefault();
    const title = $('#title').value.trim();
    if (!title) { showToast('书名不能为空', 'error'); return; }

    const book = {
      id: editId || genId(),
      isbn: $('#isbn').value.trim(),
      title: title,
      author: $('#author').value.trim(),
      publisher: $('#publisher').value.trim(),
      publishDate: $('#publishDate').value.trim(),
      pages: $('#pages').value.trim(),
      category: $('#category').value.trim(),
      price: $('#price').value.trim(),
      description: $('#description').value.trim(),
      notes: $('#notes').value.trim(),
    };

    try {
      const resp = await fetch(BOOKS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(book),
      });
      if (!resp.ok) throw new Error((await resp.json()).error || '保存失败');
      showToast(editId ? '书籍信息已更新' : '书籍已保存', 'success');
      cancelEdit();
      await renderBooks();
    } catch (err) {
      showToast('保存失败: ' + err.message, 'error');
    }
  }

  async function deleteBook(id) {
    if (!confirm('确定要删除这本书吗？')) return;
    try {
      await fetch(`${BOOKS_API}/${id}`, { method: 'DELETE' });
      showToast('已删除', 'success');
      await renderBooks();
    } catch (err) {
      showToast('删除失败', 'error');
    }
  }

  async function editBook(id) {
    const resp = await fetch(BOOKS_API);
    const books = await resp.json();
    const book = books.find(b => b.id === id);
    if (book) showEditForm(book);
  }

  async function renderBooks(filter) {
    const url = filter ? `${BOOKS_API}?q=${encodeURIComponent(filter)}` : BOOKS_API;
    const resp = await fetch(url);
    const books = await resp.json();

    bookCount.textContent = books.length;

    if (books.length === 0) {
      booksList.innerHTML = '<div class="empty-state">暂无书籍记录，扫描条形码开始录入</div>';
      return;
    }

    booksList.innerHTML = books.map(b => `
      <div class="book-item">
        <div class="book-info">
          <div class="book-title">${escHtml(b.title)}</div>
          <div class="book-meta">
            ${b.author ? `<span>👤 ${escHtml(b.author)}</span>` : ''}
            ${b.isbn ? `<span>ISBN: ${escHtml(b.isbn)}</span>` : ''}
            ${b.publisher ? `<span>📖 ${escHtml(b.publisher)}</span>` : ''}
            ${b.publishDate ? `<span>📅 ${escHtml(b.publishDate)}</span>` : ''}
            ${b.category ? `<span>🏷️ ${escHtml(b.category)}</span>` : ''}
          </div>
        </div>
        <div class="book-actions">
          <button class="btn-danger-sm" title="编辑" onclick="editBook('${b.id}')">✏️</button>
          <button class="btn-danger-sm" title="删除" onclick="deleteBook('${b.id}')">🗑️</button>
        </div>
      </div>
    `).join('');
  }

  function onSearch() {
    const q = searchInput.value.trim();
    renderBooks(q || null);
  }

  async function exportData() {
    const resp = await fetch(BOOKS_API);
    const books = await resp.json();
    const json = JSON.stringify(books, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `books_${formatDate(Date.now())}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('导出成功', 'success');
  }

  async function importData(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error('格式错误');
      let count = 0;
      for (const book of data) {
        if (book.title) {
          book.id = book.id || genId();
          await fetch(BOOKS_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(book),
          });
          count++;
        }
      }
      showToast(`成功导入 ${count} 本书籍`, 'success');
      await renderBooks();
    } catch (err) {
      showToast('导入失败: ' + err.message, 'error');
    }
    event.target.value = '';
  }

  function showToast(msg, type) {
    toastEl.textContent = msg;
    toastEl.className = 'toast show' + (type ? ' ' + type : '');
    clearTimeout(toastEl._timer);
    toastEl._timer = setTimeout(() => toastEl.className = 'toast', 3000);
  }

  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function formatDate(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  }

  function escHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function debounce(fn, ms) {
    let t;
    return function (...args) { clearTimeout(t); t = setTimeout(() => fn.apply(this, args), ms); };
  }

  window.cancelEdit = cancelEdit;
  window.editBook = editBook;
  window.deleteBook = deleteBook;
  window.exportData = exportData;
  window.importData = importData;

  init();
})();
