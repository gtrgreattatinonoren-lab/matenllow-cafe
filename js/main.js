// 抹天狼 -MATENRO- Tea & Sweets Cafe
// ローディング演出 / ヘッダー制御 / モバイルメニュー / メニュータブ / スクロールアニメーション

document.addEventListener('DOMContentLoaded', () => {

  // --- ローディング演出 ---
  const loader = document.getElementById('loader');
  if (loader) {
    window.addEventListener('load', () => {
      setTimeout(() => loader.classList.add('is-hidden'), 400);
    });
    // load イベントが発火しない環境向けの保険
    setTimeout(() => loader.classList.add('is-hidden'), 2500);
  }

  // --- ヘッダー: スクロールで背景を付ける ---
  const header = document.getElementById('siteHeader');
  const onScroll = () => {
    if (window.scrollY > 30) {
      header.classList.add('is-scrolled');
    } else {
      header.classList.remove('is-scrolled');
    }
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // --- モバイルナビ開閉 ---
  const navToggle = document.getElementById('navToggle');
  const mainNav = document.getElementById('mainNav');
  if (navToggle && mainNav) {
    navToggle.addEventListener('click', () => {
      const isOpen = mainNav.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });

    mainNav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        mainNav.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // --- メニュータブ切り替え ---
  const tabButtons = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.menu-panel');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;

      tabButtons.forEach(b => {
        b.classList.remove('is-active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('is-active');
      btn.setAttribute('aria-selected', 'true');

      panels.forEach(panel => {
        if (panel.dataset.panel === target) {
          panel.classList.add('is-active');
          panel.hidden = false;
        } else {
          panel.classList.remove('is-active');
          panel.hidden = true;
        }
      });
    });
  });

  // --- スクロールで要素をフェードイン ---
  const revealTargets = document.querySelectorAll(
    '.section-eyebrow, .section-title, .section-lead, .story-grid, .menu-tabs, .menu-panel, .gallery-card, .voice-card, .access-grid'
  );
  revealTargets.forEach(el => el.classList.add('reveal'));

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    revealTargets.forEach(el => observer.observe(el));
  } else {
    revealTargets.forEach(el => el.classList.add('is-visible'));
  }

  // --- フッター年号 ---
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
});
