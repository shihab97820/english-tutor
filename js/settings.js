/* settings.js — সেটিংস পেজ আর মেনুর অন্য তালিকাগুলো (কথোপকথন, ভুল, শব্দ, সেভ করা বাক্য) */
'use strict';

const Screens = {
  /* ---------------- কথোপকথন বাছাই ---------------- */
  roleplay() {
    const list = document.getElementById('roleList');
    list.innerHTML = '';
    for (const r of ROLES) {
      const b = el('button', 'row');
      b.innerHTML = `<span>${r.icon}</span>${esc(r.bn)}<small>${esc(r.en.split(';')[0])}</small>`;
      b.onclick = () => Nav.goHome(() => Tutor.startRoleplay(r.id));
      list.append(b);
    }
  },

  /* ---------------- আমার ভুল ---------------- */
  mistakes() {
    const list = document.getElementById('mistakeList');
    const all = Mistakes.all();
    list.innerHTML = '';
    document.getElementById('btnReviewNow').hidden = !Mistakes.pending().length;
    if (!all.length) { list.innerHTML = '<div class="empty">এখনো কোনো ভুল নেই। 🎉<br>অনুশীলনে ভুল করলে এখানে জমা হবে।</div>'; return; }
    for (const m of all) {
      const it = el('div', 'item');
      it.innerHTML = `<div class="bn"></div>${m.said ? '<div class="wrong"></div>' : ''}<div class="right"></div>
        <div class="meta"><span class="due"></span><span class="acts"><button class="hear">🔊</button><button class="del">🗑</button></span></div>`;
      it.querySelector('.bn').textContent = m.bn;
      if (m.said) it.querySelector('.wrong').textContent = m.said;
      it.querySelector('.right').textContent = '✅ ' + m.en;
      it.querySelector('.due').textContent = Mistakes.dueLabel(m) + (m.why ? ' · ' + m.why : '');
      it.querySelector('.hear').onclick = () => Voice.speak(m.en, 'en');
      it.querySelector('.del').onclick = async () => {
        if (await App.confirm('এই ভুলটা তালিকা থেকে মুছে ফেলবে?')) { Mistakes.remove(m.id); this.mistakes(); }
      };
      list.append(it);
    }
  },

  /* ---------------- শব্দ খাতা ---------------- */
  words() {
    const list = document.getElementById('wordList');
    const all = Words.all();
    list.innerHTML = '';
    if (!all.length) { list.innerHTML = '<div class="empty">এখনো কোনো শব্দ নেই।<br>উত্তর দেওয়ার মাঝে "দুষ্টু ইংরেজি কী?" এভাবে জিজ্ঞেস করলে শব্দটা এখানে জমা হবে।</div>'; return; }
    for (const w of all) {
      const it = el('div', 'item');
      it.innerHTML = `<div class="meta"><span class="bn" style="color:var(--text);font-size:1.05rem"></span><span class="acts"><button class="hear">🔊</button><button class="del">🗑</button></span></div><div class="right"></div>`;
      it.querySelector('.bn').textContent = w.bn;
      it.querySelector('.right').textContent = w.en;
      it.querySelector('.hear').onclick = () => Voice.speak(w.en, 'en', { rate: 0.8 });
      it.querySelector('.del').onclick = () => { Words.remove(w.en); this.words(); };
      list.append(it);
    }
  },

  /* ---------------- সেভ করা বাক্য ---------------- */
  bookmarks() {
    const list = document.getElementById('bookmarkList');
    const all = Bookmarks.all();
    list.innerHTML = '';
    if (!all.length) { list.innerHTML = '<div class="empty">এখনো কিছু সেভ করোনি।<br>ফিডব্যাকে বাক্যের পাশে ☆ চাপলে এখানে জমা হবে।</div>'; return; }
    for (const b of all) {
      const it = el('div', 'item');
      it.innerHTML = `<div class="right" style="color:var(--text)"></div><div class="meta"><span class="lbl"></span><span class="acts"><button class="hear">🔊</button><button class="del">🗑</button></span></div>`;
      it.querySelector('.right').textContent = b.en;
      it.querySelector('.lbl').textContent = b.label || '';
      it.querySelector('.hear').onclick = () => Voice.speak(b.en, 'en');
      it.querySelector('.del').onclick = () => { Bookmarks.toggle(b.en); this.bookmarks(); };
      list.append(it);
    }
  },

  /* ---------------- সেটিংস ---------------- */
  settings() {
    const f = document.getElementById('settingsForm');
    const S = Settings;
    f.innerHTML = '';

    const section = (t) => { const h = el('h3'); h.textContent = t; f.append(h); };
    const field = (label, help) => {
      const d = el('div', 'field');
      if (label) { const l = el('label'); l.textContent = label; d.append(l); }
      f.append(d);
      if (help) { const s = el('small'); s.innerHTML = help; d._help = s; }
      return d;
    };
    const done = (d) => { if (d._help) d.append(d._help); };
    const seg = (d, key, options, after) => {
      const w = el('div', 'seg');
      for (const [val, text] of options) {
        const b = el('button'); b.type = 'button'; b.textContent = text;
        if (S.get(key) === val) b.classList.add('on');
        b.onclick = () => { S.set(key, val); w.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); if (after) after(val); };
        w.append(b);
      }
      d.append(w); done(d);
    };
    const toggle = (label, key, help) => {
      const d = field('', help);
      const lab = el('label', 'switch');
      lab.innerHTML = `<span></span><input type="checkbox">`;
      lab.querySelector('span').textContent = label;
      const cb = lab.querySelector('input'); cb.checked = !!S.get(key);
      cb.onchange = () => S.set(key, cb.checked);
      d.append(lab); done(d);
    };
    const range = (label, key, min, max, step, fmt) => {
      const d = field('');
      const l = el('label'); d.append(l);
      const r = el('input'); r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = S.get(key);
      const show = () => { l.textContent = label + ': ' + fmt(parseFloat(r.value)); };
      r.oninput = () => { S.set(key, parseFloat(r.value)); show(); };
      show(); d.append(r); done(d);
      return r;
    };
    const text = (label, key, type, help, placeholder) => {
      const d = field(label, help);
      const i = el('input'); i.type = type || 'text'; i.value = S.get(key) || ''; i.placeholder = placeholder || '';
      i.autocomplete = 'off'; i.spellcheck = false;
      i.onchange = () => S.set(key, i.value.trim());
      d.append(i); done(d);
      return i;
    };

    // ---- তুমি ----
    section('তুমি');
    text('তোমার নাম (শুরুতে শিক্ষক এই নামে ডাকবে)', 'name');

    // ---- শিক্ষক ----
    section('শিক্ষকের চেহারা ও কণ্ঠ');
    const da = field('অ্যাভাটার');
    const pick = el('div', 'avatar-pick');
    for (const [id, name] of [['woman', 'নারী'], ['man', 'পুরুষ'], ['robot', 'রোবট']]) {
      const b = el('button'); b.type = 'button';
      b.innerHTML = Avatar.svg(id) + `<div>${name}</div>`;
      if (S.get('avatar') === id) b.classList.add('on');
      b.onclick = () => {
        S.set('avatar', id);
        pick.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on');
        Avatar.mount(document.getElementById('avatarBox'), id);
      };
      pick.append(b);
    }
    da.append(pick);

    seg(field('কণ্ঠ'), 'voiceGender', [['female', 'নারী কণ্ঠ'], ['male', 'পুরুষ কণ্ঠ']], () => { S.set('enVoice', ''); this.settings(); });
    range('কথার গতি', 'rate', 0.6, 1.3, 0.05, v => v.toFixed(2) + 'x');

    const voiceSelect = (label, key, prefix, sample, lang) => {
      const d = field(label, lang === 'bn'
        ? 'বাংলা কণ্ঠ না থাকলে: ফোনের Settings → Google → Text-to-speech (বা "Speech Services by Google") → Bengali (Bangladesh) ডাউনলোড করো।'
        : '');
      const s = el('select');
      const o0 = el('option'); o0.value = ''; o0.textContent = 'নিজে থেকে বেছে নাও (auto)'; s.append(o0);
      for (const v of Voice.list(prefix)) {
        const o = el('option'); o.value = v.name; o.textContent = `${v.name} (${v.lang})`;
        if (S.get(key) === v.name) o.selected = true;
        s.append(o);
      }
      s.onchange = () => S.set(key, s.value);
      const t = el('button', 'secondary'); t.type = 'button'; t.textContent = '▶ শুনে দেখো';
      t.onclick = () => Voice.speak(sample, lang);
      const row = el('div', 'inline'); row.append(s, t);
      d.append(row); done(d);
    };
    voiceSelect('ইংরেজি কণ্ঠ', 'enVoice', 'en', 'Hello! I went to the market yesterday.', 'en');
    voiceSelect('বাংলা কণ্ঠ', 'bnVoice', 'bn', 'আমি প্রতিদিন সকালে চা খাই।', 'bn');

    // ---- শোনা ----
    section('শোনা (মাইক)');
    range('কতক্ষণ চুপ থাকলে তোমার পালা শেষ', 'silence', 1.5, 6, 0.5, v => toBnNum(v.toFixed(1)) + ' সেকেন্ড');
    seg(field('তোমার ইংরেজি চেনার ধরন', 'বাংলাদেশি উচ্চারণের জন্য সাধারণত English (India) ভালো কাজ করে।'), 'recLang', [['en-IN', 'English (India)'], ['en-US', 'English (US)']]);
    toggle('🎧 নিজের কণ্ঠ রেকর্ড করো ("আমার কথা শুনি")', 'recordVoice', 'কিছু ফোনে এটা চালু থাকলে মাইক ঠিকমতো শোনে না। তখন বন্ধ করো (অ্যাপ নিজেও বন্ধ করে দেয়)।');
    toggle('🗣️ ভুলের পর "আমার সাথে বলো"', 'shadowing');
    toggle('📱 অনুশীলনের সময় স্ক্রিন জেগে থাকবে', 'wakeLock');
    toggle('⏱ কোন ধাপে কত সময় লাগছে দেখাও (পরীক্ষার জন্য)', 'showTiming', 'চালু করলে Home-এ তোমার কথার নিচে ছোট করে দেখাবে: শোনা শেষ হতে, AI-র প্রথম শব্দ আসতে, আর শিক্ষকের বলা শুরু হতে কত সেকেন্ড লাগল।');

    // ---- বিষয় ----
    section('বিষয়');
    seg(field('কোন বিষয়ের বাক্য চাও'), 'topic', Object.entries(TOPICS).map(([k, v]) => [k, v.bn]), () => { Practice.nextItem = null; });

    // ---- AI ----
    section('AI (API key)');
    seg(field('AI সার্ভিস'), 'provider', [['gemini', 'Google Gemini (ফ্রি)'], ['claude', 'Claude']], () => this.settings());
    if (S.get('provider') === 'claude') {
      text('Claude API key', 'claudeKey', 'password', 'console.anthropic.com → API Keys থেকে নাও। Claude ফ্রি নয়, ব্যবহার অনুযায়ী টাকা কাটে।', 'sk-ant-...');
      text('Claude মডেল', 'claudeModel', 'text', 'ডিফল্ট: claude-opus-5-5 (সবচেয়ে ভালো)। কম খরচে চাইলে claude-haiku-5-5 লেখো।');
    } else {
      text('Gemini API key', 'geminiKey', 'password', 'ফ্রি key: <b>aistudio.google.com/apikey</b> → "Create API key" → কপি করে এখানে বসাও।<br>কম্পিউটার থেকে বসাতে চাইলে কম্পিউটারে <b>setup.html</b> পেজটা খোলো (README-তে লিংক আছে), তারপর QR কোড স্ক্যান করো।', 'AIza...');
      text('Gemini মডেল', 'geminiModel', 'text', 'ডিফল্ট: gemini-flash-lite-latest (দ্রুত, thinking বন্ধ)। ব্যস্ত বা বন্ধ থাকলে অ্যাপ নিজেই অন্য মডেলে চলে যায়।');
    }
    const dt = field('', 'key শুধু এই ফোনে থাকে, সরাসরি Google/Anthropic-এ যায়। ব্যাকআপ ফাইলে key রাখা হয় না।');
    const tb = el('button', 'primary'); tb.type = 'button'; tb.textContent = '✔ key পরীক্ষা করো';
    tb.onclick = async () => {
      document.activeElement && document.activeElement.blur();
      tb.disabled = true; tb.textContent = 'পরীক্ষা চলছে…';
      try {
        const s = await AI.test();
        App.toast('কাজ করছে! ✅ ' + (s || ''));
        Tutor.setMic('idle');
      } catch (e) {
        const msg = { nokey: 'আগে key বসাও', badkey: 'key ভুল বা বাতিল', offline: 'ইন্টারনেট নেই', timeout: 'উত্তর আসতে দেরি হচ্ছে', ratelimit: 'তোমার key ঠিক আছে ✅, কিন্তু এখন ফ্রি কোটা শেষ। একটু পরে আবার চেষ্টা করো।', nomodel: 'মডেলের নাম ভুল',
          server: 'তোমার key ঠিক আছে ✅। শুধু Google-এর সার্ভার এখন খুব ব্যস্ত, অন্য মডেলেও চেষ্টা করেছি। ১–২ মিনিট পর আবার চেষ্টা করো।' }[e.code];
        App.dialog({ icon: '⚠️', title: 'কাজ করছে না', text: (msg || 'সমস্যা') + (e.detail ? '\n\n' + String(e.detail).slice(0, 200) : ''), buttons: [{ label: 'ঠিক আছে', primary: true }] });
      }
      tb.disabled = false; tb.textContent = '✔ key পরীক্ষা করো';
    };
    dt.append(tb); done(dt);

    // ---- ব্যাকআপ ----
    section('ব্যাকআপ');
    const db = field('', 'ফোন বদলালে বা অ্যাপ আবার install করলে ডেটা হারাতে পারে। মাঝে মাঝে ব্যাকআপ ফাইল সেভ করে রাখো (Google Drive-এ রাখলে আরও ভালো)।');
    const ex = el('button', 'secondary'); ex.type = 'button'; ex.textContent = '⬇ ব্যাকআপ ফাইল সেভ করো';
    ex.onclick = () => App.exportBackup();
    const imInput = el('input'); imInput.type = 'file'; imInput.accept = 'application/json,.json'; imInput.hidden = true;
    imInput.onchange = () => { if (imInput.files[0]) App.importBackup(imInput.files[0]); imInput.value = ''; };
    const im = el('button', 'secondary'); im.type = 'button'; im.textContent = '⬆ ব্যাকআপ থেকে ফেরত আনো';
    im.onclick = () => imInput.click();
    const row = el('div', 'inline'); row.append(ex, im, imInput);
    db.append(row); done(db);

    const dd = field('');
    const wipe = el('button', 'danger'); wipe.type = 'button'; wipe.textContent = '🗑 সব ডেটা মুছে ফেলো';
    wipe.onclick = async () => {
      if (await App.confirm('সব ভুল, শব্দ, সেভ করা বাক্য, লেভেল আর সেটিংস (API key সহ) চিরতরে মুছে যাবে। আগে ব্যাকআপ নিয়েছ তো? মুছবে?')) {
        Store.wipe(); location.reload();
      }
    };
    dd.append(wipe);

    const v = el('div', 'version'); v.textContent = 'English Tutor ' + APP_VERSION; f.append(v);
  }
};

function el(tag, cls) { const e = document.createElement(tag); if (cls) e.className = cls; return e; }
function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
