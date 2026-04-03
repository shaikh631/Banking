(() => {
    const body = document.body;
    const formType = body.dataset.formType;
    if (!formType || !["deposit", "withdraw"].includes(formType)) {
        return;
    }

    const elements = {
        form: document.getElementById("transaction-form"),
        accountSelect: document.getElementById("account-select"),
        amountInput: document.getElementById("amount"),
        balanceLabel: document.getElementById("selected-account-balance"),
        usernameLabel: document.getElementById("current-username"),
        status: document.getElementById("form-status"),
        toast: document.getElementById("toast"),
        transactionsList: document.getElementById("transaction-list"),
        resetButton: document.getElementById("reset-form"),
        logoutButton: document.getElementById("logout-btn"),
        themeToggle: document.getElementById("theme-toggle"),
        themeIcon: document.getElementById("theme-icon")
    };

    const state = {
        authToken: sessionStorage.getItem("bankAuthToken"),
        currentUser: sessionStorage.getItem("bankAuthUser"),
        accounts: [],
        selectedAccountId: null,
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

    const ACTION_LABEL = formType === "deposit" ? "Deposit" : "Withdrawal";
    const SUCCESS_MESSAGE = formType === "deposit" ? "Deposit completed successfully." : "Withdrawal completed successfully.";
    const TRANSACTION_FILTER = formType === "deposit" ? "DEPOSIT" : "WITHDRAW";

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

    async function fetchAccounts() {
        try {
            const response = await authFetch("/api/accounts");
            const payload = await response.json().catch(() => []);
            if (!response.ok) {
                const message = payload && payload.error ? payload.error : "Unable to load accounts.";
                throw new Error(message);
            }
            state.accounts = Array.isArray(payload) ? payload.map(normalizeAccount) : [];
            renderAccountOptions();
        } catch (error) {
            console.error("Failed to load accounts", error);
            setFormStatus("Unable to load accounts. Refresh and try again.", "error");
        }
    }

    function renderAccountOptions() {
        if (!elements.accountSelect) {
            return;
        }
        const currentValue = elements.accountSelect.value;
        elements.accountSelect.innerHTML = "";
        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Select an account";
        placeholder.disabled = true;
        elements.accountSelect.appendChild(placeholder);

        state.accounts.forEach(account => {
            const option = document.createElement("option");
            option.value = String(account.id);
            option.textContent = `${account.accountNumber || account.id} • ${account.ownerName}`;
            option.dataset.balance = String(account.balance);
            elements.accountSelect.appendChild(option);
        });

        const hasCurrent = currentValue && state.accounts.some(account => String(account.id) === currentValue);
        placeholder.selected = !hasCurrent && state.accounts.length !== 1;

        if (hasCurrent) {
            elements.accountSelect.value = currentValue;
            updateSelectedAccount(Number(currentValue));
        } else if (state.accounts.length === 1) {
            const onlyAccount = state.accounts[0];
            elements.accountSelect.value = String(onlyAccount.id);
            updateSelectedAccount(onlyAccount.id);
        } else {
            setSelectedAccount(null);
        }
    }

    function setSelectedAccount(accountId) {
        state.selectedAccountId = accountId;
        const account = state.accounts.find(item => item.id === accountId) || null;
        updateBalanceDisplay(account);
        if (accountId !== null) {
            loadRecentTransactions(accountId);
        } else if (elements.transactionsList) {
            elements.transactionsList.innerHTML = "";
            const empty = document.createElement("li");
            empty.className = "empty-state";
            empty.textContent = "Select an account to view the latest activity.";
            elements.transactionsList.appendChild(empty);
        }
    }

    function updateSelectedAccount(rawValue) {
        const accountId = Number(rawValue);
        if (Number.isFinite(accountId)) {
            setSelectedAccount(accountId);
        } else {
            setSelectedAccount(null);
        }
    }

    function updateBalanceDisplay(account) {
        if (!elements.balanceLabel) {
            return;
        }
        if (!account) {
            elements.balanceLabel.textContent = "$0.00";
            return;
        }
        elements.balanceLabel.textContent = currency.format(account.balance);
    }

    async function loadRecentTransactions(accountId) {
        if (!elements.transactionsList) {
            return;
        }
        elements.transactionsList.innerHTML = "";
        const loading = document.createElement("li");
        loading.className = "empty-state";
        loading.textContent = "Loading recent activity...";
        elements.transactionsList.appendChild(loading);
        try {
            const response = await authFetch(`/api/accounts/${accountId}/transactions?limit=8`);
            const payload = await response.json().catch(() => []);
            if (!response.ok) {
                const message = payload && payload.error ? payload.error : "Unable to load recent activity.";
                throw new Error(message);
            }
            const transactions = Array.isArray(payload) ? payload : [];
            renderTransactions(transactions.filter(txn => txn.type === TRANSACTION_FILTER));
        } catch (error) {
            console.error("Failed to load transactions", error);
            elements.transactionsList.innerHTML = "";
            const failed = document.createElement("li");
            failed.className = "empty-state";
            failed.textContent = "Unable to load recent activity.";
            elements.transactionsList.appendChild(failed);
        }
    }

    function renderTransactions(transactions) {
        if (!elements.transactionsList) {
            return;
        }
        elements.transactionsList.innerHTML = "";
        if (!transactions || transactions.length === 0) {
            const empty = document.createElement("li");
            empty.className = "empty-state";
            empty.textContent = `No recent ${formType} transactions.`;
            elements.transactionsList.appendChild(empty);
            return;
        }
        transactions
            .map(txn => ({
                id: Number(txn.id),
                amount: parseAmount(txn.amount),
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
                label.textContent = `${ACTION_LABEL} #${txn.id}`;
                const timestamp = document.createElement("span");
                timestamp.textContent = formatDateTime(txn.createdAt) || "Unknown time";
                meta.appendChild(label);
                meta.appendChild(timestamp);

                const amount = document.createElement("strong");
                amount.textContent = currency.format(txn.amount);

                item.appendChild(meta);
                item.appendChild(amount);
                elements.transactionsList.appendChild(item);
            });
    }

    async function submitTransaction(event) {
        event.preventDefault();
        if (!state.selectedAccountId) {
            setFormStatus("Select an account before submitting.", "error");
            return;
        }
        const rawAmount = Number(elements.amountInput?.value || "0");
        const amount = Number.isFinite(rawAmount) ? rawAmount : 0;
        if (amount <= 0) {
            setFormStatus("Enter an amount greater than zero.", "error");
            return;
        }
        const account = state.accounts.find(item => item.id === state.selectedAccountId);
        if (formType === "withdraw" && account && amount > account.balance) {
            setFormStatus("Amount exceeds the available balance.", "error");
            return;
        }
        setFormStatus(`${ACTION_LABEL} in progress...`);
        try {
            const response = await authFetch(`/api/accounts/${state.selectedAccountId}/${formType}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ amount: amount.toFixed(2) })
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                const message = payload && payload.error ? payload.error : `Unable to complete the ${formType}.`;
                throw new Error(message);
            }
            const updated = normalizeAccount(payload);
            updateAccountState(updated);
            elements.amountInput.value = "";
            setFormStatus(`${SUCCESS_MESSAGE} New balance: ${currency.format(updated.balance)}.`, "success");
            showToast(`${SUCCESS_MESSAGE}`, "success");
            loadRecentTransactions(updated.id);
        } catch (error) {
            console.error("Transaction failed", error);
            setFormStatus(error.message || `Unable to complete the ${formType}.`, "error");
            showToast(`Failed to process the ${formType}.`, "error");
        }
    }

    function updateAccountState(updatedAccount) {
        state.accounts = state.accounts.map(account =>
            account.id === updatedAccount.id ? { ...account, ...updatedAccount } : account
        );
        renderAccountOptions();
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

    function bindEvents() {
        elements.form?.addEventListener("submit", submitTransaction);
        elements.accountSelect?.addEventListener("change", event => updateSelectedAccount(event.target.value));
        elements.themeToggle?.addEventListener("click", toggleTheme);
        elements.logoutButton?.addEventListener("click", handleLogout);
        elements.resetButton?.addEventListener("click", resetAmountField);
    }

    async function init() {
        applyStoredTheme();
        setUserName();
        bindEvents();
        await fetchAccounts();
    }

    init();
})();
