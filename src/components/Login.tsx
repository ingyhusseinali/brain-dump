import { useState } from "react";
import { supabase } from "../lib/supabase";

// Email code rather than a magic link: on iPhone, links open in Safari instead
// of the Home Screen app, so the app itself would never get signed in.
export function Login() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim() });
    setBusy(false);
    if (error) setError(error.message);
    else setSent(true);
  }

  async function verify() {
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    setBusy(false);
    if (error) setError(error.message);
  }

  return (
    <div className="page login">
      <h1>Brain Dump</h1>
      <p className="muted">Get it out of your head. I'll keep track and nudge you.</p>
      {!sent ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void sendCode();
          }}
        >
          <input type="email" required autoComplete="email" placeholder="Your email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="primary" disabled={busy}>
            Email me a sign-in code
          </button>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
        >
          <p>Enter the code we sent to {email}.</p>
          <input inputMode="numeric" autoComplete="one-time-code" placeholder="Code" value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="primary" disabled={busy || code.trim().length < 6}>
            Sign in
          </button>
          <button type="button" className="link" onClick={() => setSent(false)}>
            Use a different email
          </button>
        </form>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
