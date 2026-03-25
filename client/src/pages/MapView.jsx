import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import DetailsPanel from "../components/DetailsPanel";

export default function MapView() {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const mondayDataRef = useRef(null);
  const [selectedSection, setSelectedSection] = useState(null);
  const [selectedStrKey, setSelectedStrKey] = useState(null);
  const [conflictSections, setConflictSections] = useState([]);
  const selectedStrKeyRef = useRef(null);
  const [legendOpen, setLegendOpen] = useState(true);
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

        console.log("Monday map size:", sectionByStrKey.size);
        console.log("Monday sections total:", mondaySections.length);
        const assignedCount = mondaySections.filter(
          (s) => s.landman && s.landman !== "Unassigned",
        ).length;
        console.log("Assigned in Monday:", assignedCount);

        const features = Array.isArray(geojson?.features)
          ? geojson.features
          : [];
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
          paint: {
            "line-color": "#2a6099",
            "line-width": 0.5,
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
            return;
          }
          setSelectedStrKey(key);
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
      } catch (error) {
        console.error("Failed to load map data", error);
      }
    });

    return () => {
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
            <div
              style={{
                fontWeight: 700,
                fontSize: 14,
                marginBottom: 12,
                color: "#fff",
              }}
            >
              Legend
            </div>
            {Object.entries(landmanColors).map(([name, color]) => (
              <div
                key={name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  marginBottom: 7,
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
          onClose={() => {
            setSelectedSection(null);
            setConflictSections([]);
          setSelectedStrKey(null);
          }}
        />
    </div>
  );
}
