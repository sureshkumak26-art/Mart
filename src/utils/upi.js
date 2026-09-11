import QRCode from 'qrcode';
import crypto from 'node:crypto';

export function createOrderId() {
  return `MART-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

export function buildUpiUrl({ upiId, payeeName = 'Mart', amount, orderId }) {
  const params = new URLSearchParams({
    pa: upiId,
    pn: payeeName,
    am: Number(amount).toFixed(2),
    cu: 'INR',
    tn: orderId
  });
  return `upi://pay?${params.toString()}`;
}

export async function createUpiQr({ upiId, payeeName, amount, orderId }) {
  if (!upiId) throw new Error('UPI_ID is not configured');
  if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) throw new Error('Invalid amount');
  const url = buildUpiUrl({ upiId, payeeName, amount, orderId });
  const dataUrl = await QRCode.toDataURL(url, { width: 600, margin: 2, errorCorrectionLevel: 'M' });
  return { url, dataUrl };
}
