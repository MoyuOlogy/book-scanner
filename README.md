# 📚 书籍信息录入系统（根据ISBN）

扫码枪扫描条形码，自动查询书籍信息并保存到本地的录入系统。

![Python](https://img.shields.io/badge/Python-3.x-blue)
![License](https://img.shields.io/badge/License-MIT-green)

## 功能

- **扫码枪扫描** — 扫描 ISBN 条形码，自动查询书籍信息
- **多源查询** — 豆瓣 → Google Books → Open Library，逐级兜底
- **实时本地存储** — 数据保存到 `data/books.json` 文件，不依赖浏览器缓存
- **手动录入** — 支持手动填写/编辑书籍信息
- **搜索** — 按书名、作者、ISBN、出版社搜索
- **导入/导出** — JSON 格式数据导入导出，方便备份

## 项目结构

```
book-scanner/
├── index.html        # 前端页面
├── style.css         # 样式
├── app.js            # 前端逻辑
├── server.py         # Python 后端服务
├── data/
│   └── books.json    # 书籍数据（自动生成）
└── README.md
```

## 环境要求

- Python 3.x
- 依赖库：`requests`、`beautifulsoup4`

## 安装与运行

1. 安装依赖

```bash
pip install requests beautifulsoup4
```

2. 启动服务

```bash
python server.py
```

3. 打开浏览器访问

```
http://localhost:3000
```

## 使用方式

1. 将光标聚焦在页面顶部的扫描框
2. 使用扫码枪扫描书籍的 ISBN 条形码
3. 系统自动查询并填充书籍信息
4. 确认或修改信息后点击「保存」
5. 数据实时写入 `data/books.json`

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/books` | 获取所有书籍 |
| GET | `/api/books?q=关键词` | 搜索书籍 |
| POST | `/api/books` | 新增/更新书籍 |
| DELETE | `/api/books/:id` | 删除书籍 |
| GET | `/api/book/:isbn` | 查询 ISBN 对应的书籍信息（豆瓣） |

## 数据备份

数据保存在 `data/books.json`，直接备份该文件即可。也可以通过页面上的「导出 JSON」按钮导出。
