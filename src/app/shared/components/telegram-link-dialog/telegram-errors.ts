/** Maps errors from the Telegram Cloud Functions (HttpsError messages) and from
 *  AuthService.finishLogin to translation keys. */
export function telegramErrorKey(err: unknown): string {
  const message = (err as { message?: string })?.message ?? '';
  const code = (err as { code?: string })?.code ?? '';
  if (message.includes('TELEGRAM_NOT_LINKED')) return 'telegram.notLinked';
  if (message.includes('TELEGRAM_TAKEN')) return 'telegram.taken';
  if (message.includes('TELEGRAM_INVALID')) return 'telegram.invalid';
  if (message.includes('TENANT_SUSPENDED')) return 'auth.storeSuspended';
  if (message.includes('INACTIVE')) return 'auth.inactive';
  if (code === 'functions/not-found' || code === 'functions/internal' || code === 'functions/unavailable') {
    return 'telegram.serviceUnavailable';
  }
  return 'messages.error';
}
