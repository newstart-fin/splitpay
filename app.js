const form = document.querySelector('#split-form');
const merchantInput = document.querySelector('#merchant-ref');
const vpaInput = document.querySelector('#merchant-vpa');
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
const uploadButton = document.querySelector('#upload-qr');
const fileInput = document.querySelector('#qr-file');
const cameraButton = document.querySelector('#camera-qr');
const sourcePreview = document.querySelector('#source-preview');
const sourceStatus = document.querySelector('#source-status');
const scannerDialog = document.querySelector('#scanner-dialog');
const closeScanner = document.querySelector('#close-scanner');
const cameraVideo = document.querySelector('#camera-video');
const cameraStatus = document.querySelector('#camera-status');

let current = { merchant: '', vpa: '', amount: 0, invoice: '', parts: [] };
let selectedPart = null;
let cameraStream = null;
let cameraFrame = null;

const inr = value => new Intl.NumberFormat('en-IN', {
  style: 'currency', currency: 'INR', maximumFractionDigits: 0
}).format(value);

function splitAmount(totalAmount) {
  const minimum = 1700;
  const maximum = 1999;
  let partCount = Math.ceil(totalAmount / maximum);
  while (totalAmount < partCount * minimum) partCount += 1;
  const parts = Array(partCount).fill(minimum);
  let remaining = totalAmount - (partCount * minimum);
  while (remaining > 0) {
    const available = parts.map((part, index) => ({ index, room: maximum - part })).filter(item => item.room > 0);
    const slot = available[Math.floor(Math.random() * available.length)];
    const increase = Math.min(slot.room, remaining, 1 + Math.floor(Math.random() * 300));
    parts[slot.index] += increase;
    remaining -= increase;
  }
  return parts;
}

function createInvoiceId() {
  return 'SP-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
}

function payloadFor(part, index) {
  if (current.vpa) {
    const params = new URLSearchParams({
      pa: current.vpa,
      pn: current.merchant,
      am: part.amount.toFixed(2),
      cu: 'INR',
      tn: current.invoice + ' ' + String(index + 1) + '/' + String(current.parts.length)
    });
    return 'upi://pay?' + params;
  }
  const params = new URLSearchParams({
    merchant: current.merchant,
    invoice: current.invoice,
    sequence: String(index + 1) + '/' + String(current.parts.length),
    amount: String(part.amount),
    currency: 'INR',
    environment: 'splitpay-demo'
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
      ? (totalCount - paidCount) + ' payment' + (totalCount - paidCount === 1 ? '' : 's') + ' still waiting.'
      : 'Tap a QR card to preview its prefilled payment.';
}

function copyPayload(button, payload) {
  navigator.clipboard.writeText(payload)
    .then(() => {
      button.textContent = '✓';
      button.title = 'Payment link copied';
      setTimeout(() => { button.textContent = '⧉'; button.title = 'Copy payment link'; }, 1500);
    })
    .catch(() => {
      button.textContent = '!';
      button.title = 'Copy unavailable in this browser';
      setTimeout(() => { button.textContent = '⧉'; button.title = 'Copy payment link'; }, 1500);
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
    card.querySelector('.payment-detail').textContent = current.vpa
      ? 'UPI amount prefilled · ' + (index + 1) + ' of ' + current.parts.length
      : 'Demo QR · add a VPA for a payable UPI code';

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
    setValidation('Add a merchant name or reference first.', true);
    merchantInput.focus();
    return;
  }
  if (!Number.isFinite(amount) || amount < 1700 || amount > 1000000) {
    setValidation('Enter a whole-number amount between ₹1,700 and ₹10,00,000.', true);
    amountInput.focus();
    return;
  }
  const vpa = vpaInput.value.trim().toLowerCase();
  if (vpa && !/^[a-z0-9._-]+@[a-z0-9.-]+$/i.test(vpa)) {
    setValidation('Enter a valid merchant UPI ID, such as merchant@bank.', true);
    vpaInput.focus();
    return;
  }
  setValidation(vpa ? 'UPI links ready — verify the payee in your UPI app.' : 'Demo QR plan ready — add a VPA to create payable UPI links.');
  current = {
    merchant,
    vpa,
    amount,
    invoice: createInvoiceId(),
    parts: splitAmount(amount).map(value => ({ amount: value, paid: false }))
  };
  render();
}

function setDecodedPayload(payload, imageUrl = '') {
  let vpa = '';
  try {
    const query = payload.includes('?') ? payload.split('?')[1] : '';
    vpa = new URLSearchParams(query).get('pa') || '';
  } catch (error) {
    vpa = '';
  }
  if (!vpa || !/^[^@]+@[^@]+$/.test(vpa)) {
    sourceStatus.textContent = 'QR found, but it does not contain a readable UPI ID. Enter one below.';
    sourceStatus.style.color = '#b1442e';
    return;
  }
  vpaInput.value = vpa;
  sourcePreview.classList.add('is-ready');
  sourcePreview.innerHTML = imageUrl ? '<img alt="Uploaded merchant QR preview" src="' + imageUrl + '"><strong>QR decoded: ' + vpa + '</strong>' : '<strong>QR decoded: ' + vpa + '</strong>';
  sourceStatus.textContent = 'Ready. The merchant VPA will be used for each generated payment.';
  sourceStatus.style.color = '#167451';
  if (scannerDialog.open) closeCamera();
}

function decodeImage(file) {
  const imageUrl = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const result = jsQR(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
    if (result) setDecodedPayload(result.data, imageUrl);
    else sourceStatus.textContent = 'Could not find a QR in that image. Try a sharper crop.';
  };
  image.src = imageUrl;
}

function scanCameraFrame() {
  if (!cameraStream || cameraVideo.readyState < 2) return;
  const canvas = document.createElement('canvas');
  canvas.width = cameraVideo.videoWidth;
  canvas.height = cameraVideo.videoHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(cameraVideo, 0, 0, canvas.width, canvas.height);
  const result = jsQR(context.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height);
  if (result) {
    setDecodedPayload(result.data);
    return;
  }
  cameraFrame = requestAnimationFrame(scanCameraFrame);
}

async function openCamera() {
  scannerDialog.showModal();
  cameraStatus.textContent = 'Requesting camera access...';
  if (!navigator.mediaDevices?.getUserMedia) {
    cameraStatus.textContent = 'Camera access is unavailable here. Upload a QR image instead.';
    return;
  }
  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
    cameraVideo.srcObject = cameraStream;
    cameraStatus.textContent = 'Point your camera at a UPI QR code.';
    cameraFrame = requestAnimationFrame(scanCameraFrame);
  } catch (error) {
    cameraStatus.textContent = 'Camera permission was not granted. Upload a QR image instead.';
  }
}

function closeCamera() {
  if (cameraFrame) cancelAnimationFrame(cameraFrame);
  cameraStream?.getTracks().forEach(track => track.stop());
  cameraStream = null;
  cameraVideo.srcObject = null;
  if (scannerDialog.open) scannerDialog.close();
}

function openPayment(part, index, card) {
  selectedPart = { part, index, card };
  document.querySelector('#dialog-title').textContent = inr(part.amount);
  document.querySelector('#dialog-merchant').textContent = current.merchant;
  document.querySelector('#dialog-invoice').textContent = current.invoice;
  document.querySelector('#dialog-sequence').textContent = (index + 1) + ' of ' + current.parts.length;
  confirmPay.disabled = part.paid;
  confirmPay.innerHTML = part.paid ? 'Already marked paid' : current.vpa ? 'Open UPI app <span aria-hidden="true">→</span>' : 'Mark as paid <span aria-hidden="true">→</span>';
  dialog.showModal();
}

function handlePaymentAction() {
  if (!selectedPart || selectedPart.part.paid) return;
  if (current.vpa) {
    window.location.href = payloadFor(selectedPart.part, selectedPart.index);
    return;
  }
  markSelectedAsPaid();
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
confirmPay.addEventListener('click', handlePaymentAction);
dialog.addEventListener('close', () => { selectedPart = null; });
document.querySelector('#year').textContent = new Date().getFullYear();
uploadButton.addEventListener('keydown', event => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    fileInput.click();
  }
});
fileInput.addEventListener('change', event => {
  const file = event.target.files[0];
  if (file) decodeImage(file);
  event.target.value = '';
});
cameraButton.addEventListener('click', openCamera);
closeScanner.addEventListener('click', closeCamera);
scannerDialog.addEventListener('close', () => { cameraStream?.getTracks().forEach(track => track.stop()); cameraStream = null; });

generate();
