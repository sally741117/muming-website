// Pricing-only navigation. Run in <head> so an initial hash cannot scroll before layout.
(() => {
  'use strict';
  const isPricing = () => location.hash === '#pricing';
  const arrivedAtPricing = isPricing();
  const restoration = history.scrollRestoration;
  let initialNavigation = arrivedAtPricing;
  let revision = 0;

  if (arrivedAtPricing) {
    // Preserve this history entry and its state; prevent a native jump followed by a correction.
    history.scrollRestoration = 'manual';
    history.replaceState(history.state, '', location.pathname + location.search);
  }

  function position(animate) {
    const intro = document.getElementById('pricing');
    const cards = [...document.querySelectorAll('#plans .plan-card')];
    const header = document.querySelector('.header');
    if (!intro || !cards.length || !header) return;

    const headerHeight = header.getBoundingClientRect().height;
    const available = Math.max(0, window.innerHeight - headerHeight);
    const mobile = matchMedia('(max-width: 760px)').matches;
    const introTop = intro.getBoundingClientRect().top + window.scrollY;
    const firstCard = cards[0].getBoundingClientRect();
    let targetTop;
    if (mobile) {
      // Preserve the existing mobile strategy: heading, controls, then the first card.
      const previewHeight = Math.min(firstCard.height / 4, available / 5);
      const focusHeight = firstCard.top + window.scrollY + previewHeight - introTop;
      const breathingRoom = Math.max(available * 0.025, (available - focusHeight) * 0.25);
      targetTop = introTop - headerHeight - breathingRoom;
    } else {
      const eyebrow = intro.querySelector('.eyebrow');
      if (!eyebrow) return;
      const focusTop = eyebrow.getBoundingClientRect().top;
      // Include every main price and its payment period, plus the card's own
      // padding as breathing room. The viewport proportion alone can cut off
      // Business's price, which sits below its tier selector.
      const focusBottom = Math.max(...cards.map(card => {
        const bounds = card.getBoundingClientRect();
        const priceEnd = card.querySelector('.price-period') || card.querySelector('.price');
        const priceBottom = priceEnd ? priceEnd.getBoundingClientRect().bottom : bounds.top;
        const padding = parseFloat(getComputedStyle(card).paddingBottom) || 0;
        return Math.min(bounds.bottom, Math.max(bounds.top + available * 0.4, priceBottom + padding));
      }));
      const focusCenter = (focusTop + focusBottom) / 2;
      const usableCenter = headerHeight + available / 2;
      targetTop = window.scrollY + focusCenter - usableCenter;
      // On short desktop windows the focus almost fills the usable height.
      // Keep the eyebrow clear of the header with up to 24px of clearance.
      const clearance = Math.min(24, available * 0.025);
      targetTop = Math.min(targetTop, window.scrollY + focusTop - headerHeight - clearance);
    }
    const top = Math.max(0, targetTop);
    if (Math.abs(window.scrollY - top) < 1) return;
    window.scrollTo({ top, behavior: animate && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'instant' });
  }

  function settle(animate = false) {
    const current = ++revision;
    // Font metrics and two layout frames are settled before measuring. This also runs
    // after native hash/history restoration, rather than racing it with an arbitrary timer.
    const fonts = document.fonts ? document.fonts.ready : Promise.resolve();
    fonts.then(() => requestAnimationFrame(() => requestAnimationFrame(() => {
      if (current !== revision || !isPricing()) return;
      position(animate);
    })));
  }

  function start() {
    if (initialNavigation) {
      // Synchronous initial positioning prevents painting a wrong anchor landing.
      position(false);
    }

    document.addEventListener('click', event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target.closest?.('a[href]');
      if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
      const url = new URL(link.href, location.href);
      if (url.origin !== location.origin || url.pathname !== location.pathname || url.search !== location.search || url.hash !== '#pricing') return;
      event.preventDefault();
      initialNavigation = false;
      ++revision;
      if (!isPricing()) history.pushState(history.state, '', url.href);
      position(true);
    });
  }

  // The parser emits this after the product markup, before deferred catalog/UI
  // downloads can delay DOMContentLoaded. No hidden page or double smooth jump.
  document.addEventListener('mu:pricing-layout', () => {
    if (initialNavigation) position(false);
  }, { once: true });
  document.addEventListener('DOMContentLoaded', start, { once: true });
  window.addEventListener('hashchange', () => { if (isPricing()) settle(); else ++revision; });
  window.addEventListener('popstate', () => { if (isPricing()) settle(); else ++revision; });
  window.addEventListener('pageshow', () => {
    if (initialNavigation) {
      // Keep the hash suspended until the browser's initial fragment/restoration
      // phase has finished. replaceState restores the URL without another jump.
      const current = revision;
      const fonts = document.fonts ? document.fonts.ready : Promise.resolve();
      fonts.then(() => requestAnimationFrame(() => requestAnimationFrame(() => {
        if (current !== revision) {
          initialNavigation = false;
          history.scrollRestoration = restoration;
          return;
        }
        initialNavigation = false;
        history.replaceState(history.state, '', location.pathname + location.search + '#pricing');
        position(false);
        history.scrollRestoration = restoration;
      })));
    } else {
      if (isPricing()) settle();
      if (arrivedAtPricing) history.scrollRestoration = restoration;
    }
  });
})();
