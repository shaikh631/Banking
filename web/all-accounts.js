(() => {
    const elements = {
        tableBody: document.getElementById("accounts-table-body"),
        status: document.getElementById("accounts-status"),
        filter: document.getElementById("accounts-filter"),
        clearFilter: document.getElementById("clear-accounts-filter"),
        refresh: document.getElementById("refresh-all-accounts"),
        toast: document.getElementById("toast"),
        usernameLabel: document.getElementById("current-username"),
        lastUpdated: document.getElementById("last-updated")
    };

    const state = {
        authToken: sessionStorage.getItem("bankAuthToken"),
        currentUser: sessionStorage.getItem("bankAuthUser"),
        ledgers: [],
        filter: "",
        toastTimer: null
    };

    if (!state.authToken) {
        window.location.href = "index.html";
        return;
    }

    const THEME_STORAGE_KEY = "bank-theme";
    const currency = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" });

    function setTheme(theme) {
        const next = theme === "dark" ? "dark" : "light";
        document.body.setAttribute("data-theme", next);
        localStorage.setItem(THEME_STORAGE_KEY, next);
    }

    function applyStoredTheme() {
        const stored = localStorage.getItem(THEME_STORAGE_KEY);
        if (stored === "dark" || stored === "light") {
            setTheme(stored);
            return;
        }
        const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
        setTheme(prefersDark ? "dark" : "light");
    }

    function showToast(message, type = "info", duration = 3200) {
        if (!elements.toast || !message) {
            return;
        }
        elements.toast.textContent = message;
        elements.toast.classList.remove("hidden", "success", "error");
        if (type === "success" || type === "error") {
            elements.toast.classList.add(type);
        }
        if (state.toastTimer) {
            clearTimeout(state.toastTimer);
        }
        state.toastTimer = setTimeout(() => {
            elements.toast.classList.add("hidden");
            elements.toast.classList.remove("success", "error");
            state.toastTimer = null;
        }, duration);
    }

    function setStatus(message, isError = false) {
        if (!elements.status) {
            return;
        }
        elements.status.textContent = message || "";
        elements.status.classList.remove("error", "success");
        if (!message) {
            return;
        }
        if (isError) {
            elements.status.classList.add("error");
        }
    }

    function setUserName() {
        if (elements.usernameLabel) {
            elements.usernameLabel.textContent = state.currentUser || "User";
        }
    }

    function setLastUpdated() {
        if (!elements.lastUpdated) {
            return;
        }
        const now = new Date();
        elements.lastUpdated.textContent = `Updated ${now.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}`;
    }

    function handleUnauthorized() {
        sessionStorage.removeItem("bankAuthToken");
        sessionStorage.removeItem("bankAuthUser");
        showToast("Session expired. Please sign in again.", "error", 2600);
        setTimeout(() => {
            window.location.href = "index.html";
        }, 800);
    }

    async function authFetch(url, options = {}) {
        const headers = new Headers(options.headers || {});
        headers.set("Authorization", `Bearer ${state.authToken}`);
        const response = await fetch(url, { ...options, headers });
        if (response.status === 401) {
            handleUnauthorized();
            throw new Error("Unauthorized");
        }
        return response;
    }

    function updateClearButton() {
        if (!elements.clearFilter) {
            return;
        }
        const active = state.filter.trim().length > 0;
        elements.clearFilter.disabled = !active;
    }

    function matchesFilter(ledger) {
        if (!state.filter) {
            return true;
        }
        const needle = state.filter.toLowerCase();
        return (ledger.accountNumber || "").toLowerCase().includes(needle)
            || String(ledger.id).includes(needle)
            || ledger.ownerName.toLowerCase().includes(needle)
            || currency.format(ledger.balance).toLowerCase().includes(needle);
    }

    function formatDate(value) {
        if (!value) {
            return "-";
        }
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return "-";
        }
        return date.toLocaleString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function renderTable() {
        if (!elements.tableBody) {
            return;
        }
        elements.tableBody.innerHTML = "";
        const rows = state.ledgers.filter(matchesFilter);
        if (rows.length === 0) {
            const row = document.createElement("tr");
            const cell = document.createElement("td");
            cell.colSpan = 8;
            cell.className = "placeholder";
            cell.textContent = state.ledgers.length === 0
                ? "No accounts available yet."
                : "No accounts match the current filter.";
            row.appendChild(cell);
            elements.tableBody.appendChild(row);
            return;
        }
        rows.forEach(ledger => {
            const row = document.createElement("tr");

            const idCell = document.createElement("td");
            idCell.textContent = ledger.accountNumber || String(ledger.id);
            row.appendChild(idCell);

            const nameCell = document.createElement("td");
            nameCell.textContent = ledger.ownerName;
            row.appendChild(nameCell);

            const balanceCell = document.createElement("td");
            balanceCell.textContent = currency.format(ledger.balance);
            row.appendChild(balanceCell);

            const depositAmountCell = document.createElement("td");
            depositAmountCell.textContent = currency.format(ledger.totalDeposits);
            row.appendChild(depositAmountCell);

            const depositCountCell = document.createElement("td");
            depositCountCell.textContent = String(ledger.depositCount);
            row.appendChild(depositCountCell);

            const withdrawAmountCell = document.createElement("td");
            withdrawAmountCell.textContent = currency.format(ledger.totalWithdrawals);
            row.appendChild(withdrawAmountCell);

            const withdrawCountCell = document.createElement("td");
            withdrawCountCell.textContent = String(ledger.withdrawCount);
            row.appendChild(withdrawCountCell);

            const updatedCell = document.createElement("td");
            updatedCell.textContent = formatDate(ledger.updatedAt);
            row.appendChild(updatedCell);

            elements.tableBody.appendChild(row);
        });
    }

    async function loadAccounts(showToastOnSuccess = false) {
        setStatus("Loading accounts...");
        if (elements.refresh) {
            elements.refresh.disabled = true;
            elements.refresh.setAttribute("aria-busy", "true");
        }
        try {
            const response = await authFetch("/api/accounts/summary");
            const payload = await response.json().catch(() => []);
            if (!response.ok) {
                const message = payload && payload.error ? payload.error : "Unable to load accounts.";
                throw new Error(message);
            }
            state.ledgers = Array.isArray(payload) ? payload.map(item => ({
                id: Number(item.id),
                accountNumber: (() => {
                    const raw = item.accountNo || item.accountNumber;
                    if (raw) {
                        return String(raw);
                    }
                    if (item.id != null) {
                        return String(item.id).padStart(12, "0");
                    }
                    return "";
                })(),
                ownerName: item.ownerName || "",
                balance: Number(item.balance || 0),
                totalDeposits: Number(item.totalDeposits || 0),
                totalWithdrawals: Number(item.totalWithdrawals || 0),
                depositCount: Number(item.depositCount || 0),
                withdrawCount: Number(item.withdrawCount || 0),
                updatedAt: item.updatedAt || ""
            })) : [];
            renderTable();
            setStatus("");
            setLastUpdated();
            if (showToastOnSuccess) {
                showToast("Accounts refreshed", "success");
            }
        } catch (error) {
            console.error("Failed to load accounts", error);
            setStatus(error.message || "Unable to load accounts.", true);
            showToast("Failed to load accounts", "error");
        } finally {
            if (elements.refresh) {
                elements.refresh.disabled = false;
                elements.refresh.removeAttribute("aria-busy");
            }
        }
    }

    function bindEvents() {
        elements.filter?.addEventListener("input", event => {
            state.filter = event.target.value;
            updateClearButton();
            renderTable();
        });
        elements.clearFilter?.addEventListener("click", () => {
            if (!elements.filter) {
                return;
            }
            elements.filter.value = "";
            state.filter = "";
            updateClearButton();
            renderTable();
            elements.filter.focus();
        });
        elements.refresh?.addEventListener("click", () => loadAccounts(true));
        document.addEventListener("visibilitychange", () => {
            if (!document.hidden) {
                loadAccounts();
            }
        });
    }

    function init() {
        applyStoredTheme();
        setUserName();
        updateClearButton();
        bindEvents();
        loadAccounts();
    }

    init();
})();
