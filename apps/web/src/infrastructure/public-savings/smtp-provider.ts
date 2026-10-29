import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import type SMTPTransport from 'nodemailer/lib/smtp-transport/index.js';
import type Mail from 'nodemailer/lib/mailer/index.js';
import { DeliveryProviderError } from './remote-provider.ts';
import type { Delivery, PublicSavingsDeliveryProvider } from './providers.ts';

export interface SmtpDeliveryConfig {
  enabled?: boolean; deliveryAuthorized?: boolean;
  host?: string; port?: number; tlsMode?: 'TLS' | 'STARTTLS'; tlsServername?: string;
  auth?: { user: string; pass: string }; from?: string; timeoutMs?: number;
  /** Isolated protocol tests only: exact loopback host, no credentials, never a deployment fallback. */
  allowLocalPlaintextForTests?: boolean;
}
type Transport = { sendMail(message: Mail.Options): Promise<{ accepted?: unknown[]; rejected?: unknown[] }>; close(): void };
type TransportFactory = (options: SMTPTransport.Options) => Transport | Promise<Transport>;
const nativeTransport: TransportFactory = async options => (await import('nodemailer')).default.createTransport(options);
const mailbox = (value: unknown): value is string => typeof value === 'string' && value.length <= 254 && /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,63}$/.test(value);
const hostname = (value: unknown): value is string => typeof value === 'string' && value.length <= 253 && /^[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?$/.test(value) && !value.includes('..');

/** SMTP acceptance is not recipient delivery or exactly-once delivery. Stable Message-ID is a deduplication hint only.
 * Callers must persist outbox state; timeout/connection loss after DATA is uncertain and must not be blindly retried.
 * No retries, logs, dynamic attachments, URLs or caller-provided headers are used here.
 */
export function createSmtpDeliveryProvider(config: SmtpDeliveryConfig = {}, createTransport: TransportFactory = nativeTransport): PublicSavingsDeliveryProvider {
  const localTest = config.allowLocalPlaintextForTests === true && config.host === '127.0.0.1' && config.auth === undefined && config.tlsMode === undefined;
  const timeoutMs = config.timeoutMs ?? 5000;
  if (config.enabled !== true || config.deliveryAuthorized !== true || !hostname(config.host) || !Number.isInteger(config.port) || config.port! < 1 || config.port! > 65535 || !mailbox(config.from)
    || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000 || (config.allowLocalPlaintextForTests === true && !localTest)
    || (!localTest && (!['TLS', 'STARTTLS'].includes(config.tlsMode ?? '') || !config.auth || typeof config.auth.user !== 'string' || !config.auth.user || /[\r\n\0]/.test(config.auth.user) || typeof config.auth.pass !== 'string' || !config.auth.pass || /[\r\n\0]/.test(config.auth.pass)
      || (isIP(config.host) !== 0 && !hostname(config.tlsServername)) || (config.tlsServername !== undefined && !hostname(config.tlsServername))))) throw new DeliveryProviderError('DELIVERY_CONFIGURATION_INVALID');
  const from = config.from;
  const options: SMTPTransport.Options = {
    host: config.host, port: config.port, secure: config.tlsMode === 'TLS', requireTLS: !localTest,
    ignoreTLS: localTest, ...(config.auth ? { auth: { ...config.auth } } : {}),
    tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2', servername: config.tlsServername ?? config.host },
    connectionTimeout: timeoutMs, greetingTimeout: timeoutMs, socketTimeout: timeoutMs, dnsTimeout: timeoutMs,
    logger: false, debug: false, pool: false, disableFileAccess: true, disableUrlAccess: true,
  };
  return { async deliver(message: Delivery) {
    if (!message || !/^[A-Za-z0-9-]{1,128}$/.test(message.id) || !mailbox(message.destination)
      || (message.kind === 'OTP' ? !/^\d{6}$/.test(message.code ?? '') || !Number.isSafeInteger(message.expiresAt) || message.expiresAt! <= Date.now() || message.reference !== undefined
        : message.kind !== 'SUBMISSION_CONFIRMATION' || !/^[A-Za-z0-9:_-]{1,128}$/.test(message.reference ?? '') || message.code !== undefined || message.expiresAt !== undefined)) throw new DeliveryProviderError('DELIVERY_MESSAGE_INVALID');
    const digest = createHash('sha256').update('public-savings:' + message.id).digest('hex');
    const mail: Mail.Options = {
      from, to: message.destination, envelope: { from, to: [message.destination] },
      messageId: `<public-savings.${digest}@${from.split('@')[1]}>`,
      subject: message.kind === 'OTP' ? 'Kode verifikasi simpanan sukarela' : 'Bukti penerimaan pengajuan simpanan sukarela',
      text: message.kind === 'OTP' ? `Kode verifikasi Anda: ${message.code}\nBerlaku sampai ${new Date(message.expiresAt!).toISOString()}. Jangan bagikan kode ini.`
        : `Pengajuan simpanan sukarela telah diterima.\nReferensi: ${message.reference}\nPengajuan masih menunggu proses koperasi melalui KOSIPA CI2.`,
      disableFileAccess: true, disableUrlAccess: true,
    };
    let transport: Transport | undefined, timer: ReturnType<typeof setTimeout> | undefined;
    try {
      transport = await createTransport(options);
      const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new DeliveryProviderError('DELIVERY_TIMEOUT')), timeoutMs); });
      const result = await Promise.race([transport.sendMail(mail), deadline]);
      if (!result.accepted?.includes(message.destination) || result.rejected?.length) throw new DeliveryProviderError('DELIVERY_UNAVAILABLE');
    } catch (error) { throw error instanceof DeliveryProviderError ? error : new DeliveryProviderError('DELIVERY_UNAVAILABLE'); }
    finally { if (timer) clearTimeout(timer); try { transport?.close(); } catch { /* Safe closure only; never expose provider details. */ } }
  } };
}
