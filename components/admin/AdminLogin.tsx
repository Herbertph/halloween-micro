"use client";

import { useState } from "react";

/** Password form for /admin. The API returns 401/429, the page stays aggregate-only. */
export function AdminLogin() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (response.ok) {
        window.location.reload();
        return;
      }
      setError(
        response.status === 429
          ? "Too many attempts. Wait a minute and try again."
          : "That password is not right.",
      );
    } catch {
      setError("We couldn't reach the server. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mx-auto max-w-md rounded-3xl border border-white/10 bg-night/70 p-6 sm:p-8"
    >
      <h1 className="font-display text-3xl">Admin</h1>
      <p className="mt-2 text-sm text-bone/70">
        Today&apos;s numbers only. No customer data is shown.
      </p>
      {error ? (
        <p role="alert" className="mt-4 rounded-xl bg-ember/10 px-3 py-2 text-sm text-pumpkin">
          {error}
        </p>
      ) : null}
      <label htmlFor="admin-password" className="mt-6 block text-sm text-bone/80">
        Password
      </label>
      <input
        id="admin-password"
        name="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        className="mt-2 w-full rounded-xl border border-white/20 bg-ink px-3 py-2 text-bone"
        required
      />
      <button type="submit" className="btn-primary mt-5 w-full" disabled={pending}>
        {pending ? "Checking…" : "Sign in"}
      </button>
    </form>
  );
}
