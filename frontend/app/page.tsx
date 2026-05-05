"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("register");
  const [form, setForm] = useState({ email: "", password: "", name: "", displayName: "" });
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      if (mode === "register") {
        const user = await api("/users", { method: "POST", body: JSON.stringify(form) });
        localStorage.setItem("userId", user.id);
        localStorage.setItem("displayName", user.displayName);
      } else {
        const user = await api(`/users?email=${encodeURIComponent(form.email)}`);
        localStorage.setItem("userId", user.id);
        localStorage.setItem("displayName", user.displayName);
      }
      router.push("/leagues");
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    }
  }

  return (
    <div className="page" style={{ paddingTop: 80 }}>
      <h1>Playbook</h1>
      <p className="subtitle">NFL prop betting simulation</p>

      <div className="card">
        <div className="row" style={{ marginBottom: 24 }}>
          <button
            className={mode === "register" ? "" : "secondary"}
            onClick={() => setMode("register")}
            style={{ flex: 1 }}
          >
            Create Account
          </button>
          <button
            className={mode === "login" ? "" : "secondary"}
            onClick={() => setMode("login")}
            style={{ flex: 1 }}
          >
            Log In
          </button>
        </div>

        <form className="form" onSubmit={handleSubmit}>
          {mode === "register" && (
            <>
              <input
                placeholder="Full name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
              <input
                placeholder="Display name"
                value={form.displayName}
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                required
              />
            </>
          )}
          <input
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
          />
          {error && <p className="error">{error}</p>}
          <button type="submit">
            {mode === "register" ? "Create Account" : "Log In"}
          </button>
        </form>
      </div>
    </div>
  );
}
