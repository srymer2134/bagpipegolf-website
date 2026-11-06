// Click-to-copy for the snippet rows.
//
// A separate file rather than an inline block so `_headers` can keep
// `script-src 'self'` for /email/* — the same rule the /badbirdie and
// /nalg blocks follow. Those pages are served straight from the assets
// binding, so the Astro middleware that sets CSP never runs for them.
document.querySelectorAll('.copybtn').forEach(function (btn) {
  btn.addEventListener('click', function () {
    var src = document.getElementById(btn.dataset.copy);
    if (!src) return;

    var done = function (ok) {
      var was = btn.textContent;
      btn.textContent = ok ? 'Copied' : 'Press ⌘C';
      setTimeout(function () { btn.textContent = was; }, 1600);
    };

    // navigator.clipboard is undefined over plain http (local preview)
    // and can reject if the document is not focused.
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(src.textContent).then(
        function () { done(true); },
        function () { select(src); done(false); },
      );
    } else {
      select(src);
      done(false);
    }
  });
});

// Fallback: leave the text selected so one keystroke finishes the job.
function select(el) {
  var range = document.createRange();
  range.selectNodeContents(el);
  var sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}
