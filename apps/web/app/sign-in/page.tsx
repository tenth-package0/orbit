"use client";

import Image from "next/image";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const supabase = createClient();

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setMessage(error.message); else window.location.href = "/";
  }

  async function google() {
    const { error } = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/auth/callback` } });
    if (error) setMessage(error.message);
  }

  return <main className="auth"><section className="auth-card">
    <div className="brand"><Image src="/orbit-logo.png" alt="Orbit" width={34} height={34} /><span>Orbit</span></div>
    <h1>Welcome back</h1><p>One place for three leading AI models.</p>
    <button className="google" onClick={google}>Continue with Google</button>
    <div className="divider">or</div>
    <form onSubmit={submit}>
      <input type="email" placeholder="Email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <input type="password" placeholder="Password" autoComplete="current-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
      <button className="primary" type="submit">Sign in</button>
    </form>
    <p>New to Orbit? <a href="/sign-up">Create an account</a></p>
    {message && <div className="error">{message}</div>}
  </section></main>;
}

