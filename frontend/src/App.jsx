import { useState, useEffect, useRef, useMemo, cloneElement, createContext, useContext, Component } from 'react';
import { createPortal } from 'react-dom';
import { Home, Map, Plus, Bell, User, Camera, MapPin, Clock, ArrowLeft, Sparkles, Tag, Check, Trash2, LogOut, Locate, Search, X, Heart, Bookmark, Users, Navigation } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { useLocation, useNavigate } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import L from 'leaflet';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const DEFAULT_THEME = {
  paper: '#FBFAF7',
  ink: '#1F2A24',
  inkSoft: '#6B756F',
  marigold: '#F4A61A',
  marigoldDark: '#C97F0A',
  marigoldSoft: '#FCEBC7',
  marigoldOn: '#FFFFFF',
  clover: '#2F6B4F',
  cloverSoft: '#E7F0EA',
  alert: '#E2542D',
  mist: '#E7E3D8',
  card: '#FFFFFF',
};

const ThemeContext = createContext(DEFAULT_THEME);
function useTheme() { return useContext(ThemeContext); }

function darkenHex(hex, amount = 0.15) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
  if (!m) return hex;
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const r = clamp(parseInt(m[1], 16) * (1 - amount));
  const g = clamp(parseInt(m[2], 16) * (1 - amount));
  const b = clamp(parseInt(m[3], 16) * (1 - amount));
  const hh = (n) => n.toString(16).padStart(2, '0');
  return `#${hh(r)}${hh(g)}${hh(b)}`;
}

function themeFromMe(me) {
  if (!me?.school) return DEFAULT_THEME;
  const s = me.school;
  return {
    ...DEFAULT_THEME,
    marigold: s.primary_color,
    marigoldDark: darkenHex(s.primary_color, 0.15),
    marigoldSoft: s.primary_soft,
    marigoldOn: s.on_primary,
  };
}

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
  const theme = useTheme();
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: theme.mist, background: '#fff' }}>
        <Search size={14} color={theme.inkSoft} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search sightings…"
          className="flex-1 outline-none text-sm ff-body bg-transparent focus-visible:outline-none"
          style={{ color: theme.ink }}
          aria-label="Search"
        />
        {q && (
          <button onClick={() => setQ('')} aria-label="Clear search" style={{ color: theme.inkSoft }}>
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
                background: active ? theme.marigold : '#fff',
                color: active ? '#fff' : theme.ink,
                borderColor: active ? theme.marigold : theme.mist,
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
  const theme = useTheme();
  return (
    <div className="text-center py-12 px-6">
      {icon && (
        <div
          className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
          style={{ background: theme.marigoldSoft }}
        >
          {icon}
        </div>
      )}
      <h3 className="ff-display text-base font-semibold mb-1" style={{ color: theme.ink }}>{title}</h3>
      {body && <p className="text-sm mb-4" style={{ color: theme.inkSoft }}>{body}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="rounded-xl py-2 px-5 font-semibold ff-body text-sm"
          style={{ background: theme.marigold, color: '#fff' }}
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

const REACTIONS = [
  { kind: 'otw', emoji: '👋', label: 'on the way' },
  { kind: 'got', emoji: '🎉', label: 'got some' },
  { kind: 'late', emoji: '😭', label: 'too late' },
];

function ReactionRow({ post, onReact, compact = false }) {
  const theme = useTheme();
  const reactions = post.reactions || { otw: 0, got: 0, late: 0, my: [] };
  const my = new Set(reactions.my || []);
  return (
    <div className="flex flex-wrap gap-1.5 mt-3">
      {REACTIONS.map((r) => {
        const active = my.has(r.kind);
        const count = reactions[r.kind] || 0;
        return (
          <button
            key={r.kind}
            onClick={(e) => {
              e.stopPropagation();
              onReact?.(post, r.kind);
            }}
            aria-pressed={active}
            aria-label={`${r.label}${count ? `, ${count}` : ''}`}
            className={`rounded-full border transition font-medium flex items-center gap-1 ${compact ? 'text-xs px-2 py-0.5' : 'text-xs px-2.5 py-1'}`}
            style={{
              background: active ? theme.marigoldSoft : '#fff',
              borderColor: active ? theme.marigold : theme.mist,
              color: active ? theme.marigoldDark : theme.ink,
            }}
          >
            <span aria-hidden>{r.emoji}</span>
            <span>{r.label}</span>
            {count > 0 && (
              <span
                className="ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold"
                style={{ background: active ? theme.marigold : theme.mist, color: active ? '#fff' : theme.inkSoft }}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function PostCard({ post, saved, onSaveToggle, onOpen, onReact }) {
  const theme = useTheme();
  const urgent = post.minutesLeft <= 15;
  const soon = !urgent && post.minutesLeft <= 60;
  const timeColor = urgent ? theme.alert : soon ? theme.marigoldDark : theme.clover;
  const isGone = post.status === 'gone';
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
      className="rounded-2xl border overflow-hidden transition-shadow text-left w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 relative"
      style={{
        background: theme.card,
        borderColor: isGone ? theme.alert : theme.mist,
        cursor: onOpen ? 'pointer' : 'default',
        opacity: isGone ? 0.6 : 1,
      }}
    >
      {isGone && (
        <div
          className="absolute top-2 left-2 z-[1] text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide"
          style={{ background: theme.alert, color: '#fff' }}
        >
          Reported gone
        </div>
      )}
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
            <h3 className="ff-display text-base font-semibold leading-snug" style={{ color: theme.ink }}>
              {post.title}
            </h3>
            {post.organization && (
              <div className="flex items-center gap-1 mt-1 text-xs font-medium" style={{ color: theme.marigoldDark }}>
                <Users size={12} />
                <span className="truncate">{post.organization}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {urgent && (
              <span
                className="w-2 h-2 rounded-full mt-2 ff-pulse"
                style={{ background: theme.alert }}
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
                  color={saved ? theme.alert : theme.inkSoft}
                  fill={saved ? theme.alert : 'none'}
                />
              </button>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 mt-2 text-sm" style={{ color: theme.inkSoft }}>
          <MapPin size={14} />
          <span>{post.location}</span>
        </div>
        <div className="flex items-center justify-between mt-3">
          <div className="flex items-center gap-1 text-sm font-medium" style={{ color: timeColor }}>
            <Clock size={14} />
            <span>{formatMinutes(post.minutesLeft)}</span>
          </div>
          {post.tag && (
            <span className="text-xs font-medium px-2 py-1 rounded-full" style={{ background: theme.cloverSoft, color: theme.clover }}>
              {post.tag}
            </span>
          )}
        </div>
        {onReact && <ReactionRow post={post} onReact={onReact} compact />}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, onBlur, placeholder, icon, autoFilled, type = 'text' }) {
  const theme = useTheme();
  return (
    <label className="block">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium" style={{ color: theme.inkSoft }}>{label}</span>
        {autoFilled && (
          <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: theme.marigoldSoft, color: theme.marigoldDark }}>
            auto-filled
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 rounded-xl border px-3 py-2" style={{ borderColor: theme.mist, background: '#fff' }}>
        {icon && <span style={{ color: theme.inkSoft }}>{icon}</span>}
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
          placeholder={placeholder}
          className="flex-1 outline-none text-sm ff-body bg-transparent focus-visible:outline-none"
          style={{ color: theme.ink }}
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
  const theme = useTheme();
  const initialCenter = useMemo(
    () => (lat != null && lng != null ? [lat, lng] : WASHU_CENTER),
    // initial only; movements handled by FlyToCoords
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  return (
    <div className="rounded-xl overflow-hidden border" style={{ borderColor: theme.mist, height: 200 }}>
      <MapContainer center={initialCenter} zoom={15} style={{ height: '100%', width: '100%' }}>
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
        <SubmitMapClicks onSet={onSet} />
        <FlyToCoords lat={lat} lng={lng} />
        {lat != null && lng != null && (
          <Marker
            position={[lat, lng]}
            draggable
            icon={buildMarkerIcon(false, theme.marigold)}
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
  const theme = useTheme();
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      className="p-2 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
    >
      {cloneElement(icon, { color: active ? theme.marigold : theme.inkSoft })}
    </button>
  );
}

function ProfileScreen({ me, setMe, savedPosts, savedIds, toggleSave, onReact, notifs, posts, openPost }) {
  const theme = useTheme();
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
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: theme.cloverSoft }}>
          <User size={26} color={theme.clover} />
        </div>
        <h2 className="ff-display text-base font-semibold mb-1" style={{ color: theme.ink }}>Sign in to FoodFeed</h2>
        <p className="text-sm mb-6" style={{ color: theme.inkSoft }}>Use your .edu Google account to post sightings and set up alerts.</p>
        <div ref={btnRef} />
      </main>
    );
  }

  const alertsTriggered = notifs?.length || 0;
  const postsCreated = (posts || []).filter((p) => p.user_id === me.id).length;
  const savedCount = savedPosts?.length || 0;

  return (
    <main className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      <div className="rounded-2xl border p-5" style={{ background: theme.card, borderColor: theme.mist }}>
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: theme.marigoldSoft }}>
            <User size={22} color={theme.marigoldDark} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="ff-display font-semibold truncate" style={{ color: theme.ink }}>{me.name || 'Signed in'}</div>
            <div className="text-sm truncate" style={{ color: theme.inkSoft }}>{me.email}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <StatTile label="Saved" value={savedCount} color={theme.alert} />
        <StatTile label="Alerts" value={alertsTriggered} color={theme.marigoldDark} />
        <StatTile label="Posts" value={postsCreated} color={theme.clover} />
      </div>

      <section>
        <h2 className="ff-display text-sm font-semibold mb-2 flex items-center gap-1" style={{ color: theme.ink }}>
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
                onReact={onReact}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm" style={{ color: theme.inkSoft }}>
            Nothing saved yet — tap the heart on a post to keep it here.
          </p>
        )}
      </section>

      <button
        onClick={signOut}
        className="w-full rounded-xl py-3 font-semibold ff-body text-sm flex items-center justify-center gap-2 border"
        style={{ background: '#fff', color: theme.ink, borderColor: theme.mist }}
      >
        <LogOut size={16} />
        Sign out
      </button>
    </main>
  );
}

function StatTile({ label, value, color }) {
  const theme = useTheme();
  return (
    <div className="rounded-2xl border p-3 text-center" style={{ background: theme.card, borderColor: theme.mist }}>
      <div className="ff-display text-2xl font-bold" style={{ color }}>{value}</div>
      <div className="text-xs mt-0.5" style={{ color: theme.inkSoft }}>{label}</div>
    </div>
  );
}

function buildMarkerIcon(urgent, marigold = DEFAULT_THEME.marigold) {
  const fill = urgent ? DEFAULT_THEME.alert : marigold;
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

function buildClusterIcon(marigold) {
  return (cluster) => {
    const count = cluster.getChildCount();
    return L.divIcon({
      html: `<div style="
        width: 36px; height: 36px; border-radius: 50%;
        background: ${marigold}; color: #fff;
        display: flex; align-items: center; justify-content: center;
        font-weight: 700; font-family: 'Inter', sans-serif; font-size: 13px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.25);
        border: 2px solid #fff;
      ">${count}</div>`,
      className: 'ff-cluster',
      iconSize: [36, 36],
    });
  };
}

function MapScreen({ me }) {
  const theme = useTheme();
  const navigate = useNavigate();
  const [mapPosts, setMapPosts] = useState([]);
  const [locating, setLocating] = useState(false);
  const mapRef = useRef(null);
  const center = useMemo(
    () => (me?.school ? [me.school.center_lat, me.school.center_lng] : WASHU_CENTER),
    [me?.school?.id],
  );

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
        center={center}
        zoom={15}
        style={{ height: '100%', width: '100%' }}
        ref={mapRef}
      >
        <TileLayer
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap"
        />
        <MarkerClusterGroup
          chunkedLoading
          showCoverageOnHover={false}
          spiderfyOnMaxZoom
          iconCreateFunction={buildClusterIcon(theme.marigold)}
        >
          {mapPosts.map((p) => (
            <Marker key={p.id} position={[p.lat, p.lng]} icon={buildMarkerIcon(p.minutesLeft <= 15, theme.marigold)}>
              <Popup>
                <div style={{ fontFamily: 'Inter, sans-serif', minWidth: 180 }}>
                  <div style={{ fontWeight: 600, marginBottom: 4, color: theme.ink }}>{p.title}</div>
                  <div style={{ fontSize: 12, color: theme.inkSoft }}>{p.location}</div>
                  <div style={{ fontSize: 12, color: p.minutesLeft <= 15 ? theme.alert : theme.clover, marginTop: 4 }}>
                    {formatMinutes(p.minutesLeft)}
                  </div>
                  <button
                    onClick={() => navigate(`/posts/${p.id}`)}
                    style={{
                      marginTop: 8, width: '100%', padding: '6px 10px',
                      borderRadius: 8, border: 'none', cursor: 'pointer',
                      background: theme.marigold, color: '#fff',
                      fontSize: 12, fontWeight: 600,
                    }}
                  >
                    View post
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>
      </MapContainer>
      <button
        onClick={locateMe}
        aria-label="Locate me"
        className="absolute z-[400] rounded-full shadow-lg flex items-center justify-center"
        style={{
          right: 16, bottom: 16, width: 44, height: 44,
          background: '#fff', border: `1px solid ${theme.mist}`,
        }}
      >
        <Locate size={20} color={locating ? theme.marigold : theme.ink} />
      </button>
    </main>
  );
}

function AlertsScreen({ me, setScreen, notifs, setNotifs, focusPost }) {
  const theme = useTheme();
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
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4" style={{ background: theme.cloverSoft }}>
          <Bell size={26} color={theme.clover} />
        </div>
        <h2 className="ff-display text-base font-semibold mb-1" style={{ color: theme.ink }}>Sign in to set alerts</h2>
        <p className="text-sm mb-6" style={{ color: theme.inkSoft }}>Alerts are tied to your account so we can notify you.</p>
        <button
          onClick={() => setScreen('profile')}
          className="rounded-xl py-2 px-5 font-semibold ff-body text-sm"
          style={{ background: theme.marigold, color: '#fff' }}
        >
          Go to profile
        </button>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
      <section className="rounded-2xl border p-4 space-y-3" style={{ background: theme.card, borderColor: theme.mist }}>
        <h2 className="ff-display text-sm font-semibold" style={{ color: theme.ink }}>New alert</h2>
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
          <div className="text-xs font-medium mb-1" style={{ color: theme.inkSoft }}>Location</div>
          <button
            onClick={useMyLocation}
            disabled={locating}
            className="w-full rounded-xl border px-3 py-2 text-sm flex items-center gap-2 disabled:opacity-60"
            style={{ borderColor: theme.mist, background: '#fff', color: theme.ink }}
          >
            <Locate size={14} color={theme.inkSoft} />
            <span>{locating ? 'Locating…' : 'Use my location'}</span>
          </button>
          {coords && (
            <div className="text-xs mt-1" style={{ color: theme.inkSoft }}>
              {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
              {usingFallback && <span> — using WashU as default</span>}
            </div>
          )}
        </div>
        <button
          onClick={submit}
          disabled={!coords || !(Number(radius) > 0)}
          className="w-full rounded-xl py-3 font-semibold ff-body text-sm disabled:opacity-40"
          style={{ background: theme.marigold, color: '#fff' }}
        >
          Save alert
        </button>
      </section>

      <section>
        <h2 className="ff-display text-sm font-semibold mb-2" style={{ color: theme.ink }}>My alerts</h2>
        {subs.length === 0 ? (
          <p className="text-sm" style={{ color: theme.inkSoft }}>
            No alerts yet — add one above to be pinged when nearby leftovers pop up.
          </p>
        ) : (
          <ul className="space-y-2">
            {subs.map((s) => (
              <li key={s.id} className="rounded-xl border p-3 flex items-center justify-between" style={{ background: theme.card, borderColor: theme.mist }}>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate" style={{ color: theme.ink }}>
                    {s.keyword ? `"${s.keyword}"` : 'Any food'} within {s.radius_miles} mi
                  </div>
                  <div className="text-xs" style={{ color: theme.inkSoft }}>
                    {s.lat.toFixed(4)}, {s.lng.toFixed(4)}
                  </div>
                </div>
                <button
                  onClick={() => removeSub(s.id)}
                  className="p-2 rounded-full"
                  aria-label="Delete alert"
                  style={{ color: theme.alert }}
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
          <h2 className="ff-display text-sm font-semibold" style={{ color: theme.ink }}>Recent matches</h2>
          {notifs.some((n) => !n.read_at) && (
            <button
              onClick={markAllRead}
              className="text-xs font-medium underline"
              style={{ color: theme.inkSoft }}
            >
              Mark all read
            </button>
          )}
        </div>
        {notifs.length === 0 ? (
          <p className="text-sm" style={{ color: theme.inkSoft }}>
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
                      background: unread ? theme.marigoldSoft : theme.card,
                      borderColor: unread ? theme.marigold : theme.mist,
                    }}
                  >
                    {unread && (
                      <span
                        className="w-2 h-2 rounded-full mt-1.5 shrink-0"
                        style={{ background: theme.marigoldDark }}
                        aria-label="unread"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm" style={{ color: theme.ink, fontWeight: unread ? 600 : 400 }}>{n.message}</div>
                      <div className="text-xs mt-1" style={{ color: theme.inkSoft }}>
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

function PostModal({ post, saved, onSaveToggle, onClose, onReact }) {
  const theme = useTheme();
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
  const timeColor = urgent ? theme.alert : soon ? theme.marigoldDark : theme.clover;
  const isGone = post.status === 'gone';
  const my = new Set(post.reactions?.my || []);
  const stillCount = post.reactions?.still || 0;
  const goneCount = post.reactions?.gone || 0;

  const handleDirections = () => {
    try {
      sessionStorage.setItem('ff_visited_post', `${post.id}|${Date.now()}`);
    } catch {}
  };

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
        style={{ background: theme.paper }}
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
            <X size={18} color={theme.ink} />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="ff-display text-lg font-semibold leading-snug" style={{ color: theme.ink }}>
                {post.title}
              </h2>
              {post.organization && (
                <div className="flex items-center gap-1 mt-1 text-sm font-medium" style={{ color: theme.marigoldDark }}>
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
                  color={saved ? theme.alert : theme.inkSoft}
                  fill={saved ? theme.alert : 'none'}
                />
              </button>
            )}
          </div>

          <div className="flex items-center gap-1 text-sm" style={{ color: theme.inkSoft }}>
            <MapPin size={14} />
            <span>{post.location}</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-sm font-medium" style={{ color: timeColor }}>
              <Clock size={14} />
              <span>{formatMinutes(post.minutesLeft)}</span>
            </div>
            {post.tag && (
              <span className="text-xs font-medium px-2 py-1 rounded-full" style={{ background: theme.cloverSoft, color: theme.clover }}>
                {post.tag}
              </span>
            )}
          </div>

          {hasCoords ? (
            <div className="rounded-xl overflow-hidden border" style={{ borderColor: theme.mist, height: 190 }}>
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
                <Marker position={[post.lat, post.lng]} icon={buildMarkerIcon(urgent, theme.marigold)} />
              </MapContainer>
            </div>
          ) : (
            <div
              className="rounded-xl border text-sm px-3 py-4 text-center"
              style={{ borderColor: theme.mist, background: '#fff', color: theme.inkSoft }}
            >
              Pin not set
            </div>
          )}

          {hasCoords ? (
            <a
              href={directionsHref}
              target="_blank"
              rel="noreferrer"
              onClick={handleDirections}
              className="w-full rounded-xl py-3 font-semibold ff-body text-sm flex items-center justify-center gap-2"
              style={{ background: theme.marigold, color: '#fff' }}
            >
              <Navigation size={16} />
              Get directions
            </a>
          ) : (
            <button
              disabled
              className="w-full rounded-xl py-3 font-semibold ff-body text-sm flex items-center justify-center gap-2 opacity-40"
              style={{ background: theme.marigold, color: '#fff' }}
            >
              <Navigation size={16} />
              Get directions
            </button>
          )}

          {onReact && (
            <>
              {isGone && (
                <div
                  className="rounded-xl border px-3 py-2 text-xs font-medium"
                  style={{ background: theme.alert, borderColor: theme.alert, color: '#fff' }}
                >
                  Reported gone by the community.
                </div>
              )}
              <ReactionRow post={post} onReact={onReact} />
              <div className="pt-2 border-t" style={{ borderColor: theme.mist }}>
                <div className="text-xs font-medium mb-2" style={{ color: theme.inkSoft }}>
                  Still there?
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => onReact(post, 'still')}
                    className="flex-1 rounded-xl border py-2 text-sm font-semibold transition"
                    style={{
                      background: my.has('still') ? theme.clover : '#fff',
                      color: my.has('still') ? '#fff' : theme.clover,
                      borderColor: theme.clover,
                    }}
                  >
                    Yes, still there{stillCount > 0 && ` · ${stillCount}`}
                  </button>
                  <button
                    onClick={() => onReact(post, 'gone')}
                    className="flex-1 rounded-xl border py-2 text-sm font-semibold transition"
                    style={{
                      background: my.has('gone') ? theme.alert : '#fff',
                      color: my.has('gone') ? '#fff' : theme.alert,
                      borderColor: theme.alert,
                    }}
                  >
                    Gone{goneCount > 0 && ` · ${goneCount}`}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function OnboardingScreen({ setMe }) {
  const theme = useTheme();
  const [schools, setSchools] = useState([]);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api('/api/schools')
      .then(setSchools)
      .catch((err) => toast.error(err.friendly || 'Couldn’t load schools.'));
  }, []);

  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? schools.filter(
        (s) =>
          s.name.toLowerCase().includes(needle) ||
          s.short_name.toLowerCase().includes(needle),
      )
    : schools;

  async function join() {
    if (!selected || submitting) return;
    setSubmitting(true);
    try {
      const updated = await api('/api/me/school', {
        method: 'PATCH',
        body: JSON.stringify({ school_id: selected.id }),
      });
      setMe(updated);
    } catch (err) {
      toast.error(err.friendly || 'Couldn’t join that school.');
      setSubmitting(false);
    }
  }

  if (selected) {
    return (
      <main className="flex-1 overflow-y-auto px-6 py-10 flex flex-col">
        <div className="flex-1 flex flex-col items-center justify-center text-center">
          <img
            src={selected.logo_path}
            alt=""
            className="w-20 h-20 rounded-2xl mb-4"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
          <div
            className="text-xs font-semibold uppercase tracking-wide mb-2"
            style={{ color: theme.inkSoft }}
          >
            You’re joining
          </div>
          <h2 className="ff-display text-2xl font-semibold mb-2" style={{ color: theme.ink }}>
            {selected.short_name} FoodFeed
          </h2>
          <p className="text-sm mb-8 max-w-xs" style={{ color: theme.inkSoft }}>
            You’ll see sightings from other {selected.short_name} students and post to the same community.
          </p>
          <button
            onClick={join}
            disabled={submitting}
            className="w-full rounded-xl py-3 font-semibold ff-body text-sm disabled:opacity-60"
            style={{ background: selected.primary_color, color: selected.on_primary }}
          >
            {submitting ? 'Joining…' : 'Join community'}
          </button>
          <button
            onClick={() => setSelected(null)}
            className="mt-3 text-sm font-medium underline"
            style={{ color: theme.inkSoft }}
          >
            Choose a different school
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
      <div className="px-2">
        <h1 className="ff-display text-2xl font-semibold" style={{ color: theme.ink }}>
          Welcome to FoodFeed
        </h1>
        <p className="text-sm mt-1" style={{ color: theme.inkSoft }}>
          Pick your school to see leftover-food sightings from your campus.
        </p>
      </div>
      <div
        className="flex items-center gap-2 rounded-xl border px-3 py-2"
        style={{ borderColor: theme.mist, background: '#fff' }}
      >
        <Search size={14} color={theme.inkSoft} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search schools…"
          className="flex-1 outline-none text-sm ff-body bg-transparent focus-visible:outline-none"
          style={{ color: theme.ink }}
          aria-label="Search schools"
          autoFocus
        />
        {q && (
          <button onClick={() => setQ('')} aria-label="Clear search" style={{ color: theme.inkSoft }}>
            <X size={14} />
          </button>
        )}
      </div>
      {filtered.length === 0 ? (
        <div className="text-center py-10 px-6">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: theme.marigoldSoft }}
          >
            <Sparkles size={22} color={theme.marigoldDark} />
          </div>
          <h3 className="ff-display text-base font-semibold mb-1" style={{ color: theme.ink }}>
            We’re not on that campus yet
          </h3>
          <p className="text-sm" style={{ color: theme.inkSoft }}>
            We’ll notify you when we launch there.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => setSelected(s)}
                className="w-full rounded-2xl border p-3 flex items-center gap-3 text-left focus-visible:ring-2"
                style={{ background: theme.card, borderColor: theme.mist }}
              >
                <img
                  src={s.logo_path}
                  alt=""
                  className="w-11 h-11 rounded-xl shrink-0"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
                <div className="min-w-0 flex-1">
                  <div className="ff-display font-semibold text-sm truncate" style={{ color: theme.ink }}>
                    {s.short_name}
                  </div>
                  <div className="text-xs truncate" style={{ color: theme.inkSoft }}>
                    {s.name}
                  </div>
                </div>
                <span
                  className="w-6 h-6 rounded-full shrink-0"
                  style={{ background: s.primary_color, border: `2px solid ${s.primary_soft}` }}
                  aria-hidden
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

const FIRST_ALERT_RADII = [0.25, 0.5, 1, 2, 5];

function firstAlertDoneKey(userId) {
  return `ff_first_alert_done_${userId}`;
}

function FirstAlertScreen({ me, onDone }) {
  const theme = useTheme();
  const [keywords, setKeywords] = useState([]);
  const [customOpen, setCustomOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const [radius, setRadius] = useState(0.5);
  const [submitting, setSubmitting] = useState(false);

  const toggleChip = (t) => {
    setKeywords((prev) => (prev.includes(t) ? prev.filter((k) => k !== t) : [...prev, t]));
  };

  const openCustom = () => {
    setCustomOpen((v) => !v);
  };

  async function save() {
    if (submitting) return;
    setSubmitting(true);
    const lat = me?.school?.center_lat ?? WASHU_CENTER[0];
    const lng = me?.school?.center_lng ?? WASHU_CENTER[1];
    const customClean = custom.trim();
    const all = [...keywords];
    if (customClean && !all.includes(customClean)) all.push(customClean);
    const toSave = all.length > 0 ? all : [null];
    try {
      for (const kw of toSave) {
        await api('/api/subscriptions', {
          method: 'POST',
          body: JSON.stringify({
            lat,
            lng,
            radius_miles: radius,
            keyword: kw,
          }),
        });
      }
      try { localStorage.setItem(firstAlertDoneKey(me.id), '1'); } catch {}
      toast.success(
        toSave.length > 1
          ? `You’ll get pinged when any of those show up.`
          : `You’ll get pinged when a match shows up.`
      );
      onDone();
    } catch (err) {
      toast.error(err.friendly || 'Couldn’t save that alert.');
      setSubmitting(false);
    }
  }

  function skip() {
    try { localStorage.setItem(firstAlertDoneKey(me.id), '1'); } catch {}
    onDone();
  }

  const chipActive = (t) => keywords.includes(t);

  return (
    <main className="flex-1 overflow-y-auto px-6 py-10 flex flex-col">
      <div className="flex-1 flex flex-col">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-5" style={{ background: theme.marigoldSoft }}>
          <Bell size={24} color={theme.marigoldDark} />
        </div>
        <h2 className="ff-display text-2xl font-semibold mb-2" style={{ color: theme.ink }}>
          One last thing
        </h2>
        <p className="text-sm mb-8" style={{ color: theme.inkSoft }}>
          Tell us what to watch for. We’ll notify you the moment someone posts nearby.
        </p>

        <div className="mb-6">
          <div className="text-xs font-medium mb-2" style={{ color: theme.inkSoft }}>
            I’m watching for… <span style={{ opacity: 0.7 }}>(pick as many as you like)</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {CANONICAL_TAGS.map((t) => {
              const active = chipActive(t);
              return (
                <button
                  key={t}
                  onClick={() => toggleChip(t)}
                  className="text-xs font-medium px-3 py-1 rounded-full whitespace-nowrap border transition"
                  style={{
                    background: active ? theme.marigold : '#fff',
                    color: active ? '#fff' : theme.ink,
                    borderColor: active ? theme.marigold : theme.mist,
                  }}
                >
                  {t}
                </button>
              );
            })}
            <button
              onClick={openCustom}
              className="text-xs font-medium px-3 py-1 rounded-full whitespace-nowrap border transition"
              style={{
                background: customOpen ? theme.marigold : '#fff',
                color: customOpen ? '#fff' : theme.ink,
                borderColor: customOpen ? theme.marigold : theme.mist,
              }}
            >
              Custom…
            </button>
          </div>
          {customOpen && (
            <div className="mt-3">
              <Field
                label="Custom keyword"
                value={custom}
                onChange={setCustom}
                placeholder="e.g. dumplings"
                icon={<Tag size={14} />}
              />
            </div>
          )}
        </div>

        <div className="mb-8">
          <div className="text-xs font-medium mb-2" style={{ color: theme.inkSoft }}>
            Within…
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {FIRST_ALERT_RADII.map((r) => {
              const active = radius === r;
              return (
                <button
                  key={r}
                  onClick={() => setRadius(r)}
                  className="text-xs font-medium px-3 py-1 rounded-full whitespace-nowrap border transition"
                  style={{
                    background: active ? theme.marigold : '#fff',
                    color: active ? '#fff' : theme.ink,
                    borderColor: active ? theme.marigold : theme.mist,
                  }}
                >
                  {r} mi
                </button>
              );
            })}
          </div>
        </div>

        <button
          onClick={save}
          disabled={submitting}
          className="w-full rounded-xl py-3 font-semibold ff-body text-sm disabled:opacity-60"
          style={{ background: theme.marigold, color: '#fff' }}
        >
          {submitting ? 'Saving…' : 'Set my alert'}
        </button>
        <button
          onClick={skip}
          disabled={submitting}
          className="mt-3 text-sm font-medium underline self-center"
          style={{ color: theme.inkSoft }}
        >
          Skip for now
        </button>
      </div>
    </main>
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
  const [me, setMe] = useState(null);
  useEffect(() => {
    api('/api/me').then(setMe).catch(() => setMe(null));
  }, []);
  const theme = useMemo(() => themeFromMe(me), [me?.school?.id]);
  return (
    <ThemeContext.Provider value={theme}>
      <FoodFeedInner me={me} setMe={setMe} />
    </ThemeContext.Provider>
  );
}

function FoodFeedInner({ me, setMe }) {
  const theme = useTheme();
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
  const [notifs, setNotifs] = useState([]);
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [savedIds, setSavedIds] = useState(new Set());
  const [savedPosts, setSavedPosts] = useState([]);
  const [geocodingLoc, setGeocodingLoc] = useState(false);
  const [pinLocating, setPinLocating] = useState(false);
  const [firstAlertDone, setFirstAlertDone] = useState(false);
  const [firstAlertChecked, setFirstAlertChecked] = useState(false);
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

  useEffect(() => {
    if (!me?.id || !me?.school_id) {
      setFirstAlertDone(false);
      setFirstAlertChecked(false);
      return;
    }
    let stamped = false;
    try {
      stamped = localStorage.getItem(firstAlertDoneKey(me.id)) === '1';
    } catch {}
    if (stamped) {
      setFirstAlertDone(true);
      setFirstAlertChecked(true);
      return;
    }
    let cancelled = false;
    api('/api/subscriptions')
      .then((subs) => {
        if (cancelled) return;
        if (Array.isArray(subs) && subs.length > 0) {
          try { localStorage.setItem(firstAlertDoneKey(me.id), '1'); } catch {}
          setFirstAlertDone(true);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setFirstAlertChecked(true);
      });
    return () => { cancelled = true; };
  }, [me?.id, me?.school_id]);

  const applyReactionUpdate = (postId, next) => {
    setPosts((prev) => prev.map((p) => p.id === postId ? { ...p, ...next } : p));
    setSavedPosts((prev) => prev.map((p) => p.id === postId ? { ...p, ...next } : p));
    setModalPost((prev) => (prev && prev.id === postId ? { ...prev, ...next } : prev));
  };

  const reactToPost = async (post, kind) => {
    if (!me) { setScreen('profile'); return; }
    const current = post.reactions || { otw: 0, got: 0, late: 0, gone: 0, still: 0, my: [] };
    const myList = current.my || [];
    const has = myList.includes(kind);
    const optimistic = {
      ...current,
      [kind]: Math.max(0, (current[kind] || 0) + (has ? -1 : 1)),
      my: has ? myList.filter((k) => k !== kind) : [...myList, kind],
    };
    const optimisticGone = optimistic.gone >= 2 && optimistic.gone > optimistic.still;
    applyReactionUpdate(post.id, {
      reactions: optimistic,
      status: optimisticGone ? 'gone' : undefined,
    });
    try {
      const r = await api(`/api/posts/${post.id}/react`, {
        method: 'POST',
        body: JSON.stringify({ kind }),
      });
      const authoritativeGone = r.reactions.gone >= 2 && r.reactions.gone > r.reactions.still;
      applyReactionUpdate(post.id, {
        reactions: r.reactions,
        status: authoritativeGone ? 'gone' : undefined,
      });
    } catch (err) {
      applyReactionUpdate(post.id, {
        reactions: current,
        status: post.status,
      });
      toast.error(err.friendly || 'Couldn’t save that reaction.');
    }
  };

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
  const [pendingPosts, setPendingPosts] = useState([]);
  const postsRef = useRef(posts);
  useEffect(() => { postsRef.current = posts; }, [posts]);

  useEffect(() => {
    if (!me?.school_id || screen !== 'home') return;
    const params = new URLSearchParams();
    if (debouncedQ) params.set('q', debouncedQ);
    if (tag) params.set('tag', tag);
    const qs = params.toString();

    async function poll() {
      if (document.visibilityState !== 'visible') return;
      if (window.scrollY > 800) return;
      try {
        const fresh = await api(`/api/posts${qs ? `?${qs}` : ''}`);
        setPendingPosts((prevPending) => {
          const knownIds = new Set([
            ...postsRef.current.map((p) => p.id),
            ...prevPending.map((p) => p.id),
          ]);
          const newOnes = fresh.filter((p) => !knownIds.has(p.id));
          return newOnes.length ? [...prevPending, ...newOnes] : prevPending;
        });
      } catch {}
    }
    const h = setInterval(poll, 60_000);
    return () => clearInterval(h);
  }, [debouncedQ, tag, me?.school_id, screen]);

  useEffect(() => {
    setPendingPosts([]);
  }, [debouncedQ, tag, me?.school_id]);

  const mergePendingPosts = () => {
    setPosts((prev) => {
      const known = new Set(prev.map((p) => p.id));
      const additions = pendingPosts.filter((p) => !known.has(p.id));
      return [...additions, ...prev];
    });
    setPendingPosts([]);
  };

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
    if (!me?.school_id) { setPosts([]); setLoading(false); return; }
    const params = new URLSearchParams();
    if (debouncedQ) params.set('q', debouncedQ);
    if (tag) params.set('tag', tag);
    const qs = params.toString();
    setLoading(true);
    api(`/api/posts${qs ? `?${qs}` : ''}`)
      .then((data) => setPosts(data))
      .catch((err) => toast.error(err.friendly || 'Couldn’t load posts.'))
      .finally(() => setLoading(false));
  }, [debouncedQ, tag, me?.school_id]);

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

  const renderFeedContent = (layout /* 'stack' | 'grid' */) => (
    <>
      <FilterBar q={q} setQ={setQ} tag={tag} setTag={setTag} />
      {pendingPosts.length > 0 && (
        <button
          onClick={mergePendingPosts}
          className="w-full rounded-full py-2 text-xs font-semibold shadow-sm border transition"
          style={{ background: theme.marigold, color: '#fff', borderColor: theme.marigoldDark }}
        >
          ↑ {pendingPosts.length} new sighting{pendingPosts.length === 1 ? '' : 's'} — tap to show
        </button>
      )}
      {loading && posts.length === 0 && (
        <p className="text-sm text-center" style={{ color: theme.inkSoft }}>Loading…</p>
      )}
      {!loading && posts.length === 0 && filtering && (
        <EmptyState
          icon={<Search size={22} color={theme.marigoldDark} />}
          title="No matches"
          body="Try clearing the filter or a different keyword."
          action={{ label: 'Clear filters', onClick: () => { setQ(''); setTag(''); } }}
        />
      )}
      {!loading && posts.length === 0 && !filtering && (
        <EmptyState
          icon={<Sparkles size={22} color={theme.marigoldDark} />}
          title="No sightings near you yet"
          body="Be the first to share leftovers on campus."
          action={{ label: 'Post a sighting', onClick: startPost }}
        />
      )}
      <div className={layout === 'grid' ? 'grid grid-cols-1 lg:grid-cols-2 gap-3' : 'space-y-3'}>
        {posts.map((p) => (
          <PostCard
            key={p.id}
            post={p}
            saved={savedIds.has(p.id)}
            onSaveToggle={toggleSave}
            onOpen={openPost}
            onReact={me ? reactToPost : null}
          />
        ))}
      </div>
    </>
  );

  const renderComposer = () => (
    <>
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
          borderColor: scanState === 'done' ? theme.clover : theme.mist,
          background: scanState === 'done' ? theme.cloverSoft : '#fff',
        }}
      >
        {scanState === 'scanning' && (
          <div className="absolute left-0 right-0 h-0.5 ff-scanline" style={{ background: theme.marigold }} />
        )}
        {scanState === 'idle' && !photoPreview && (
          <>
            <Camera size={28} color={theme.inkSoft} />
            <span className="ff-body text-sm font-medium mt-3" style={{ color: theme.ink }}>Tap to add a flyer photo</span>
            <span className="ff-body text-xs mt-1" style={{ color: theme.inkSoft }}>We'll read the details for you</span>
          </>
        )}
        {scanState === 'scanning' && (
          <>
            <Sparkles size={28} color={theme.marigold} />
            <span className="ff-body text-sm font-medium mt-3" style={{ color: theme.ink }}>Scanning flyer…</span>
          </>
        )}
        {scanState === 'done' && photoPreview && (
          <>
            <img
              src={photoPreview}
              alt="flyer preview"
              className="w-full max-h-48 object-cover rounded-xl"
            />
            <div className="w-8 h-8 rounded-full flex items-center justify-center mt-3" style={{ background: theme.clover }}>
              <Check size={16} color="#fff" />
            </div>
            <span className="ff-body text-sm font-medium mt-2" style={{ color: theme.clover }}>Flyer scanned</span>
            <span
              className="ff-body text-xs mt-1 underline"
              style={{ color: theme.inkSoft }}
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
          <div className="text-xs font-medium mb-1" style={{ color: theme.inkSoft }}>
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
            style={{ borderColor: theme.mist, background: '#fff', color: theme.ink }}
          >
            <Locate size={14} color={theme.inkSoft} />
            <span>{pinLocating ? 'Locating…' : 'Use my location'}</span>
          </button>
          <div className="text-xs mt-1" style={{ color: theme.inkSoft }}>
            {form.lat != null && form.lng != null
              ? <>Pin: {form.lat.toFixed(5)}, {form.lng.toFixed(5)} — drag to correct</>
              : <>Tap the map, drag a pin, or use “Use my location.” Left unset, we'll try to guess from the text.</>}
          </div>
        </div>
        <Field label="Expires in (minutes)" value={form.minutes} onChange={(v) => setForm({ ...form, minutes: v })} placeholder="e.g. 30" icon={<Clock size={14} />} autoFilled={scanState === 'done'} type="number" />
        <Field label="Organization (optional)" value={form.organization} onChange={(v) => setForm({ ...form, organization: v })} placeholder="e.g. Sponsors for Educational Opportunity" icon={<Users size={14} />} autoFilled={scanState === 'done' && !!form.organization} />
        <Field label="Tag (optional)" value={form.tag} onChange={(v) => setForm({ ...form, tag: v })} placeholder="e.g. pizza, halal, vegan" icon={<Tag size={14} />} />
      </div>

      <button
        onClick={submitPost}
        disabled={!form.title.trim() || !form.location.trim()}
        className="w-full rounded-xl py-3 mt-6 font-semibold ff-body text-sm disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
        style={{ background: theme.marigold, color: '#fff' }}
      >
        Post sighting
      </button>
    </>
  );

  return (
    <div className="h-screen w-full flex justify-center overflow-hidden" style={{ background: theme.mist }}>
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

      <VisitReturnPrompt onReact={me ? reactToPost : null} />

      {/* Mobile shell (phone frame). Visible below md: breakpoint. */}
      <div className="ff-body w-full sm:max-w-sm h-screen flex flex-col sm:border-x md:hidden" style={{ background: theme.paper, borderColor: theme.mist }}>
        {me && !me.school_id ? (
          <OnboardingScreen setMe={setMe} />
        ) : me && firstAlertChecked && !firstAlertDone ? (
          <FirstAlertScreen me={me} onDone={() => setFirstAlertDone(true)} />
        ) : (<>
        <header
          className="flex items-center gap-3 px-4 py-4 border-b shrink-0"
          style={{ borderColor: theme.mist, background: me?.school ? theme.marigoldSoft : undefined }}
        >
          {screen === 'post' ? (
            <button onClick={() => setScreen('home')} className="p-1 -ml-1 rounded-full active:opacity-60" aria-label="Back">
              <ArrowLeft size={22} color={theme.ink} />
            </button>
          ) : (
            <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: theme.marigold }}>
              <span className="ff-display text-white text-sm font-bold">FF</span>
            </div>
          )}
          <h1 className="ff-display text-lg font-semibold flex-1" style={{ color: theme.ink }}>{titles[screen]}</h1>
          {me?.school && screen !== 'post' && (
            <img
              src={me.school.logo_path}
              alt={me.school.short_name}
              title={me.school.short_name}
              className="w-8 h-8 rounded-lg shrink-0"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          )}
          {me && !me.school && screen !== 'post' && (
            <span className="text-xs truncate max-w-[10rem]" style={{ color: theme.inkSoft }} title={me.email}>
              {me.name || me.email}
            </span>
          )}
        </header>

        {screen === 'home' && (
          <main className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {renderFeedContent('stack')}
          </main>
        )}

        {screen === 'post' && (
          <main className="flex-1 overflow-y-auto px-4 py-4">
            {renderComposer()}
          </main>
        )}

        {screen === 'map' && <MapScreen me={me} />}
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
            onReact={me ? reactToPost : null}
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
            onReact={me ? reactToPost : null}
            onClose={closeModal}
          />
        )}

        {screen !== 'post' && (
          <nav className="flex items-center justify-between px-6 py-2 border-t shrink-0" style={{ borderColor: theme.mist }}>
            <NavButton icon={<Home size={20} />} active={screen === 'home'} onClick={() => setScreen('home')} label="Home" />
            <NavButton icon={<Map size={20} />} active={screen === 'map'} onClick={() => setScreen('map')} label="Map" />
            <button
              onClick={startPost}
              className="w-12 h-12 rounded-full flex items-center justify-center -mt-6 shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              style={{ background: theme.marigold }}
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
              <Bell size={20} color={screen === 'alerts' ? theme.marigold : theme.inkSoft} />
              {unreadCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 text-[10px] font-bold rounded-full flex items-center justify-center"
                  style={{
                    background: theme.alert,
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
        </>)}
      </div>

      {/* Desktop shell. Visible at md: (≥768px) and up. */}
      <div className="ff-body hidden md:flex w-full h-screen flex-col" style={{ background: theme.paper }}>
        {me && !me.school_id ? (
          <div className="flex-1 flex justify-center overflow-y-auto">
            <div className="w-full max-w-lg">
              <OnboardingScreen setMe={setMe} />
            </div>
          </div>
        ) : me && firstAlertChecked && !firstAlertDone ? (
          <div className="flex-1 flex justify-center overflow-y-auto">
            <div className="w-full max-w-lg">
              <FirstAlertScreen me={me} onDone={() => setFirstAlertDone(true)} />
            </div>
          </div>
        ) : (
          <DesktopShell
            me={me}
            setMe={setMe}
            screen={screen}
            setScreen={setScreen}
            titles={titles}
            unreadCount={unreadCount}
            posts={posts}
            savedPosts={savedPosts}
            savedIds={savedIds}
            toggleSave={toggleSave}
            reactToPost={reactToPost}
            notifs={notifs}
            setNotifs={setNotifs}
            focusPost={focusPost}
            openPost={openPost}
            renderFeedContent={renderFeedContent}
            renderComposer={renderComposer}
            startPost={startPost}
            modalPost={modalPost}
            deepLinkPostId={deepLinkPostId}
            closeModal={closeModal}
          />
        )}
      </div>
    </div>
  );
}

function VisitReturnPrompt({ onReact }) {
  useEffect(() => {
    if (!onReact) return;
    let shown = false;

    const check = async () => {
      if (shown) return;
      if (document.visibilityState !== 'visible') return;
      let raw;
      try { raw = sessionStorage.getItem('ff_visited_post'); } catch { return; }
      if (!raw) return;
      const [pidStr, tsStr] = raw.split('|');
      const pid = parseInt(pidStr, 10);
      const ts = parseInt(tsStr, 10);
      if (!pid || !ts) { sessionStorage.removeItem('ff_visited_post'); return; }
      const ageMin = (Date.now() - ts) / 60_000;
      if (ageMin < 3) return;
      if (ageMin > 90) { sessionStorage.removeItem('ff_visited_post'); return; }

      let post;
      try { post = await api(`/api/posts/${pid}`); }
      catch { sessionStorage.removeItem('ff_visited_post'); return; }
      if (shown) return;
      shown = true;
      sessionStorage.removeItem('ff_visited_post');

      const respond = (kind) => {
        toast.dismiss(toastId);
        onReact(post, kind);
      };
      const toastId = toast(`Was the food still there? "${post.title}"`, {
        duration: 20_000,
        action: {
          label: 'Yes, still there',
          onClick: () => respond('still'),
        },
        cancel: {
          label: 'Nope, gone',
          onClick: () => respond('gone'),
        },
      });
    };

    const onVisibility = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', onVisibility);
    check();
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [onReact]);
  return null;
}

function DesktopShell({
  me, setMe, screen, setScreen, titles, unreadCount,
  posts, savedPosts, savedIds, toggleSave, reactToPost,
  notifs, setNotifs, focusPost, openPost,
  renderFeedContent, renderComposer, startPost,
  modalPost, deepLinkPostId, closeModal,
}) {
  const theme = useTheme();
  const showRightRail = screen === 'home' && me?.school_id;

  return (
    <>
      <DesktopTopBar me={me} />
      <div className="flex-1 flex overflow-hidden min-h-0">
        <DesktopSidebar
          screen={screen}
          setScreen={setScreen}
          unreadCount={unreadCount}
          startPost={startPost}
        />

        {/* Main column */}
        <main className="flex-1 overflow-hidden flex flex-col min-w-0">
          {screen === 'map' ? (
            <MapScreen me={me} />
          ) : (
            <div className="flex-1 overflow-y-auto">
              <div
                className={
                  screen === 'home'
                    ? 'mx-auto w-full max-w-3xl px-6 py-6 space-y-4'
                    : screen === 'post'
                      ? 'mx-auto w-full max-w-lg px-6 py-8'
                      : 'mx-auto w-full max-w-lg px-6 py-6'
                }
              >
                {screen === 'home' && renderFeedContent('grid')}
                {screen === 'post' && (
                  <>
                    <h1 className="ff-display text-2xl font-semibold mb-6" style={{ color: theme.ink }}>
                      New sighting
                    </h1>
                    {renderComposer()}
                  </>
                )}
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
                    onReact={me ? reactToPost : null}
                    notifs={notifs}
                    posts={posts}
                    openPost={openPost}
                  />
                )}
              </div>
            </div>
          )}
        </main>

        {showRightRail && (
          <aside className="hidden lg:flex flex-col w-[300px] shrink-0 border-l overflow-y-auto" style={{ borderColor: theme.mist }}>
            <div className="p-4 space-y-4">
              <LiveActivityCard posts={posts} />
              <MiniMap me={me} posts={posts} onClick={() => setScreen('map')} />
              <YourAlertsCard notifs={notifs} onClick={() => setScreen('alerts')} />
            </div>
          </aside>
        )}
      </div>

      {deepLinkPostId && modalPost && (
        <PostModal
          post={modalPost}
          saved={savedIds.has(modalPost.id)}
          onSaveToggle={me ? toggleSave : null}
          onReact={me ? reactToPost : null}
          onClose={closeModal}
        />
      )}
    </>
  );
}

function DesktopTopBar({ me }) {
  const theme = useTheme();
  return (
    <header
      className="flex items-center gap-4 px-6 h-14 border-b shrink-0"
      style={{ borderColor: theme.mist, background: '#fff' }}
    >
      <div className="flex items-center gap-2">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: theme.marigold }}>
          <span className="ff-display text-white text-sm font-bold">FF</span>
        </div>
        <span className="ff-display text-base font-semibold" style={{ color: theme.ink }}>FoodFeed</span>
      </div>
      {me?.school && (
        <div
          className="flex items-center gap-2 rounded-full border px-3 py-1"
          style={{ borderColor: theme.mist, background: theme.marigoldSoft }}
        >
          <img
            src={me.school.logo_path}
            alt=""
            className="w-4 h-4 rounded"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
          <span className="text-xs font-medium" style={{ color: theme.ink }}>
            {me.school.short_name}
          </span>
        </div>
      )}
      <div className="flex-1" />
      {me && (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: theme.marigoldSoft }}>
            <User size={16} color={theme.marigoldDark} />
          </div>
          <span className="text-xs truncate max-w-[10rem]" style={{ color: theme.ink }} title={me.email}>
            {me.name || me.email}
          </span>
        </div>
      )}
    </header>
  );
}

function DesktopSidebar({ screen, setScreen, unreadCount, startPost }) {
  const theme = useTheme();
  const items = [
    { key: 'home', label: 'Home', icon: Home },
    { key: 'map', label: 'Map', icon: Map },
    { key: 'post', label: 'Post', icon: Plus },
    { key: 'alerts', label: 'Alerts', icon: Bell, badge: unreadCount },
    { key: 'profile', label: 'Profile', icon: User },
  ];
  return (
    <nav className="hidden md:flex flex-col w-[220px] shrink-0 border-r py-4 px-3 gap-1 overflow-y-auto" style={{ borderColor: theme.mist, background: '#fff' }}>
      <button
        onClick={startPost}
        className="mb-3 flex items-center gap-2 justify-center rounded-xl py-2.5 font-semibold text-sm shadow-sm"
        style={{ background: theme.marigold, color: '#fff' }}
      >
        <Plus size={16} />
        New sighting
      </button>
      {items.map((it) => {
        const active = screen === it.key;
        const Icon = it.icon;
        return (
          <button
            key={it.key}
            onClick={() => setScreen(it.key)}
            aria-pressed={active}
            className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-left transition"
            style={{
              background: active ? theme.marigoldSoft : 'transparent',
              color: active ? theme.marigoldDark : theme.ink,
              fontWeight: active ? 600 : 500,
            }}
          >
            <Icon size={18} color={active ? theme.marigoldDark : theme.inkSoft} />
            <span className="flex-1">{it.label}</span>
            {it.badge > 0 && (
              <span
                className="text-[10px] font-bold rounded-full flex items-center justify-center px-1.5"
                style={{ background: theme.alert, color: '#fff', minWidth: 18, height: 18 }}
              >
                {it.badge > 9 ? '9+' : it.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}

function LiveActivityCard({ posts }) {
  const theme = useTheme();
  const recent = (posts || []).slice(0, 5);
  const hourCount = (posts || []).filter((p) => p.minutesLeft > 0).length;
  return (
    <div className="rounded-2xl border p-4" style={{ background: theme.card, borderColor: theme.mist }}>
      <h3 className="ff-display text-sm font-semibold mb-2" style={{ color: theme.ink }}>Live activity</h3>
      <p className="text-xs mb-3" style={{ color: theme.inkSoft }}>
        {hourCount === 0 ? 'No active sightings right now.' : `${hourCount} active sighting${hourCount === 1 ? '' : 's'}.`}
      </p>
      <ul className="space-y-2">
        {recent.length === 0 ? (
          <li className="text-xs" style={{ color: theme.inkSoft }}>Feed is quiet.</li>
        ) : recent.map((p) => (
          <li key={p.id} className="flex items-start justify-between gap-2 text-xs">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium" style={{ color: theme.ink }}>{p.title}</div>
              <div className="truncate" style={{ color: theme.inkSoft }}>{p.location}</div>
            </div>
            <span className="shrink-0 whitespace-nowrap font-medium" style={{ color: p.minutesLeft <= 15 ? theme.alert : theme.marigoldDark }}>
              {formatMinutes(p.minutesLeft)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MiniMap({ me, posts, onClick }) {
  const theme = useTheme();
  const center = me?.school ? [me.school.center_lat, me.school.center_lng] : WASHU_CENTER;
  const points = (posts || []).filter((p) => p.lat != null && p.lng != null).slice(0, 30);
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick?.(); }}
      className="rounded-2xl border overflow-hidden cursor-pointer relative"
      style={{ background: theme.card, borderColor: theme.mist, height: 200 }}
    >
      <MapContainer
        center={center}
        zoom={14}
        style={{ height: '100%', width: '100%', pointerEvents: 'none' }}
        dragging={false}
        zoomControl={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        touchZoom={false}
        keyboard={false}
        attributionControl={false}
      >
        <TileLayer url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
        {points.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={buildMarkerIcon(p.minutesLeft <= 15, theme.marigold)}
            interactive={false}
          />
        ))}
      </MapContainer>
      <div
        className="absolute inset-x-0 bottom-0 px-3 py-2 text-xs font-medium flex items-center justify-between"
        style={{ background: 'rgba(255,255,255,0.9)', color: theme.ink, borderTop: `1px solid ${theme.mist}` }}
      >
        <span>Campus map</span>
        <span className="underline" style={{ color: theme.marigoldDark }}>Open</span>
      </div>
    </div>
  );
}

function YourAlertsCard({ notifs, onClick }) {
  const theme = useTheme();
  const unread = (notifs || []).filter((n) => !n.read_at).length;
  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-2xl border p-4 hover:opacity-90 transition"
      style={{ background: theme.card, borderColor: theme.mist }}
    >
      <h3 className="ff-display text-sm font-semibold mb-1 flex items-center gap-2" style={{ color: theme.ink }}>
        <Bell size={14} />
        Your alerts
      </h3>
      <p className="text-xs" style={{ color: theme.inkSoft }}>
        {unread > 0
          ? `${unread} unread match${unread === 1 ? '' : 'es'} — tap to review.`
          : (notifs?.length ? 'No unread matches right now.' : 'Set up an alert to get notified when food nearby appears.')}
      </p>
    </button>
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
          background: DEFAULT_THEME.paper,
          color: DEFAULT_THEME.ink,
          fontFamily: 'Inter, sans-serif',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 56, height: 56, borderRadius: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: DEFAULT_THEME.marigoldSoft, marginBottom: 16,
          }}
        >
          <Sparkles size={24} color={DEFAULT_THEME.marigoldDark} />
        </div>
        <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
          Something broke
        </h1>
        <p style={{ fontSize: 14, color: DEFAULT_THEME.inkSoft, maxWidth: 320, marginBottom: 20 }}>
          The app hit an unexpected error. Reloading usually fixes it.
        </p>
        <button
          onClick={this.reset}
          style={{
            padding: '10px 20px', borderRadius: 12,
            background: DEFAULT_THEME.marigold, color: '#fff',
            fontWeight: 600, fontSize: 14, border: 'none', cursor: 'pointer',
          }}
        >
          Reload
        </button>
      </div>
    );
  }
}
