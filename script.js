let selectedLocation = "ALL";

function showSpinner() {
    const overlay = document.getElementById("loadingOverlay");
    if (overlay) overlay.style.visibility = "visible";
}

function hideSpinner() {
    const overlay = document.getElementById("loadingOverlay");
    if (overlay) overlay.style.visibility = "hidden";
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

});

// Refresh button logic
document.addEventListener("DOMContentLoaded", function (){
    const refreshBtn = document.getElementById("refreshBtn");

    if (refreshBtn) {
        refreshBtn.addEventListener("click", async () => {
            showSpinner();

            try {
                const response = await fetch("http://127.0.0.1:5000/refresh-data", {
                    method: "POST"
                });

                if (!response.ok) {
                    throw new Error("Server error");
                }

                const result = await response.json();

                if (result.success) {
                    alert("Data refreshed successfully!");
                    await reloadData(); // reload tables after refresh
                } else {
                    alert("Data refresh failed on the server.");
                }
            } catch (error) {
                console.error(error);
                alert("Failed to refresh data. See console for details.");
            } finally {
                hideSpinner();
            }
        });
    }

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
    const select = document.getElementById("locationFilter");

    // Get unique locations
    const locations = [...new Set(
        data.map(d => d.Location).filter(l => l)
    )].sort();

    // Add "All" option
    select.innerHTML = `<option value="ALL">All Locations</option>`;

    locations.forEach(loc => {
        const option = document.createElement("option");
        option.value = loc;
        option.textContent = loc;
        select.appendChild(option);
    });

    select.addEventListener("change", () => {
        selectedLocation = select.value;
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
    if (!isNaN(value)) return "number";
    if (!isNaN(Date.parse(value))) return "date";
    return "string";
}

function generateTableHead(tableKey) {
    const tableObj = tables[tableKey];
    const table = tableObj.element;

    if(!table) return;

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
    headers.forEach((header, index) => {
        let th = document.createElement("th");
        let input = document.createElement("input");
        input.placeholder = "Filter...";
        input.style.width = "95%";

        input.addEventListener("input", () =>
            applyFilters(tableKey)
        );

        th.appendChild(input);
        filterRow.appendChild(th);
    });
}

function generateTableBody(tableKey) {
    const tableObj = tables[tableKey];
    const table = tableObj.element;
    if(!table) return;
    const data = tableObj.filteredData;

    let oldTbody = table.querySelector("tbody");
    if (oldTbody) oldTbody.remove();

    let tbody = table.createTBody();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    data.forEach(rowData => {
        let row = tbody.insertRow();
        let isOverdue = false;

        headers.forEach(key => {
            let cell = row.insertCell();
            let value = rowData[key] ?? "";

            if (key === "EndDate" && value) {
                const endDate = new Date(value);
                if (!isNaN(endDate)) {
                    endDate.setHours(0, 0, 0, 0);
                    if (today > endDate) {
                        isOverdue = true;
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
            row.style.backgroundColor = "#ff0000";
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

    const type = detectType(tableObj.filteredData[0]?.[header]);

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

    tableObj.filteredData = tableObj.fullData.filter(row => {
        return headers.every((header, index) => {
            const filterValue = inputs[index].value.toLowerCase();
            const cellValue = (row[header] ?? "").toString().toLowerCase();
            return cellValue.includes(filterValue);
        });
    });

    generateTableBody(tableKey);
}

async function reloadData() {

    showSpinner();

    try {
        const res = await fetch('./data.json?cacheBust=' + Date.now());
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
                    Assembly: item.ContractDrawing,
                    Location: item.Location ?? ""
                };
            });

        populateLocationFilter(transformed);
        
        tables.left.fullData = transformed.filter(r => r.Status !== "In Shop");
        tables.right.fullData = transformed.filter(r => r.Status === "In Shop");

        applyGlobalLocationFilter();

    } catch (error) {
        alert("Error loading data");
        console.error(error);
    } finally {
        hideSpinner();
    }
}

// Initial load
reloadData();
