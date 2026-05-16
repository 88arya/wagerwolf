"use client";

import { getAllTeams } from "@/lib/teamLogos";

export default function ColorsPage() {
  const teams = getAllTeams();

  return (
    <div style={{ padding: 24, maxWidth: 760, margin: "0 auto" }}>
      <h2 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: 16 }}>NFL Team Colors</h2>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.82rem" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid var(--border)" }}>
            <th style={{ textAlign: "left", padding: "6px 10px", color: "var(--text-2)", fontWeight: 600 }}>Team</th>
            <th style={{ textAlign: "center", padding: "6px 10px", color: "var(--text-2)", fontWeight: 600 }}>Logo</th>
            <th style={{ textAlign: "left", padding: "6px 10px", color: "var(--text-2)", fontWeight: 600 }}>Primary</th>
            <th style={{ textAlign: "left", padding: "6px 10px", color: "var(--text-2)", fontWeight: 600 }}>Alt</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((team) => (
            <tr key={team.abbr} style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "6px 10px", fontWeight: 500 }}>
                {team.name}
                <span style={{ marginLeft: 6, fontSize: "0.7rem", color: "var(--text-3)", textTransform: "uppercase" }}>
                  {team.abbr}
                </span>
              </td>
              <td style={{ padding: "6px 10px", textAlign: "center" }}>
                <img
                  src={team.logoUrl}
                  alt={team.abbr}
                  width={28}
                  height={28}
                  referrerPolicy="no-referrer"
                  style={{ objectFit: "contain", verticalAlign: "middle" }}
                />
              </td>
              <td style={{ padding: "6px 10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 32, height: 20, borderRadius: 3,
                    background: team.color,
                    border: "1px solid rgba(0,0,0,0.1)",
                    flexShrink: 0,
                  }} />
                  <span style={{ fontFamily: "monospace", fontSize: "0.78rem", color: "var(--text-2)" }}>
                    {team.color}
                  </span>
                </div>
              </td>
              <td style={{ padding: "6px 10px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{
                    width: 32, height: 20, borderRadius: 3,
                    background: team.altColor,
                    border: "1px solid rgba(0,0,0,0.1)",
                    flexShrink: 0,
                  }} />
                  <span style={{ fontFamily: "monospace", fontSize: "0.78rem", color: "var(--text-2)" }}>
                    {team.altColor}
                  </span>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
