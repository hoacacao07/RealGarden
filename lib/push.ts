/**
 * Web Push (spec 7.4). Subscriptions are stored per garden; payload = alert headline + first task + link.
 * Needs NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT; without them pushes are skipped and the
 * in-app banner still works. Expired subscriptions (404/410) are removed.
 */
import { prisma } from "./db";

export const pushConfigured = () => !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY;

export async function sendPush(gardenId: string, payload: { title: string; body: string; url: string; tag?: string }): Promise<number> {
  if (!pushConfigured()) return 0;
  const webpush = (await import("web-push")).default;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:demo@example.com", process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  const subs = await prisma.pushSubscription.findMany({ where: { garden_id: gardenId } });
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 6 * 3600 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => undefined);
      else console.warn("[push] failed", code, (e as Error).message);
    }
  }));
  return sent;
}
