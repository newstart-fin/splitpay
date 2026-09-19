const form = document.querySelector('#split-form');
const merchantInput = document.querySelector('#merchant-ref');
const amountInput = document.querySelector('#amount');
const validationMessage = document.querySelector('#validation-message');
const results = document.querySelector('#results');
const grid = document.querySelector('#qr-grid');
const template = document.querySelector('#card-template');
const count = document.querySelector('#qr-count');
const total = document.querySelector('#invoice-total');
const invoiceId = document.querySelector('#invoice-id');
const merchantSummary = document.querySelector('#merchant-summary');
const amountSummary = document.querySelector('#amount-summary');
const progressLabel = document.querySelector('#progress-label');
const progressPercent = document.querySelector('#progress-percent');
const progressFill = document.querySelector('#progress-fill');
const progressTrack = document.querySelector('.progress-track');
const progressNote = document.querySelector('#progress-note');
const regenerate = document.querySelector('#regenerate');
const dialog = document.querySelector('#payment-dialog');
const cancelPay = document.querySelector('#cancel-pay');
const confirmPay = document.querySelector('#confirm-pay');

let current = { merchant: '', amount: 0, invoice: '', parts: [] };
let selectedPart = null;

const inr = value => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0
}).format(value);

function splitAmount(totalAmount) {
  const parts = [];
  let remaining = totalAmount;
  while (remaining >= 1800) {
    const candidate = 1800 + Math.floor(Math.random() * 200);
    const part = Math.min(remaining, candidate);
    parts.push(part);
    remaining -= part;
  }
  if (remaining > 0) parts.push(remaining);
  return parts;
}

function createInvoiceId() {
  return 'SP-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
}

function payloadFor(part, index) {
  const params = new URLSearchParams({
    merchant: current.merchant,
    invoice: current.invoice,
    sequence: String(index + 1) + '/' + String(current.parts.length),
    amount: String(part.amount),
    currency: 'INR',
    environment: 'parody-demo'
  });
  return 'splitpay-demo://preview?' + params;
}

function getPaidCount() {
  return current.parts.filter(part => part.paid).length;
}

function updateProgress() {
  const paidCount = getPaidCount();
  const totalCount = current.parts.length;
  const percentage = totalCount ? Math.round((paidCount / totalCount) * 100) : 0;
  progressLabel.textContent = paidCount + ' of ' + totalCount + ' simulated';
  progressPercent.textContent = percentage + '%';
  progressFill.style.width = percentage + '%';
  progressTrack.setAttribute('aria-valuenow', String(percentage));
  progressNote.textContent = paidCount === totalCount && totalCount > 0
    ? 'Checkout complete. Thankfully, no money moved.'
    : paidCount > 0
      ? (totalCount - paidCount) + ' fictional approval' + (totalCount - paidCount === 1 ? '' : 's') + ' still waiting.'
      : 'Tap a QR card to preview its prefilled payment.';
}

function copyPayload(button, payload) {
  navigator.clipboard.writeText(payload)
    .then(() => {
      button.textContent = '✓';
      button.title = 'Fictional payload copied';
      setTimeout(() => { button.textContent = '⧉'; button.title = 'Copy fictional QR payload'; }, 1500);
    })
    .catch(() => {
      button.textContent = '!';
      button.title = 'Copy unavailable in this browser';
      setTimeout(() => { button.textContent = '⧉'; button.title = 'Copy fictional QR payload'; }, 1500);
    });
}

function render() {
  grid.replaceChildren();
  total.textContent = inr(current.amount);
  count.textContent = current.parts.length;
  invoiceId.textContent = current.invoice;
  merchantSummary.textContent = current.merchant;
  amountSummary.textContent = inr(current.amount);

  current.parts.forEach((part, index) => {
    const card = template.content.firstElementChild.cloneNode(true);
    const payload = payloadFor(part, index);
    const preview = () => openPayment(part, index, card);
    card.querySelector('.sequence').textContent = 'Approval ' + String(index + 1).padStart(2, '0');
    card.querySelector('.payment-amount').textContent = inr(part.amount);
    card.querySelector('.payment-detail').textContent = part.amount < 1800
      ? 'The leftover. Still needs its own pretend approval.'
      : 'Prefilled fictional amount · ' + (index + 1) + ' of ' + current.parts.length;

    const qrTarget = card.querySelector('.qr');
    new QRCode(qrTarget, {
      text: payload,
      width: 172,
      height: 172,
      colorDark: '#10222f',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });

    card.querySelector('.qr-button').addEventListener('click', preview);
    card.querySelector('.simulate-button').addEventListener('click', preview);
    card.querySelector('.copy-button').addEventListener('click', event => copyPayload(event.currentTarget, payload));
    grid.append(card);
  });

  updateProgress();
  results.hidden = false;
  results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setValidation(message, invalid = false) {
  validationMessage.textContent = message;
  validationMessage.classList.toggle('is-error', invalid);
}

function generate() {
  const amount = Math.floor(Number(amountInput.value));
  const merchant = merchantInput.value.trim();
  if (!merchant) {
    setValidation('Add a fictional merchant reference first.', true);
    merchantInput.focus();
    return;
  }
  if (!Number.isFinite(amount) || amount < 1 || amount > 1000000) {
    setValidation('Enter a whole-number amount between ₹1 and ₹10,00,000.', true);
    amountInput.focus();
    return;
  }
  setValidation('Your total is always preserved — only the fictional checkout gets worse.');
  current = {
    merchant,
    amount,
    invoice: createInvoiceId(),
    parts: splitAmount(amount).map(value => ({ amount: value, paid: false }))
  };
  render();
}

function openPayment(part, index, card) {
  selectedPart = { part, index, card };
  document.querySelector('#dialog-title').textContent = inr(part.amount);
  document.querySelector('#dialog-merchant').textContent = current.merchant;
  document.querySelector('#dialog-invoice').textContent = current.invoice;
  document.querySelector('#dialog-sequence').textContent = (index + 1) + ' of ' + current.parts.length;
  confirmPay.disabled = part.paid;
  confirmPay.innerHTML = part.paid ? 'Already simulated' : 'Simulate payment <span aria-hidden="true">→</span>';
  dialog.showModal();
}

function markSelectedAsPaid() {
  if (!selectedPart || selectedPart.part.paid) return;
  selectedPart.part.paid = true;
  const { card } = selectedPart;
  const status = card.querySelector('.status');
  status.classList.add('paid');
  status.querySelector('span').textContent = 'Simulated paid';
  card.classList.add('is-paid');
  card.querySelector('.simulate-button').textContent = 'View payment preview';
  updateProgress();
  dialog.close();
}

form.addEventListener('submit', event => { event.preventDefault(); generate(); });
regenerate.addEventListener('click', generate);
cancelPay.addEventListener('click', () => dialog.close());
confirmPay.addEventListener('click', markSelectedAsPaid);
dialog.addEventListener('close', () => { selectedPart = null; });
document.querySelector('#year').textContent = new Date().getFullYear();

generate();
