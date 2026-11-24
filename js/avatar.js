/* avatar.js — তিনটা নিজস্ব অ্যাভাটার (SVG দিয়ে আঁকা) আর তাদের অবস্থা:
   idle, listening (শুনছে), thinking (ভাবছে), talking (বলছে), happy (খুশি), encourage (উৎসাহ) */
'use strict';

const Avatar = {
  box: null,
  state: 'idle',

  /* একই SVG-র ভেতরে চোখ/মুখের কয়েকটা রূপ থাকে; CSS ঠিক করে কোনটা দেখাবে */
  svg(type) {
    const common = `
      <g class="listen-ring"><circle cx="150" cy="150" r="138" fill="none" stroke="#8ecae6" stroke-width="5"/></g>
      <g class="think-dots" fill="#fff">
        <circle cx="232" cy="52" r="8"/><circle cx="255" cy="36" r="10"/><circle cx="282" cy="18" r="12"/>
      </g>
      <g class="sparkles" fill="#ffb703">
        <path d="M40 60 l6 14 14 6 -14 6 -6 14 -6 -14 -14 -6 14 -6z"/>
        <path d="M262 92 l4 10 10 4 -10 4 -4 10 -4 -10 -10 -4 10 -4z"/>
      </g>`;

    if (type === 'robot') {
      return `<svg viewBox="0 0 300 340" xmlns="http://www.w3.org/2000/svg" aria-label="Robot tutor">
        ${common}
        <g class="whole">
          <rect x="95" y="262" width="110" height="70" rx="22" fill="#4f6d9a"/>
          <rect x="128" y="278" width="44" height="22" rx="6" fill="#8ecae6"/>
          <g class="head">
            <line x1="150" y1="40" x2="150" y2="68" stroke="#9fb4d6" stroke-width="6"/>
            <circle cx="150" cy="34" r="11" fill="#ffb703"/>
            <rect x="62" y="66" width="176" height="176" rx="40" fill="#c9d6ea"/>
            <rect x="48" y="128" width="20" height="54" rx="8" fill="#9fb4d6"/>
            <rect x="232" y="128" width="20" height="54" rx="8" fill="#9fb4d6"/>
            <rect x="82" y="92" width="136" height="128" rx="28" fill="#1b2a4a"/>
            <g class="brows" stroke="#8ecae6" stroke-width="5" stroke-linecap="round">
              <line x1="104" y1="118" x2="128" y2="114"/><line x1="172" y1="114" x2="196" y2="118"/>
            </g>
            <g class="eyes-open"><g class="pupils" fill="#8ecae6">
              <circle cx="116" cy="146" r="14"/><circle cx="184" cy="146" r="14"/>
            </g></g>
            <g class="eyes-happy" fill="none" stroke="#8ecae6" stroke-width="7" stroke-linecap="round">
              <path d="M102 150 q14 -18 28 0"/><path d="M170 150 q14 -18 28 0"/>
            </g>
            <path class="mouth-smile" d="M122 186 q28 18 56 0" stroke="#ffb703" stroke-width="7" fill="none" stroke-linecap="round"/>
            <path class="mouth-big" d="M116 180 q34 36 68 0 z" fill="#ffb703"/>
            <rect class="mouth-talk" x="122" y="178" width="56" height="20" rx="8" fill="#ffb703"/>
          </g>
        </g>
      </svg>`;
    }

    const woman = type === 'woman';
    const skin = woman ? '#f1c27d' : '#d9a066';
    const hair = woman ? '#3b2416' : '#2b1d14';
    const shirt = woman ? '#e76f51' : '#2a9d8f';
    const hairBack = woman
      ? `<path d="M70 150 q-10 -100 80 -108 q90 8 80 108 l8 110 q-30 18 -50 4 l-6 -90 h-64 l-6 90 q-20 14 -50 -4z" fill="${hair}"/>`
      : '';
    const hairFront = woman
      ? `<path d="M84 130 q6 -70 66 -72 q60 2 66 72 q-30 -38 -78 -40 q-24 18 -54 40z" fill="${hair}"/>`
      : `<path d="M86 128 q-4 -72 64 -76 q70 4 64 76 q-8 -30 -30 -38 q-34 12 -70 6 q-20 10 -28 32z" fill="${hair}"/>`;
    const beard = woman ? '' : `<path d="M98 176 q52 70 104 0 q-6 46 -52 50 q-46 -4 -52 -50z" fill="${hair}" opacity="0.35"/>`;
    const lips = woman ? '#c0504d' : '#8a4b3a';

    return `<svg viewBox="0 0 300 340" xmlns="http://www.w3.org/2000/svg" aria-label="${woman ? 'Woman' : 'Man'} tutor">
      ${common}
      <g class="whole">
        ${hairBack}
        <path d="M58 340 q4 -78 92 -84 q88 6 92 84z" fill="${shirt}"/>
        <rect x="132" y="222" width="36" height="40" rx="12" fill="${skin}"/>
        <g class="head">
          <ellipse cx="84" cy="160" rx="12" ry="18" fill="${skin}"/>
          <ellipse cx="216" cy="160" rx="12" ry="18" fill="${skin}"/>
          <ellipse cx="150" cy="150" rx="68" ry="82" fill="${skin}"/>
          ${beard}
          ${hairFront}
          <g class="brows" stroke="${hair}" stroke-width="5" stroke-linecap="round" fill="none">
            <path d="M106 124 q14 -8 28 -2"/><path d="M166 122 q14 -6 28 2"/>
          </g>
          <g class="eyes-open">
            <ellipse cx="120" cy="146" rx="11" ry="12" fill="#fff"/>
            <ellipse cx="180" cy="146" rx="11" ry="12" fill="#fff"/>
            <g class="pupils" fill="#2b1d14"><circle cx="121" cy="148" r="6.5"/><circle cx="181" cy="148" r="6.5"/></g>
          </g>
          <g class="eyes-happy" fill="none" stroke="#2b1d14" stroke-width="5" stroke-linecap="round">
            <path d="M108 150 q12 -14 24 0"/><path d="M168 150 q12 -14 24 0"/>
          </g>
          <ellipse cx="104" cy="176" rx="12" ry="7" fill="#e5989b" opacity="0.45"/>
          <ellipse cx="196" cy="176" rx="12" ry="7" fill="#e5989b" opacity="0.45"/>
          <path d="M148 160 q-6 14 4 16" stroke="#00000033" stroke-width="3" fill="none" stroke-linecap="round"/>
          <path class="mouth-smile" d="M128 190 q22 16 44 0" stroke="${lips}" stroke-width="5" fill="none" stroke-linecap="round"/>
          <path class="mouth-big" d="M124 186 q26 34 52 0 z" fill="${lips}"/>
          <ellipse class="mouth-talk" cx="150" cy="194" rx="16" ry="11" fill="${lips}"/>
        </g>
      </g>
    </svg>`;
  },

  mount(el, type) {
    this.box = el;
    el.innerHTML = this.svg(type || 'woman');
    this.setState(this.state);
  },

  setState(state) {
    this.state = state;
    if (!this.box) return;
    const talking = this.box.classList.contains('st-talking');
    this.box.className = 'avatar-box st-' + state + (talking ? ' st-talking' : '');
  },

  /* বলার সময় মুখ নড়ে — অন্য অবস্থার (যেমন খুশি) সাথে একসাথে চলতে পারে */
  talking(on) {
    if (!this.box) return;
    this.box.classList.toggle('st-talking', !!on);
  }
};
