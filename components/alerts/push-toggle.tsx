"use client";

/**
 * "Turn on alerts": registers the service worker and stores a Web Push subscription for this garden. Opt-in.
 * iPhone: push only works after "Add to Home Screen", so we show that hint.
 */
import { useEffect, useState } from "react";
import { Bell, BellOff, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function b64ToBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

type State = "unknown" | "unsupported" | "off" | "on" | "busy" | "denied";

export function PushToggle({ gardenId }: { gardenId: string }) {
  const [state, setState] = useState<State>("unknown");
  const [ios, setIos] = useState(false);

  useEffect(() => {
    let live = true;
    const set = (s: State, i = false) => { if (live) { setState(s); setIos(i); } };
    (async () => {
      const iosNoStandalone = /iPhone|iPad/.test(navigator.userAgent) && !window.matchMedia("(display-mode: standalone)").matches;
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !KEY) return set("unsupported", iosNoStandalone);
      if (Notification.permission === "denied") return set("denied", iosNoStandalone);
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      set(sub ? "on" : "off", iosNoStandalone);
    })().catch(() => set("unsupported"));
    return () => { live = false; };
  }, []);

  async function on() {
    setState("busy");
    try {
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      if ((await Notification.requestPermission()) !== "granted") { setState("denied"); return; }
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(KEY!) });
      const r = await fetch("/api/push/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ garden_id: gardenId, subscription: sub.toJSON() }) });
      setState(r.ok ? "on" : "off");
    } catch {
      setState("off");
    }
  }
  async function off() {
    setState("busy");
    const reg = await navigator.serviceWorker.getRegistration("/sw.js");
    const sub = await reg?.pushManager.getSubscription();
    if (sub) {
      await fetch("/api/push/subscribe", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) });
      await sub.unsubscribe();
    }
    setState("off");
  }

  return (
    <div className="space-y-1">
      {state === "on" ? (
        <Button variant="outline" onClick={off}><BellOff aria-hidden /> Turn off phone alerts</Button>
      ) : (
        <Button onClick={on} disabled={state !== "off"}>
          {state === "busy" ? <Loader2 className="animate-spin" aria-hidden /> : <Bell aria-hidden />} Turn on alerts
        </Button>
      )}
      {state === "unsupported" && (
        <p className="text-xs text-muted-foreground">
          {ios ? "On iPhone, tap Share, then Add to Home Screen, and open the app from there to turn on alerts."
            : KEY ? "This browser can't receive push notifications. Alerts still show at the top of every page."
              : "Phone alerts aren't set up on this server yet. Alerts still show at the top of every page."}
        </p>
      )}
      {state === "denied" && <p className="text-xs text-muted-foreground">Notifications are blocked for this site in your browser settings.</p>}
      {state === "off" && ios && <p className="text-xs text-muted-foreground">On iPhone, push only works after Add to Home Screen.</p>}
    </div>
  );
}
