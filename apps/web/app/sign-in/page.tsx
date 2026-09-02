"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const supabase = createClient();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMessage(error.message);
    else window.location.href = "/";
  }

  async function google() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` }
    });
    if (error) setMessage(error.message);
  }

  return (
    <main className="auth">
      <section className="auth-card">
        <div className="brand">
          <Image src="/orbit-logo.png" alt="" width={32} height={32} />
          <span>Orbit</span>
        </div>
        <h1>Welcome back</h1>
        <p>One place for three leading models.</p>

        <button className="button google" type="button" onClick={google}>
          Continue with Google
        </button>
        <div className="divider">or</div>

        <form onSubmit={submit}>
          <label className="field">
            <span>Email</span>
            <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="field">
            <span>Password</span>
            <input type="password" autoComplete="current-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <button className="button primary" type="submit">Sign in</button>
        </form>

        <p className="auth-switch">
          New to Orbit? <Link href="/sign-up">Create an account</Link>
        </p>
        {message && <div className="notice is-error" role="alert">{message}</div>}
      </section>
    </main>
  );
}
