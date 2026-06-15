/**
 * Firebase Firestore Leaderboard & User Stats
 *
 * 使用方式：
 * 1. HTML 請用 module 載入本檔：
 *    <script type="module" src="./leaderboard.js"></script>
 * 2. 遊戲結束時呼叫 window.submitLeaderboardScore({ score, sliced_fruits, max_combo, mode })
 */
import { auth, db } from './firebaseService.js';
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

const LEADERBOARD_COLLECTION = 'leaderboard';
const USER_STATS_COLLECTION = 'user_stats';
const LEADERBOARD_LIMIT = 50;

function getCurrentUser() {
  return auth.currentUser;
}

function getCurrentUsername(user = getCurrentUser()) {
  const fromAppState = window.appState?.username;
  const fromDisplayName = user?.displayName;
  const fromEmail = user?.email ? user.email.split('@')[0] : '';
  const username = (fromAppState || fromDisplayName || fromEmail || '匿名玩家').toString().trim();
  return username.slice(0, 30);
}

function normalizePositiveInteger(value, fallback = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.floor(number));
}

function firebaseDateToDate(value) {
  if (!value) return new Date();
  if (typeof value.toDate === 'function') return value.toDate();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function formatPlayDate(value) {
  return firebaseDateToDate(value).toLocaleString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function showLeaderboardMessage(message, className = 'text-muted') {
  const leaderboardBody = document.getElementById('leaderboardBody');
  if (!leaderboardBody) return;
  leaderboardBody.innerHTML = `
    <tr>
      <td colspan="6" class="text-center py-4 ${className}">${message}</td>
    </tr>
  `;
}

function renderLeaderboardRows(scores) {
  const leaderboardBody = document.getElementById('leaderboardBody');
  if (!leaderboardBody) return;

  if (!scores.length) {
    showLeaderboardMessage('目前尚無記錄，快來當第一個挑戰者！');
    return;
  }

  const currentUid = getCurrentUser()?.uid;
  leaderboardBody.innerHTML = '';

  scores.forEach((item, index) => {
    const rank = index + 1;
    let rankBadgeHtml = '';

    if (rank === 1) {
      rankBadgeHtml = `<span class="rank-badge rank-1"><i class="fa-solid fa-medal"></i></span>`;
    } else if (rank === 2) {
      rankBadgeHtml = `<span class="rank-badge rank-2"><i class="fa-solid fa-medal"></i></span>`;
    } else if (rank === 3) {
      rankBadgeHtml = `<span class="rank-badge rank-3"><i class="fa-solid fa-medal"></i></span>`;
    } else {
      rankBadgeHtml = `<span class="rank-badge rank-other">${rank}</span>`;
    }

    const row = document.createElement('tr');
    if (currentUid && item.uid === currentUid) row.className = 'active-user-row';

    row.innerHTML = `
      <td>${rankBadgeHtml}</td>
      <td class="font-semibold">${escapeHtml(item.username)}</td>
      <td class="neon-text-yellow font-bold">${item.score}</td>
      <td>${item.sliced_fruits || 0}</td>
      <td>${item.max_combo || 0} <span class="text-xs text-muted">Combo</span></td>
      <td class="text-muted text-sm">${formatPlayDate(item.created_at)}</td>
    `;
    leaderboardBody.appendChild(row);
  });
}

// 取得全域排行榜
export async function fetchLeaderboard() {
  const leaderboardBody = document.getElementById('leaderboardBody');
  if (!leaderboardBody) return;

  showLeaderboardMessage('<i class="fa-solid fa-spinner fa-spin"></i> 排行榜載入中...');

  try {
    const leaderboardQuery = query(
      collection(db, LEADERBOARD_COLLECTION),
      orderBy('score', 'desc'),
      limit(LEADERBOARD_LIMIT)
    );
    const snapshot = await getDocs(leaderboardQuery);
    const scores = snapshot.docs.map((scoreDoc) => ({
      id: scoreDoc.id,
      ...scoreDoc.data()
    }));

    // Firestore 只用 score 排序以避免需要複合索引；同分時前端用建立時間排序。
    scores.sort((a, b) => {
      if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
      return firebaseDateToDate(a.created_at) - firebaseDateToDate(b.created_at);
    });

    renderLeaderboardRows(scores);
  } catch (err) {
    console.error('Error fetching leaderboard:', err);
    showLeaderboardMessage(
      `<i class="fa-solid fa-triangle-exclamation"></i> 載入資料時發生錯誤：${escapeHtml(err.message)}`,
      'text-red-500'
    );
  }
}

// 取得目前登入玩家的個人統計
export async function fetchUserStats() {
  console.log('Firebase currentUser:', auth.currentUser);

  const statsUnauth = document.getElementById('statsContentUnauthenticated');
  const statsAuth = document.getElementById('statsContentAuthenticated');
  if (!statsUnauth || !statsAuth) return;

  const user = getCurrentUser();
  if (!user) {
    statsUnauth.classList.remove('hidden');
    statsAuth.classList.add('hidden');
    return;
  }

  try {
    const statsRef = doc(db, USER_STATS_COLLECTION, user.uid);
    const statsSnap = await getDoc(statsRef);
    const stats = statsSnap.exists()
      ? statsSnap.data()
      : { high_score: 0, games_played: 0, total_sliced: 0, highest_combo: 0 };

    document.getElementById('statsUsername').textContent = getCurrentUsername(user);
    document.getElementById('statHighScore').textContent = stats.high_score || 0;
    document.getElementById('statGamesPlayed').textContent = stats.games_played || 0;
    document.getElementById('statTotalSliced').textContent = stats.total_sliced || 0;
    document.getElementById('statHighestCombo').textContent = stats.highest_combo || 0;

    statsUnauth.classList.add('hidden');
    statsAuth.classList.remove('hidden');
  } catch (err) {
    console.error('Error fetching user stats:', err);
    statsUnauth.classList.remove('hidden');
    statsAuth.classList.add('hidden');
  }
}

// 遊戲結束時上傳分數 + 更新個人統計
export async function submitLeaderboardScore(result) {
  const user = getCurrentUser();
  if (!user) {
    const error = new Error('請先登入後再上傳排行榜分數');
    error.code = 'NEED_LOGIN';
    throw error;
  }

  const score = normalizePositiveInteger(result?.score);
  const slicedFruits = normalizePositiveInteger(result?.sliced_fruits);
  const maxCombo = normalizePositiveInteger(result?.max_combo);
  const mode = ['classic', 'arcade'].includes(result?.mode) ? result.mode : 'classic';
  const username = getCurrentUsername(user);

  const scorePayload = {
    uid: user.uid,
    username,
    score,
    sliced_fruits: slicedFruits,
    max_combo: maxCombo,
    mode,
    created_at: serverTimestamp()
  };

  const scoreRef = await addDoc(collection(db, LEADERBOARD_COLLECTION), scorePayload);

  const statsRef = doc(db, USER_STATS_COLLECTION, user.uid);
  await runTransaction(db, async (transaction) => {
    const statsSnap = await transaction.get(statsRef);
    const oldStats = statsSnap.exists() ? statsSnap.data() : {};

    transaction.set(statsRef, {
      uid: user.uid,
      username,
      high_score: Math.max(oldStats.high_score || 0, score),
      games_played: (oldStats.games_played || 0) + 1,
      total_sliced: (oldStats.total_sliced || 0) + slicedFruits,
      highest_combo: Math.max(oldStats.highest_combo || 0, maxCombo),
      updated_at: serverTimestamp()
    }, { merge: true });
  });

  return { id: scoreRef.id, ...scorePayload };
}

function initLeaderboard() {
  const btnRefresh = document.getElementById('btnRefreshLeaderboard');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      fetchLeaderboard();
      fetchUserStats();
    });
  }

  window.addEventListener('hashchange', () => {
    if (window.location.hash === '#leaderboard') {
      fetchLeaderboard();
      fetchUserStats();
    }
  });

  if (window.location.hash === '#leaderboard') {
    fetchLeaderboard();
    fetchUserStats();
  }

  onAuthStateChanged(auth, () => {
    if (window.location.hash === '#leaderboard') {
      fetchLeaderboard();
      fetchUserStats();
    }
  });
}

// Helper: Escape HTML strings to prevent XSS
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 讓非 module 的 game.js 也能呼叫
window.fetchLeaderboard = fetchLeaderboard;
window.fetchUserStats = fetchUserStats;
window.submitLeaderboardScore = submitLeaderboardScore;

document.addEventListener('DOMContentLoaded', initLeaderboard);
