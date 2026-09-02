"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SignUpPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { error } = await createClient().auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` }
    });
    setFailed(Boolean(error));
    setMessage(error?.message ?? "Check your email to verify your account.");
  }

  return (
    <main className="auth">
      <section className="auth-card">
        <div className="brand">
          <Image src="/orbit-logo.png" alt="" width={32} height={32} />
          <span>Orbit</span>
        </div>
        <h1>Create your account</h1>
        <p>Compare leading models without changing tools.</p>

        <form onSubmit={submit}>
          <label className="field">
            <span>Email</span>
            <input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="field">
            <span>Password</span>
            <input type="password" autoComplete="new-password" placeholder="8 or more characters" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <button className="button primary" type="submit">Create account</button>
        </form>

        <p className="auth-switch">
          Already have an account? <Link href="/sign-in">Sign in</Link>
        </p>
        {message && <div className={`notice ${failed ? "is-error" : ""}`} role="status">{message}</div>}
      </section>
    </main>
  );
}
