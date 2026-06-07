'use client';

import { useEffect, useState } from 'react';

export default function UserAvatar() {
  const [username, setUsername] = useState('Guest');

  useEffect(() => {
    const saved = localStorage.getItem('pixnarr_username');
    setUsername(saved?.trim() || 'Guest');
  }, []);

  // Initials: up to 2 chars from the name (e.g. "John Doe" → "JD", "Kofi" → "KO")
  const initials = username
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('') || 'G';

  return (
    <>
      <div className="w-7 h-7 bg-emerald-400 rounded-2xl flex items-center justify-center text-xs font-bold">
        {initials}
      </div>
      <span className="text-sm hidden sm:inline">{username}</span>
    </>
  );
}