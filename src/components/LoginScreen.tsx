"use client";

import { FormEvent, useMemo, useState } from "react";
import { isAllowedEmail } from "@/lib/auth";
import { supabase } from "@/lib/supabaseClient";

type LoginScreenProps = {
  onSuccess: () => void;
};

export function LoginScreen({ onSuccess }: LoginScreenProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const title = useMemo(
    () => (mode === "signin" ? "Welcome back" : "Create your diary account"),
    [mode],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!isAllowedEmail(email)) {
      setError("This diary is private. Only the two invited emails can sign in.");
      return;
    }

    try {
      setLoading(true);

      if (mode === "signin") {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
      } else {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) throw signUpError;
      }

      onSuccess();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unable to authenticate right now.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card max-w-md w-full p-6 md:p-8">
      <p className="text-sm text-rose-500 mb-2">Our private timeline</p>
      <h1 className="text-2xl font-semibold text-zinc-800">{title}</h1>
      <p className="text-sm text-zinc-500 mt-2">
        A cozy little space for memories, moments, and tiny love notes.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <label className="block text-sm text-zinc-700">
          Email
          <input
            type="email"
            required
            className="input mt-1"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
          />
        </label>

        <label className="block text-sm text-zinc-700">
          Password
          <input
            type="password"
            required
            minLength={8}
            className="input mt-1"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 8 characters"
          />
        </label>

        {error ? <p className="text-sm text-rose-600">{error}</p> : null}

        <button type="submit" className="btn btn-primary w-full" disabled={loading}>
          {loading ? "Please wait..." : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      <button
        type="button"
        className="text-sm text-zinc-500 hover:text-zinc-700 mt-5"
        onClick={() => setMode((current) => (current === "signin" ? "signup" : "signin"))}
      >
        {mode === "signin"
          ? "First time here? Create your account"
          : "Already have an account? Sign in"}
      </button>
    </div>
  );
}
