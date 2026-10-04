import { useState } from "react";
import { supabase } from "../lib/supabase";

// Email and password, so signing in happens inside the app. Magic links would open
// in Safari instead of the Home Screen app, and email codes need a custom email
// template that Supabase's free email service doesn't allow.
export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    setNotice(null);
    const credentials = { email: email.trim(), password };
    if (creating) {
      const { data, error } = await supabase.auth.signUp({ ...credentials, options: { emailRedirectTo: location.origin + location.pathname } });
      if (error) setError(error.message);
      else if (!data.session) {
        // Email confirmation is on: one tap on the link in the email, then sign in here.
        setNotice(`Almost there. Open the email we sent to ${credentials.email}, tap the link once, then come back and sign in.`);
        setCreating(false);
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword(credentials);
      if (error) setError(error.message === "Email not confirmed" ? "Tap the link in the email we sent you first, then sign in." : error.message);
    }
    setBusy(false);
  }

  return (
    <div className="page login">
      <h1>Brain Dump</h1>
      <p className="muted">Get it out of your head. I'll keep track and nudge you.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input type="email" required autoComplete="email" placeholder="Your email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input
          type="password"
          required
          minLength={6}
          autoComplete={creating ? "new-password" : "current-password"}
          placeholder={creating ? "Choose a password (6+ characters)" : "Password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button className="primary" disabled={busy}>
          {creating ? "Create my account" : "Sign in"}
        </button>
        <button type="button" className="link" onClick={() => setCreating(!creating)}>
          {creating ? "I already have an account" : "First time? Create an account"}
        </button>
      </form>
      {notice && <p>{notice}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
