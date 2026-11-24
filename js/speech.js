/* speech.js — কণ্ঠ (Text-to-Speech) আর মাইক (Speech Recognition)
   গুরুত্বপূর্ণ: ব্রাউজারের মাইক অল্প চুপ থাকলেই নিজে থেকে বন্ধ হয়ে যায়।
   তাই আমরা continuous mode-এ চালাই, বন্ধ হলে সাথে সাথে আবার চালু করি, আর সব টুকরো
   জুড়ে একটা উত্তর বানাই — যতক্ষণ না তুমি ~২.৫ সেকেন্ড চুপ থাকো বা "শেষ" চাপো। */
'use strict';

/* ================= TTS ================= */
const Voice = {
  voices: [],
  speakingNow: false,
  _resolve: null,
  _timer: null,
  blocked: false,

  init() {
    if (!('speechSynthesis' in window)) return;
    const load = () => { this.voices = speechSynthesis.getVoices() || []; };
    load();
    speechSynthesis.onvoiceschanged = load;
  },

  list(prefix) { return this.voices.filter(v => (v.lang || '').toLowerCase().replace('_', '-').startsWith(prefix)); },

  pick(lang) {
    const want = lang === 'bn' ? Settings.get('bnVoice') : Settings.get('enVoice');
    if (want) { const v = this.voices.find(x => x.name === want); if (v) return v; }
    if (lang === 'bn') {
      const bn = this.list('bn');
      return bn.find(v => /bd/i.test(v.lang)) || bn[0] || null;
    }
    const en = this.list('en');
    if (!en.length) return null;
    const female = /female|woman|zira|samantha|aria|jenny|susan|hazel|heera|karen|moira|tessa|victoria|google us english/i;
    const male = /\bmale\b|\bman\b|david|guy|mark|daniel|george|ravi|alex|fred|google uk english male/i;
    const g = Settings.get('voiceGender');
    const rx = g === 'male' ? male : female;
    const pref = ['en-us', 'en-gb', 'en-in'];
    for (const p of pref) {
      const v = en.find(x => x.lang.toLowerCase().replace('_', '-') === p && rx.test(x.name) && !(g === 'female' && male.test(x.name)));
      if (v) return v;
    }
    return en.find(x => /en[-_]us/i.test(x.lang)) || en[0];
  },

  /* একটা বাক্য বলে; শেষ হলে (বা থামালে) Promise resolve হয় */
  speak(text, lang, opts) {
    opts = opts || {};
    return new Promise(resolve => {
      text = (text || '').trim();
      if (!text || !('speechSynthesis' in window)) return resolve('skip');
      const u = new SpeechSynthesisUtterance(text);
      const v = this.pick(lang);
      if (v) { u.voice = v; u.lang = v.lang; } else { u.lang = lang === 'bn' ? 'bn-BD' : 'en-US'; }
      const base = Settings.get('rate') || 1;
      u.rate = Math.max(0.4, Math.min(1.6, base * (opts.rate || 1)));
      // পুরুষ/নারী কণ্ঠ না থাকলে pitch দিয়ে একটু আলাদা করি
      u.pitch = Settings.get('voiceGender') === 'male' ? 0.85 : 1.1;
      let done = false;
      const finish = (why) => {
        if (done) return; done = true;
        clearTimeout(this._timer);
        this.speakingNow = false; this._resolve = null;
        resolve(why);
      };
      this._resolve = finish;
      u.onend = () => finish('end');
      u.onerror = (e) => {
        if (e && e.error === 'not-allowed') { this.blocked = true; finish('blocked'); }
        else finish('error');
      };
      // কিছু ফোনে onend আসে না — তাই একটা নিরাপত্তা টাইমার
      let started = false;
      u.onstart = () => { started = true; };
      const est = 2500 + text.length * (lang === 'bn' ? 110 : 90) / u.rate;
      this._timer = setTimeout(() => {
        // কখনো শুরুই হয়নি আর পেজে এখনো কোনো ট্যাপ হয়নি = ব্রাউজার আটকে দিয়েছে
        const noTap = navigator.userActivation && !navigator.userActivation.hasBeenActive;
        if (!started && noTap) { this.blocked = true; finish('blocked'); } else finish('timeout');
      }, est);
      this.speakingNow = true;
      try { speechSynthesis.cancel(); } catch (e) {}
      setTimeout(() => { try { speechSynthesis.speak(u); } catch (e) { finish('error'); } }, 60);
    });
  },

  /* বাংলা লেখার ভেতরে পুরো ইংরেজি বাক্য থাকলে সেটুকু ইংরেজি কণ্ঠে বলে */
  async speakMixed(text, isCancelled) {
    const parts = this.split(text);
    for (const p of parts) {
      if (isCancelled && isCancelled()) return 'cancel';
      const r = await this.speak(p.text, p.lang);
      if (r === 'stopped' || r === 'blocked') return r;
    }
    return 'end';
  },

  split(text) {
    text = (text || '').trim();
    if (!text) return [];
    const hasBn = /[ঀ-৿]/.test(text);
    if (!hasBn) return [{ text, lang: 'en' }];
    // ইংরেজি অংশ: কমপক্ষে ৩টা শব্দ হলে ইংরেজি কণ্ঠ; ছোট শব্দ বাংলা কণ্ঠেই থাকে
    const rx = /[A-Za-z][A-Za-z0-9'’\-]*(?:[ ,]+[A-Za-z0-9'’\-]+){2,}[.?!]?/g;
    const out = [];
    let last = 0, m;
    while ((m = rx.exec(text))) {
      const before = text.slice(last, m.index).replace(/^[\s:,"“”'‘’-]+|[\s:,"“”'‘’-]+$/g, '');
      if (before && /[ঀ-৿A-Za-z0-9]/.test(before)) out.push({ text: before, lang: 'bn' });
      out.push({ text: m[0], lang: 'en' });
      last = m.index + m[0].length;
    }
    const rest = text.slice(last).replace(/^[\s:,"“”'‘’-]+/, '');
    if (rest && /[ঀ-৿A-Za-z0-9]/.test(rest)) out.push({ text: rest, lang: 'bn' });
    return out;
  },

  stop() {
    try { speechSynthesis.cancel(); } catch (e) {}
    if (this._resolve) this._resolve('stopped');
  }
};

/* ================= মাইক রেকর্ডিং (নিজের কণ্ঠ আবার শোনার জন্য) ================= */
const Recorder = {
  rec: null, stream: null, chunks: [], lastUrl: null,
  supported() { return !!(window.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia); },
  async start() {
    if (!Settings.get('recordVoice') || !this.supported()) return;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.chunks = [];
      this.rec = new MediaRecorder(this.stream);
      this.rec.ondataavailable = e => { if (e.data && e.data.size) this.chunks.push(e.data); };
      this.rec.start();
    } catch (e) { this.cleanup(); }
  },
  stop() {
    // এই রেকর্ডিংয়ের জিনিসগুলো আলাদা করে নিই, যাতে পরের রেকর্ডিং শুরু হলে গোলমাল না হয়
    const rec = this.rec, stream = this.stream, chunks = this.chunks;
    this.rec = null; this.stream = null; this.chunks = [];
    const stopTracks = () => { if (stream) stream.getTracks().forEach(t => t.stop()); };
    return new Promise(resolve => {
      if (!rec || rec.state === 'inactive') { stopTracks(); return resolve(null); }
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        if (this.lastUrl) URL.revokeObjectURL(this.lastUrl);
        this.lastUrl = blob.size > 1000 ? URL.createObjectURL(blob) : null;
        stopTracks();
        resolve(this.lastUrl);
      };
      try { rec.stop(); } catch (e) { stopTracks(); resolve(null); }
    });
  },
  cleanup() {
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    this.stream = null; this.rec = null;
  },
  play() {
    if (!this.lastUrl) return Promise.resolve();
    return new Promise(resolve => {
      const a = new Audio(this.lastUrl);
      a.onended = resolve; a.onerror = resolve;
      a.play().catch(resolve);
    });
  }
};

/* ================= Speech Recognition ================= */
const Listener = {
  SR: window.SpeechRecognition || window.webkitSpeechRecognition,
  active: false,
  rec: null,
  pieces: [],          // আগের সেশনগুলোর লেখা
  sessionFinal: [],    // এই সেশনের final লেখা
  interim: '',
  silenceTimer: null,
  heard: false,
  _resolve: null,
  _reject: null,
  onPartial: null,
  restarts: 0,

  supported() { return !!this.SR; },

  /* একটা "পালা" শুনে: Promise<{text}> বা {action} রিটার্ন করে */
  listen(onPartial) {
    if (!this.SR) return Promise.reject(new Error('no-sr'));
    this.stopAll();
    this.active = true;
    this.pieces = []; this.sessionFinal = []; this.interim = ''; this.heard = false;
    this.onPartial = onPartial;
    this.restarts = 0;
    return new Promise((resolve, reject) => {
      this._resolve = resolve; this._reject = reject;
      this._startSession();
    });
  },

  _startSession() {
    if (!this.active) return;
    const r = new this.SR();
    r.lang = Settings.get('recLang') || 'en-IN';
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    this.sessionFinal = []; this.interim = '';
    r.onresult = (e) => this._onResult(e);
    r.onspeechstart = () => { clearTimeout(this.silenceTimer); };
    r.onspeechend = () => this._armSilence();
    r.onerror = (e) => this._onError(e);
    r.onend = () => this._onEnd(r);
    this.rec = r;
    try { r.start(); } catch (e) {
      setTimeout(() => this._startSession(), 300);
    }
  },

  _onResult(e) {
    const finals = [];
    let interim = '';
    for (let i = 0; i < e.results.length; i++) {
      const t = (e.results[i][0].transcript || '').trim();
      if (!t) continue;
      if (e.results[i].isFinal) {
        // Android-এ একই কথা বারবার ("I", "I went", "I went to") আসে — জুড়ে না দিয়ে বদলে দিই
        const last = finals[finals.length - 1];
        if (last && t.toLowerCase().startsWith(last.toLowerCase())) finals[finals.length - 1] = t;
        else if (last && last.toLowerCase().startsWith(t.toLowerCase())) { /* skip */ }
        else finals.push(t);
      } else {
        interim += (interim ? ' ' : '') + t;
      }
    }
    this.sessionFinal = finals;
    this.interim = interim;
    if (finals.length || interim) this.heard = true;
    this._emit();
    this._armSilence();
  },

  _armSilence() {
    clearTimeout(this.silenceTimer);
    if (!this.active || !this.heard) return; // কিছু না বলা পর্যন্ত টাইমার চলে না
    const ms = (Settings.get('silence') || 2.5) * 1000;
    this.silenceTimer = setTimeout(() => this.finish(), ms);
  },

  _emit() {
    if (this.onPartial) {
      const done = this.pieces.concat(this.sessionFinal).join(' ');
      this.onPartial(done, this.interim);
    }
  },

  _onError(e) {
    const err = e && e.error;
    if (err === 'no-speech' || err === 'aborted') return; // স্বাভাবিক, আবার চালু হবে
    if (err === 'not-allowed' || err === 'service-not-allowed') return this._fail('mic-denied');
    if (err === 'network') return this._fail('offline');
    if (err === 'audio-capture') {
      // রেকর্ডার মাইক দখল করে রাখলে এমন হয় — রেকর্ডিং বন্ধ করে আবার চেষ্টা
      if (Recorder.stream) { Recorder.cleanup(); Settings.set('recordVoice', false); App.toast('মাইক সমস্যার জন্য "নিজের কণ্ঠ রেকর্ড" বন্ধ করা হলো'); return; }
      return this._fail('mic-busy');
    }
  },

  _onEnd(r) {
    if (r !== this.rec) return;
    // এই সেশনের লেখা জমা রাখি (interim সহ — Android অনেক সময় final দেয় না)
    const got = this.sessionFinal.concat(this.interim ? [this.interim] : []).join(' ').trim();
    if (got) this.pieces.push(got);
    this.sessionFinal = []; this.interim = '';
    if (this.active) {
      this.restarts++;
      setTimeout(() => this._startSession(), this.restarts > 30 ? 600 : 120);
    } else if (this._finishing) {
      this._finishing();
    }
  },

  /* "শেষ" বোতাম বা চুপ থাকার টাইমার */
  finish() {
    if (!this.active) return;
    this.active = false;
    Perf.mark('turnEnd');
    clearTimeout(this.silenceTimer);
    const r = this.rec;
    const resolve = this._resolve;
    this._resolve = null;
    let doneCalled = false;
    const done = () => {
      if (doneCalled) return; doneCalled = true;
      this._finishing = null;
      const extra = this.sessionFinal.concat(this.interim ? [this.interim] : []).join(' ').trim();
      if (extra) this.pieces.push(extra);
      this.sessionFinal = []; this.interim = '';
      const text = this.pieces.join(' ').replace(/\s+/g, ' ').trim();
      if (resolve) resolve({ text });
    };
    this._finishing = done;
    try { r && r.stop(); } catch (e) {}
    setTimeout(done, 500); // শেষ টুকরো আসার জন্য সামান্য অপেক্ষা (সাধারণত তার আগেই চলে আসে)
  },

  /* বোতাম চাপলে (আবার বলো / বুঝিনি …) শোনা থামিয়ে action ফেরত দেয় */
  interrupt(action) {
    if (!this.active && !this._resolve) return false;
    const resolve = this._resolve;
    this.stopAll();
    if (resolve) resolve({ action });
    return true;
  },

  _fail(code) {
    const reject = this._reject;
    this.stopAll();
    if (reject) reject(new Error(code));
  },

  stopAll() {
    this.active = false;
    clearTimeout(this.silenceTimer);
    this._resolve = null; this._reject = null; this._finishing = null;
    const r = this.rec; this.rec = null;
    if (r) { try { r.onend = null; r.onresult = null; r.onerror = null; r.abort(); } catch (e) {} }
  }
};

/* ছোট সাহায্যকারী: দুটো ইংরেজি বাক্য কতটা মেলে (০–১) — shadowing যাচাইয়ের জন্য */
function sentenceMatch(a, b) {
  const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9' ]/g, ' ')
    .replace(/\b(uh|um|umm|uhh|er|ah|hmm)\b/g, ' ').split(/\s+/).filter(Boolean);
  const A = norm(a), B = norm(b);
  if (!B.length) return 0;
  let hit = 0; const pool = A.slice();
  for (const w of B) { const i = pool.indexOf(w); if (i >= 0) { hit++; pool.splice(i, 1); } }
  return hit / B.length;
}
