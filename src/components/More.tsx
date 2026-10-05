type Dest = "folders" | "money" | "settings";

const ROWS: [Dest, string, string, string][] = [
  ["folders", "📁", "Folders", "Classes, projects and what Claude prepared"],
  ["money", "💰", "Money", "Spending, budget and savings goals"],
  ["settings", "⚙️", "Settings", "Reminders, prayer, Quran and your day"],
];

export function More({ onGo }: { onGo: (d: Dest) => void }) {
  return (
    <div className="page">
      <h1>More</h1>
      <ul className="menu">
        {ROWS.map(([d, icon, label, hint]) => (
          <li key={d} className={`more-${d}`}>
            <button onClick={() => onGo(d)}>
              <span className="menu-icon tinted" aria-hidden>
                {icon}
              </span>
              <span className="menu-label">
                {label}
                <span className="muted small block">{hint}</span>
              </span>
              <span className="chev" aria-hidden>
                ›
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
