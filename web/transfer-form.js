(() => {
    const body = document.body;
    if (!body || body.dataset.formType !== "transfer") {
        return;
    }

    const elements = {
        form: document.getElementById("transfer-form"),
        fromSelect: document.getElementById("from-account-select"),
        toSelect: document.getElementById("to-account-select"),
        amountInput: document.getElementById("amount"),
        fromBalanceLabel: document.getElementById("from-account-balance"),
        toBalanceLabel: document.getElementById("to-account-balance"),
        status: document.getElementById("form-status"),
        toast: document.getElementById("toast"),
        resetButton: document.getElementById("reset-form"),
        swapButton: document.getElementById("swap-accounts"),
        history: document.getElementById("transfer-history"),
        usernameLabel: document.getElementById("current-username"),
        logoutButton: document.getElementById("logout-btn"),
        themeToggle: document.getElementById("theme-toggle"),
        themeIcon: document.getElementById("theme-icon"),
        submitButton: document.querySelector("#transfer-form button[type=\"submit\"]")
    };

    const state = {
        authToken: sessionStorage.getItem("bankAuthToken"),
        currentUser: sessionStorage.getItem("bankAuthUser"),
        accounts: [],
        fromAccountId: null,
        toAccountId: null,
        toastTimer: null
    };

    if (!state.authToken) {
        window.location.href = "index.html";
        return;
    }

    const THEME_STORAGE_KEY = "bank-theme";
    const THEME_ICON_PATHS = {
        light: "M12 2a9 9 0 0 0 0 18 7 7 0 0 1 0-18z",
        dark: "M12 6a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm0-4 1.9 3.3 3.6-.6-.6 3.6L20 12l-3.1 2.7.6 3.6-3.6-.6L12 21l-1.9-3.3-3.6.6.6-3.6L4 12l3.1-2.7-.6-3.6 3.6.6z"
    };

    const currency = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" });

    function parseAmount(value) {
        if (value === null || value === undefined) {
            return 0;
        }
        const number = typeof value === "number" ? value : Number(String(value));
        return Number.isFinite(number) ? number : 0;
    }

    function parseDate(value) {
        if (!value) {
            return null;
        }
        const date = value instanceof Date ? value : new Date(value);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    function normalizeAccount(account) {
        const rawAccountNumber = account.accountNo || account.accountNumber;
        return {
            id: Number(account.id),
            accountNumber: rawAccountNumber
                ? String(rawAccountNumber)
                : account.id != null
                    ? String(account.id).padStart(12, "0")
                    : "",
            ownerName: account.ownerName || "",
            balance: parseAmount(account.balance),
            updatedAt: parseDate(account.updatedAt)
        };
    }

    function formatDateTime(value) {
        const date = parseDate(value);
        if (!date) {
            return "";
        }
        return date.toLocaleString(undefined, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit"
        });
    }

    function setUserName() {
        if (elements.usernameLabel) {
            elements.usernameLabel.textContent = state.currentUser || "User";
        }
    }

    function setTheme(theme) {
        const nextTheme = theme === "dark" ? "dark" : "light";
        document.body.setAttribute("data-theme", nextTheme);
        localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
        if (elements.themeToggle) {
            elements.themeToggle.setAttribute("aria-pressed", String(nextTheme === "dark"));
        }
        if (elements.themeIcon) {
            const path = elements.themeIcon.querySelector("path");
            if (path) {
                path.setAttribute("d", nextTheme === "dark" ? THEME_ICON_PATHS.dark : THEME_ICON_PATHS.light);
            }
        }
    }

    function toggleTheme() {
        const current = document.body.getAttribute("data-theme") === "dark" ? "dark" : "light";
        setTheme(current === "dark" ? "light" : "dark");
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

    function setFormStatus(message, type) {
        if (!elements.status) {
            return;
        }
        if (!message) {
            elements.status.textContent = "";
            elements.status.className = "status form-status";
            return;
        }
        elements.status.textContent = message;
        elements.status.className = "status form-status";
        if (type === "error") {
            elements.status.classList.add("error");
        } else if (type === "success") {
            elements.status.classList.add("success");
        }
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

    function populateSelect(select, targetValue) {
        if (!select) {
            return;
        }
        select.innerHTML = "";
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Select an account";
        placeholder.disabled = true;
        select.appendChild(placeholder);
        let matched = false;
        state.accounts.forEach(account => {
            const option = document.createElement("option");
            option.value = String(account.id);
            option.textContent = `${account.accountNumber || account.id} • ${account.ownerName}`;
            if (targetValue && option.value === targetValue) {
                option.selected = true;
                matched = true;
            }
            select.appendChild(option);
        });
        if (!matched) {
            placeholder.selected = true;
        }
    }

    function ensureValidPair() {
        if (state.accounts.length === 0) {
            state.fromAccountId = null;
            state.toAccountId = null;
            if (elements.fromSelect) {
                elements.fromSelect.selectedIndex = 0;
            }
            if (elements.toSelect) {
                elements.toSelect.selectedIndex = 0;
            }
            return;
        }
        if (!state.fromAccountId && state.accounts.length >= 1) {
            const first = state.accounts[0];
            state.fromAccountId = first.id;
            if (elements.fromSelect) {
                elements.fromSelect.value = String(first.id);
            }
        }
        if ((!state.toAccountId || state.toAccountId === state.fromAccountId) && state.accounts.length >= 2) {
            const candidate = state.accounts.find(account => account.id !== state.fromAccountId);
            if (candidate) {
                state.toAccountId = candidate.id;
                if (elements.toSelect) {
                    elements.toSelect.value = String(candidate.id);
                }
            }
        }
        if (state.accounts.length < 2) {
            state.toAccountId = null;
            if (elements.toSelect) {
                elements.toSelect.selectedIndex = 0;
            }
        } else if (state.fromAccountId && state.toAccountId && state.fromAccountId === state.toAccountId) {
            const fallback = state.accounts.find(account => account.id !== state.fromAccountId);
            if (fallback) {
                state.toAccountId = fallback.id;
                if (elements.toSelect) {
                    elements.toSelect.value = String(fallback.id);
                }
            } else {
                state.toAccountId = null;
                if (elements.toSelect) {
                    elements.toSelect.selectedIndex = 0;
                }
            }
        }
    }

    function updateBalances() {
        const fromAccount = state.accounts.find(account => account.id === state.fromAccountId) || null;
        const toAccount = state.accounts.find(account => account.id === state.toAccountId) || null;
        if (elements.fromBalanceLabel) {
            elements.fromBalanceLabel.textContent = fromAccount ? currency.format(fromAccount.balance) : "$0.00";
        }
        if (elements.toBalanceLabel) {
            elements.toBalanceLabel.textContent = toAccount ? currency.format(toAccount.balance) : "$0.00";
        }
    }

    function syncDisabledOptions() {
        const fromValue = state.fromAccountId ? String(state.fromAccountId) : "";
        const toValue = state.toAccountId ? String(state.toAccountId) : "";
        if (elements.fromSelect) {
            Array.from(elements.fromSelect.options).forEach(option => {
                if (!option.value) {
                    return;
                }
                option.disabled = option.value === toValue;
            });
        }
        if (elements.toSelect) {
            Array.from(elements.toSelect.options).forEach(option => {
                if (!option.value) {
                    return;
                }
                option.disabled = option.value === fromValue;
            });
        }
    }

    function renderEmptyHistory(message) {
        if (!elements.history) {
            return;
        }
        elements.history.innerHTML = "";
        const item = document.createElement("li");
        item.className = "empty-state";
        item.textContent = message;
        elements.history.appendChild(item);
    }

    async function loadRecentTransfers(accountId) {
        if (!elements.history) {
            return;
        }
        elements.history.innerHTML = "";
        const loading = document.createElement("li");
        loading.className = "empty-state";
        loading.textContent = "Loading recent transfers...";
        elements.history.appendChild(loading);
        try {
            const response = await authFetch(`/api/accounts/${accountId}/transactions?limit=12`);
            const payload = await response.json().catch(() => []);
            if (!response.ok) {
                const message = payload && payload.error ? payload.error : "Unable to load transfer history.";
                throw new Error(message);
            }
            const transactions = Array.isArray(payload) ? payload : [];
            renderTransfers(transactions.filter(txn => txn.type === "TRANSFER_OUT" || txn.type === "TRANSFER_IN"));
        } catch (error) {
            console.error("Failed to load transfers", error);
            renderEmptyHistory("Unable to load transfer history.");
        }
    }

    function renderTransfers(transactions) {
        if (!elements.history) {
            return;
        }
        elements.history.innerHTML = "";
        if (!transactions || transactions.length === 0) {
            renderEmptyHistory("No transfer activity yet.");
            return;
        }
        transactions
            .map(txn => ({
                id: Number(txn.id),
                type: typeof txn.type === "string" ? txn.type : "",
                amount: parseAmount(txn.amount),
                note: typeof txn.note === "string" ? txn.note : "",
                createdAt: parseDate(txn.createdAt)
            }))
            .sort((a, b) => {
                const aTime = a.createdAt ? a.createdAt.getTime() : 0;
                const bTime = b.createdAt ? b.createdAt.getTime() : 0;
                return bTime - aTime;
            })
            .forEach(txn => {
                const item = document.createElement("li");
                item.className = "transaction-item";

                const meta = document.createElement("div");
                meta.className = "transaction-meta";
                const label = document.createElement("span");
                const direction = txn.type === "TRANSFER_OUT" ? "Sent" : "Received";
                label.textContent = `${direction} transfer #${txn.id}`;
                const timestamp = document.createElement("span");
                timestamp.textContent = formatDateTime(txn.createdAt) || "Unknown time";
                meta.appendChild(label);
                meta.appendChild(timestamp);

                const note = document.createElement("span");
                note.textContent = txn.note || "";
                if (txn.note) {
                    note.className = "muted small-text";
                    meta.appendChild(note);
                }

                const amount = document.createElement("strong");
                const formattedAmount = currency.format(txn.amount);
                amount.textContent = txn.type === "TRANSFER_OUT" ? `-${formattedAmount}` : `+${formattedAmount}`;

                item.appendChild(meta);
                item.appendChild(amount);
                elements.history.appendChild(item);
            });
    }

    function updateSubmitState() {
        const valid = state.accounts.length >= 2 && Number.isFinite(state.fromAccountId) && Number.isFinite(state.toAccountId) && state.fromAccountId !== state.toAccountId;
        if (elements.submitButton) {
            elements.submitButton.disabled = !valid;
        }
        if (elements.swapButton) {
            elements.swapButton.disabled = !valid;
        }
        if (elements.fromSelect) {
            elements.fromSelect.disabled = state.accounts.length === 0;
        }
        if (elements.toSelect) {
            elements.toSelect.disabled = state.accounts.length <= 1;
        }
    }

    function updateAccountState(updatedAccount) {
        let matched = false;
        state.accounts = state.accounts.map(account => {
            if (account.id === updatedAccount.id) {
                matched = true;
                return { ...account, ...updatedAccount };
            }
            return account;
        });
        if (!matched) {
            state.accounts.push(updatedAccount);
        }
    }

    function setFromAccount(value) {
        state.fromAccountId = Number.isFinite(value) ? value : null;
        if (state.fromAccountId && state.toAccountId === state.fromAccountId) {
            const fallback = state.accounts.find(account => account.id !== state.fromAccountId);
            if (fallback) {
                state.toAccountId = fallback.id;
                if (elements.toSelect) {
                    elements.toSelect.value = String(fallback.id);
                }
            } else {
                state.toAccountId = null;
                if (elements.toSelect) {
                    elements.toSelect.selectedIndex = 0;
                }
            }
        }
        updateBalances();
        syncDisabledOptions();
        updateSubmitState();
        if (state.fromAccountId) {
            loadRecentTransfers(state.fromAccountId);
        } else {
            renderEmptyHistory("Select a source account to see transfer history.");
        }
    }

    function setToAccount(value) {
        state.toAccountId = Number.isFinite(value) ? value : null;
        if (state.toAccountId && state.fromAccountId === state.toAccountId) {
            const fallback = state.accounts.find(account => account.id !== state.toAccountId);
            if (fallback) {
                state.fromAccountId = fallback.id;
                if (elements.fromSelect) {
                    elements.fromSelect.value = String(fallback.id);
                }
                loadRecentTransfers(state.fromAccountId);
            } else {
                state.fromAccountId = null;
                if (elements.fromSelect) {
                    elements.fromSelect.selectedIndex = 0;
                }
                renderEmptyHistory("Select a source account to see transfer history.");
            }
        } else if (state.fromAccountId) {
            loadRecentTransfers(state.fromAccountId);
        }
        updateBalances();
        syncDisabledOptions();
        updateSubmitState();
    }

    async function fetchAccounts() {
        try {
            const response = await authFetch("/api/accounts");
            const payload = await response.json().catch(() => []);
            if (!response.ok) {
                const message = payload && payload.error ? payload.error : "Unable to load accounts.";
                throw new Error(message);
            }
            state.accounts = Array.isArray(payload) ? payload.map(normalizeAccount) : [];
            const previousFrom = state.fromAccountId;
            const previousTo = state.toAccountId;
            state.fromAccountId = state.accounts.some(account => account.id === previousFrom) ? previousFrom : null;
            state.toAccountId = state.accounts.some(account => account.id === previousTo) ? previousTo : null;
            populateSelect(elements.fromSelect, state.fromAccountId ? String(state.fromAccountId) : "");
            populateSelect(elements.toSelect, state.toAccountId ? String(state.toAccountId) : "");
            ensureValidPair();
            updateBalances();
            syncDisabledOptions();
            updateSubmitState();
            if (state.fromAccountId) {
                loadRecentTransfers(state.fromAccountId);
            } else {
                renderEmptyHistory("Select a source account to see transfer history.");
            }
            if (state.accounts.length < 2) {
                setFormStatus("At least two accounts are required to initiate a transfer.", "error");
            } else {
                setFormStatus("");
            }
        } catch (error) {
            console.error("Failed to load accounts", error);
            setFormStatus("Unable to load accounts. Refresh and try again.", "error");
            renderEmptyHistory("Unable to load transfer history.");
        }
    }

    async function submitTransfer(event) {
        event.preventDefault();
        if (!Number.isFinite(state.fromAccountId) || !Number.isFinite(state.toAccountId)) {
            setFormStatus("Select both source and destination accounts.", "error");
            return;
        }
        if (state.fromAccountId === state.toAccountId) {
            setFormStatus("Source and destination accounts must differ.", "error");
            return;
        }
        const rawAmount = Number(elements.amountInput?.value || "0");
        const amount = Number.isFinite(rawAmount) ? rawAmount : 0;
        if (amount <= 0) {
            setFormStatus("Enter an amount greater than zero.", "error");
            return;
        }
        const fromAccount = state.accounts.find(account => account.id === state.fromAccountId);
        if (!fromAccount) {
            setFormStatus("Select a valid source account.", "error");
            return;
        }
        if (amount > fromAccount.balance) {
            setFormStatus("Amount exceeds the available balance.", "error");
            return;
        }
        setFormStatus("Transfer in progress...");
        try {
            const response = await authFetch("/api/transfers", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    fromAccountId: state.fromAccountId,
                    toAccountId: state.toAccountId,
                    amount: amount.toFixed(2)
                })
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                const message = payload && payload.error ? payload.error : "Unable to complete transfer.";
                throw new Error(message);
            }
            const updatedFrom = payload && payload.from ? normalizeAccount(payload.from) : null;
            const updatedTo = payload && payload.to ? normalizeAccount(payload.to) : null;
            if (updatedFrom) {
                updateAccountState(updatedFrom);
            }
            if (updatedTo) {
                updateAccountState(updatedTo);
            }
            updateBalances();
            syncDisabledOptions();
            elements.amountInput.value = "";
            const successBalance = updatedFrom ? currency.format(updatedFrom.balance) : currency.format(fromAccount.balance - amount);
            setFormStatus(`Transfer completed. New source balance: ${successBalance}.`, "success");
            showToast("Transfer completed successfully.", "success");
            updateSubmitState();
            if (state.fromAccountId) {
                loadRecentTransfers(state.fromAccountId);
            }
        } catch (error) {
            console.error("Transfer failed", error);
            setFormStatus(error.message || "Unable to complete transfer.", "error");
            showToast("Failed to process the transfer.", "error");
        }
    }

    async function handleLogout() {
        try {
            await authFetch("/api/logout", { method: "POST" });
        } catch (error) {
            console.warn("Logout request failed", error);
        } finally {
            sessionStorage.removeItem("bankAuthToken");
            sessionStorage.removeItem("bankAuthUser");
            window.location.href = "index.html";
        }
    }

    function resetAmountField() {
        if (elements.amountInput) {
            elements.amountInput.value = "";
            elements.amountInput.focus();
        }
        setFormStatus("");
    }

    function swapAccounts() {
        if (!Number.isFinite(state.fromAccountId) || !Number.isFinite(state.toAccountId)) {
            return;
        }
        const newFrom = state.toAccountId;
        const newTo = state.fromAccountId;
        state.fromAccountId = newFrom;
        state.toAccountId = newTo;
        if (elements.fromSelect) {
            elements.fromSelect.value = String(newFrom);
        }
        if (elements.toSelect) {
            elements.toSelect.value = String(newTo);
        }
        updateBalances();
        syncDisabledOptions();
        updateSubmitState();
        if (state.fromAccountId) {
            loadRecentTransfers(state.fromAccountId);
        }
    }

    function bindEvents() {
        elements.form?.addEventListener("submit", submitTransfer);
        elements.fromSelect?.addEventListener("change", event => {
            const value = event.target.value;
            setFromAccount(value ? Number(value) : null);
        });
        elements.toSelect?.addEventListener("change", event => {
            const value = event.target.value;
            setToAccount(value ? Number(value) : null);
        });
        elements.resetButton?.addEventListener("click", resetAmountField);
        elements.swapButton?.addEventListener("click", swapAccounts);
        elements.themeToggle?.addEventListener("click", toggleTheme);
        elements.logoutButton?.addEventListener("click", handleLogout);
    }

    async function init() {
        applyStoredTheme();
        setUserName();
        bindEvents();
        await fetchAccounts();
    }

    init();
})();
