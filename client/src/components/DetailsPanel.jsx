import { useEffect, useState } from "react";

function hasNonEmptyValue(value) {
  if (value === null || value === undefined) return false;
  const s = String(value).trim();
  return s.length > 0;
}

function Field({ label, value }) {
  if (!hasNonEmptyValue(value)) return null;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ color: "#aaa", fontSize: 13 }}>{label}</div>
      <div style={{ color: "#fff", fontSize: 14, wordBreak: "break-word" }}>
        {value}
      </div>
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "#333", margin: "16px 0" }} />;
}

export default function DetailsPanel({ section, conflictSections, onClose }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (section === null) return null;

  const isConflictMode = Array.isArray(conflictSections) && conflictSections.length > 0;

  const renderCard = (secObj, idx) => {
    return (
      <div key={idx} style={{ marginBottom: isConflictMode ? 0 : 10 }}>
        <Field label="Landman" value={secObj?.landman ?? ""} />
        <Field
          label="STR"
          value={
            secObj
              ? `Sec ${secObj.sec ?? ""}, T${secObj.twp ?? ""}, R${secObj.range ?? ""}`
              : ""
          }
        />
        <Field label="County" value={secObj?.county ?? ""} />
        <Field label="ST" value={secObj?.st ?? ""} />
        <Field label="Activity" value={secObj?.activity ?? ""} />
        <Field label="Price/NMA" value={secObj?.priceNma ?? ""} />
        <Field label="Date Sent Batch" value={secObj?.dateSentBatch ?? ""} />
        <Field label="Eff. Date" value={secObj?.effDate ?? ""} />
        <Field label="Date Assigned" value={secObj?.dateAssigned ?? ""} />
        <Field label="Activity Date" value={secObj?.activityDate ?? ""} />
        <Field label="# of Wells" value={secObj?.numWells ?? ""} />
        <Field label="Production Notes" value={secObj?.productionNotes ?? ""} />
      </div>
    );
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        height: "100vh",
        width: 320,
        background: "#1a1a1a",
        color: "#fff",
        padding: 20,
        overflowY: "auto",
        zIndex: 20,
        boxShadow: "-8px 0 20px rgba(0,0,0,0.35)",
        transform: mounted ? "translateX(0)" : "translateX(20px)",
        transition: "transform 180ms ease-out",
      }}
    >
      <button
        type="button"
        onClick={onClose}
        style={{
          position: "absolute",
          top: 14,
          right: 14,
          background: "transparent",
          border: "none",
          color: "#fff",
          fontSize: 22,
          cursor: "pointer",
          lineHeight: 1,
          padding: 0,
        }}
        aria-label="Close"
      >
        ×
      </button>

      {isConflictMode ? (
        <>
          <div
            style={{
              color: "#ff4d4d",
              fontWeight: 800,
              fontSize: 18,
              marginBottom: 14,
              paddingTop: 28,
            }}
          >
            ⚠ Conflict
          </div>
          {conflictSections.map((secObj, idx) => (
            <div key={idx}>
              {(() => {
                const nameParts = String(secObj?.name ?? "")
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
                return nameParts.length > 0 ? (
                  <div
                    style={{
                      color: "#fff",
                      fontSize: 16,
                      fontWeight: 700,
                      marginBottom: 12,
                      paddingTop: 28,
                    }}
                  >
                    {nameParts.map((part, i) => (
                      <div key={i}>{part}</div>
                    ))}
                  </div>
                ) : null;
              })()}
              {renderCard(secObj, idx)}
              {idx < conflictSections.length - 1 ? <Divider /> : null}
            </div>
          ))}
        </>
      ) : (
        <>
          {(() => {
            const nameParts = String(section?.name ?? "")
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean);
            return nameParts.length > 0 ? (
              <div
                style={{
                  color: "#fff",
                  fontSize: 16,
                  fontWeight: 700,
                  marginBottom: 12,
                  paddingTop: 28,
                }}
              >
                {nameParts.map((part, i) => (
                  <div key={i}>{part}</div>
                ))}
              </div>
            ) : (
              <div style={{ paddingTop: 28, marginBottom: 12 }} />
            );
          })()}
          {renderCard(section, 0)}
        </>
      )}
    </div>
  );
}

