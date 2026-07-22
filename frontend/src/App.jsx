import { useState, useEffect, useRef, cloneElement } from 'react';
import { Home, Map, Plus, Bell, User, Camera, MapPin, Clock, ArrowLeft, Sparkles, Tag, Check, Trash2, LogOut, Locate } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

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

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:5000';
const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const WASHU_CENTER = [38.6488, -90.3108];

async function api(path, opts = {}) {
  const isFormData = opts.body instanceof FormData;
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      ...(opts.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...(opts.headers || {}),
    },
    ...opts,
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.status === 204 ? null : res.json();
}

function formatMinutes(m) {
  if (m < 60) return `${m}m left`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem ? `${h}h ${rem}m left` : `${h}h left`;
}

function relativeTime(iso) {
  if (!iso) return '';
  const then = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z');
  const diffSec = Math.max(0, Math.floor((Date.now() - then.getTime()) / 1000));
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d ago`;
}

function PostCard({ post }) {
  const urgent = post.minutesLeft <= 30;
  return (
    <div className="rounded-2xl border overflow-hidden" style={{ background: colors.card, borderColor: colors.mist }}>
      {post.imageUrl && (
        <img
          src={post.imageUrl}
          alt=""
          loading="lazy"
          className="w-full h-32 object-cover"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      )}
      <div className="p-4">
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

function ProfileScreen({ me, setMe, setError }) {
  const btnRef = useRef(null);

  useEffect(() => {
    if (me) return;
    let cancelled = false;

    async function handleCredential(response) {
      try {
        const user = await api('/api/auth/google', {
          method: 'POST',
          body: JSON.stringify({ id_token: response.credential }),
        });
        if (!cancelled) setMe(user);
      } catch (err) {
        if (!cancelled) setError(`sign-in failed: ${err.message}`);
      }
    }

    function render() {
      if (cancelled) return;
      if (!window.google?.accounts?.id) {
        setTimeout(render, 100);
        return;
      }
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: handleCredential,
      });
      if (btnRef.current) {
        btnRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(btnRef.current, {
          theme: 'outline',
          size: 'large',
          width: 280,
        });
      }
    }
    render();
    return () => { cancelled = true; };
  }, [me, setMe, setError]);

  async function signOut() {
    try {
      await api('/api/auth/logout', { method: 'POST' });
      setMe(null);
    } catch (err) {
      setError(`sign-out failed: ${err.message}`);
    }
  }

  if (!me) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: colors.cloverSoft }}>
          <User size={26} color={colors.clover} />
        </div>
        <h2 className="ff-display text-base font-semibold mb-1" style={{ color: colors.ink }}>Sign in to FoodFeed</h2>
        <p className="text-sm mb-6" style={{ color: colors.inkSoft }}>Use your .edu Google account to post sightings and set up alerts.</p>
        <div ref={btnRef} />
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto px-6 py-6">
      <div className="rounded-2xl border p-5" style={{ background: colors.card, borderColor: colors.mist }}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: colors.marigoldSoft }}>
            <User size={22} color={colors.marigoldDark} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="ff-display font-semibold truncate" style={{ color: colors.ink }}>{me.name || 'Signed in'}</div>
            <div className="text-sm truncate" style={{ color: colors.inkSoft }}>{me.email}</div>
          </div>
        </div>
        <div className="text-xs mt-3" style={{ color: colors.inkSoft }}>
          Signed in as {me.email}
        </div>
      </div>
      <button
        onClick={signOut}
        className="mt-6 w-full rounded-xl py-3 font-semibold ff-body text-sm flex items-center justify-center gap-2 border"
        style={{ background: '#fff', color: colors.ink, borderColor: colors.mist }}
      >
        <LogOut size={16} />
        Sign out
      </button>
    </main>
  );
}

function MapScreen({ setError }) {
  const [mapPosts, setMapPosts] = useState([]);

  useEffect(() => {
    api('/api/posts/map')
      .then(setMapPosts)
      .catch((err) => setError(`map failed: ${err.message}`));
  }, [setError]);

  return (
    <main className="flex-1 relative">
      <MapContainer center={WASHU_CENTER} zoom={15} style={{ height: '100%', width: '100%' }}>
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap"
        />
        {mapPosts.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]}>
            <Popup>
              <div style={{ fontFamily: 'Inter, sans-serif' }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{p.title}</div>
                <div style={{ fontSize: 12, color: colors.inkSoft }}>{p.location}</div>
                <div style={{ fontSize: 12, color: colors.clover, marginTop: 4 }}>{formatMinutes(p.minutesLeft)}</div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </main>
  );
}

function AlertsScreen({ me, setScreen, setError }) {
  const [subs, setSubs] = useState([]);
  const [notifs, setNotifs] = useState([]);
  const [radius, setRadius] = useState('0.5');
  const [keyword, setKeyword] = useState('');
  const [coords, setCoords] = useState(null);
  const [usingFallback, setUsingFallback] = useState(false);
  const [locating, setLocating] = useState(false);

  async function reload() {
    try {
      const [s, n] = await Promise.all([
        api('/api/subscriptions'),
        api('/api/notifications'),
      ]);
      setSubs(s);
      setNotifs(n);
    } catch (err) {
      setError(`alerts failed: ${err.message}`);
    }
  }

  useEffect(() => {
    if (!me) return;
    reload();
  }, [me]);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setCoords({ lat: WASHU_CENTER[0], lng: WASHU_CENTER[1] });
      setUsingFallback(true);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setUsingFallback(false);
        setLocating(false);
      },
      (err) => {
        console.warn('geolocation failed', { code: err.code, message: err.message });
        setCoords({ lat: WASHU_CENTER[0], lng: WASHU_CENTER[1] });
        setUsingFallback(true);
        setLocating(false);
      },
      { timeout: 10000, maximumAge: 60000 }
    );
  }

  async function submit() {
    if (!me) {
      setScreen('profile');
      return;
    }
    if (!coords) return;
    const radiusF = Number(radius);
    if (!(radiusF > 0)) return;
    try {
      await api('/api/subscriptions', {
        method: 'POST',
        body: JSON.stringify({
          lat: coords.lat,
          lng: coords.lng,
          radius_miles: radiusF,
          keyword: keyword.trim() || null,
        }),
      });
      setKeyword('');
      reload();
    } catch (err) {
      setError(`add alert failed: ${err.message}`);
    }
  }

  async function removeSub(id) {
    try {
      await api(`/api/subscriptions/${id}`, { method: 'DELETE' });
      setSubs(subs.filter((s) => s.id !== id));
    } catch (err) {
      setError(`delete failed: ${err.message}`);
    }
  }

  if (!me) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center px-8 text-center">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: colors.cloverSoft }}>
          <Bell size={26} color={colors.clover} />
        </div>
        <h2 className="ff-display text-base font-semibold mb-1" style={{ color: colors.ink }}>Sign in to set alerts</h2>
        <p className="text-sm mb-6" style={{ color: colors.inkSoft }}>Alerts are tied to your account so we can notify you.</p>
        <button
          onClick={() => setScreen('profile')}
          className="rounded-xl py-2 px-5 font-semibold ff-body text-sm"
          style={{ background: colors.marigold, color: '#fff' }}
        >
          Go to profile
        </button>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
      <section className="rounded-2xl border p-4 space-y-3" style={{ background: colors.card, borderColor: colors.mist }}>
        <h2 className="ff-display text-sm font-semibold" style={{ color: colors.ink }}>New alert</h2>
        <Field
          label="Keyword (optional)"
          value={keyword}
          onChange={setKeyword}
          placeholder="e.g. pizza"
          icon={<Tag size={14} />}
        />
        <Field
          label="Radius (miles)"
          value={radius}
          onChange={setRadius}
          placeholder="0.5"
          type="number"
        />
        <div>
          <div className="text-xs font-medium mb-1" style={{ color: colors.inkSoft }}>Location</div>
          <button
            onClick={useMyLocation}
            disabled={locating}
            className="w-full rounded-xl border px-3 py-2 text-sm flex items-center gap-2 disabled:opacity-60"
            style={{ borderColor: colors.mist, background: '#fff', color: colors.ink }}
          >
            <Locate size={14} color={colors.inkSoft} />
            <span>{locating ? 'Locating…' : 'Use my location'}</span>
          </button>
          {coords && (
            <div className="text-xs mt-1" style={{ color: colors.inkSoft }}>
              {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
              {usingFallback && <span> — using WashU as default</span>}
            </div>
          )}
        </div>
        <button
          onClick={submit}
          disabled={!coords || !(Number(radius) > 0)}
          className="w-full rounded-xl py-3 font-semibold ff-body text-sm disabled:opacity-40"
          style={{ background: colors.marigold, color: '#fff' }}
        >
          Save alert
        </button>
      </section>

      <section>
        <h2 className="ff-display text-sm font-semibold mb-2" style={{ color: colors.ink }}>My alerts</h2>
        {subs.length === 0 ? (
          <p className="text-sm" style={{ color: colors.inkSoft }}>No alerts yet.</p>
        ) : (
          <ul className="space-y-2">
            {subs.map((s) => (
              <li key={s.id} className="rounded-xl border p-3 flex items-center justify-between" style={{ background: colors.card, borderColor: colors.mist }}>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: colors.ink }}>
                    {s.keyword ? `"${s.keyword}"` : 'Any food'} within {s.radius_miles} mi
                  </div>
                  <div className="text-xs" style={{ color: colors.inkSoft }}>
                    {s.lat.toFixed(4)}, {s.lng.toFixed(4)}
                  </div>
                </div>
                <button
                  onClick={() => removeSub(s.id)}
                  className="p-2 rounded-full"
                  aria-label="Delete alert"
                  style={{ color: colors.alert }}
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="ff-display text-sm font-semibold mb-2" style={{ color: colors.ink }}>Recent matches</h2>
        {notifs.length === 0 ? (
          <p className="text-sm" style={{ color: colors.inkSoft }}>No matches yet. Post a sighting that matches one of your alerts to see this fire.</p>
        ) : (
          <ul className="space-y-2">
            {notifs.map((n) => (
              <li key={n.id} className="rounded-xl border p-3" style={{ background: colors.card, borderColor: colors.mist }}>
                <div className="text-sm" style={{ color: colors.ink }}>{n.message}</div>
                <div className="text-xs mt-1" style={{ color: colors.inkSoft }}>{relativeTime(n.sent_at)}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
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
  const [me, setMe] = useState(null);
  const fileInput = useRef(null);

  useEffect(() => {
    api('/api/me').then(setMe).catch(() => setMe(null));
  }, []);

  useEffect(() => {
    api('/api/posts')
      .then((data) => setPosts(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const resetForm = () => {
    setForm({ title: '', location: '', minutes: '', tag: '' });
    setScanState('idle');
  };

  const startPost = () => {
    if (!me) {
      setScreen('profile');
      return;
    }
    resetForm();
    setScreen('post');
  };

  const handleCapture = () => {
    if (scanState === 'scanning') return;
    fileInput.current?.click();
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setScanState('scanning');
    const fd = new FormData();
    fd.append('image', file);
    try {
      const r = await api('/api/posts/scan', { method: 'POST', body: fd });
      setForm({
        title: r.title || '',
        location: r.location || '',
        minutes: r.minutes != null ? String(r.minutes) : '',
        tag: r.tag || '',
      });
      setScanState('done');
    } catch (err) {
      setScanState('idle');
      setError(`scan failed — fill in manually (${err.message})`);
    }
  };

  const submitPost = async () => {
    if (!form.title.trim() || !form.location.trim()) return;
    if (!me) {
      setScreen('profile');
      return;
    }
    try {
      const newPost = await api('/api/posts', {
        method: 'POST',
        body: JSON.stringify({
          title: form.title.trim(),
          location: form.location.trim(),
          minutes: Number(form.minutes) || 30,
          tag: form.tag.trim() || null,
        }),
      });
      setPosts([newPost, ...posts]);
      resetForm();
      setScreen('home');
    } catch (err) {
      setError(err.message);
    }
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
        .leaflet-container { font-family: 'Inter', sans-serif; }
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
          <h1 className="ff-display text-lg font-semibold flex-1" style={{ color: colors.ink }}>{titles[screen]}</h1>
          {me && screen !== 'post' && (
            <span className="text-xs truncate max-w-[10rem]" style={{ color: colors.inkSoft }} title={me.email}>
              {me.name || me.email}
            </span>
          )}
        </header>

        {error && (
          <div className="px-4 py-2 text-xs flex items-center justify-between" style={{ background: colors.marigoldSoft, color: colors.marigoldDark }}>
            <span className="truncate">{error}</span>
            <button onClick={() => setError(null)} className="ml-2 font-semibold shrink-0">dismiss</button>
          </div>
        )}

        {screen === 'home' && (
          <main className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {loading && posts.length === 0 && (
              <p className="text-sm text-center" style={{ color: colors.inkSoft }}>Loading…</p>
            )}
            {posts.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </main>
        )}

        {screen === 'post' && (
          <main className="flex-1 overflow-y-auto px-4 py-4">
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              onChange={onFile}
              style={{ display: 'none' }}
            />
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

        {screen === 'map' && <MapScreen setError={setError} />}
        {screen === 'alerts' && <AlertsScreen me={me} setScreen={setScreen} setError={setError} />}
        {screen === 'profile' && <ProfileScreen me={me} setMe={setMe} setError={setError} />}

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
