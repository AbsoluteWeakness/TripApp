const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api/v1";

async function request(path, options = {}) {
  const token = localStorage.getItem("tripPlannerToken");
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message || "Не удалось выполнить запрос");
  }
  return body;
}

export function register(data) {
  return request("/auth/register", { method: "POST", body: JSON.stringify(data) });
}

export function login(data) {
  return request("/auth/login", { method: "POST", body: JSON.stringify(data) });
}

export function getTrips() {
  return request("/trips");
}

export function getTrip(id) {
  return request(`/trips/${id}`);
}

export function createTrip(data) {
  return request("/trips", { method: "POST", body: JSON.stringify(data) });
}

export function updateTrip(id, data) {
  return request(`/trips/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}

export function deleteTrip(id) {
  return request(`/trips/${id}`, { method: "DELETE" });
}

export function regenerateTrip(id) {
  return request(`/trips/${id}/regenerate`, { method: "POST" });
}

export function getTripStatus(id) {
  return request(`/trips/${id}/status`);
}

export function reorderActivities(tripId, dayId, activityIds) {
  return request(`/trips/${tripId}/days/${dayId}/reorder`, {
    method: "PATCH",
    body: JSON.stringify({ activityIds }),
  });
}

export function removeActivity(tripId, dayId, activityId) {
  return request(`/trips/${tripId}/activities/${activityId}`, { method: "DELETE" });
}

export function regenerateDay(tripId, dayId) {
  return request(`/trips/${tripId}/days/${dayId}/regenerate`, { method: "POST" });
}

export function getPlaceAlternatives(tripId, category) {
  return request(`/trips/${tripId}/places?category=${encodeURIComponent(category)}`);
}

export function optimizeBudget(tripId) {
  return request(`/trips/${tripId}/budget/optimize`, { method: "POST" });
}

export function sendAssistantRequest(tripId, message, dayId) {
  return request(`/trips/${tripId}/assistant`, {
    method: "POST",
    body: JSON.stringify({ message, dayId }),
  });
}

export function updateActivity(tripId, activityId, placeId) {
  return request(`/trips/${tripId}/activities/${activityId}`, {
    method: "PATCH",
    body: JSON.stringify({ placeId }),
  });
}

function normalizeActivity(activity) {
  return {
    ...activity,
    name: activity.place?.name || "Место без названия",
    category: String(activity.place?.category || "culture").toLowerCase(),
    latitude: Number(activity.place?.latitude),
    longitude: Number(activity.place?.longitude),
    address: activity.place?.description || "",
    duration: activity.durationMinutes || 0,
    cost: Number(activity.cost || 0),
    travelNext: activity.travelToNextMinutes || 0,
  };
}

export function normalizeDay(day) {
  return {
    ...day,
    date: formatDayDate(day.date),
    activities: (day.activities || []).map(normalizeActivity),
  };
}

export function normalizeTrip(trip) {
  const city = String(trip?.city || "Неизвестный город");
  const startDate = trip?.startDate?.slice(0, 10);
  const endDate = trip?.endDate?.slice(0, 10);
  const dateRange = startDate && endDate ? formatDateRange(startDate, endDate) : "";

  return {
    ...trip,
    city,
    budget: Number.isFinite(Number(trip?.budget)) ? Number(trip.budget) : 0,
    estimatedSpend: Number.isFinite(Number(trip?.estimatedSpend)) ? Number(trip.estimatedSpend) : 0,
    travelers: Number.isFinite(Number(trip?.travelers)) ? Number(trip.travelers) : 1,
    dateRange,
    code: city.slice(0, 3).toUpperCase() || "GPS",
    status: String(trip?.status || "DRAFT").toLowerCase(),
    days: (trip?.days || []).map(normalizeDay),
  };
}

function formatDateRange(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  return `${start.toLocaleDateString("ru-RU", { day: "numeric" })}–${end.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}`;
}

function formatDayDate(value) {
  return value
    ? new Date(value).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })
    : "";
}
