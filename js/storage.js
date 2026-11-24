/* storage.js — সব ডেটা ফোনের ভেতরেই (localStorage) থাকে। কোনো সার্ভারে যায় না। */
'use strict';

const Store = {
  PREFIX: 'et_',
  get(key, fallback) {
    try {
      const v = localStorage.getItem(this.PREFIX + key);
      return v == null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(this.PREFIX + key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  },
  remove(key) { try { localStorage.removeItem(this.PREFIX + key); } catch (e) {} },

  /* Backup: API key বাদ দিয়ে সব ডেটা একটা অবজেক্টে */
  exportAll() {
    const out = { app: 'english-tutor', version: 1, date: new Date().toISOString(), data: {} };
    for (const k of ['settings', 'mistakes', 'words', 'bookmarks', 'progress']) {
      out.data[k] = this.get(k, null);
    }
    if (out.data.settings) {
      out.data.settings = Object.assign({}, out.data.settings, { geminiKey: '', claudeKey: '' });
    }
    return out;
  },
  importAll(obj) {
    if (!obj || obj.app !== 'english-tutor' || !obj.data) throw new Error('bad-file');
    const cur = this.get('settings', {});
    for (const [k, v] of Object.entries(obj.data)) {
      if (v == null) continue;
      if (k === 'settings') {
        // নিজের ফোনের API key রেখে দাও
        this.set(k, Object.assign({}, v, { geminiKey: cur.geminiKey || '', claudeKey: cur.claudeKey || '' }));
      } else {
        this.set(k, v);
      }
    }
  },
  wipe() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(this.PREFIX)) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
  }
};

const DEFAULT_SETTINGS = {
  name: 'শিহাব',
  avatar: 'woman',        // man | woman | robot
  voiceGender: 'female',  // male | female
  rate: 0.95,             // কথার গতি
  silence: 2.5,           // কত সেকেন্ড চুপ থাকলে তোমার পালা শেষ
  recLang: 'en-IN',       // en-IN | en-US
  topic: 'mixed',
  provider: 'gemini',     // gemini | claude
  geminiKey: '',
  claudeKey: '',
  geminiModel: 'gemini-flash-lite-latest',
  claudeModel: 'claude-opus-5-5',
  enVoice: '',
  bnVoice: '',
  shadowing: true,
  recordVoice: true,
  wakeLock: true,
  micExplained: false,
  showTiming: false,
  settingsVer: 2
};

const Settings = {
  data: null,
  load() {
    const saved = Store.get('settings', {});
    this.data = Object.assign({}, DEFAULT_SETTINGS, saved);
    // পুরোনো ভার্সনের সেভ করা মডেল নাম (ধীর বা বন্ধ) নতুন দ্রুত মডেলে বদলে দিই
    if ((saved.settingsVer || 0) < 2 && Object.keys(saved).length) {
      if (/^gemini-(2.5-flash|3.5-flash-lite)$/.test(this.data.geminiModel || '')) this.data.geminiModel = DEFAULT_SETTINGS.geminiModel;
      this.data.settingsVer = 2;
      Store.set('settings', this.data);
    }
    return this.data;
  },
  get(k) { if (!this.data) this.load(); return this.data[k]; },
  set(k, v) { if (!this.data) this.load(); this.data[k] = v; Store.set('settings', this.data); },
  apiKey() { return this.get('provider') === 'claude' ? this.get('claudeKey') : this.get('geminiKey'); }
};

/* লেভেল: ১ (সহজ) থেকে ১০ (কঠিন)। পরপর ৩টা ঠিক হলে বাড়ে, ৩টা ভুল হলে কমে। */
const Progress = {
  data() { return Object.assign({ level: 1, ok: 0, bad: 0, recent: [] }, Store.get('progress', {})); },
  save(d) { Store.set('progress', d); },
  level() { return this.data().level; },
  record(correct) {
    const d = this.data();
    if (correct) { d.ok++; d.bad = 0; if (d.ok >= 3) { d.level = Math.min(10, d.level + 1); d.ok = 0; } }
    else { d.bad++; d.ok = 0; if (d.bad >= 3) { d.level = Math.max(1, d.level - 1); d.bad = 0; } }
    this.save(d);
  },
  remember(bn) {
    const d = this.data();
    d.recent = [bn].concat(d.recent.filter(x => x !== bn)).slice(0, 30);
    this.save(d);
  }
};

/* শব্দ খাতা ও সেভ করা বাক্য */
const Words = {
  all() { return Store.get('words', []); },
  add(bn, en) {
    if (!bn || !en) return;
    const list = this.all().filter(w => w.en.toLowerCase() !== en.toLowerCase());
    list.unshift({ bn, en, date: Date.now() });
    Store.set('words', list.slice(0, 500));
  },
  remove(en) { Store.set('words', this.all().filter(w => w.en !== en)); }
};

const Bookmarks = {
  all() { return Store.get('bookmarks', []); },
  has(en) { return this.all().some(b => b.en === en); },
  toggle(en, label) {
    let list = this.all();
    if (list.some(b => b.en === en)) { list = list.filter(b => b.en !== en); Store.set('bookmarks', list); return false; }
    list.unshift({ en, label: label || '', date: Date.now() });
    Store.set('bookmarks', list.slice(0, 500));
    return true;
  }
};
