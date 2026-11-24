/* practice.js — অনুবাদ অনুশীলন (main mode)
   ১) আগে ২–৩টা পুরোনো ভুল (রিভিউ), ২) তারপর তোমার লেভেল অনুযায়ী নতুন বাক্য। */
'use strict';

const Practice = {
  queue: [],       // রিভিউয়ের বাক্য
  current: null,   // এখন যে বাক্যটা চলছে
  nextItem: null,  // AI আগেই পরের বাক্য দিয়ে রাখে
  smartStartDone: false,

  topicEn() { return (TOPICS[Settings.get('topic')] || TOPICS.mixed).en; },

  async run(opts) {
    opts = opts || {};
    const e = Tutor.epoch;
    if (opts.reviewAll) {
      this.queue = Mistakes.pending().map(m => ({ bn: m.bn, en: m.en, hint: [], reviewId: m.id }));
      this.current = null;
      if (!this.queue.length) await Tutor.say('এখন রিভিউ করার মতো কোনো ভুল নেই। চলো নতুন বাক্য করি।', 'happy');
      else await Tutor.say(`চলো তোমার ${toBnNum(this.queue.length)}টা ভুল বাক্য ঝালিয়ে নিই।`);
      this.smartStartDone = true;
    } else if (!this.smartStartDone) {
      this.smartStartDone = true;
      this.queue = Mistakes.due().slice(0, 3).map(m => ({ bn: m.bn, en: m.en, hint: [], reviewId: m.id }));
      if (this.queue.length) await Tutor.say('আগে তোমার পুরোনো কয়েকটা ভুল বাক্য একটু ঝালিয়ে নিই।');
    }

    while (true) {
      Tutor.guard(e);
      let item = this.current || this.queue.shift() || this.nextItem;
      if (!item) {
        const r = await Tutor.think('first', { level: Progress.level(), topic: this.topicEn(), recent: Progress.data().recent.slice(0, 15) });
        item = r && r.next;
        if (!item || !item.bn) continue;
      }
      this.current = item;
      this.nextItem = null;
      const res = await this.handle(item);
      this.current = null;
      if (res && res.next && res.next.bn) this.nextItem = { bn: res.next.bn, en: res.next.en, hint: res.next.hint || [] };
      if (item.reviewId && !this.queue.length && opts.reviewAll) {
        opts.reviewAll = false;
        await Tutor.say('রিভিউ শেষ! এবার নতুন বাক্য।', 'happy');
      }
    }
  },

  async handle(item) {
    const e = Tutor.epoch;
    if (!item.reviewId) Progress.remember(item.bn);
    Tutor.showMe('', '');
    await Tutor.say('ইংরেজিতে বলো: ' + item.bn);

    const handlers = {
      repeat: () => Tutor.say(item.bn),
      hint: () => this.hint(item)
    };

    while (true) {
      const said = await Tutor.hearLoop(handlers);
      const res = await Tutor.think('evaluate', {
        bn: item.bn, en: item.en, said, level: Progress.level(), topic: this.topicEn(),
        recent: Progress.data().recent.slice(0, 15), review: !!item.reviewId
      });
      Tutor.guard(e);

      if (res.type === 'command' && res.command) {
        const a = res.command.action;
        if (a === 'pause') { Tutor.pause(); throw new Cancel(); }
        if (a === 'roleplay') { this.current = item; Tutor.startRoleplay(res.command.role); throw new Cancel(); }
        if (a === 'repeat') { await handlers.repeat(); continue; }
        if (a === 'hint') { await handlers.hint(); continue; }
        await Tutor.say('ঠিক আছে! ইংরেজিতে বলো: ' + item.bn); continue;
      }

      (res.new_words || []).forEach(w => Words.add(w.bn, w.en));

      if (res.type === 'question') {
        await Tutor.say(res.feedback_bn || ((res.question_answer_bn || '') + ' এবার পুরো বাক্যটা বলো।'), 'idle');
        continue;
      }

      await this.feedback(item, res, said);
      return res;
    }
  },

  async hint(item) {
    const h = (item.hint || []).filter(x => x && x.bn && x.en);
    if (h.length) {
      await Tutor.say('সাহায্য: ' + h.map(x => `${x.bn} মানে ${x.en}`).join(', ') + '।');
    } else if (item.en) {
      const start = item.en.split(/\s+/).slice(0, 2).join(' ');
      await Tutor.say('এভাবে শুরু করো: ' + start + '…');
    }
  },

  async feedback(item, res, said) {
    const correct = !!res.correct;
    const helped = !!res.asked_for_help;
    const corrected = res.corrected || item.en;

    // ---- সেভ ----
    if (item.reviewId) {
      if (correct) Mistakes.pass(item.reviewId); else Mistakes.fail(item.reviewId, res.intended || said);
    } else if (!correct && !helped) {
      Mistakes.add({ bn: item.bn, en: corrected, said: res.intended || said,
        why: (res.mistakes || []).map(m => m.why_bn).filter(Boolean).join('; ') });
    }
    if (!helped) Progress.record(correct);

    // ---- স্ক্রিনে দেখাও ----
    Tutor.clearExtra();
    Tutor.addSay(correct ? '✅ ঠিক বাক্য' : '✏️ সঠিক বাক্য', corrected, 'correct');
    const alt = res.alternatives || {};
    if (alt.formal && alt.formal !== corrected) Tutor.addSay('অফিসে/ভদ্রভাবে', alt.formal, 'alt');
    if (alt.casual && alt.casual !== corrected) Tutor.addSay('সাধারণ কথায়', alt.casual, 'alt');
    const chips = [];
    const pron = (res.pronunciation || []).filter(p => p && p.word).slice(0, 2);
    pron.forEach(p => chips.push({ label: '🔊 ' + p.word, cls: 'pron', fn: () => Tutor.sayEn(p.word, true) }));
    if (Recorder.lastUrl) {
      chips.push({ label: '🎧 আমার কথা শুনি', fn: async () => { await Recorder.play(); await Tutor.sayEn(corrected); } });
    }
    if (chips.length) Tutor.addChips(chips);

    // ---- বলো ----
    const fb = res.feedback_bn || (correct ? 'দারুণ! ' + corrected : 'প্রায় হয়েছে! সঠিকভাবে: ' + corrected);
    await Tutor.say(fb, correct ? 'happy' : 'encourage');

    for (const p of pron) {
      await Tutor.say(`${p.tip_bn || ''} ${p.word} শব্দটা ধীরে শোনো:`.trim(), 'idle');
      await Tutor.sayEn(p.word, true);
    }

    if (!correct && Settings.get('shadowing')) await this.shadow(corrected);
  },

  /* "আমার সাথে বলো" — সঠিক বাক্যটা একবার নিজের মুখে বলা */
  async shadow(sentence) {
    await Tutor.say('এবার আমার সাথে বলো: ' + sentence, 'idle');
    const said = await Tutor.hearLoop({ repeat: () => Tutor.sayEn(sentence) });
    if (sentenceMatch(said, sentence) >= 0.8) await Tutor.say('চমৎকার!', 'happy');
    else await Tutor.say('ভালো চেষ্টা! এটা পরে আবার আসবে।', 'encourage');
  }
};
