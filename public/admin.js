/* 组织者后台 · /admin
   密码 = 服务端的 ADMIN_KEY，登录后拿一个 HttpOnly cookie 会话。
   页面本身没有任何数据，所有内容都要过 /api/admin/* 的鉴权才拿得到。 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var LANG = 'en';
  var LANG_KEY = 'insightplay_lang';   // 跟前台共用同一个语言选择
  var DATA = null;
  var timer = null;

  var A = {
    en: {
      'login.title': 'Organiser access',
      'login.sub': 'Enter the admin key to see results and comments.',
      'login.label': 'Admin key',
      'login.cta': 'Sign in',
      'login.bad': 'Wrong key. Try again.',
      'login.rate': 'Too many attempts — wait a few minutes.',
      'login.none': 'ADMIN_KEY is not set on the server, so the dashboard is disabled.',
      'login.net': 'Cannot reach the server.',
      'login.session': 'Key accepted, but the browser did not keep the session cookie. If this site is on plain http://, use https:// — or check that only one server instance is running.',

      'dash.kicker': 'Organiser dashboard',
      'dash.h2': 'Results and comments',
      'dash.sub': 'Voting closes {deadline} · results announced {date}',
      'dash.subClosed': 'Voting closed {deadline} · results announced {date}',
      'dash.refresh': 'Refresh',
      'dash.csv': 'Download CSV',
      'dash.logout': 'Sign out',
      'dash.ranking': 'Ranking',
      'dash.rankNote': 'Stars decide the winner. Backers = how many people gave it at least one star; Avg = how many each of them gave. Same star total can mean "many people, a little each" or "a few superfans" — worth a look before you announce.',
      'dash.comments': 'Comments',
      'dash.noComments': 'No comments yet.',
      'dash.empty': 'No votes yet.',
      'dash.foot': 'Voter names and emails are personal data — do not share this page or the CSV outside the organising team.',
      'dash.live': 'Voting open',
      'dash.closed': 'Voting closed',

      'k.voters': 'Voters',
      'k.stars': 'Stars cast',
      'k.comments': 'Comments',
      'k.left': 'Days left',
      'k.ended': 'Ended',

      'r.stars': 'stars',
      'r.backers': 'backers',
      'r.avg': 'avg',
      'c.gave': 'gave',
    },
    zh: {
      'login.title': '组织者登录',
      'login.sub': '输入管理密钥，查看投票结果与留言。',
      'login.label': '管理密钥',
      'login.cta': '登录',
      'login.bad': '密钥不对，再试一次。',
      'login.rate': '尝试太多次了，等几分钟再来。',
      'login.none': '服务端没有设置 ADMIN_KEY，后台已关闭。',
      'login.net': '连不上服务器。',
      'login.session': '密钥是对的，但浏览器没留住会话 cookie。如果站点是 http:// 的，请改用 https://；也可能是平台跑了多个实例。',

      'dash.kicker': '组织者后台',
      'dash.h2': '投票结果与留言',
      'dash.sub': '投票截止 {deadline} · 结果 {date} 公布',
      'dash.subClosed': '投票已于 {deadline} 截止 · 结果 {date} 公布',
      'dash.refresh': '刷新',
      'dash.csv': '导出 CSV',
      'dash.logout': '退出',
      'dash.ranking': '排名',
      'dash.rankNote': '排名看星数。投它的人 = 有多少人给了它至少一颗；人均 = 这些人平均给几颗。同样的星数，可能是「很多人各给一点」，也可能是「少数人全押」—— 公布前值得看一眼。',
      'dash.comments': '留言',
      'dash.noComments': '还没有留言。',
      'dash.empty': '还没有人投票。',
      'dash.foot': '投票人姓名和邮箱属于个人数据 —— 这个页面和导出的 CSV 都不要发到组织团队之外。',
      'dash.live': '投票进行中',
      'dash.closed': '投票已截止',

      'k.voters': '投票人数',
      'k.stars': '已投出星数',
      'k.comments': '留言数',
      'k.left': '剩余天数',
      'k.ended': '已结束',

      'r.stars': '颗星',
      'r.backers': '人投它',
      'r.avg': '人均',
      'c.gave': '给了',
    },
  };

  function t(key, vals) {
    var s = (A[LANG] && A[LANG][key]) != null ? A[LANG][key] : (A.en[key] || key);
    if (vals) Object.keys(vals).forEach(function (k) { s = s.split('{' + k + '}').join(String(vals[k])); });
    return s;
  }
  function L(v) {
    if (v && typeof v === 'object') return v[LANG] != null ? v[LANG] : v.en;
    return v;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toast(msg, kind) {
    var el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = msg;
    $('toastHost').appendChild(el);
    setTimeout(function () { el.remove(); }, 3200);
  }

  /* ── 语言 ──────────────────────────────────────────── */
  function applyLang(lang) {
    LANG = lang === 'zh' ? 'zh' : 'en';
    try { localStorage.setItem(LANG_KEY, LANG); } catch (_) {}
    document.documentElement.lang = LANG === 'zh' ? 'zh-Hans' : 'en';
    document.querySelectorAll('[data-a]').forEach(function (el) { el.textContent = t(el.dataset.a); });
    document.querySelectorAll('#langSwitch button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.lang === LANG);
    });
    if (DATA) render();
  }

  /* ── 登录 ──────────────────────────────────────────── */
  function showLogin(msgKey) {
    $('dashView').hidden = true;
    $('loginView').hidden = false;
    if (msgKey) {
      var m = $('loginMsg');
      m.textContent = t(msgKey);
      m.className = 'form-msg show error';
    }
    setTimeout(function () { $('pw').focus(); }, 60);
  }

  function login(e) {
    e.preventDefault();
    var btn = $('loginBtn');
    btn.disabled = true;
    fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: $('pw').value }),
    })
      .then(function (r) {
        btn.disabled = false;
        if (r.ok) { $('pw').value = ''; $('loginMsg').className = 'form-msg'; return load(true); }
        showLogin(r.status === 429 ? 'login.rate' : r.status === 503 ? 'login.none' : 'login.bad');
      })
      .catch(function () { btn.disabled = false; showLogin('login.net'); });
  }

  /* ── 取数 ──────────────────────────────────────────── */
  /** justLoggedIn = 刚刚登录成功。这种情况下再拿到 401，说明密钥是对的、
      只是 cookie 没被浏览器留住 —— 最常见是站点跑在 http:// 上被 Secure
      标志挡掉，或者平台起了多个实例（会话存在内存里，换个实例就没了）。
      这跟「密钥不对」必须分开提示，否则只会看到登录页默默弹回来。 */
  function load(justLoggedIn) {
    return fetch('/api/admin/summary', { headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (r.status === 401) { showLogin(justLoggedIn ? 'login.session' : ''); return null; }
        if (!r.ok) throw new Error('bad');
        return r.json();
      })
      .then(function (data) {
        if (!data) return;
        DATA = data;
        $('loginView').hidden = true;
        $('dashView').hidden = false;
        render();
      })
      .catch(function () { toast(t('login.net'), 'error'); });
  }

  /* ── 渲染 ──────────────────────────────────────────── */
  function render() {
    var d = DATA;
    var deadline = L(d.event.deadlineText);
    var resultDate = L(d.event.resultDate);

    $('liveTag').textContent = d.votingOpen ? t('dash.live') : t('dash.closed');
    $('dashSub').textContent = t(d.votingOpen ? 'dash.sub' : 'dash.subClosed', { deadline: deadline, date: resultDate });

    $('kVoters').textContent = d.totals.voters;
    $('kStars').textContent = d.totals.totalStars;
    $('kComments').textContent = d.totals.comments;

    var msLeft = new Date(d.event.deadline).getTime() - Date.now();
    $('kLeft').textContent = msLeft > 0 ? Math.ceil(msLeft / 86400000) : t('k.ended');

    // 排名
    var max = Math.max.apply(null, d.ranked.map(function (r) { return r.stars; }).concat([1]));
    $('rankList').innerHTML = d.totals.voters === 0
      ? '<p class="a-empty">' + esc(t('dash.empty')) + '</p>'
      : d.ranked.map(function (r, i) {
          return '<div class="a-row" style="--a:' + esc(r.accent) + '">' +
            '<div class="a-pos">' + (i + 1) + '</div>' +
            (r.logo ? '<div class="a-g has-logo"><img src="' + esc(r.logo) + '" alt=""></div>'
                    : '<div class="a-g">' + esc(r.glyph) + '</div>') +
            '<div class="a-body">' +
              '<div class="a-top"><b>' + esc(r.name) + '</b>' +
              '<span class="a-num">' + r.stars + ' <em>' + esc(t('r.stars')) + '</em> · ' + r.share + '%</span></div>' +
              '<div class="bar"><i style="width:' + (r.stars / max * 100) + '%"></i></div>' +
              '<div class="a-sub">' + r.backers + ' ' + esc(t('r.backers')) + ' · ' + esc(t('r.avg')) + ' ' + r.avgFromBackers + '</div>' +
            '</div></div>';
        }).join('');

    // 留言
    var withItems = d.comments.filter(function (c) { return c.items.length; });
    $('commentList').innerHTML = withItems.length === 0
      ? '<p class="a-empty">' + esc(t('dash.noComments')) + '</p>'
      : withItems.map(function (c) {
          return '<section class="a-cgroup" style="--a:' + esc(c.accent) + '">' +
            '<h4>' + (c.logo ? '<span class="has-logo"><img src="' + esc(c.logo) + '" alt=""></span>'
                                : '<span>' + esc(c.glyph) + '</span>') + esc(c.name) +
            '<em>' + c.items.length + '</em></h4>' +
            c.items.map(function (it) {
              return '<blockquote class="a-c">' +
                '<p>' + esc(it.text) + '</p>' +
                '<footer>' + esc(it.from) + ' · ' + esc(t('c.gave')) + ' ' + '★'.repeat(it.stars) +
                ' <span>' + esc(String(it.at || '').slice(0, 10)) + '</span></footer>' +
              '</blockquote>';
            }).join('') +
          '</section>';
        }).join('');
  }

  /* ── 启动 ──────────────────────────────────────────── */
  function init() {
    $('loginForm').addEventListener('submit', login);
    $('refreshBtn').addEventListener('click', function () { load(); toast(t('dash.refresh')); });
    $('logoutBtn').addEventListener('click', function () {
      fetch('/api/admin/logout', { method: 'POST' }).then(function () {
        DATA = null;
        if (timer) clearInterval(timer);
        showLogin();
      });
    });
    $('langSwitch').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-lang]');
      if (b) applyLang(b.dataset.lang);
    });

    var saved = null;
    try { saved = localStorage.getItem(LANG_KEY); } catch (_) {}
    applyLang(saved || 'en');

    load();                                   // 有会话就直接进，没有就落到登录页
    timer = setInterval(function () {          // 开着页面时自动刷新
      if (!$('dashView').hidden) load();
    }, 60000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
