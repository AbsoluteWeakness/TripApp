import React, { useState } from "react";
import { login, register } from "./api.js";
import {
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  Compass,
  Stamp,
  ArrowRight,
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
  warn: "#A8432A",
};

function Field({ icon: Icon, ...props }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, borderBottom: `1.5px solid ${COLORS.ink}`, paddingBottom: 8 }}>
      <Icon size={16} color={COLORS.petrol} strokeWidth={1.75} />
      <input
        {...props}
        style={{
          background: "transparent",
          border: "none",
          outline: "none",
          fontSize: 15,
          width: "100%",
          fontFamily: "'IBM Plex Sans', sans-serif",
          color: COLORS.ink,
        }}
      />
    </div>
  );
}

export default function AuthPage({ onAuthenticated }) {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const isRegister = mode === "register";

  const switchMode = (next) => {
    setMode(next);
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (isRegister && !name.trim()) {
      setError("Укажите имя");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Проверьте адрес почты");
      return;
    }
    if (password.length < 6) {
      setError("Пароль должен быть не короче 6 символов");
      return;
    }
    if (isRegister && password !== confirmPassword) {
      setError("Пароли не совпадают");
      return;
    }

    setSubmitting(true);
    try {
      const payload = isRegister
        ? await register({ name: name.trim(), email, password })
        : await login({ email, password });
      onAuthenticated && onAuthenticated(payload);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
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
        .mode-tab { transition: background 120ms ease, color 120ms ease; }
      `}</style>

      <div className="max-w-5xl mx-auto px-6 py-14 md:py-20 grid grid-cols-1 md:grid-cols-5 gap-12">
        {/* left: hero */}
        <div className="md:col-span-2 flex flex-col justify-between">
          <div>
            <div
              className="fr-mono"
              style={{ fontSize: 12, letterSpacing: "0.06em", color: COLORS.inkSoft, marginBottom: 22 }}
            >
              Генератор путешествий
            </div>
            <h1
              className="fr-display"
              style={{ fontSize: "clamp(2rem, 4vw, 2.7rem)", lineHeight: 1.1, fontWeight: 500, marginBottom: 20 }}
            >
              {isRegister ? (
                <>Заведите билет —<br />и маршруты останутся с вами.</>
              ) : (
                <>С возвращением.<br />Ваши маршруты на месте.</>
              )}
            </h1>
            <p style={{ color: COLORS.inkSoft, fontSize: 15.5, lineHeight: 1.65, maxWidth: 360 }}>
              {isRegister
                ? "Один аккаунт — все ваши путешествия в одном личном кабинете: сохранённые маршруты, бюджеты и правки."
                : "Войдите, чтобы открыть сохранённые путешествия и продолжить с того же места."}
            </p>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 56, color: COLORS.inkSoft }}>
            <Stamp size={20} strokeWidth={1.5} />
            <span className="fr-mono" style={{ fontSize: 11.5, letterSpacing: "0.04em" }}>
              данные хранятся защищённо · пароль никогда не передаётся открытым текстом
            </span>
          </div>
        </div>

        {/* right: auth card */}
        <div className="md:col-span-3">
          <div
            style={{
              background: COLORS.paperDark,
              border: `1px solid ${COLORS.paperEdge}`,
              borderRadius: 4,
            }}
          >
            {/* header + tabs */}
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
                  ДОСТУП
                </span>
              </div>
              <div style={{ display: "flex", gap: 4, background: COLORS.paper, borderRadius: 3, padding: 3 }}>
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                  className="mode-tab"
                  style={{
                    border: "none",
                    borderRadius: 3,
                    padding: "6px 12px",
                    fontSize: 12.5,
                    cursor: "pointer",
                    background: !isRegister ? COLORS.petrol : "transparent",
                    color: !isRegister ? COLORS.paper : COLORS.inkSoft,
                  }}
                >
                  Войти
                </button>
                <button
                  type="button"
                  onClick={() => switchMode("register")}
                  className="mode-tab"
                  style={{
                    border: "none",
                    borderRadius: 3,
                    padding: "6px 12px",
                    fontSize: 12.5,
                    cursor: "pointer",
                    background: isRegister ? COLORS.petrol : "transparent",
                    color: isRegister ? COLORS.paper : COLORS.inkSoft,
                  }}
                >
                  Регистрация
                </button>
              </div>
            </div>

            <form onSubmit={handleSubmit} style={{ padding: "26px 24px 24px" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 20, marginBottom: 22 }}>
                {isRegister && (
                  <div>
                    <label className="fr-mono" style={{ fontSize: 11, color: COLORS.inkSoft, letterSpacing: "0.05em", display: "block", marginBottom: 8 }}>
                      Имя
                    </label>
                    <Field icon={User} value={name} onChange={(e) => setName(e.target.value)} placeholder="Как к вам обращаться" />
                  </div>
                )}

                <div>
                  <label className="fr-mono" style={{ fontSize: 11, color: COLORS.inkSoft, letterSpacing: "0.05em", display: "block", marginBottom: 8 }}>
                    Email
                  </label>
                  <Field icon={Mail} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
                </div>

                <div>
                  <label className="fr-mono" style={{ fontSize: 11, color: COLORS.inkSoft, letterSpacing: "0.05em", display: "block", marginBottom: 8 }}>
                    Пароль
                  </label>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, borderBottom: `1.5px solid ${COLORS.ink}`, paddingBottom: 8 }}>
                    <Lock size={16} color={COLORS.petrol} strokeWidth={1.75} />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Не короче 6 символов"
                      style={{
                        background: "transparent",
                        border: "none",
                        outline: "none",
                        fontSize: 15,
                        width: "100%",
                        fontFamily: "'IBM Plex Sans', sans-serif",
                        color: COLORS.ink,
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.inkSoft, padding: 0 }}
                      aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                {isRegister && (
                  <div>
                    <label className="fr-mono" style={{ fontSize: 11, color: COLORS.inkSoft, letterSpacing: "0.05em", display: "block", marginBottom: 8 }}>
                      Повторите пароль
                    </label>
                    <Field
                      icon={Lock}
                      type={showPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Ещё раз"
                    />
                  </div>
                )}
              </div>

              {error && (
                <div
                  className="fr-mono"
                  style={{ fontSize: 12, color: COLORS.warn, marginBottom: 16 }}
                >
                  {error}
                </div>
              )}

              {!isRegister && (
                <button
                  type="button"
                  style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.inkSoft, fontSize: 12.5, padding: 0, marginBottom: 20, display: "block" }}
                >
                  Забыли пароль?
                </button>
              )}

              <button
                type="submit"
                  disabled={submitting}
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
                  cursor: submitting ? "default" : "pointer",
                  opacity: submitting ? 0.7 : 1,
                }}
              >
                {submitting ? "Проверяем…" : isRegister ? "Создать аккаунт" : "Войти"}
                <ArrowRight size={15} strokeWidth={1.75} />
              </button>

              <div style={{ textAlign: "center", marginTop: 16, fontSize: 12.5, color: COLORS.inkSoft }}>
                {isRegister ? (
                  <>Уже есть аккаунт?{" "}
                    <button type="button" onClick={() => switchMode("login")} style={{ background: "none", border: "none", color: COLORS.petrol, cursor: "pointer", padding: 0, font: "inherit" }}>
                      Войти
                    </button>
                  </>
                ) : (
                  <>Ещё нет аккаунта?{" "}
                    <button type="button" onClick={() => switchMode("register")} style={{ background: "none", border: "none", color: COLORS.petrol, cursor: "pointer", padding: 0, font: "inherit" }}>
                      Зарегистрироваться
                    </button>
                  </>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
