"use strict";

/* ---------- Configuration: edit these for your deployment ---------- */
const CONFIG = {
  institutionName: "University Student Portal",
  // Set these to your own backend. Leave empty to run in demo mode (no network call).
  loginEndpoint: "",
  signupEndpoint: "",
  maxAttempts: 5,       // client-side throttle (the server must enforce its own limits)
  lockoutSeconds: 30,
};

/* ---------- Helpers ---------- */
const $ = (sel, root = document) => root.querySelector(sel);

const validators = {
  required: (v) => (v.trim() ? "" : "This field is required."),
  email: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? "" : "Enter a valid email address."),
  regNo: (v) => (/^[A-Za-z0-9/\-]{5,25}$/.test(v.trim()) ? "" : "Enter a valid registration number."),
  password: (v) => (v.length >= 8 ? "" : "Password must be at least 8 characters."),
};

function setError(input, message) {
  const err = $(`#${input.id}-error`);
  if (err) err.textContent = message;
  input.setAttribute("aria-invalid", message ? "true" : "false");
  return !message;
}

function check(input, ...rules) {
  for (const rule of rules) {
    const msg = rule(input.value);
    if (msg) return setError(input, msg);
  }
  return setError(input, "");
}

function showAlert(message, type = "err") {
  const box = $("#alert");
  if (!box) return;
  box.textContent = message;
  box.className = `alert show ${type === "ok" ? "ok" : "err"}`;
}

function setBusy(btn, busy, label) {
  btn.disabled = busy;
  btn.textContent = busy ? "Please wait…" : label;
}

async function post(endpoint, payload) {
  if (!endpoint) {                       // demo mode
    await new Promise((r) => setTimeout(r, 700));
    return { ok: true, demo: true };
  }
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || "Request failed.");
  return res.json();
}

/* ---------- Shared UI ---------- */
document.querySelectorAll("[data-institution]").forEach((el) => (el.textContent = CONFIG.institutionName));

document.querySelectorAll("[data-toggle]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const input = document.getElementById(btn.dataset.toggle);
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.textContent = show ? "Hide" : "Show";
    btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
  });
});

/* ---------- Login ---------- */
const loginForm = $("#login-form");
if (loginForm) {
  const idInput = $("#identifier");
  const pwInput = $("#password");
  const submitBtn = $(".btn", loginForm);
  let attempts = 0;
  let lockedUntil = 0;

  try { idInput.value = localStorage.getItem("portal_identifier") || ""; } catch (_) {}

  $("#forgot").addEventListener("click", (e) => {
    e.preventDefault();
    showAlert("Connect this link to your password-reset flow.", "ok");
  });

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (Date.now() < lockedUntil) {
      showAlert(`Too many attempts. Try again in ${Math.ceil((lockedUntil - Date.now()) / 1000)}s.`);
      return;
    }

    const valid = [
      check(idInput, validators.required),
      check(pwInput, validators.required, validators.password),
    ].every(Boolean);
    if (!valid) return;

    setBusy(submitBtn, true, "Sign in");
    try {
      await post(CONFIG.loginEndpoint, { identifier: idInput.value.trim(), password: pwInput.value });
      try {
        // Only the identifier is remembered, never the password.
        if ($("#remember").checked) localStorage.setItem("portal_identifier", idInput.value.trim());
        else localStorage.removeItem("portal_identifier");
      } catch (_) {}
      showAlert(CONFIG.loginEndpoint ? "Signed in. Redirecting…" : "Demo mode: form is valid. No server is connected.", "ok");
      pwInput.value = "";
    } catch (err) {
      attempts += 1;
      if (attempts >= CONFIG.maxAttempts) {
        lockedUntil = Date.now() + CONFIG.lockoutSeconds * 1000;
        attempts = 0;
      }
      showAlert(err.message || "Unable to sign in.");
    } finally {
      setBusy(submitBtn, false, "Sign in");
    }
  });

  [idInput, pwInput].forEach((i) => i.addEventListener("input", () => setError(i, "")));
}

/* ---------- Sign up ---------- */
const signupForm = $("#signup-form");
if (signupForm) {
  const f = (id) => document.getElementById(id);
  const pw = f("password");
  const bar = f("strength-bar");
  const label = f("strength-label");
  const submitBtn = $(".btn", signupForm);

  function strength(v) {
    let score = 0;
    if (v.length >= 8) score++;
    if (v.length >= 12) score++;
    if (/[a-z]/.test(v) && /[A-Z]/.test(v)) score++;
    if (/\d/.test(v)) score++;
    if (/[^A-Za-z0-9]/.test(v)) score++;
    return Math.min(score, 4);
  }

  pw.addEventListener("input", () => {
    const s = strength(pw.value);
    const levels = [
      ["Very weak", "#c0392b"], ["Weak", "#e67e22"], ["Fair", "#e8a317"], ["Good", "#58a55c"], ["Strong", "#1e8449"],
    ];
    bar.style.width = pw.value ? `${(s + 1) * 20}%` : "0";
    bar.style.background = levels[s][1];
    label.textContent = pw.value ? `Strength: ${levels[s][0]}` : "Use 8+ characters with letters, numbers and symbols.";
  });

  const matchRule = (v) => (v === pw.value ? "" : "Passwords do not match.");

  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const terms = f("terms");
    const termsOk = terms.checked;
    f("terms-error").textContent = termsOk ? "" : "You must accept the terms to continue.";

    const valid = [
      check(f("firstName"), validators.required),
      check(f("lastName"), validators.required),
      check(f("regNo"), validators.required, validators.regNo),
      check(f("email"), validators.required, validators.email),
      check(f("faculty"), validators.required),
      check(pw, validators.required, validators.password, (v) => (strength(v) >= 2 ? "" : "Choose a stronger password.")),
      check(f("confirm"), validators.required, matchRule),
      termsOk,
    ].every(Boolean);
    if (!valid) return;

    setBusy(submitBtn, true, "Create account");
    try {
      await post(CONFIG.signupEndpoint, {
        firstName: f("firstName").value.trim(),
        lastName: f("lastName").value.trim(),
        regNo: f("regNo").value.trim(),
        email: f("email").value.trim(),
        faculty: f("faculty").value,
        password: pw.value,
      });
      showAlert(CONFIG.signupEndpoint ? "Account created. You can now sign in." : "Demo mode: form is valid. No server is connected.", "ok");
      signupForm.reset();
      bar.style.width = "0";
    } catch (err) {
      showAlert(err.message || "Unable to create account.");
    } finally {
      setBusy(submitBtn, false, "Create account");
    }
  });

  signupForm.querySelectorAll("input, select").forEach((el) =>
    el.addEventListener("input", () => el.id !== "terms" && setError(el, ""))
  );
}
