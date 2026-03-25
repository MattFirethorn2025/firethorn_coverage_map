import { useMemo } from "react";

function normalizeString(value) {
  return String(value ?? "").trim();
}

function deriveOptions(sections) {
  const landmen = new Set();
  const counties = new Set();
  const activities = new Set();

  for (const section of sections ?? []) {
    const landman = normalizeString(section?.landman);
    const activity = normalizeString(section?.activity);
    const countyRaw = normalizeString(section?.county);

    if (landman) landmen.add(landman);
    if (activity) activities.add(activity);

    if (countyRaw) {
      for (const part of countyRaw.split("/")) {
        const c = normalizeString(part);
        if (c) counties.add(c);
      }
    }
  }

  return {
    landmen: Array.from(landmen).sort((a, b) => a.localeCompare(b)),
    counties: Array.from(counties).sort((a, b) => a.localeCompare(b)),
    activities: Array.from(activities).sort((a, b) => a.localeCompare(b)),
  };
}

function SectionGroup({
  title,
  values,
  selectedSet,
  onToggleValue,
  onSelectAll,
  onClearAll,
}) {
  return (
    <div style={{ padding: "14px 0" }}>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <div style={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>{title}</div>
        <div style={{ display: "flex", gap: 10 }}>
          <button
            type="button"
            onClick={onSelectAll}
            style={{
              background: "none",
              border: "none",
              color: "#9dc2ff",
              cursor: "pointer",
              fontSize: 12,
              padding: 0,
            }}
          >
            Select all
          </button>
          <button
            type="button"
            onClick={onClearAll}
            style={{
              background: "none",
              border: "none",
              color: "#9dc2ff",
              cursor: "pointer",
              fontSize: 12,
              padding: 0,
            }}
          >
            Clear all
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        {values.map((value) => (
          <label
            key={value}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "#ddd",
              fontSize: 13,
            }}
          >
            <input
              type="checkbox"
              checked={selectedSet.has(value)}
              onChange={() => onToggleValue(value)}
            />
            <span>{value}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export default function FilterSidebar({
  sections,
  filters,
  onFiltersChange,
  isOpen,
  onToggle,
}) {
  const options = useMemo(() => deriveOptions(sections), [sections]);

  const updateSetFilter = (key, updater) => {
    const current = filters?.[key] instanceof Set ? filters[key] : new Set();
    const nextSet = new Set(current);
    updater(nextSet);
    onFiltersChange({
      ...filters,
      [key]: nextSet,
    });
  };

  const toggleInSet = (key, value) => {
    updateSetFilter(key, (nextSet) => {
      if (nextSet.has(value)) nextSet.delete(value);
      else nextSet.add(value);
    });
  };

  const setAll = (key, values) => {
    onFiltersChange({
      ...filters,
      [key]: new Set(values),
    });
  };

  const clearAll = (key) => {
    onFiltersChange({
      ...filters,
      [key]: new Set(),
    });
  };

  const selectedLandmen =
    filters?.landmen instanceof Set ? filters.landmen : new Set();
  const selectedCounties =
    filters?.counties instanceof Set ? filters.counties : new Set();
  const selectedActivities =
    filters?.activities instanceof Set ? filters.activities : new Set();
  const conflictsOnly = Boolean(filters?.conflictsOnly);

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        height: "100vh",
        width: isOpen ? 320 : 0,
        background: "#1a1a1a",
        color: "#fff",
        overflow: "hidden",
        zIndex: 20,
        boxShadow: isOpen ? "4px 0 14px rgba(0,0,0,0.35)" : "none",
        transition: "width 180ms ease",
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={isOpen ? "Collapse filters" : "Expand filters"}
        style={{
          position: "absolute",
          right: -26,
          top: 12,
          width: 26,
          height: 34,
          border: "1px solid #3a3a3a",
          borderLeft: "none",
          background: "#1a1a1a",
          color: "#fff",
          cursor: "pointer",
          borderRadius: "0 6px 6px 0",
          fontSize: 16,
          lineHeight: 1,
        }}
      >
        {isOpen ? "‹" : "›"}
      </button>

      {isOpen ? (
        <div
          style={{
            height: "100%",
            overflowY: "auto",
            padding: "16px 16px 24px",
          }}
        >
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 16, marginBottom: 12 }}>
            Filters
          </div>

          <div
            style={{
              paddingBottom: 14,
              borderBottom: "1px solid #2f2f2f",
              marginBottom: 2,
            }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#ddd" }}>
              <input
                type="checkbox"
                checked={conflictsOnly}
                onChange={(e) =>
                  onFiltersChange({
                    ...filters,
                    conflictsOnly: e.target.checked,
                  })
                }
              />
              <span>Conflicts only</span>
            </label>
          </div>

          <div style={{ borderBottom: "1px solid #2f2f2f" }}>
            <SectionGroup
              title="Landman"
              values={options.landmen}
              selectedSet={selectedLandmen}
              onToggleValue={(value) => toggleInSet("landmen", value)}
              onSelectAll={() => setAll("landmen", options.landmen)}
              onClearAll={() => clearAll("landmen")}
            />
          </div>

          <div style={{ borderBottom: "1px solid #2f2f2f" }}>
            <SectionGroup
              title="County"
              values={options.counties}
              selectedSet={selectedCounties}
              onToggleValue={(value) => toggleInSet("counties", value)}
              onSelectAll={() => setAll("counties", options.counties)}
              onClearAll={() => clearAll("counties")}
            />
          </div>

          <div style={{ borderBottom: "1px solid #2f2f2f" }}>
            <SectionGroup
              title="Activity"
              values={options.activities}
              selectedSet={selectedActivities}
              onToggleValue={(value) => toggleInSet("activities", value)}
              onSelectAll={() => setAll("activities", options.activities)}
              onClearAll={() => clearAll("activities")}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

