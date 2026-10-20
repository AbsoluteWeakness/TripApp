import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TripPlannerForm from "./TripPlannerForm.jsx";

function futureDate(daysFromToday) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function initialTrip() {
  return {
    city: "Казань",
    country: "Россия",
    startDate: futureDate(3),
    endDate: futureDate(5),
    travelers: 2,
    budget: 30000,
    pace: "MEDIUM",
    preferences: [{ category: "HISTORY" }],
  };
}

describe("TripPlannerForm", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("blocks route generation for unauthenticated users", () => {
    const onGenerated = vi.fn();
    render(
      <TripPlannerForm
        initialTrip={initialTrip()}
        isAuthenticated={false}
        onGenerated={onGenerated}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Проложить маршрут" }));

    expect(screen.getByText("Войдите или зарегистрируйтесь, чтобы сохранить путешествие.")).toBeInTheDocument();
    expect(onGenerated).not.toHaveBeenCalled();
  });

  it("submits selected trip data and surfaces generation errors after the loading sequence", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: async () => ({ results: [] }) }));
    const onGenerated = vi.fn().mockRejectedValue(new Error("Сервер генерации недоступен"));
    render(<TripPlannerForm initialTrip={initialTrip()} onGenerated={onGenerated} />);

    fireEvent.click(screen.getByRole("button", { name: "Еда" }));
    fireEvent.change(screen.getByRole("slider"), { target: { value: "35000" } });
    fireEvent.click(screen.getByRole("button", { name: "Больше путешественников" }));
    fireEvent.click(screen.getByRole("button", { name: "Проложить маршрут" }));

    expect(screen.getByRole("button", { name: "Строим маршрут…" })).toBeDisabled();
    expect(screen.getByText("Получаем информацию о городе…")).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });

    expect(onGenerated).toHaveBeenCalledWith(expect.objectContaining({
      destination: "Казань",
      country: "Россия",
      travelers: 3,
      budget: 35000,
      pace: "medium",
      categories: ["history", "food"],
    }));
    expect(screen.getByText("Сервер генерации недоступен")).toBeInTheDocument();
  });
});