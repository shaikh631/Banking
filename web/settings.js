(() => {
    const body = document.body;
    if (!body || body.dataset.page !== "settings") {
        return;
    }

    const elements = {
        usernameLabel: document.getElementById("current-username"),
        lastUpdated: document.getElementById("last-updated"),
        profileUsername: document.getElementById("profile-username"),
        profileCreated: document.getElementById("profile-created"),
        profileSession: document.getElementById("profile-session"),
        passwordForm: document.getElementById("password-form"),
        passwordStatus: document.getElementById("password-status"),
        logoutButton: document.getElementById("logout-btn"),
        themeToggle: document.getElementById("theme-toggle"),
        toast: document.getElementById("toast")
    };

    const state = {
        authToken: sessionStorage.getItem("bankAuthToken"),
        currentUser: sessionStorage.getItem("bankAuthUser"),
        profile: null,
        toastTimer: null,
        isSubmittingPassword: false
    };

    if (!state.authToken) {
        window.location.href = "index.html";
        return;
    }

    const THEME_STORAGE_KEY = "bank-theme";

    function setUserName(username) {
        state.currentUser = username || state.currentUser || "User";
        if (state.currentUser) {
            sessionStorage.setItem("bankAuthUser", state.currentUser);
        }
        if (elements.usernameLabel) {
            elements.usernameLabel.textContent = state.currentUser;
        }
        if (elements.profileUsername) {
            elements.profileUsername.textContent = state.currentUser;
        }
    }

    function formatTimestamp(iso, options) {
        if (!iso) {
            return "—";
        }
        const date = new Date(iso);
        if (Number.isNaN(date.getTime())) {
            return "—";
        }
        return date.toLocaleString(undefined, options);
    }

    function updateLastUpdated(date = new Date()) {
        if (!elements.lastUpdated) {
            return;
        }
        elements.lastUpdated.textContent = `Updated ${date.toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit"
        })}`;
    }

    function setProfileSessionInfo() {
        if (!elements.profileSession) {
            return;
        }
        const now = new Date();
        elements.profileSession.textContent = `Active since ${now.toLocaleTimeString(undefined, {
            hour: "2-digit",
            minute: "2-digit"
        })}`;
    }

    function showToast(message, type = "info", duration = 3200) {
        if (!elements.toast || !message) {
            return;
        }
        const toast = elements.toast;
        toast.textContent = message;
        toast.classList.remove("hidden", "success", "error");
        if (type === "success" || type === "error") {
            toast.classList.add(type);
        }
        if (state.toastTimer) {
            clearTimeout(state.toastTimer);
        }
        state.toastTimer = window.setTimeout(() => {
            toast.classList.add("hidden");
            toast.classList.remove("success", "error");
            state.toastTimer = null;
        }, duration);
    }

    function setStatus(element, message, type) {
        if (!element) {
            return;
        }
        if (!message) {
            element.textContent = "";
            element.className = "status form-status";
            return;
        }
        element.textContent = message;
        element.className = "status form-status";
        if (type === "error") {
            element.classList.add("error");
        } else if (type === "success") {
            element.classList.add("success");
        }
    }

    function setPasswordFormSubmitting(submitting) {
        if (!elements.passwordForm) {
            return;
        }
        state.isSubmittingPassword = submitting;
        const formElements = Array.from(elements.passwordForm.elements);
        formElements.forEach(control => {
            control.disabled = submitting && control.type !== "reset";
        });
        if (submitting) {
            elements.passwordForm.setAttribute("aria-busy", "true");
        } else {
            elements.passwordForm.removeAttribute("aria-busy");
        }
    }

    function setTheme(theme) {
        const nextTheme = theme === "dark" ? "dark" : "light";
        document.body.setAttribute("data-theme", nextTheme);
        localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
        if (elements.themeToggle) {
            elements.themeToggle.setAttribute("aria-pressed", String(nextTheme === "dark"));
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

    function handleUnauthorized() {
        sessionStorage.removeItem("bankAuthToken");
        sessionStorage.removeItem("bankAuthUser");
        showToast("Session expired. Please sign in again.", "error", 2600);
        window.setTimeout(() => {
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

    async function loadProfile() {
        try {
            const response = await authFetch("/api/users/me");
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                const message = payload && payload.error ? payload.error : "Unable to load profile.";
                throw new Error(message);
            }
            state.profile = payload;
            setUserName(payload.username);
            if (elements.profileCreated) {
                elements.profileCreated.textContent = formatTimestamp(payload.createdAt, {
                    year: "numeric",
                    month: "long",
                    day: "numeric"
                });
            }
            updateLastUpdated(new Date());
            setProfileSessionInfo();
        } catch (error) {
            console.error("Failed to load profile", error);
            showToast(error.message || "Unable to load profile.", "error");
            if (elements.profileCreated) {
                elements.profileCreated.textContent = "—";
            }
        }
    }

    async function submitPasswordChange(event) {
        event.preventDefault();
        if (!elements.passwordForm) {
            return;
        }
        if (state.isSubmittingPassword) {
            return;
        }
        const formData = new FormData(elements.passwordForm);
        const currentPassword = String(formData.get("currentPassword") || "").trim();
        const newPassword = String(formData.get("newPassword") || "").trim();
        const confirmPassword = String(formData.get("confirmPassword") || "").trim();
        if (!currentPassword) {
            setStatus(elements.passwordStatus, "Enter your current password.", "error");
            return;
        }
        if (!newPassword) {
            setStatus(elements.passwordStatus, "Enter a new password.", "error");
            return;
        }
        if (newPassword.length < 8) {
            setStatus(elements.passwordStatus, "New password must be at least 8 characters.", "error");
            return;
        }
        if (newPassword === currentPassword) {
            setStatus(elements.passwordStatus, "New password must be different from the current password.", "error");
            return;
        }
        if (newPassword !== confirmPassword) {
            setStatus(elements.passwordStatus, "Passwords do not match.", "error");
            return;
        }
        setStatus(elements.passwordStatus, "Updating password...");
        setPasswordFormSubmitting(true);
        try {
            const response = await authFetch("/api/users/password", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ currentPassword, newPassword })
            });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok) {
                const message = payload && payload.error ? payload.error : "Unable to update password.";
                throw new Error(message);
            }
            elements.passwordForm.reset();
            setStatus(elements.passwordStatus, "Password updated successfully.", "success");
            showToast("Password updated successfully.", "success");
        } catch (error) {
            console.error("Password update failed", error);
            setStatus(elements.passwordStatus, error.message || "Unable to update password.", "error");
        } finally {
            setPasswordFormSubmitting(false);
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

    function bindEvents() {
        elements.themeToggle?.addEventListener("click", toggleTheme);
        elements.logoutButton?.addEventListener("click", handleLogout);
        elements.passwordForm?.addEventListener("submit", submitPasswordChange);
        elements.passwordForm?.addEventListener("reset", () => {
            setStatus(elements.passwordStatus, "");
        });
    }

    function init() {
        applyStoredTheme();
        setUserName(state.currentUser);
        setProfileSessionInfo();
        bindEvents();
        loadProfile();
    }

    init();
})();
