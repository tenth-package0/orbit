"use client";

import Image from "next/image";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SignUpPage() {
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [message, setMessage] = useState("");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const { error } = await createClient().auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/auth/callback` } });
    setMessage(error?.message ?? "Check your email to verify your account.");
  }
  return <main className="auth"><section className="auth-card">
    <div className="brand"><Image src="/orbit-logo.png" alt="Orbit" width={34} height={34} /><span>Orbit</span></div>
    <h1>Create your account</h1><p>Compare leading models without changing tools.</p>
    <form onSubmit={submit}><input type="email" placeholder="Email" required value={email} onChange={(e) => setEmail(e.target.value)} /><input type="password" placeholder="Password (8+ characters)" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} /><button className="primary">Create account</button></form>
    <p>Already have an account? <a href="/sign-in">Sign in</a></p>{message && <div className="error">{message}</div>}
  </section></main>;
}

