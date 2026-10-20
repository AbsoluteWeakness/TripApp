import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AuthPage from "./AuthPage.jsx";

const { loginMock, registerMock } = vi.hoisted(() => ({
  loginMock: vi.fn(),
  registerMock: vi.fn(),
}));

vi.mock("./api.js", () => ({ login: loginMock, register: registerMock }));

describe("AuthPage", () => {
  beforeEach(() => {
    loginMock.mockReset();
    registerMock.mockReset();
  });

  it("validates short passwords without calling the login service", async () => {
    const user = userEvent.setup();
    render(<AuthPage onAuthenticated={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("you@example.com"), "traveler@example.com");
    await user.type(screen.getByPlaceholderText("Не короче 6 символов"), "123");
    await user.click(screen.getAllByRole("button", { name: "Войти" }).at(-1));

    expect(screen.getByText("Пароль должен быть не короче 6 символов")).toBeInTheDocument();
    expect(loginMock).not.toHaveBeenCalled();
  });

  it("submits login credentials and reports service errors", async () => {
    const user = userEvent.setup();
    const onAuthenticated = vi.fn();
    loginMock.mockRejectedValueOnce(new Error("Неверный пароль"));
    render(<AuthPage onAuthenticated={onAuthenticated} />);

    await user.type(screen.getByPlaceholderText("you@example.com"), "traveler@example.com");
    await user.type(screen.getByPlaceholderText("Не короче 6 символов"), "secret1");
    await user.click(screen.getAllByRole("button", { name: "Войти" }).at(-1));

    expect(await screen.findByText("Неверный пароль")).toBeInTheDocument();
    expect(loginMock).toHaveBeenCalledWith({ email: "traveler@example.com", password: "secret1" });
    expect(onAuthenticated).not.toHaveBeenCalled();
  });

  it("trims registration names and sends a successful authentication payload", async () => {
    const user = userEvent.setup();
    const payload = { token: "jwt", user: { id: "user-1" } };
    const onAuthenticated = vi.fn();
    registerMock.mockResolvedValueOnce(payload);
    render(<AuthPage onAuthenticated={onAuthenticated} />);

    await user.click(screen.getByRole("button", { name: "Регистрация" }));
    await user.type(screen.getByPlaceholderText("Как к вам обращаться"), "  Алексей  ");
    await user.type(screen.getByPlaceholderText("you@example.com"), "alex@example.com");
    await user.type(screen.getByPlaceholderText("Не короче 6 символов"), "secret1");
    await user.type(screen.getByPlaceholderText("Ещё раз"), "secret2");
    await user.click(screen.getByRole("button", { name: "Создать аккаунт" }));

    expect(screen.getByText("Пароли не совпадают")).toBeInTheDocument();
    expect(registerMock).not.toHaveBeenCalled();

    await user.clear(screen.getByPlaceholderText("Ещё раз"));
    await user.type(screen.getByPlaceholderText("Ещё раз"), "secret1");
    await user.click(screen.getByRole("button", { name: "Создать аккаунт" }));

    expect(registerMock).toHaveBeenCalledWith({
      name: "Алексей",
      email: "alex@example.com",
      password: "secret1",
    });
    expect(onAuthenticated).toHaveBeenCalledWith(payload);
  });

  it("toggles password visibility", async () => {
    const user = userEvent.setup();
    render(<AuthPage onAuthenticated={vi.fn()} />);

    const password = screen.getByPlaceholderText("Не короче 6 символов");
    expect(password).toHaveAttribute("type", "password");
    await user.click(screen.getByRole("button", { name: "Показать пароль" }));
    expect(password).toHaveAttribute("type", "text");
    await user.click(screen.getByRole("button", { name: "Скрыть пароль" }));
    expect(password).toHaveAttribute("type", "password");
  });
});