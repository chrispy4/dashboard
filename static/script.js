let selectedLocation = "ALL";
// const SERVER_ADDRESS = "http://192.168.0.9:5010";
const SERVER_ADDRESS = 'http://127.0.0.1:5010'
const REFRESH_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes
let countdownSeconds = REFRESH_INTERVAL_MS / 1000;
let countdownTimer = null;
let isRefreshing = false;

function showSpinner() {
    const overlay = document.getElementById("loadingOverlay");
    if (overlay) overlay.style.visibility = "visible";
}

function hideSpinner() {
    const overlay = document.getElementById("loadingOverlay");
    if (overlay) overlay.style.visibility = "hidden";
}

// [IMPROVED] Non-blocking toast instead of alert()
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
    toast.style.opacity = "1";

    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => toast.style.opacity = "0", 3000);
}

document.addEventListener("DOMContentLoaded", function () {
    // Assign table elements once
    tables.left.element = document.querySelector("#left-table");
    tables.right.element = document.querySelector("#right-table");

    // Generate headers once
    generateTableHead("left");
    generateTableHead("right");

    // Load initial data
    reloadData();

    // Manual Refresh button
    const refreshBtn = document.getElementById("refreshBtn");

    if (refreshBtn) {
        refreshBtn.addEventListener("click", async () => {
            showSpinner();

            try {
                const response = await fetch(SERVER_ADDRESS + "/refresh-data", { method: "POST" });

                if (!response.ok) {
                    console.error(response);
                    throw new Error(`HTTP ERROR! Status: ${response.status} : ${response.statusText}`);
                }

                const result = await response.json();

                if (result.success) {
                    showToast("Data refreshed successfully!"); // [IMPROVED] was alert()
                    await reloadData();
                } else {
                    showToast("Data refresh failed on the server.", true); // [IMPROVED] was alert()
                }
            } catch (error) {
                console.error(error);
                showToast("Failed to refresh data. See console for details.", true); // [IMPROVED] was alert()
            } finally {
                hideSpinner();
            }
        });
    }

    startAutoRefresh();
});

const headers = [
    "Contract",
    "Lot",
    "Assembly",
    "Qty",
    "StartDate",
    "EndDate"
];

// Separate table states
const tables = {
    left: {
        element: null,
        fullData: [],
        filteredData: [],
        sort: { column: null, asc: true }
    },
    right: {
        element: null,
        fullData: [],
        filteredData: [],
        sort: { column: null, asc: true }
    }
};

function populateLocationFilter(data) {
    const oldSelect = document.getElementById("locationFilter");
    const newSelect = oldSelect.cloneNode(false);
    oldSelect.parentNode.replaceChild(newSelect, oldSelect);

    const locations = [...new Set(
        data.map(d => d.Location).filter(l => l)
    )].sort();

    newSelect.innerHTML = `<option value="ALL">All Locations</option>`;

    locations.forEach(loc => {
        const option = document.createElement("option");
        option.value = loc;
        option.textContent = loc;
        newSelect.appendChild(option);
    });

    newSelect.addEventListener("change", () => {
        selectedLocation = newSelect.value;
        applyGlobalLocationFilter();
    });
}

function applyGlobalLocationFilter() {
    Object.keys(tables).forEach(tableKey => {
        const tableObj = tables[tableKey];

        if (selectedLocation === "ALL") {
            tableObj.filteredData = [...tableObj.fullData];
        } else {
            tableObj.filteredData = tableObj.fullData.filter(
                row => row.Location === selectedLocation
            );
        }

        generateTableBody(tableKey);
    });
}

function formatDate(dateString) {
    if (!dateString) return "";
    const date = new Date(dateString);
    if (isNaN(date)) return dateString;

    return date.toLocaleDateString("en-US", {
        year: "2-digit",
        month: "short",
        day: "2-digit"
    });
}

function detectType(value) {
    if (value == null || value === "") return "string";
    if (!isNaN(value)) return "number";
    if (!isNaN(Date.parse(value))) return "date";
    return "string";
}

function generateTableHead(tableKey) {
    const tableObj = tables[tableKey];
    const table = tableObj.element;

    if (!table) return;

    let thead = table.createTHead();
    let row = thead.insertRow();

    headers.forEach(header => {
        let th = document.createElement("th");
        th.textContent = header;
        th.style.cursor = "pointer";

        let arrow = document.createElement("span");
        arrow.style.marginLeft = "5px";
        th.appendChild(arrow);

        th.addEventListener("click", () => sortColumn(tableKey, header));
        row.appendChild(th);
    });

    // Filter row
    let filterRow = thead.insertRow();
    headers.forEach((header) => { // [IMPROVED] removed unused index param
        let th = document.createElement("th");
        let input = document.createElement("input");
        input.placeholder = "Filter...";
        input.style.width = "95%";

        input.addEventListener("input", () => applyFilters(tableKey));

        th.appendChild(input);
        filterRow.appendChild(th);
    });
}

function generateTableBody(tableKey) {
    const tableObj = tables[tableKey];
    const table = tableObj.element;
    if (!table) return;
    const data = tableObj.filteredData;

    let oldTbody = table.querySelector("tbody");
    if (oldTbody) oldTbody.remove();

    let tbody = table.createTBody();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    data.forEach(rowData => {
        let row = tbody.insertRow();
        let isOverdue = false;
        let isNearDue = false;

        headers.forEach(key => {
            let cell = row.insertCell();
            let value = rowData[key] ?? "";

            if (key === "EndDate" && value) {
                const endDate = new Date(value);

                if (!isNaN(endDate)) {
                    endDate.setHours(0, 0, 0, 0);

                    const diffTime = endDate - today;
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                    if (today > endDate) {
                        isOverdue = true;
                    } else if (diffDays <= 3) {
                        isNearDue = true;
                    }
                }

                value = formatDate(value);
            }

            if (key === "StartDate" && value) {
                value = formatDate(value);
            }

            cell.textContent = value;
        });

        if (isOverdue) {
            row.style.backgroundColor = "#ff4d4d";
        } else if (isNearDue) {
            row.style.backgroundColor = "#e28a06";
        }
    });

    updateSortArrows(tableKey);
}

function sortColumn(tableKey, header) {
    const tableObj = tables[tableKey];

    if (tableObj.sort.column === header) {
        tableObj.sort.asc = !tableObj.sort.asc;
    } else {
        tableObj.sort.column = header;
        tableObj.sort.asc = true;
    }

    // [IMPROVED] Sample first non-empty value instead of always row 0
    const sample = tableObj.filteredData
        .find(r => r[header] != null && r[header] !== "")?.[header];
    const type = detectType(sample);

    tableObj.filteredData.sort((a, b) => {
        let valA = a[header] ?? "";
        let valB = b[header] ?? "";

        if (type === "number") {
            valA = Number(valA);
            valB = Number(valB);
        } else if (type === "date") {
            valA = new Date(valA);
            valB = new Date(valB);
        } else {
            valA = valA.toString().toLowerCase();
            valB = valB.toString().toLowerCase();
        }

        if (valA > valB) return tableObj.sort.asc ? 1 : -1;
        if (valA < valB) return tableObj.sort.asc ? -1 : 1;
        return 0;
    });

    generateTableBody(tableKey);
}

function updateSortArrows(tableKey) {
    const tableObj = tables[tableKey];
    const ths = tableObj.element.querySelectorAll("thead tr:first-child th");

    ths.forEach((th, index) => {
        const arrow = th.querySelector("span");
        arrow.textContent = "";

        if (headers[index] === tableObj.sort.column) {
            arrow.textContent = tableObj.sort.asc ? "▲" : "▼";
        }
    });
}

function applyFilters(tableKey) {
    const tableObj = tables[tableKey];
    const inputs = tableObj.element.querySelectorAll("thead input");

    const locationFiltered = selectedLocation === "ALL"
        ? tableObj.fullData
        : tableObj.fullData.filter(r => r.Location === selectedLocation);

    tableObj.filteredData = locationFiltered.filter(row => {
        return headers.every((header, index) => {
            const filterValue = inputs[index].value.toLowerCase();
            const cellValue = (row[header] ?? "").toString().toLowerCase();
            return cellValue.includes(filterValue);
        });
    });

    generateTableBody(tableKey);
}

function startAutoRefresh() {
    // [IMPROVED] Clear existing timer before re-init to prevent stacking
    if (countdownTimer) clearInterval(countdownTimer);
    countdownSeconds = REFRESH_INTERVAL_MS / 1000;

    // Countdown
    countdownTimer = setInterval(() => {
        const countdownEl = document.getElementById("countdown");

        const minutes = Math.floor(countdownSeconds / 60);
        const seconds = countdownSeconds % 60;

        if (countdownEl) {
            countdownEl.textContent = `${minutes}:${seconds.toString().padStart(2, "0")}`;
        }

        countdownSeconds--;
        if (countdownSeconds < 0) countdownSeconds = 0;

    }, 1000);

    // Auto refresh
    setInterval(async () => {
        if (isRefreshing) return;

        isRefreshing = true;
        showSpinner();

        try {
            const response = await fetch(SERVER_ADDRESS + "/refresh-data", { method: "POST" });
            if (!response.ok) {
                console.error(response);
                throw new Error(`HTTP ${response.status}`);
            }

            const result = await response.json();

            if (result.success) {
                await reloadData();
                console.log("Auto refresh successful");
            }

        } catch (err) {
            console.error("Auto refresh error:", err);
            showToast("Auto-refresh failed. Data may be stale.", true); // [IMPROVED] visible feedback
        } finally {
            hideSpinner();
            countdownSeconds = REFRESH_INTERVAL_MS / 1000;
            isRefreshing = false;
        }

    }, REFRESH_INTERVAL_MS);
}

async function reloadData() {
    showSpinner();

    try {
        const res = await fetch('./data.json?cacheBust=' + Date.now());
        // [IMPROVED] Check res.ok before parsing JSON
        if (!res.ok) throw new Error(`Failed to load data.json: ${res.status} ${res.statusText}`);
        const data = await res.json();

        const transformed = data.ProductionConsoleProcess
            .filter(item =>
                item.Process?.trim().toLowerCase() !== "fab - inspection"
            )
            .map(item => {
                let status = item.Process;

                if (status === "Fab - Fit-Up") {
                    status = "Not In Shop";
                } else if (status === "Fab - Welding") {
                    status = "In Shop";
                }

                return {
                    Contract: item.Contract,
                    Lot: item.Lot,
                    Qty: item.QuantityAtProcess,
                    Status: status,
                    StartDate: item.StartDate,
                    EndDate: item.EndDate,
                    Assembly: item.Mark,
                    Location: item.Location ?? ""
                };
            });

        populateLocationFilter(transformed);

        tables.left.fullData = transformed.filter(r => r.Status !== "In Shop");
        tables.right.fullData = transformed.filter(r => r.Status === "In Shop");

        applyGlobalLocationFilter();

    } catch (error) {
        showToast("Error loading data. See console for details.", true); // [IMPROVED] was alert()
        console.error(error);
    } finally {
        hideSpinner();
    }
}