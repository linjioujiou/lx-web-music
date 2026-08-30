# LX Web · 在线音乐播放器

可部署到 **Cloudflare Pages** 的网页端音乐播放器。播放链接使用 `lx-music-desktop` 自定义音源的 `request / musicUrl` 协议，并接入 ikun 桌面音源。

> 仅供在线试听学习交流，请勿用于批量下载或商业用途；请遵守各音乐平台与音源服务条款，控制请求频率。

## 功能

- 多平台搜索：网易云 / QQ 音乐 / 酷我 / 酷狗
- 播放地址解析：使用 ikun 桌面音源脚本声明的平台、动作和音质
- 播放列表（localStorage 持久化）、上一曲/下一曲、顺序/循环/单曲/随机
- 展示音源声明的全部音质，播放失败时自动逐级降级
- 歌词展示（网易云 / QQ / 酷我 / 酷狗，尽力而为）
- 响应式深色 UI，支持 Media Session（部分浏览器锁屏控制）

## 架构

```
浏览器
  ├─ 搜索  → /api/search  (Pages Function 代理各平台公开搜索 API)
  ├─ 取链  → /api/url     (Pages Function → 桌面音源 request/musicUrl 协议)
  └─ 歌词  → /api/lyric   (Pages Function 代理歌词 API)
```

音源约定与洛雪桌面版一致：播放 ID 使用 `hash ?? songmid`，平台代码为 `wy` / `tx` / `kw` / `kg`。

## 目录结构

```
.
├── index.html
├── css/style.css
├── js/app.js
├── functions/
│   └── api/
│       ├── search.js   # GET /api/search?q=&source=&limit=
│       ├── url.js      # 桌面音源 request/musicUrl 兼容层
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
| `source` | `wy` `tx` `kw` `kg` |
| `limit` | 1–50，默认 20 |

### `POST /api/url`（洛雪桌面版音源协议）

Body JSON：

```json
{
  "requestKey": "request__123",
  "data": {
    "source": "wy",
    "action": "musicUrl",
    "info": {
      "type": "320k",
      "musicInfo": { "songmid": "123", "name": "...", "singer": "..." }
    }
  }
}
```

每次请求只解析指定音质。浏览器若无法播放该 URL，会按照当前平台的音质列表逐级降低并重新发送请求。

返回示例：

```json
{
  "code": 0,
  "requestKey": "request__123",
  "result": {
    "source": "wy",
    "action": "musicUrl",
    "data": { "type": "320k", "url": "https://..." }
  }
}
```
### `GET /api/lyric`

| 参数 | 说明 |
|------|------|
| `source` | 音源 |
| `id` | 歌曲 id / mid |

## 注意事项

1. **第三方音源可用性**：ikun 音源可能限流或临时失效；指定音质失败时页面会自动尝试更低音质。
2. **CORS / 防盗链**：播放地址由第三方 CDN 提供，极少数链接可能因防盗链无法在浏览器直接播放。
3. **合规**：本项目不托管音乐文件，仅做检索与链接解析的前端演示；请合理使用，勿高频爬取。
4. **更换桌面音源**：需要同步修改 `functions/api/url.js` 的请求实现，以及 `functions/api/platforms.js` 中音源 `inited.sources` 声明的平台和音质。

## 相关链接

- [lx-music-desktop](https://github.com/lyswhut/lx-music-desktop)
- [Cloudflare Pages 文档](https://developers.cloudflare.com/pages/)

## License

MIT — 仅供学习交流。音乐版权归原平台与权利人所有。
