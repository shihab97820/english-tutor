/* mistakes.js — ভুল বাক্য সেভ করা, আর ১ দিন → ৩ দিন → ৭ দিন পর আবার জিজ্ঞেস করা।
   তিনবার পরপর ঠিক বললে "শিখে ফেলেছ" হয়ে যায়। আবার ভুল করলে শুরু থেকে (১ দিন)। */
'use strict';

const DAY = 24 * 60 * 60 * 1000;
const REVIEW_STEPS = [1, 3, 7];

const Mistakes = {
  all() { return Store.get('mistakes', []); },
  save(list) { Store.set('mistakes', list); },

  add({ bn, en, said, why }) {
    if (!bn || !en) return;
    const list = this.all();
    const now = Date.now();
    const old = list.find(m => m.bn === bn);
    if (old) {
      Object.assign(old, { en, said: said || old.said, why: why || old.why, stage: 0, due: now + DAY, done: false });
    } else {
      list.unshift({ id: 'm' + now + Math.random().toString(36).slice(2, 6), bn, en, said: said || '', why: why || '',
        created: now, stage: 0, due: now + DAY, done: false });
    }
    this.save(list.slice(0, 1000));
  },

  due() {
    const now = Date.now();
    return this.all().filter(m => !m.done && m.due <= now).sort((a, b) => a.due - b.due);
  },

  pending() { return this.all().filter(m => !m.done); },

  pass(id) {
    const list = this.all();
    const m = list.find(x => x.id === id);
    if (!m) return;
    m.stage++;
    if (m.stage >= REVIEW_STEPS.length) { m.done = true; m.due = Infinity; }
    else m.due = Date.now() + REVIEW_STEPS[m.stage] * DAY;
    this.save(list);
  },

  fail(id, said) {
    const list = this.all();
    const m = list.find(x => x.id === id);
    if (!m) return;
    m.stage = 0; m.due = Date.now() + DAY; m.done = false;
    if (said) m.said = said;
    this.save(list);
  },

  remove(id) { this.save(this.all().filter(m => m.id !== id)); },

  dueLabel(m) {
    if (m.done) return '✅ শিখে ফেলেছ';
    const days = Math.ceil((m.due - Date.now()) / DAY);
    if (days <= 0) return '🔔 আজ রিভিউ';
    return '⏳ ' + toBnNum(days) + ' দিন পর';
  }
};

function toBnNum(n) { return String(n).replace(/\d/g, d => '০১২৩৪৫৬৭৮৯'[d]); }
