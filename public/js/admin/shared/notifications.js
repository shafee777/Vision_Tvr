/**
 * Optii Admin — Toast Notifications, Accessible Modals & Confirmation Dialogs
 */

let previousFocusedElement = null;
let confirmResolver = null;

export function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast-msg ${type}`;
  toast.setAttribute('role', 'status');
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 250);
  }, 3800);
}

export function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  previousFocusedElement = document.activeElement;
  modal.classList.add('active');
  modal.setAttribute('aria-hidden', 'false');

  const focusable = modal.querySelector('input:not([type="hidden"]), select, textarea, button:not([disabled])');
  if (focusable) {
    setTimeout(() => focusable.focus(), 30);
  }
}

export function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
  if (previousFocusedElement && typeof previousFocusedElement.focus === 'function') {
    previousFocusedElement.focus();
    previousFocusedElement = null;
  }
}

export function trapModalFocus(event) {
  const activeModal = document.querySelector('.admin-modal-backdrop.active');
  if (!activeModal || event.key !== 'Tab') return;

  const focusableElements = Array.from(
    activeModal.querySelectorAll('button:not([disabled]), [href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
  ).filter(el => el.offsetParent !== null);

  if (focusableElements.length === 0) return;

  const first = focusableElements[0];
  const last = focusableElements[focusableElements.length - 1];

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function requestConfirmation({
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmLabel = 'Confirm',
  danger = false
}) {
  const modal = document.getElementById('modal-confirm-action');
  if (!modal) {
    return Promise.resolve(window.confirm(message));
  }

  document.getElementById('confirm-modal-title').textContent = title;
  document.getElementById('confirm-modal-message').textContent = message;
  const confirmBtn = document.getElementById('confirm-modal-submit');
  confirmBtn.textContent = confirmLabel;
  confirmBtn.className = danger ? 'btn-danger' : 'btn-primary';

  openModal('modal-confirm-action');

  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}

export function resolveConfirmation(accepted) {
  closeModal('modal-confirm-action');
  if (confirmResolver) {
    const fn = confirmResolver;
    confirmResolver = null;
    fn(Boolean(accepted));
  }
}
