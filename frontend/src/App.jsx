import { useState } from "react";
import TripPlannerForm from "./TripPlannerForm.jsx";
import ItineraryPage from "./ItineraryPage.jsx";
import PersonalCabinet from "./PersonalCabinet.jsx";
import {
  createTrip,
  getTrip,
  getTripStatus,
  normalizeTrip,
  regenerateTrip,
  updateTrip,
} from "./api.js";

function loadStoredUser() {
  try {
    const raw = localStorage.getItem("tripPlannerUser");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function loadStoredToken() {
  return localStorage.getItem("tripPlannerToken");
}

const GENERATION_POLL_INTERVAL_MS = 400;
const MAX_GENERATION_POLLS = 150;

function toTripPayload(formData) {
  return {
    city: formData.destination,
    country: formData.country || undefined,
    startDate: formData.startDate,
    endDate: formData.endDate,
    travelers: formData.travelers,
    budget: formData.budget,
    pace: formData.pace.toUpperCase(),
    categories: formData.categories.map((category) => category.toUpperCase()),
  };
}

export default function App() {
  const [screen, setScreen] = useState("form");
  const [tripInfo, setTripInfo] = useState(null);
  const [trips, setTrips] = useState([]);
  const [user, setUser] = useState(loadStoredUser());
  const [token, setToken] = useState(loadStoredToken());
  const [editingTrip, setEditingTrip] = useState(null);

  const handleAuthenticated = (payload) => {
    if (!payload) {
      setUser(null);
      setToken(null);
      localStorage.removeItem("tripPlannerUser");
      localStorage.removeItem("tripPlannerToken");
      return;
    }
    setUser(payload.user);
    setToken(payload.token);
    localStorage.setItem("tripPlannerUser", JSON.stringify(payload.user));
    localStorage.setItem("tripPlannerToken", payload.token);
  };

  const handleGenerated = async (formData) => {
    if (!token) {
      setScreen("cabinet");
      return;
    }

    const payload = toTripPayload(formData);
    const tripId = editingTrip?.id;
    const created = editingTrip
      ? await updateTrip(editingTrip.id, payload).then(() => regenerateTrip(editingTrip.id))
      : await createTrip(payload);

    let status = created.status;
    let polls = 0;
    while (status === "GENERATING" && polls < MAX_GENERATION_POLLS) {
      await new Promise((resolve) => setTimeout(resolve, GENERATION_POLL_INTERVAL_MS));
      status = (await getTripStatus(tripId || created.id)).status;
      polls += 1;
    }

    if (status === "FAILED") {
      throw new Error("Не удалось сформировать маршрут. Проверьте настройки внешнего API и попробуйте ещё раз.");
    }
    if (status === "GENERATING") {
      throw new Error("Формирование маршрута занимает слишком много времени. Попробуйте открыть путешествие позже.");
    }

    const trip = normalizeTrip(await getTrip(tripId || created.id));
    setTripInfo(trip);
    setEditingTrip(null);
    setTrips((prev) => [trip, ...prev.filter((item) => item.id !== trip.id)]);
    setScreen("result");
  };

  const handleEditTrip = async (id) => {
    const trip = normalizeTrip(await getTrip(id));
    setEditingTrip(trip);
    setScreen("form");
  };

  const handleNewTrip = () => {
    setEditingTrip(null);
    setScreen("form");
  };

  const handleOpenTrip = async (id) => {
    const trip = normalizeTrip(await getTrip(id));
    setTripInfo(trip);
    setEditingTrip(null);
    setScreen("result");
  };




  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: "10px 16px",
          background: "#1F2A28",
        }}
      >
        <button
          onClick={() => setScreen("form")}
          style={{
            background: screen === "form" ? "#2B6E6E" : "transparent",
            color: "#F3F0E4",
            border: "1px solid #2B6E6E",
            borderRadius: 3,
            padding: "6px 12px",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Форма
        </button>
        <button
          onClick={() => setScreen("cabinet")}
          style={{
            background: screen === "cabinet" ? "#2B6E6E" : "transparent",
            color: "#F3F0E4",
            border: "1px solid #2B6E6E",
            borderRadius: 3,
            padding: "6px 12px",
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Кабинет
        </button>
      </div>
      {screen === "form" && (
        <TripPlannerForm
          key={editingTrip?.id || "new"}
          initialTrip={editingTrip}
          submitLabel={editingTrip ? "Сохранить и пересобрать" : undefined}
          onGenerated={handleGenerated}
          isAuthenticated={!!token}
        />
      )}
      {screen === "result" && (
        <ItineraryPage trip={tripInfo} onBack={() => setScreen("form")} />
      )}
      {screen === "cabinet" && (
        <PersonalCabinet
          trips={trips}
          setTrips={setTrips}
          user={user}
          onAuthenticated={handleAuthenticated}
          onOpen={handleOpenTrip}
          onEdit={handleEditTrip}
          onNewTrip={handleNewTrip}
        />
      )}
    </div>
  );
}