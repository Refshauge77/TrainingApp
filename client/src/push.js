import { api } from './api.js';

const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

/**
 * 'ok' | 'ios-install' (iPhone: works only once the app is added to the home screen) | 'unsupported'
 */
export function pushSupport() {
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (supported) return 'ok';
  if (isIos() && !isStandalone()) return 'ios-install';
  return 'unsupported';
}

export const permission = () => ('Notification' in window ? Notification.permission : 'denied');

async function registration() {
  return navigator.serviceWorker.ready;
}

export async function currentSubscription() {
  if (pushSupport() !== 'ok') return null;
  return (await registration()).pushManager.getSubscription();
}

export async function enablePush() {
  const result = await Notification.requestPermission();
  if (result !== 'granted') {
    throw new Error('Notifikationer er blokeret. Tillad dem for appen i browserens eller telefonens indstillinger.');
  }
  const { publicKey } = await api.get('/push/key');
  const reg = await registration();
  // A subscription made with another server key cannot be reused.
  await (await reg.pushManager.getSubscription())?.unsubscribe();
  const subscription = await Promise.race([
    reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(publicKey) }),
    new Promise((_, reject) => setTimeout(
      () => reject(new Error('Kunne ikke få forbindelse til notifikationstjenesten – prøv igen senere.')), 20_000)),
  ]);
  await api.post('/push/subscribe', { subscription: subscription.toJSON() });
  return subscription;
}

export async function disablePush() {
  const subscription = await currentSubscription();
  if (!subscription) return;
  await api.post('/push/unsubscribe', { endpoint: subscription.endpoint }).catch(() => {});
  await subscription.unsubscribe();
}

/** Re-registers this device for the logged-in user (another user may have logged in on it). */
export async function syncSubscription() {
  if (permission() !== 'granted') return;
  const subscription = await currentSubscription();
  if (subscription) await api.post('/push/subscribe', { subscription: subscription.toJSON() });
}

function base64UrlToBytes(value) {
  const padded = (value + '='.repeat((4 - (value.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}
