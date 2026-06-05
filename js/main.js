/**
 * Main application manager (Router and UI controls)
 */
document.addEventListener('DOMContentLoaded', () => {
  initRouter();
  initMobileMenu();
  checkAuthStatus();
  
  // Set default GitHub/Youtube links (placeholders for the student to replace)
  document.getElementById('footerGithubLink').href = 'https://github.com/username/fruit-ninja-portfolio';
  document.getElementById('footerYoutubeLink').href = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'; // placeholder
});

// Global state variables
window.appState = {
  isLoggedIn: false,
  username: '',
  token: '',
  userId: null
};

// 1. SPA Router using hash changes
function initRouter() {
  const sections = document.querySelectorAll('.spa-section');
  const navLinks = document.querySelectorAll('.nav-link');

  function handleRoute() {
    const hash = window.location.hash || '#home';
    const targetId = hash.substring(1);
    
    let targetSectionFound = false;

    sections.forEach(section => {
      if (section.id === targetId) {
        section.classList.add('active');
        targetSectionFound = true;
      } else {
        section.classList.remove('active');
      }
    });

    // If invalid route, default to home
    if (!targetSectionFound) {
      window.location.hash = '#home';
      return;
    }

    // Update active nav-link style
    navLinks.forEach(link => {
      if (link.getAttribute('data-target') === targetId) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    // Close mobile menu if open
    const navMenu = document.getElementById('navMenu');
    if (navMenu.classList.contains('active')) {
      navMenu.classList.remove('active');
    }

    // Trigger page-specific initializations
    if (targetId === 'leaderboard') {
      if (typeof window.fetchLeaderboard === 'function') {
        window.fetchLeaderboard();
      }
      if (typeof window.fetchUserStats === 'function') {
        window.fetchUserStats();
      }
    } else if (targetId === 'game') {
      if (typeof window.resizeGameCanvas === 'function') {
        window.resizeGameCanvas();
      }
      updateGameAuthHUD();
    }
  }

  // Bind links clicking to update hash (if links are absolute, prevent and set hash)
  window.addEventListener('hashchange', handleRoute);
  
  // Initial routing
  handleRoute();
}

// 2. Mobile Responsive Menu (Hamburger Toggle)
function initMobileMenu() {
  const hamburgerMenu = document.getElementById('hamburgerMenu');
  const navMenu = document.getElementById('navMenu');

  hamburgerMenu.addEventListener('click', () => {
    navMenu.classList.toggle('active');
  });

  // Close when clicking outside
  document.addEventListener('click', (e) => {
    if (!navMenu.contains(e.target) && !hamburgerMenu.contains(e.target) && navMenu.classList.contains('active')) {
      navMenu.classList.remove('active');
    }
  });
}

// 3. User Login State Checker (Local Storage JWT check)
function checkAuthStatus() {
  const token = localStorage.getItem('fn_token');
  const username = localStorage.getItem('fn_username');
  const userId = localStorage.getItem('fn_user_id');

  const btnShowAuth = document.getElementById('btnShowAuth');
  const userProfileMenu = document.getElementById('userProfileMenu');
  const navUsername = document.getElementById('navUsername');

  if (token && username && userId) {
    window.appState.isLoggedIn = true;
    window.appState.token = token;
    window.appState.username = username;
    window.appState.userId = parseInt(userId);

    // Update UI elements
    btnShowAuth.classList.add('hidden');
    userProfileMenu.classList.remove('hidden');
    navUsername.textContent = username;
  } else {
    window.appState.isLoggedIn = false;
    window.appState.token = '';
    window.appState.username = '';
    window.appState.userId = null;

    btnShowAuth.classList.remove('hidden');
    userProfileMenu.classList.add('hidden');
  }
  
  // Also update stats elements and game overlays if needed
  updateGameAuthHUD();
}

// 4. Update Game Authentication HUD text
function updateGameAuthHUD() {
  const gameAuthStatus = document.getElementById('gameAuthStatus');
  if (gameAuthStatus) {
    if (window.appState.isLoggedIn) {
      gameAuthStatus.textContent = window.appState.username;
      gameAuthStatus.className = 'hud-val neon-text-green';
    } else {
      gameAuthStatus.textContent = '未登入';
      gameAuthStatus.className = 'hud-val neon-text-red';
    }
  }
}

// Share status checking globally
window.checkAuthStatus = checkAuthStatus;
window.updateGameAuthHUD = updateGameAuthHUD;
