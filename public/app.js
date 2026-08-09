/* insightPLAY 票选站 · 前端
   投票规则（每人 N 颗星、单个上限、必须投完、一人一票、邮箱验证）服务端会再校验一遍；
   这里负责让规则「不用读说明也能看懂」：投不起的星星直接禁用，投满了才能提交。
   双语：默认英文，右上角可切；选择存 localStorage，提交时一并告诉服务端，
   验证邮件和验证页就会用同一种语言。 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var STATE = null;
  var BUDGET = 10;   // 由 /api/state 覆盖
  var MAX = 5;
  var COMMENTS = { enabled: true, maxLength: 200 };
  var alloc = {};    // { appId: 星数 }
  var notes = {};    // { appId: 留言 }

  var LANG = 'en';   // 默认英文
  var LANG_KEY = 'insightplay_lang';
  var DRAFT_KEY = 'insightplay_ballot_draft';  // 刷新页面不丢已分配的星
  var NOTES_KEY = 'insightplay_notes_draft';   // 留言草稿，同理
  var DONE_KEY = 'insightplay_vote_pending';   // 只是给自己看的提示，不当校验用

  /* ── i18n ──────────────────────────────────────────── */
  function t(key, vals) {
    var dict = (window.I18N && window.I18N[LANG]) || {};
    var fallback = (window.I18N && window.I18N.en) || {};
    var s = dict[key] != null ? dict[key] : (fallback[key] != null ? fallback[key] : key);
    if (vals) {
      Object.keys(vals).forEach(function (k) { s = s.split('{' + k + '}').join(String(vals[k])); });
    }
    return s;
  }
  /** config 里 { en, zh } 的字段取当前语言；普通字符串原样返回 */
  function L(value) {
    if (value && typeof value === 'object') return value[LANG] != null ? value[LANG] : value.en;
    return value;
  }

  /* ── 工具 ──────────────────────────────────────────── */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function toast(msg, kind) {
    var host = $('toastHost');
    var el = document.createElement('div');
    el.className = 'toast ' + (kind || '');
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .3s, transform .3s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(10px)';
      setTimeout(function () { el.remove(); }, 320);
    }, 4200);
  }

  /* ── 首屏：国庆烟花 ────────────────────────────────────
     国庆日发布，首屏用烟花 + 彩纸；纯 CSS 动画，零图片请求。 */
  function buildFireworks() {
    var host = $('starfield');
    if (!host) return;
    var small = window.innerWidth < 700;
    var html = '';

    // 底噪：细碎的白点
    for (var i = 0; i < (small ? 30 : 60); i++) {
      var d = (Math.random() * 1.7 + 0.8).toFixed(1);
      html += '<i style="left:' + (Math.random() * 100).toFixed(2) + '%;top:' + (Math.random() * 100).toFixed(2) +
        '%;width:' + d + 'px;height:' + d + 'px;opacity:' + (Math.random() * 0.45 + 0.15).toFixed(2) +
        ';animation-delay:' + (Math.random() * 7).toFixed(2) + 's"></i>';
    }
    // 烟花：每朵 12 根从中心射出的火星
    for (var f = 0; f < (small ? 3 : 5); f++) {
      var cx = 8 + Math.random() * 84, cy = 6 + Math.random() * 62;
      var scale = (small ? 0.7 : 1) * (0.75 + Math.random() * 0.6);
      var delay = (Math.random() * 6).toFixed(2);
      var spokes = '';
      for (var k = 0; k < 12; k++) {
        spokes += '<u style="--deg:' + (k * 30) + 'deg"></u>';
      }
      html += '<b class="fw" style="left:' + cx.toFixed(1) + '%;top:' + cy.toFixed(1) +
        '%;--s:' + scale.toFixed(2) + ';animation-delay:' + delay + 's">' + spokes + '</b>';
    }
    // 彩纸
    for (var c = 0; c < (small ? 8 : 16); c++) {
      html += '<s style="left:' + (Math.random() * 100).toFixed(2) + '%;top:' + (Math.random() * 100).toFixed(2) +
        '%;--r:' + Math.round(Math.random() * 360) + 'deg;animation-delay:' + (Math.random() * 8).toFixed(2) + 's"></s>';
    }
    host.innerHTML = html;
  }

  /** 首屏底图。配了图就用图（上面压一层暗色保证白字可读），
      同时收起 SVG 新月五星 —— 图里已经有国旗，两个一起显得乱。 */
  function applyHeroImage() {
    var src = STATE && STATE.hero && STATE.hero.image;
    if (!src) return;
    var hero = document.querySelector('.hero');
    if (!hero) return;
    hero.style.setProperty('--hero-img', 'url("' + src + '")');
    hero.classList.add('has-photo');
  }

  /* ── 倒计时 ────────────────────────────────────────── */
  var cdTimer = null;
  function renderCountdown() {
    var host = $('countdown');
    if (!STATE) return;
    var left = new Date(STATE.event.deadline).getTime() - Date.now();
    if (left <= 0) {
      host.innerHTML = '<div class="cd-closed">' + esc(t('hero.closed', { date: L(STATE.event.resultDate) })) + '</div>';
      if (cdTimer) clearInterval(cdTimer);
      return;
    }
    var s = Math.floor(left / 1000);
    var parts = [
      [Math.floor(s / 86400), t('cd.days')],
      [Math.floor(s / 3600) % 24, t('cd.hrs')],
      [Math.floor(s / 60) % 60, t('cd.min')],
      [s % 60, t('cd.sec')],
    ];
    host.innerHTML = parts.map(function (p) {
      return '<div class="cd-unit"><b>' + String(p[0]).padStart(2, '0') + '</b><span>' + esc(p[1]) + '</span></div>';
    }).join('');
  }

  /** 作品头像：配了 logo 就用图，没配回落到 emoji。
      两处都用它 —— 卡片头部和提交弹窗里的已选列表。 */
  function iconHtml(a, cls) {
    return a.logo
      ? '<span class="' + cls + ' has-logo"><img src="' + esc(a.logo) + '" alt="" loading="lazy" decoding="async"></span>'
      : '<span class="' + cls + '">' + esc(a.glyph) + '</span>';
  }

  /* ══ 投星 ══════════════════════════════════════════════ */
  var spent = function () {
    return Object.keys(alloc).reduce(function (s, k) { return s + alloc[k]; }, 0);
  };
  var remaining = function () { return BUDGET - spent(); };

  /** 从草稿恢复，但要按当前配置重新校验 —— 旧草稿（比如作品换了）不能污染这次投票 */
  function loadDraft() {
    alloc = {};
    try {
      var raw = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}');
      var valid = {};
      STATE.apps.forEach(function (a) { valid[a.id] = true; });
      var sum = 0;
      Object.keys(raw).forEach(function (k) {
        var v = raw[k];
        if (valid[k] && typeof v === 'number' && v === Math.floor(v) && v > 0 && v <= MAX && sum + v <= BUDGET) {
          alloc[k] = v;
          sum += v;
        }
      });
    } catch (_) { alloc = {}; }

    notes = {};
    try {
      var rawNotes = JSON.parse(localStorage.getItem(NOTES_KEY) || '{}');
      Object.keys(rawNotes).forEach(function (k) {
        if (alloc[k] && typeof rawNotes[k] === 'string') notes[k] = rawNotes[k].slice(0, COMMENTS.maxLength);
      });
    } catch (_) { notes = {}; }
  }
  function saveDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(alloc));
      localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
    } catch (_) {}
  }

  /** 重画所有星星 + 底部投票条。星星总共 5×5 个，整体重画最省心也够快。 */
  function refresh() {
    var left = remaining();

    STATE.apps.forEach(function (a) {
      var n = alloc[a.id] || 0;
      var affordable = Math.min(MAX, n + left);   // 这个作品最多还能加到几颗
      var box = document.querySelector('.alloc[data-app="' + a.id + '"]');
      if (!box) return;

      box.classList.toggle('has', n > 0);
      box.querySelector('.alloc-n').textContent = n + ' / ' + MAX;
      // 星全花在别处时，这张卡的星星会整排禁用 —— 直接说清楚为什么，别让人乱点
      var starved = n === 0 && affordable === 0;
      box.classList.toggle('starved', starved);
      box.querySelector('.alloc-label').textContent = starved ? t('card.outOfStars') : t('card.howMany');

      box.querySelectorAll('.star').forEach(function (s) {
        var k = +s.dataset.n;
        s.classList.toggle('on', k <= n);
        s.disabled = k > affordable;
        s.setAttribute('aria-pressed', k <= n ? 'true' : 'false');
      });

      var card = $('card-' + a.id);
      if (card) card.classList.toggle('is-voted', n > 0);
    });

    refreshBallot();
    saveDraft();
  }

  function refreshBallot() {
    var used = spent();
    var left = BUDGET - used;
    var bar = $('ballot');

    $('pips').innerHTML = Array.from({ length: BUDGET }, function (_, i) {
      return '<span class="pip' + (i < used ? ' on' : '') + '"></span>';
    }).join('');

    $('ballotTxt').innerHTML = left > 0 ? t('ballot.left', { n: left }) : t('ballot.done', { n: BUDGET });

    bar.classList.toggle('ready', left === 0);
    $('openVote').disabled = left !== 0;
    $('resetBallot').hidden = used === 0;
  }

  function showBallot() {
    if (!STATE.votingOpen) return;
    var bar = $('ballot');
    if (bar.hidden) {
      bar.hidden = false;
      document.body.classList.add('has-ballot');
    }
  }

  /* ── 其他站点推荐 ──────────────────────────────────────
     显示在「投票成功」弹窗和「投票已截止」的首页。
     配图用内联 SVG：零请求、不会挂、深浅底都好看；
     想换真图就在 config.js 里填 image 字段。 */
  var PROMO_ART = {
    cards: '<svg viewBox="0 0 400 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
      '<defs><linearGradient id="pgA" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="#EF3340"/><stop offset="1" stop-color="#A5121F"/></linearGradient></defs>' +
      '<rect width="400" height="120" fill="url(#pgA)"/>' +
      '<circle cx="60" cy="24" r="46" fill="#fff" opacity=".08"/>' +
      '<circle cx="350" cy="104" r="56" fill="#fff" opacity=".07"/>' +
      '<g transform="translate(200 66)">' +
        '<g transform="rotate(-18) translate(-74 0)"><rect x="-27" y="-40" width="54" height="78" rx="7" fill="#FFF7ED" opacity=".92"/><text x="0" y="8" font-size="26" text-anchor="middle" fill="#DC2626">♥</text></g>' +
        '<g transform="rotate(-6) translate(-25 -5)"><rect x="-27" y="-40" width="54" height="78" rx="7" fill="#fff"/><text x="0" y="8" font-size="26" text-anchor="middle" fill="#111827">♠</text></g>' +
        '<g transform="rotate(8) translate(25 -3)"><rect x="-27" y="-40" width="54" height="78" rx="7" fill="#FEF9C3"/><text x="0" y="8" font-size="26" text-anchor="middle" fill="#EA580C">★</text></g>' +
        '<g transform="rotate(20) translate(74 4)"><rect x="-27" y="-40" width="54" height="78" rx="7" fill="#FFF7ED" opacity=".92"/><text x="0" y="8" font-size="26" text-anchor="middle" fill="#DC2626">♦</text></g>' +
      '</g></svg>',

    play: '<svg viewBox="0 0 400 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
      '<defs><linearGradient id="pgB" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="#C81E2C"/><stop offset="1" stop-color="#EF3340"/></linearGradient></defs>' +
      '<rect width="400" height="120" fill="url(#pgB)"/>' +
      '<circle cx="330" cy="20" r="50" fill="#fff" opacity=".09"/>' +
      '<circle cx="52" cy="108" r="44" fill="#fff" opacity=".07"/>' +
      '<g transform="translate(200 60)">' +
        '<rect x="-72" y="-30" width="144" height="60" rx="30" fill="#fff" opacity=".96"/>' +
        '<rect x="-46" y="-4" width="26" height="7" rx="3.5" fill="#C81E2C"/>' +
        '<rect x="-36" y="-14" width="7" height="26" rx="3.5" fill="#C81E2C"/>' +
        '<circle cx="34" cy="-6" r="7" fill="#EF3340"/><circle cx="50" cy="8" r="7" fill="#FFD8A8"/>' +
      '</g>' +
      '<g fill="#fff" opacity=".9">' +
        '<text x="96" y="34" font-size="19" text-anchor="middle">✦</text>' +
        '<text x="318" y="94" font-size="15" text-anchor="middle" opacity=".75">✦</text>' +
        '<text x="270" y="26" font-size="12" text-anchor="middle" opacity=".6">✦</text>' +
      '</g></svg>',
  };

  function renderPromos(host) {
    var list = (STATE && STATE.promos) || [];
    if (!host || !list.length) return false;
    host.innerHTML = list.map(function (pr) {
      var art = pr.image
        ? '<img src="' + esc(pr.image) + '" alt="" loading="lazy" decoding="async">'
        : (PROMO_ART[pr.art] || PROMO_ART.play);
      return '<a class="promo" href="' + esc(pr.url) + '" target="_blank" rel="noopener noreferrer"' +
        ' style="--a:' + esc(pr.accent || '#7C3AED') + '">' +
        '<span class="promo-art">' + art + '</span>' +
        '<span class="promo-body">' +
          '<span class="promo-url">' + esc(pr.label || pr.url) + '</span>' +
          '<b class="promo-title">' + esc(L(pr.title)) + '</b>' +
          '<span class="promo-blurb">' + esc(L(pr.blurb)) + '</span>' +
          '<span class="promo-cta">' + esc(L(pr.cta)) + ' →</span>' +
        '</span></a>';
    }).join('');
    return true;
  }

  /* ── 作品卡片 ──────────────────────────────────────── */
  function renderApps() {
    var grid = $('appGrid');
    var open = STATE.votingOpen;
    var totalStars = STATE.totalStars || 0;

    grid.innerHTML = STATE.apps.map(function (a) {
      var stars = STATE.stars ? (STATE.stars[a.id] || 0) : null;
      var pct = (stars != null && totalStars) ? Math.round((stars / totalStars) * 1000) / 10 : 0;

      var tallyHtml = STATE.reveal
        ? '<div class="tally">' +
            '<div class="tally-row"><span>' + esc(t('card.starsNow')) + '</span>' +
            '<b>' + esc(t('card.starsVal', { n: stars, pct: pct })) + '</b></div>' +
            '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
          '</div>'
        : '<div class="tally-secret">' + esc(t('card.secret')) + '</div>';

      var demoHtml = a.demoUrl
        ? '<a class="btn btn-demo" href="' + esc(a.demoUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(t('card.try')) + '</a>'
        : '<span class="btn btn-demo" aria-disabled="true">' + esc(t('card.soon')) + '</span>';

      var starsHtml = '';
      for (var k = 1; k <= MAX; k++) {
        starsHtml += '<button type="button" class="star" data-app="' + esc(a.id) + '" data-n="' + k + '"' +
          ' aria-pressed="false" aria-label="' + esc(a.name) + ': ' + k + '">★</button>';
      }

      var allocHtml = open
        ? '<div class="alloc" data-app="' + esc(a.id) + '">' +
            '<div class="alloc-head"><span class="alloc-label">' + esc(t('card.howMany')) + '</span>' +
            '<b class="alloc-n">0 / ' + MAX + '</b></div>' +
            '<div class="stars" role="group" aria-label="' + esc(a.name) + '">' + starsHtml + '</div>' +
          '</div>'
        : '<div class="alloc"><div class="alloc-closed">' + esc(t('card.closed')) + '</div></div>';

      return '' +
        '<article class="card" style="--a:' + esc(a.accent) + '" id="card-' + esc(a.id) + '">' +
          '<div class="card-top">' +
            iconHtml(a, 'glyph') +
            '<div><h3>' + esc(a.name) + '<em>' + esc(a.nameEn) + '</em></h3></div>' +
            '<div class="card-no">' + esc(a.no) + '</div>' +
          '</div>' +
          '<p class="tagline">' + esc(L(a.tagline)) + '</p>' +
          '<div class="chips">' +
            '<span class="chip accent">' + esc(L(a.subject)) + '</span>' +
            '<span class="chip">' + esc(L(a.skill)) + '</span>' +
          '</div>' +
          tallyHtml +
          '<div class="card-actions">' + demoHtml + '</div>' +
          allocHtml +
        '</article>';
    }).join('');
  }

  function onStarClick(e) {
    var s = e.target.closest('.star');
    if (!s || s.disabled) return;
    var id = s.dataset.app;
    var k = +s.dataset.n;
    // 再点一次当前那颗 = 把这个作品的星全收回来
    if ((alloc[id] || 0) === k) delete alloc[id];
    else alloc[id] = k;
    refresh();
    showBallot();
  }

  /* ── 弹窗 ──────────────────────────────────────────── */
  var modal = null;

  function currentPicks() {
    return STATE.apps
      .filter(function (a) { return alloc[a.id] > 0; })
      .sort(function (x, y) { return alloc[y.id] - alloc[x.id]; });
  }

  function openModal() {
    var picks = currentPicks();
    if (!picks.length || remaining() !== 0) return;

    $('modalPicks').innerHTML = picks.map(function (a) {
      // 每个投了星的作品配一个选填留言框；草稿里有就填回去
      var note = COMMENTS.enabled
        ? '<textarea class="pick-note" data-app="' + esc(a.id) + '" rows="1"' +
            ' maxlength="' + COMMENTS.maxLength + '"' +
            ' placeholder="' + esc(t('comment.ph')) + '">' + esc(notes[a.id] || '') + '</textarea>'
        : '';
      return '<li>' +
        '<div class="pick-head">' +
          iconHtml(a, 'g') +
          '<span class="n">' + esc(a.name) + '</span>' +
          '<span class="s">' + '★'.repeat(alloc[a.id]) + '<i>' + alloc[a.id] + '</i></span>' +
        '</div>' + note +
      '</li>';
    }).join('');
    $('commentPrivacy').hidden = !COMMENTS.enabled;

    $('modalForm').hidden = false;
    $('modalSent').hidden = true;
    hideMsg();
    modal.showModal();
    setTimeout(function () { $('fName').focus(); }, 60);
  }

  function closeModal() { modal.close(); }

  function showMsg(text, kind) {
    var el = $('formMsg');
    el.textContent = text;
    el.className = 'form-msg show ' + (kind || 'error');
  }
  function hideMsg() { $('formMsg').className = 'form-msg'; }

  /* ── 提交 ──────────────────────────────────────────── */
  function submit(e) {
    e.preventDefault();

    if (remaining() !== 0) { showMsg(t('err.spendAll', { n: BUDGET })); return; }

    var name = $('fName').value.trim();
    var email = $('fEmail').value.trim();
    var consent = $('fConsent').checked;

    if (!name) { showMsg(t('err.name')); $('fName').focus(); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { showMsg(t('err.email')); $('fEmail').focus(); return; }
    if (!consent) { showMsg(t('err.consent')); return; }

    hideMsg();
    var btn = $('submitBtn');
    btn.disabled = true;
    btn.textContent = t('modal.sending');

    // 只带上「投了星且写了字」的留言 —— 服务端也会照这条规则再拦一次
    var payloadNotes = {};
    Object.keys(notes).forEach(function (k) {
      if (alloc[k] > 0 && notes[k].trim()) payloadNotes[k] = notes[k].trim();
    });

    fetch('/api/vote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        allocation: alloc, comments: payloadNotes,
        name: name, email: email, consent: true, lang: LANG,
      }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, data: d }; }); })
      .then(function (res) {
        btn.disabled = false;
        btn.textContent = t('modal.submit');

        if (!res.ok) {
          showMsg(res.data.message || t('err.generic'));
          if (res.data.error === 'already_voted') {
            try { localStorage.setItem(DONE_KEY, 'done'); } catch (_) {}
          }
          return;
        }

        // 两种成功态：counted = 当场计入；pending = 等你去邮箱点链接
        var counted = res.data.status === 'counted';
        $('sentIcon').textContent = counted ? '🎉' : '📬';
        $('sentTitle').textContent = counted ? t('done.h3') : t('sent.h3');
        $('sentTips').innerHTML = counted
          ? t('done.tips', { n: BUDGET, date: esc(L(STATE.event.resultDate)) })
          : t('sent.tips');
        $('promoModalWrap').hidden = !renderPromos($('promoModal'));
        $('sentEmail').hidden = counted;      // 不发信就不用回显邮箱
        $('sentEmail').textContent = res.data.email;
        $('modalForm').hidden = true;
        $('modalSent').hidden = false;
        try {
          localStorage.setItem(DONE_KEY, counted ? 'done' : 'pending');
          localStorage.removeItem(DRAFT_KEY);
          localStorage.removeItem(NOTES_KEY);
        } catch (_) {}

        // 自己刚投的这 10 颗立刻算进星轨 —— 等 45 秒轮询才动会像没生效。
        // 只在「当场计入」时加；pending 的票服务端还没计，不能先画上去。
        if (counted && STATE) {
          STATE.starsCast = (Number(STATE.starsCast) || 0) + BUDGET;
          STATE.voters = (Number(STATE.voters) || 0) + 1;
          renderProgress();
        }

        // 本地开发才有：直接给出验证链接，省得去翻终端
        if (res.data.devLink) {
          var dl = $('devLink');
          dl.hidden = false;
          dl.innerHTML = esc(t('sent.devPrefix')) + ' <a href="' + esc(res.data.devLink) + '">' + esc(res.data.devLink) + '</a>';
        }
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = t('modal.submit');
        showMsg(t('err.network'));
      });
  }

  /* ── 语言 ──────────────────────────────────────────── */
  function applyLang(lang) {
    LANG = (lang === 'zh') ? 'zh' : 'en';
    try { localStorage.setItem(LANG_KEY, LANG); } catch (_) {}

    document.documentElement.lang = LANG === 'zh' ? 'zh-Hans' : 'en';
    document.title = t('meta.title');

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.dataset.i18n);
    });
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      el.innerHTML = t(el.dataset.i18nHtml);
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      el.placeholder = t(el.dataset.i18nPh);
    });
    document.querySelectorAll('#langSwitch button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.lang === LANG);
      b.setAttribute('aria-pressed', b.dataset.lang === LANG ? 'true' : 'false');
    });

    if (STATE) {
      fillMeta();
      renderApps();
      refresh();
      renderCountdown();
      renderProgress();
      if (!$('promoSection').hidden) renderPromos($('promoPage'));
      if (!$('promoModalWrap').hidden) renderPromos($('promoModal'));
    }
  }


  /* ══ 星光进度 ═══════════════════════════════════════════
     每 perStar 颗星点亮一颗；下一颗按百分比半亮。
     只画全场合计 —— 规则是 10 颗必须投完，总星数恒等于
     投票人数 × 10，所以这一栏不泄露任何「哪个作品领先」的信息。 */
  var STAR_PATH = 'M12 1.6 15.1 8l7 1-5.1 5 1.2 7-6.2-3.3L5.8 21l1.2-7L1.9 9l7-1Z';
  var STAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + STAR_PATH + '"/></svg>';
  // 半亮那颗要用同一个星形当遮罩，直接内联成 data URI，零额外请求
  var STAR_MASK = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='" +
    encodeURIComponent(STAR_PATH) + "' fill='%23000'/%3E%3C/svg%3E\")";
  var progLit = -1;    // 上一次点亮了几颗，用来只给「新亮的」加弹跳

  function progressCfg() {
    var c = (STATE && STATE.progress) || {};
    return {
      on: c.enabled !== false,
      per: Number(c.perStar) > 0 ? Number(c.perStar) : 100,
      goal: Number(c.goal) > 0 ? Number(c.goal) : 2000,
    };
  }

  function renderProgress() {
    var sec = $('progressSection');
    if (!sec || !STATE) return;
    var cfg = progressCfg();
    if (!cfg.on) { sec.hidden = true; return; }

    var stars = Number(STATE.starsCast) || 0;
    var voters = Number(STATE.voters) || 0;
    var slots = Math.max(1, Math.min(40, Math.round(cfg.goal / cfg.per)));  // 上限 40 颗，再多排不下
    var lit = Math.min(slots, Math.floor(stars / cfg.per));
    var intoNext = stars % cfg.per;

    $('progStars').textContent = stars.toLocaleString();
    $('progVoters').textContent = voters.toLocaleString();
    $('progLit').textContent = lit + ' / ' + slots;

    var trail = $('progTrail');
    if (trail.childElementCount !== slots) {
      var html = '';
      for (var i = 0; i < slots; i++) html += '<span class="ps">' + STAR_SVG + '</span>';
      trail.innerHTML = html;
      trail.style.setProperty('--star-mask', STAR_MASK);
      progLit = -1;                       // 重建过就别再算「新亮」，避免整排一起弹
    }
    trail.setAttribute('aria-label', t('prog.lit') + ': ' + lit + ' / ' + slots);

    [].forEach.call(trail.children, function (el, i) {
      var on = i < lit;
      el.classList.toggle('on', on);
      // 只有本次刚跨过去的那几颗才弹一下
      el.classList.toggle('just', on && progLit >= 0 && i >= progLit);
      var partial = !on && i === lit && intoNext > 0 && lit < slots;
      el.classList.toggle('part', partial);
      el.style.setProperty('--fill', partial ? (intoNext / cfg.per * 100).toFixed(1) + '%' : '0%');
    });
    progLit = lit;

    var note = $('progNote');
    if (stars === 0) note.textContent = t('prog.first');
    else if (lit >= slots) note.innerHTML = t('prog.goal', { n: slots });
    else note.innerHTML = t('prog.next', { n: (cfg.per - intoNext).toLocaleString() });

    sec.hidden = false;
  }

  /** 轻量轮询：只在页面可见时拉，切到后台就停 —— 没必要为一个数字空转 */
  function watchProgress() {
    var timer = null;
    function tick() {
      if (document.hidden) return;
      fetch('/api/state').then(function (r) { return r.json(); }).then(function (d) {
        if (!d || typeof d.starsCast !== 'number') return;
        STATE.starsCast = d.starsCast;
        STATE.voters = d.voters;
        renderProgress();
      }).catch(function () {});
    }
    function start() { if (!timer) timer = setInterval(tick, 45000); }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop(); else { tick(); start(); }
    });
    start();
  }

  /* ── 带变量的文案 ──────────────────────────────────── */
  function fillMeta() {
    var ev = STATE.event;
    var deadline = L(ev.deadlineText);

    $('deadlineInline').textContent = deadline;
    $('appsSub').innerHTML = t('apps.sub', { audience: esc(L(ev.audience)), max: MAX, budget: BUDGET });
    $('footLegal2').textContent = t('foot.legal2', { year: new Date().getFullYear() });


    $('linkSite').href = ev.siteUrl;
    $('linkPlay').href = ev.playUrl;
    $('linkMail').href = 'mailto:' + ev.contactEmail;
  }

  /* ── 启动 ──────────────────────────────────────────── */
  function init() {
    modal = $('voteModal');

    // 监听只绑一次 —— 切语言会重画卡片，绑在容器上才不会叠加
    $('appGrid').addEventListener('click', onStarClick);
    $('modalClose').addEventListener('click', closeModal);
    $('sentClose').addEventListener('click', closeModal);
    $('voteForm').addEventListener('submit', submit);
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal(); });
    $('openVote').addEventListener('click', openModal);
    $('resetBallot').addEventListener('click', function () {
      alloc = {};
      notes = {};
      refresh();
      toast(t('toast.reset', { n: BUDGET }), 'ok');
    });
    // 留言实时收进草稿，关掉弹窗再打开还在
    $('modalPicks').addEventListener('input', function (e) {
      var ta = e.target.closest('.pick-note');
      if (!ta) return;
      notes[ta.dataset.app] = ta.value;
      saveDraft();
    });
    $('langSwitch').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-lang]');
      if (b) applyLang(b.dataset.lang);
    });

    var saved = null;
    try { saved = localStorage.getItem(LANG_KEY); } catch (_) {}
    applyLang(saved || 'en');   // 默认英文
    buildFireworks();           // 动画由 CSS 的 prefers-reduced-motion 关掉

    fetch('/api/state')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        STATE = data;
        if (data.ballot) { BUDGET = data.ballot.budget; MAX = data.ballot.maxPerApp; }
        if (data.comments) COMMENTS = data.comments;

        applyHeroImage();
        fillMeta();
        renderApps();
        loadDraft();
        refresh();
        renderCountdown();
        cdTimer = setInterval(renderCountdown, 1000);
        renderProgress();
        watchProgress();

        // 投票已截止就把推荐区放出来（投票中不显示，别抢投票的注意力）
        if (!STATE.votingOpen && renderPromos($('promoPage'))) $('promoSection').hidden = false;

        if (spent() > 0) showBallot();
        // 滚到作品区就把投票条推出来，别一进首屏就压一条
        if (STATE.votingOpen && 'IntersectionObserver' in window) {
          new IntersectionObserver(function (entries, obs) {
            if (entries.some(function (x) { return x.isIntersecting; })) { showBallot(); obs.disconnect(); }
          }, { rootMargin: '-10% 0px' }).observe($('apps'));
        }

        try {
          if (localStorage.getItem(DONE_KEY)) toast(t('toast.already'), 'ok');
        } catch (_) {}
      })
      .catch(function () {
        $('appGrid').innerHTML = '<p style="color:var(--danger)">' + esc(t('apps.loadErr')) + '</p>';
        toast(t('toast.loadFail'), 'error');
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
