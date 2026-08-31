export function formatDate(ts) {
  if (!ts) return '-';
  return new Date(ts).toLocaleString();
}

export function formatNumber(n) {
  return Intl.NumberFormat().format(n || 0);
}

export function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

export function statusMeta(status) {
  const map = {
    'draft': { label: 'Draft', cls: 'badge-secondary' },
    'queued': { label: 'Queued', cls: 'badge-info' },
    'sending': { label: 'Sending', cls: 'badge-primary' },
    'paused': { label: 'Paused', cls: 'badge-warning' },
    'sent': { label: 'Sent', cls: 'badge-info' },
    'delivered': { label: 'Delivered', cls: 'badge-success' },
    'read': { label: 'Read', cls: 'badge-success' },
    'completed': { label: 'Completed', cls: 'badge-success' },
    'failed': { label: 'Failed', cls: 'badge-danger' },
    'undelivered': { label: 'Undelivered', cls: 'badge-danger' },
    'cancelled': { label: 'Cancelled', cls: 'badge-secondary' },
  };
  return map[status] || { label: status || '-', cls: 'badge-secondary' };
}

const toastContainer = () => {
  let el = document.querySelector('.toast-container');
  if (!el) {
    el = document.createElement('div');
    el.className = 'toast-container';
    document.body.appendChild(el);
  }
  return el;
};

export function toast(message, type = 'info', title) {
  const container = toastContainer();
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const iconMap = { success: '✓', error: '✕', warning: '!', info: 'ℹ' };
  el.innerHTML = `
    <div style="font-size:18px;flex-shrink:0">${iconMap[type] || iconMap.info}</div>
    <div class="toast-body">
      ${title ? `<div class="toast-title">${title}</div>` : ''}
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close" title="Dismiss">✕</button>
  `;
  container.appendChild(el);
  const close = () => { el.style.opacity = '0'; el.style.transform = 'translateX(100%)'; el.style.transition = 'all 0.2s'; setTimeout(() => el.remove(), 200); };
  el.querySelector('.toast-close')?.addEventListener('click', close);
  setTimeout(close, 5000);
}

export async function api(url, opts = {}) {
  const headers = { 'Accept': 'application/json', ...(opts.headers || {}) };
  if (opts.body && !(opts.body instanceof FormData) && typeof opts.body !== 'string') {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(url, { ...opts, headers });
  const type = res.headers.get('content-type') || '';
  let data = null;
  if (type.includes('json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }
  if (!res.ok) {
    const msg = typeof data === 'object' ? data?.error || `HTTP ${res.status}` : data || `HTTP ${res.status}`;
    toast(msg, 'error', 'Error');
    throw new Error(msg);
  }
  return data;
}

export function openModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) { el.classList.add('open'); }
}

export function closeModal(modalId) {
  const el = document.getElementById(modalId);
  if (el) { el.classList.remove('open'); }
}

export function setupModals() {
  document.querySelectorAll('[data-modal-open]').forEach(btn => {
    btn.addEventListener('click', () => openModal(btn.getAttribute('data-modal-open')));
  });
  document.querySelectorAll('[data-modal-close]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const target = btn.getAttribute('data-modal-close') || btn.closest('.modal-overlay')?.id;
      if (target) closeModal(target);
    });
  });
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.remove('open');
    });
  });
}

export function setupThemeToggle() {
  const saved = localStorage.getItem('theme');
  const prefers = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const isDark = saved ? saved === 'dark' : prefers;
  document.documentElement.classList.toggle('dark', isDark);

  const toggleBtn = document.querySelector('[data-theme-toggle]');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const nowDark = document.documentElement.classList.toggle('dark');
      localStorage.setItem('theme', nowDark ? 'dark' : 'light');
      toast(`Switched to ${nowDark ? 'dark' : 'light'} mode`, 'info');
    });
  }
}

export function setupSidebarToggle() {
  const btn = document.querySelector('[data-sidebar-toggle]');
  const sidebar = document.querySelector('.sidebar');
  if (btn && sidebar) {
    btn.addEventListener('click', () => sidebar.classList.toggle('open'));
    document.addEventListener('click', (e) => {
      if (sidebar.classList.contains('open') &&
          !sidebar.contains(e.target) &&
          !btn.contains(e.target)) {
        sidebar.classList.remove('open');
      }
    });
  }
}

export function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text == null ? '' : String(text);
  return d.innerHTML;
}

export function paginateUi({ container, total, page, perPage, onChange }) {
  const pages = Math.ceil(total / perPage) || 1;
  if (!container) return;
  const buttons = [];
  const push = (label, p, disabled = false, active = false) => {
    buttons.push(`<button class="btn btn-sm ${active ? 'btn-primary' : 'btn-secondary'}" data-page="${p}" ${disabled ? 'disabled' : ''}>${label}</button>`);
  };
  push('‹', Math.max(1, page - 1), page <= 1);
  const windowSize = 3;
  const start = Math.max(1, page - windowSize);
  const end = Math.min(pages, page + windowSize);
  if (start > 1) { push(1, 1); if (start > 2) buttons.push('<span style="padding:0 4px;color:var(--text-muted)">…</span>'); }
  for (let i = start; i <= end; i++) push(String(i), i, false, i === page);
  if (end < pages) { if (end < pages - 1) buttons.push('<span style="padding:0 4px;color:var(--text-muted)">…</span>'); push(String(pages), pages); }
  push('›', Math.min(pages, page + 1), page >= pages);

  container.innerHTML = `
    <div class="pagination-info">Showing ${Math.min(total, (page - 1) * perPage + 1)}–${Math.min(total, page * perPage)} of ${formatNumber(total)} results</div>
    <div class="pagination-buttons">${buttons.join('')}</div>
  `;
  container.querySelectorAll('[data-page]').forEach(b => {
    b.addEventListener('click', () => onChange(parseInt(b.getAttribute('data-page'), 10)));
  });
}
