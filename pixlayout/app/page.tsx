'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  const [username, setUsername]       = useState('');
  const [inputVal, setInputVal]       = useState('');
  const [mounted, setMounted]         = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const [shake, setShake]             = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ── On mount: check localStorage ─────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem('pixnarr_username');
    if (saved) setUsername(saved);
    setMounted(true);
  }, []);

  // ── Save and proceed ──────────────────────────────────────────────────────
  const handleProceed = () => {
    const name = (username || inputVal).trim();
    if (!name) {
      setShake(true);
      setTimeout(() => setShake(false), 500);
      inputRef.current?.focus();
      return;
    }
    localStorage.setItem('pixnarr_username', name);
    setUsername(name);
    router.push('/create');        // adjust to your actual create-video route
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleProceed();
  };

  const handleChangeUser = () => {
    setUsername('');
    setInputVal('');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  if (!mounted) return null;   // avoid hydration flash

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --bg:       #07080a;
          --surface:  #0e1014;
          --border:   rgba(255,255,255,0.07);
          --accent:   #00e5a0;
          --accent2:  #00b4ff;
          --muted:    rgba(255,255,255,0.35);
          --text:     #f0f2f5;
        }

        html, body { height: 100%; background: var(--bg); }

        /* ── Grain overlay ── */
        .grain::after {
          content: '';
          position: fixed; inset: 0;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.04'/%3E%3C/svg%3E");
          pointer-events: none; z-index: 100;
          opacity: 0.5;
        }

        /* ── Grid bg ── */
        .grid-bg {
          position: fixed; inset: 0; z-index: 0;
          background-image:
            linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
          background-size: 60px 60px;
          mask-image: radial-gradient(ellipse 80% 80% at 50% 50%, black 30%, transparent 100%);
        }

        /* ── Glow orbs ── */
        .orb {
          position: fixed; border-radius: 50%;
          filter: blur(120px); pointer-events: none; z-index: 0;
        }
        .orb-1 {
          width: 600px; height: 600px;
          background: radial-gradient(circle, rgba(0,229,160,0.12) 0%, transparent 70%);
          top: -200px; left: -150px;
          animation: drift1 12s ease-in-out infinite alternate;
        }
        .orb-2 {
          width: 500px; height: 500px;
          background: radial-gradient(circle, rgba(0,180,255,0.10) 0%, transparent 70%);
          bottom: -150px; right: -100px;
          animation: drift2 15s ease-in-out infinite alternate;
        }
        @keyframes drift1 { from { transform: translate(0,0); } to { transform: translate(60px, 40px); } }
        @keyframes drift2 { from { transform: translate(0,0); } to { transform: translate(-40px, -60px); } }

        /* ── Wrapper ── */
        .wrapper {
          position: relative; z-index: 1;
          min-height: 100dvh;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          padding: 2rem;
          font-family: 'DM Sans', sans-serif;
          color: var(--text);
        }

        /* ── Card ── */
        .card {
          width: 100%; max-width: 460px;
          background: var(--surface);
          border: 1px solid var(--border);
          border-radius: 24px;
          padding: 3rem 2.5rem;
          backdrop-filter: blur(20px);
          box-shadow:
            0 0 0 1px rgba(255,255,255,0.04) inset,
            0 40px 80px rgba(0,0,0,0.6);
          animation: slideUp 0.5s cubic-bezier(0.22,1,0.36,1) both;
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* ── Logo / wordmark ── */
        .logo {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 2.8rem;
          letter-spacing: 0.06em;
          line-height: 1;
          background: linear-gradient(135deg, var(--accent) 0%, var(--accent2) 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          margin-bottom: 0.4rem;
        }
        .tagline {
          font-size: 0.82rem;
          color: var(--muted);
          font-weight: 300;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-bottom: 2.8rem;
        }

        /* ── Divider ── */
        .divider {
          width: 40px; height: 1px;
          background: linear-gradient(90deg, var(--accent), var(--accent2));
          margin-bottom: 2.8rem;
          border-radius: 1px;
        }

        /* ── Greeting (returning user) ── */
        .greeting {
          animation: fadeIn 0.4s ease both;
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

        .greeting-label {
          font-size: 0.75rem;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-bottom: 0.5rem;
        }
        .greeting-name {
          font-family: 'Bebas Neue', sans-serif;
          font-size: 2rem;
          letter-spacing: 0.04em;
          color: var(--text);
          margin-bottom: 0.25rem;
        }
        .greeting-sub {
          font-size: 0.82rem;
          color: var(--muted);
          margin-bottom: 2.2rem;
        }

        /* ── Input ── */
        .input-label {
          font-size: 0.75rem;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.1em;
          margin-bottom: 0.6rem;
          display: block;
        }
        .input-wrap {
          position: relative;
          margin-bottom: 1.4rem;
        }
        .input-wrap input {
          width: 100%;
          background: rgba(255,255,255,0.04);
          border: 1px solid var(--border);
          border-radius: 12px;
          padding: 0.85rem 1.1rem;
          font-family: 'DM Sans', sans-serif;
          font-size: 1rem;
          color: var(--text);
          outline: none;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .input-wrap input::placeholder { color: rgba(255,255,255,0.18); }
        .input-wrap input:focus {
          border-color: rgba(0,229,160,0.5);
          box-shadow: 0 0 0 3px rgba(0,229,160,0.08);
        }
        .input-wrap.shake { animation: shake 0.4s ease; }
        @keyframes shake {
          0%,100% { transform: translateX(0); }
          20%      { transform: translateX(-6px); }
          40%      { transform: translateX(6px); }
          60%      { transform: translateX(-4px); }
          80%      { transform: translateX(4px); }
        }

        /* ── Buttons ── */
        .btn-primary {
          width: 100%;
          padding: 0.9rem 1.5rem;
          border-radius: 12px;
          border: none;
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          font-size: 0.95rem;
          font-weight: 500;
          letter-spacing: 0.03em;
          background: linear-gradient(135deg, var(--accent) 0%, var(--accent2) 100%);
          color: #07080a;
          transition: opacity 0.2s, transform 0.15s;
          position: relative;
          overflow: hidden;
        }
        .btn-primary::after {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(135deg, rgba(255,255,255,0.15) 0%, transparent 60%);
        }
        .btn-primary:hover  { opacity: 0.9; transform: translateY(-1px); }
        .btn-primary:active { transform: translateY(0); }

        .btn-ghost {
          background: none; border: none;
          color: var(--muted);
          font-family: 'DM Sans', sans-serif;
          font-size: 0.8rem;
          cursor: pointer;
          padding: 0.5rem 0;
          margin-top: 1rem;
          text-decoration: underline;
          text-underline-offset: 3px;
          transition: color 0.2s;
        }
        .btn-ghost:hover { color: var(--text); }

        /* ── Footer ── */
        .footer {
          margin-top: 2rem;
          font-size: 0.72rem;
          color: rgba(255,255,255,0.18);
          text-align: center;
          letter-spacing: 0.05em;
        }
      `}</style>

      <div className="grain">
        <div className="grid-bg" />
        <div className="orb orb-1" />
        <div className="orb orb-2" />

        <div className="wrapper">
          <div className="card">

            <div className="logo">Pixnarr</div>
            <div className="tagline">AI Video Studio</div>
            <div className="divider" />

            {/* ── Returning user ── */}
            {username ? (
              <div className="greeting">
                <p className="greeting-label">Welcome back</p>
                <p className="greeting-name">{username}</p>
                <p className="greeting-sub">Ready to create your next video?</p>

                <button className="btn-primary" onClick={handleProceed}>
                  Continue to Studio →
                </button>

                <div style={{ textAlign: 'center' }}>
                  <button className="btn-ghost" onClick={handleChangeUser}>
                    Not you? Change username
                  </button>
                </div>
              </div>
            ) : (
              /* ── New user ── */
              <div className="greeting">
                <p className="greeting-label">Get started</p>
                <p className="greeting-name" style={{ marginBottom: '0.5rem' }}>
                  What should we call you?
                </p>
                <p className="greeting-sub">
                  Your name is saved locally — no account needed.
                </p>

                <label className="input-label" htmlFor="username-input">
                  Your name
                </label>
                <div className={`input-wrap${shake ? ' shake' : ''}`}>
                  <input
                    id="username-input"
                    ref={inputRef}
                    type="text"
                    placeholder="e.g. Kofi, Amara, David…"
                    value={inputVal}
                    onChange={e => setInputVal(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onFocus={() => setInputFocused(true)}
                    onBlur={() => setInputFocused(false)}
                    autoFocus
                    maxLength={32}
                    autoComplete="off"
                  />
                </div>

                <button className="btn-primary" onClick={handleProceed}>
                  Enter Studio →
                </button>
              </div>
            )}
          </div>

          <p className="footer">Pixnarr · AI-powered video creation</p>
        </div>
      </div>
    </>
  );
}