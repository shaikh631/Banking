(() => {
	const elements = {
		loginForm: document.getElementById("login-form"),
		loginStatus: document.getElementById("login-status"),
		authOverlay: document.getElementById("auth-overlay"),
		dashboard: document.getElementById("dashboard"),
		themeToggle: document.getElementById("theme-toggle"),
		themeIcon: document.getElementById("theme-icon"),
		usernameLabel: document.getElementById("current-username"),
		lastUpdated: document.getElementById("last-updated"),
		logoutBtn: document.getElementById("logout-btn"),
		refreshBtn: document.getElementById("refresh-dashboard"),
		toast: document.getElementById("toast"),
		accountSearch: document.getElementById("account-search"),
		accountSortField: document.getElementById("account-sort-field"),
		accountSortDirection: document.getElementById("account-sort-direction"),
		accountsBody: document.getElementById("accounts-body"),
		accountsStatus: document.getElementById("accounts-status"),
		metricBalanceValue: document.getElementById("metric-balance-value"),
		metricAccountsValue: document.getElementById("metric-accounts-value"),
		metricWithdrawValue: document.getElementById("metric-withdraw-value"),
		metricDepositValue: document.getElementById("metric-deposit-value"),
		chartBalance: document.getElementById("chart-balance"),
		chartAccounts: document.getElementById("chart-accounts"),
		chartWithdraw: document.getElementById("chart-withdraw"),
		chartDeposit: document.getElementById("chart-deposit"),
		createAccountBtn: document.getElementById("open-create-account"),
		accountModal: document.getElementById("account-modal"),
		accountModalForm: document.getElementById("create-account-form"),
		accountOwnerInput: document.getElementById("new-account-owner"),
		accountBalanceInput: document.getElementById("new-account-balance"),
		accountModalStatus: document.getElementById("account-modal-status"),
		accountModalClose: document.getElementById("close-account-modal"),
		accountModalCancel: document.getElementById("cancel-create-account"),
		accountSubmitButton: document.getElementById("submit-create-account")
	};

	const state = {
		authToken: sessionStorage.getItem("bankAuthToken"),
		currentUser: sessionStorage.getItem("bankAuthUser"),
		accounts: [],
		summary: null,
		recentDeposits: [],
		recentWithdrawals: [],
		sort: { field: "accountNumber", direction: "asc" },
		charts: {},
		toastTimer: null,
		isAccountModalOpen: false
	};

	const API = {
		login: "/api/login",
		logout: "/api/logout",
		dashboard: "/api/dashboard",
		accounts: "/api/accounts"
	};

	const currency = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" });
	const integerFormat = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

	const THEME_STORAGE_KEY = "bank-theme";
	const THEME_ICON_PATHS = {
		light: "M12 2a9 9 0 0 0 0 18 7 7 0 0 1 0-18z",
		dark: "M12 6a6 6 0 1 1 0 12 6 6 0 0 1 0-12zm0-4 1.9 3.3 3.6-.6-.6 3.6L20 12l-3.1 2.7.6 3.6-3.6-.6L12 21l-1.9-3.3-3.6.6.6-3.6L4 12l3.1-2.7-.6-3.6 3.6.6z"
	};

	const CHART_STYLES = {
		balance: { borderColor: "#1d4ed8", backgroundColor: "rgba(37, 99, 235, 0.22)" },
		accounts: { borderColor: "#7c3aed", backgroundColor: "rgba(124, 58, 237, 0.2)" },
		withdraw: { borderColor: "#f97316", backgroundColor: "rgba(249, 115, 22, 0.24)" },
		deposit: { borderColor: "#22c55e", backgroundColor: "rgba(34, 197, 94, 0.24)" }
	};

	function parseAmount(raw) {
		if (raw === null || raw === undefined) {
			return 0;
		}
		const value = typeof raw === "number" ? raw : Number(String(raw));
		return Number.isFinite(value) ? value : 0;
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

	function normalizeSummary(summary) {
		if (!summary) {
			return {
				totalBalance: 0,
				accountsCount: 0,
				totalDeposits: 0,
				totalWithdrawals: 0
			};
		}
		return {
			totalBalance: parseAmount(summary.totalBalance),
			accountsCount: Number(summary.accountsCount || 0),
			totalDeposits: parseAmount(summary.totalDeposits),
			totalWithdrawals: parseAmount(summary.totalWithdrawals)
		};
	}

	function normalizeTransaction(transaction) {
		return {
			id: Number(transaction.id),
			accountId: Number(transaction.accountId),
			type: transaction.type,
			amount: parseAmount(transaction.amount),
			note: transaction.note || "",
			createdAt: parseDate(transaction.createdAt)
		};
	}

	function setLoginStatus(type, message) {
		if (!elements.loginStatus) {
			return;
		}
		elements.loginStatus.textContent = message || "";
		elements.loginStatus.className = "status";
		if (type === "error") {
			elements.loginStatus.classList.add("error");
		} else if (type === "success") {
			elements.loginStatus.classList.add("success");
		}
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

	function getThemeMode() {
		return document.body.getAttribute("data-theme") === "dark" ? "dark" : "light";
	}

	function refreshChartsForTheme() {
		if (state.summary) {
			renderCharts();
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
		refreshChartsForTheme();
	}

	function toggleTheme() {
		const next = getThemeMode() === "dark" ? "light" : "dark";
		setTheme(next);
	}

function getPreferredTheme() {
                if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
                        return "dark";
                }
                return "light";
        }

        function applyStoredTheme() {
                const stored = localStorage.getItem(THEME_STORAGE_KEY);
                if (stored === "dark" || stored === "light") {
                        setTheme(stored);
                        return;
                }
                setTheme(getPreferredTheme());
	}

	function updateAuthUI() {
		if (state.authToken) {
			elements.authOverlay?.classList.add("hidden");
			elements.dashboard?.classList.remove("hidden");
			if (elements.usernameLabel) {
				elements.usernameLabel.textContent = state.currentUser || "User";
			}
		} else {
			elements.authOverlay?.classList.remove("hidden");
			elements.dashboard?.classList.add("hidden");
			closeAccountModal();
			if (elements.usernameLabel) {
				elements.usernameLabel.textContent = "User";
			}
		}
	}

	function destroyChart(id) {
		if (state.charts[id]) {
			state.charts[id].destroy();
			delete state.charts[id];
		}
	}

	function destroyAllCharts() {
		Object.keys(state.charts).forEach(destroyChart);
	}

	function setAuthState(token, username) {
		state.authToken = token;
		state.currentUser = username;
		sessionStorage.setItem("bankAuthToken", token);
		sessionStorage.setItem("bankAuthUser", username);
		updateAuthUI();
	}

	function clearAuthState() {
		destroyAllCharts();
		state.authToken = null;
		state.currentUser = null;
		state.summary = null;
		state.accounts = [];
		state.recentDeposits = [];
		state.recentWithdrawals = [];
		sessionStorage.removeItem("bankAuthToken");
		sessionStorage.removeItem("bankAuthUser");
		updateAuthUI();
		renderMetrics();
		renderAccounts();
		if (elements.lastUpdated) {
			elements.lastUpdated.textContent = "Updated just now";
		}
	}

	function handleUnauthorized() {
		clearAuthState();
		showToast("Session expired. Please sign in again.", "error");
	}

	async function postJson(url, payload) {
		const response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload)
		});
		const data = await response.json().catch(() => ({}));
		if (!response.ok) {
			throw new Error(data.error || "Unexpected server error");
		}
		return data;
	}

	async function authFetch(url, options = {}) {
		if (!state.authToken) {
			throw new Error("Not authenticated");
		}
		const headers = new Headers(options.headers || {});
		headers.set("Authorization", `Bearer ${state.authToken}`);
		const response = await fetch(url, { ...options, headers });
		if (response.status === 401) {
			handleUnauthorized();
			throw new Error("Unauthorized");
		}
		return response;
	}

	async function fetchDashboardSummary() {
		const response = await authFetch(API.dashboard);
		return response.json();
	}

	async function fetchAccounts() {
		const response = await authFetch(API.accounts);
		return response.json();
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

	function formatTxnLabel(value) {
		const date = parseDate(value);
		if (!date) {
			return "";
		}
		return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
	}

	function setAccountsStatus(message, isError = false) {
		if (!elements.accountsStatus) {
			return;
		}
		elements.accountsStatus.textContent = message || "";
		elements.accountsStatus.classList.remove("error", "success");
		if (!message) {
			return;
		}
		if (isError) {
			elements.accountsStatus.classList.add("error");
		}
	}

	function setAccountModalStatus(message, type) {
		const statusEl = elements.accountModalStatus;
		if (!statusEl) {
			return;
		}
		if (!message) {
			statusEl.textContent = "";
			statusEl.className = "status modal-status";
			return;
		}
		statusEl.textContent = message;
		statusEl.className = "status modal-status";
		if (type === "error") {
			statusEl.classList.add("error");
		} else if (type === "success") {
			statusEl.classList.add("success");
		}
	}

	function toggleModalSubmitting(submitting) {
		if (elements.accountModalForm) {
			if (submitting) {
				elements.accountModalForm.setAttribute("aria-busy", "true");
			} else {
				elements.accountModalForm.removeAttribute("aria-busy");
			}
		}
		const controls = [
			elements.accountOwnerInput,
			elements.accountBalanceInput,
			elements.accountSubmitButton,
			elements.accountModalCancel
		];
		controls.forEach(control => {
			if (control) {
				control.disabled = submitting;
			}
		});
	}

	function openAccountModal() {
		if (!elements.accountModal || !state.authToken) {
			return;
		}
		state.isAccountModalOpen = true;
		elements.accountModal.classList.remove("hidden");
		elements.accountModal.setAttribute("aria-hidden", "false");
		document.body.classList.add("modal-open");
		elements.accountModalForm?.reset();
		toggleModalSubmitting(false);
		setAccountModalStatus("");
		window.setTimeout(() => {
			elements.accountOwnerInput?.focus();
		}, 50);
	}

	function closeAccountModal() {
		if (!elements.accountModal) {
			return;
		}
		state.isAccountModalOpen = false;
		elements.accountModal.classList.add("hidden");
		elements.accountModal.setAttribute("aria-hidden", "true");
		document.body.classList.remove("modal-open");
		toggleModalSubmitting(false);
		setAccountModalStatus("");
		elements.accountModalForm?.reset();
	}

	function handleModalKeydown(event) {
		if (event.key !== "Escape") {
			return;
		}
		if (!state.isAccountModalOpen || elements.accountSubmitButton?.disabled) {
			return;
		}
		event.preventDefault();
		closeAccountModal();
	}

	function renderMetrics() {
		const summary = state.summary || {
			totalBalance: 0,
			accountsCount: 0,
			totalDeposits: 0,
			totalWithdrawals: 0
		};
		if (elements.metricBalanceValue) {
			elements.metricBalanceValue.textContent = currency.format(summary.totalBalance);
		}
		if (elements.metricAccountsValue) {
			elements.metricAccountsValue.textContent = integerFormat.format(summary.accountsCount);
		}
		if (elements.metricWithdrawValue) {
			elements.metricWithdrawValue.textContent = currency.format(summary.totalWithdrawals);
		}
		if (elements.metricDepositValue) {
			elements.metricDepositValue.textContent = currency.format(summary.totalDeposits);
		}
	}

	function updateSortButton() {
		if (elements.accountSortDirection) {
			elements.accountSortDirection.setAttribute("data-direction", state.sort.direction);
		}
	}

	function renderAccounts() {
		if (!elements.accountsBody) {
			return;
		}
		const searchTerm = (elements.accountSearch?.value || "").trim().toLowerCase();
		const sortField = state.sort.field;
		const sortDirection = state.sort.direction === "desc" ? "desc" : "asc";

		const filtered = state.accounts.filter(account => {
			if (!searchTerm) {
				return true;
			}
			const accountNumber = (account.accountNumber || "").toLowerCase();
			const numberMatch = accountNumber.includes(searchTerm);
			const idMatch = String(account.id).includes(searchTerm);
			const nameMatch = account.ownerName.toLowerCase().includes(searchTerm);
			const balanceMatch = currency.format(account.balance).toLowerCase().includes(searchTerm);
			return numberMatch || idMatch || nameMatch || balanceMatch;
		});

		filtered.sort((a, b) => {
			const multiplier = sortDirection === "desc" ? -1 : 1;
			if (sortField === "accountNumber") {
				return a.accountNumber.localeCompare(b.accountNumber) * multiplier;
			}
			if (sortField === "ownerName") {
				return a.ownerName.localeCompare(b.ownerName) * multiplier;
			}
			if (sortField === "balance") {
				return (a.balance - b.balance) * multiplier;
			}
			return (a.id - b.id) * multiplier;
		});

		elements.accountsBody.innerHTML = "";

		if (filtered.length === 0) {
			const row = document.createElement("tr");
			const cell = document.createElement("td");
			cell.colSpan = 4;
			cell.className = "placeholder";
			cell.textContent = state.accounts.length === 0
				? "No accounts available yet."
				: "No accounts match the current filters.";
			row.appendChild(cell);
			elements.accountsBody.appendChild(row);
			return;
		}

		filtered.forEach(account => {
			const row = document.createElement("tr");

			const idCell = document.createElement("td");
			idCell.textContent = account.accountNumber || String(account.id);
			row.appendChild(idCell);

			const nameCell = document.createElement("td");
			nameCell.textContent = account.ownerName;
			row.appendChild(nameCell);

			const balanceCell = document.createElement("td");
			balanceCell.textContent = currency.format(account.balance);
			row.appendChild(balanceCell);

			const updatedCell = document.createElement("td");
			updatedCell.textContent = formatDateTime(account.updatedAt) || "-";
			row.appendChild(updatedCell);

			elements.accountsBody.appendChild(row);
		});
	}

	function getChartCommonOptions() {
		const theme = getThemeMode();
		const textColor = theme === "dark" ? "#f8fafc" : "#0f172a";
		const gridColor = theme === "dark" ? "rgba(148, 163, 184, 0.18)" : "rgba(100, 116, 139, 0.25)";
		return {
			responsive: true,
			maintainAspectRatio: false,
			plugins: {
				legend: { display: false }
			},
			scales: {
				x: {
					ticks: { color: textColor },
					grid: { color: gridColor, drawBorder: false }
				},
				y: {
					ticks: { color: textColor },
					grid: { color: gridColor, drawBorder: false }
				}
			}
		};
	}

	function renderBalanceChart(summary) {
		if (!elements.chartBalance || typeof Chart === "undefined") {
			return;
		}
		destroyChart("balance");
		const ctx = elements.chartBalance.getContext("2d");
		const theme = getThemeMode();
		const textColor = theme === "dark" ? "#f8fafc" : "#1f2937";
		const gridColor = theme === "dark" ? "rgba(148, 163, 184, 0.22)" : "rgba(100, 116, 139, 0.2)";
		const segments = [
			{ label: "Total Balance", value: Math.max(0, summary.totalBalance), color: "rgba(29, 78, 216, 0.8)" },
			{ label: "Total Deposits", value: Math.max(0, summary.totalDeposits), color: "rgba(34, 197, 94, 0.75)" },
			{ label: "Total Withdrawals", value: Math.max(0, summary.totalWithdrawals), color: "rgba(249, 115, 22, 0.78)" }
		];
		const labels = segments.map(entry => entry.label);
		const data = segments.map(entry => entry.value);
		const background = segments.map(entry => entry.color);
		state.charts.balance = new Chart(ctx, {
			type: "bar",
			data: {
				labels,
				datasets: [{
					data,
					backgroundColor: background,
					borderColor: background.map(color => color.replace(/0\.(\d+)/, "1")),
					borderWidth: 1.25,
					borderRadius: 12,
					maxBarThickness: 42
				}]
			},
			options: {
				indexAxis: "y",
				plugins: {
					legend: { display: false },
					tooltip: {
						callbacks: {
							label: context => `${context.label}: ${currency.format(context.parsed.x)}`
						}
					}
				},
				layout: { padding: { left: 4, right: 12, top: 6, bottom: 6 } },
				scales: {
					x: {
						beginAtZero: true,
						ticks: {
							color: textColor,
							callback: value => currency.format(value)
						},
						grid: { color: gridColor, drawBorder: false }
					},
					y: {
						grid: { display: false },
						ticks: { color: textColor }
					}
				}
			}
		});
	}

	function renderAccountsChart(accounts) {
		if (!elements.chartAccounts || typeof Chart === "undefined") {
			return;
		}
		destroyChart("accounts");
		const ctx = elements.chartAccounts.getContext("2d");
		const theme = getThemeMode();
		const textColor = theme === "dark" ? "#f8fafc" : "#1f2937";
		const gridColor = theme === "dark" ? "rgba(148, 163, 184, 0.18)" : "rgba(100, 116, 139, 0.18)";
		const sortedAccounts = Array.isArray(accounts)
			? [...accounts].sort((a, b) => b.balance - a.balance)
			: [];
		const topAccounts = sortedAccounts.slice(0, 5);
		const palette = [
			"rgba(124, 58, 237, 0.8)",
			"rgba(37, 99, 235, 0.8)",
			"rgba(16, 185, 129, 0.78)",
			"rgba(249, 115, 22, 0.8)",
			"rgba(239, 68, 68, 0.82)"
		];
		const fallbackLabel = topAccounts.length === 0 ? ["Add accounts to see rankings"] : [];
		const labels = topAccounts.length > 0
			? topAccounts.map(account => `${account.accountNumber || account.id} • ${account.ownerName}`)
			: fallbackLabel;
		const data = topAccounts.length > 0 ? topAccounts.map(account => account.balance) : [0];
		const background = topAccounts.length > 0
			? topAccounts.map((_, index) => palette[index % palette.length])
			: [CHART_STYLES.accounts.backgroundColor];
		state.charts.accounts = new Chart(ctx, {
			type: "bar",
			data: {
				labels,
				datasets: [{
					data,
					backgroundColor: background,
					borderColor: background.map(color => color.replace(/0\.(\d+)/, "1")),
					borderRadius: 14,
					borderWidth: 1.1,
					maxBarThickness: 44
				}]
			},
			options: {
				...getChartCommonOptions(),
				indexAxis: "y",
				scales: {
					x: {
						beginAtZero: true,
						ticks: {
							color: textColor,
							callback: value => currency.format(value)
						},
						grid: { color: gridColor, drawBorder: false }
					},
					y: {
						grid: { display: false },
						ticks: {
							color: textColor,
							font: { size: 11 }
						}
					}
				},
				plugins: {
					legend: { display: false },
					tooltip: {
						callbacks: {
							label: context => `${context.label}: ${currency.format(context.parsed.x)}`
						}
					}
				}
			}
		});
	}

	function renderTransactionChart(kind, transactions, canvas, style) {
		if (!canvas || typeof Chart === "undefined") {
			return;
		}
		destroyChart(kind);
		const ctx = canvas.getContext("2d");
		const sorted = [...transactions].sort((a, b) => {
			const aTime = a.createdAt ? a.createdAt.getTime() : 0;
			const bTime = b.createdAt ? b.createdAt.getTime() : 0;
			return aTime - bTime;
		});
		const labels = sorted.length > 0 ? sorted.map(txn => formatTxnLabel(txn.createdAt)) : ["No data"];
		const data = sorted.length > 0 ? sorted.map(txn => txn.amount) : [0];
		const baseOptions = getChartCommonOptions();
		state.charts[kind] = new Chart(ctx, {
			type: "line",
			data: {
				labels,
				datasets: [{
					data,
					fill: true,
					borderColor: style.borderColor,
					backgroundColor: style.backgroundColor,
					tension: 0.35,
					pointRadius: sorted.length > 0 ? 3 : 0,
					pointHoverRadius: 4
				}]
			},
			options: {
				...baseOptions,
				scales: {
					...baseOptions.scales,
					y: {
						beginAtZero: true,
						ticks: {
							color: getThemeMode() === "dark" ? "#f8fafc" : "#0f172a",
							callback: value => currency.format(value)
						},
						grid: {
							color: getThemeMode() === "dark" ? "rgba(148, 163, 184, 0.18)" : "rgba(100, 116, 139, 0.25)",
							drawBorder: false
						}
					},
					x: {
						ticks: {
							color: getThemeMode() === "dark" ? "#f8fafc" : "#0f172a"
						},
						grid: { display: false }
					}
				}
			}
		});
	}

	function renderCharts() {
		if (!state.summary) {
			destroyAllCharts();
			return;
		}
		renderBalanceChart(state.summary);
		renderAccountsChart(state.accounts);
		renderTransactionChart("withdraw", state.recentWithdrawals, elements.chartWithdraw, CHART_STYLES.withdraw);
		renderTransactionChart("deposit", state.recentDeposits, elements.chartDeposit, CHART_STYLES.deposit);
	}

	function updateLastUpdated() {
		if (!elements.lastUpdated) {
			return;
		}
		const now = new Date();
		elements.lastUpdated.textContent = `Updated ${now.toLocaleTimeString(undefined, {
			hour: "2-digit",
			minute: "2-digit"
		})}`;
	}

	async function loadDashboardData(showSuccessToast = false) {
		if (!state.authToken) {
			return;
		}
		setAccountsStatus("Loading dashboard data...");
		if (elements.refreshBtn) {
			elements.refreshBtn.disabled = true;
			elements.refreshBtn.setAttribute("aria-busy", "true");
		}
		try {
			const [dashboardRaw, accountsRaw] = await Promise.all([
				fetchDashboardSummary(),
				fetchAccounts()
			]);
			state.summary = normalizeSummary(dashboardRaw.summary);
			state.recentDeposits = Array.isArray(dashboardRaw.recentDeposits)
				? dashboardRaw.recentDeposits.map(normalizeTransaction)
				: [];
			state.recentWithdrawals = Array.isArray(dashboardRaw.recentWithdrawals)
				? dashboardRaw.recentWithdrawals.map(normalizeTransaction)
				: [];
			state.accounts = Array.isArray(accountsRaw)
				? accountsRaw.map(normalizeAccount)
				: [];
			renderMetrics();
			renderAccounts();
			renderCharts();
			updateLastUpdated();
			setAccountsStatus("");
			if (showSuccessToast) {
				showToast("Dashboard refreshed", "success");
			}
		} catch (error) {
			console.error("Failed to load dashboard", error);
			setAccountsStatus(error.message || "Unable to load dashboard data.", true);
			showToast("Failed to refresh dashboard", "error");
		} finally {
			if (elements.refreshBtn) {
				elements.refreshBtn.disabled = false;
				elements.refreshBtn.removeAttribute("aria-busy");
			}
		}
	}

	async function handleAccountCreate(event) {
		event.preventDefault();
		if (!state.authToken || !elements.accountModalForm) {
			if (!state.authToken) {
				closeAccountModal();
			}
			return;
		}
		const ownerName = (elements.accountOwnerInput?.value || "").trim();
		if (!ownerName) {
			setAccountModalStatus("Enter the account holder name.", "error");
			elements.accountOwnerInput?.focus();
			return;
		}
		const rawBalance = elements.accountBalanceInput?.value ?? "";
		const amount = rawBalance === "" ? 0 : Number(rawBalance);
		if (Number.isNaN(amount) || amount < 0) {
			setAccountModalStatus("Initial balance must be zero or a positive amount.", "error");
			elements.accountBalanceInput?.focus();
			return;
		}
		setAccountModalStatus("Creating account...");
		toggleModalSubmitting(true);
		try {
			const response = await authFetch(API.accounts, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					ownerName,
					initialBalance: amount > 0 ? amount.toFixed(2) : "0"
				})
			});
			const payload = await response.json().catch(() => ({}));
			if (!response.ok) {
				const message = payload && payload.error ? payload.error : "Unable to create account.";
				throw new Error(message);
			}
			const created = normalizeAccount(payload);
			state.accounts.push(created);
			renderAccounts();
			closeAccountModal();
			const accountLabel = created.accountNumber || `#${created.id}`;
			showToast(`Account ${accountLabel} created for ${created.ownerName}.`, "success");
			try {
				await loadDashboardData();
			} catch (refreshError) {
				console.error("Dashboard refresh failed after account creation", refreshError);
			}
		} catch (error) {
			console.error("Account creation failed", error);
			if (!state.authToken) {
				closeAccountModal();
			} else {
				setAccountModalStatus(error.message || "Unable to create account.", "error");
			}
		} finally {
			toggleModalSubmitting(false);
		}
	}

	async function handleLogin(event) {
		event.preventDefault();
		if (!elements.loginForm) {
			return;
		}
		const formData = new FormData(elements.loginForm);
		const username = String(formData.get("username") || "").trim();
		const password = String(formData.get("password") || "");
		if (!username || !password) {
			setLoginStatus("error", "Username and password are required.");
			return;
		}
		setLoginStatus("", "Signing in...");
		try {
			const result = await postJson(API.login, { username, password });
			setAuthState(result.token, result.username);
			elements.loginForm.reset();
			setLoginStatus("success", "Signed in successfully.");
			showToast(`Welcome back, ${result.username}!`, "success");
			await loadDashboardData();
		} catch (error) {
			console.error("Login failed", error);
			setLoginStatus("error", error.message || "Invalid credentials.");
		}
	}

	async function handleLogout() {
		if (!state.authToken) {
			clearAuthState();
			return;
		}
		try {
			await authFetch(API.logout, { method: "POST" });
		} catch (error) {
			console.warn("Logout failed", error);
		} finally {
			clearAuthState();
			showToast("Signed out.");
		}
	}

	function bindEvents() {
		elements.loginForm?.addEventListener("submit", handleLogin);
		elements.logoutBtn?.addEventListener("click", handleLogout);
		elements.refreshBtn?.addEventListener("click", () => loadDashboardData(true));
		elements.themeToggle?.addEventListener("click", toggleTheme);
		elements.createAccountBtn?.addEventListener("click", () => {
			if (!state.authToken) {
				showToast("Sign in to create accounts.", "error");
				return;
			}
			openAccountModal();
		});
		elements.accountModalClose?.addEventListener("click", () => {
			if (!elements.accountSubmitButton?.disabled) {
				closeAccountModal();
			}
		});
		elements.accountModalCancel?.addEventListener("click", event => {
			event.preventDefault();
			if (!elements.accountSubmitButton?.disabled) {
				closeAccountModal();
			}
		});
		elements.accountModalForm?.addEventListener("submit", handleAccountCreate);
		elements.accountModal?.addEventListener("click", event => {
			if (event.target === elements.accountModal && !elements.accountSubmitButton?.disabled) {
				closeAccountModal();
			}
		});
		if (elements.accountModal) {
			document.addEventListener("keydown", handleModalKeydown);
		}
		elements.accountSearch?.addEventListener("input", () => renderAccounts());
		elements.accountSortField?.addEventListener("change", event => {
			state.sort.field = event.target.value;
			renderAccounts();
		});
		elements.accountSortDirection?.addEventListener("click", () => {
			state.sort.direction = state.sort.direction === "asc" ? "desc" : "asc";
			updateSortButton();
			renderAccounts();
		});
		document.addEventListener("visibilitychange", () => {
			if (!document.hidden && state.authToken) {
				loadDashboardData();
			}
		});
	}

	function initializeSortControls() {
		if (elements.accountSortField && state.sort.field) {
			elements.accountSortField.value = state.sort.field;
		}
		updateSortButton();
	}

	function init() {
		applyStoredTheme();
		initializeSortControls();
		updateAuthUI();
		renderMetrics();
		renderAccounts();
		bindEvents();
		if (state.authToken) {
			loadDashboardData();
		}
	}

	init();
})();
