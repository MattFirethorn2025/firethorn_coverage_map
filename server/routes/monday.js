const express = require("express");

const MONDAY_URL = "https://api.monday.com/v2";
const BOARD_ID = "18394242733";
const COLUMN_IDS = [
  "sec__1",
  "twp__1",
  "range__1",
  "county__1",
  "color_mm19yfgj",
  "status__1",
  "asking_price___nma__1",
];
const CACHE_TTL_MS = 3 * 60 * 1000;
let sectionsCache = null;

const ITEMS_QUERY = `
  query ($boardIds: [ID!]!, $columnIds: [String!]!, $cursor: String) {
    boards(ids: $boardIds) {
      items_page(limit: 500, cursor: $cursor) {
        cursor
        items {
          id
          name
          column_values(ids: $columnIds) {
            id
            text
            value
            type
          }
        }
      }
    }
  }
`;

function columnText(cv) {
  if (!cv) return "";
  const raw = cv.text;
  if (raw != null && String(raw).trim() !== "") {
    return String(raw).trim();
  }
  if (cv.value) {
    try {
      const parsed = JSON.parse(cv.value);
      if (parsed && typeof parsed === "object") {
        if (parsed.text != null) return String(parsed.text).trim();
        if (parsed.label != null) return String(parsed.label).trim();
      }
    } catch {
      /* ignore */
    }
  }
  return "";
}

function isExcludedLandman(value) {
  const t = String(value ?? "").trim();
  if (t === "") return true;
  if (t.toLowerCase() === "unassigned") return true;
  return false;
}

function transformItems(rawItems) {
  const sections = (rawItems ?? []).map((item) => {
    const cols = {};
    for (const cv of item.column_values || []) {
      cols[cv.id] = columnText(cv);
    }

    const sec = cols.sec__1 ?? "";
    const twp = cols.twp__1 ?? "";
    const range = cols.range__1 ?? "";
    const county = cols.county__1 ?? "";
    const landman = cols.color_mm19yfgj ?? "";
    const activity = cols.status__1 ?? "";
    const priceNma = cols.asking_price___nma__1 ?? "";

    const strKey = [sec, twp, range]
      .map((s) => String(s).trim().toLowerCase())
      .join("|");

    return {
      id: item.id,
      name: item.name ?? "",
      sec,
      twp,
      range,
      county,
      landman,
      activity,
      priceNma,
      strKey,
    };
  });

  const conflicts = {};
  const byStrKey = new Map();
  for (const rec of sections) {
    const list = byStrKey.get(rec.strKey);
    if (list) list.push(rec);
    else byStrKey.set(rec.strKey, [rec]);
  }

  for (const [strKey, group] of byStrKey) {
    const distinctLandmen = new Set();
    for (const rec of group) {
      if (isExcludedLandman(rec.landman)) continue;
      distinctLandmen.add(String(rec.landman).trim());
    }
    if (distinctLandmen.size > 1) {
      conflicts[strKey] = group;
    }
  }

  return { sections, conflicts };
}

const router = express.Router();

router.get("/sections", async (req, res) => {
  const apiKey = process.env.MONDAY_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "MONDAY_API_KEY is not set" });
  }
  if (sectionsCache && Date.now() - sectionsCache.fetchedAtMs < CACHE_TTL_MS) {
    return res.json({
      sections: sectionsCache.sections,
      conflicts: sectionsCache.conflicts,
      cachedAt: sectionsCache.cachedAt,
    });
  }

  const pages = [];
  let cursor = null;

  try {
    while (true) {
      const response = await fetch(MONDAY_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: apiKey,
        },
        body: JSON.stringify({
          query: ITEMS_QUERY,
          variables: {
            boardIds: [BOARD_ID],
            columnIds: COLUMN_IDS,
            cursor,
          },
        }),
      });

      const json = await response.json();
      pages.push(json);

      if (!response.ok) {
        return res.status(response.status).json(json);
      }

      if (json.errors && json.errors.length > 0) {
        return res.status(502).json(json);
      }

      const board = json.data?.boards?.[0];
      const page = board?.items_page;
      if (!page) {
        break;
      }

      const nextCursor = page.cursor;
      if (!nextCursor) {
        break;
      }
      cursor = nextCursor;
    }

    const allItems = [];
    for (const pageJson of pages) {
      const items = pageJson.data?.boards?.[0]?.items_page?.items;
      if (items?.length) {
        allItems.push(...items);
      }
    }

    const { sections, conflicts } = transformItems(allItems);
    const fetchedAtMs = Date.now();
    const cachedAt = new Date(fetchedAtMs).toISOString();
    sectionsCache = { sections, conflicts, fetchedAtMs, cachedAt };
    return res.json({ sections, conflicts, cachedAt });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
