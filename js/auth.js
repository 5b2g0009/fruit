/**
 * Authentication handling (Register, Login, Logout, Modals)
 */
document.addEventListener('DOMContentLoaded', () => {
  initAuthUI();
});

function initAuthUI() {
  const authModal = document.getElementById('authModal');
  const btnShowAuth = document.getElementById('btnShowAuth');
  const btnModalClose = document.getElementById('btnModalClose');
  const btnStatsLogin = document.getElementById('btnStatsLogin');
  const btnLogout = document.getElementById('btnLogout');
  
  const tabBtns = document.querySelectorAll('.modal-tab-btn');
  const loginForm = document.getElementById('formLogin');
  const signupForm = document.getElementById('formSignup');
  const authErrorAlert = document.getElementById('authErrorAlert');

  // API Base URL (Empty string means relative paths serve backend from same origin)
  const API_BASE = '';

  // Show Auth Modal
  function showModal(defaultTab = 'login') {
    authModal.classList.remove('hidden');
    authErrorAlert.classList.add('hidden');
    switchTab(defaultTab);
  }

  // Hide Auth Modal
  function hideModal() {
    authModal.classList.add('hidden');
    loginForm.reset();
    signupForm.reset();
  }

  // Switch between Login & Signup Tabs
  function switchTab(tab) {
    tabBtns.forEach(btn => {
      if (btn.getAttribute('data-tab') === tab) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    if (tab === 'login') {
      loginForm.classList.remove('hidden');
      signupForm.classList.add('hidden');
    } else {
      loginForm.classList.add('hidden');
      signupForm.classList.remove('hidden');
    }
  }

  // Event Listeners for modal triggers
  if (btnShowAuth) btnShowAuth.addEventListener('click', () => showModal('login'));
  if (btnModalClose) btnModalClose.addEventListener('click', hideModal);
  if (btnStatsLogin) btnStatsLogin.addEventListener('click', () => showModal('login'));

  authModal.addEventListener('click', (e) => {
    if (e.target === authModal) hideModal();
  });

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      authErrorAlert.classList.add('hidden');
      switchTab(btn.getAttribute('data-tab'));
    });
  });

  // Handle Login Submission
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authErrorAlert.classList.add('hidden');

    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    try {
      const response = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '登入失敗，請確認帳密。');
      }

      // Save credentials
      localStorage.setItem('fn_token', data.token);
      localStorage.setItem('fn_username', data.username);
      localStorage.setItem('fn_user_id', data.userId);

      // Refresh UI
      window.checkAuthStatus();
      hideModal();

      // Refresh user stats if on leaderboard page
      if (typeof window.fetchUserStats === 'function') {
        window.fetchUserStats();
      }
    } catch (err) {
      authErrorAlert.textContent = err.message;
      authErrorAlert.classList.remove('hidden');
    }
  });

  // Handle Signup Submission
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    authErrorAlert.classList.add('hidden');

    const username = document.getElementById('signupUsername').value;
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('signupConfirmPassword').value;

    if (password !== confirmPassword) {
      authErrorAlert.textContent = '兩次輸入的密碼不一致！';
      authErrorAlert.classList.remove('hidden');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || '註冊失敗，請換個帳號試試。');
      }

      // Save credentials
      localStorage.setItem('fn_token', data.token);
      localStorage.setItem('fn_username', data.username);
      localStorage.setItem('fn_user_id', data.userId);

      // Refresh UI
      window.checkAuthStatus();
      hideModal();

      // Refresh user stats if on leaderboard page
      if (typeof window.fetchUserStats === 'function') {
        window.fetchUserStats();
      }
    } catch (err) {
      authErrorAlert.textContent = err.message;
      authErrorAlert.classList.remove('hidden');
    }
  });

  // Handle Logout
  if (btnLogout) {
    btnLogout.addEventListener('click', () => {
      localStorage.removeItem('fn_token');
      localStorage.removeItem('fn_username');
      localStorage.removeItem('fn_user_id');

      window.checkAuthStatus();

      // Refresh stats display
      if (typeof window.fetchUserStats === 'function') {
        window.fetchUserStats();
      }
    });
  }

  // Expose showModal triggers to other scripts
  window.triggerAuthModal = showModal;
}
