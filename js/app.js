/* app.js — স্ক্রিন বদল, ফোনের Back বোতাম, ডায়ালগ, ইন্টারনেট না থাকা, আর অ্যাপ চালু হওয়া */
'use strict';

const APP_VERSION = 'v1.4.0';

/* ================= Back বোতাম ও স্ক্রিন =================
   ব্রাউজারের history ব্যবহার করি: প্রতিটা ভেতরের স্ক্রিন খোলার সময় একটা ধাপ যোগ হয়,
   ফোনের Back চাপলে একটা ধাপ পেছনে যায়। Home-এ Back চাপলে বার্তা দেখায়,
   ২ সেকেন্ডের মধ্যে আবার Back চাপলে তবেই অ্যাপ বন্ধ হয়। */
const Nav = {
  stack: ['home'],
  lastExitTap: 0,
  onHome: null,
  exitTimer: null,

  init() {
    history.replaceState({ nav: 'exit' }, '');
    history.pushState({ nav: 'home' }, '');
    window.addEventListener('popstate', e => this.onPop(e));
    document.querySelectorAll('.screen .back').forEach(b => b.addEventListener('click', () => history.back()));
    document.getElementById('btnMenu').addEventListener('click', () => this.open('menu'));
    document.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => this.open(b.dataset.go)));
    document.getElementById('btnReviewNow').addEventListener('click', () =>
      this.goHome(() => { Tutor.setMode('practice'); Tutor.clearExtra(); Tutor.run('review'); }));
  },

  current() { return this.stack[this.stack.length - 1]; },

  open(name) {
    if (this.current() === name) return;
    App.closeDialog();
    if (this.current() === 'home') Tutor.suspend();
    this.stack.push(name);
    history.pushState({ nav: name }, '');
    this.show(name);
  },

  /* Home-এ ফিরে গিয়ে কিছু করা (যেমন role-play শুরু) */
  goHome(then) {
    const n = this.stack.length - 1;
    if (n <= 0) { if (then) then(); return; }
    this.onHome = then || null;
    history.go(-n);
  },

  onPop(e) {
    const s = e.state && e.state.nav;
    if (App.dialogOpen && App.dialogCancelable) { App.closeDialog(); }
    if (s === 'exit') {
      // Home থেকে Back
      clearTimeout(this.exitTimer);
      App.toast('বের হতে আবার Back চাপো');
      // ২ সেকেন্ডের মধ্যে আবার Back চাপলে কোনো পেছনের ধাপ থাকে না, তাই অ্যাপ বন্ধ হয়
      this.exitTimer = setTimeout(() => {
        if (!history.state || history.state.nav === 'exit') history.pushState({ nav: 'home' }, '');
      }, 2000);
      return;
    }
    const target = s || 'home';
    const idx = this.stack.lastIndexOf(target);
    if (idx >= 0) this.stack = this.stack.slice(0, idx + 1);
    else this.stack = ['home'];
    this.show(this.current());
  },

  show(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 'scr-' + name));
    if (name === 'home') {
      const then = this.onHome; this.onHome = null;
      if (then) then();
      else if (App.started) Tutor.autoResume();
    } else if (Screens[name]) {
      Screens[name]();
    }
  }
};

/* ================= ডায়ালগ, টোস্ট, অফলাইন ================= */
const App = {
  started: false,
  dialogOpen: false,
  dialogCancelable: false,
  _dialogResolve: null,
  wakeLock: null,

  dialog({ icon, title, text, buttons, cancelable }) {
    this.closeDialog();
    const ov = document.getElementById('overlay');
    document.getElementById('ovIcon').textContent = icon || '';
    document.getElementById('ovTitle').textContent = title || '';
    document.getElementById('ovText').textContent = text || '';
    const wrap = document.getElementById('ovButtons');
    wrap.innerHTML = '';
    this.dialogOpen = true;
    this.dialogCancelable = !!cancelable;
    return new Promise(resolve => {
      this._dialogResolve = resolve;
      (buttons || [{ label: 'ঠিক আছে', primary: true }]).forEach((b, i) => {
        const btn = document.createElement('button');
        btn.className = b.primary ? 'primary' : 'secondary';
        btn.textContent = b.label;
        btn.onclick = () => { this.closeDialog(b.value !== undefined ? b.value : i); };
        wrap.append(btn);
      });
      ov.hidden = false;
    });
  },
  closeDialog(value) {
    document.getElementById('overlay').hidden = true;
    this.dialogOpen = false;
    const r = this._dialogResolve; this._dialogResolve = null;
    if (r) r(value);
  },
  async confirm(text) {
    const v = await this.dialog({ icon: '❓', title: 'নিশ্চিত?', text, cancelable: true,
      buttons: [{ label: 'হ্যাঁ', primary: true, value: true }, { label: 'না', value: false }] });
    return v === true;
  },

  toast(text) {
    const t = document.getElementById('toast');
    t.textContent = text; t.hidden = false;
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => { t.hidden = true; }, 2600);
  },

  /* ইন্টারনেট নেই — অ্যাপ জমে যায় না, "আবার চেষ্টা" চাপলে আবার চলে */
  async offline(code) {
    const texts = {
      offline: ['📡', 'No internet', 'ইন্টারনেট সংযোগ নেই। Wi-Fi বা মোবাইল ডেটা চালু করে "আবার চেষ্টা" চাপো।'],
      timeout: ['⏳', 'Slow connection', 'উত্তর আসতে অনেক দেরি হচ্ছে। ইন্টারনেট দেখে আবার চেষ্টা করো।'],
      server: ['🛠️', 'Server busy', 'AI সার্ভারে এখন সমস্যা হচ্ছে। একটু পরে আবার চেষ্টা করো।']
    };
    const [icon, title, text] = texts[code] || texts.offline;
    Avatar.setState('idle');
    Tutor.setMic('paused');
    await this.dialog({ icon, title, text, buttons: [{ label: '🔄 আবার চেষ্টা', primary: true }] });
    Tutor.setMic('thinking');
  },

  async micDenied() {
    await this.dialog({ icon: '🎤', title: 'Microphone blocked',
      text: 'মাইকের অনুমতি বন্ধ আছে।\nফোনের Settings → Apps → English Tutor (বা Chrome) → Permissions → Microphone → Allow করো, তারপর "আবার চেষ্টা" চাপো।',
      buttons: [{ label: '🔄 আবার চেষ্টা', primary: true }] });
  },

  noSpeechSupport() {
    this.dialog({ icon: '😕', title: 'Speech not supported',
      text: 'এই ব্রাউজারে কথা শোনা (speech recognition) কাজ করে না। Android-এ Google Chrome ব্যবহার করো, আর ফোনে "Google" অ্যাপ চালু আছে কি না দেখো।' });
  },

  /* ব্রাউজার নিজে থেকে কথা বলতে না দিলে একবার ট্যাপ লাগে */
  async tapToStart() {
    await this.dialog({ icon: '👋', title: 'শুরু করি?', text: 'শিক্ষকের কথা শুনতে একবার নিচের বোতামে চাপো।',
      buttons: [{ label: '▶ শুরু করো', primary: true }] });
    Voice.blocked = false;
  },

  /* প্রথমবার: মাইক কেন লাগবে (ইংরেজিতে ছোট ব্যাখ্যা) */
  async micIntro() {
    await this.dialog({ icon: '🎤', title: 'Microphone access',
      text: 'English Tutor needs your microphone to hear your spoken English and check it.\nYour phone\'s speech service turns your voice into text, and only that text is sent to the AI tutor. Your practice data stays on this phone.\n\nমাইক দিয়ে তোমার ইংরেজি শুনে শিক্ষক ভুল ধরবে।',
      buttons: [{ label: 'Allow microphone', primary: true }] });
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach(t => t.stop());
    } catch (e) { /* পরে Listener নিজেই জানাবে */ }
    Settings.set('micExplained', true);
  },

  /* অনুশীলনের সময় স্ক্রিন বন্ধ হবে না */
  async keepAwake() {
    if (!Settings.get('wakeLock') || !('wakeLock' in navigator)) return;
    try {
      if (this.wakeLock && !this.wakeLock.released) return;
      this.wakeLock = await navigator.wakeLock.request('screen');
    } catch (e) {}
  },

  /* ---------- ব্যাকআপ ---------- */
  async exportBackup() {
    const data = JSON.stringify(Store.exportAll(), null, 1);
    const name = 'english-tutor-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    const file = new File([data], name, { type: 'application/json' });
    try {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'English Tutor backup' });
        return;
      }
    } catch (e) { if (e.name === 'AbortError') return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file); a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    this.toast('ব্যাকআপ ফাইল Downloads-এ সেভ হয়েছে');
  },
  async importBackup(file) {
    try {
      const obj = JSON.parse(await file.text());
      if (!(await this.confirm('ব্যাকআপ থেকে ফেরত আনলে এখনকার ভুল/শব্দ/সেভ করা বাক্য বদলে যাবে। চালাবে?'))) return;
      Store.importAll(obj);
      Settings.load();
      this.toast('ব্যাকআপ ফেরত আনা হয়েছে ✅');
      Screens.settings();
    } catch (e) {
      this.dialog({ icon: '⚠️', title: 'ফাইলটা ঠিক নয়', text: 'এটা English Tutor-এর ব্যাকআপ ফাইল মনে হচ্ছে না।' });
    }
  },

  /* ---------- চালু ---------- */
  /* কম্পিউটারের setup.html থেকে QR স্ক্যান করলে লিংকের # অংশে key আসে।
     # অংশ কোনো সার্ভারে যায় না। সেভ করে সাথে সাথে লিংক থেকে মুছে ফেলি। */
  importSetupLink() {
    const m = location.hash.match(/^#setup=(.+)$/);
    if (!m) return false;
    history.replaceState(null, '', location.pathname + location.search);
    try {
      const d = JSON.parse(decodeURIComponent(escape(atob(decodeURIComponent(m[1])))));
      if (d.provider === 'claude' && d.key) { Settings.set('claudeKey', d.key); Settings.set('provider', 'claude'); }
      else if (d.key) { Settings.set('geminiKey', d.key); Settings.set('provider', 'gemini'); }
      if (d.name) Settings.set('name', d.name);
      return !!d.key;
    } catch (e) { return false; }
  },

  async boot() {
    Settings.load();
    const fromSetup = this.importSetupLink();
    Voice.init();
    Tutor.init();
    Nav.init();

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).catch(() => {});
    }

    // অ্যাপ background-এ গেলে মাইক বন্ধ, সামনে এলে আবার চালু
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) { if (Nav.current() === 'home') Tutor.suspend(); }
      else {
        this.keepAwake();
        if (Nav.current() === 'home' && this.started && !this.dialogOpen) Tutor.autoResume();
      }
    });
    window.addEventListener('online', () => { if (this.dialogOpen && document.getElementById('ovTitle').textContent === 'No internet') this.closeDialog(); });

    if (fromSetup) this.toast('API key সেভ হয়েছে ✅');
    if (!Listener.supported()) { this.noSpeechSupport(); }
    if (!Settings.get('micExplained')) await this.micIntro();

    this.started = true;
    Tutor.start();
  }
};

window.addEventListener('DOMContentLoaded', () => App.boot());
