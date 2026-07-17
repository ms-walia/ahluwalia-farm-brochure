(function () {
  'use strict';

  const header = document.getElementById('header');
  const navToggle = document.querySelector('.nav__toggle');
  const navMenu = document.getElementById('nav-menu');
  const navLinks = navMenu.querySelectorAll('a');
  const contactForm = document.querySelector('.contact__form');

  /* Sticky header */
  function handleScroll() {
    if (window.scrollY > 60) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  }

  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll();

  /* Mobile navigation */
  navToggle.addEventListener('click', function () {
    const isOpen = navMenu.classList.toggle('open');
    navToggle.classList.toggle('active');
    navToggle.setAttribute('aria-expanded', isOpen);
    document.body.style.overflow = isOpen ? 'hidden' : '';
  });

  navLinks.forEach(function (link) {
    link.addEventListener('click', function () {
      navMenu.classList.remove('open');
      navToggle.classList.remove('active');
      navToggle.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    });
  });

  /* Scroll reveal */
  const revealElements = document.querySelectorAll('.reveal');

  if ('IntersectionObserver' in window) {
    const revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible');
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );

    revealElements.forEach(function (el) {
      revealObserver.observe(el);
    });
  } else {
    revealElements.forEach(function (el) {
      el.classList.add('visible');
    });
  }

  /* Stagger product cards */
  document.querySelectorAll('.product-card.reveal').forEach(function (card, i) {
    card.style.transitionDelay = i * 0.1 + 's';
  });

  document.querySelectorAll('.feature-card.reveal').forEach(function (card, i) {
    card.style.transitionDelay = (i % 4) * 0.08 + 's';
  });

  /* Contact form */
  if (contactForm) {
    contactForm.addEventListener('submit', function (e) {
      e.preventDefault();

      const name = contactForm.querySelector('#name').value.trim();
      const email = contactForm.querySelector('#email').value.trim();
      const phone = contactForm.querySelector('#phone').value.trim();
      const subject = contactForm.querySelector('#subject').value;
      const message = contactForm.querySelector('#message').value.trim();

      const subjectLabels = {
        retail: 'Retail Partnership',
        distributor: 'Distributor Inquiry',
        general: 'General Inquiry'
      };

      const body = [
        'Name: ' + name,
        'Email: ' + email,
        phone ? 'Phone: ' + phone : '',
        'Subject: ' + (subjectLabels[subject] || subject),
        '',
        message
      ].filter(Boolean).join('\n');

      const mailto = 'mailto:ahluwaliafarm@gmail.com?subject=' +
        encodeURIComponent('Ahluwalia Farm — ' + (subjectLabels[subject] || 'Inquiry')) +
        '&body=' + encodeURIComponent(body);

      window.location.href = mailto;
    });
  }

  /* Active nav link on scroll */
  const sections = document.querySelectorAll('section[id]');

  function highlightNav() {
    const scrollPos = window.scrollY + 120;

    sections.forEach(function (section) {
      const id = section.getAttribute('id');
      const link = navMenu.querySelector('a[href="#' + id + '"]');
      if (!link || link.classList.contains('nav__cta')) return;

      const top = section.offsetTop;
      const height = section.offsetHeight;

      if (scrollPos >= top && scrollPos < top + height) {
        navLinks.forEach(function (l) { l.style.color = ''; });
        link.style.color = 'var(--honey-gold)';
      }
    });
  }

  window.addEventListener('scroll', highlightNav, { passive: true });
})();
