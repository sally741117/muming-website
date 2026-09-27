// Standalone service pages use the existing navigation destinations.
const menuButton = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobileMenu');
menuButton.hidden = false;

function setMenuOpen(open) {
  mobileMenu.classList.toggle('open', open);
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? '關閉導覽選單' : '開啟導覽選單');
}

menuButton.addEventListener('click', () => {
  setMenuOpen(menuButton.getAttribute('aria-expanded') !== 'true');
});
mobileMenu.addEventListener('click', event => {
  if (event.target.closest('a')) setMenuOpen(false);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && mobileMenu.classList.contains('open')) {
    setMenuOpen(false);
    menuButton.focus();
  }
});
window.matchMedia('(min-width: 769px)').addEventListener('change', event => {
  if (event.matches) setMenuOpen(false);
});
