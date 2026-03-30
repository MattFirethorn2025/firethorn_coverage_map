import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import DetailsPanel from "../components/DetailsPanel";

function mergeMondayIntoGeojson(geojson, mondayData) {
  const mondaySections = Array.isArray(mondayData?.sections)
    ? mondayData.sections
    : [];
  const sectionByStrKey = new Map();
  for (const section of mondaySections) {
    const key = String(section?.strKey ?? "")
      .trim()
      .toLowerCase();
    if (!key) continue;
    const existing = sectionByStrKey.get(key);
    if (
      !existing ||
      (section.landman && section.landman !== "Unassigned")
    ) {
      sectionByStrKey.set(key, section);
    }
  }

  const conflictKeys = new Set();
  const conflictsObj =
    mondayData?.conflicts && typeof mondayData.conflicts === "object"
      ? mondayData.conflicts
      : null;
  if (conflictsObj) {
    for (const k of Object.keys(conflictsObj)) {
      const normalized = String(k).trim().toLowerCase();
      if (normalized) conflictKeys.add(normalized);
    }
  }

  const features = Array.isArray(geojson?.features) ? geojson.features : [];
  for (const feature of features) {
    const props = feature?.properties ?? {};
    const sec = String(props.FRSTDIVNO ?? "")
      .trim()
      .toLowerCase();
    const twpParsed = Number.parseInt(
      String(props.TWNSHPNO ?? "").trim(),
      10,
    );
    const twpNo = Number.isFinite(twpParsed)
      ? String(twpParsed).padStart(2, "0")
      : "00";
    const twpDir = String(props.TWNSHPDIR ?? "")
      .trim()
      .toLowerCase();
    const rangeParsed = Number.parseInt(
      String(props.RANGENO ?? "").trim(),
      10,
    );
    const rangeNo = Number.isFinite(rangeParsed)
      ? String(rangeParsed).padStart(2, "0")
      : "00";
    const rangeDir = String(props.RANGEDIR ?? "")
      .trim()
      .toLowerCase();
    const twp = `${twpNo}${twpDir}`;
    const range = `${rangeNo}${rangeDir}`;
    const key = `${sec}|${twp}|${range}`;

    const section = sectionByStrKey.get(key);
    props.landman = section?.landman || "Unassigned";
    props.isConflict = conflictKeys.has(key) ? true : false;
    props.activity = section?.activity || "";
    props.priceNma = section?.priceNma || "";
    props.county = section?.county || "";
    props.inMonday = section ? true : false;
    props.strKey = key;
    feature.properties = props;
  }

  const mondayTownships = new Set();
  for (const feature of features) {
    const props = feature?.properties ?? {};
    if (props.inMonday !== true) continue;
    const townshipKey = [
      String(props.TWNSHPNO ?? "").trim().toLowerCase(),
      String(props.TWNSHPDIR ?? "").trim().toLowerCase(),
      String(props.RANGENO ?? "").trim().toLowerCase(),
      String(props.RANGEDIR ?? "").trim().toLowerCase(),
    ].join("|");
    if (townshipKey !== "|||") mondayTownships.add(townshipKey);
  }

  for (const feature of features) {
    const props = feature?.properties ?? {};
    const townshipKey = [
      String(props.TWNSHPNO ?? "").trim().toLowerCase(),
      String(props.TWNSHPDIR ?? "").trim().toLowerCase(),
      String(props.RANGENO ?? "").trim().toLowerCase(),
      String(props.RANGEDIR ?? "").trim().toLowerCase(),
    ].join("|");
    props.inMondayTownship = mondayTownships.has(townshipKey);
    feature.properties = props;
  }
}

const COUNTY_ZOOM_BOUNDS = [
  { name: "Ellis", bounds: [[-100.0, 36.0], [-99.14, 36.99]] },
  { name: "Roger Mills", bounds: [[-100.0, 35.33], [-99.14, 36.0]] },
  { name: "Custer", bounds: [[-99.14, 35.33], [-98.54, 36.0]] },
  { name: "Caddo", bounds: [[-98.72, 34.69], [-97.91, 35.57]] },
];

export default function MapView() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const savedMapPositionRef = useRef(null);
  const mondayDataRef = useRef(null);
  const plssGeojsonBaselineRef = useRef(null);
  const [selectedSection, setSelectedSection] = useState(null);
  const [selectedStrKey, setSelectedStrKey] = useState(null);
  const [conflictSections, setConflictSections] = useState([]);
  const selectedStrKeyRef = useRef(null);
  const [legendOpen, setLegendOpen] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState(null);
  const [refreshingMonday, setRefreshingMonday] = useState(false);
  const [highlightedLandman, setHighlightedLandman] = useState(null);
  const [detailSource, setDetailSource] = useState(null);
  const [summaryMode, setSummaryMode] = useState(false);
  const [mapMondayReady, setMapMondayReady] = useState(false);
  const landmanColors = useMemo(
    () => ({
      "Ace McMahan": "#e6194b",
      "Amy Abramowich": "#3cb44b",
      "Amy Malone": "#e6a817",
      "Billie Martin": "#4363d8",
      "Brad Gaddy": "#f58231",
      "Brady McDonald": "#911eb4",
      "Branden Wills": "#00bcd4",
      "Caitlin Willis": "#f032e6",
      "Carlos Medrano": "#8bc34a",
      "Derrick Morgan": "#e91e63",
      "Erin Easterling": "#009688",
      "Felisha": "#9c27b0",
      "Janet McMullen": "#795548",
      "Joey Payne": "#ff9800",
      "John Aycox": "#1a237e",
      "Kayla Gaddy": "#33691e",
      "Kayla Washer": "#006064",
      "Matt Sharp": "#bf360c",
      "Nikki Brandes": "#4a148c",
      "Rise": "#558b2f",
      "Xander Moody": "#0d47a1",
      "Zackary Weaver": "#880e4f",
      "Unassigned": "#9e9e9e",
    }),
    [],
  );

  async function handleRefreshMonday() {
    if (refreshingMonday || !plssGeojsonBaselineRef.current) return;
    const map = mapRef.current;
    if (!map?.getSource?.("plss-sections")) return;
    setRefreshingMonday(true);
    try {
      const refreshRes = await fetch("/api/monday/refresh", { method: "POST" });
      if (!refreshRes.ok) throw new Error("Refresh failed");
      const mondayResponse = await fetch("/api/monday/sections");
      if (!mondayResponse.ok) throw new Error("Sections fetch failed");
      const mondayData = await mondayResponse.json();
      mondayDataRef.current = mondayData;
      const gj = JSON.parse(JSON.stringify(plssGeojsonBaselineRef.current));
      mergeMondayIntoGeojson(gj, mondayData);
      map.getSource("plss-sections").setData(gj);
      setLastRefreshed(new Date());
    } catch (error) {
      console.error("Failed to refresh Monday data", error);
    } finally {
      setRefreshingMonday(false);
    }
  }

  const handleRefreshMondayRef = useRef(handleRefreshMonday);
  handleRefreshMondayRef.current = handleRefreshMonday;

  useEffect(() => {
    if (!mapMondayReady || !plssGeojsonBaselineRef.current) return;
    const id = setInterval(() => {
      handleRefreshMondayRef.current();
    }, 180000);
    return () => clearInterval(id);
  }, [mapMondayReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer("plss-fill")) return;

    if (highlightedLandman == null) {
      map.setPaintProperty("plss-fill", "fill-opacity", [
        "case",
        ["==", ["get", "inMonday"], true],
        0.6,
        0,
      ]);
      return;
    }

    if (highlightedLandman === "conflicts") {
      map.setPaintProperty("plss-fill", "fill-opacity", [
        "case",
        ["==", ["get", "isConflict"], true],
        1,
        0.15,
      ]);
      return;
    }

    map.setPaintProperty("plss-fill", "fill-opacity", [
      "match",
      ["get", "landman"],
      highlightedLandman,
      1,
      0.15,
    ]);
  }, [highlightedLandman]);

  function handleLegendLandmanToggle(name) {
    setHighlightedLandman((prev) => {
      if (prev === name) {
        mapRef.current?.easeTo({ zoom: 9 });
        setSummaryMode(false);
        setDetailSource(null);
        setSelectedSection(null);
        setConflictSections([]);
        setSelectedStrKey(null);
        return null;
      }
      setSummaryMode(true);
      setDetailSource("landman");
      setSelectedSection(null);
      setConflictSections([]);
      setSelectedStrKey(null);
      return name;
    });
  }

  function handleLegendConflictsToggle() {
    setHighlightedLandman((prev) => {
      if (prev === "conflicts") {
        setSummaryMode(false);
        setDetailSource(null);
        setSelectedSection(null);
        setConflictSections([]);
        setSelectedStrKey(null);
        return null;
      }
      setSummaryMode(true);
      setDetailSource("conflicts");
      setSelectedSection(null);
      setConflictSections([]);
      setSelectedStrKey(null);
      return "conflicts";
    });
  }

  useEffect(() => {
    selectedStrKeyRef.current = selectedStrKey;
  }, [selectedStrKey]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    mapRef.current = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          "osm-tiles": {
            type: "raster",
            tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
            tileSize: 256,
            attribution: "© OpenStreetMap contributors",
          },
        },
        layers: [
          {
            id: "osm-tiles",
            type: "raster",
            source: "osm-tiles",
          },
        ],
      },
      center: [-99.5, 35.5],
      zoom: 7,
    });
    const map = mapRef.current;

    map.on("load", async () => {
      try {
        const [geojsonResponse, mondayResponse] = await Promise.all([
          fetch("/four_counties_plss.geojson"),
          fetch("/api/monday/sections"),
        ]);
        const [geojson, mondayData] = await Promise.all([
          geojsonResponse.json(),
          mondayResponse.json(),
        ]);
        mondayDataRef.current = mondayData;

        plssGeojsonBaselineRef.current = JSON.parse(JSON.stringify(geojson));
        mergeMondayIntoGeojson(geojson, mondayData);

        const mondaySections = Array.isArray(mondayData?.sections)
          ? mondayData.sections
          : [];
        const sectionByStrKey = new Map();
        for (const section of mondaySections) {
          const key = String(section?.strKey ?? "")
            .trim()
            .toLowerCase();
          if (!key) continue;
          const existing = sectionByStrKey.get(key);
          if (
            !existing ||
            (section.landman && section.landman !== "Unassigned")
          ) {
            sectionByStrKey.set(key, section);
          }
        }
        console.log("Monday map size:", sectionByStrKey.size);
        console.log("Monday sections total:", mondaySections.length);
        const assignedCount = mondaySections.filter(
          (s) => s.landman && s.landman !== "Unassigned",
        ).length;
        console.log("Assigned in Monday:", assignedCount);

        const features = Array.isArray(geojson?.features)
          ? geojson.features
          : [];

        console.log(
          "Matched sections:",
          features.filter(
            (f) => (f?.properties?.landman ?? "Unassigned") !== "Unassigned",
          ).length,
          "of",
          features.length,
        );

        const fillColorMatch = ["match", ["get", "landman"]];
        for (const [landman, color] of Object.entries(landmanColors)) {
          fillColorMatch.push(landman, color);
        }
        fillColorMatch.push("#cccccc");

        const fillColor = [
          "case",
          ["==", ["get", "isConflict"], true],
          "#ff0000",
          fillColorMatch,
        ];

        map.addSource("plss-sections", {
          type: "geojson",
          data: geojson,
        });

        map.addLayer({
          id: "plss-fill",
          type: "fill",
          source: "plss-sections",
          paint: {
            "fill-color": fillColor,
            "fill-opacity": [
              "case",
              ["==", ["get", "inMonday"], true],
              0.6,
              0,
            ],
          },
        });

        map.addLayer({
          id: "plss-outline",
          type: "line",
          source: "plss-sections",
          filter: ["==", ["get", "inMondayTownship"], true],
          paint: {
            "line-color": "#2a6099",
            "line-width": 0.5,
            "line-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              8, 0,
              9, 1,
            ],
          },
        });

        map.addSource("township-labels-source", {
          type: "geojson",
          data: "/townships.geojson",
        });

        map.addLayer({
          id: "township-labels",
          type: "symbol",
          source: "township-labels-source",
          layout: {
            "text-field": ["get", "label"],
            "text-size": 11,
            "text-font": ["Open Sans Semibold", "Arial Unicode MS Bold"],
            "text-anchor": "center",
            visibility: "visible",
          },
          paint: {
            "text-color": "#ffffff",
            "text-halo-color": "#000000",
            "text-halo-width": 1.5,
            "text-opacity": [
              "interpolate",
              ["linear"],
              ["zoom"],
              8.5, 0,
              9, 1,
              11, 1,
              11.5, 0,
            ],
          },
        });

        map.on("mousemove", "plss-fill", (e) => {
          map.getCanvas().style.cursor = "pointer";
          const feature = e.features && e.features[0];
          const panel = document.getElementById("hover-panel-content");
          if (!feature || !panel) return;

          const p = feature.properties ?? {};
          const landman = p.landman ?? "Unassigned";
          const isConflict = p.isConflict === true || p.isConflict === "true";
          const inMonday = p.inMonday === true || p.inMonday === "true";

          if (!inMonday) {
            panel.innerHTML = '<span style="color:#aaa">Hover over a section</span>';
            return;
          }

          const sec = p.FRSTDIVNO ?? "";
          const twpNo = Number.isFinite(parseInt(p.TWNSHPNO))
            ? String(parseInt(p.TWNSHPNO))
            : "";
          const twpDir = String(p.TWNSHPDIR ?? "").toUpperCase();
          const rangeNo = Number.isFinite(parseInt(p.RANGENO))
            ? String(parseInt(p.RANGENO))
            : "";
          const rangeDir = String(p.RANGEDIR ?? "").toUpperCase();
          const strDisplay = `Sec ${sec}, T${twpNo}${twpDir}, R${rangeNo}${rangeDir}`;
          const county = p.county ?? "";
          const activity = p.activity ?? "";
          const priceNma = p.priceNma ?? "";
          const conflictLine = isConflict
            ? '<div style="color:#ff6b6b;font-weight:700;margin-bottom:4px;">⚠ Conflict</div>'
            : "";

          panel.innerHTML = `
            ${conflictLine}
            <div><span style="color:#aaa">Landman:</span> ${landman}</div>
            <div><span style="color:#aaa">STR:</span> ${strDisplay}</div>
            <div><span style="color:#aaa">County:</span> ${county}</div>
            <div><span style="color:#aaa">Activity:</span> ${activity}</div>
            <div><span style="color:#aaa">Price/NMA:</span> ${priceNma}</div>
          `;
        });

        map.on("mouseleave", "plss-fill", () => {
          map.getCanvas().style.cursor = "";
          const panel = document.getElementById("hover-panel-content");
          if (panel) panel.innerHTML = '<span style="color:#aaa">Hover over a section</span>';
        });

        map.on("click", "plss-fill", (e) => {
          const feature = e.features && e.features[0];
          if (!feature) return;
          const p = feature.properties ?? {};
          const inMonday = p.inMonday === true || p.inMonday === "true";
          if (!inMonday) return;
          const isConflict = p.isConflict === true || p.isConflict === "true";
          const key = p.strKey ?? "";
          if (key && selectedStrKeyRef.current === key) {
            setSelectedSection(null);
            setConflictSections([]);
            setSelectedStrKey(null);
            setDetailSource(null);
            setSummaryMode(false);
            return;
          }
          setSelectedStrKey(key);
          setDetailSource(null);
          setSummaryMode(false);
          if (isConflict && mondayDataRef.current?.conflicts?.[key]) {
            setSelectedSection(mondayDataRef.current.conflicts[key][0]);
            setConflictSections(mondayDataRef.current.conflicts[key]);
          } else {
            const sec = mondayDataRef.current?.sections?.find(
              (s) => s.strKey === key,
            );
            setSelectedSection(sec ?? null);
            setConflictSections([]);
          }
        });
        setMapMondayReady(true);
      } catch (error) {
        console.error("Failed to load map data", error);
      }
    });

    return () => {
      setMapMondayReady(false);
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [landmanColors]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "row",
        position: "relative",
        width: "100%",
        overflow: "hidden",
        height: "calc(100vh - 48px)",
      }}
    >
      <div
        style={{
          position: "relative",
          height: "100%",
          width: legendOpen ? 220 : 0,
          background: "rgba(20,20,20,0.9)",
          color: "#fff",
          zIndex: 10,
          overflow: "hidden",
          transition: "width 180ms ease",
          boxShadow: legendOpen ? "4px 0 14px rgba(0,0,0,0.35)" : "none",
        }}
      >
        {legendOpen && (
          <>
            <button
              type="button"
              onClick={() => setLegendOpen((o) => !o)}
              style={{
                position: "absolute",
                top: 12,
                right: 8,
                width: 24,
                height: 24,
                background: "transparent",
                border: "1px solid #3a3a3a",
                color: "#fff",
                cursor: "pointer",
                borderRadius: 4,
                fontSize: 14,
              }}
            >
              ‹
            </button>
            <div style={{ padding: "16px 14px", overflowY: "auto", height: "100%" }}>
            <button
              type="button"
              onClick={handleRefreshMonday}
              disabled={refreshingMonday}
              style={{
                width: "100%",
                marginBottom: 8,
                padding: "8px 10px",
                background: "#1a1a1a",
                border: "1px solid #3a3a3a",
                borderRadius: 4,
                color: "#eee",
                fontSize: 12,
                cursor: refreshingMonday ? "default" : "pointer",
                opacity: refreshingMonday ? 0.75 : 1,
              }}
            >
              {refreshingMonday ? "Refreshing..." : "Refresh Monday data"}
            </button>
            {lastRefreshed != null && (
              <div
                style={{
                  fontSize: 11,
                  color: "#aaa",
                  marginBottom: 12,
                }}
              >
                Updated{" "}
                {lastRefreshed.toLocaleTimeString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </div>
            )}
            <div
              style={{
                fontWeight: 600,
                fontSize: 11,
                color: "#aaa",
                marginBottom: 8,
              }}
            >
              Zoom to County
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 6,
                marginBottom: 14,
              }}
            >
              {COUNTY_ZOOM_BOUNDS.map(({ name, bounds }) => (
                <button
                  key={name}
                  type="button"
                  onClick={() =>
                    mapRef.current?.fitBounds(bounds, { padding: 20 })
                  }
                  style={{
                    padding: "8px 6px",
                    background: "#1a1a1a",
                    border: "1px solid #3a3a3a",
                    borderRadius: 4,
                    color: "#eee",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  {name}
                </button>
              ))}
            </div>
            <div
              style={{
                fontWeight: 700,
                fontSize: 14,
                marginBottom: 2,
                color: "#fff",
              }}
            >
              Legend
            </div>
            <div
              style={{
                fontSize: 10,
                color: "#666",
                marginBottom: 10,
              }}
            >
              Click to highlight
            </div>
            <div
              role="button"
              tabIndex={0}
              onClick={handleLegendConflictsToggle}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleLegendConflictsToggle();
                }
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 7,
                padding: "4px 6px",
                borderRadius: 4,
                borderLeft:
                  highlightedLandman === "conflicts"
                    ? "3px solid #fff"
                    : "3px solid transparent",
                background:
                  highlightedLandman === "conflicts"
                    ? "#2a2a2a"
                    : "transparent",
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 2,
                  background: "#e74c3c",
                  border: "1px solid rgba(255,255,255,0.15)",
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 12, color: "#ddd" }}>Conflicts</span>
            </div>
            {Object.entries(landmanColors).map(([name, color]) => (
              <div
                key={name}
                role="button"
                tabIndex={0}
                onClick={() => handleLegendLandmanToggle(name)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleLegendLandmanToggle(name);
                  }
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 7,
                  padding: "4px 6px",
                  borderRadius: 4,
                  borderLeft:
                    highlightedLandman === name
                      ? "3px solid #fff"
                      : "3px solid transparent",
                  background:
                    highlightedLandman === name ? "#2a2a2a" : "transparent",
                  cursor: "pointer",
                }}
              >
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 2,
                    background: color,
                    border: "1px solid rgba(255,255,255,0.15)",
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 12, color: "#ddd" }}>{name}</span>
              </div>
            ))}
          </div>
          </>
        )}
      </div>
      {!legendOpen && (
        <button
          type="button"
          onClick={() => setLegendOpen(true)}
          style={{
            position: "absolute",
            left: 4,
            top: 12,
            zIndex: 15,
            width: 28,
            height: 34,
            background: "#1a1a1a",
            border: "1px solid #3a3a3a",
            color: "#fff",
            cursor: "pointer",
            borderRadius: 4,
            fontSize: 14,
          }}
        >
          ›
        </button>
      )}
      <div
        ref={mapContainerRef}
        style={{
          flex: 1,
          height: "100%",
        }}
      />
      <div
        id="hover-panel"
        style={{
          position: "absolute",
          top: "12px",
          left: legendOpen ? "232px" : "38px",
          background: "rgba(20,20,20,0.85)",
          color: "#fff",
          padding: "12px 16px",
          borderRadius: "6px",
          fontSize: "13px",
          lineHeight: "1.6",
          minWidth: "200px",
          maxWidth: "260px",
          pointerEvents: "none",
          zIndex: 10,
        }}
      >
        <div id="hover-panel-content" style={{ color: "#aaa" }}>
          Hover over a section
        </div>
      </div>
        <DetailsPanel
          section={selectedSection}
          conflictSections={conflictSections}
          summaryMode={summaryMode}
          detailSource={detailSource}
          highlightedLandman={highlightedLandman}
          mondayData={mondayDataRef.current}
          onBackToSummary={() => {
            const map = mapRef.current;
            if (map && savedMapPositionRef.current) {
              map.easeTo({
                center: savedMapPositionRef.current.center,
                zoom: 9,
              });
            }
            savedMapPositionRef.current = null;
            setSummaryMode(true);
          }}
          onSelectSection={(nextSection, nextConflictSections = []) => {
            const map = mapRef.current;
            if (map) {
              savedMapPositionRef.current = {
                center: map.getCenter(),
                zoom: map.getZoom(),
              };
            }

            const baselineFeatures = Array.isArray(plssGeojsonBaselineRef.current?.features)
              ? plssGeojsonBaselineRef.current.features
              : [];
            const target = baselineFeatures.find((feature) => {
              const props = feature?.properties ?? {};
              const sec = String(props.FRSTDIVNO ?? "").trim().toLowerCase();
              const twpParsed = Number.parseInt(String(props.TWNSHPNO ?? "").trim(), 10);
              const twpNo = Number.isFinite(twpParsed)
                ? String(twpParsed).padStart(2, "0")
                : "00";
              const twpDir = String(props.TWNSHPDIR ?? "").trim().toLowerCase();
              const rangeParsed = Number.parseInt(String(props.RANGENO ?? "").trim(), 10);
              const rangeNo = Number.isFinite(rangeParsed)
                ? String(rangeParsed).padStart(2, "0")
                : "00";
              const rangeDir = String(props.RANGEDIR ?? "").trim().toLowerCase();
              const strKey = `${sec}|${twpNo}${twpDir}|${rangeNo}${rangeDir}`;
              return strKey === String(nextSection?.strKey ?? "");
            });

            if (map && target?.geometry?.coordinates) {
              let sumLng = 0;
              let sumLat = 0;
              let count = 0;
              const stack = [target.geometry.coordinates];
              while (stack.length > 0) {
                const node = stack.pop();
                if (!Array.isArray(node)) continue;
                if (
                  node.length >= 2 &&
                  typeof node[0] !== "object" &&
                  typeof node[1] !== "object"
                ) {
                  const lng = Number(node[0]);
                  const lat = Number(node[1]);
                  if (Number.isFinite(lng) && Number.isFinite(lat)) {
                    sumLng += lng;
                    sumLat += lat;
                    count += 1;
                  }
                } else {
                  for (const child of node) stack.push(child);
                }
              }
              if (count > 0) {
                map.easeTo({ center: [sumLng / count, sumLat / count], zoom: 9 });
              }
            }

            setSummaryMode(false);
            setSelectedSection(nextSection ?? null);
            setConflictSections(nextConflictSections);
            setSelectedStrKey(nextSection?.strKey ?? null);
          }}
          onClose={() => {
            setSummaryMode(false);
            setDetailSource(null);
            setSelectedSection(null);
            setConflictSections([]);
            setSelectedStrKey(null);
          }}
        />
    </div>
  );
}
