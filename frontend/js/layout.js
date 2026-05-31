(function () {
  function getToken() {
    return localStorage.getItem('auth_token');
  }

  function getUsername() {
    return localStorage.getItem('auth_username') || 'Admin';
  }

  function getInitials(name) {
    return String(name || 'A')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(part => part[0].toUpperCase())
      .join('') || 'A';
  }

  function setProfileUI() {
    const name = getUsername();
    const nameNodes = document.querySelectorAll('[data-user-name]');
    const roleNodes = document.querySelectorAll('[data-user-role]');
    const initialsNodes = document.querySelectorAll('[data-user-initials]');

    nameNodes.forEach(node => node.textContent = name);
    roleNodes.forEach(node => node.textContent = 'Operator');
    initialsNodes.forEach(node => node.textContent = getInitials(name));
  }

  async function doLogout() {
    try {
      const token = getToken();
      if (token && window.api?.logout) {
        await window.api.logout();
      } else if (token) {
        await fetch('/api/logout', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
      }
    } catch (error) {
      console.warn('Logout warning:', error);
    } finally {
      localStorage.removeItem('auth_token');
      localStorage.removeItem('auth_username');
      window.location.href = '/login.html';
    }
  }

  function setupSidebarToggle() {
    const toggle = document.getElementById('sidebarToggle');
    if (!toggle) return;

    const applyState = () => {
      const forceExpanded = document.body.dataset.page === 'classifier';
      const collapsed = forceExpanded ? false : localStorage.getItem('sidebarCollapsed') === '1';
      document.body.classList.toggle('sidebar-collapsed', collapsed);
      toggle.setAttribute('aria-expanded', String(!collapsed));
    };

    applyState();

    toggle.addEventListener('click', () => {
      const nextCollapsed = !document.body.classList.contains('sidebar-collapsed');
      document.body.classList.toggle('sidebar-collapsed', nextCollapsed);
      localStorage.setItem('sidebarCollapsed', nextCollapsed ? '1' : '0');
      toggle.setAttribute('aria-expanded', String(!nextCollapsed));
    });
  }

  function setupActiveNav() {
    const currentPath = window.location.pathname.split('/').pop() || 'dashboard.html';
    document.querySelectorAll('[data-nav-page]').forEach(link => {
      const page = link.getAttribute('data-nav-page');
      const active = page === currentPath || (page === 'dashboard.html' && (currentPath === '' || currentPath === 'index.html'));
      link.classList.toggle('active', active);
    });
  }

  function setupLogoutButtons() {
    document.querySelectorAll('[data-logout]').forEach(button => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        doLogout();
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!window.location.pathname.endsWith('login.html')) {
      const token = getToken();
      if (!token) {
        window.location.href = '/login.html';
        return;
      }
    }

    setProfileUI();
    setupSidebarToggle();
    setupActiveNav();
    setupLogoutButtons();
  });

  window.Layout = {
    logout: doLogout,
    setProfileUI,
    getUsername,
    getInitials
  };
})();
