# insightPLAY × 小菜创业帮 · 学生作品公开票选站

五个学生作品公开票选，**星数最高**的一个由 InsightEDU.io 做成正式上线的 Web App。

**投票方式**：每人 **10 颗星**，单个作品最多 **5 颗**，10 颗必须全部投完 —— 所以至少得选两个作品。
逼投票人做取舍，「他怎么分配」本身就是有用的信号；每张票权重一样，汇总出来的星数才可比。

**流程**：浏览作品 → 分掉 10 颗星 → 填姓名 + 邮箱 → 提交，**当场计入**。
**规则**：一个邮箱一张票；提交那一刻就锁定，不能改。

> ⚠️ **当前不做邮箱验证**（`config.js` 里 `requireEmailVerification: false`），
> 只校验邮箱格式。这意味着**「一人一票」只是名义上的** —— 谁都能敲一个不存在的
> 邮箱投票，我们无法证明地址属于他，也挡不住换个邮箱重投。
> 剩下的防线只有格式校验、一次性邮箱黑名单和限流（见第 4 节）。
> 把这个开关改回 `true` 就恢复「点链接才计票」，发信和验证页的代码都还在。

**隐私**：作者是未成年人，站上**不显示组别和成员姓名** —— 卡片只有作品本身。

**语言**：站点默认**英文**，导航右上角可切中文。投票人选的语言会跟着走 ——
验证邮件、验证结果页、接口报错都用同一种语言。

与慧眼家庭OS 完全独立 —— 单独一个 Express 服务，不共用代码和数据。

---

## 1. 本地跑起来

```bash
cd insightplay-vote && npm install && npm run dev
```

打开 http://localhost:4090 。

当前不发任何邮件，填完姓名邮箱点提交就计票了。
（若把 `requireEmailVerification` 打开，`npm run dev` 会用 console 发信模式：
不真的发信，验证链接直接显示在弹窗和终端里，一个人也能把流程点完。）

## 2. 上线前只要改这几处

### ① `config.js` —— 内容（唯一需要改的文件）

| 改什么 | 说明 |
|---|---|
| `apps[].name / nameEn / tagline` | 作品名和一句话卖点（卡片只显示这一句）；`tagline` 要写 `{ en, zh }` 两种 |
| `apps[].demoUrl` | 试玩链接。外部站点写完整 URL，本站托管的写 `/demos/xxx/`；留空 = 显示「即将开放」 |
| `apps[].logo` | 作品 logo，放 `public/logos/` 再填 `/logos/xxx.jpg`。方图最好（会铺满 56×56 的圆角方块）；不填才回落到 `glyph` |
| `apps[].glyph / accent` | 没有 logo 时的备用 emoji，和卡片主色（五个作品各一个色，别重） |
| `apps[].subject / skill` | 都是 `{ en, zh }` 双语对象，两种都要填 |
| `ballot.budget / maxPerApp` | 每人几颗星 / 单个作品上限（默认 10 / 5） |
| `comments.enabled / maxLength` | 是否开留言、每条上限字数（默认 开 / 200） |
| `event.deadline` | 投票截止（**带时区**，`+08:00` = 新加坡） |
| `event.resultDate` | 结果公布日期，`{ en, zh }` |
| `revealResults` | `false` = 计票中保密（推荐）；`true` = 前端实时显示星数 |
| `requireEmailVerification` | `false`（当前）= 不发信，提交即计票；`true` = 点验证链接才计票 |

> ⚠️ 开投之后**不要改** `apps[].id` 和 `ballot` 两个数字 ——
> 星是按 id 存的，改 id 等于把已有的票作废；改 budget 会让先投和后投的票权重不一致。
> 作品增删同理：请在开投前定稿。
>
> 启动时会自检 `budget ≤ 作品数 × maxPerApp`，配成投不出去的组合会直接报错退出。

### ② 环境变量 —— 后台（发信当前用不到）

复制 `.env.example`：

```bash
PUBLIC_BASE_URL=https://vote.insightedu.io   # 站点对外地址
ADMIN_KEY=<一长串随机字符>                    # 不设的话 /api/admin/* 全部关闭
```

**下面这些只在 `requireEmailVerification: true` 时才需要**，
当前配置下不发任何邮件，可以先不管。发信通道三选一，按环境变量自动判断：

| 通道 | 配置 | 说明 |
|---|---|---|
| Resend | `RESEND_API_KEY` | **推荐**。零依赖，走 HTTP API，免费额度够这类活动 |
| SMTP | `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | Gmail 要用「应用专用密码」；需 `npm i nodemailer` |
| console | 都不配 | 只打印，不发信 —— **只能本地用** |

`MAIL_FROM` 建议用自己域名（如 `vote@insightedu.io`），域名验证做好，
否则大概率被 Gmail 丢进垃圾箱 —— 那样票会掉一大截。

### ③ 上线前自查

```bash
curl https://你的域名/api/health
```

应返回 `{"ok":true,"emailVerification":false,"mailer":"not used","votingOpen":true}`。

然后自己走一遍：分完 10 颗星 → 填姓名邮箱 → 提交 → 看到「投票成功」。
再用**同一个邮箱**投一次，应该被拒（这是当前唯一还生效的「一人一票」防线）。

> 若打开了邮箱验证，`mailer` 不能是 `console` —— 那样没人能投成票。

## 3. 组织者后台

### 网页版 Dashboard（推荐）

打开 **`/admin`**，用 `ADMIN_KEY` 当密码登录，就能看到：

- 四个概览数字：投票人数 / 已投出星数 / 留言数 / 剩余天数
- 排名列表：星数、占比条、投它的人数、人均星数
- 全部留言，按作品分组、按星数降序
- 一键导出 CSV、退出登录，中英文可切

登录后发一个 **HttpOnly cookie** 会话（8 小时），页面每分钟自动刷新一次。
登录接口对同 IP 限流（15 分钟 8 次），密码用常数时间比较。
**没设 `ADMIN_KEY` 的话后台整个关闭**，不会出现空密码蒙进去的情况。

> ⚠️ `ADMIN_KEY` 现在同时是后台登录密码，**请用一长串随机字符**，别用好记的词。
> 后台页面能看到全部投票人的姓名和邮箱 —— 这个链接不要外传。

### 命令行（脚本用，仍然支持 `?key=`）

```bash
# 实时排名（含未验证/待验证统计）
curl "https://你的域名/api/admin/results?key=$ADMIN_KEY"

# 导出全部投票人名单（星数一列、留言一列，Excel 直接打开，带 BOM 不乱码）
curl "https://你的域名/api/admin/export.csv?key=$ADMIN_KEY" -o votes.csv

# 按作品分组的留言，直接转给各队
curl "https://你的域名/api/admin/comments?key=$ADMIN_KEY"
```

**留言**：投票人可以给自己投了星的每个作品留一句话（选填，默认上限 200 字）。
留言**不在站上公开**，只进这两个后台接口 —— 作者都是孩子，公开 UGC 就要配审核和
举报流程，这个规模没必要背；不公开反而更容易收到真话。转给各队前请自己过一遍。

排名里每个作品有三个数，一起看才准：

| 字段 | 含义 | 怎么读 |
|---|---|---|
| `stars` | 总星数 | **排名看这个** |
| `backers` | 有多少人给它投了至少 1 颗 | 覆盖面：多少人认可它 |
| `avgFromBackers` | 投它的人平均给几颗 | 强度：是「真爱」还是「顺手给一颗」 |

高 `stars` 可能来自「很多人各给一点」，也可能来自「少数人全押 5 颗」——
这两种是完全不同的产品信号，公布结果前值得看一眼。

## 4. 防刷做了什么

> ⚠️ **当前关掉了邮箱验证**，下表里带 ⛔ 的那条是失效的。
> 也就是说：同一个邮箱挡得住，换个邮箱挡不住。

| 手段 | 效果 |
|---|---|
| 一个邮箱一张票 | 同一邮箱再投直接 409，且这一检查排在限流之前 |
| ⛔ 邮箱验证 | **当前关闭**。打开后：没点链接的票不计入，也不进任何统计 |
| 服务端复算选票 | 前端的禁用状态只是提示，星数上限/总数在 `/api/vote` 和 `/verify` 各校验一次 |
| Gmail 别名归一化 | `a.b+x@gmail.com` 和 `ab@gmail.com` 判为同一人 |
| 一次性邮箱黑名单 | mailinator / 10minutemail 等常见几十个域名直接拒 |
| 限流 | 同 IP 15 分钟 12 次、同邮箱 1 小时 4 封 |
| token 一次性 + 48h 过期 | 验证链接用完即弃，重新投票会让旧链接作废 |
| IP 只存哈希 | 能查异常，但不留可直接识别的个人数据 |

公开投票不可能做到绝对防刷。这套的目标是**让刷票的成本明显高于收益**；
真出现异常集中投票，用 `export.csv` 看注册时间和邮箱域名分布，人工复核后再宣布结果。

## 5. 部署

任何能跑 Node 18+ 的地方都行（Render / Railway / Fly / 自己的 VPS）：

```bash
NODE_ENV=production node server.js
```

**两个必须注意的点**：

1. **数据要落在持久化盘上。** 票存在 `data/votes-db.json`。Render 这类平台的
   容器文件系统重启就清空 —— 挂一块 Persistent Disk，然后 `DATA_DIR=/data`。
   不做这一步，**重启一次票全没了**。
2. **只能单进程跑。** 存储是「内存 + 原子落盘」，多实例会互相覆盖。
   票量到需要多实例的规模再换 SQLite/Postgres（改 `lib/store.js` 一个文件即可）。

## 6. 目录结构

```
insightplay-vote/
├── config.js            ← 五个作品 + 活动信息（改这个）
├── server.js            ← API + 邮箱验证页 + 静态服务
├── lib/
│   ├── store.js         ← JSON 存储（内存索引 + 原子写）
│   ├── mailer.js        ← Resend / SMTP / console 三通道 + 双语邮件模板
│   ├── i18n.js          ← 服务端文案（报错 / 验证页 / 邮件）
│   └── security.js      ← 校验、邮箱归一化、限流、转义
├── public/
│   ├── index.html       ← 票选主页（文案用 data-i18n 占位）
│   ├── admin.html       ← 组织者后台页面（/admin）
│   ├── admin.js         ← 后台登录 + Dashboard 渲染（自带中英文案）
│   ├── i18n.js          ← 前端全部固定文案（en / zh）
│   ├── styles.css       ← 全部样式（含验证结果页）
│   ├── app.js           ← 星空首屏、卡片渲染、倒计时、投星、语言切换
│   ├── logos/          ← 各作品的 logo（config.js 里 apps[].logo 指过来）
│   └── demos/           ← 打包托管的作品（目前只有 Study Safari）
└── data/votes-db.json   ← 投票数据（gitignore，记得备份）
```

> 改了 `styles.css` / `app.js` / `i18n.js` 之后，把 `index.html` 里的 `?v=36`
> **和 `server.js` 顶部的 `ASSET_V`** 一起往上加一位（验证页也引同一份 CSS），
> 否则回访用户拿到的还是浏览器缓存里的旧文件。

## 7. 接口一览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/state` | 首屏数据：作品、投票规则、截止时间、投票人数（保密模式下不含星数分项） |
| POST | `/api/vote` | 提交选票。`{allocation:{appId:星数,…}, comments:{appId:留言,…}, name, email, consent, lang}`。当前直接计票返回 `status:"counted"`；开了验证则发信返回 `status:"pending"` |
| GET | `/verify?token=` | 邮件里的链接，点了才真正计票（当前关闭，会 302 回首页） |
| GET | `/api/health` | 健康检查（含是否开验证、发信通道） |
| GET | `/admin` | 组织者后台页面（先登录） |
| POST | `/api/admin/login` | `{password}` → 发 HttpOnly 会话 cookie |
| POST | `/api/admin/logout` | 退出，清掉会话 |
| GET | `/api/admin/summary` | Dashboard 要的全部数据（排名 + 留言 + 概览） |
| GET | `/api/admin/results` | 排名（需 `ADMIN_KEY`） |
| GET | `/api/admin/export.csv` | 导出名单（含星数与留言，需 `ADMIN_KEY`） |
| GET | `/api/admin/comments` | 按作品分组的留言（需 `ADMIN_KEY`） |

## 8. 隐私

只收姓名和邮箱，用途只有计票和结果通知，页面和邮件里都写明「活动结束 30 天内删除」。
到期请真的删 —— 直接删掉 `data/votes-db.json` 里的 `users` 数组即可。
