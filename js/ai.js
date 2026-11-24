/* ai.js — Gemini (default) বা Claude-কে প্রশ্ন পাঠানো আর JSON উত্তর আনা।
   দ্রুত উত্তরের জন্য:
   - Gemini-র উত্তর streaming করে আসে; প্রতিটা টুকরো আসার সাথে সাথে onText() ডাকা হয়,
     তাই শিক্ষক প্রথম বাক্যটা পেয়েই বলা শুরু করে।
   - "thinking" বন্ধ (2.5 মডেলে thinkingBudget 0, নতুন মডেলে thinkingLevel minimal)।
   - একটা মডেল ২.৫ সেকেন্ডে উত্তর শুরু না করলে পাশাপাশি আরেকটা মডেলেও চাওয়া হয় (hedging);
     যেটা আগে উত্তর দেয় সেটাই নেওয়া হয়।
   API key শুধু তোমার ফোনেই থাকে, সরাসরি Google/Anthropic-এ যায়। */
'use strict';

class AIError extends Error {
  constructor(code, detail) { super(code); this.code = code; this.detail = detail || ''; }
}

/* কোন ধাপে কত সময় লাগছে — মাপার জন্য */
const Perf = {
  t: {},
  mark(name) { this.t[name] = performance.now(); },
  since(a, b) { return (this.t[a] && this.t[b]) ? ((this.t[b] - this.t[a]) / 1000).toFixed(1) : '–'; },
  reset() { this.t = {}; }
};

const GEMINI_DEFAULT = 'gemini-flash-lite-latest';
/* প্রধান মডেল ব্যস্ত বা বন্ধ থাকলে এই ক্রমে চেষ্টা (যেগুলো তোমার key-তে নেই, সেগুলো মনে রেখে বাদ দেওয়া হয়) */
const GEMINI_BACKUPS = ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash-lite', 'gemini-2.5-flash', 'gemini-flash-latest'];
const HEDGE_MS = 2500;
/* শেষ কয়েকটা অনুরোধের খুঁটিনাটি (কোন মডেল কখন শুরু/শেষ) — সমস্যা খুঁজতে */
const AITrace = [];
function trace(msg) { AITrace.push(Math.round(performance.now()) + ' ' + msg); if (AITrace.length > 60) AITrace.shift(); }

const AI = {
  TIMEOUT_MS: 30000,

  async call(task, payload, onText) {
    if (!navigator.onLine) throw new AIError('offline');
    const key = (Settings.apiKey() || '').trim();
    if (!key) throw new AIError('nokey');
    const userMsg = TASKS[task](payload);
    Perf.mark('aiStart');
    const text = Settings.get('provider') === 'claude'
      ? await this.claude(key, userMsg, onText)
      : await this.gemini(key, userMsg, onText);
    Perf.mark('aiDone');
    return this.parse(text);
  },

  /* অ্যাপ চালুর সময় একবার: কোন কোন মডেল চলে তা আগেই জেনে রাখি (উত্তরের সময় দেরি না হয়) */
  warm() {
    const key = (Settings.apiKey() || '').trim();
    if (key && Settings.get('provider') !== 'claude') this.geminiAlternates(key).catch(() => {});
  },

  errorFromResponse(status, msg) {
    if (status === 401 || status === 403) return new AIError('badkey', msg);
    if (status === 400 && /api key|api_key|API_KEY_INVALID/i.test(msg)) return new AIError('badkey', msg);
    if (status === 429) return new AIError('ratelimit', msg);
    if (status === 404) return new AIError('nomodel', msg);
    if (status >= 500) return new AIError('server', msg);
    return new AIError('api', msg);
  },

  async fetchJSON(url, opts, timeoutMs) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs || this.TIMEOUT_MS);
    let res;
    try {
      res = await fetch(url, Object.assign({}, opts, { signal: ctrl.signal }));
    } catch (e) {
      throw new AIError(e.name === 'AbortError' ? 'timeout' : 'offline');
    } finally { clearTimeout(t); }
    let body = null;
    try { body = await res.json(); } catch (e) {}
    if (!res.ok) {
      const msg = (body && body.error && (body.error.message || body.error.type)) || ('HTTP ' + res.status);
      throw this.errorFromResponse(res.status, msg);
    }
    return body;
  },

  /* ================= Google Gemini ================= */
  _good: null,
  dead() { return Store.get('deadModels', {}); },
  markDead(model) {
    const d = this.dead(); d[model] = Date.now(); Store.set('deadModels', d);
  },
  isDead(model) {
    const t = this.dead()[model];
    return t && Date.now() - t < 7 * 24 * 3600 * 1000; // ৭ দিন পর আবার চেষ্টা
  },

  /* ফ্রি কোটা শেষ (429) হওয়া মডেল কিছুক্ষণ বাদ (মিনিটের কোটা সাধারণত ১ মিনিটেই ফেরে) */
  _cool: {},
  isCool(model) { return (this._cool[model] || 0) > Date.now(); },

  candidates() {
    const primary = Settings.get('geminiModel') || GEMINI_DEFAULT;
    const list = [this._good, primary, GEMINI_DEFAULT].concat(GEMINI_BACKUPS, this._alts || []);
    const out = [], cooled = [];
    for (const m of list) {
      if (!m || out.includes(m) || cooled.includes(m) || this.isDead(m)) continue;
      (this.isCool(m) ? cooled : out).push(m);
    }
    return out.length ? out : cooled; // সব কোটা-শেষ হলে তবেই ওগুলো আবার চেষ্টা
  },

  thinkingConfig(model) {
    if (/^gemini-2\.5/.test(model)) return { thinkingBudget: 0 };
    if (/^gemini-/.test(model)) return { thinkingLevel: 'minimal' };
    return null; // gemma ইত্যাদি
  },
  _noThinkCfg: {},

  /* একাধিক মডেলে "দৌড়": প্রথম যে উত্তর শুরু করে, সেটাই জেতে; বাকিগুলো বাতিল */
  async gemini(key, userMsg, onText) {
    if (!this._alts) this.geminiAlternates(key).catch(() => {});
    // প্রথম দফা: ৭টা পর্যন্ত মডেল; দ্বিতীয় দফা: দ্রুত "lite" মডেলগুলো আরেকবার (ব্যস্ততা প্রায়ই সাথে সাথে কেটে যায়)
    // কোটা বাঁচাতে একবারে সর্বোচ্চ ৬টা অনুরোধ
    const first = this.candidates().slice(0, 4);
    const again = first.filter(m => /lite/.test(m)).slice(0, 2);
    const models = first.map(m => ({ m, delay: 0 })).concat(again.map(m => ({ m, delay: 400 })));
    return new Promise((resolve, reject) => {
      let winner = null, next = 0, running = 0, done = false, hedgeTimer = null, lastErr = null, hadOutput = false;
      const ctrls = new Map();

      const finish = (fn, v) => {
        if (done) return; done = true;
        clearTimeout(hedgeTimer);
        ctrls.forEach(c => c.abort());
        fn(v);
      };
      const armHedge = () => {
        clearTimeout(hedgeTimer);
        hedgeTimer = setTimeout(() => { if (!winner && !done) launch(); }, HEDGE_MS);
      };
      const launch = () => {
        if (done || next >= models.length) {
          if (!running && !done) finish(reject, lastErr || new AIError('server'));
          return;
        }
        const item = models[next++];
        const model = item.m;
        running++;
        if (item.delay) { setTimeout(() => start(model), item.delay); return; }
        start(model);
      };
      const start = (model) => {
        if (done || ctrls.has(model)) { running--; if (!done && !winner) launch(); return; } // একই মডেল আগেই চলছে
        trace('launch ' + model);
        const ctrl = new AbortController();
        ctrls.set(model, ctrl);
        armHedge();
        this.geminiStream(key, model, userMsg, ctrl.signal, (text) => {
          if (done) return;
          if (!winner) {
            winner = model;
            trace('first token ' + model);
            clearTimeout(hedgeTimer);
            ctrls.forEach((c, m) => { if (m !== model) c.abort(); });
            if (!Perf.t.aiFirst) Perf.mark('aiFirst');
          }
          if (winner === model && onText) {
            if (hadOutput === 'restart') { onText(text, { restart: true }); hadOutput = true; }
            else { onText(text); hadOutput = true; }
          }
        }).then(text => {
          running--;
          trace('done ' + model);
          if (done || (winner && winner !== model)) return;
          this._good = model;
          Perf.model = model;
          // সেটিংসের মডেলটা এই key-তে না থাকলে, যেটা চলল সেটাই সেভ করি
          if (this.isDead(Settings.get('geminiModel') || '')) Settings.set('geminiModel', model);
          finish(resolve, text);
        }).catch(e => {
          running--;
          trace('fail ' + model + ' ' + e.code + ' ' + String(e.detail || '').slice(0, 40));
          ctrls.delete(model);
          if (done) return;
          if (e.code === 'aborted') return;
          if (e.code === 'badkey' || e.code === 'offline') return finish(reject, e); // মডেল বদলে লাভ নেই
          if (e.code === 'nomodel') this.markDead(model);
          if (e.code === 'ratelimit') this._cool[model] = Date.now() + 60 * 1000;
          if (model === this._good) this._good = null;
          if (e.code !== 'nomodel' || !lastErr) lastErr = e;
          if (winner === model) { winner = null; if (hadOutput) hadOutput = 'restart'; } // মাঝপথে কেটে গেছে
          if (!winner) launch(); // সাথে সাথে পরেরটা
        });
      };
      launch();
    });
  },

  /* একটা মডেলে streaming অনুরোধ; সম্পূর্ণ লেখা ফেরত দেয় */
  async geminiStream(key, model, userMsg, signal, onText, noThink) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`;
    const gc = { responseMimeType: 'application/json', temperature: 0.7, maxOutputTokens: 2048 };
    const tc = this.thinkingConfig(model);
    if (tc && !noThink && !this._noThinkCfg[model]) gc.thinkingConfig = tc;
    const body = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: userMsg }] }],
      generationConfig: gc
    };
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    signal.addEventListener('abort', onAbort);
    const firstTimer = setTimeout(() => ctrl.abort(), 8000);    // ৮ সেকেন্ডেও শুরু না হলে বাদ
    const allTimer = setTimeout(() => ctrl.abort(), this.TIMEOUT_MS);
    const cleanup = () => { clearTimeout(firstTimer); clearTimeout(allTimer); signal.removeEventListener('abort', onAbort); };
    try {
      let res;
      try {
        res = await fetch(url, {
          method: 'POST', signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify(body)
        });
      } catch (e) {
        if (signal.aborted) throw new AIError('aborted');
        throw new AIError(e.name === 'AbortError' ? 'timeout' : 'offline');
      }
      if (!res.ok) {
        let msg = 'HTTP ' + res.status;
        try { const j = await res.json(); msg = (j.error && j.error.message) || msg; } catch (e) {}
        // এই মডেল thinking সেটিং না মানলে, সেটা ছাড়া আবার চেষ্টা
        if (res.status === 400 && gc.thinkingConfig && /invalid argument|thinking/i.test(msg)) {
          this._noThinkCfg[model] = true;
          cleanup();
          return this.geminiStream(key, model, userMsg, signal, onText, true);
        }
        throw this.errorFromResponse(res.status, msg);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '', text = '', finished = false;
      while (true) {
        let chunk;
        try { chunk = await reader.read(); }
        catch (e) { if (signal.aborted) throw new AIError('aborted'); throw new AIError('cut'); }
        if (chunk.done) break;
        buf += dec.decode(chunk.value, { stream: true }).replace(/\r/g, '');
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const ev = buf.slice(0, i); buf = buf.slice(i + 2);
          const line = ev.split('\n').find(l => l.startsWith('data:'));
          if (!line) continue;
          let j; try { j = JSON.parse(line.slice(5)); } catch (e) { continue; }
          if (j.error) throw this.errorFromResponse(j.error.code || 500, j.error.message || 'stream error');
          const cand = j.candidates && j.candidates[0];
          const parts = (cand && cand.content && cand.content.parts) || [];
          // কিছু মডেল "ভাবনার" লেখাও পাঠায় (thought) — শুধু আসল উত্তরটা নিই
          const piece = parts.filter(p => !p.thought).map(p => p.text || '').join('');
          if (piece) {
            clearTimeout(firstTimer);
            text += piece;
            onText(text);
          }
          if (cand && cand.finishReason) finished = true;
        }
      }
      if (!text) throw new AIError('empty');
      if (!finished) throw new AIError('cut', text.slice(0, 80)); // সার্ভার মাঝপথে থেমে গেছে
      return text;
    } finally { cleanup(); }
  },

  /* এই key দিয়ে আর কোন কোন মডেল চলে (ব্যাকআপ হিসেবে) */
  _alts: null,
  async geminiAlternates(key) {
    if (this._alts) return this._alts;
    try {
      const data = await this.fetchJSON('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
        headers: { 'x-goog-api-key': key }
      }, 10000);
      const all = (data.models || [])
        .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map(m => m.name.replace(/^models\//, ''));
      const ver = n => parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
      const lite = n => (/lite/.test(n) ? 0 : 1);
      const flash = all.filter(n => /^gemini-[\d.]+-flash/.test(n) && !/image|tts|audio|live|exp|thinking|preview/.test(n));
      flash.sort((a, b) => lite(a) - lite(b) || ver(b) - ver(a));
      this._alts = flash.slice(0, 6);
      // তালিকায় নেই এমন ব্যাকআপ মডেলকে বাদ হিসেবে চিহ্নিত করি
      GEMINI_BACKUPS.concat([GEMINI_DEFAULT]).forEach(m => { if (!all.includes(m) && !/-latest$/.test(m)) this.markDead(m); });
    } catch (e) { /* পরে আবার */ }
    return this._alts || [];
  },

  /* ================= Anthropic Claude ================= */
  async claude(key, userMsg, onText) {
    const model = Settings.get('claudeModel') || 'claude-opus-5-5';
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2026-10-21',
      'anthropic-dangerous-direct-browser-access': 'true'
    };
    const body = {
      model,
      max_tokens: 2000,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userMsg }]
    };
    // নতুন মডেলে: কম "effort" = দ্রুত উত্তর
    if (/claude-(opus|sonnet|haiku)-5|claude-fable/.test(model)) body.output_config = { effort: 'low' };
    // নিরাপত্তা-ফিল্টার ভুল করে আটকালে অন্য মডেলে স্বয়ংক্রিয়ভাবে চেষ্টা
    if (/claude-opus-5|claude-sonnet-5-5|claude-fable-5/.test(model)) {
      headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
      body.fallbacks = 'default';
    }
    const data = await this.fetchJSON('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers, body: JSON.stringify(body)
    });
    if (data.stop_reason === 'refusal') throw new AIError('api', 'refused');
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    if (!text) throw new AIError('empty', data.stop_reason || 'no text');
    Perf.mark('aiFirst');
    if (onText) onText(text);
    return text;
  },

  /* AI কখনো কখনো ```json ... ``` দিয়ে মোড়ায় — খুলে নিই */
  parse(text) {
    let t = (text || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    try { return JSON.parse(t); } catch (e) {}
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch (e) {} }
    throw new AIError('badjson', t.slice(0, 200));
  },

  /* সেটিংস থেকে "পরীক্ষা করো" */
  async test() {
    const r = await this.call('first', { level: 1, topic: 'home', recent: [] });
    return r && r.next && r.next.bn;
  }
};

/* অর্ধেক-আসা JSON থেকে একটা string ঘরের এখন পর্যন্ত লেখা বের করে (যেমন feedback_bn) */
function partialField(text, field) {
  const m = new RegExp('"' + field + '"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)').exec(text);
  if (!m) return null;
  let raw = m[1];
  if (/\\$/.test(raw) && !/\\\\$/.test(raw)) raw = raw.slice(0, -1);
  raw = raw.replace(/\\u[0-9a-fA-F]{0,3}$/, '');
  try { return JSON.parse('"' + raw + '"'); } catch (e) { return raw.replace(/\\n/g, ' ').replace(/\\"/g, '"'); }
}
