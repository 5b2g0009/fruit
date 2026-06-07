/**
 * Authentication handling (Firebase version)
 */
import { register, login, logout, onAuthChange } from "./firebaseService.js";

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

  // ===== UI =====
  function showModal(defaultTab = 'login') {
    authModal.classList.remove('hidden');
    authErrorAlert.classList.add('hidden');
    switchTab(defaultTab);
  }

  function hideModal() {
    authModal.classList.add('hidden');
    loginForm.reset();
    signupForm.reset();
  }

  function switchTab(tab) {
    tabBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });

    if (tab === 'login') {
      loginForm.classList.remove('hidden');
      signupForm.classList.add('hidden');
    } else {
      loginForm.classList.add('hidden');
      signupForm.classList.remove('hidden');
    }
  }

  // ===== Modal events =====
  btnShowAuth?.addEventListener('click', () => showModal('login'));
  btnModalClose?.addEventListener('click', hideModal);
  btnStatsLogin?.addEventListener('click', () => showModal('login'));

  authModal.addEventListener('click', (e) => {
    if (e.target === authModal) hideModal();
  });

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      authErrorAlert.classList.add('hidden');
      switchTab(btn.dataset.tab);
    });
  });

  // ===== Login =====
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;

    const fakeEmail = `${username}@game.com`;

    try {
      await login(fakeEmail, password);

      localStorage.setItem('fn_username', username);

      hideModal();
    } catch (err) {
      authErrorAlert.textContent = '帳號或密碼錯誤';
      authErrorAlert.classList.remove('hidden');
    }
  });

  // ===== Signup =====
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('signupUsername').value;
    const password = document.getElementById('signupPassword').value;
    const confirmPassword = document.getElementById('signupConfirmPassword').value;

    if (password !== confirmPassword) {
      authErrorAlert.textContent = '密碼不一致！';
      authErrorAlert.classList.remove('hidden');
      return;
    }

    const fakeEmail = `${username}@game.com`;

    try {
      await register(fakeEmail, password);

      localStorage.setItem('fn_username', username);

      hideModal();
    } catch (err) {
      authErrorAlert.textContent = err.message;
      authErrorAlert.classList.remove('hidden');
    }
  });

  // ===== Logout =====
  btnLogout?.addEventListener('click', async () => {
    await logout();
    localStorage.removeItem('fn_username');
  });

  // ===== Firebase Auth State =====
  onAuthChange((user) => {
    const userProfileMenu = document.getElementById('userProfileMenu');
    const navUsername = document.getElementById('navUsername');
    const gameAuthStatus = document.getElementById('gameAuthStatus');

    if (user) {
      // 已登入
      btnShowAuth?.classList.add('hidden');
      userProfileMenu?.classList.remove('hidden');

      const username = user.email.split('@')[0];
      navUsername.textContent = username;

      if (gameAuthStatus) gameAuthStatus.textContent = '已登入';

    } else {
      // 未登入
      btnShowAuth?.classList.remove('hidden');
      userProfileMenu?.classList.add('hidden');

      if (gameAuthStatus) gameAuthStatus.textContent = '未登入';
    }

    // 更新其他系統（排行榜）
    if (typeof window.fetchUserStats === 'function') {
      window.fetchUserStats();
    }
  });

  // 提供給其他 JS 呼叫
  window.triggerAuthModal = showModal;
}