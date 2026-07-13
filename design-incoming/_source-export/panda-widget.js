/* <panda-widget> — panda interactivo de guardia (capa de presentación aislada).
   Ojos siguen el cursor · parpadeo · se duerme tras 30s · reacciona a drag de archivos
   · easter eggs al hacer clic. Respeta prefers-reduced-motion. */
(function () {
  if (customElements.get('panda-widget')) return;
  var RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var INK = '#2d2a26', PAPER = '#fffdf6';
  var EGGS = [
    '\u00a1Hola! Soy el panda de guardia.',
    '\u00bfUn poco de bamb\u00fa?',
    'Psst\u2026 esto queda entre t\u00fa y yo \ud83e\udd2b',
    'Bytes enviados a internet: 0. Lo juro.',
    'Lo que pasa en tu navegador, se queda en tu navegador.'
  ];

  class PandaWidget extends HTMLElement {
    connectedCallback() {
      if (this._built) return; this._built = true;
      var self = this;
      this._egg = 0; this._asleep = false; this._timers = [];
      this.style.cssText = 'position:fixed;right:16px;bottom:10px;z-index:9000;width:132px;pointer-events:none;';
      this.innerHTML =
        '<div class="pw-bubble" style="opacity:0;transition:opacity .25s;position:absolute;bottom:120px;right:4px;width:200px;background:' + PAPER + ';color:' + INK + ';border:2.5px solid ' + INK + ';border-radius:18px 22px 20px 24px/24px 18px 26px 18px;padding:9px 12px;font:16px/1.25 \'Patrick Hand\',cursive;box-shadow:3px 4px 0 rgba(0,0,0,.18)"></div>' +
        '<div class="pw-zzz" style="display:none;position:absolute;top:-8px;right:2px;font:700 20px \'Patrick Hand\',cursive;color:#8a857b;transform:rotate(12deg)">Z z z\u2026</div>' +
        '<svg class="pw-svg" viewBox="0 0 132 120" width="132" height="120" role="img" tabindex="0" aria-label="Panda de guardia: haz clic para saludarlo. Vigila que nada salga de tu navegador." style="pointer-events:auto;cursor:pointer;display:block;transition:transform .25s">' +
          '<rect x="113" y="48" width="7" height="58" rx="3" fill="#79b84a"/>' +
          '<line x1="113" y1="66" x2="120" y2="66" stroke="#4c7a2c" stroke-width="2"/>' +
          '<line x1="113" y1="86" x2="120" y2="86" stroke="#4c7a2c" stroke-width="2"/>' +
          '<ellipse cx="108" cy="45" rx="10" ry="4" fill="#8fd14f" transform="rotate(-28 108 45)"/>' +
          '<ellipse cx="125" cy="42" rx="9" ry="3.6" fill="#8fd14f" transform="rotate(22 125 42)"/>' +
          '<circle cx="28" cy="27" r="15" fill="' + INK + '"/>' +
          '<circle cx="92" cy="27" r="15" fill="' + INK + '"/>' +
          '<ellipse cx="60" cy="63" rx="48" ry="44" fill="' + PAPER + '" stroke="' + INK + '" stroke-width="4"/>' +
          '<ellipse cx="41" cy="56" rx="14" ry="17" fill="' + INK + '" transform="rotate(-14 41 56)"/>' +
          '<ellipse cx="79" cy="56" rx="14" ry="17" fill="' + INK + '" transform="rotate(14 79 56)"/>' +
          '<g class="pw-eyes" style="transform-box:fill-box;transform-origin:center;transition:transform .12s">' +
            '<circle cx="41" cy="58" r="6.5" fill="#fff"/><circle cx="79" cy="58" r="6.5" fill="#fff"/>' +
            '<g class="pw-pupils" style="transition:transform .15s"><circle cx="41" cy="58" r="3.2" fill="' + INK + '"/><circle cx="79" cy="58" r="3.2" fill="' + INK + '"/></g>' +
          '</g>' +
          '<ellipse cx="60" cy="76" rx="6.5" ry="4.6" fill="' + INK + '"/>' +
          '<path d="M53 87 Q60 93 67 87" fill="none" stroke="' + INK + '" stroke-width="3" stroke-linecap="round"/>' +
        '</svg>';

      var svg = this.querySelector('.pw-svg');
      var pupils = this.querySelector('.pw-pupils');
      var eyes = this.querySelector('.pw-eyes');
      var bubble = this.querySelector('.pw-bubble');
      var zzz = this.querySelector('.pw-zzz');

      function say(txt, ms) {
        bubble.textContent = txt; bubble.style.opacity = '1';
        clearTimeout(self._sayT);
        self._sayT = setTimeout(function () { bubble.style.opacity = '0'; }, ms || 2600);
      }
      this._say = say;

      function sleep() {
        if (RM) return;
        self._asleep = true;
        eyes.style.transform = 'scaleY(0.12)';
        zzz.style.display = 'block';
      }
      function wake() {
        if (!self._asleep) return;
        self._asleep = false;
        eyes.style.transform = 'scaleY(1)';
        zzz.style.display = 'none';
      }
      function resetIdle() {
        wake();
        clearTimeout(self._idleT);
        self._idleT = setTimeout(sleep, 30000);
      }
      resetIdle();

      // Ojos siguen el cursor
      this._onMove = function (e) {
        resetIdle();
        if (RM) return;
        var r = svg.getBoundingClientRect();
        var cx = r.left + r.width / 2, cy = r.top + r.height * 0.45;
        var dx = e.clientX - cx, dy = e.clientY - cy;
        var d = Math.max(1, Math.hypot(dx, dy));
        pupils.style.transform = 'translate(' + (dx / d * 3).toFixed(1) + 'px,' + (dy / d * 3).toFixed(1) + 'px)';
      };
      this._onScroll = function () {
        resetIdle();
        if (RM) return;
        pupils.style.transform = 'translate(0,-3px)';
        clearTimeout(self._scrT);
        self._scrT = setTimeout(function () { pupils.style.transform = 'translate(0,0)'; }, 500);
      };
      this._onKey = resetIdle;

      // Parpadeo
      if (!RM) {
        this._blinkT = setInterval(function () {
          if (self._asleep) return;
          eyes.style.transform = 'scaleY(0.12)';
          setTimeout(function () { if (!self._asleep) eyes.style.transform = 'scaleY(1)'; }, 140);
        }, 4600);
      }

      // Drag de archivos sobre la ventana
      this._onDragOver = function (e) {
        resetIdle();
        say('\u00a1Su\u00e9ltalo aqu\u00ed, prometo no chismosear!', 1800);
        if (!RM) svg.style.transform = 'translateY(-6px) rotate(-4deg)';
        clearTimeout(self._dragT);
        self._dragT = setTimeout(function () { svg.style.transform = ''; }, 1200);
      };

      // Easter eggs
      this._onClick = function () {
        say(EGGS[self._egg % EGGS.length], 2800);
        self._egg++;
        if (!RM) {
          svg.style.transform = 'rotate(3deg) scale(1.05)';
          setTimeout(function () { svg.style.transform = ''; }, 250);
        }
      };
      svg.addEventListener('click', this._onClick);
      svg.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); self._onClick(); } });

      window.addEventListener('mousemove', this._onMove);
      window.addEventListener('scroll', this._onScroll, { passive: true });
      window.addEventListener('keydown', this._onKey);
      window.addEventListener('dragover', this._onDragOver);
    }
    disconnectedCallback() {
      clearInterval(this._blinkT);
      clearTimeout(this._idleT); clearTimeout(this._sayT); clearTimeout(this._dragT); clearTimeout(this._scrT);
      window.removeEventListener('mousemove', this._onMove);
      window.removeEventListener('scroll', this._onScroll);
      window.removeEventListener('keydown', this._onKey);
      window.removeEventListener('dragover', this._onDragOver);
    }
  }
  customElements.define('panda-widget', PandaWidget);
})();
