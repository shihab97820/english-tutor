/* tutor.js — Home স্ক্রিনের "মস্তিষ্ক": কথা বলা, শোনা, ভাবা, বোতাম, আর কোন mode চলছে।
   Practice (অনুবাদ) আর Roleplay (কথোপকথন) এই ফাইলের সাহায্য নিয়ে চলে। */
'use strict';

class Cancel extends Error { constructor() { super('cancel'); } }

const Tutor = {
  epoch: 0,
  mode: 'practice',     // practice | roleplay
  role: null,
  micState: 'idle',
  pending: null,
  paused: false,
  greeted: false,
  running: false,
  emptyTurns: 0,
  ui: {},

  init() {
    const $ = id => document.getElementById(id);
    this.ui = {
      tutorLine: $('tutorLine'), myLine: $('myLine'), extra: $('extra'),
      mic: $('mic'), micIcon: $('micIcon'), micLabel: $('micLabel'),
      btnRepeat: $('btnRepeat'), btnHint: $('btnHint'), btnBangla: $('btnBangla'), modeChip: $('modeChip')
    };
    Avatar.mount($('avatarBox'), Settings.get('avatar'));
    this.ui.mic.addEventListener('click', () => this.micTap());
    this.ui.btnRepeat.addEventListener('click', () => this.action('repeat'));
    this.ui.btnHint.addEventListener('click', () => this.action('hint'));
    this.ui.btnBangla.addEventListener('click', () => this.action('bangla'));
    this.setMic('idle');
  },

  /* ---------- বাতিল করার ব্যবস্থা ---------- */
  cancelAll() {
    this.epoch++;
    this.pending = null;
    Voice.stop();
    Listener.stopAll();
    Recorder.cleanup();
    Avatar.talking(false);
  },
  guard(e) { if (e !== this.epoch) throw new Cancel(); },

  /* ---------- UI ---------- */
  setMic(state) {
    this.micState = state;
    const m = this.ui.mic;
    m.classList.remove('listening', 'busy', 'speaking');
    const map = {
      idle:      ['🎤', '&nbsp;'],
      listening: ['শেষ', 'বলো… শেষ হলে চুপ থাকো বা "শেষ" চাপো'],
      thinking:  ['⏳', 'ভাবছি…'],
      speaking:  ['🎤', 'চাপলে এখনই বলতে পারো'],
      paused:    ['▶', 'আবার শুরু করতে চাপো'],
      setup:     ['⚙️', 'সেটিংস খুলতে চাপো']
    };
    const [icon, label] = map[state] || map.idle;
    this.ui.micIcon.textContent = icon;
    this.ui.micLabel.innerHTML = label;
    if (state === 'listening') m.classList.add('listening');
    if (state === 'thinking') m.classList.add('busy');
    if (state === 'speaking') m.classList.add('speaking');
  },
  showTutor(text) { this.ui.tutorLine.textContent = text || ''; },
  showMe(done, interim) {
    const el = this.ui.myLine;
    el.textContent = '';
    if (done) el.append(document.createTextNode(done + ' '));
    if (interim) { const s = document.createElement('span'); s.className = 'interim'; s.textContent = interim; el.append(s); }
  },
  clearExtra() { this.ui.extra.innerHTML = ''; },

  setMode(mode, role) {
    this.mode = mode; this.role = role || null;
    const chip = this.ui.modeChip;
    const rp = mode === 'roleplay' && role;
    chip.hidden = !rp;
    this.ui.btnBangla.hidden = !rp;
    this.ui.btnHint.hidden = !!rp;
    if (rp) {
      chip.innerHTML = '';
      chip.append(document.createTextNode(role.icon + ' ' + role.bn));
      const x = document.createElement('button');
      x.textContent = '✕'; x.title = 'কথোপকথন শেষ';
      x.onclick = () => { this.setMode('practice'); this.run('practice'); };
      chip.append(x);
    }
  },

  /* ---------- কথা বলা ---------- */
  async say(text, state) {
    const e = this.epoch;
    if (!text) return;
    this.showTutor(text);
    if (this.pending === 'skip') return; // মাইক চেপে কথা থামানো হয়েছে
    Avatar.setState(state || 'idle');
    Avatar.talking(true);
    this.setMic('speaking');
    let r = await Voice.speakMixed(text, () => e !== this.epoch);
    Avatar.talking(false);
    this.guard(e);
    if (r === 'blocked') {
      await App.tapToStart();
      this.guard(e);
      Avatar.talking(true);
      await Voice.speakMixed(text, () => e !== this.epoch);
      Avatar.talking(false);
      this.guard(e);
    }
  },
  async sayEn(text, slow) {
    const e = this.epoch;
    Avatar.talking(true);
    await Voice.speak(text, 'en', { rate: slow ? 0.6 : 1 });
    Avatar.talking(false);
    this.guard(e);
  },

  /* ---------- শোনা ---------- */
  async hear() {
    const e = this.epoch;
    if (this.pending === 'skip') this.pending = null;
    this.showMe('', '');
    Avatar.setState('listening');
    this.setMic('listening');
    await Recorder.start();
    this.guard(e);
    Perf.reset();
    let r;
    try {
      r = await Listener.listen((done, interim) => { if (e === this.epoch) this.showMe(done, interim); });
    } catch (err) {
      Recorder.cleanup();
      this.guard(e);
      const code = err.message;
      if (code === 'offline') { await App.offline('offline'); this.guard(e); return { action: 'none' }; }
      if (code === 'mic-denied') { await App.micDenied(); this.guard(e); return { action: 'none' }; }
      if (code === 'no-sr') { App.noSpeechSupport(); this.pause(true); throw new Cancel(); }
      await App.dialog({ icon: '🎤', title: 'মাইক সমস্যা', text: 'মাইক চালু করা যাচ্ছে না। অন্য কোনো অ্যাপ মাইক ব্যবহার করছে কি না দেখো।', buttons: [{ label: 'আবার চেষ্টা', primary: true }] });
      this.guard(e);
      return { action: 'none' };
    }
    this.guard(e);
    if (r.action) { Recorder.cleanup(); return r; }
    Perf.mark('heard');
    Recorder.stop(); // অপেক্ষা না করে — রেকর্ডিং পেছনে শেষ হোক
    this.guard(e);
    // রেকর্ডিং চালু থাকলে যদি দুবার কিছুই শোনা না যায়, রেকর্ডিং বন্ধ করে দিই (কিছু ফোনে মাইক দুজনকে একসাথে দেয় না)
    if (!r.text && Settings.get('recordVoice')) {
      if (++this.emptyTurns >= 2) { Settings.set('recordVoice', false); App.toast('মাইক ঠিকমতো শুনছিল না, তাই "নিজের কণ্ঠ রেকর্ড" বন্ধ করলাম'); }
    } else if (r.text) this.emptyTurns = 0;
    this.setMic('thinking');
    return r;
  },

  /* বোতাম/অ্যাকশনসহ একটা পূর্ণ উত্তর শোনে। handlers: {repeat, hint, bangla} */
  async hearLoop(handlers) {
    const e = this.epoch;
    while (true) {
      const p = this.pending;
      this.pending = null;
      const r = (p && p !== 'skip') ? { action: p } : await this.hear();
      this.guard(e);
      if (r.action) {
        const a = r.action;
        if (typeof a === 'object' && a.type === 'play') { await a.fn(); this.guard(e); continue; }
        if (handlers && handlers[a]) { await handlers[a](); this.guard(e); }
        continue;
      }
      const t = (r.text || '').trim();
      if (!t) { await this.say('কিছু শুনতে পাইনি। আবার বলো তো।'); continue; }
      if (isPauseCommand(t)) { this.pause(); throw new Cancel(); }
      return t;
    }
  },

  /* ---------- AI-কে জিজ্ঞেস ---------- */
  async think(task, payload, onText) {
    const e = this.epoch;
    Avatar.setState('thinking');
    this.setMic('thinking');
    let tries = 0;
    while (true) {
      try {
        if (tries && onText) onText('', { restart: true });
        const res = await AI.call(task, payload, onText && ((t, info) => { if (e === this.epoch) onText(t, info); }));
        this.guard(e);
        this.showTiming();
        return res;
      } catch (err) {
        this.guard(e);
        if (err instanceof Cancel) throw err;
        const code = err.code || 'api';
        tries++;
        if (code === 'offline' || code === 'timeout' || code === 'server') {
          await App.offline(code); this.guard(e); continue;
        }
        if (code === 'ratelimit') {
          App.toast('AI এখন ব্যস্ত, ১৫ সেকেন্ড পর আবার চেষ্টা করছি…');
          await sleep(15000); this.guard(e); continue;
        }
        if (code === 'nokey' || code === 'badkey') { await this.needKey(code); throw new Cancel(); }
        if (tries < 2) continue; // badjson/empty — একবার নিঃশব্দে আবার চেষ্টা
        await App.dialog({ icon: '⚠️', title: 'AI থেকে উত্তর আসেনি', text: (err.detail || code).toString().slice(0, 160),
          buttons: [{ label: 'আবার চেষ্টা', primary: true }] });
        this.guard(e); tries = 0;
      }
    }
  },

  /* ---------- streaming: উত্তর আসতে আসতেই বলা ----------
     AI-র অর্ধেক-আসা JSON থেকে একটা ঘর (যেমন feedback_bn) পড়ে; একটা পুরো বাক্য
     (। ! ? : বা ". ") হওয়ামাত্র সেটা বলা শুরু করে, বাকিটা আসতে থাকে। */
  streamSpeaker(field) {
    const self = this;
    const e = this.epoch;
    let spoken = 0, value = '', mood = 'idle', restarted = false, queue = Promise.resolve();
    const speak = (seg) => {
      queue = queue.then(async () => {
        if (e !== self.epoch || self.pending === 'skip' || !seg.trim()) return;
        if (!Perf.t.firstSpeech) { Perf.mark('firstSpeech'); self.showTiming(); }
        Avatar.setState(mood);
        Avatar.talking(true);
        self.setMic('speaking');
        let r = await Voice.speakMixed(seg, () => e !== self.epoch);
        if (r === 'blocked' && e === self.epoch) { await App.tapToStart(); r = await Voice.speakMixed(seg, () => e !== self.epoch); }
        Avatar.talking(false);
      });
    };
    const boundary = (v, from) => {
      const rx = /[।!?]|[.:](?=\s)/g;
      rx.lastIndex = from;
      let m, cut = -1;
      while ((m = rx.exec(v))) cut = m.index + 1;
      return cut;
    };
    return {
      feed(text, info) {
        if (info && info.restart) { if (spoken > 0) restarted = true; spoken = 0; value = ''; return; }
        const c = /"correct"\s*:\s*(true|false)/.exec(text);
        if (c) mood = c[1] === 'true' ? 'happy' : 'encourage';
        const v = partialField(text, field);
        if (v == null) return;
        value = v;
        self.showTutor(v);
        if (restarted) return; // অন্য মডেল নতুন করে লিখছে — শেষে পুরোটা বলব
        const cut = boundary(v, spoken);
        if (cut > spoken) { speak(v.slice(spoken, cut)); spoken = cut; }
      },
      async finish(full, finalMood) {
        if (finalMood) mood = finalMood;
        if (full != null && full !== '') { value = full; self.showTutor(full); }
        if (restarted) { speak(value); restarted = false; }
        else if (value.length > spoken) speak(value.slice(spoken));
        spoken = value.length;
        await queue;
        self.guard(e);
      },
      spokenSomething() { return spoken > 0; }
    };
  },

  /* সেটিংসে "সময় দেখাও" চালু থাকলে: কোন ধাপে কত সেকেন্ড লাগল */
  showTiming() {
    if (!Settings.get('showTiming')) return;
    let el = document.getElementById('timing');
    if (!el) {
      el = document.createElement('div');
      el.id = 'timing'; el.className = 'timing';
      this.ui.myLine.after(el);
    }
    const s = (a, b) => Perf.since(a, b);
    el.textContent = `⏱ চুপ→শোনা শেষ ${s('turnEnd', 'heard')}s · AI প্রথম শব্দ ${s('aiStart', 'aiFirst')}s · AI পুরো ${s('aiStart', 'aiDone')}s · বলা শুরু ${s('turnEnd', 'firstSpeech')}s` +
      (Perf.model ? ' · ' + Perf.model : '');
  },

  async needKey(code) {
    Avatar.setState('encourage');
    const msg = code === 'badkey'
      ? 'তোমার API key কাজ করছে না। মেনু থেকে সেটিংসে গিয়ে key-টা আবার দেখো।'
      : 'শুরু করার আগে একটা API key লাগবে। মেনু থেকে সেটিংসে গিয়ে Gemini API key বসাও।';
    try { await this.say(msg, 'encourage'); } catch (e) { /* ignore */ }
    this.setMic('setup');
    this.running = false;
  },

  /* ---------- বোতাম ---------- */
  action(a) {
    if (this.micState === 'listening') { Listener.interrupt(a); return; }
    if (this.micState === 'speaking') { this.pending = a; Voice.stop(); return; }
    if (typeof a === 'object' && a.type === 'play') { a.fn().catch(() => {}); return; }
    if (this.micState === 'paused' || this.micState === 'idle') { this.pending = a; this.resume(); }
  },
  /* ফিডব্যাকের বাক্যে চাপলে শোনায় (শোনা চলাকালীন হলে আগে মাইক থামিয়ে, পরে আবার শোনে) */
  play(fn) { this.action({ type: 'play', fn }); },

  micTap() {
    switch (this.micState) {
      case 'listening': Listener.finish(); break;
      case 'speaking': this.pending = 'skip'; Voice.stop(); break;
      case 'paused': case 'idle': this.resume(); break;
      case 'setup': Nav.open('settings'); break;
      default: break; // thinking
    }
  },

  /* ---------- চালু/থামানো ---------- */
  async start() {
    App.keepAwake();
    if (!this.greeted) {
      this.greeted = true;
      const e = this.epoch;
      // সালামের সময়েই প্রথম বাক্যটা AI থেকে আনা শুরু — সালাম শেষে অপেক্ষা করতে হয় না
      AI.warm();
      Practice.prefetch();
      try {
        await this.say(`আসসালামু আলাইকুম ${Settings.get('name') || ''}! চলো শুরু করি।`, 'happy');
      } catch (err) { return; }
      if (e !== this.epoch) return;
    }
    this.run(this.mode, this.role && this.role.id);
  },

  async run(kind, arg) {
    this.cancelAll();
    this.paused = false;
    this.running = true;
    const e = this.epoch;
    try {
      if (!Settings.apiKey()) { await this.needKey('nokey'); return; }
      if (kind === 'roleplay') {
        await Roleplay.run(arg);
        this.guard(e);
        this.setMode('practice');
      }
      await Practice.run(kind === 'review' ? { reviewAll: true } : {});
    } catch (err) {
      if (!(err instanceof Cancel)) {
        console.error(err);
        if (e === this.epoch) {
          this.setMic('paused'); this.paused = true;
          this.showTutor('কিছু একটা সমস্যা হয়েছে। আবার শুরু করতে মাইকে চাপো।');
        }
      }
    } finally {
      if (e === this.epoch) this.running = false;
    }
  },

  pause(silent) {
    this.cancelAll();
    this.paused = true;
    this.running = false;
    Avatar.setState('idle');
    this.setMic('paused');
    this.showTutor('থেমে আছি। আবার শুরু করতে মাইকে চাপো।');
    if (!silent) Voice.speak('ঠিক আছে, থামলাম।', 'bn');
  },

  resume() {
    if (this.micState === 'setup' && !Settings.apiKey()) { Nav.open('settings'); return; }
    this.run(this.mode, this.role && this.role.id);
  },

  /* মেনু থেকে ফিরলে বা অ্যাপ আবার সামনে এলে — নিজে থামানো না থাকলে আবার চালু */
  autoResume() {
    if (this.paused) return;
    if (!Settings.apiKey()) {
      this.setMic('setup');
      this.showTutor('শুরু করতে মেনু → সেটিংসে API key বসাও।');
      return;
    }
    this.run(this.mode, this.role && this.role.id);
  },

  /* অন্য স্ক্রিনে গেলে বা অ্যাপ background-এ গেলে চুপচাপ থামে */
  suspend() {
    this.cancelAll();
    this.running = false;
    Avatar.setState('idle');
    if (!this.paused && this.micState !== 'setup') this.setMic('idle');
  },

  startRoleplay(roleId) {
    const role = ROLES.find(r => r.id === roleId) || ROLES[1];
    this.setMode('roleplay', role);
    this.clearExtra();
    this.run('roleplay', role.id);
  },

  /* ---------- ফিডব্যাক কার্ড (Home-এ) ---------- */
  addSay(label, en, cls) {
    const row = document.createElement('div');
    row.className = 'say ' + (cls || '');
    const txt = document.createElement('button');
    txt.className = 'txt';
    txt.style.textAlign = 'left';
    txt.innerHTML = `<span class="lbl"></span><span class="t"></span>`;
    txt.querySelector('.lbl').textContent = label + '  🔊';
    txt.querySelector('.t').textContent = en;
    txt.onclick = () => this.play(() => this.sayEn(en));
    const star = document.createElement('button');
    star.className = 'star' + (Bookmarks.has(en) ? ' on' : '');
    star.textContent = Bookmarks.has(en) ? '★' : '☆';
    star.title = 'সেভ করো';
    star.onclick = () => {
      const on = Bookmarks.toggle(en, label);
      star.textContent = on ? '★' : '☆'; star.classList.toggle('on', on);
      App.toast(on ? 'সেভ করা বাক্যে রাখা হলো ⭐' : 'সেভ থেকে সরানো হলো');
    };
    row.append(txt, star);
    this.ui.extra.append(row);
  },
  addChips(list) {
    const wrap = document.createElement('div');
    wrap.className = 'chips';
    for (const c of list) {
      const b = document.createElement('button');
      b.className = 'chip ' + (c.cls || '');
      b.textContent = c.label;
      b.onclick = () => this.play(c.fn);
      wrap.append(b);
    }
    this.ui.extra.append(wrap);
  }
};

function isPauseCommand(t) {
  const s = t.toLowerCase().replace(/[.!?,।]/g, '').trim();
  if (s.split(/\s+/).length > 4) return false;
  return /^(থামো|থামুন|থাম|একটু থামো|stop|pause|thamo|tamo|thamu|stop it|wait)$/.test(s);
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
