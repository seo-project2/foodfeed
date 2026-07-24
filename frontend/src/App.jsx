import { useState, useEffect, useRef, useMemo, cloneElement, Component } from 'react';
import { createPortal } from 'react-dom';
import { Home, Map, Plus, Bell, User, Camera, MapPin, Clock, ArrowLeft, Sparkles, Tag, Check, Trash2, LogOut, Locate, Search, X, Heart, Bookmark, Users, Navigation } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import { useLocation, useNavigate } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
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

const FRIENDLY_ERROR = {
  400: 'That didn’t look right. Check the fields and try again.',
  401: 'Please sign in to continue.',
  403: 'You need a .edu Google account for that.',
  404: 'Not found.',
  409: 'That already exists.',
  413: 'File too large — 5 MB max.',
  429: 'Too many requests. Give it a moment.',
  500: 'Something broke on our end. Try again in a moment.',
  502: 'Upstream service is unhappy right now.',
  503: 'Service is briefly unavailable.',
};

class ApiError extends Error {
  constructor(status, friendly, raw) {
    super(friendly || `Error ${status}`);
    this.status = status;
    this.friendly = friendly;
    this.raw = raw;
  }
}

async function api(path, opts = {}) {
  const isFormData = opts.body instanceof FormData;
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      headers: {
        ...(opts.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.headers || {}),
      },
      ...opts,
    });
  } catch {
    throw new ApiError(0, 'Can’t reach the server. Check your connection.');
  }
  if (!res.ok) {
    let raw = null;
    try { raw = await res.json(); } catch {}
    const friendly = (raw && raw.error) || FRIENDLY_ERROR[res.status] || `Something went wrong (${res.status}).`;
    throw new ApiError(res.status, friendly, raw);
  }
  return res.status === 204 ? null : res.json();
}

function assetUrl(path) {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE}${path}`;
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

const CANONICAL_TAGS = ['pizza', 'bagels', 'chicken', 'donuts', 'sushi', 'salad', 'pastries', 'tacos'];

function FilterBar({ q, setQ, tag, setTag }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: colors.mist, background: '#fff' }}>
        <Search size={14} color={colors.inkSoft} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search sightings…"
          className="flex-1 outline-none text-sm ff-body bg-transparent focus-visible:outline-none"
          style={{ color: colors.ink }}
          aria-label="Search"
        />
        {q && (
          <button onClick={() => setQ('')} aria-label="Clear search" style={{ color: colors.inkSoft }}>
            <X size={14} />
          </button>
        )}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
        {CANONICAL_TAGS.map((t) => {
          const active = tag === t;
          return (
            <button
              key={t}
              onClick={() => setTag(active ? '' : t)}
              className="text-xs font-medium px-3 py-1 rounded-full whitespace-nowrap border transition"
              style={{
                background: active ? colors.marigold : '#fff',
                color: active ? '#fff' : colors.ink,
                borderColor: active ? colors.marigold : colors.mist,
              }}
            >
              {t}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function EmptyState({ icon, title, body, action }) {
  return (
    <div className="text-center py-12 px-6">
      {icon && (
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: colors.marigoldSoft }}
        >
          {icon}
        </div>
      )}
      <h3 className="ff-display text-base font-semibold mb-1" style={{ color: colors.ink }}>{title}</h3>
      {body && <p className="text-sm mb-4" style={{ color: colors.inkSoft }}>{body}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="rounded-xl py-2 px-5 font-semibold ff-body text-sm"
          style={{ background: colors.marigold, color: '#fff' }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

function PostCard({ post, saved, onSaveToggle, onOpen }) {
  const urgent = post.minutesLeft <= 15;
  const soon = !urgent && post.minutesLeft <= 60;
  const timeColor = urgent ? colors.alert : soon ? colors.marigoldDark : colors.clover;
  const handleKey = (e) => {
    if (!onOpen) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen(post);
    }
  };
  return (
    <div
      id={`post-${post.id}`}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen ? () => onOpen(post) : undefined}
      onKeyDown={onOpen ? handleKey : undefined}
      className="rounded-2xl border overflow-hidden transition-shadow text-left w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
      style={{
        background: colors.card,
        borderColor: colors.mist,
        cursor: onOpen ? 'pointer' : 'default',
      }}
    >
      {post.imageUrl && (
        <img
          src={assetUrl(post.imageUrl)}
          alt=""
          loading="lazy"
          className="w-full h-32 object-cover"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
      )}
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="ff-display text-base font-semibold leading-snug" style={{ color: colors.ink }}>
              {post.title}
            </h3>
            {post.organization && (
              <div className="flex items-center gap-1 mt-1 text-xs font-medium" style={{ color: colors.marigoldDark }}>
                <Users size={12} />
                <span className="truncate">{post.organization}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {urgent && (
              <span
                className="w-2 h-2 rounded-full mt-2 ff-pulse"
                style={{ background: colors.alert }}
                aria-label="Expiring soon"
              />
            )}
            {onSaveToggle && (
              <button
                onClick={(e) => { e.stopPropagation(); onSaveToggle(post); }}
                className="p-1 rounded-full focus-visible:ring-2"
                aria-label={saved ? 'Unsave' : 'Save'}
                aria-pressed={saved}
              >
                <Heart
                  size={18}
                  color={saved ? colors.alert : colors.inkSoft}
                  fill={saved ? colors.alert : 'none'}
                />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 mt-2 text-sm" style={{ color: colors.inkSoft }}>
          <MapPin size={14} />
          <span>{post.location}</span>
        </div>
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-1 text-sm font-medium" style={{ color: timeColor }}>
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

function Field({ label, value, onChange, onBlur, placeholder, icon, autoFilled, type = 'text' }) {
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
          onBlur={onBlur}
          placeholder={placeholder}
          className="flex-1 outline-none text-sm ff-body bg-transparent focus-visible:outline-none"
          style={{ color: colors.ink }}
        />
      </div>
    </label>
  );
}

function SubmitMapClicks({ onSet }) {
  useMapEvents({
    click(e) { onSet(e.latlng.lat, e.latlng.lng); },
  });
  return null;
}

function FlyToCoords({ lat, lng }) {
  const map = useMap();
  useEffect(() => {
    if (lat != null && lng != null) {
      map.flyTo([lat, lng], Math.max(map.getZoom(), 16));
    }
  }, [lat, lng, map]);
  return null;
}

function SubmitMap({ lat, lng, onSet }) {
  const initialCenter = useMemo(
    () => (lat != null && lng != null ? [lat, lng] : WASHU_CENTER),
    // initial only; movements handled by FlyToCoords
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  return (
    <div className="rounded-xl overflow-hidden border" style={{ borderColor: colors.mist, height: 200 }}>
      <MapContainer center={initialCenter} zoom={15} style={{ height: '100%', width: '100%' }}>
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
        <SubmitMapClicks onSet={onSet} />
        <FlyToCoords lat={lat} lng={lng} />
        {lat != null && lng != null && (
          <Marker
            position={[lat, lng]}
            draggable
            icon={buildMarkerIcon(false)}
            eventHandlers={{
              dragend: (e) => {
                const p = e.target.getLatLng();
                onSet(p.lat, p.lng);
              },
            }}
          />
        )}
      </MapContainer>
    </div>
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

function ProfileScreen({ me, setMe, savedPosts, savedIds, toggleSave, notifs, posts, openPost }) {
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
        if (!cancelled) toast.error(err.friendly || 'Sign-in failed. Try again.');
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
  }, [me, setMe]);

  async function signOut() {
    try {
      await api('/api/auth/logout', { method: 'POST' });
      setMe(null);
    } catch (err) {
      toast.error(err.friendly || 'Sign-out failed. Try again.');
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

  const alertsTriggered = notifs?.length || 0;
  const postsCreated = (posts || []).filter((p) => p.user_id === me.id).length;
  const savedCount = savedPosts?.length || 0;

  return (
    <main className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
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
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Saved" value={savedCount} color={colors.alert} />
        <StatTile label="Alerts" value={alertsTriggered} color={colors.marigoldDark} />
        <StatTile label="Posts" value={postsCreated} color={colors.clover} />
      </div>

      <section>
        <h2 className="ff-display text-sm font-semibold mb-2 flex items-center gap-1" style={{ color: colors.ink }}>
          <Bookmark size={14} /> Saved
        </h2>
        {savedPosts && savedPosts.length > 0 ? (
          <div className="space-y-3">
            {savedPosts.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                saved={savedIds?.has(p.id)}
                onSaveToggle={toggleSave}
                onOpen={openPost}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm" style={{ color: colors.inkSoft }}>
            Nothing saved yet — tap the heart on a post to keep it here.
          </p>
        )}
      </section>

      <button
        onClick={signOut}
        className="w-full rounded-xl py-3 font-semibold ff-body text-sm flex items-center justify-center gap-2 border"
        style={{ background: '#fff', color: colors.ink, borderColor: colors.mist }}
      >
        <LogOut size={16} />
        Sign out
      </button>
    </main>
  );
}

function StatTile({ label, value, color }) {
  return (
    <div className="rounded-2xl border p-3 text-center" style={{ background: colors.card, borderColor: colors.mist }}>
      <div className="ff-display text-2xl font-bold" style={{ color }}>{value}</div>
      <div className="text-xs mt-0.5" style={{ color: colors.inkSoft }}>{label}</div>
    </div>
  );
}

function buildMarkerIcon(urgent) {
  const fill = urgent ? colors.alert : colors.marigold;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="40" viewBox="0 0 32 40">
      <path d="M16 0 C7 0 0 7 0 16 c0 12 16 24 16 24 s16-12 16-24 c0-9-7-16-16-16 z" fill="${fill}"/>
      <circle cx="16" cy="15" r="6" fill="#fff"/>
    </svg>`;
  return L.divIcon({
    className: 'ff-marker',
    html: svg,
    iconSize: [32, 40],
    iconAnchor: [16, 40],
    popupAnchor: [0, -36],
  });
}

function MapScreen() {
  const navigate = useNavigate();
  const [mapPosts, setMapPosts] = useState([]);
  const [locating, setLocating] = useState(false);
  const mapRef = useRef(null);

  useEffect(() => {
    api('/api/posts/map')
      .then(setMapPosts)
      .catch((err) => toast.error(err.friendly || 'Couldn’t load the map.'));
  }, []);

  const locateMe = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation not available in this browser.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        if (mapRef.current) mapRef.current.flyTo([pos.coords.latitude, pos.coords.longitude], 17);
      },
      () => {
        setLocating(false);
        toast.error('Couldn’t locate you.');
      },
      { timeout: 8000, maximumAge: 60000 }
    );
  };

  return (
    <main className="flex-1 relative">
      <MapContainer
        center={WASHU_CENTER}
        zoom={15}
        style={{ height: '100%', width: '100%' }}
        ref={mapRef}
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap"
        />
        {mapPosts.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={buildMarkerIcon(p.minutesLeft <= 15)}>
            <Popup>
              <div style={{ fontFamily: 'Inter, sans-serif', minWidth: 180 }}>
                <div style={{ fontWeight: 600, marginBottom: 4, color: colors.ink }}>{p.title}</div>
                <div style={{ fontSize: 12, color: colors.inkSoft }}>{p.location}</div>
                <div style={{ fontSize: 12, color: p.minutesLeft <= 15 ? colors.alert : colors.clover, marginTop: 4 }}>
                  {formatMinutes(p.minutesLeft)}
                </div>
                <button
                  onClick={() => navigate(`/posts/${p.id}`)}
                  style={{
                    marginTop: 8, width: '100%', padding: '6px 10px',
                    borderRadius: 8, border: 'none', cursor: 'pointer',
                    background: colors.marigold, color: '#fff',
                    fontSize: 12, fontWeight: 600,
                  }}
                >
                  View post
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
      <button
        onClick={locateMe}
        aria-label="Locate me"
        className="absolute z-[400] rounded-full shadow-lg flex items-center justify-center"
        style={{
          right: 16, bottom: 16, width: 44, height: 44,
          background: '#fff', border: `1px solid ${colors.mist}`,
        }}
      >
        <Locate size={20} color={locating ? colors.marigold : colors.ink} />
      </button>
    </main>
  );
}

function AlertsScreen({ me, setScreen, notifs, setNotifs, focusPost }) {
  const [subs, setSubs] = useState([]);
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
      toast.error(err.friendly || 'Couldn’t load alerts.');
    }
  }

  async function markRead(n) {
    if (!n.read_at) {
      setNotifs((prev) => prev.map((x) => x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x));
      try {
        await api(`/api/notifications/${n.id}/read`, { method: 'PATCH' });
      } catch {
        setNotifs((prev) => prev.map((x) => x.id === n.id ? { ...x, read_at: null } : x));
      }
    }
    if (n.post_id) focusPost(n.post_id);
  }

  async function markAllRead() {
    const now = new Date().toISOString();
    setNotifs((prev) => prev.map((x) => x.read_at ? x : { ...x, read_at: now }));
    try { await api('/api/notifications/read_all', { method: 'POST' }); }
    catch { /* best-effort */ }
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
      toast.error(err.friendly || 'Couldn’t save the alert.');
    }
  }

  async function removeSub(id) {
    try {
      await api(`/api/subscriptions/${id}`, { method: 'DELETE' });
      setSubs(subs.filter((s) => s.id !== id));
    } catch (err) {
      toast.error(err.friendly || 'Couldn’t delete the alert.');
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
          <p className="text-sm" style={{ color: colors.inkSoft }}>
            No alerts yet — add one above to be pinged when nearby leftovers pop up.
          </p>
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
        <div className="flex items-center justify-between mb-2">
          <h2 className="ff-display text-sm font-semibold" style={{ color: colors.ink }}>Recent matches</h2>
          {notifs.some((n) => !n.read_at) && (
            <button
              onClick={markAllRead}
              className="text-xs font-medium underline"
              style={{ color: colors.inkSoft }}
            >
              Mark all read
            </button>
          )}
        </div>
        {notifs.length === 0 ? (
          <p className="text-sm" style={{ color: colors.inkSoft }}>
            You’ll see alerts here when a matching flyer is posted.
          </p>
        ) : (
          <ul className="space-y-2">
            {notifs.map((n) => {
              const unread = !n.read_at;
              return (
                <li key={n.id}>
                  <button
                    onClick={() => markRead(n)}
                    className="w-full text-left rounded-xl border p-3 flex items-start gap-2 focus-visible:ring-2"
                    style={{
                      background: unread ? colors.marigoldSoft : colors.card,
                      borderColor: unread ? colors.marigold : colors.mist,
                    }}
                  >
                    {unread && (
                      <span
                        className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                        style={{ background: colors.marigoldDark }}
                        aria-label="unread"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm" style={{ color: colors.ink, fontWeight: unread ? 600 : 400 }}>{n.message}</div>
                      <div className="text-xs mt-1" style={{ color: colors.inkSoft }}>
                        {relativeTime(n.sent_at)}
                        {n.post_id && <span> · Tap to view post</span>}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

function PostModal({ post, saved, onSaveToggle, onClose }) {
  const [userCoords, setUserCoords] = useState(null);

  useEffect(() => {
    if (!navigator.geolocation) return;
    let cancelled = false;
    navigator.geolocation.getCurrentPosition(
      (pos) => { if (!cancelled) setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
      () => { /* silent — origin is optional */ },
      { timeout: 6000, maximumAge: 60000 },
    );
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (!post) return null;
  const hasCoords = post.lat != null && post.lng != null;
  const urgent = post.minutesLeft <= 15;
  const soon = !urgent && post.minutesLeft <= 60;
  const timeColor = urgent ? colors.alert : soon ? colors.marigoldDark : colors.clover;

  let directionsHref = null;
  if (hasCoords) {
    const params = new URLSearchParams({
      api: '1',
      destination: `${post.lat},${post.lng}`,
      travelmode: 'walking',
    });
    if (userCoords) params.set('origin', `${userCoords.lat},${userCoords.lng}`);
    directionsHref = `https://www.google.com/maps/dir/?${params.toString()}`;
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(31, 42, 36, 0.5)' }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={post.title}
    >
      <div
        className="w-full sm:max-w-md max-h-[90vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl"
        style={{ background: colors.paper }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative">
          {post.imageUrl ? (
            <img
              src={assetUrl(post.imageUrl)}
              alt=""
              className="w-full h-48 object-cover rounded-t-2xl"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          ) : (
            <div className="h-4" />
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            className="absolute top-3 right-3 rounded-full flex items-center justify-center shadow"
            style={{ width: 32, height: 32, background: '#fff' }}
          >
            <X size={18} color={colors.ink} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="ff-display text-lg font-semibold leading-snug" style={{ color: colors.ink }}>
                {post.title}
              </h2>
              {post.organization && (
                <div className="flex items-center gap-1 mt-1 text-sm font-medium" style={{ color: colors.marigoldDark }}>
                  <Users size={14} />
                  <span>{post.organization}</span>
                </div>
              )}
            </div>
            {onSaveToggle && (
              <button
                onClick={() => onSaveToggle(post)}
                className="p-2 rounded-full shrink-0"
                aria-label={saved ? 'Unsave' : 'Save'}
                aria-pressed={saved}
              >
                <Heart
                  size={22}
                  color={saved ? colors.alert : colors.inkSoft}
                  fill={saved ? colors.alert : 'none'}
                />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 text-sm" style={{ color: colors.inkSoft }}>
            <MapPin size={14} />
            <span>{post.location}</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-sm font-medium" style={{ color: timeColor }}>
              <Clock size={14} />
              <span>{formatMinutes(post.minutesLeft)}</span>
            </div>
            {post.tag && (
              <span className="text-xs font-medium px-2 py-1 rounded-full" style={{ background: colors.cloverSoft, color: colors.clover }}>
                {post.tag}
              </span>
            )}
          </div>

          {hasCoords ? (
            <div className="rounded-xl overflow-hidden border" style={{ borderColor: colors.mist, height: 190 }}>
              <MapContainer
                center={[post.lat, post.lng]}
                zoom={16}
                dragging={false}
                zoomControl={false}
                scrollWheelZoom={false}
                doubleClickZoom={false}
                touchZoom={false}
                keyboard={false}
                style={{ height: '100%', width: '100%' }}
              >
                <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
                <Marker position={[post.lat, post.lng]} icon={buildMarkerIcon(urgent)} />
              </MapContainer>
            </div>
          ) : (
            <div
              className="rounded-xl border text-sm px-3 py-4 text-center"
              style={{ borderColor: colors.mist, background: '#fff', color: colors.inkSoft }}
            >
              Pin not set
            </div>
          )}

          {hasCoords ? (
            <a
              href={directionsHref}
              target="_blank"
              rel="noreferrer"
              className="w-full rounded-xl py-3 font-semibold ff-body text-sm flex items-center justify-center gap-2"
              style={{ background: colors.marigold, color: '#fff' }}
            >
              <Navigation size={16} />
              Get directions
            </a>
          ) : (
            <button
              disabled
              className="w-full rounded-xl py-3 font-semibold ff-body text-sm flex items-center justify-center gap-2 opacity-40"
              style={{ background: colors.marigold, color: '#fff' }}
            >
              <Navigation size={16} />
              Get directions
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

const PATH_TO_SCREEN = {
  '/': 'home',
  '/post': 'post',
  '/map': 'map',
  '/alerts': 'alerts',
  '/profile': 'profile',
};
const SCREEN_TO_PATH = { home: '/', post: '/post', map: '/map', alerts: '/alerts', profile: '/profile' };

export default function FoodFeed() {
  const navigate = useNavigate();
  const location = useLocation();
  const pathMatch = location.pathname.match(/^\/posts\/(\d+)/);
  const deepLinkPostId = pathMatch ? parseInt(pathMatch[1], 10) : null;
  const screenFromPath = deepLinkPostId ? null : (PATH_TO_SCREEN[location.pathname] || 'home');
  const [lastScreen, setLastScreen] = useState(screenFromPath || 'home');
  useEffect(() => {
    if (screenFromPath) setLastScreen(screenFromPath);
  }, [screenFromPath]);
  const screen = screenFromPath || lastScreen;
  const setScreen = (next) => {
    const path = SCREEN_TO_PATH[next] || '/';
    if (location.pathname !== path) navigate(path);
  };
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanState, setScanState] = useState('idle');
  const [form, setForm] = useState({ title: '', location: '', minutes: '', tag: '', organization: '', lat: null, lng: null });
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [me, setMe] = useState(null);
  const [notifs, setNotifs] = useState([]);
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [savedIds, setSavedIds] = useState(new Set());
  const [savedPosts, setSavedPosts] = useState([]);
  const [geocodingLoc, setGeocodingLoc] = useState(false);
  const [pinLocating, setPinLocating] = useState(false);
  const lastGeocodedRef = useRef('');
  const fileInput = useRef(null);
  const unreadCount = notifs.filter((n) => !n.read_at).length;
  const filtering = !!(debouncedQ || tag);

  useEffect(() => {
    const h = setTimeout(() => setDebouncedQ(q.trim()), 250);
    return () => clearTimeout(h);
  }, [q]);

  useEffect(() => {
    if (!me) { setNotifs([]); setSavedIds(new Set()); setSavedPosts([]); return; }
    api('/api/notifications').then(setNotifs).catch(() => {});
    api('/api/me/saved').then((data) => {
      setSavedIds(new Set(data.ids || []));
      setSavedPosts(data.posts || []);
    }).catch(() => {});
  }, [me]);

  const toggleSave = async (post) => {
    if (!me) { setScreen('profile'); return; }
    const isSaved = savedIds.has(post.id);
    setSavedIds((prev) => {
      const next = new Set(prev);
      if (isSaved) next.delete(post.id); else next.add(post.id);
      return next;
    });
    setSavedPosts((prev) => {
      if (isSaved) return prev.filter((p) => p.id !== post.id);
      if (prev.some((p) => p.id === post.id)) return prev;
      return [post, ...prev];
    });
    try {
      await api(`/api/posts/${post.id}/save`, { method: isSaved ? 'DELETE' : 'POST' });
    } catch (err) {
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (isSaved) next.add(post.id); else next.delete(post.id);
        return next;
      });
      if (isSaved) setSavedPosts((prev) => prev.some((p) => p.id === post.id) ? prev : [post, ...prev]);
      else setSavedPosts((prev) => prev.filter((p) => p.id !== post.id));
      toast.error(err.friendly || 'Couldn’t save.');
    }
  };

  const focusPost = (postId) => {
    navigate(`/posts/${postId}`);
  };

  const openPost = (post) => {
    navigate(`/posts/${post.id}`);
  };

  const closeModal = () => {
    if (location.key === 'default') {
      navigate('/', { replace: true });
    } else {
      navigate(-1);
    }
  };

  const [modalPost, setModalPost] = useState(null);

  useEffect(() => {
    if (!deepLinkPostId) { setModalPost(null); return; }
    const inList = posts.find((p) => p.id === deepLinkPostId)
      || savedPosts.find((p) => p.id === deepLinkPostId);
    if (inList) {
      setModalPost(inList);
      return;
    }
    let cancelled = false;
    api(`/api/posts/${deepLinkPostId}`)
      .then((p) => { if (!cancelled) setModalPost(p); })
      .catch((err) => {
        if (cancelled) return;
        toast.error(err.friendly || 'Couldn’t load that post.');
        navigate('/', { replace: true });
      });
    return () => { cancelled = true; };
  }, [deepLinkPostId, posts, savedPosts, navigate]);

  useEffect(() => {
    if (!photoFile) { setPhotoPreview(null); return; }
    const url = URL.createObjectURL(photoFile);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

  useEffect(() => {
    api('/api/me').then(setMe).catch(() => setMe(null));
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (debouncedQ) params.set('q', debouncedQ);
    if (tag) params.set('tag', tag);
    const qs = params.toString();
    setLoading(true);
    api(`/api/posts${qs ? `?${qs}` : ''}`)
      .then((data) => setPosts(data))
      .catch((err) => toast.error(err.friendly || 'Couldn’t load posts.'))
      .finally(() => setLoading(false));
  }, [debouncedQ, tag]);

  const resetForm = () => {
    setForm({ title: '', location: '', minutes: '', tag: '', organization: '', lat: null, lng: null });
    setPhotoFile(null);
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
    setPhotoFile(file);
    setScanState('scanning');
    const fd = new FormData();
    fd.append('image', file);
    try {
      const r = await api('/api/posts/scan', { method: 'POST', body: fd });
      setForm((prev) => ({
        ...prev,
        title: r.title || '',
        location: r.location || '',
        minutes: r.minutes != null ? String(r.minutes) : '',
        tag: r.tag || '',
        organization: r.organization || '',
      }));
      setScanState('done');
      if (r.location) runGeocode(r.location);
    } catch (err) {
      setScanState('idle');
      toast.error(`Couldn’t read the flyer — fill it in manually. (${err.friendly || err.message})`);
    }
  };

  const runGeocode = async (text) => {
    const q = (text || '').trim();
    if (!q || q === lastGeocodedRef.current) return;
    lastGeocodedRef.current = q;
    setGeocodingLoc(true);
    try {
      const r = await api(`/api/geocode?q=${encodeURIComponent(q)}`);
      if (r && typeof r.lat === 'number' && typeof r.lng === 'number') {
        setForm((prev) => ({ ...prev, lat: r.lat, lng: r.lng }));
      }
    } catch {
      /* miss is fine — user can drop the pin manually */
    } finally {
      setGeocodingLoc(false);
    }
  };

  const geocodeOnBlur = () => {
    if (form.lat != null && form.lng != null) return;
    runGeocode(form.location);
  };

  const useMyLocationForPin = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation not available in this browser.');
      return;
    }
    setPinLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPinLocating(false);
        setForm((prev) => ({ ...prev, lat: pos.coords.latitude, lng: pos.coords.longitude }));
      },
      () => {
        setPinLocating(false);
        toast.error('Couldn’t locate you.');
      },
      { timeout: 8000, maximumAge: 60000 }
    );
  };

  const submitPost = async () => {
    if (!form.title.trim() || !form.location.trim()) return;
    if (!me) {
      setScreen('profile');
      return;
    }
    try {
      const fd = new FormData();
      fd.append('title', form.title.trim());
      fd.append('location', form.location.trim());
      fd.append('minutes', String(Number(form.minutes) || 30));
      if (form.tag.trim()) fd.append('tag', form.tag.trim());
      if (form.organization.trim()) fd.append('organization', form.organization.trim());
      if (form.lat != null && form.lng != null) {
        fd.append('lat', String(form.lat));
        fd.append('lng', String(form.lng));
      }
      if (photoFile) fd.append('image', photoFile);
      const newPost = await api('/api/posts', { method: 'POST', body: fd });
      setPosts([newPost, ...posts]);
      resetForm();
      setScreen('home');
    } catch (err) {
      toast.error(err.friendly || err.message);
    }
  };

  const titles = { home: 'FoodFeed', post: 'New sighting', map: 'Map', alerts: 'My alerts', profile: 'Profile' };

  return (
    <div className="h-screen w-full flex justify-center overflow-hidden" style={{ background: colors.mist }}>
      <Toaster position="top-center" richColors closeButton />
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

        {screen === 'home' && (
          <main className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            <FilterBar q={q} setQ={setQ} tag={tag} setTag={setTag} />
            {loading && posts.length === 0 && (
              <p className="text-sm text-center" style={{ color: colors.inkSoft }}>Loading…</p>
            )}
            {!loading && posts.length === 0 && filtering && (
              <EmptyState
                icon={<Search size={22} color={colors.marigoldDark} />}
                title="No matches"
                body="Try clearing the filter or a different keyword."
                action={{ label: 'Clear filters', onClick: () => { setQ(''); setTag(''); } }}
              />
            )}
            {!loading && posts.length === 0 && !filtering && (
              <EmptyState
                icon={<Sparkles size={22} color={colors.marigoldDark} />}
                title="No sightings near you yet"
                body="Be the first to share leftovers on campus."
                action={{ label: 'Post a sighting', onClick: startPost }}
              />
            )}
            {posts.map((p) => (
              <PostCard
                key={p.id}
                post={p}
                saved={savedIds.has(p.id)}
                onSaveToggle={toggleSave}
                onOpen={openPost}
              />
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
              {scanState === 'idle' && !photoPreview && (
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
              {scanState === 'done' && photoPreview && (
                <>
                  <img
                    src={photoPreview}
                    alt="flyer preview"
                    className="w-full max-h-48 object-cover rounded-xl"
                  />
                  <div className="w-8 h-8 rounded-full flex items-center justify-center mt-3" style={{ background: colors.clover }}>
                    <Check size={16} color="#fff" />
                  </div>
                  <span className="ff-body text-sm font-medium mt-2" style={{ color: colors.clover }}>Flyer scanned</span>
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
              <Field
                label="Location"
                value={form.location}
                onChange={(v) => setForm({ ...form, location: v })}
                onBlur={geocodeOnBlur}
                placeholder="e.g. Simon Hall lobby"
                icon={<MapPin size={14} />}
                autoFilled={scanState === 'done'}
              />
              <div>
                <div className="text-xs font-medium mb-1" style={{ color: colors.inkSoft }}>
                  Pin location {geocodingLoc && <span>· looking up…</span>}
                </div>
                <SubmitMap
                  lat={form.lat}
                  lng={form.lng}
                  onSet={(lat, lng) => setForm((prev) => ({ ...prev, lat, lng }))}
                />
                <button
                  type="button"
                  onClick={useMyLocationForPin}
                  disabled={pinLocating}
                  className="mt-2 w-full rounded-xl border px-3 py-2 text-sm flex items-center gap-2 disabled:opacity-60"
                  style={{ borderColor: colors.mist, background: '#fff', color: colors.ink }}
                >
                  <Locate size={14} color={colors.inkSoft} />
                  <span>{pinLocating ? 'Locating…' : 'Use my location'}</span>
                </button>
                <div className="text-xs mt-1" style={{ color: colors.inkSoft }}>
                  {form.lat != null && form.lng != null
                    ? <>Pin: {form.lat.toFixed(5)}, {form.lng.toFixed(5)} — drag to correct</>
                    : <>Tap the map, drag a pin, or use “Use my location.” Left unset, we'll try to guess from the text.</>}
                </div>
              </div>
              <Field label="Expires in (minutes)" value={form.minutes} onChange={(v) => setForm({ ...form, minutes: v })} placeholder="e.g. 30" icon={<Clock size={14} />} autoFilled={scanState === 'done'} type="number" />
              <Field label="Organization (optional)" value={form.organization} onChange={(v) => setForm({ ...form, organization: v })} placeholder="e.g. Chinese Student Association" icon={<Users size={14} />} autoFilled={scanState === 'done' && !!form.organization} />
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

        {screen === 'map' && <MapScreen />}
        {screen === 'alerts' && (
          <AlertsScreen
            me={me}
            setScreen={setScreen}
            notifs={notifs}
            setNotifs={setNotifs}
            focusPost={focusPost}
          />
        )}
        {screen === 'profile' && (
          <ProfileScreen
            me={me}
            setMe={setMe}
            savedPosts={savedPosts}
            savedIds={savedIds}
            toggleSave={toggleSave}
            notifs={notifs}
            posts={posts}
            openPost={openPost}
          />
        )}

        {deepLinkPostId && modalPost && (
          <PostModal
            post={modalPost}
            saved={savedIds.has(modalPost.id)}
            onSaveToggle={me ? toggleSave : null}
            onClose={closeModal}
          />
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
            <button
              onClick={() => setScreen('alerts')}
              aria-pressed={screen === 'alerts'}
              aria-label={unreadCount ? `Alerts, ${unreadCount} unread` : 'Alerts'}
              className="relative p-2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            >
              <Bell size={20} color={screen === 'alerts' ? colors.marigold : colors.inkSoft} />
              {unreadCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 text-[10px] font-bold rounded-full flex items-center justify-center"
                  style={{
                    background: colors.alert,
                    color: '#fff',
                    minWidth: 16,
                    height: 16,
                    padding: '0 4px',
                  }}
                >
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
            <NavButton icon={<User size={20} />} active={screen === 'profile'} onClick={() => setScreen('profile')} label="Profile" />
          </nav>
        )}
      </div>
    </div>
  );
}

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    console.error('FoodFeed crashed:', error, info);
  }
  reset = () => {
    this.setState({ hasError: false });
    if (typeof window !== 'undefined') window.location.href = '/';
  };
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: colors.paper,
          color: colors.ink,
          fontFamily: 'Inter, sans-serif',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 56, height: 56, borderRadius: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: colors.marigoldSoft, marginBottom: 16,
          }}
        >
          <Sparkles size={24} color={colors.marigoldDark} />
        </div>
        <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
          Something broke
        </h1>
        <p style={{ fontSize: 14, color: colors.inkSoft, maxWidth: 320, marginBottom: 20 }}>
          The app hit an unexpected error. Reloading usually fixes it.
        </p>
        <button
          onClick={this.reset}
          style={{
            padding: '10px 20px', borderRadius: 12,
            background: colors.marigold, color: '#fff',
            fontWeight: 600, fontSize: 14, border: 'none', cursor: 'pointer',
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}
