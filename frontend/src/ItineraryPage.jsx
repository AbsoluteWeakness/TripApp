import React, { useState, useMemo, useRef, useEffect } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  MapPin,
  Wallet,
  GripVertical,
  ArrowRight,
  Clock,
  Landmark,
  Building2,
  Palette,
  UtensilsCrossed,
  TreePine,
  ShoppingBag,
  ChevronLeft,
  RefreshCw,
  ExternalLink,
  Trash2,
} from "lucide-react";
import {
  getTrip,
  getPlaceAlternatives,
  normalizeDay,
  normalizeTrip,
  optimizeBudget,
  regenerateDay,
  removeActivity,
  reorderActivities,
  sendAssistantRequest,
  updateActivity,
} from "./api.js";

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

const CATEGORY_META = {
  history: { label: "История", Icon: Landmark },
  architecture: { label: "Архитектура", Icon: Building2 },
  culture: { label: "Культура", Icon: Palette },
  food: { label: "Еда", Icon: UtensilsCrossed },
  nature: { label: "Природа", Icon: TreePine },
  shopping: { label: "Шопинг", Icon: ShoppingBag },
};

const TRIP = {
  city: "Лиссабон",
  dateRange: "12–15 июня",
  travelers: 2,
  budget: 30000,
};

const INITIAL_DAYS = [
  {
    id: "d1",
    label: "День 1",
    date: "12 июня",
    activities: [
      { id: "a1", name: "Завтрак в Time Out Market", category: "food", duration: 45, cost: 800, travelNext: 12 },
      { id: "a2", name: "Torre de Belém", category: "history", duration: 90, cost: 600, travelNext: 15 },
      { id: "a3", name: "Mosteiro dos Jerónimos", category: "architecture", duration: 75, cost: 500, travelNext: 10 },
      { id: "a4", name: "Pastéis de Belém", category: "food", duration: 40, cost: 450, travelNext: 20 },
      { id: "a5", name: "Прогулка по LX Factory", category: "culture", duration: 100, cost: 0, travelNext: 18 },
      { id: "a6", name: "Ужин в A Cevicheria", category: "food", duration: 90, cost: 1800, travelNext: 0 },
    ],
  },
  {
    id: "d2",
    label: "День 2",
    date: "13 июня",
    activities: [
      { id: "b1", name: "Утро в Алфаме", category: "culture", duration: 80, cost: 0, travelNext: 10 },
      { id: "b2", name: "Castelo de São Jorge", category: "history", duration: 100, cost: 350, travelNext: 15 },
      { id: "b3", name: "Смотровая Portas do Sol", category: "nature", duration: 30, cost: 0, travelNext: 12 },
      { id: "b4", name: "Обед в Ó Balcão", category: "food", duration: 55, cost: 900, travelNext: 20 },
      { id: "b5", name: "Feira da Ladra (блошиный рынок)", category: "shopping", duration: 70, cost: 300, travelNext: 0 },
    ],
  },
  {
    id: "d3",
    label: "День 3",
    date: "14 июня",
    activities: [
      { id: "c1", name: "Парк Эдуарда VII", category: "nature", duration: 50, cost: 0, travelNext: 14 },
      { id: "c2", name: "Gulbenkian Museum", category: "culture", duration: 110, cost: 700, travelNext: 16 },
      { id: "c3", name: "Обед на Avenida da Liberdade", category: "food", duration: 60, cost: 850, travelNext: 10 },
      { id: "c4", name: "Шопинг в Chiado", category: "shopping", duration: 90, cost: 1200, travelNext: 12 },
      { id: "c5", name: "Закат на Elevador de Santa Justa", category: "architecture", duration: 40, cost: 350, travelNext: 0 },
    ],
  },
];

function computeSchedule(activities, dayStart = "09:00") {
  const [h, m] = dayStart.split(":").map(Number);
  let cursor = h * 60 + m;
  return activities.map((a) => {
    const start = cursor;
    const end = start + a.duration;
    cursor = end + a.travelNext;
    return { ...a, start, end };
  });
}

function fmt(mins) {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function yandexPlaceUrl(activity) {
  if (!Number.isFinite(activity?.latitude) || !Number.isFinite(activity?.longitude)) return "";
  return `https://yandex.ru/maps/?ll=${activity.longitude}%2C${activity.latitude}&z=16&pt=${activity.longitude}%2C${activity.latitude}%2Cpm2rdm`;
}

function yandexRouteUrl(activities) {
  const points = activities
    .filter((activity) => Number.isFinite(activity.latitude) && Number.isFinite(activity.longitude))
    .map((activity) => `${activity.latitude},${activity.longitude}`);
  return points.length >= 2
    ? `https://yandex.ru/maps/?rtext=${points.join('~')}&rtt=auto`
    : "";
}

function yandexWidgetUrl(activity) {
  if (!Number.isFinite(activity?.latitude) || !Number.isFinite(activity?.longitude)) return "";
  const point = `${activity.longitude},${activity.latitude}`;
  return `https://yandex.ru/map-widget/v1/?ll=${encodeURIComponent(point)}&z=15&pt=${encodeURIComponent(`${point},pm2rdm`)}`;
}

function RouteMap({ activities, selectedActivity, onSelect }) {
  const mapContainerRef = useRef(null);

  useEffect(() => {
    const mappedActivities = activities.filter(
      (activity) => Number.isFinite(activity.latitude) && Number.isFinite(activity.longitude),
    );
    if (!mapContainerRef.current || mappedActivities.length === 0) return undefined;

    const map = L.map(mapContainerRef.current, {
      scrollWheelZoom: false,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    const points = mappedActivities.map((activity) => [activity.latitude, activity.longitude]);
    L.polyline(points, {
      color: COLORS.petrol,
      weight: 4,
      opacity: 0.8,
    }).addTo(map);

    mappedActivities.forEach((activity, index) => {
      const isSelected = selectedActivity?.id === activity.id;
      const icon = L.divIcon({
        className: "route-marker-wrapper",
        html: `<span class="route-marker${isSelected ? " route-marker-selected" : ""}">${index + 1}</span>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      L.marker([activity.latitude, activity.longitude], { icon })
        .addTo(map)
        .bindTooltip(`${index + 1}. ${activity.name}`)
        .on("click", () => onSelect(activity.id));
    });

    if (points.length === 1) {
      map.setView(points[0], 14);
    } else {
      map.fitBounds(points, { padding: [24, 24], maxZoom: 14 });
    }

    return () => map.remove();
  }, [activities, onSelect, selectedActivity?.id]);

  return (
    <div
      style={{
        background: COLORS.paperDark,
        border: `1px solid ${COLORS.paperEdge}`,
        borderRadius: 4,
        padding: "18px 16px",
        position: "sticky",
        top: 16,
      }}
    >
      <div
        className="fr-mono"
        style={{ fontSize: 11, color: COLORS.inkSoft, letterSpacing: "0.05em", marginBottom: 10 }}
      >
        СХЕМА МАРШРУТА
      </div>
      {activities.some((activity) => Number.isFinite(activity.latitude) && Number.isFinite(activity.longitude)) ? (
        <div ref={mapContainerRef} style={{ height: 340, borderRadius: 3, overflow: "hidden" }} />
      ) : (
        <div style={{ height: 340, display: "grid", placeItems: "center", color: COLORS.inkSoft, fontSize: 13, textAlign: "center", padding: 20 }}>
          Координаты мест пока недоступны
        </div>
      )}
      <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 5 }}>
        {activities.map((a, i) => (
          <button
            key={a.id}
            type="button"
            onClick={() => onSelect(a.id)}
            style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: COLORS.inkSoft, border: 0, background: "none", padding: 0, textAlign: "left", cursor: "pointer" }}
          >
            <span
              className="fr-mono"
              style={{
                width: 16,
                height: 16,
                borderRadius: "50%",
                border: `1px solid ${COLORS.line}`,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 9.5,
                flexShrink: 0,
              }}
            >
              {i + 1}
            </span>
            <span style={{ color: COLORS.ink }}>{a.name}</span>
          </button>
        ))}
      </div>
      {yandexWidgetUrl(selectedActivity || activities[0]) && (
        <iframe
          title="Карта выбранного места"
          src={yandexWidgetUrl(selectedActivity || activities[0])}
          style={{ width: "100%", height: 220, border: 0, marginTop: 14, borderRadius: 3 }}
          loading="lazy"
        />
      )}
    </div>
  );
}

export default function ItineraryPage({ onBack, trip } = {}) {
  const [days, setDays] = useState(() => trip?.days?.length ? trip.days : INITIAL_DAYS);
  const [activeDay, setActiveDay] = useState(0);
  const [selectedActivityId, setSelectedActivityId] = useState(null);
  const [justReordered, setJustReordered] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState("");
  const [alternatives, setAlternatives] = useState([]);
  const [alternativesLoading, setAlternativesLoading] = useState(false);
  const [budgetOptimizing, setBudgetOptimizing] = useState(false);
  const [budgetMessage, setBudgetMessage] = useState("");
  const [dayRegenerating, setDayRegenerating] = useState(false);
  const [assistantMessage, setAssistantMessage] = useState("");
  const [assistantReply, setAssistantReply] = useState("");
  const [assistantPending, setAssistantPending] = useState(false);
  const dragIndex = useRef(null);
  const reorderTimeout = useRef(null);

  useEffect(() => {
    setDays(trip?.days?.length ? trip.days : INITIAL_DAYS);
    setActiveDay(0);
  }, [trip?.id]);

  const currentDay = days[activeDay];
  const schedule = useMemo(() => computeSchedule(currentDay.activities), [currentDay]);
  const selectedActivity = schedule.find((activity) => activity.id === selectedActivityId) || schedule[0] || null;

  const tripInfo = { ...TRIP, ...trip };

  const allActivities = days.flatMap((d) => d.activities);
  const estimatedSpend = allActivities.reduce((sum, a) => sum + a.cost, 0);
  const remaining = tripInfo.budget - estimatedSpend;
  const overBudget = remaining < 0;
  const spendRatio = Math.min(1, estimatedSpend / tripInfo.budget);

  const handleDragStart = (index) => {
    dragIndex.current = index;
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (index) => {
    const from = dragIndex.current;
    if (from === null || from === index) return;
    const reorderedActivityIds = [...currentDay.activities];
    const [movedActivity] = reorderedActivityIds.splice(from, 1);
    reorderedActivityIds.splice(index, 0, movedActivity);
    setDays((prev) => {
      const next = prev.map((d) => ({ ...d, activities: [...d.activities] }));
      const list = next[activeDay].activities;
      const [moved] = list.splice(from, 1);
      list.splice(index, 0, moved);
      return next;
    });
    if (trip?.id && currentDay.id && reorderedActivityIds.every((activity) => activity?.id)) {
      reorderActivities(trip.id, currentDay.id, reorderedActivityIds.map((activity) => activity.id)).catch(() => undefined);
    }
    dragIndex.current = null;
    setJustReordered(true);
    clearTimeout(reorderTimeout.current);
    reorderTimeout.current = setTimeout(() => setJustReordered(false), 1600);
  };

  const handleRemoveActivity = async () => {
    if (!trip?.id || !currentDay?.id || !selectedActivity?.id || actionPending) return;
    if (!window.confirm(`Удалить «${selectedActivity.name}» из маршрута?`)) return;

    setActionPending(true);
    setActionError("");
    try {
      const updatedDay = normalizeDay(
        await removeActivity(trip.id, currentDay.id, selectedActivity.id),
      );
      setDays((prev) => prev.map((day) => (day.id === updatedDay.id ? updatedDay : day)));
      setSelectedActivityId(null);
      setJustReordered(true);
      clearTimeout(reorderTimeout.current);
      reorderTimeout.current = setTimeout(() => setJustReordered(false), 1600);
    } catch (requestError) {
      setActionError(requestError.message);
    } finally {
      setActionPending(false);
    }
  };

  const handleFindAlternatives = async () => {
    if (!trip?.id || !selectedActivity || alternativesLoading) return;
    setAlternativesLoading(true);
    setActionError("");
    try {
      const places = await getPlaceAlternatives(trip.id, selectedActivity.category.toUpperCase());
      setAlternatives(places.filter((place) => place.id !== selectedActivity.placeId));
    } catch (requestError) {
      setActionError(requestError.message);
    } finally {
      setAlternativesLoading(false);
    }
  };

  const handleReplaceActivity = async (placeId) => {
    if (!trip?.id || !currentDay?.id || !selectedActivity?.id || actionPending) return;
    setActionPending(true);
    setActionError("");
    try {
      const updatedDay = normalizeDay(await updateActivity(trip.id, selectedActivity.id, placeId));
      setDays((prev) => prev.map((day) => (day.id === updatedDay.id ? updatedDay : day)));
      setAlternatives([]);
      setJustReordered(true);
      clearTimeout(reorderTimeout.current);
      reorderTimeout.current = setTimeout(() => setJustReordered(false), 1600);
    } catch (requestError) {
      setActionError(requestError.message);
    } finally {
      setActionPending(false);
    }
  };

  const handleOptimizeBudget = async () => {
    if (!trip?.id || budgetOptimizing) return;
    setBudgetOptimizing(true);
    setBudgetMessage("");
    try {
      const result = await optimizeBudget(trip.id);
      if (result.trip?.days) {
        setDays(result.trip.days.map(normalizeDay));
      }
      setBudgetMessage(
        result.changed > 0
          ? `Заменено активностей: ${result.changed}`
          : "Более дешёвых альтернатив с ценами не найдено",
      );
    } catch (requestError) {
      setBudgetMessage(requestError.message);
    } finally {
      setBudgetOptimizing(false);
    }
  };

  const handleRegenerateDay = async () => {
    if (!trip?.id || !currentDay?.id || dayRegenerating) return;
    setDayRegenerating(true);
    setActionError("");
    try {
      const updatedDay = normalizeDay(await regenerateDay(trip.id, currentDay.id));
      setDays((prev) => prev.map((day) => (day.id === updatedDay.id ? updatedDay : day)));
      setSelectedActivityId(null);
      setAlternatives([]);
      setJustReordered(true);
      clearTimeout(reorderTimeout.current);
      reorderTimeout.current = setTimeout(() => setJustReordered(false), 1600);
    } catch (requestError) {
      setActionError(requestError.message);
    } finally {
      setDayRegenerating(false);
    }
  };

  const handleAssistantSubmit = async (event) => {
    event.preventDefault();
    if (!trip?.id || !assistantMessage.trim() || assistantPending) return;
    setAssistantPending(true);
    setAssistantReply("");
    try {
      const result = await sendAssistantRequest(trip.id, assistantMessage.trim(), currentDay?.id);
      setAssistantReply(result.reply);
      if (result.applied) {
        const normalized = normalizeTrip(await getTrip(trip.id));
        setDays(normalized.days);
      }
      setAssistantMessage("");
    } catch (requestError) {
      setAssistantReply(requestError.message);
    } finally {
      setAssistantPending(false);
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
        .day-tab { transition: background 120ms ease, color 120ms ease, border-color 120ms ease; }
        .act-row { transition: box-shadow 150ms ease, opacity 150ms ease, transform 150ms ease; }
        .act-row.dragging { opacity: 0.4; }
        .route-marker-wrapper { background: transparent; border: 0; }
        .route-marker {
          display: grid;
          place-items: center;
          width: 28px;
          height: 28px;
          border: 2px solid ${COLORS.petrol};
          border-radius: 50%;
          background: ${COLORS.paper};
          color: ${COLORS.petrolDark};
          font: 500 11px 'IBM Plex Mono', monospace;
          box-sizing: border-box;
        }
        .route-marker-selected { background: ${COLORS.rust}; color: ${COLORS.paper}; }
        .flash { animation: flashBg 1.6s ease; }
        @keyframes flashBg {
          0% { background: rgba(43,110,110,0.12); }
          100% { background: transparent; }
        }
      `}</style>

      <div className="max-w-5xl mx-auto px-6 py-10 md:py-14">
        {/* top bar */}
        <button
          type="button"
          onClick={onBack}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            background: "none",
            border: "none",
            color: COLORS.inkSoft,
            fontSize: 13,
            marginBottom: 22,
            cursor: onBack ? "pointer" : "default",
            padding: 0,
          }}
        >
          <ChevronLeft size={15} /> К форме путешествия
        </button>

        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "flex-end", gap: 18, marginBottom: 26 }}>
          <div>
            <div className="fr-mono" style={{ fontSize: 12, color: COLORS.inkSoft, letterSpacing: "0.06em", marginBottom: 8 }}>
              <MapPin size={12} style={{ display: "inline", marginRight: 5, marginBottom: 1 }} />
              {tripInfo.dateRange} · {tripInfo.travelers} путешественника
            </div>
            <h1 className="fr-display" style={{ fontSize: "clamp(1.8rem, 3.4vw, 2.5rem)", fontWeight: 500 }}>
              {tripInfo.city}
            </h1>
          </div>

          {/* budget strip */}
          <div
            style={{
              background: COLORS.paperDark,
              border: `1px solid ${COLORS.paperEdge}`,
              borderRadius: 4,
              padding: "12px 18px",
              minWidth: 260,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 8 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5, color: COLORS.inkSoft }}>
                <Wallet size={13} /> Бюджет
              </span>
              <span className="fr-mono">{tripInfo.budget.toLocaleString("ru-RU")} ₽</span>
            </div>
            <div style={{ height: 5, borderRadius: 999, background: COLORS.line, overflow: "hidden", marginBottom: 8 }}>
              <div
                style={{
                  height: "100%",
                  width: `${spendRatio * 100}%`,
                  background: overBudget ? COLORS.warn : COLORS.petrol,
                }}
              />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
              <span style={{ color: COLORS.inkSoft }}>Потрачено: {estimatedSpend.toLocaleString("ru-RU")} ₽</span>
              <span style={{ color: overBudget ? COLORS.warn : COLORS.petrol }}>
                {overBudget ? "Перерасход " : "Осталось "}
                {Math.abs(remaining).toLocaleString("ru-RU")} ₽
              </span>
            </div>
          </div>
        </div>

        {/* day tabs */}
        <div style={{ display: "flex", gap: 8, marginBottom: 22, flexWrap: "wrap" }}>
          {days.map((d, i) => {
            const active = i === activeDay;
            return (
              <button
                key={d.id}
                type="button"
                onClick={() => setActiveDay(i)}
                className="day-tab"
                style={{
                  padding: "9px 16px",
                  borderRadius: 3,
                  border: `1px solid ${active ? COLORS.petrol : COLORS.line}`,
                  background: active ? COLORS.petrol : "transparent",
                  color: active ? COLORS.paper : COLORS.ink,
                  cursor: "pointer",
                  fontSize: 13.5,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 2,
                }}
              >
                <span>{d.label}</span>
                <span
                  className="fr-mono"
                  style={{ fontSize: 10.5, color: active ? "rgba(243,240,228,0.75)" : COLORS.inkSoft }}
                >
                  {d.date} · {d.activities.length} мест
                </span>
              </button>
            );
          })}
        </div>
        {trip?.id && currentDay && (
          <button
            type="button"
            onClick={handleRegenerateDay}
            disabled={dayRegenerating}
            style={{ display: "inline-flex", alignItems: "center", gap: 7, marginBottom: 22, border: `1px solid ${COLORS.line}`, borderRadius: 3, background: "transparent", color: COLORS.inkSoft, padding: "8px 11px", fontSize: 12.5, cursor: dayRegenerating ? "default" : "pointer", opacity: dayRegenerating ? 0.6 : 1 }}
          >
            <RefreshCw size={13} />
            {dayRegenerating ? "Пересобираем день…" : "Пересобрать этот день"}
          </button>
        )}

        {/* content grid */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-8">
          <div className="md:col-span-3">
            {justReordered && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                  fontSize: 12,
                  color: COLORS.petrol,
                  marginBottom: 10,
                }}
                className="fr-mono"
              >
                <RefreshCw size={12} /> маршрут, время и расходы пересчитаны
              </div>
            )}
            {actionError && (
              <div style={{ marginBottom: 10, color: COLORS.warn, fontSize: 12.5 }}>
                {actionError}
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {schedule.map((a, i) => {
                const meta = CATEGORY_META[a.category];
                const Icon = meta?.Icon || Landmark;
                return (
                  <React.Fragment key={a.id}>
                    <div
                      draggable
                      onClick={() => setSelectedActivityId(a.id)}
                      onDragStart={() => handleDragStart(i)}
                      onDragOver={handleDragOver}
                      onDrop={() => handleDrop(i)}
                      className={`act-row ${justReordered ? "flash" : ""}`}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        gap: 12,
                        background: selectedActivity?.id === a.id ? "rgba(43,110,110,0.08)" : COLORS.paperDark,
                        border: `1px solid ${selectedActivity?.id === a.id ? COLORS.petrol : COLORS.paperEdge}`,
                        borderRadius: 4,
                        padding: "13px 14px",
                        cursor: "pointer",
                      }}
                    >
                      <GripVertical size={16} color={COLORS.inkSoft} style={{ marginTop: 3, flexShrink: 0 }} />
                      <div
                        className="fr-mono"
                        style={{ fontSize: 12, color: COLORS.petrol, minWidth: 44, flexShrink: 0, marginTop: 2 }}
                      >
                        {fmt(a.start)}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 14.5 }}>{a.name}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                          <span
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 4,
                              fontSize: 11.5,
                              color: COLORS.rust,
                              border: `1px solid ${COLORS.rust}`,
                              borderRadius: 999,
                              padding: "2px 8px",
                            }}
                          >
                            <Icon size={11} /> {meta?.label || a.category}
                          </span>
                          <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: COLORS.inkSoft }}>
                            <Clock size={11} /> {a.duration} мин
                          </span>
                          <span className="fr-mono" style={{ fontSize: 12, color: COLORS.inkSoft }}>
                            {a.cost > 0 ? `${a.cost.toLocaleString("ru-RU")} ₽` : "бесплатно"}
                          </span>
                        </div>
                      </div>

                      {trip?.id && (
                        <form
                          onSubmit={handleAssistantSubmit}
                          style={{ marginTop: 28, background: COLORS.paperDark, border: `1px solid ${COLORS.paperEdge}`, borderRadius: 4, padding: 16 }}
                        >
                          <label htmlFor="route-assistant" className="fr-mono" style={{ display: "block", marginBottom: 9, fontSize: 11, color: COLORS.inkSoft }}>
                            ПОМОЩНИК ПО МАРШРУТУ · {currentDay?.label || `День ${activeDay + 1}`}
                          </label>
                          <div style={{ display: "flex", gap: 9 }}>
                            <input
                              id="route-assistant"
                              value={assistantMessage}
                              onChange={(event) => setAssistantMessage(event.target.value)}
                              placeholder="Например: добавь больше прогулок или сократи расходы"
                              maxLength={500}
                              style={{ flex: 1, minWidth: 0, border: `1px solid ${COLORS.line}`, borderRadius: 3, background: COLORS.paper, padding: "10px 12px", color: COLORS.ink, fontSize: 13 }}
                            />
                            <button
                              type="submit"
                              disabled={assistantPending || !assistantMessage.trim()}
                              style={{ border: "none", borderRadius: 3, background: COLORS.petrol, color: COLORS.paper, padding: "0 14px", fontSize: 12.5, cursor: assistantPending ? "default" : "pointer", opacity: assistantPending || !assistantMessage.trim() ? 0.6 : 1 }}
                            >
                              {assistantPending ? "Думаю…" : "Спросить"}
                            </button>
                          </div>
                          {assistantReply && <p role="status" style={{ marginTop: 10, color: COLORS.inkSoft, fontSize: 12.5 }}>{assistantReply}</p>}
                        </form>
                      )}
                    </div>

                    {i < schedule.length - 1 && a.travelNext > 0 && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          paddingLeft: 40,
                          fontSize: 11.5,
                          color: COLORS.inkSoft,
                        }}
                        className="fr-mono"
                      >
                        <ArrowRight size={11} /> {a.travelNext} мин в пути
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            <div
              style={{
                marginTop: 16,
                paddingTop: 14,
                borderTop: `1px dashed ${COLORS.line}`,
                display: "flex",
                justifyContent: "space-between",
                fontSize: 12.5,
                color: COLORS.inkSoft,
              }}
              className="fr-mono"
            >
              <span>Расходы за день: {currentDay.activities.reduce((s, a) => s + a.cost, 0).toLocaleString("ru-RU")} ₽</span>
              <span>Окончание: {fmt(schedule[schedule.length - 1]?.end || 0)}</span>
            </div>
          </div>

          <div className="md:col-span-2">
            <RouteMap
              activities={currentDay.activities}
              selectedActivity={selectedActivity}
              onSelect={setSelectedActivityId}
            />

            {selectedActivity && (
              <div
                style={{
                  marginTop: 16,
                  background: COLORS.paperDark,
                  border: `1px solid ${COLORS.paperEdge}`,
                  borderRadius: 4,
                  padding: "14px 16px",
                }}
              >
                <div className="fr-mono" style={{ fontSize: 11, color: COLORS.inkSoft, letterSpacing: "0.05em", marginBottom: 8 }}>
                  ВЫБРАНО МЕСТО
                </div>
                <div style={{ fontSize: 16, marginBottom: 6 }}>{selectedActivity.name}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12, color: COLORS.inkSoft }}>
                  <span>{CATEGORY_META[selectedActivity.category]?.label || selectedActivity.category}</span>
                  <span>·</span>
                  <span>{selectedActivity.duration} мин</span>
                  <span>·</span>
                  <span>{selectedActivity.cost > 0 ? `${selectedActivity.cost.toLocaleString("ru-RU")} ₽` : "бесплатно"}</span>
                </div>
                {selectedActivity.address && (
                  <div style={{ marginTop: 10, fontSize: 12, color: COLORS.inkSoft }}>{selectedActivity.address}</div>
                )}
                {yandexPlaceUrl(selectedActivity) && (
                  <a
                    href={yandexPlaceUrl(selectedActivity)}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12, color: COLORS.petrol, fontSize: 12.5 }}
                  >
                    Открыть место на карте <ExternalLink size={13} />
                  </a>
                )}
                {trip?.id && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={handleFindAlternatives}
                        disabled={alternativesLoading || actionPending}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "none", background: "none", color: COLORS.petrol, fontSize: 12.5, cursor: alternativesLoading || actionPending ? "default" : "pointer", padding: 0, opacity: alternativesLoading ? 0.6 : 1 }}
                      >
                        <RefreshCw size={13} />
                        {alternativesLoading ? "Ищем варианты…" : "Заменить место"}
                      </button>
                      <button
                        type="button"
                        onClick={handleRemoveActivity}
                        disabled={actionPending || alternativesLoading}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6, border: "none", background: "none", color: COLORS.warn, fontSize: 12.5, cursor: actionPending || alternativesLoading ? "default" : "pointer", padding: 0, opacity: actionPending ? 0.6 : 1 }}
                      >
                        <Trash2 size={13} />
                        {actionPending ? "Сохраняем…" : "Убрать из маршрута"}
                      </button>
                    </div>
                    {alternatives.length > 0 && (
                      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
                        <div className="fr-mono" style={{ fontSize: 10.5, color: COLORS.inkSoft }}>АЛЬТЕРНАТИВЫ</div>
                        {alternatives.map((place) => (
                          <button
                            key={place.id}
                            type="button"
                            onClick={() => handleReplaceActivity(place.id)}
                            disabled={actionPending}
                            style={{ display: "flex", justifyContent: "space-between", gap: 10, textAlign: "left", border: `1px solid ${COLORS.line}`, borderRadius: 3, background: COLORS.paper, color: COLORS.ink, padding: "8px 10px", cursor: actionPending ? "default" : "pointer" }}
                          >
                            <span style={{ fontSize: 12.5 }}>{place.name}</span>
                            <span className="fr-mono" style={{ fontSize: 10.5, color: COLORS.inkSoft }}>{place.rating ? `${place.rating}/5` : ""}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {yandexRouteUrl(allActivities) && (
              <a
                href={yandexRouteUrl(allActivities)}
                target="_blank"
                rel="noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: 7, marginTop: 12, color: COLORS.petrol, fontSize: 13 }}
              >
                Построить весь маршрут в Яндекс Картах <ExternalLink size={14} />
              </a>
            )}
          </div>
        </div>
            {overBudget && trip?.id && (
              <div style={{ marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11.5, color: COLORS.warn }}>Попробовать подобрать более доступные места?</span>
                <button
                  type="button"
                  onClick={handleOptimizeBudget}
                  disabled={budgetOptimizing}
                  style={{ border: `1px solid ${COLORS.warn}`, borderRadius: 3, background: "transparent", color: COLORS.warn, padding: "6px 9px", fontSize: 11.5, cursor: budgetOptimizing ? "default" : "pointer", opacity: budgetOptimizing ? 0.6 : 1 }}
                >
                  {budgetOptimizing ? "Проверяем…" : "Оптимизировать"}
                </button>
              </div>
            )}
            {budgetMessage && (
              <div style={{ marginTop: 8, fontSize: 11.5, color: COLORS.inkSoft }}>{budgetMessage}</div>
            )}
      </div>
    </div>
  );
}
