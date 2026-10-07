"use client";

export default function CompetitorPanel({ data }) {
  if (!data) return <p className="empty-state">Select a business to see who's ranking above it.</p>;

  const { myPosition, competitors, note } = data;

  return (
    <div>
      {note && <p className="note">{note}</p>}
      {competitors.length === 0 ? (
        <p className="empty-state">
          {myPosition ? "Nothing ranks above this business right now." : "No listings to show."}
        </p>
      ) : (
        <ul className="competitor-list">
          {competitors.map((c, i) => (
            <li key={`${c.position}-${i}`}>
              <span className="competitor-position">#{c.position}</span>
              <span>{c.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
