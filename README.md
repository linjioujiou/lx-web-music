# LX Web · 在线音乐播放器

可部署到 **Cloudflare Pages** 的网页端音乐播放器，播放链接解析对接 [pdone/lx-music-source](https://github.com/pdone/lx-music-source) 生态中的音源接口（Huibq 主解析 + ikun 备用）。

> 仅供在线试听学习交流，请勿用于批量下载或商业用途；请遵守各音乐平台与音源服务条款，控制请求频率。

## 功能

- 多音源搜索：网易云 / QQ 音乐 / 酷我 / 酷狗 / 咪咕
- 播放地址解析：优先 `lxmusicapi.onrender.com`（Huibq），失败回退 `api.ikunshare.com`（ikun）
- 播放列表（localStorage 持久化）、上一曲/下一曲、顺序/循环/单曲/随机
- 音质选择（128k / 320k）
- 歌词展示（网易云 / QQ / 酷我，尽力而为）
- 响应式深色 UI，支持 Media Session（部分浏览器锁屏控制）

## 架构

```
浏览器
  ├─ 搜索  → /api/search  (Pages Function 代理各平台公开搜索 API)
  ├─ 取链  → /api/url     (Pages Function → Huibq / ikun，对应 lx-music-source)
  └─ 歌词  → /api/lyric   (Pages Function 代理歌词 API)
```

音源约定与洛雪源脚本一致：播放 ID 使用 `hash ?? songmid`，平台代码 `wy` / `tx` / `kw` / `kg` / `mg`。

## 目录结构

```
.
├── index.html
├── css/style.css
├── js/app.js
├── functions/
│   └── api/
│       ├── search.js   # GET /api/search?q=&source=&limit=
│       ├── url.js      # GET /api/url?source=&id=&quality=
│       └── lyric.js    # GET /api/lyric?source=&id=
├── _headers
├── package.json
├── wrangler.toml
└── README.md
```

## 本地开发

需要 Node.js 18+，并安装依赖：

```bash
npm install
npm run dev
```

浏览器打开终端提示的本地地址（一般为 `http://127.0.0.1:8788`）。

> Pages Functions 必须在 `wrangler pages dev` 下运行；直接用静态服务器打开只能看到页面，接口会 404。

## 部署到 Cloudflare Pages

### 方式 A：Git 连接（推荐）

1. 将本项目推送到 GitHub / GitLab
2. 打开 [Cloudflare Dashboard](https://dash.cloudflare.com/) → **Workers & Pages** → **Create** → **Pages** → 连接仓库
3. 构建设置：
   - **Framework preset**: None
   - **Build command**: 留空
   - **Build output directory**: `/` 或 `.`
4. 部署完成后访问 `https://<project>.pages.dev`

Cloudflare 会自动识别根目录 `functions/` 作为 Pages Functions。

### 方式 B：Wrangler CLI

```bash
npm install
npx wrangler login
npm run deploy
```

### 方式 C：直接上传

Dashboard → Pages → Create → **Upload assets**，上传整个项目目录（需包含 `functions`）。若控制台上传不支持 Functions，请改用 Git 或 Wrangler。

## API 说明

### `GET /api/search`

| 参数 | 说明 |
|------|------|
| `q` | 关键词（必填） |
| `source` | `wy` `tx` `kw` `kg` `mg` |
| `limit` | 1–50，默认 20 |

### `GET /api/url`

| 参数 | 说明 |
|------|------|
| `source` | 音源代码 |
| `id` / `songmid` / `hash` | 歌曲标识 |
| `quality` | `128k` / `320k`（Huibq 侧主要为这两种） |

返回示例：

```json
{
  "code": 0,
  "url": "https://...",
  "quality": "320k",
  "provider": "huibq",
  "source": "wy",
  "songId": "123"
}
```

### `GET /api/lyric`

| 参数 | 说明 |
|------|------|
| `source` | 音源 |
| `id` | 歌曲 id / mid |

## 注意事项

1. **第三方音源可用性**：Huibq 部署在 Render 上，可能有冷启动或限流；ikun 为备用。若均失败，页面会提示解析错误。
2. **CORS / 防盗链**：播放地址由第三方 CDN 提供，极少数链接可能因防盗链无法在浏览器直接播放。
3. **合规**：本项目不托管音乐文件，仅做检索与链接解析的前端演示；请合理使用，勿高频爬取。
4. **自定义音源 Key**：若你自建了 Huibq/keep-alive 服务，可修改 `functions/api/url.js` 中的 `HUIBQ_BASE` / `HUIBQ_KEY`。

## 相关链接

- [pdone/lx-music-source](https://github.com/pdone/lx-music-source)
- [Huibq/keep-alive](https://github.com/Huibq/keep-alive)
- [Cloudflare Pages 文档](https://developers.cloudflare.com/pages/)

## License

MIT — 仅供学习交流。音乐版权归原平台与权利人所有。
