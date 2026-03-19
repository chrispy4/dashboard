// ─────────────────────────────────────────────
// PAGE CONFIG  (set inline by each HTML page)
// Defaults keep the original Fab behaviour if
// no config is provided.
// ─────────────────────────────────────────────
const PAGE_CONFIG = window.PAGE_CONFIG || {
    leftLabel:   "Not In Shop",
    rightLabel:  "In Shop",
    filterLeft:  row => row.Status === "Not In Shop",
    filterRight: row => row.Status === "In Shop",
    dataFile:    "data.json",
    refreshEndpoint: "/refresh-data"
};

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────
// const SERVER_ADDRESS = "http://192.168.0.9:5010";
const SERVER_ADDRESS     = "http://127.0.0.1:5010";
const REFRESH_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
function getLocationFromURL() {
    const params = new URLSearchParams(window.location.search);
    return params.get("location") || "ALL";
}

let selectedLocation  = getLocationFromURL();
let countdownSeconds  = REFRESH_INTERVAL_MS / 1000;
let countdownTimer    = null;
let autoRefreshTimer  = null;
let isRefreshing      = false;

// ─────────────────────────────────────────────
// TABLE STATE
// ─────────────────────────────────────────────
const headers = PAGE_CONFIG.headers || ["Contract", "Lot", "Assembly", "Qty", "StartDate", "EndDate"];

const tables = {
    left: {
        element:      null,
        fullData:     [],
        filteredData: [],
        sort:         { column: null, asc: true }
    },
    right: {
        element:      null,
        fullData:     [],
        filteredData: [],
        sort:         { column: null, asc: true }
    }
};

// ─────────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────────
function showSpinner() {
    const overlay = document.getElementById("loadingOverlay");
    if (overlay) overlay.style.visibility = "visible";
}

function hideSpinner() {
    const overlay = document.getElementById("loadingOverlay");
    if (overlay) overlay.style.visibility = "hidden";
}

function showToast(msg, isError = false) {
    let toast = document.getElementById("toast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "toast";
        toast.style.cssText = `
            position: fixed; bottom: 1.5rem; left: 50%; transform: translateX(-50%);
            padding: 0.6rem 1.4rem; border-radius: 6px; font-size: 0.95rem;
            color: #fff; z-index: 99999; opacity: 0;
            transition: opacity 0.3s ease; pointer-events: none;
        `;
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.background = isError ? "#cc2200" : "#007bff";
    toast.style.opacity    = "1";
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => toast.style.opacity = "0", 3000);
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", function () {
    tables.left.element  = document.querySelector("#left-table");
    tables.right.element = document.querySelector("#right-table");

    generateTableHead("left");
    generateTableHead("right");

    reloadData();

    const refreshBtn = document.getElementById("refreshBtn");
    if (refreshBtn) {
        refreshBtn.addEventListener("click", async () => {
            showSpinner();
            try {
                const response = await fetch(SERVER_ADDRESS + PAGE_CONFIG.refreshEndpoint, { method: "POST" });
                if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                const result = await response.json();
                if (result.success) {
                    showToast("Data refreshed successfully!");
                    await reloadData();
                } else {
                    showToast("Data refresh failed on the server.", true);
                }
            } catch (error) {
                console.error(error);
                showToast("Failed to refresh data. See console for details.", true);
            } finally {
                hideSpinner();
            }
        });
    }

    startAutoRefresh();
});

// ─────────────────────────────────────────────
// LOCATION FILTER
// ─────────────────────────────────────────────
function populateLocationFilter(data) {
    const oldSelect = document.getElementById("locationFilter");
    const newSelect = oldSelect.cloneNode(false);
    oldSelect.parentNode.replaceChild(newSelect, oldSelect);

    const locations = [...new Set(data.map(d => d.Location).filter(Boolean))].sort();

    newSelect.innerHTML = `<option value="ALL">All Locations</option>`;
    locations.forEach(loc => {
        const option = document.createElement("option");
        option.value       = loc;
        option.textContent = loc;
        newSelect.appendChild(option);
    });

    const available = ["ALL", ...locations];
    if (!available.includes(selectedLocation)) selectedLocation = "ALL";
    newSelect.value = selectedLocation;

    newSelect.addEventListener("change", () => {
        selectedLocation = newSelect.value;
        const url = new URL(window.location);
        selectedLocation === "ALL"
            ? url.searchParams.delete("location")
            : url.searchParams.set("location", selectedLocation);
        window.history.replaceState({}, "", url);
        applyGlobalLocationFilter();
    });
}

function applyGlobalLocationFilter() {
    Object.keys(tables).forEach(tableKey => {
        const tableObj = tables[tableKey];
        tableObj.filteredData = selectedLocation === "ALL"
            ? [...tableObj.fullData]
            : tableObj.fullData.filter(row => row.Location === selectedLocation);
        tableObj.sort = { column: null, asc: true };
        generateTableBody(tableKey);
    });
}

// ─────────────────────────────────────────────
// DATE / TYPE HELPERS
// ─────────────────────────────────────────────
function formatDate(dateString) {
    if (!dateString) return "";
    const date = new Date(dateString);
    if (isNaN(date)) return dateString;
    return date.toLocaleDateString("en-US", { year: "2-digit", month: "short", day: "2-digit" });
}

function detectType(value) {
    if (value == null || value === "") return "string";
    if (!isNaN(value))               return "number";
    if (!isNaN(Date.parse(value)))   return "date";
    return "string";
}

// ─────────────────────────────────────────────
// TABLE HEAD
// ─────────────────────────────────────────────
function generateTableHead(tableKey) {
    const tableObj = tables[tableKey];
    const table    = tableObj.element;
    if (!table) return;

    const thead    = table.createTHead();
    const row      = thead.insertRow();

    headers.forEach(header => {
        const th    = document.createElement("th");
        th.textContent = header;
        th.style.cursor = "pointer";
        const arrow = document.createElement("span");
        arrow.style.marginLeft = "5px";
        th.appendChild(arrow);
        th.addEventListener("click", () => sortColumn(tableKey, header));
        row.appendChild(th);
    });

    // Filter row
    const filterRow = thead.insertRow();
    headers.forEach(() => {
        const th    = document.createElement("th");
        const input = document.createElement("input");
        input.placeholder = "Filter...";
        input.style.width = "95%";
        input.addEventListener("input", () => applyFilters(tableKey));
        th.appendChild(input);
        filterRow.appendChild(th);
    });
}

// ─────────────────────────────────────────────
// TABLE BODY
// ─────────────────────────────────────────────
function generateTableBody(tableKey) {
    const tableObj = tables[tableKey];
    const table    = tableObj.element;
    if (!table) return;

    const oldTbody = table.querySelector("tbody");
    if (oldTbody) oldTbody.remove();

    const tbody = table.createTBody();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    tableObj.filteredData.forEach(rowData => {
        const row = tbody.insertRow();
        let isOverdue = false;
        let isNearDue = false;

        headers.forEach(key => {
            const cell = row.insertCell();
            let value  = rowData[key] ?? "";

            if ((key === "EndDate" || key === "StartDate") && value) {
                if (key === "EndDate") {
                    const endDate = new Date(value);
                    if (!isNaN(endDate)) {
                        endDate.setHours(0, 0, 0, 0);
                        const diffDays = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));
                        if (today > endDate)  isOverdue = true;
                        else if (diffDays <= 3) isNearDue = true;
                    }
                }
                value = formatDate(value);
            }

            cell.textContent = value;
        });

        if (isOverdue)      row.style.backgroundColor = "#ff4d4d";
        else if (isNearDue) row.style.backgroundColor = "#e28a06";
    });

    updateSortArrows(tableKey);
}

// ─────────────────────────────────────────────
// SORT
// ─────────────────────────────────────────────
function sortColumn(tableKey, header) {
    const tableObj = tables[tableKey];
    tableObj.sort.column === header
        ? (tableObj.sort.asc = !tableObj.sort.asc)
        : (tableObj.sort = { column: header, asc: true });

    const sample = tableObj.filteredData.find(r => r[header] != null && r[header] !== "")?.[header];
    const type   = detectType(sample);

    tableObj.filteredData.sort((a, b) => {
        let valA = a[header] ?? "";
        let valB = b[header] ?? "";
        if (type === "number") { valA = Number(valA);      valB = Number(valB); }
        else if (type === "date") { valA = new Date(valA); valB = new Date(valB); }
        else { valA = valA.toString().toLowerCase(); valB = valB.toString().toLowerCase(); }
        if (valA > valB) return tableObj.sort.asc ? 1 : -1;
        if (valA < valB) return tableObj.sort.asc ? -1 : 1;
        return 0;
    });

    generateTableBody(tableKey);
}

function updateSortArrows(tableKey) {
    const tableObj = tables[tableKey];
    tableObj.element.querySelectorAll("thead tr:first-child th").forEach((th, index) => {
        const arrow = th.querySelector("span");
        arrow.textContent = headers[index] === tableObj.sort.column
            ? (tableObj.sort.asc ? "▲" : "▼")
            : "";
    });
}

// ─────────────────────────────────────────────
// COLUMN FILTERS
// ─────────────────────────────────────────────
function applyFilters(tableKey) {
    const tableObj = tables[tableKey];
    const inputs   = tableObj.element.querySelectorAll("thead input");

    const locationFiltered = selectedLocation === "ALL"
        ? tableObj.fullData
        : tableObj.fullData.filter(r => r.Location === selectedLocation);

    tableObj.filteredData = locationFiltered.filter(row =>
        headers.every((header, index) => {
            const filterValue = inputs[index].value.toLowerCase();
            return (row[header] ?? "").toString().toLowerCase().includes(filterValue);
        })
    );

    generateTableBody(tableKey);
}

// ─────────────────────────────────────────────
// AUTO REFRESH + COUNTDOWN
// ─────────────────────────────────────────────
function startAutoRefresh() {
    if (countdownTimer) clearInterval(countdownTimer);
    countdownSeconds = REFRESH_INTERVAL_MS / 1000;

    countdownTimer = setInterval(() => {
        const el = document.getElementById("countdown");
        const m  = Math.floor(countdownSeconds / 60);
        const s  = countdownSeconds % 60;
        if (el) el.textContent = `${m}:${s.toString().padStart(2, "0")}`;
        if (countdownSeconds > 0) countdownSeconds--;
    }, 1000);

    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
    autoRefreshTimer = setInterval(async () => {
        if (isRefreshing) return;
        isRefreshing = true;
        showSpinner();
        try {
            const response = await fetch(SERVER_ADDRESS + PAGE_CONFIG.refreshEndpoint, { method: "POST" });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const result = await response.json();
            if (result.success) {
                await reloadData();
                console.log("Auto refresh successful");
            }
        } catch (err) {
            console.error("Auto refresh error:", err);
            showToast("Auto-refresh failed. Data may be stale.", true);
        } finally {
            hideSpinner();
            countdownSeconds = REFRESH_INTERVAL_MS / 1000;
            isRefreshing = false;
        }
    }, REFRESH_INTERVAL_MS);
}

// ─────────────────────────────────────────────
// DATA LOAD  — maps raw API rows → { Status, … }
// and uses PAGE_CONFIG filters to split left/right
// ─────────────────────────────────────────────

/**
 * Maps a raw ProductionConsoleProcess item to the
 * app's internal row shape, normalising Process → Status.
 *
 * Status values currently produced:
 *   "Not In Shop"        (Fab - Fit-Up)
 *   "In Shop"            (Fab - Welding)
 *   "Ready for Coating"  (Coating - Prep / Blast)   ← extend as needed
 *   "In Coating"         (Coating - Application)    ← extend as needed
 *   <original string>    (everything else)
 */
function mapRow(item) {
    const processMap = {
        "Fab - Fit-Up":                  "Not In Shop",
        "Fab - Welding":                 "In Shop",
        "Coat - Shop Paint":             "Ready for Coating",
        "Coat - Prime":                  "Ready for Coating",
        "Shp - Loading":                "Ready to Ship",
        "Shp - Shipped":                 "Ready to Ship"
    };

    const status = processMap[item.Process?.trim()] ?? item.Process;

    return {
        Contract:    item.Contract,
        Lot:         item.Lot,
        Qty:         item.QuantityAtProcess,
        Status:      status,
        StartDate:   item.StartDate,
        EndDate:     item.EndDate,
        Assembly:    item.Mark,
        Location:    item.Location ?? "",
        PaintFinish: item.PaintFinish ?? ""
    };
}

const sortByEndDate = (a, b) => {
    const dA = a.EndDate ? new Date(a.EndDate) : null;
    const dB = b.EndDate ? new Date(b.EndDate) : null;
    if (!dA && !dB) return 0;
    if (!dA) return 1;
    if (!dB) return -1;
    return dA - dB;
};

async function reloadData() {
    showSpinner();
    try {
        const res = await fetch("./" + PAGE_CONFIG.dataFile + "?cacheBust=" + Date.now());
        if (!res.ok) throw new Error(`Failed to load ${PAGE_CONFIG.dataFile}: ${res.status} ${res.statusText}`);
        const data = await res.json();

        const transformed = data.ProductionConsoleProcess
            .filter(item => item.Process?.trim().toLowerCase() !== "fab - inspection")
            .map(mapRow);

        populateLocationFilter(transformed);

        tables.left.fullData  = transformed.filter(PAGE_CONFIG.filterLeft).sort(sortByEndDate);
        tables.right.fullData = transformed.filter(PAGE_CONFIG.filterRight).sort(sortByEndDate);

        applyGlobalLocationFilter();

    } catch (error) {
        showToast("Error loading data. See console for details.", true);
        console.error(error);
    } finally {
        hideSpinner();
    }
}