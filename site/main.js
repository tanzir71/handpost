/* global document, window */
// Progressive enhancement only: the page works without this file.
const menu = document.querySelector('.menu');
if (menu) {
  menu.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => (menu.open = false)));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menu.open) {
      menu.open = false;
      menu.querySelector('summary').focus();
    }
  });
  document.addEventListener('click', (event) => {
    if (menu.open && !menu.contains(event.target)) menu.open = false;
  });
}

// FAQ: two open columns on wide screens, collapsible <details> on phones.
const narrow = window.matchMedia('(max-width: 720px)');
const faqs = [...document.querySelectorAll('.faq__item')];
const syncFaq = () => faqs.forEach((item) => (item.open = !narrow.matches));
syncFaq();
narrow.addEventListener('change', syncFaq);
faqs.forEach((item) =>
  item.querySelector('summary').addEventListener('click', (event) => {
    if (!narrow.matches) event.preventDefault();
  }),
);
