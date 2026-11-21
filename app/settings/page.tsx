import type { Metadata } from "next";

import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <h1 className="text-3xl font-semibold">Settings</h1>
      <SettingsForm />
    </div>
  );
}
