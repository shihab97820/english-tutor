/* ai.js — Gemini (default) বা Claude-কে প্রশ্ন পাঠানো আর JSON উত্তর আনা।
   API key শুধু তোমার ফোনেই থাকে, সরাসরি Google/Anthropic-এ যায়। */
'use strict';

class AIError extends Error {
  constructor(code, detail) { super(code); this.code = code; this.detail = detail || ''; }
}

const AI = {
  TIMEOUT_MS: 35000,

  async call(task, payload) {
    if (!navigator.onLine) throw new AIError('offline');
    const key = (Settings.apiKey() || '').trim();
    if (!key) throw new AIError('nokey');
    const userMsg = TASKS[task](payload);
    const text = Settings.get('provider') === 'claude'
      ? await this.claude(key, userMsg)
      : await this.gemini(key, userMsg);
    return this.parse(text);
  },

  async fetchJSON(url, opts) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), this.TIMEOUT_MS);
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
      if (res.status === 401 || res.status === 403) throw new AIError('badkey', msg);
      if (res.status === 400 && /api key|api_key|API_KEY_INVALID/i.test(msg)) throw new AIError('badkey', msg);
      if (res.status === 429) throw new AIError('ratelimit', msg);
      if (res.status === 404) throw new AIError('nomodel', msg);
      if (res.status >= 500) throw new AIError('server', msg);
      throw new AIError('api', msg);
    }
    return body;
  },

  /* ---------- Google Gemini ---------- */
  async gemini(key, userMsg, retried) {
    const model = Settings.get('geminiModel') || 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const body = {
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: userMsg }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0.7, maxOutputTokens: 4096 }
    };
    try {
      const data = await this.fetchJSON(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body)
      });
      const cand = data && data.candidates && data.candidates[0];
      const text = cand && cand.content && (cand.content.parts || []).map(p => p.text || '').join('');
      if (!text) throw new AIError('empty', (cand && cand.finishReason) || 'no text');
      return text;
    } catch (e) {
      // মডেলের নাম পুরোনো হয়ে গেলে নিজে থেকেই নতুন "flash" মডেল খুঁজে নিই
      if (e.code === 'nomodel' && !retried) {
        const m = await this.findGeminiModel(key);
        if (m && m !== model) { Settings.set('geminiModel', m); return this.gemini(key, userMsg, true); }
      }
      throw e;
    }
  },

  async findGeminiModel(key) {
    try {
      const data = await this.fetchJSON('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200', {
        headers: { 'x-goog-api-key': key }
      });
      const names = (data.models || [])
        .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map(m => m.name.replace(/^models\//, ''))
        .filter(n => /flash/.test(n) && !/lite|image|tts|audio|live|exp|preview|thinking/.test(n));
      names.sort((a, b) => {
        const va = parseFloat((a.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
        const vb = parseFloat((b.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || 0);
        return vb - va;
      });
      return names[0] || null;
    } catch (e) { return null; }
  },

  /* ---------- Anthropic Claude ---------- */
  async claude(key, userMsg) {
    const model = Settings.get('claudeModel') || 'claude-opus-5-5';
    const headers = {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2026-10-21',
      'anthropic-dangerous-direct-browser-access': 'true'
    };
    const body = {
      model,
      max_tokens: 4000,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: userMsg }]
    };
    // নতুন মডেলে: কম "effort" = দ্রুত উত্তর (টিউটরের জন্য যথেষ্ট)
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
