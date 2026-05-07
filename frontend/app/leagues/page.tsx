"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";

export default function LeaguesPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [memberships, setMemberships] = useState<any[]>([]);
  const [form, setForm] = useState({ name: "", weeklyAllowance: "200" });
  const [joinId, setJoinId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const id = localStorage.getItem("userId");
    if (!id) { router.push("/"); return; }
    setUserId(id);
    loadMemberships(id);
  }, []);

  async function loadMemberships(id: string) {
    try {
      const data = await api(`/memberships?userId=${id}`);
      setMemberships(data);
    } catch {}
  }

  async function createLeague(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const league = await api("/leagues", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          weeklyAllowance: Number(form.weeklyAllowance),
        }),
      });
      await api(`/leagues/${league.id}/join`, {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
      loadMemberships(userId);
      setForm({ name: "", weeklyAllowance: "200" });
    } catch (err: any) {
      setError(err.message);
    }
  }

  async function joinLeague(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api(`/leagues/${joinId}/join`, {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
      loadMemberships(userId);
      setJoinId("");
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <>
      <nav className="nav">
        <strong>Playbook</strong>
        <Link href="/admin">Admin</Link>
        <a onClick={() => { localStorage.clear(); router.push("/"); }} style={{ cursor: "pointer" }}>
          Sign out
        </a>
      </nav>

      <div className="page">
        <h1>Leagues</h1>
        <p className="subtitle">Join a league or create your own</p>

        {memberships.length > 0 && (
          <>
            <h2>Your Leagues</h2>
            {memberships.map((m: any) => (
              <Link key={m.id} href={`/leagues/${m.leagueId}`}>
                <div className="card" style={{ cursor: "pointer" }}>
                  <div className="row">
                    <div>
                      <strong>{m.league?.name ?? m.leagueId}</strong>
                      <div style={{ color: "#888", fontSize: "0.85rem", marginTop: 4 }}>
                        Balance: ${m.balance}
                      </div>
                    </div>
                    <span className="badge">→</span>
                  </div>
                </div>
              </Link>
            ))}
            <br />
          </>
        )}

        <h2>Create League</h2>
        <div className="card">
          <form className="form" onSubmit={createLeague}>
            <input
              placeholder="League name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
            <input
              type="number"
              placeholder="Weekly allowance"
              value={form.weeklyAllowance}
              onChange={(e) => setForm({ ...form, weeklyAllowance: e.target.value })}
              required
            />
            {error && <p className="error">{error}</p>}
            <button type="submit">Create & Join</button>
          </form>
        </div>

        <h2>Join by League ID</h2>
        <div className="card">
          <form className="form" onSubmit={joinLeague}>
            <input
              placeholder="League ID"
              value={joinId}
              onChange={(e) => setJoinId(e.target.value)}
              required
            />
            <button type="submit">Join League</button>
          </form>
        </div>
      </div>
    </>
  );
}
