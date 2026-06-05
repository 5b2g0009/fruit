/**
 * Leaderboard & User stats integration logic
 */
document.addEventListener('DOMContentLoaded', () => {
  initLeaderboard();
});

function initLeaderboard() {
  const btnRefresh = document.getElementById('btnRefreshLeaderboard');
  
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      fetchLeaderboard();
      fetchUserStats();
    });
  }

  // Also initial load if we're on leaderboard tab on start (hash based)
  if (window.location.hash === '#leaderboard') {
    fetchLeaderboard();
    fetchUserStats();
  }
}

// 1. Fetch Global Leaderboard rankings
async function fetchLeaderboard() {
  const leaderboardBody = document.getElementById('leaderboardBody');
  if (!leaderboardBody) return;

  try {
    const response = await fetch('/api/leaderboard');
    if (!response.ok) {
      throw new Error('無法取得排行榜資料');
    }
    const scores = await response.json();

    if (scores.length === 0) {
      leaderboardBody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center py-4 text-muted">目前尚無記錄，快來當第一個挑戰者！</td>
        </tr>
      `;
      return;
    }

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

      // Format date beautifully
      const playDate = new Date(item.created_at).toLocaleDateString('zh-TW', {
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      });

      const row = document.createElement('tr');
      // Highlight current user
      if (window.appState.isLoggedIn && item.username === window.appState.username) {
        row.className = 'active-user-row';
      }

      row.innerHTML = `
        <td>${rankBadgeHtml}</td>
        <td class="font-semibold">${escapeHtml(item.username)}</td>
        <td class="neon-text-yellow font-bold">${item.score}</td>
        <td>${item.sliced_fruits || 0}</td>
        <td>${item.max_combo || 0} <span class="text-xs text-muted">Combo</span></td>
        <td class="text-muted text-sm">${playDate}</td>
      `;
      leaderboardBody.appendChild(row);
    });

  } catch (err) {
    leaderboardBody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-4 text-red-500"><i class="fa-solid fa-triangle-exclamation"></i> 載入資料時發生錯誤：${err.message}</td>
      </tr>
    `;
  }
}

// 2. Fetch authenticated user personal statistics
async function fetchUserStats() {
  const statsUnauth = document.getElementById('statsContentUnauthenticated');
  const statsAuth = document.getElementById('statsContentAuthenticated');
  
  if (!statsUnauth || !statsAuth) return;

  if (!window.appState.isLoggedIn) {
    statsUnauth.classList.remove('hidden');
    statsAuth.classList.add('hidden');
    return;
  }

  try {
    const response = await fetch('/api/user/stats', {
      headers: {
        'Authorization': `Bearer ${window.appState.token}`
      }
    });

    if (!response.ok) {
      throw new Error('無法取得個人統計資料');
    }
    const stats = await response.json();

    // Populate elements
    document.getElementById('statsUsername').textContent = window.appState.username;
    document.getElementById('statHighScore').textContent = stats.high_score;
    document.getElementById('statGamesPlayed').textContent = stats.games_played;
    document.getElementById('statTotalSliced').textContent = stats.total_sliced;
    document.getElementById('statHighestCombo').textContent = stats.highest_combo;

    // Toggle panels
    statsUnauth.classList.add('hidden');
    statsAuth.classList.remove('hidden');

  } catch (err) {
    console.error('Error fetching user stats:', err);
    // Display unauth container as fallback
    statsUnauth.classList.remove('hidden');
    statsAuth.classList.add('hidden');
  }
}

// Helper: Escape HTML strings to prevent XSS
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Expose functions to router/main.js
window.fetchLeaderboard = fetchLeaderboard;
window.fetchUserStats = fetchUserStats;
