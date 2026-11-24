/* roleplay.js — বাস্তব জীবনের ছোট কথোপকথন (৫–১০ পালা)।
   কথার মাঝে শিক্ষক ভুল ধরে না, শেষে বাংলায় ছোট সারাংশ দেয়। */
'use strict';

const Roleplay = {
  lastEn: '',
  lastBn: '',

  async run(roleId) {
    const e = Tutor.epoch;
    const role = ROLES.find(r => r.id === roleId) || ROLES[1];
    Tutor.setMode('roleplay', role);
    Tutor.clearExtra();
    Tutor.showMe('', '');

    const level = Progress.level();
    const st = await Tutor.think('roleplay_start', { roleEn: role.en, level });
    const history = [];
    const mistakes = [];
    this.lastEn = st.line_en || 'Hello! How can I help you?';
    this.lastBn = st.line_bn || '';
    history.push({ who: 'tutor', text: this.lastEn });

    if (st.scene_bn) await Tutor.say(st.scene_bn, 'happy');
    await Tutor.say(this.lastEn, 'idle');

    const handlers = {
      repeat: () => Tutor.say(this.lastEn),
      bangla: () => Tutor.say(this.lastBn || 'এর বাংলা এখন পাচ্ছি না।'),
      hint: () => Tutor.say(this.lastBn || this.lastEn)
    };

    let turn = 1;
    while (true) {
      Tutor.guard(e);
      const said = await Tutor.hearLoop(handlers);
      const res = await Tutor.think('roleplay_turn', { roleEn: role.en, level, history, said, turn });
      Tutor.guard(e);

      if (res.type === 'command' && res.command) {
        if (res.command.action === 'pause') { Tutor.pause(); throw new Cancel(); }
        if (res.command.action === 'practice') { await Tutor.say('ঠিক আছে, কথোপকথন শেষ করছি।'); break; }
      }
      if (res.type === 'question') {
        await Tutor.say((res.question_answer_bn || '') + ' এবার ইংরেজিতে উত্তর দাও।');
        continue;
      }

      history.push({ who: 'learner', text: res.intended || said });
      (res.mistakes || []).forEach(m => { if (m && m.correct) mistakes.push(m); });
      turn++;

      if (res.reply_en) {
        this.lastEn = res.reply_en;
        this.lastBn = res.reply_bn || '';
        history.push({ who: 'tutor', text: res.reply_en });
        await Tutor.say(res.reply_en, 'idle');
      }
      if (res.end || turn > 10) break;
    }

    // ---- সারাংশ ----
    const sum = await Tutor.think('roleplay_summary', { roleEn: role.en, history, mistakes });
    Tutor.guard(e);
    const items = (sum.items || []).filter(i => i && i.correct);
    Tutor.clearExtra();
    for (const it of items) {
      if (it.bn) Mistakes.add({ bn: it.bn, en: it.correct, said: it.said, why: it.why_bn });
      Tutor.addSay(it.said ? '❌ ' + it.said : '✏️ সঠিক', it.correct, 'correct');
    }
    await Tutor.say(sum.summary_bn || 'দারুণ কথোপকথন হলো!', items.length ? 'encourage' : 'happy');
    if (items.length) App.toast('ভুলগুলো "আমার ভুল" তালিকায় রাখা হলো');
    await Tutor.say('এবার আবার অনুবাদ অনুশীলনে ফিরি।', 'idle');
    Tutor.setMode('practice');
  }
};
