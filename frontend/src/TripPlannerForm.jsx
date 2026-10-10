import React, { useState, useEffect, useRef } from "react";
import {
  MapPin,
  CalendarDays,
  Users,
  Wallet,
  Sparkles,
  Check,
  Plus,
  Minus,
  Landmark,
  Building2,
  Palette,
  UtensilsCrossed,
  TreePine,
  Ticket,
  ShoppingBag,
  Moon,
  Compass,
} from "lucide-react";

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
};

const CATEGORIES = [
  { id: "history", label: "История", Icon: Landmark },
  { id: "architecture", label: "Архитектура", Icon: Building2 },
  { id: "culture", label: "Культура", Icon: Palette },
  { id: "food", label: "Еда", Icon: UtensilsCrossed },
  { id: "nature", label: "Природа", Icon: TreePine },
  { id: "entertainment", label: "Развлечения", Icon: Ticket },
  { id: "shopping", label: "Шопинг", Icon: ShoppingBag },
  { id: "nightlife", label: "Ночная жизнь", Icon: Moon },
];

const PACES = [
  { id: "relaxed", label: "Расслабленный", dots: 4 },
  { id: "medium", label: "Средний", dots: 6 },
  { id: "intense", label: "Насыщенный", dots: 8 },
];

const GEN_STEPS = [
  "Получаем информацию о городе",
  "Подбираем места",
  "Оптимизируем маршрут",
  "Рассчитываем бюджет",
  "Формируем описание",
];

function toInputDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00`);
  date.setDate(date.getDate() + days);
  return toInputDate(date);
}

function RoutePace({ dots, active }) {
  const total = 10;
  return (
    <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          style={{
            width: 5,
            height: 5,
            borderRadius: 999,
            background: i < dots ? (active ? COLORS.paper : COLORS.petrol) : (active ? "rgba(243,240,228,0.35)" : COLORS.line),
          }}
        />
      ))}
    </div>
  );
}

function Stub({ children, style }) {
  return (
    <div style={{ position: "relative", ...style }}>
      <div
        style={{
          position: "absolute",
          left: -22,
          top: "50%",
          transform: "translateY(-50%)",
          width: 20,
          height: 20,
          borderRadius: "50%",
          background: COLORS.paper === style?.bgMatch ? COLORS.paper : "inherit",
        }}
      />
      {children}
    </div>
  );
}

export default function TripPlannerForm({ onGenerated, isAuthenticated = true, initialTrip = null, submitLabel } = {}) {
  const [destination, setDestination] = useState(initialTrip?.city || "");
  const [country, setCountry] = useState(initialTrip?.country || "");
  const [startDate, setStartDate] = useState(initialTrip?.startDate?.slice(0, 10) || "");
  const [endDate, setEndDate] = useState(initialTrip?.endDate?.slice(0, 10) || "");
  const [travelers, setTravelers] = useState(Number(initialTrip?.travelers || 2));
  const [budget, setBudget] = useState(Number(initialTrip?.budget || 30000));
  const [pace, setPace] = useState(String(initialTrip?.pace || "medium").toLowerCase());
  const [categories, setCategories] = useState(
    initialTrip?.preferences?.length
      ? initialTrip.preferences.map((preference) => String(preference.category).toLowerCase())
      : ["history", "food", "nature"],
  );
  const [generating, setGenerating] = useState(false);
  const [stepIndex, setStepIndex] = useState(-1);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [authError, setAuthError] = useState("");
  const [dateError, setDateError] = useState("");
  const [citySuggestions, setCitySuggestions] = useState([]);
  const [citiesLoading, setCitiesLoading] = useState(false);
  const startDateRef = useRef(null);
  const endDateRef = useRef(null);
  const timeoutsRef = useRef([]);
  const today = toInputDate(new Date());
  const minEndDate = startDate ? addDays(startDate, 1) : today;

  const openDatePicker = (inputRef) => {
    inputRef.current?.focus();
    inputRef.current?.showPicker?.();
  };

  useEffect(() => {
    const query = destination.trim();
    if (query.length < 2) {
      setCitySuggestions([]);
      setCitiesLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setCitiesLoading(true);
      try {
        const response = await fetch(
          `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=6&language=ru&format=json`,
          { signal: controller.signal }
        );
        const data = await response.json();
        setCitySuggestions(data.results || []);
      } catch (requestError) {
        if (requestError.name !== "AbortError") setCitySuggestions([]);
      } finally {
        if (!controller.signal.aborted) setCitiesLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [destination]);


  const toggleCategory = (id) => {
    setCategories((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
  };

  const nights =
    startDate && endDate
      ? Math.max(
        1,
        Math.round(
          (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24)
        )
      )
      : null;

  useEffect(() => {
    return () => timeoutsRef.current.forEach((t) => clearTimeout(t));
  }, []);

  const handleGenerate = (e) => {
    e.preventDefault();
    if (!destination || !startDate || !endDate || generating) return;

    if (!isAuthenticated) {
      setAuthError("Войдите или зарегистрируйтесь, чтобы сохранить путешествие.");
      return;
    }
    setAuthError("");

    if (startDate < today) {
      setDateError("Дата начала не может быть в прошлом");
      return;
    }
    if (endDate <= startDate) {
      setDateError("Дата окончания должна быть позже даты начала");
      return;
    }

    setDateError("");
    setDone(false);
    setError("");
    setGenerating(true);
    setStepIndex(0);
    GEN_STEPS.forEach((_, i) => {
      const t = setTimeout(() => {
        setStepIndex(i);
        if (i === GEN_STEPS.length - 1) {
          const t2 = setTimeout(() => {
            setGenerating(false);
            setDone(true);
            if (onGenerated) {
              const t3 = setTimeout(() => Promise.resolve(
                onGenerated({ destination, country, startDate, endDate, travelers, budget, pace, categories })
              ).catch((requestError) => setError(requestError.message)), 900);
              timeoutsRef.current.push(t3);
            }
          }, 700);
          timeoutsRef.current.push(t2);
        }
      }, i * 650);
      timeoutsRef.current.push(t);
    });
  };

  return (
    <div
      style={{
        minHeight: "100%",
        background: COLORS.paper,
        color: COLORS.ink,
        fontFamily: "'IBM Plex Sans', sans-serif",
      }}
      className="w-full"
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        .fr-display { font-family: 'Fraunces', serif; }
        .fr-mono { font-family: 'IBM Plex Mono', monospace; }
        input[type="date"]::-webkit-calendar-picker-indicator { opacity: 0.55; }
        .cat-chip { transition: background 120ms ease, color 120ms ease, border-color 120ms ease; }
        .pace-btn { transition: background 120ms ease, color 120ms ease, border-color 120ms ease; }
        .gen-row { transition: opacity 250ms ease, transform 250ms ease; }
        @media (prefers-reduced-motion: reduce) {
          .gen-row { transition: none; }
        }
      `}</style>

      <div className="max-w-6xl mx-auto px-6 py-14 md:py-20 grid grid-cols-1 md:grid-cols-5 gap-12">
        {/* Left: hero / intro */}
        <div className="md:col-span-2 flex flex-col justify-between">
          <div>
            <div
              className="fr-mono"
              style={{
                fontSize: 12,
                letterSpacing: "0.06em",
                color: COLORS.inkSoft,
                marginBottom: 22,
              }}
            >
              Генератор путешествий · черновик № 0147
            </div>
            <h1
              className="fr-display"
              style={{
                fontSize: "clamp(2rem, 4vw, 2.9rem)",
                lineHeight: 1.08,
                fontWeight: 500,
                marginBottom: 20,
              }}
            >
              Расскажите, куда собираетесь —
              <br />
              маршрут проложим сами.
            </h1>
            <p
              style={{
                color: COLORS.inkSoft,
                fontSize: 15.5,
                lineHeight: 1.65,
                maxWidth: 380,
              }}
            >
              Город, даты, бюджет и то, что вам интересно — этого достаточно.
              Дальше мы подберём места, расставим их по дням и уложимся в
              бюджет, а вы сможете поправить всё вручную.
            </p>
          </div>

          {/* route illustration */}
          <div style={{ marginTop: 56 }}>
            <svg width="100%" height="120" viewBox="0 0 360 120" fill="none">
              <path
                d="M20 95 C 90 20, 140 110, 200 55 S 320 20, 340 30"
                stroke={COLORS.line}
                strokeWidth="2"
                strokeDasharray="1 9"
                strokeLinecap="round"
              />
              {[
                { x: 20, y: 95, filled: true },
                { x: 140, y: 42, filled: true },
                { x: 235, y: 68, filled: false },
                { x: 340, y: 30, filled: false },
              ].map((p, i) => (
                <g key={i}>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={i === 0 ? 6 : 5}
                    fill={p.filled ? COLORS.petrol : COLORS.paper}
                    stroke={COLORS.petrol}
                    strokeWidth="2"
                  />
                </g>
              ))}
            </svg>
            <div
              className="fr-mono"
              style={{ fontSize: 11.5, color: COLORS.inkSoft, letterSpacing: "0.04em" }}
            >
              день 1 → день {nights || "…"} · {categories.length} категори
              {categories.length === 1 ? "я" : categories.length >= 2 && categories.length <= 4 ? "и" : "й"} выбрано
            </div>
          </div>
        </div>

        {/* Right: ticket form */}
        <div className="md:col-span-3">
          <form
            onSubmit={handleGenerate}
            style={{
              background: COLORS.paperDark,
              border: `1px solid ${COLORS.paperEdge}`,
              borderRadius: 4,
              position: "relative",
              boxShadow: "0 1px 0 rgba(31,42,40,0.04)",
            }}
          >
            {/* header strip */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "16px 24px",
                borderBottom: `1px dashed ${COLORS.line}`,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Compass size={16} color={COLORS.petrol} strokeWidth={1.75} />
                <span className="fr-mono" style={{ fontSize: 12, letterSpacing: "0.08em", color: COLORS.inkSoft }}>
                  НОВОЕ ПУТЕШЕСТВИЕ
                </span>
              </div>
            </div>

            <div style={{ padding: "26px 24px 24px" }}>
              {/* destination */}
              <div style={{ marginBottom: 22 }}>
                <label
                  className="fr-mono"
                  style={{ fontSize: 11, color: COLORS.inkSoft, letterSpacing: "0.05em", display: "block", marginBottom: 8 }}
                >
                  Куда
                </label>
                <div style={{ position: "relative" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, borderBottom: `1.5px solid ${COLORS.ink}`, paddingBottom: 8 }}>
                    <MapPin size={17} color={COLORS.petrol} strokeWidth={1.75} />
                    <input
                      value={destination}
                      onChange={(e) => {
                        setDestination(e.target.value);
                        setDone(false);
                      }}
                      placeholder="Лиссабон, Тбилиси, Осака…"
                      style={{
                        background: "transparent",
                        border: "none",
                        outline: "none",
                        fontSize: 20,
                        width: "100%",
                        fontFamily: "'Fraunces', serif",
                        color: COLORS.ink,
                      }}
                      required
                    />
                  </div>
                  {(citiesLoading || citySuggestions.length > 0) && (
                    <div
                      role="listbox"
                      style={{
                        position: "absolute",
                        zIndex: 10,
                        top: "calc(100% + 6px)",
                        left: 0,
                        right: 0,
                        background: COLORS.paper,
                        border: `1px solid ${COLORS.paperEdge}`,
                        borderRadius: 3,
                        boxShadow: "0 6px 18px rgba(31,42,40,0.12)",
                        overflow: "hidden",
                      }}
                    >
                      {citiesLoading && citySuggestions.length === 0 ? (
                        <div style={{ padding: "10px 12px", color: COLORS.inkSoft, fontSize: 13 }}>
                          Ищем города…
                        </div>
                      ) : citySuggestions.map((city) => (
                        <button
                          key={`${city.id}-${city.latitude}-${city.longitude}`}
                          type="button"
                          role="option"
                          onClick={() => {
                            setDestination(city.name);
                            setCountry(city.country || "");
                            setCitySuggestions([]);
                          }}
                          style={{
                            display: "block",
                            width: "100%",
                            padding: "10px 12px",
                            textAlign: "left",
                            background: "transparent",
                            border: "none",
                            borderBottom: `1px solid ${COLORS.paperEdge}`,
                            color: COLORS.ink,
                            cursor: "pointer",
                          }}
                        >
                          <span style={{ display: "block", fontSize: 14 }}>{city.name}</span>
                          <span style={{ display: "block", marginTop: 2, color: COLORS.inkSoft, fontSize: 11.5 }}>
                            {[city.admin1, city.country].filter(Boolean).join(", ")}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* dates + travelers */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5" style={{ marginBottom: 22 }}>
                <div
                  onClick={() => openDatePicker(startDateRef)}
                  style={{ cursor: "pointer" }}
                >
                  <label className="fr-mono" style={{ fontSize: 11, color: COLORS.inkSoft, letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 5, marginBottom: 8 }}>
                    <CalendarDays size={13} /> Начало
                  </label>
                  <input
                    ref={startDateRef}
                    type="date"
                    min={today}
                    value={startDate}
                    onChange={(e) => {
                      setStartDate(e.target.value);
                      setDateError("");
                      if (endDate && e.target.value >= endDate) setEndDate("");
                    }}
                    style={{
                      width: "100%",
                      background: "transparent",
                      border: `1px solid ${COLORS.line}`,
                      borderRadius: 3,
                      padding: "8px 10px",
                      fontSize: 13.5,
                      color: COLORS.ink,
                      fontFamily: "'IBM Plex Sans', sans-serif",
                    }}
                    required
                  />
                </div>
                <div
                  onClick={() => openDatePicker(endDateRef)}
                  style={{ cursor: "pointer" }}
                >
                  <label className="fr-mono" style={{ fontSize: 11, color: COLORS.inkSoft, letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 5, marginBottom: 8 }}>
                    <CalendarDays size={13} /> Конец
                  </label>
                  <input
                    ref={endDateRef}
                    type="date"
                    min={minEndDate}
                    value={endDate}
                    onChange={(e) => {
                      setEndDate(e.target.value);
                      setDateError("");
                    }}
                    style={{
                      width: "100%",
                      background: "transparent",
                      border: `1px solid ${COLORS.line}`,
                      borderRadius: 3,
                      padding: "8px 10px",
                      fontSize: 13.5,
                      color: COLORS.ink,
                      fontFamily: "'IBM Plex Sans', sans-serif",
                    }}
                    required
                  />
                </div>
                <div>
                  <label className="fr-mono" style={{ fontSize: 11, color: COLORS.inkSoft, letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 5, marginBottom: 8 }}>
                    <Users size={13} /> Путешественники
                  </label>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: `1px solid ${COLORS.line}`, borderRadius: 3, padding: "4px 8px" }}>
                    <button
                      type="button"
                      onClick={() => setTravelers((t) => Math.max(1, t - 1))}
                      style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.inkSoft, padding: 4 }}
                      aria-label="Меньше путешественников"
                    >
                      <Minus size={14} />
                    </button>
                    <span style={{ fontSize: 14.5 }}>{travelers}</span>
                    <button
                      type="button"
                      onClick={() => setTravelers((t) => Math.min(12, t + 1))}
                      style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.inkSoft, padding: 4 }}
                      aria-label="Больше путешественников"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              </div>
              {dateError && (
                <div style={{ marginTop: -12, marginBottom: 18, color: COLORS.warn, fontSize: 12 }}>
                  {dateError}
                </div>
              )}

              {/* budget */}
              <div style={{ marginBottom: 24 }}>
                <label className="fr-mono" style={{ fontSize: 11, color: COLORS.inkSoft, letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: 5, marginBottom: 10 }}>
                  <Wallet size={13} /> Бюджет на поездку
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <input
                    type="range"
                    min="5000"
                    max="100000"
                    step="500"
                    value={budget}
                    onChange={(e) => setBudget(Number(e.target.value))}
                    style={{ flex: 1, accentColor: COLORS.petrol }}
                  />
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4, minWidth: 110, justifyContent: "flex-end" }}>
                    <span className="fr-display" style={{ fontSize: 18 }}>{budget.toLocaleString("ru-RU")}</span>
                    <span className="fr-mono" style={{ fontSize: 13, color: COLORS.inkSoft }}>₽</span>
                  </div>
                </div>
              </div>

              {/* pace */}
              <div style={{ marginBottom: 24 }}>
                <label className="fr-mono" style={{ fontSize: 11, color: COLORS.inkSoft, letterSpacing: "0.05em", display: "block", marginBottom: 10 }}>
                  Темп путешествия
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {PACES.map((p) => {
                    const active = pace === p.id;
                    return (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => setPace(p.id)}
                        className="pace-btn"
                        style={{
                          textAlign: "left",
                          padding: "10px 12px",
                          borderRadius: 3,
                          border: `1px solid ${active ? COLORS.petrol : COLORS.line}`,
                          background: active ? COLORS.petrol : "transparent",
                          color: active ? COLORS.paper : COLORS.ink,
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ fontSize: 13.5, marginBottom: 6 }}>{p.label}</div>
                        <RoutePace dots={p.dots} active={active} />
                        <div style={{ fontSize: 11, marginTop: 6, color: active ? "rgba(243,240,228,0.75)" : COLORS.inkSoft }}>
                          {p.hint}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* categories */}
              <div style={{ marginBottom: 28 }}>
                <label className="fr-mono" style={{ fontSize: 11, color: COLORS.inkSoft, letterSpacing: "0.05em", display: "block", marginBottom: 10 }}>
                  Что интересно
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {CATEGORIES.map(({ id, label, Icon }) => {
                    const active = categories.includes(id);
                    return (
                      <button
                        type="button"
                        key={id}
                        onClick={() => toggleCategory(id)}
                        className="cat-chip"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "7px 12px",
                          borderRadius: 999,
                          border: `1px solid ${active ? COLORS.rust : COLORS.line}`,
                          background: active ? COLORS.rust : "transparent",
                          color: active ? COLORS.paper : COLORS.inkSoft,
                          fontSize: 13,
                          cursor: "pointer",
                        }}
                      >
                        <Icon size={13.5} strokeWidth={1.75} />
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* stub / submit */}
              {authError && (
                <div
                  className="fr-mono"
                  style={{
                    marginBottom: 14,
                    padding: "10px 14px",
                    borderRadius: 3,
                    border: `1px solid ${COLORS.warn}`,
                    color: COLORS.warn,
                    fontSize: 12.5,
                  }}
                >
                  {authError}
                </div>
              )}
              <div
                style={{
                  borderTop: `1px dashed ${COLORS.line}`,
                  marginLeft: -24,
                  marginRight: -24,
                  paddingTop: 18,
                  paddingLeft: 24,
                  paddingRight: 24,
                  position: "relative",
                }}
              >
                <span style={{ position: "absolute", left: -10, top: -10, width: 20, height: 20, borderRadius: "50%", background: COLORS.paper }} />
                <span style={{ position: "absolute", right: -10, top: -10, width: 20, height: 20, borderRadius: "50%", background: COLORS.paper }} />
                <button
                  type="submit"
                  disabled={generating}
                  style={{
                    width: "100%",
                    background: COLORS.ink,
                    color: COLORS.paper,
                    border: "none",
                    borderRadius: 3,
                    padding: "13px 18px",
                    fontSize: 14.5,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    cursor: generating ? "default" : "pointer",
                    opacity: generating ? 0.85 : 1,
                  }}
                >
                  <Sparkles size={15} strokeWidth={1.75} />
                  {generating ? "Строим маршрут…" : submitLabel || (done ? "Собрать ещё раз" : "Проложить маршрут")}
                </button>
              </div>
            </div>
          </form>

          {/* generation status */}
          {(generating || done) && (
            <div
              style={{
                marginTop: 16,
                background: COLORS.paperDark,
                border: `1px solid ${COLORS.paperEdge}`,
                borderRadius: 4,
                padding: "16px 20px",
              }}
            >
              {GEN_STEPS.map((step, i) => {
                const reached = i <= stepIndex;
                const isCurrent = i === stepIndex && generating;
                return (
                  <div
                    key={step}
                    className="gen-row"
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "6px 0",
                      opacity: reached ? 1 : 0.35,
                    }}
                  >
                    <span
                      style={{
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        border: `1.5px solid ${reached ? COLORS.petrol : COLORS.line}`,
                        background: reached && !isCurrent ? COLORS.petrol : "transparent",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      {reached && !isCurrent && <Check size={10} color={COLORS.paper} strokeWidth={3} />}
                    </span>
                    <span style={{ fontSize: 13.5, color: reached ? COLORS.ink : COLORS.inkSoft }}>
                      {step}
                      {isCurrent ? "…" : ""}
                    </span>
                  </div>
                );
              })}
              {done && (
                <div
                  className="fr-mono"
                  style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${COLORS.line}`, fontSize: 12, color: COLORS.petrol }}
                >
                  Готово — маршрут для «{destination}» на {nights} {nights === 1 ? "ночь" : "ночи"} собран.
                </div>
              )}
              {error && <div style={{ marginTop: 10, color: COLORS.warn, fontSize: 12 }}>{error}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}