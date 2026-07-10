import { useState, useEffect, useRef, cloneElement } from 'react';
import { Home, Map, Plus, Bell, User, Camera, MapPin, Clock, ArrowLeft, Sparkles, Tag, Check } from 'lucide-react';

const colors = {
  paper: '#FBFAF7',
  ink: '#1F2A24',
  inkSoft: '#6B756F',
  marigold: '#F4A61A',
  marigoldDark: '#C97F0A',
  marigoldSoft: '#FCEBC7',
  clover: '#2F6B4F',
  cloverSoft: '#E7F0EA',
  alert: '#E2542D',
  mist: '#E7E3D8',
  card: '#FFFFFF',
};

const API_BASE = 'https://ingridalfred-designlinear-5000.codio.io';

function formatMinutes(m) {
  if (m < 60) return `${m}m left`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m left` : `${h}h left`;
}

function PostCard({ post }) {
  const urgent = post.minutesLeft <= 30;
  return (
    <div className="rounded-2xl p-4 border" style={{ background: colors.card, borderColor: colors.mist }}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="ff-display text-base font-semibold leading-snug" style={{ color: colors.ink }}>
          {post.title}
        </h3>
        {urgent && (
          <span
            className="w-2 h-2 rounded-full mt-2 shrink-0 ff-pulse"
            style={{ background: colors.alert }}
            aria-label="Expiring soon"
          />
        )}
      </div>
      <div className="flex items-center gap-1 mt-2 text-sm" style={{ color: colors.inkSoft }}>
        <MapPin size={14} />
        <span>{post.location}</span>
      </div>
      <div className="flex items-center justify-between mt-3">
        <div className="flex items-center gap-1 text-sm font-medium" style={{ color: urgent ? colors.alert : colors.clover }}>
          <Clock size={14} />
          <span>{formatMinutes(post.minutesLeft)}</span>
        </div>
        {post.tag && (
          <span className="text-xs font-medium px-2 py-1 rounded-full" style={{ background: colors.cloverSoft, color: colors.clover }}>
            {post.tag}
          </span>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, icon, autoFilled, type = 'text' }) {
  return (
    <label className="block">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium" style={{ color: colors.inkSoft }}>{label}</span>
        {autoFilled && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: colors.marigoldSoft, color: colors.marigoldDark }}>
            auto-filled
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: colors.mist, background: '#fff' }}>
        {icon && <span style={{ color: colors.inkSoft }}>{icon}</span>}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 outline-none text-sm ff-body bg-transparent focus-visible:outline-none"
          style={{ color: colors.ink }}
        />
      </div>
    </label>
  );
}

function NavButton({ icon, active, onClick, label }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className="p-2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
    >
      {cloneElement(icon, { color: active ? colors.marigold : colors.inkSoft })}
    </button>
  );
}

function Placeholder({ icon, title, subtitle }) {
  return (
    <main className="flex-1 flex flex-col items-center justify-center px-8 text-center">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: colors.cloverSoft }}>
        {cloneElement(icon, { size: 26, color: colors.clover })}
      </div>
      <h2 className="ff-display text-base font-semibold mb-1" style={{ color: colors.ink }}>{title}</h2>
      <p className="text-sm" style={{ color: colors.inkSoft }}>{subtitle}</p>
    </main>
  );
}

export default function FoodFeed() {
  const [screen, setScreen] = useState('home');
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [scanState, setScanState] = useState('idle');
  const [form, setForm] = useState({ title: '', location: '', minutes: '', tag: '' });
  const scanTimeout = useRef(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/posts`)
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return res.json();
      })
      .then((data) => setPosts(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const resetForm = () => {
    setForm({ title: '', location: '', minutes: '', tag: '' });
    setScanState('idle');
  };

  const startPost = () => {
    resetForm();
    setScreen('post');
  };

  const handleCapture = () => {
    if (scanState === 'scanning') return;
    setScanState('scanning');
    clearTimeout(scanTimeout.current);
    scanTimeout.current = setTimeout(() => {
      setForm({ title: 'Free bagels — Hillel morning social', location: 'Umrath Hall lounge', minutes: '40', tag: 'bagels' });
      setScanState('done');
    }, 1400);
  };

  const submitPost = () => {
    if (!form.title.trim() || !form.location.trim()) return;
    fetch(`${API_BASE}/api/posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: form.title.trim(),
        location: form.location.trim(),
        minutes: Number(form.minutes) || 30,
        tag: form.tag.trim() || null,
      }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return res.json();
      })
      .then((newPost) => {
        setPosts([newPost, ...posts]);
        resetForm();
        setScreen('home');
      })
      .catch((err) => setError(err.message));
  };
  const titles = { home: 'FoodFeed', post: 'New sighting', map: 'Map', alerts: 'My alerts', profile: 'Profile' };

  return (
    <div className="h-screen w-full flex justify-center overflow-hidden" style={{ background: colors.mist }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');
        .ff-display { font-family: 'Space Grotesk', sans-serif; }
        .ff-body { font-family: 'Inter', sans-serif; }
        @keyframes ff-scan { 0% { top: 0%; } 50% { top: 92%; } 100% { top: 0%; } }
        .ff-scanline { animation: ff-scan 1.4s ease-in-out infinite; }
        @keyframes ff-pulse-soft { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .ff-pulse { animation: ff-pulse-soft 1.4s ease-in-out infinite; }
      `}</style>

      <div className="ff-body w-full sm:max-w-sm h-screen flex flex-col sm:border-x" style={{ background: colors.paper, borderColor: colors.mist }}>
        <header className="flex items-center gap-3 px-4 py-4 border-b shrink-0" style={{ borderColor: colors.mist }}>
          {screen === 'post' ? (
            <button onClick={() => setScreen('home')} className="p-1 -ml-1 rounded-full active:opacity-60" aria-label="Back">
              <ArrowLeft size={22} color={colors.ink} />
            </button>
          ) : (
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: colors.marigold }}>
              <span className="ff-display text-white text-sm font-bold">FF</span>
            </div>
          )}
          <h1 className="ff-display text-lg font-semibold" style={{ color: colors.ink }}>{titles[screen]}</h1>
        </header>

        {screen === 'home' && (
          <main className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {posts.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </main>
        )}

        {screen === 'post' && (
          <main className="flex-1 overflow-y-auto px-4 py-4">
            <button
              onClick={handleCapture}
              className="w-full rounded-2xl border-2 border-dashed flex flex-col items-center justify-center py-10 relative overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{
                borderColor: scanState === 'done' ? colors.clover : colors.mist,
                background: scanState === 'done' ? colors.cloverSoft : '#fff',
              }}
            >
              {scanState === 'scanning' && (
                <div className="absolute left-0 right-0 h-0.5 ff-scanline" style={{ background: colors.marigold }} />
              )}
              {scanState === 'idle' && (
                <>
                  <Camera size={28} color={colors.inkSoft} />
                  <span className="ff-body text-sm font-medium mt-3" style={{ color: colors.ink }}>Tap to add a flyer photo</span>
                  <span className="ff-body text-xs mt-1" style={{ color: colors.inkSoft }}>We'll read the details for you</span>
                </>
              )}
              {scanState === 'scanning' && (
                <>
                  <Sparkles size={28} color={colors.marigold} />
                  <span className="ff-body text-sm font-medium mt-3" style={{ color: colors.ink }}>Scanning flyer…</span>
                </>
              )}
              {scanState === 'done' && (
                <>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: colors.clover }}>
                    <Check size={20} color="#fff" />
                  </div>
                  <span className="ff-body text-sm font-medium mt-3" style={{ color: colors.clover }}>Flyer scanned</span>
                  <span
                    className="ff-body text-xs mt-1 underline"
                    style={{ color: colors.inkSoft }}
                    onClick={(e) => { e.stopPropagation(); resetForm(); }}
                  >
                    Retake
                  </span>
                </>
              )}
            </button>

            <div className="mt-6 space-y-4">
              <Field label="Title" value={form.title} onChange={(v) => setForm({ ...form, title: v })} placeholder="e.g. Free pizza — club mixer" autoFilled={scanState === 'done'} />
              <Field label="Location" value={form.location} onChange={(v) => setForm({ ...form, location: v })} placeholder="e.g. Simon Hall lobby" icon={<MapPin size={14} />} autoFilled={scanState === 'done'} />
              <Field label="Expires in (minutes)" value={form.minutes} onChange={(v) => setForm({ ...form, minutes: v })} placeholder="e.g. 30" icon={<Clock size={14} />} autoFilled={scanState === 'done'} type="number" />
              <Field label="Tag (optional)" value={form.tag} onChange={(v) => setForm({ ...form, tag: v })} placeholder="e.g. pizza, halal, vegan" icon={<Tag size={14} />} />
            </div>

            <button
              onClick={submitPost}
              disabled={!form.title.trim() || !form.location.trim()}
              className="w-full rounded-xl py-3 mt-6 font-semibold ff-body text-sm disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{ background: colors.marigold, color: '#fff' }}
            >
              Post sighting
            </button>
          </main>
        )}

        {screen === 'map' && (
          <Placeholder icon={<Map />} title="Map view" subtitle="Pins for every active sighting near you — coming soon." />
        )}
        {screen === 'alerts' && (
          <Placeholder icon={<Bell />} title="No alerts yet" subtitle="Set a radius and keyword and we'll email you the moment a match goes up." />
        )}
        {screen === 'profile' && (
          <Placeholder icon={<User />} title="Your profile" subtitle="Manage your .edu account and sign-out from here." />
        )}

        {screen !== 'post' && (
          <nav className="flex items-center justify-between px-6 py-2 border-t shrink-0" style={{ borderColor: colors.mist }}>
            <NavButton icon={<Home size={20} />} active={screen === 'home'} onClick={() => setScreen('home')} label="Home" />
            <NavButton icon={<Map size={20} />} active={screen === 'map'} onClick={() => setScreen('map')} label="Map" />
            <button
              onClick={startPost}
              className="w-12 h-12 rounded-full flex items-center justify-center -mt-6 shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{ background: colors.marigold }}
              aria-label="Post a sighting"
            >
              <Plus size={22} color="#fff" />
            </button>
            <NavButton icon={<Bell size={20} />} active={screen === 'alerts'} onClick={() => setScreen('alerts')} label="Alerts" />
            <NavButton icon={<User size={20} />} active={screen === 'profile'} onClick={() => setScreen('profile')} label="Profile" />
          </nav>
        )}
      </div>
    </div>
  );
}