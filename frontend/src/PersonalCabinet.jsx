import React, { useEffect, useState } from "react";
import {
  MapPin,
  Users,
  Wallet,
  Eye,
  Pencil,
  RefreshCw,
  Trash2,
  Plus,
  Compass,
  X,
} from "lucide-react";
import AuthPage from "./AuthPage";
import { deleteTrip, getTrips, normalizeTrip, regenerateTrip } from "./api.js";

const COLORS = {
  paper: "#F3F0E4",
  paperDark: "#E9E4D2",
  ink: "#1F2A28",
  inkSoft: "#5B655F",
  petrol: "#2B6E6E",
  petrolDark: "#1C4B4B",
  rust: "#B5502E",
  mustard: "#CE9A3E",
  line: "#C7C0A6",
  paperEdge: "#DAD4BE",
  warn: "#A8432A",
};

const STATUS_META = {
  ready: { label: "Готово", color: COLORS.petrol },
  draft: { label: "Черновик", color: COLORS.inkSoft },
  generating: { label: "Собирается", color: COLORS.mustard },
};



function TicketCode({ code }) {
  return (
    <span
      className="fr-mono"
      style={{ fontSize: 12, letterSpacing: "0.08em", color: COLORS.petrol, fontWeight: 500 }}
    >
      {code}
    </span>
  );
}

function ConfirmDeleteModal({ trip, onCancel, onConfirm }) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(31,42,40,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: 20,
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: COLORS.paper,
          border: `1px solid ${COLORS.paperEdge}`,
          borderRadius: 4,
          padding: 24,
          maxWidth: 360,
          width: "100%",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
          <h3 className="fr-display" style={{ fontSize: 19, fontWeight: 500 }}>
            Удалить путешествие?
          </h3>
          <button onClick={onCancel} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.inkSoft }}>
            <X size={18} />
          </button>
        </div>
        <p style={{ fontSize: 13.5, color: COLORS.inkSoft, lineHeight: 1.5, marginBottom: 20 }}>
          «{trip.city}», {trip.dateRange} — маршрут и все сохранённые изменения будут удалены без возможности восстановления.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{
              background: "transparent",
              border: `1px solid ${COLORS.line}`,
              borderRadius: 3,
              padding: "8px 14px",
              fontSize: 13,
              cursor: "pointer",
              color: COLORS.ink,
            }}
          >
            Отмена
          </button>
          <button
            onClick={onConfirm}
            style={{
              background: COLORS.warn,
              border: "none",
              borderRadius: 3,
              padding: "8px 14px",
              fontSize: 13,
              cursor: "pointer",
              color: COLORS.paper,
            }}
          >
            Удалить
          </button>
        </div>
      </div>
    </div>
  );
}

function TripCard({ trip, onOpen, onEdit, onDelete, onRegenerate }) {
  const status = STATUS_META[trip.status];
  const [regenerating, setRegenerating] = useState(false);

  const handleRegenerate = () => {
    setRegenerating(true);
    setTimeout(() => {
      setRegenerating(false);
      onRegenerate(trip.id);
    }, 1100);
  };

  return (
    <div
      style={{
        background: COLORS.paperDark,
        border: `1px solid ${COLORS.paperEdge}`,
        borderRadius: 4,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "13px 18px",
          borderBottom: `1px dashed ${COLORS.line}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Compass size={14} color={COLORS.petrol} strokeWidth={1.75} />
          <TicketCode code={trip.code} />
        </div>
        <span
          className="fr-mono"
          style={{
            fontSize: 10.5,
            letterSpacing: "0.05em",
            color: status.color,
            border: `1px solid ${status.color}`,
            borderRadius: 999,
            padding: "2px 9px",
          }}
        >
          {regenerating ? "ПЕРЕСОБИРАЕМ…" : status.label.toUpperCase()}
        </span>
      </div>

      <div style={{ padding: "18px 18px 14px" }}>
        <h3 className="fr-display" style={{ fontSize: 22, fontWeight: 500, marginBottom: 10 }}>
          {trip.city}
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: COLORS.inkSoft }}>
            <MapPin size={13} /> {trip.dateRange}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: COLORS.inkSoft }}>
            <Users size={13} /> {trip.travelers} {trip.travelers === 1 ? "путешественник" : "путешественника"}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: COLORS.inkSoft }}>
            <Wallet size={13} /> {trip.budget.toLocaleString("ru-RU")} ₽
          </div>
        </div>
      </div>

      <div
        style={{
          borderTop: `1px dashed ${COLORS.line}`,
          padding: "10px 10px",
          display: "flex",
          justifyContent: "space-around",
        }}
      >
        {[
          { Icon: Eye, label: "Открыть", action: () => onOpen(trip.id) },
          { Icon: Pencil, label: "Изменить", action: () => onEdit(trip.id) },
          { Icon: RefreshCw, label: "Собрать заново", action: handleRegenerate, spin: regenerating },
          { Icon: Trash2, label: "Удалить", action: () => onDelete(trip), danger: true },
        ].map(({ Icon, label, action, spin, danger }) => (
          <button
            key={label}
            onClick={action}
            title={label}
            aria-label={label}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: danger ? COLORS.warn : COLORS.inkSoft,
              padding: 8,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon size={16} strokeWidth={1.75} style={spin ? { animation: "spin 1s linear infinite" } : undefined} />
          </button>
        ))}
      </div>
    </div>
  );
}

function NewTripCard({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1.5px dashed ${COLORS.line}`,
        borderRadius: 4,
        background: "transparent",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "40px 18px",
        cursor: "pointer",
        color: COLORS.inkSoft,
        minHeight: 220,
      }}
    >
      <Plus size={22} strokeWidth={1.5} />
      <span style={{ fontSize: 13.5 }}>Новое путешествие</span>
    </button>
  );
}


export default function PersonalCabinet({ trips, setTrips, user, onAuthenticated, onOpen, onEdit, onNewTrip }) {
  const [pendingDelete, setPendingDelete] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    getTrips()
      .then((items) => setTrips(items.map(normalizeTrip)))
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, [user, setTrips]);

  if (!user) {
    return <AuthPage onAuthenticated={onAuthenticated} />;
  }

  const handleLogout = () => {
    localStorage.removeItem("tripPlannerUser");
    onAuthenticated(null);
  };

  const confirmDelete = async () => {
    try {
      await deleteTrip(pendingDelete.id);
      setTrips((prev) => prev.filter((t) => t.id !== pendingDelete.id));
      setPendingDelete(null);
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  const handleRegenerate = async (id) => {
    try {
      await regenerateTrip(id);
      setTrips((prev) => prev.map((t) => (t.id === id ? { ...t, status: "generating" } : t)));
    } catch (requestError) {
      setError(requestError.message);
    }
  };

  return (
    <div
      style={{
        minHeight: "100%",
        background: COLORS.paper,
        color: COLORS.ink,
        fontFamily: "'IBM Plex Sans', sans-serif",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        .fr-display { font-family: 'Fraunces', serif; }
        .fr-mono { font-family: 'IBM Plex Mono', monospace; }
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>

      <div className="max-w-5xl mx-auto px-6 py-10 md:py-14">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 8 }}>
          <div className="fr-mono" style={{ fontSize: 12, color: COLORS.inkSoft, letterSpacing: "0.06em" }}>
            Личный кабинет
          </div>
          <button
            type="button"
            onClick={handleLogout}
            style={{
              background: "transparent",
              color: COLORS.inkSoft,
              border: `1px solid ${COLORS.line}`,
              borderRadius: 3,
              padding: "7px 12px",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Выйти
          </button>
        </div>
        <h1 className="fr-display" style={{ fontSize: "clamp(1.8rem, 3.4vw, 2.5rem)", fontWeight: 500, marginBottom: 28 }}>
          Ваши путешествия
        </h1>

        {error && <p style={{ color: COLORS.warn, fontSize: 13, marginBottom: 16 }}>{error}</p>}

        {loading ? (
          <p style={{ color: COLORS.inkSoft, fontSize: 14 }}>Загружаем путешествия…</p>
        ) : trips.length === 0 ? (
          <div
            style={{
              border: `1.5px dashed ${COLORS.line}`,
              borderRadius: 4,
              padding: "60px 24px",
              textAlign: "center",
              color: COLORS.inkSoft,
            }}
          >
            <Compass size={26} style={{ marginBottom: 12 }} />
            <p style={{ fontSize: 14.5, marginBottom: 4, color: COLORS.ink }}>Пока ни одного путешествия</p>
            <p style={{ fontSize: 13 }}>Создайте первый маршрут — он появится здесь.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {trips.map((trip) => (
              <TripCard key={trip.id} trip={trip} onOpen={onOpen} onEdit={onEdit} onDelete={setPendingDelete} onRegenerate={handleRegenerate} />
            ))}
            <NewTripCard onClick={onNewTrip} />
          </div>
        )}
      </div>

      {pendingDelete && (
        <ConfirmDeleteModal
          trip={pendingDelete}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      )}
    </div>
  );
}


