import { createClient } from "@supabase/supabase-js";
import { currentLanguage, dateLocale, localize, setLanguage, translate } from "./i18n.js";
import { birthdateLimits, birthdateProblem, passwordProblem, validateForm } from "./validation.js";

const STORAGE_PREFIX = "intaliq-app-state-v2";
const SHARED_SESSIONS_KEY = `${STORAGE_PREFIX}:shared-sessions`;
const THEME_KEY = "intaliq-theme";
const LAST_ACTIVITY_KEY = `${STORAGE_PREFIX}:last-activity`;
const INACTIVITY_TIMEOUT_MS = 45 * 60 * 1000;
const SUPPORT_EMAIL = "intaliqsupport@gmail.com";
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const productionAppUrl = "https://intaliq-se-365.vercel.app";
const authRedirectUrl = import.meta.env.VITE_AUTH_REDIRECT_URL || productionAppUrl;
const aiWorkerUrl = import.meta.env.VITE_AI_WORKER_URL || "https://intaliq.shoug-alomran.workers.dev";
const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);
const supabase = hasSupabaseConfig ? createClient(supabaseUrl, supabaseAnonKey) : null;
let lastActivityAt = 0;
let inactivityTimer = null;
let inactivitySignOutPending = false;

const seedState = {
  route: "landing",
  authMode: "signin",
  authMessage: "",
  authError: "",
  authLoading: false,
  confirmSignOut: false,
  confirmJoinSessionId: "",
  confirmDeleteSessionId: "",
  futureFeatureMessage: "",
  pendingEmail: "",
  pendingVerificationRole: "member",
  pendingVerificationName: "",
  pendingFitnessLevel: "Beginner",
  pendingPrimaryGoal: "",
  pendingSpecialty: "",
  sessionMode: "join",
  statsPeriod: "Day",
  historyTab: "sessions",
  eventFilter: "All",
  user: null,
  profile: {
    name: "",
    username: "",
    email: "",
    role: "member",
    fitnessLevel: "Beginner",
    primaryGoal: "",
    specialty: "",
    age: "",
    showAge: "true",
    birthdate: "",
    city: "",
    nationality: "",
    avatarUrl: "",
    bio: "",
    isAdmin: false,
    isSuspended: false,
    coachStatus: "",
    coachReviewNote: "",
  },
  goals: [],
  activities: [],
  sessions: [],
  joinedSessions: [],
  generalAnnouncements: [],
  partners: [],
  partnerRequests: [],
  partnerDirectory: [],
  partnerDirectoryLoading: false,
  partnerDirectoryError: "",
  partnerSearch: "",
  platformAnnouncements: [],
  adminTab: "overview",
  adminLoading: false,
  adminError: "",
  adminSearch: "",
  adminOverview: null,
  adminUsers: [],
  adminCoachApplications: [],
  adminSessions: [],
  adminUserSort: "az",
  adminSessionFilters: null,
  adminSessionLimit: 0,
  adminSelectedSessions: [],
  adminAnnouncements: [],
  adminLog: [],
  adminConfirm: null,
};

let state = safeLoadState();

const app = document.querySelector("#app");
const phone = document.querySelector(".phone");
const statusTime = document.querySelector("#status-time");
let authReady = false;
let messageTimer = null;

// Theme is a device preference, so it lives outside the per-user app state.
// index.html applies it before first paint to avoid a flash. Until the visitor
// picks a theme, it follows the device's light/dark setting.
function currentTheme() {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

function savedTheme() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch {
    return null;
  }
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "light" ? "#f7f8f3" : "#050505");
}

function toggleTheme() {
  const theme = currentTheme() === "light" ? "dark" : "light";
  applyTheme(theme);
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Theme still applies for this visit if storage is unavailable.
  }
  render();
}

window.matchMedia?.("(prefers-color-scheme: light)").addEventListener("change", (event) => {
  if (savedTheme() === "light" || savedTheme() === "dark") return;
  applyTheme(event.matches ? "light" : "dark");
  render();
});

function themeToggleButton() {
  const isLight = currentTheme() === "light";
  const icon = isLight
    ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="currentColor"/></svg>`
    : `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5" fill="currentColor"/><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
  return `<button type="button" class="theme-toggle" data-action="toggle-theme" aria-label="Switch to ${isLight ? "dark" : "light"} mode">${icon}<span>${isLight ? "Dark" : "Light"}</span></button>`;
}

function toggleLanguage() {
  setLanguage(currentLanguage() === "ar" ? "en" : "ar");
  render();
}

// Each option is written in its own language, so either reader can find it.
function languageSelect() {
  const language = currentLanguage();
  return `
    <label class="lang-select" data-i18n-skip>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M3 12h18M12 3c2.6 2.5 3.9 5.5 3.9 9s-1.3 6.5-3.9 9c-2.6-2.5-3.9-5.5-3.9-9S9.4 5.5 12 3z" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>
      <select data-language-select aria-label="Language / اللغة">
        <option value="en" lang="en"${language === "en" ? " selected" : ""}>English</option>
        <option value="ar" lang="ar"${language === "ar" ? " selected" : ""}>العربية</option>
      </select>
    </label>`;
}

function updateStatusTime() {
  if (!statusTime) return;
  statusTime.textContent = new Intl.DateTimeFormat(dateLocale(), {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
}

function userStorageKey(userId = "guest") {
  return `${STORAGE_PREFIX}:${userId}`;
}

function readLastActivity() {
  try {
    const value = Number(localStorage.getItem(LAST_ACTIVITY_KEY));
    return Number.isFinite(value) ? value : 0;
  } catch {
    return 0;
  }
}

function recordActivity(force = false) {
  if (!state?.user && !force) return;
  const now = Date.now();
  if (!force && now - lastActivityAt < 1000) return;
  lastActivityAt = now;
  try {
    localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
  } catch {
    // The in-memory timestamp still protects this tab if storage is unavailable.
  }
  scheduleInactivityCheck();
}

function sessionExpiredByInactivity() {
  const lastActivity = Math.max(lastActivityAt, readLastActivity());
  return lastActivity > 0 && Date.now() - lastActivity >= INACTIVITY_TIMEOUT_MS;
}

function scheduleInactivityCheck() {
  clearTimeout(inactivityTimer);
  if (!state?.user) return;
  const lastActivity = Math.max(lastActivityAt, readLastActivity()) || Date.now();
  const remaining = Math.max(0, lastActivity + INACTIVITY_TIMEOUT_MS - Date.now());
  inactivityTimer = setTimeout(enforceInactivityTimeout, remaining + 25);
}

async function enforceInactivityTimeout() {
  if (!state?.user) return;
  const latestActivity = Math.max(lastActivityAt, readLastActivity());
  if (Date.now() - latestActivity < INACTIVITY_TIMEOUT_MS) {
    scheduleInactivityCheck();
    return;
  }
  inactivitySignOutPending = true;
  await supabase?.auth.signOut({ scope: "local" });
  try {
    localStorage.removeItem(LAST_ACTIVITY_KEY);
  } catch {
    // Ignore unavailable storage; the auth session has still been cleared.
  }
  setState({
    user: null,
    route: "signin",
    authMode: "signin",
    authLoading: false,
    authError: "You were signed out after 45 minutes of inactivity. Please log in again.",
    authMessage: "",
  });
  inactivitySignOutPending = false;
}

function startInactivityTracking() {
  const activityEvents = ["pointerdown", "keydown", "scroll", "touchstart", "click"];
  activityEvents.forEach((type) => document.addEventListener(type, () => recordActivity(), { passive: true }));
  window.addEventListener("storage", (event) => {
    if (event.key === LAST_ACTIVITY_KEY) {
      lastActivityAt = Math.max(lastActivityAt, Number(event.newValue) || 0);
      scheduleInactivityCheck();
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state?.user) {
      if (sessionExpiredByInactivity()) void enforceInactivityTimeout();
      else scheduleInactivityCheck();
    }
  });
}

function safeLoadState(user = null) {
  try {
    return loadState(user);
  } catch (error) {
    console.warn("Resetting unreadable Intaliq state:", error);
    return { ...structuredClone(seedState), user: user ? publicUser(user) : null, profile: profileFromUser(user) || structuredClone(seedState).profile };
  }
}

function activeState() {
  try {
    return state || {};
  } catch {
    return {};
  }
}

function loadSharedSessions() {
  try {
    const shared = JSON.parse(localStorage.getItem(SHARED_SESSIONS_KEY) || "[]");
    const migrated = mergeSessions([...shared, ...localStoredSessions()]);
    if (migrated.length !== shared.length) {
      localStorage.setItem(SHARED_SESSIONS_KEY, JSON.stringify(migrated));
    }
    return migrated;
  } catch {
    return [];
  }
}

function localStoredSessions() {
  const sessions = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(`${STORAGE_PREFIX}:`) || key === SHARED_SESSIONS_KEY) continue;
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "{}");
      if (Array.isArray(saved.sessions)) sessions.push(...saved.sessions);
    } catch {
      // Ignore old or malformed saved state entries.
    }
  }
  return sessions;
}

function saveSharedSessions(sessions = []) {
  try {
    const cleanSessions = mergeSessions(sessions.map((session) => normalizeSessionEnrollment(session)));
    localStorage.setItem(SHARED_SESSIONS_KEY, JSON.stringify(cleanSessions));
  } catch (error) {
    console.warn("Unable to save shared sessions:", error);
  }
}

function mergeSessions(sessions = []) {
  const byId = new Map();
  sessions.filter(Boolean).forEach((session) => {
    if (typeof session !== "object") return;
    const id = session.id || session.title;
    if (!id) return;
    byId.set(id, { ...(byId.get(id) || {}), ...session, id });
  });
  return [...byId.values()];
}

function normalizeSessionEnrollment(session, profile = {}) {
  if (!session || typeof session !== "object") return null;
  return {
    ...session,
    members: enrolledMembers(session, profile),
  };
}

function isOwnSession(session, profile = null) {
  const currentState = activeState();
  const activeProfile = profile || currentState.profile || seedState.profile;
  if (!session) return false;
  if (session.hostId && currentState.user?.id) return session.hostId === currentState.user.id;
  if (session.hostName && activeProfile.name) return session.hostName === activeProfile.name;
  return activeProfile.role === "coach";
}

function enrolledMembers(session, profile = null) {
  const currentState = activeState();
  const activeProfile = profile || currentState.profile || seedState.profile;
  const blockedNames = new Set(["Host", "A new user", session?.hostName].filter(Boolean));
  if (activeProfile.role === "coach" && isOwnSession(session, activeProfile)) {
    blockedNames.add(activeProfile.name);
  }
  return (Array.isArray(session?.members) ? session.members : []).filter((member) => member && !blockedNames.has(member));
}

function sessionRequestPending(session, profile = null) {
  const activeProfile = profile || activeState().profile || seedState.profile;
  const activeName = activeProfile.name || "New user";
  return Boolean(session?.pendingApplicants?.includes(activeName));
}

function sessionConfirmedForUser(session, profile = null) {
  const currentState = activeState();
  const activeProfile = profile || currentState.profile || seedState.profile;
  return Boolean(
    currentState.joinedSessions?.includes(session?.id)
    || enrolledMembers(session, activeProfile).includes(activeProfile.name)
  );
}

async function loadRemoteSessions() {
  if (!supabase || !state.user) return [];
  const { data, error } = await supabase
    .from("app_sessions")
    .select("id, data, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("Unable to load shared sessions:", error.message);
    return [];
  }

  return (data || []).map((row) => normalizeSessionEnrollment({ id: row.id, ...(row.data || {}) })).filter(Boolean);
}

async function loadRemoteAdmissionState(sessions = []) {
  if (!supabase || !state.user || !sessions.length) return { sessions, approvedSessionIds: [] };
  const { data, error } = await supabase
    .from("app_session_requests")
    .select("session_id, requester_id, requester_name, status");

  if (error) {
    console.warn("Unable to load admission requests:", error.message);
    return { sessions, approvedSessionIds: [] };
  }

  const requestsBySession = new Map();
  const approvedSessionIds = [];
  (data || []).forEach((request) => {
    if (!request.session_id || !request.requester_name) return;
    if (request.status === "pending") {
      const names = requestsBySession.get(request.session_id) || [];
      requestsBySession.set(request.session_id, [...names, request.requester_name]);
    }
    if (request.status === "approved" && request.requester_id === state.user.id) {
      approvedSessionIds.push(request.session_id);
    }
  });

  return {
    approvedSessionIds,
    sessions: sessions.map((session) => ({
    ...session,
    pendingApplicants: [
      ...new Set([
        ...(session.pendingApplicants || []),
        ...(requestsBySession.get(session.id) || []),
      ]),
    ],
    })),
  };
}

async function saveRemoteSession(session) {
  if (!supabase || !state.user || !session?.id) return;
  const sessionForRemote = normalizeSessionEnrollment({
    ...session,
    hostId: session.hostId || state.user.id,
    hostName: session.hostName || state.profile.name || "Coach",
  });
  const { error } = await supabase
    .from("app_sessions")
    .upsert({
      id: sessionForRemote.id,
      host_id: sessionForRemote.hostId,
      data: sessionForRemote,
      updated_at: new Date().toISOString(),
    });

  if (error) {
    console.warn("Unable to save shared session:", error.message);
  }
}

async function saveAdmissionRequest(session) {
  if (!supabase || !state.user || !session?.id) return { error: null };
  const { error } = await supabase
    .from("app_session_requests")
    .upsert({
      session_id: session.id,
      host_id: session.hostId,
      requester_id: state.user.id,
      requester_name: state.profile.name || "New user",
      status: "pending",
      updated_at: new Date().toISOString(),
    }, { onConflict: "session_id,requester_id" });

  if (error) {
    console.warn("Unable to save admission request:", error.message);
  }
  return { error };
}

async function updateAdmissionRequestStatus(sessionId, requesterName, status) {
  if (!supabase || !state.user || !sessionId || !requesterName) return;
  const { error } = await supabase
    .from("app_session_requests")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("session_id", sessionId)
    .eq("requester_name", requesterName)
    .eq("status", "pending");

  if (error) {
    console.warn("Unable to update admission request:", error.message);
  }
}

async function deleteRemoteSession(session) {
  if (!supabase || !state.user || !session?.id) return { error: null };
  const { error } = await supabase
    .from("app_sessions")
    .delete()
    .eq("id", session.id)
    .eq("host_id", state.user.id);

  if (error) {
    console.warn("Unable to delete shared session:", error.message);
  }
  return { error };
}

function sessionBelongsToCurrentCoach(session) {
  if (state.profile.role !== "coach" || !session) return false;
  if (!session.hostId && !session.hostName) return true;
  return isOwnSession(session);
}

async function syncLocalCoachSessionsToRemote() {
  if (!supabase || !state.user || state.profile.role !== "coach") return [];
  const localSessions = mergeSessions([...loadSharedSessions(), ...localStoredSessions(), ...(state.sessions || [])]);
  const coachSessions = localSessions
    .filter((session) => sessionBelongsToCurrentCoach(session))
    .map((session) => normalizeSessionEnrollment({
      ...session,
      hostId: state.user.id,
      hostName: session.hostName || state.profile.name || "Coach",
    }));

  await Promise.all(coachSessions.map((session) => saveRemoteSession(session)));
  return coachSessions;
}

async function loadPlatformAnnouncements() {
  if (!supabase || !state.user) return [];
  const { data, error } = await supabase
    .from("app_announcements")
    .select("id, title, body, created_at")
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.warn("Unable to load announcements:", error.message);
    return [];
  }
  return data || [];
}

async function hydrateSharedSessions() {
  const platformAnnouncements = await loadPlatformAnnouncements();
  const localCoachSessions = await syncLocalCoachSessionsToRemote();
  const admissionState = await loadRemoteAdmissionState(await loadRemoteSessions());
  const remoteSessions = admissionState.sessions;
  const sessions = mergeSessions([...state.sessions, ...localCoachSessions, ...remoteSessions]).map((session) => normalizeSessionEnrollment(session)).filter(Boolean);
  const confirmedSessionIds = state.profile.role === "coach"
    ? []
    : sessions
      .filter((session) => admissionState.approvedSessionIds.includes(session.id) || enrolledMembers(session).includes(state.profile.name))
      .map((session) => session.id);
  state = {
    ...state,
    sessions,
    platformAnnouncements,
    joinedSessions: state.profile.role === "coach"
      ? []
      : [...new Set([...(state.joinedSessions || []), ...confirmedSessionIds])],
  };
  saveSharedSessions(sessions);
  saveState();
}

function loadState(user = null) {
  const saved = localStorage.getItem(userStorageKey(user?.id));
  const profile = profileFromUser(user);
  if (!saved) {
    const startingProfile = profile || structuredClone(seedState).profile;
    return {
      ...structuredClone(seedState),
      user: user ? publicUser(user) : null,
      profile: startingProfile,
      sessions: loadSharedSessions().map((session) => normalizeSessionEnrollment(session, startingProfile)).filter(Boolean),
    };
  }
  let parsed = {};
  try {
    parsed = JSON.parse(saved);
  } catch {
    parsed = {};
  }
  const mergedProfile = profile
    ? { ...parsed.profile, ...profile, role: accountRole({ ...parsed.profile, ...profile }) }
    : { ...structuredClone(seedState).profile, ...parsed.profile };
  const sessions = mergeSessions([...loadSharedSessions(), ...(Array.isArray(parsed.sessions) ? parsed.sessions : [])])
    .map((session) => normalizeSessionEnrollment(session, mergedProfile))
    .filter(Boolean);
  return {
    ...structuredClone(seedState),
    ...parsed,
    user: user ? publicUser(user) : null,
    profile: mergedProfile,
    sessions,
    joinedSessions: mergedProfile.role === "coach" ? [] : (parsed.joinedSessions || []),
    authLoading: false,
    confirmSignOut: false,
    futureFeatureMessage: "",
  };
}

function saveState() {
  if (state.user) {
    saveSharedSessions(state.sessions || []);
  }
  const persistedState = {
    ...state,
    authLoading: false,
    authError: "",
    authMessage: "",
    confirmSignOut: false,
    confirmJoinSessionId: "",
    confirmDeleteSessionId: "",
    futureFeatureMessage: "",
    aiLoading: false,
  };
  localStorage.setItem(userStorageKey(state.user?.id), JSON.stringify(persistedState));
}

function setState(patch) {
  state = { ...state, ...patch };
  saveState();
  render();
}

function showTemporaryMessage(message, patch = {}, timeout = 2500) {
  if (messageTimer) clearTimeout(messageTimer);
  setState({ ...patch, authError: "", authMessage: message });
  messageTimer = setTimeout(() => {
    if (state.authMessage === message) {
      setState({ authMessage: "" });
    }
  }, timeout);
}

function navigate(route) {
  if (messageTimer) clearTimeout(messageTimer);
  setState({ route, authError: "", authMessage: "", confirmJoinSessionId: "", confirmDeleteSessionId: "", profileDraft: null });
  if (state.user && state.profile.role === "coach" && route === "goals") {
    hydrateSharedSessions().then(render);
  }
}

async function formData(form) {
  const values = Object.fromEntries(new FormData(form).entries());
  const avatarFile = new FormData(form).get("avatarFile");
  if (avatarFile instanceof File && avatarFile.size) {
    try {
      if (avatarFile.size > 10 * 1024 * 1024) throw new Error("too large");
      values.avatarUrl = await avatarDataUrl(avatarFile);
    } catch {
      values.avatarInvalid = "true";
    }
  }
  delete values.avatarFile;
  const interests = new FormData(form).getAll("interests");
  if (interests.length) {
    values.primaryGoal = interests.join(", ");
  }
  const specialties = new FormData(form).getAll("coachSpecialty");
  if (specialties.length) {
    values.specialty = specialties.join(", ");
  }
  return values;
}

// Profile photos are stored as data URLs, so shrink them to a small square JPEG first.
async function avatarDataUrl(file, size = 256) {
  const source = await fileToDataUrl(file);
  const image = new Image();
  image.src = source;
  await image.decode();
  const side = Math.min(image.naturalWidth, image.naturalHeight);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  canvas.getContext("2d").drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, size, size);
  return canvas.toDataURL("image/jpeg", 0.82);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(reader.result));
    reader.addEventListener("error", reject);
    reader.readAsDataURL(file);
  });
}

function validateEmail(value) {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { email, error: "Enter a valid email address." };
  }
  return { email, error: "" };
}

function publicUser(user) {
  if (!user) return null;
  return { id: user.id, email: user.email };
}

function accountRole(source = {}) {
  if (source.role === "coach") return "coach";
  // An explicit member role wins over a leftover specialty, e.g. after an admin changes a coach back.
  if (source.role === "member") return "member";
  if (source.specialty || source.coaching_specialty) return "coach";
  return "member";
}

function profileFromUser(user) {
  if (!user) return null;
  const meta = user.user_metadata || {};
  return {
    name: meta.name || meta.full_name || user.email?.split("@")[0] || "User",
    username: meta.username || "",
    email: user.email || meta.email || "",
    role: accountRole(meta),
    fitnessLevel: meta.fitnessLevel || "Beginner",
    primaryGoal: meta.primaryGoal || "",
    specialty: meta.specialty || "",
    age: meta.age || "",
    showAge: meta.showAge ?? "true",
    birthdate: meta.birthdate || "",
    city: meta.city || "",
    nationality: meta.nationality || "",
    // Older accounts kept the photo here; newer ones keep it only in saved app state.
    ...(meta.avatarUrl ? { avatarUrl: meta.avatarUrl } : {}),
    bio: meta.bio || "",
    // Users can edit their own metadata, so admin, suspension and coach approval only ever come from the database.
    isAdmin: false,
    isSuspended: false,
    coachStatus: "",
    coachReviewNote: "",
  };
}

function profileFromPublicProfile(row, user = state.user) {
  if (!row) return null;
  const baseProfile = profileFromUser(user) || structuredClone(seedState).profile;
  return {
    ...baseProfile,
    name: row.name || row.full_name || row.username || baseProfile.name,
    username: row.username || baseProfile.username,
    email: row.email || baseProfile.email,
    role: accountRole(row),
    primaryGoal: row.primary_goal || row.primaryGoal || baseProfile.primaryGoal,
    specialty: row.specialty || baseProfile.specialty,
    city: row.city || baseProfile.city,
    nationality: row.nationality || baseProfile.nationality,
    isAdmin: row.is_admin === true && row.is_suspended !== true,
    isSuspended: row.is_suspended === true,
  };
}

function routeForProfile(profile = state.profile) {
  if (!profile.username) return "profile-setup";
  const isCoach = profile.role === "coach";
  if (isCoach) return state.sessions.some((session) => isOwnSession(session, profile)) ? "home" : "onboarding";
  // Coach applicants see their review status on Home rather than member goal onboarding.
  if (["pending", "rejected"].includes(profile.coachStatus)) return "home";
  return state.goals.length ? "home" : "onboarding";
}

function routeAllowedForRole(route, role = state.profile.role) {
  // Only hides the screen; every admin action is checked again in Supabase.
  if (route === "admin") return Boolean(state.profile.isAdmin);
  const coachOnly = new Set(["activities", "stats", "history", "goal-form", "goal-detail", "activity-form"]);
  const memberOnly = new Set([]);
  if (role === "coach") return !coachOnly.has(route);
  return !memberOnly.has(route);
}

async function profileWithDatabaseRole(user) {
  const authProfile = profileFromUser(user);
  if (!supabase || !user) return authProfile;

  const [{ data }, coachReview] = await Promise.all([
    supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle(),
    loadCoachReview(user.id),
  ]);

  return { ...(profileFromPublicProfile(data, user) || authProfile), ...coachReview };
}

// Coach sign-ups are reviewed by an admin; until then the account stays a member.
async function loadCoachReview(userId) {
  const { data, error } = await supabase
    .from("coach_applications")
    .select("status, review_note")
    .eq("user_id", userId)
    .maybeSingle();
  // Before admin.sql is run the table doesn't exist, which just means nobody is under review.
  if (error || !data) return { coachStatus: "", coachReviewNote: "" };
  return { coachStatus: data.status, coachReviewNote: data.review_note || "" };
}

function initials(name) {
  return name
    .split(" ")
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function clamp(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function button(label, className, action, attrs = "") {
  return `<button class="btn ${className}" data-action="${action}" ${attrs}>${label}</button>`;
}

function selectedInterests(value = "") {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function interestIcon(type) {
  const icons = {
    Running: `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="28" cy="7" r="4" fill="currentColor"/><path d="M24 14l-7 6 5 4 5-4 4 8 7 3 2-4-6-3-5-10zM21 27l-4 9-8 5 3 4 9-6 5-10zM29 31l7 5 2 8 5-1-3-10-9-7z" fill="currentColor"/></svg>`,
    Hiking: `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="30" cy="7" r="4" fill="currentColor"/><path d="M23 14l-9 8 4 3 6-5 4 5-8 8-8 2 1 5 10-3 6-6 4 5-1 9h5l2-11-6-8 3-5 4 3 4-1-1-5-7-2-5-4z" fill="currentColor"/></svg>`,
    Cycling: `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="31" cy="8" r="4" fill="currentColor"/><path d="M18 18h9l5 8h-7l-3 5-4-2 3-6h-8z" fill="currentColor"/><circle cx="13" cy="34" r="8" fill="none" stroke="currentColor" stroke-width="3"/><circle cx="35" cy="34" r="8" fill="none" stroke="currentColor" stroke-width="3"/><path d="M13 34l8-11 6 11h8M25 23l6-6h6" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    Strength: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M7 20h6v8H7zM35 20h6v8h-6zM14 16h5v16h-5zM29 16h5v16h-5zM19 22h10v4H19z" fill="currentColor"/></svg>`,
    Mobility: `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="25" cy="8" r="4" fill="currentColor"/><path d="M23 14l-8 8 4 4 5-5 4 5-8 10 4 4 10-12-3-8 5 3 5-1-1-5-7 1-6-4zM13 37h27v5H13z" fill="currentColor"/></svg>`,
    Nutrition: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 8c-8 2-12 8-12 15 0 8 6 15 15 17 7-4 10-10 9-17-1-8-5-13-12-15z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M26 7c2-3 5-4 9-3-1 4-4 6-8 6" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>`,
  };
  return icons[type] || "";
}

function interestPicker(value = "") {
  const selected = selectedInterests(value);
  const options = ["Running", "Hiking", "Cycling"];
  return `
    <fieldset class="interest-field">
      <legend>Interests</legend>
      <div class="interest-options">
        ${options.map((interest) => `
          <label class="interest-option">
            <input type="checkbox" name="interests" value="${interest}" ${selected.includes(interest) ? "checked" : ""} />
            <span class="interest-card">
              ${interestIcon(interest)}
              <span>${interest}</span>
            </span>
          </label>
        `).join("")}
      </div>
    </fieldset>
  `;
}

function specialtyPicker(value = "") {
  const selected = selectedInterests(value);
  const options = [
    { value: "Running", label: "Running", icon: "Running" },
    { value: "Hiking", label: "Hiking", icon: "Hiking" },
    { value: "Cycling", label: "Biking", icon: "Cycling" },
  ];
  return `
    <fieldset class="interest-field">
      <legend>Coaching specialty</legend>
      <div class="interest-options">
        ${options.map((specialty) => `
          <label class="interest-option">
            <input type="checkbox" name="coachSpecialty" value="${specialty.value}" ${selected.includes(specialty.value) ? "checked" : ""} />
            <span class="interest-card">
              ${interestIcon(specialty.icon)}
              <span>${specialty.label}</span>
            </span>
          </label>
        `).join("")}
      </div>
    </fieldset>
  `;
}

function activityTypePicker(value = "Running") {
  const options = [
    { value: "Running", label: "Run", icon: "Running" },
    { value: "Cycling", label: "Bike", icon: "Cycling" },
    { value: "Hiking", label: "Hike", icon: "Hiking" },
  ];
  return `
    <fieldset class="activity-type-field">
      <legend>Activity type</legend>
      <div class="activity-type-options">
        ${options.map((activity) => `
          <label class="activity-type-option">
            <input type="radio" name="type" value="${activity.value}" ${value === activity.value ? "checked" : ""} required />
            <span class="activity-type-card">
              ${interestIcon(activity.icon)}
              <span>${activity.label}</span>
            </span>
          </label>
        `).join("")}
      </div>
    </fieldset>
  `;
}

function render() {
  phone?.classList.toggle("auth-phone", (state.route === "signin" || state.route === "verify") && !state.user);

  if (!authReady) {
    app.innerHTML = `<div class="brand-screen"><img class="brand-logo" src="/favicon.svg" alt="Intaliq" /><p class="tagline">Loading Intaliq...</p></div>`;
    localize(app);
    return;
  }

  const protectedRoutes = ["home", "events", "activities", "stats", "history", "requests", "goals", "sessions", "partners", "find-partners", "friend-chat", "profile", "profile-detail", "profile-edit", "ai-chat", "goal-form", "goal-detail", "activity-form", "session-form", "session-detail", "profile-setup", "admin"];
  if (protectedRoutes.includes(state.route) && !state.user) {
    state.route = "landing";
  }

  if (state.user && !routeAllowedForRole(state.route, state.profile.role)) {
    state.route = "home";
  }

  // New accounts (and older ones without a username) finish their profile first.
  if (state.user && !state.profile.username) {
    state.route = "profile-setup";
  } else if (state.route === "profile-setup") {
    state.route = state.user ? routeForProfile(state.profile) : "landing";
  }

  const views = {
    landing: landingView,
    signin: signInView,
    verify: verifyView,
    onboarding: onboardingView,
    home: homeView,
    events: eventsView,
    activities: activitiesView,
    stats: statsView,
    history: historyView,
    requests: requestsView,
    goals: goalsView,
    sessions: sessionsView,
    partners: partnersView,
    "find-partners": findPartnersView,
    "friend-chat": friendChatView,
    profile: profileView,
    "profile-detail": profileDetailView,
    "profile-edit": profileEditView,
    "profile-setup": profileSetupView,
    "ai-chat": aiChatView,
    "goal-form": goalFormView,
    "goal-detail": goalDetailView,
    "activity-form": activityFormView,
    "session-form": sessionFormView,
    "session-detail": sessionDetailView,
    admin: adminView,
  };

  app.innerHTML = (views[state.route] || landingView)() + signOutConfirmModal() + joinSessionConfirmModal() + deleteSessionConfirmModal() + futureFeatureModal() + adminConfirmModal();
  localize(app);
  bindEvents();
}

function signOutConfirmModal() {
  if (!state.confirmSignOut) return "";
  return `
    <div class="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="logout-title">
      <div class="confirm-dialog">
        <h2 id="logout-title">Log out?</h2>
        <p>Are you sure you want to log out?</p>
        <div class="confirm-actions">
          <button class="btn btn-ghost" data-action="cancel-signout">Cancel</button>
          <button class="btn btn-primary" data-action="confirm-signout">Log out</button>
        </div>
      </div>
    </div>
  `;
}

function joinSessionConfirmModal() {
  if (!state.confirmJoinSessionId) return "";
  const session = state.sessions.find((item) => item.id === state.confirmJoinSessionId);
  return `
    <div class="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="join-session-title">
      <div class="confirm-dialog">
        <h2 id="join-session-title">Request to join?</h2>
        <p>Are you sure you want to request to join ${session?.title || "this session"}?</p>
        <div class="confirm-actions">
          <button class="btn btn-ghost" data-action="cancel-join-session">Cancel</button>
          <button class="btn btn-primary" data-action="confirm-join-session" data-id="${state.confirmJoinSessionId}">Request Join</button>
        </div>
      </div>
    </div>
  `;
}

function deleteSessionConfirmModal() {
  if (!state.confirmDeleteSessionId) return "";
  const session = state.sessions.find((item) => item.id === state.confirmDeleteSessionId);
  return `
    <div class="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="delete-session-title">
      <div class="confirm-dialog">
        <h2 id="delete-session-title">Delete session?</h2>
        <p>This will remove ${session?.title || "this session"} from every user and coach view.</p>
        <div class="confirm-actions">
          <button class="btn btn-ghost" data-action="cancel-delete-session">Cancel</button>
          <button class="btn btn-danger" data-action="confirm-delete-session" data-id="${state.confirmDeleteSessionId}">Delete</button>
        </div>
      </div>
    </div>
  `;
}

function futureFeatureModal() {
  if (!state.futureFeatureMessage) return "";
  return `
    <div class="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="future-feature-title">
      <div class="confirm-dialog future-feature-dialog">
        <h2 id="future-feature-title">Coming soon</h2>
        <p>${state.futureFeatureMessage}</p>
        <div class="confirm-actions single">
          <button class="btn btn-primary" data-action="close-future-feature">OK</button>
        </div>
      </div>
    </div>
  `;
}

function landingView() {
  const features = [
    ["goals", "Set goals", "Break a big goal into checkpoints and watch your progress add up."],
    ["sessions", "Join sessions", "Find coach-led workouts and request a spot in a tap."],
    ["activities", "Log activities", "Track distance, active days and calories week by week."],
    ["announce", "Stay in the loop", "Get session updates and announcements from your coaches."],
  ];

  return `
    <div class="landing-screen">
      <nav class="landing-nav" aria-label="Intaliq">
        <span class="landing-brand"><img src="/favicon.svg" alt="" />Intaliq</span>
        <div class="landing-nav-actions">
          ${themeToggleButton()}
          <button type="button" class="landing-login" data-action="landing-signin">Log in</button>
        </div>
      </nav>
      <header class="landing-hero">
        <span class="landing-eyebrow">Take your first step</span>
        <h1>Move further, <span>together.</span></h1>
        <p>Intaliq helps you set fitness goals, join sessions with local coaches and keep your momentum going.</p>
        <div class="landing-cta">
          <button type="button" class="btn btn-primary" data-action="landing-signup">Get started</button>
          <button type="button" class="btn btn-ghost" data-action="landing-signin">I have an account</button>
        </div>
      </header>
      <section class="landing-section" aria-labelledby="landing-features-title">
        <h2 id="landing-features-title">Everything in one place</h2>
        <div class="landing-features">
          ${features.map(([icon, title, copy]) => `
            <article class="landing-feature">
              <span>${navIcon(icon)}</span>
              <h3>${title}</h3>
              <p>${copy}</p>
            </article>
          `).join("")}
        </div>
      </section>
      <section class="landing-coach" id="landing-coach">
        <div>
          <h2>Are you a coach?</h2>
          <p>Create sessions, admit members and post announcements.</p>
        </div>
        <button type="button" class="btn" data-action="landing-coach">Join as a coach</button>
      </section>
      ${landingFooter()}
    </div>
  `;
}

function landingFooter() {
  const comingSoon = (label) => `<button type="button" class="landing-footer-link" data-action="future-feature" data-feature="${label}">${label}</button>`;
  const columns = [
    ["Product", [
      `<button type="button" class="landing-footer-link" data-action="scroll-to" data-target="landing-features-title">Features</button>`,
      `<button type="button" class="landing-footer-link" data-action="scroll-to" data-target="landing-coach">For coaches</button>`,
      `<button type="button" class="landing-footer-link" data-action="landing-signup">Create an account</button>`,
      `<button type="button" class="landing-footer-link" data-action="landing-signin">Log in</button>`,
    ]],
    ["Support", [
      `<a class="landing-footer-link" href="mailto:${SUPPORT_EMAIL}?subject=Intaliq%20support">Contact support</a>`,
      comingSoon("Help center"),
      comingSoon("FAQ"),
      `<a class="landing-footer-link" href="mailto:${SUPPORT_EMAIL}?subject=Intaliq%20problem%20report">Report a problem</a>`,
    ]],
    ["Legal", [
      comingSoon("Privacy policy"),
      comingSoon("Terms of service"),
      comingSoon("Cookie policy"),
      comingSoon("Accessibility"),
    ]],
  ];

  return `
    <footer class="landing-footer">
      <div class="landing-footer-top">
        <div class="landing-footer-about">
          <span class="landing-brand"><img src="/favicon.svg" alt="" />Intaliq</span>
          <p>Set goals, join coach-led sessions and keep your momentum going.</p>
          <a class="landing-footer-email" href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>
        </div>
        <nav class="landing-footer-links" aria-label="Footer">
          ${columns.map(([heading, links]) => `
            <div>
              <h2>${heading}</h2>
              <ul>${links.map((link) => `<li>${link}</li>`).join("")}</ul>
            </div>
          `).join("")}
        </nav>
      </div>
      <div class="landing-footer-bottom">
        <span>© ${new Date().getFullYear()} Intaliq. All rights reserved.</span>
        <div class="landing-footer-meta">
          ${languageSelect()}
        </div>
      </div>
    </footer>
  `;
}

function verifyView() {
  const message = state.authMessage ? `<div class="notice">${state.authMessage}</div>` : "";
  const error = state.authError ? `<div class="notice danger-box">${state.authError}</div>` : "";

  return `
    <div class="auth-screen verify-screen">
      <header class="auth-hero">
        <h1>Welcome to Intaliq</h1>
        <p>Take your first step - Intaliq</p>
      </header>
      <form class="auth-panel verify-panel stack" data-form="verify-email">
        <div class="verify-icon">▦</div>
        <div class="verify-copy">
          <h2>Verify Your Identity</h2>
          <p>We've sent a verification code to ${state.pendingEmail || "your email"}.</p>
        </div>
        ${message}
        ${error}
        <label class="field">
          <span>Verification Code</span>
          <input class="input auth-input code-input" name="token" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="Enter 6-digit code" required />
        </label>
        <button class="btn btn-primary auth-submit" type="submit" ${state.authLoading ? "disabled" : ""}>
          ${state.authLoading ? "Verifying..." : "Verify & Login"}
        </button>
        <div class="verify-actions">
          <button type="button" data-action="resend-email-code">Resend code</button>
          <button type="button" data-action="back-to-login">Back to login</button>
        </div>
      </form>
    </div>
  `;
}

function signInView() {
  const isSignup = state.authMode === "signup";
  const setupNotice = hasSupabaseConfig
    ? ""
    : `<div class="notice danger-box">Supabase is not configured yet. Add your project URL and anon key to <strong>.env.local</strong>, then restart the local server.</div>`;
  const message = state.authMessage ? `<div class="notice">${state.authMessage}</div>` : "";
  const error = state.authError ? `<div class="notice danger-box">${state.authError}</div>` : "";
  const selectedRole = state.profile.role === "coach" ? "coach" : "member";

  return `
    <div class="auth-screen">
      <button type="button" class="auth-home-link" data-action="go-landing">‹ Home</button>
      <div class="auth-top-actions">
        ${languageSelect()}
        ${themeToggleButton()}
      </div>
      <header class="auth-hero">
        <h1>Welcome to Intaliq</h1>
        <p>Take your first step - Intaliq</p>
      </header>
      <form class="auth-panel stack" data-form="auth">
        ${isSignup ? `
          <div class="auth-role-toggle" role="group" aria-label="Account type">
            <button type="button" class="${selectedRole === "member" ? "active" : ""}" data-action="role-member">User</button>
            <button type="button" class="${selectedRole === "coach" ? "active" : ""}" data-action="role-coach">Coach</button>
          </div>
        ` : ""}
        ${setupNotice}
        ${message}
        ${error}
        ${isSignup ? `
          <label class="field">
            <span>Name</span>
            <input class="input auth-input" name="name" type="text" value="${state.profile.name}" maxlength="60" autocomplete="name" required />
          </label>
          ${selectedRole === "coach" ? `
            <div class="notice">Coach accounts are reviewed by the Intaliq team. You can use Intaliq as a member until you're approved.</div>
            ${specialtyPicker(state.profile.specialty)}
          ` : `
            ${interestPicker(state.profile.primaryGoal)}
            <label class="field">
              <span>Fitness level</span>
              <select class="select auth-input" name="fitnessLevel">
                ${["Beginner", "Intermediate", "Advanced"].map((level) => `<option ${level === state.profile.fitnessLevel ? "selected" : ""}>${level}</option>`).join("")}
              </select>
            </label>
          `}
        ` : ""}
        <label class="field">
          <span>Email</span>
          <input class="input auth-input" name="email" type="email" value="${state.profile.email}" placeholder="Enter your email" autocomplete="email" required />
        </label>
        <input type="hidden" name="role" value="${selectedRole}" />
        <label class="field">
          <span>Password</span>
          <input class="input auth-input" name="password" type="password" minlength="${isSignup ? 8 : 6}" maxlength="72" placeholder="Enter your password" autocomplete="${isSignup ? "new-password" : "current-password"}" required />
        </label>
        ${isSignup ? `
          <label class="field">
            <span>Confirm password</span>
            <input class="input auth-input" name="confirmPassword" type="password" minlength="8" maxlength="72" placeholder="Re-enter your password" autocomplete="new-password" required />
          </label>
        ` : ""}
        <button class="btn btn-primary auth-submit" type="submit" ${!hasSupabaseConfig || state.authLoading ? "disabled" : ""}>
          ${state.authLoading ? "Please wait..." : isSignup ? "Create account" : "Continue"}
        </button>
        <p class="auth-switch">
          ${isSignup ? `Already have an account? <button type="button" data-action="auth-signin">Sign in</button>` : `Don't have an account yet? <button type="button" data-action="auth-signup">Sign up</button>`}
        </p>
      </form>
    </div>
  `;
}

function onboardingView() {
  const isCoach = state.profile.role === "coach";
  const message = state.authMessage ? `<div class="notice">${state.authMessage}</div>` : "";
  const error = state.authError ? `<div class="notice danger-box">${state.authError}</div>` : "";
  return page(isCoach ? "Create your first session" : "Set your first goal", isCoach ? "Start by opening a workout session for users." : "Tell Intaliq what you want to move forward.", `
    ${message}
    ${error}
    <form class="stack" data-form="onboarding">
      ${isCoach ? sessionFields() : goalFields({ title: "", category: "Strength", due: "This week", progress: 0, checkpoints: ["", "", "", ""] })}
      <button class="btn btn-primary" type="submit">${isCoach ? "Create session" : "Save goal"}</button>
      ${button("Skip for now", "btn-ghost", "skip-onboarding")}
    </form>
  `);
}

function homeView() {
  if (state.profile.role === "coach") return coachHomeView();
  return memberHomeView();
}

function memberHomeView() {
  const activeGoal = state.goals[0];
  const displayName = state.profile.name || "Intaliq athlete";
  const weekActivities = activitiesForPeriod("Week");
  const weekDistance = weekActivities.reduce((total, activity) => total + Number(activity.distance || 0), 0);
  const calories = state.activities.reduce((total, activity) => total + activityCalories(activity), 0).toLocaleString();
  const activeDays = `${new Set(weekActivities.map((activity) => activity.time?.slice(0, 10))).size}/7`;
  const bookedSessions = state.sessions.filter((session) => sessionConfirmedForUser(session));
  const announcements = relevantAnnouncements();
  const message = state.authMessage ? `<div class="member-toast">${state.authMessage}</div>` : "";
  return withTabs("home", `
    <div class="member-dashboard">
      ${message}
      <header class="member-dashboard-head">
        <h1>Welcome back, ${displayName}!</h1>
        <p>Take your first step - Intaliq</p>
      </header>
      ${coachApplicationCard()}

      <section class="member-stat-grid" aria-label="User stats">
        ${memberStat("This Week", `${formatDistance(weekDistance)} km`, "")}
        ${memberStat("Calories", calories, "flame")}
        ${memberStat("Active Days", activeDays, "calendar")}
        ${memberStat("Sessions", bookedSessions.length, "group")}
      </section>

      <section class="member-section">
        <h2>Quick Actions</h2>
        <div class="member-actions">
          <button class="member-action primary" data-action="log-activity">${interestIcon("Running")}<span>Log Activity</span></button>
          <button class="member-action primary" data-action="set-goal"><span class="target-icon">◎</span><span>Set Goal</span></button>
          <button class="member-action ghost" data-action="find-session"><span class="mini-group">●●●</span><span>Find Session</span></button>
          <button class="member-action ghost" data-action="ai-coach"><span class="spark-icon">✦</span><span>AI Coach</span></button>
        </div>
      </section>

      <section class="member-section booked-session-section">
        <div class="member-section-head">
          <h2>My Booked Sessions</h2>
          ${bookedSessions.length ? `<button class="member-view-all" data-action="booked-sessions">View all <span>→</span></button>` : ""}
        </div>
        ${bookedSessions.length ? `
          <div class="booked-session-list">
            ${bookedSessions.slice(0, 2).map((session) => bookedSessionCard(session)).join("")}
          </div>
        ` : `
          <button class="booked-session-empty" data-action="find-session">
            <strong>No booked sessions yet.</strong>
            <span>Admitted sessions will appear here.</span>
          </button>
        `}
      </section>

      <section class="member-section">
        <h2>Important Announcements</h2>
        ${announcements.length ? `
          <div class="member-announcement-list">
            ${announcements.map((item) => `
              <article class="member-announcement-card">
                <span>${item.sessionTitle}</span>
                <strong>${item.title}</strong>
                <p>${item.message}</p>
              </article>
            `).join("")}
          </div>
        ` : `
          <div class="member-empty">
            <strong>No important announcements yet.</strong>
            <span>Updates from sessions you book will appear here.</span>
          </div>
        `}
      </section>

      <section class="member-section">
        <div class="member-section-head">
          <h2>Active Goals</h2>
          <button class="member-view-all" data-action="goals">View all <span>→</span></button>
        </div>
        ${activeGoal ? memberGoalCard(activeGoal) : `
          <div class="member-empty">
            <strong>No active goals yet.</strong>
            <span>Set your first goal to start tracking progress.</span>
          </div>
        `}
      </section>
    </div>
  `);
}

function coachApplicationCard() {
  const status = state.profile.coachStatus;
  const note = state.profile.coachReviewNote
    ? `<p>Note from the Intaliq team: ${escapeHtml(state.profile.coachReviewNote)}</p>`
    : "";
  const error = state.authError ? `<div class="notice danger-box">${state.authError}</div>` : "";
  if (status === "pending") {
    return `
      <article class="member-announcement-card coach-application-card">
        <span>Coach application</span>
        <strong>Under review</strong>
        <p>The Intaliq team is checking your coaching details. You can use Intaliq as a member until you're approved.</p>
      </article>
    `;
  }
  if (status === "rejected") {
    return `
      <article class="member-announcement-card coach-application-card">
        <span>Coach application</span>
        <strong>Not approved yet</strong>
        ${note}
        <p>Update your profile and apply again, or email ${SUPPORT_EMAIL} with questions.</p>
        ${error}
        <button class="coach-mini-action" data-action="reapply-coach">Apply again</button>
      </article>
    `;
  }
  if (status === "revoked") {
    return `
      <article class="member-announcement-card coach-application-card">
        <span>Coach application</span>
        <strong>Coach access removed</strong>
        <p>Email ${SUPPORT_EMAIL} if you have questions.</p>
      </article>
    `;
  }
  return "";
}

function bookedSessionCard(session) {
  return `
    <button class="booked-session-card" data-action="session-detail" data-id="${session.id}">
      <span>${interestIcon(session.type)}</span>
      <strong>${session.title}</strong>
      <small>${session.date} · ${session.time}</small>
      <em>Confirmed</em>
    </button>
  `;
}

function teamAnnouncements() {
  return (state.platformAnnouncements || []).map((announcement) => ({
    title: escapeHtml(announcement.title),
    message: escapeHtml(announcement.body),
  }));
}

function relevantAnnouncements() {
  const fromTeam = teamAnnouncements().map((item) => ({ ...item, sessionTitle: "Intaliq team" }));
  return [...fromTeam, ...state.sessions
    .filter((session) => sessionConfirmedForUser(session))
    .flatMap((session) => (session.announcements || []).map((announcement) => {
      const [title, ...messageParts] = announcement.split(": ");
      return {
        sessionTitle: session.title,
        title: messageParts.length ? title : "Session update",
        message: messageParts.length ? messageParts.join(": ") : announcement,
      };
    }))];
}

function eventNotificationsByType() {
  const groups = {
    All: [],
    Running: [],
    Hiking: [],
    Cycling: [],
  };
  groups.All = [
    ...teamAnnouncements().map((item) => ({ ...item, meta: "Intaliq team" })),
    ...(state.generalAnnouncements || []).map((announcement) => {
      const [title, ...messageParts] = announcement.split(": ");
      return {
        title: messageParts.length ? title : "General announcement",
        message: messageParts.length ? messageParts.join(": ") : announcement,
        meta: "General",
      };
    }),
  ];

  const relevantSessions = state.profile.role === "coach"
    ? state.sessions
    : state.sessions.filter((session) => sessionConfirmedForUser(session));

  relevantSessions
    .forEach((session) => {
      const type = groups[session.type] ? session.type : "Running";
      groups[type].push({
        title: state.profile.role === "coach" ? "Your session" : "Booked session",
        message: `${session.title} is scheduled for ${session.date} at ${session.time}.`,
        meta: session.level || "All levels",
      });

      (session.announcements || []).forEach((announcement) => {
        const [title, ...messageParts] = announcement.split(": ");
        groups[type].push({
          title: messageParts.length ? title : "Session update",
          message: messageParts.length ? messageParts.join(": ") : announcement,
          meta: session.title,
        });
      });
    });

  return groups;
}

function memberStat(label, value, icon) {
  const icons = {
    flame: `<span class="member-stat-icon flame-icon">◖</span>`,
    calendar: `<span class="member-stat-icon calendar-icon">▣</span>`,
    group: `<span class="member-stat-icon group-icon">●●●</span>`,
  };
  return `
    <article class="member-stat">
      <span>${label}</span>
      <div>
        <strong>${value}</strong>
        ${icons[icon] || ""}
      </div>
    </article>
  `;
}

function memberGoalCard(goal) {
  const progress = goalProgress(goal);
  return `
    <article class="member-goal-card">
      <div class="member-goal-head">
        <div class="session-mark">${interestIcon(goal.type || goal.category || "Running")}</div>
        <div>
          <h3>${goal.title}</h3>
          <p>Due: ${goal.due}</p>
        </div>
        <span>${progress}%</span>
      </div>
      <p>${formatDistance(goal.coveredDistance || 0)} of ${formatDistance(goal.targetDistance || 0)} km covered</p>
      <p>Progress</p>
      <div class="member-progress" style="--value: ${progress}%"><span></span></div>
    </article>
  `;
}

function goalProgress(goal) {
  if (goal.targetDistance) {
    return clamp(Math.round((Number(goal.coveredDistance || 0) / Number(goal.targetDistance)) * 100));
  }
  return clamp(goal.progress);
}

function formatDistance(value) {
  const distance = Number(value) || 0;
  return Number.isInteger(distance) ? String(distance) : distance.toFixed(1);
}

function activityCalories(activity) {
  const minutes = Number(activity.duration) || 0;
  const factors = { Running: 11, Cycling: 8, Hiking: 7 };
  return Math.round(minutes * (factors[activity.type] || 8));
}

function activityDateLabel(value) {
  if (!value) return "No time set";
  return new Intl.DateTimeFormat(dateLocale(), {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function activityLabel(type) {
  return type === "Cycling" ? "Bike" : type === "Running" ? "Run" : "Hike";
}

function profileAge(profile = state.profile) {
  if (profile.birthdate) {
    const birth = new Date(profile.birthdate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const hasBirthdayPassed = today.getMonth() > birth.getMonth() || (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate());
    if (!hasBirthdayPassed) age -= 1;
    return age > 0 ? String(age) : "";
  }
  return profile.age || "";
}

function profileAvatar() {
  if (state.profile.avatarUrl) {
    return `<div class="profile-user-icon has-photo"><img src="${state.profile.avatarUrl}" alt="${state.profile.name || "Profile"} profile picture" /></div>`;
  }
  return `
    <div class="profile-user-icon">
      <span></span>
      <strong></strong>
    </div>
  `;
}

function activityCard(activity) {
  return `
    <article class="activity-history-card">
      <div class="session-mark">${interestIcon(activity.type)}</div>
      <div>
        <h3>${activityLabel(activity.type)}</h3>
        <p>${activityDateLabel(activity.time)}</p>
        <div class="activity-history-meta">
          <span>${formatDistance(activity.distance)} km</span>
          <span>${activity.duration} min</span>
          <span>${activityCalories(activity)} cal</span>
        </div>
      </div>
    </article>
  `;
}

function activitiesForPeriod(period) {
  const now = new Date();
  return state.activities.filter((activity) => {
    const date = new Date(activity.time);
    if (Number.isNaN(date.getTime())) return false;
    if (period === "Day") return date.toDateString() === now.toDateString();
    if (period === "Week") {
      const weekAgo = new Date(now);
      weekAgo.setDate(now.getDate() - 7);
      return date >= weekAgo && date <= now;
    }
    if (period === "Month") return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
    return date.getFullYear() === now.getFullYear();
  });
}

function statPeriodCard(period) {
  const activities = activitiesForPeriod(period);
  const distance = activities.reduce((total, activity) => total + Number(activity.distance || 0), 0);
  const calories = activities.reduce((total, activity) => total + activityCalories(activity), 0);
  // Empty periods draw no bar; any real value stays visible as at least a sliver.
  const barHeight = (value) => (value > 0 ? Math.min(100, Math.max(4, value)) : 0);
  const distanceHeight = barHeight(distance * 10);
  const calorieHeight = barHeight(calories / 20);

  return `
    <article class="stat-period-card">
      <h2>${period}</h2>
      <div class="stat-chart" aria-label="${period} distance and calories chart">
        <span style="--height: ${distanceHeight}%"><b></b><em>Distance</em></span>
        <span style="--height: ${calorieHeight}%"><b></b><em>Calories</em></span>
      </div>
      <div class="stat-values">
        <span><strong>${formatDistance(distance)} km</strong><small>Distance</small></span>
        <span><strong>${calories.toLocaleString()}</strong><small>Calories</small></span>
      </div>
    </article>
  `;
}

function statsPeriodTabs(activePeriod) {
  return `
    <div class="stats-period-tabs" role="tablist" aria-label="Stats period">
      ${["Day", "Week", "Month", "Year"].map((period) => `
        <button class="${activePeriod === period ? "active" : ""}" data-action="set-stats-period" data-period="${period}" type="button">${period}</button>
      `).join("")}
    </div>
  `;
}

function coachHomeView() {
  const displayName = state.profile.name || "Coach";
  const ownSessions = state.sessions.filter((session) => isOwnSession(session));
  const upcoming = ownSessions[0];
  const pendingCount = ownSessions.reduce((total, session) => total + (session.pendingApplicants?.length || 0), 0);
  const totalMembers = ownSessions.reduce((total, session) => total + enrolledMembers(session).length, 0);
  const activeSessions = ownSessions.filter((session) => session.date !== "Completed").length;
  return withTabs("home", `
    <div class="coach-dashboard">
      <header class="coach-dashboard-head">
        <div>
          <h1>Coach Dashboard</h1>
          <p>Welcome back, ${displayName}!</p>
        </div>
        <button class="coach-logout" data-action="signout">Logout</button>
      </header>

      <section class="coach-stat-grid" aria-label="Coach stats">
        ${coachStat("Active Sessions", activeSessions, "")}
        ${coachStat("Total Members", Math.max(totalMembers, state.partners.length), "")}
        ${coachStat("Pending Requests", pendingCount, "")}
        ${coachStat("Total Sessions", ownSessions.length, "")}
      </section>

      <section class="coach-section">
        <h2>Quick Actions</h2>
        <div class="coach-actions">
          <button class="coach-action primary" data-action="new-session">Create New Session</button>
          <button class="coach-action primary" data-action="review-requests">Review Requests</button>
          <button class="coach-action secondary" data-action="make-announcement">Make Announcement</button>
          <button class="coach-action secondary" data-action="sessions">My Sessions</button>
        </div>
      </section>

      <section class="coach-section">
        <div class="coach-section-head">
          <h2>Upcoming Sessions</h2>
          <button class="coach-view-all" data-action="sessions">View All <span>→</span></button>
        </div>
        ${upcoming ? coachUpcomingCard(upcoming) : `
          <div class="coach-empty">
            <strong>No upcoming sessions yet.</strong>
            <span>Create your first session to start receiving members and requests.</span>
          </div>
        `}
      </section>
    </div>
  `);
}

function coachStat(label, value, trend) {
  return `
    <article class="coach-stat">
      <span>${label}</span>
      <div>
        <strong>${value}</strong>
        ${trend ? `<em>${trend}</em>` : ""}
      </div>
    </article>
  `;
}

function coachUpcomingCard(session) {
  const members = enrolledMembers(session);
  const remaining = Math.max(0, session.capacity - members.length);
  const actionAttrs = session.isDemo ? "" : `data-action="session-detail" data-id="${session.id}"`;
  return `
    <article class="coach-session-card" ${actionAttrs}>
      <div class="session-mark">${interestIcon(session.type) || interestIcon("Running")}</div>
      <div class="coach-session-main">
        <div class="coach-session-title">
          <h3>${session.title}</h3>
          <span>${session.level || "All levels"}</span>
        </div>
        <p>Coach ${state.profile.name || "Intaliq"}</p>
        <p>${session.date} at ${session.time}</p>
        <p>${session.location || session.notes || "Focused workout session."}</p>
        ${session.accessibility && session.accessibility !== "None" ? `<p>${session.accessibility === "Wheelchair-Friendly" ? "♿ " : ""}${session.accessibility}</p>` : ""}
        <p>${members.length}/${session.capacity} enrolled - ${remaining} spot${remaining === 1 ? "" : "s"} left</p>
      </div>
    </article>
  `;
}

function goalsView() {
  const isCoach = state.profile.role === "coach";
  if (isCoach) {
    const sessionsWithRequests = state.sessions.filter((session) => session.pendingApplicants?.length);
    return withTabs("goals", `
      <div class="topbar coach-page-topbar">
        <h1>Admissions</h1>
        ${button("My Sessions", "btn-primary", "sessions")}
      </div>
      <div class="stack">
        ${sessionsWithRequests.length ? sessionsWithRequests.map((session) => `
          <article class="coach-request-card">
            <div class="session-head">
              <div>
                <h3>${session.title}</h3>
                <div class="subtle">${session.level || "All levels"} · ${session.date} at ${session.time}</div>
              </div>
              <span class="pill warn">${session.pendingApplicants.length} pending</span>
            </div>
            ${session.pendingApplicants.map((name) => `
              <div class="coach-request-row">
                <span>${name}</span>
                <button class="coach-mini-action" data-action="admit-user" data-id="${session.id}" data-name="${name}">Admit</button>
              </div>
            `).join("")}
          </article>
        `).join("") : `<div class="coach-empty"><strong>No pending admissions.</strong><span>Requests for approval-required sessions will appear here.</span></div>`}
      </div>
    `);
  }

  const message = state.authMessage ? `<div class="member-toast">${state.authMessage}</div>` : "";
  return withTabs("goals", `
    <div class="topbar">
      <h1>Goals</h1>
      ${button("+ Goal", "btn-primary", "new-goal")}
    </div>
    <div class="stack">
      ${message}
      ${state.goals.length ? state.goals.map((goal) => goalCard(goal)).join("") : `<div class="member-empty"><strong>No goals yet.</strong><span>Set a running, hiking, or biking distance goal.</span></div>`}
    </div>
  `);
}

function goalFormView() {
  const isCoach = state.profile.role === "coach";
  if (!isCoach) {
    return withTabs("goals", `
      <div class="goal-setup-screen">
        <button class="member-view-all back-button" data-action="back">Back</button>
        <div>
          <h1>Set Goal</h1>
          <p>Choose one activity type and set a distance target.</p>
        </div>
        <form class="activity-log-form" data-form="goal">
          ${activityTypePicker("Running")}
          <label class="field">
            <span>Goal name</span>
            <input class="input" name="title" placeholder="Running goal" maxlength="60" required />
          </label>
          <label class="field">
            <span>Due date</span>
            <input class="input" name="due" type="date" min="${todayDateValue()}" max="${dateYearsAhead(5)}" required />
          </label>
          <label class="field">
            <span>Desired distance (km)</span>
            <input class="input" name="targetDistance" type="number" min="0.1" max="5000" step="0.1" placeholder="20" required />
          </label>
          <button class="btn btn-primary activity-submit" type="submit">Create Goal</button>
        </form>
      </div>
    `);
  }

  return page(isCoach ? "New training plan" : "New goal", isCoach ? "Create a plan template with client checkpoints." : "Set a measurable goal and checkpoint flags.", `
    <form class="stack" data-form="goal">
      ${goalFields({ title: "", category: "Strength", due: "This week", progress: 0, checkpoints: ["", "", "", ""] })}
      <button class="btn btn-primary" type="submit">${isCoach ? "Create plan" : "Create goal"}</button>
      ${button("Back", "btn-ghost", "goals")}
    </form>
  `);
}

function goalDetailView() {
  const goal = state.goals.find((item) => item.id === state.activeGoalId) || state.goals[0];
  if (!goal) {
    return withTabs("goals", `<div class="member-empty"><strong>No goal selected.</strong><span>Set a goal first.</span></div>`);
  }
  const progress = goalProgress(goal);
  return withTabs("goals", `
    <div class="goal-setup-screen">
      <button class="member-view-all back-button" data-action="goals">Back</button>
      <div>
        <h1>${goal.title}</h1>
        <p>${activityLabel(goal.type || goal.category)} · Due ${goal.due}</p>
      </div>
      ${memberGoalCard(goal)}
      <form class="activity-log-form" data-form="goal-progress">
        <input type="hidden" name="id" value="${goal.id}" />
        <label class="field">
          <span>Distance covered now (km)</span>
          <input class="input" name="coveredDistance" type="number" min="0" max="5000" step="0.1" value="${goal.coveredDistance || 0}" required />
        </label>
        <div class="goal-progress-summary">${progress}% complete</div>
        <button class="btn btn-primary activity-submit" type="submit">Update Goal</button>
      </form>
    </div>
  `);
}

function activitiesView() {
  const totalDistance = state.activities.reduce((total, activity) => total + Number(activity.distance || 0), 0);
  return withTabs("activities", `
    <div class="activity-history-screen">
      <div class="topbar member-page-topbar">
        <div>
          <h1>Activities</h1>
          <p>${state.activities.length} logged · ${formatDistance(totalDistance)} km total</p>
        </div>
        ${button("+ Log", "btn-primary", "log-activity")}
      </div>
      <div class="stack">
        ${state.activities.length
          ? state.activities.map((activity) => activityCard(activity)).join("")
          : `<div class="member-empty"><strong>No activities yet.</strong><span>Log a run, bike ride, or hike to see it here.</span></div>`}
      </div>
    </div>
  `);
}

function eventsView() {
  const groups = eventNotificationsByType();
  const activeFilter = state.eventFilter || "All";
  const types = [
    { key: "All", label: "All" },
    { key: "Running", label: "Run" },
    { key: "Hiking", label: "Hike" },
    { key: "Cycling", label: "Bike" },
  ];
  const selectedTypes = activeFilter === "All" ? types : types.filter((type) => type.key === activeFilter);

  return withTabs("events", `
    <div class="events-screen">
      <div class="member-page-topbar requests-head">
        <h1>Events</h1>
        <p>Notifications grouped by activity type</p>
      </div>
      <div class="event-filter-tabs" role="tablist" aria-label="Event categories">
        ${types.map((type) => `
          <button class="${activeFilter === type.key ? "active" : ""}" data-action="set-event-filter" data-filter="${type.key}" type="button" aria-label="${type.label}">
            ${type.key === "All" ? "All" : interestIcon(type.key)}
          </button>
        `).join("")}
      </div>
      <div class="events-grid">
        ${selectedTypes.map((type) => `
          <section class="event-category-card">
            <div class="event-category-head">
              <span>${type.key === "All" ? "All" : interestIcon(type.key)}</span>
              <div>
                <h2>${type.label}</h2>
                <p>${groups[type.key].length} notification${groups[type.key].length === 1 ? "" : "s"}</p>
              </div>
            </div>
            <div class="event-list">
              ${groups[type.key].length ? groups[type.key].map((item) => `
                <article class="event-notification">
                  <strong>${item.title}</strong>
                  <p>${item.message}</p>
                  <span>${item.meta}</span>
                </article>
              `).join("") : `<div class="event-empty">${type.key === "All" ? "No general announcements yet." : `No ${type.label.toLowerCase()} notifications yet.`}</div>`}
            </div>
          </section>
        `).join("")}
      </div>
    </div>
  `);
}

function statsView() {
  const period = state.statsPeriod || "Day";
  return withTabs("profile", `
    <div class="stats-screen">
      <button class="member-view-all back-button" data-action="view-profile">Back</button>
      <div class="member-page-topbar requests-head">
        <h1>My stats</h1>
        <p>Distance covered and calories burned</p>
      </div>
      ${statsPeriodTabs(period)}
      <div class="stats-selected">
        ${statPeriodCard(period)}
      </div>
    </div>
  `);
}

function historyTabs(activeTab) {
  return `
    <div class="history-tabs" role="tablist" aria-label="History tabs">
      ${["sessions", "requests"].map((tabName) => `
        <button class="${activeTab === tabName ? "active" : ""}" data-action="set-history-tab" data-tab="${tabName}" type="button">${tabName === "sessions" ? "Sessions" : "Requests"}</button>
      `).join("")}
    </div>
  `;
}

function historyView() {
  const activeTab = state.historyTab || "sessions";
  const bookedSessions = state.sessions.filter((session) => sessionConfirmedForUser(session));
  const partnerRequests = state.partners;

  return withTabs("profile", `
    <div class="history-screen">
      <button class="member-view-all back-button" data-action="view-profile">Back</button>
      <div class="member-page-topbar requests-head">
        <h1>History</h1>
        <p>${activeTab === "sessions" ? `${bookedSessions.length} booked session${bookedSessions.length === 1 ? "" : "s"}` : `${partnerRequests.length} partner request${partnerRequests.length === 1 ? "" : "s"}`}</p>
      </div>
      ${historyTabs(activeTab)}
      <div class="stack">
        ${activeTab === "sessions"
          ? bookedSessions.length
            ? bookedSessions.map((session) => sessionCard(session)).join("")
            : `<div class="member-empty"><strong>No booked sessions yet.</strong><span>Sessions you book will appear here.</span></div>`
          : partnerRequests.length
            ? partnerRequests.map((name) => `
              <button class="friend-row" data-action="open-friend-chat" data-name="${name}">
                <span class="friend-avatar">${initials(name)}</span>
                <span>
                  <strong>${name}</strong>
                  <small>Partner request connected</small>
                </span>
                <b>›</b>
              </button>
            `).join("")
            : `<div class="member-empty"><strong>No partner requests yet.</strong><span>People you request or connect with will appear here.</span></div>`}
      </div>
    </div>
  `);
}

function activityFormView() {
  return withTabs("activities", `
    <div class="activity-log-screen">
      <button class="member-view-all back-button" data-action="back">Back</button>
      <div>
        <h1>Log Activity</h1>
        <p>Choose one activity and add the workout details.</p>
      </div>
      <form class="activity-log-form" data-form="activity">
        ${activityTypePicker("Running")}
        <label class="field">
          <span>Time of activity</span>
          <input class="input" name="time" type="datetime-local" max="${localDateTimeValue()}" required />
        </label>
        <label class="field">
          <span>Distance covered (km)</span>
          <input class="input" name="distance" type="number" min="0.1" max="500" step="0.1" placeholder="5.0" required />
        </label>
        <label class="field">
          <span>Activity duration (minutes)</span>
          <input class="input" name="duration" type="number" min="1" max="1440" step="1" placeholder="30" required />
        </label>
        <button class="btn btn-primary activity-submit" type="submit">Save Activity</button>
      </form>
    </div>
  `);
}

function sessionsView() {
  if (state.profile.role === "coach") {
    const ownSessions = state.sessions.filter((session) => isOwnSession(session));
    return withTabs("sessions", `
      <div class="topbar">
        <h1>My Sessions</h1>
        ${button("+ Session", "btn-primary", "new-session")}
      </div>
      <div class="stack">
        ${ownSessions.length ? ownSessions.map((session) => sessionCard(session)).join("") : `<div class="empty">No sessions yet. Create your first coaching session.</div>`}
      </div>
    `);
  }

  const offeredSessions = state.sessions.filter((session) => !sessionConfirmedForUser(session) && !isOwnSession(session));
  return withTabs("sessions", `
    <div class="member-page-topbar requests-head">
      <h1>Sessions</h1>
      <p>${offeredSessions.length} session${offeredSessions.length === 1 ? "" : "s"} offered</p>
    </div>
    <div class="stack" style="margin-top: 12px;">
      ${offeredSessions.length
        ? offeredSessions.map((session) => sessionCard(session)).join("")
        : `<div class="member-empty"><strong>No sessions offered yet.</strong><span>Coach-created sessions will appear here when available.</span></div>`}
    </div>
  `);
}

function requestsView() {
  const requests = (state.partnerRequests || []).map(normalizePartnerRequest);
  return withTabs("profile", `
    <div class="history-screen">
      <button class="member-view-all back-button" data-action="view-profile">Back</button>
      <div class="member-page-topbar requests-head">
        <h1>Requests</h1>
        <p>${requests.length} request${requests.length === 1 ? "" : "s"} received</p>
      </div>
      <div class="stack" style="margin-top: 12px;">
        ${requests.length
          ? requests.map((request) => partnerRequestCard(request)).join("")
          : `<div class="member-empty"><strong>No requests yet.</strong><span>When another user or coach asks to partner with you, their request will appear here.</span></div>`}
      </div>
    </div>
  `);
}

function normalizePartnerRequest(request) {
  if (typeof request === "string") {
    return { id: request, name: request, role: "member", city: "", interests: "" };
  }
  return {
    id: request.id || request.name,
    name: request.name || "Intaliq member",
    role: request.role || "member",
    city: request.city || "",
    interests: request.primaryGoal || request.specialty || request.interests || "",
  };
}

function partnerRequestCard(request) {
  const interests = selectedInterests(request.interests);
  return `
    <article class="partner-request-card">
      <div class="friend-row-static">
        <span class="friend-avatar">${initials(request.name)}</span>
        <span>
          <strong>${request.name}</strong>
          <small>${request.role === "coach" ? "Coach" : "User"}${request.city ? ` · ${request.city}` : ""}</small>
        </span>
        <span class="pill">${request.role === "coach" ? "Coach" : "User"}</span>
      </div>
      <div class="partner-interest-line">
        ${interests.length ? interests.map((item) => interestIcon(item)).join("") : "<span>No interests yet</span>"}
      </div>
      <div class="partner-request-actions">
        <button class="btn btn-primary" data-action="accept-partner-request" data-id="${request.id}" data-name="${request.name}">Accept</button>
        <button class="btn btn-ghost" data-action="reject-partner-request" data-id="${request.id}">Reject</button>
      </div>
    </article>
  `;
}

function sessionFormView() {
  if (state.profile.role !== "coach") {
    return withTabs("sessions", `
      <div class="member-empty">
        <strong>Only coaches can create sessions.</strong>
        <span>Users can request to join coach-created sessions.</span>
      </div>
    `);
  }

  const message = state.authMessage ? `<div class="member-toast">${state.authMessage}</div>` : "";
  const error = state.authError ? `<div class="notice danger-box">${state.authError}</div>` : "";
  return withTabs("sessions", `
    <div class="coach-session-form-screen">
      <div class="coach-form-topbar">
        <button class="member-view-all back-button" data-action="sessions">← Back</button>
        <button class="coach-logout" data-action="signout">Logout</button>
      </div>
      ${message}
      ${error}
      <form class="coach-session-form-card" data-form="session">
        <div>
          <h1>Create Group Session</h1>
          <p>Set up a new session for members to join</p>
        </div>
        ${sessionFields()}
        <div class="coach-form-actions">
          <button class="btn btn-primary activity-submit" type="submit">Create Session</button>
          <button class="btn btn-ghost" type="button" data-action="sessions">Cancel</button>
        </div>
      </form>
    </div>
  `);
}

function sessionDetailView() {
  const session = state.sessions.find((item) => item.id === state.activeSessionId) || state.sessions[0];
  const isCoach = state.profile.role === "coach";
  const canDeleteSession = isCoach && isOwnSession(session);
  const joined = sessionConfirmedForUser(session);
  const requestPending = sessionRequestPending(session);
  const members = enrolledMembers(session);
  const pendingApplicants = session.pendingApplicants || [];
  const announcements = session.announcements || [];
  return page(session.title, `${session.date} · ${session.time}`, `
    <div class="stack">
      ${!isCoach && joined ? `
        <div class="notice session-request-notice">
          <strong>Session confirmed</strong>
          <span>You have been admitted by the coach.</span>
        </div>
      ` : ""}
      ${!isCoach && requestPending && !joined ? `
        <div class="notice session-request-notice">
          <strong>Request sent</strong>
          <span>Waiting for coach approval.</span>
        </div>
      ` : ""}
      <div class="card stack">
        <div class="session-head">
          <h3>${session.type}</h3>
          <span class="pill ${joined || isCoach || requestPending ? "" : "warn"}">${isCoach ? session.level : joined ? "Joined" : requestPending ? "Pending" : session.admission}</span>
        </div>
        <p class="subtle">${session.notes}</p>
        ${session.accessibility && session.accessibility !== "None" ? `<div class="accessibility-badge">${session.accessibility === "Wheelchair-Friendly" ? "♿ " : ""}${session.accessibility}</div>` : ""}
        <div class="metric-row">
          <div class="metric"><b>${members.length}</b><span>Joined</span></div>
          <div class="metric"><b>${session.capacity}</b><span>Seats</span></div>
          <div class="metric"><b>${session.id}</b><span>Code</span></div>
        </div>
      </div>
      ${isCoach ? `
        <div class="card stack">
          <div class="goal-head">
            <h3>Admission requests</h3>
            <span class="pill warn">${pendingApplicants.length} pending</span>
          </div>
          ${pendingApplicants.length ? pendingApplicants.map((name) => `
            <div class="list-row">
              <span>${name}</span>
              <button class="btn-link" data-action="admit-user" data-id="${session.id}" data-name="${name}">Admit</button>
            </div>
          `).join("") : `<div class="empty">No pending users.</div>`}
        </div>
        <form class="card stack" data-form="announcement">
          <label class="field"><span>Announcement</span><textarea class="textarea" name="announcement" placeholder="Share an update with this session" maxlength="500" required></textarea></label>
          <input type="hidden" name="sessionId" value="${session.id}" />
          <button class="btn btn-primary" type="submit">Post announcement</button>
        </form>
      ` : ""}
      ${announcements.length ? `
        <div class="card stack">
          <h3>Announcements</h3>
          ${announcements.map((item) => `<div class="list-row"><span>${item}</span><span class="pill gray">coach</span></div>`).join("")}
        </div>
      ` : ""}
      <div class="card">
        ${members.length ? members.map((member) => `<div class="list-row"><span>${member}</span><span class="pill gray">member</span></div>`).join("") : `<div class="empty">No enrolled users yet.</div>`}
      </div>
      ${isCoach ? "" : joined ? button("Leave session", "btn-ghost", "leave-session", `data-id="${session.id}"`) : requestPending ? `<button class="btn btn-dark" type="button" disabled>Pending</button>` : button(session.admission === "Approval required" ? "Request to join" : "Join session", "btn-primary", "request-join-session", `data-id="${session.id}"`)}
      ${canDeleteSession ? `<button class="btn btn-danger" data-action="delete-session" data-id="${session.id}">Delete session</button>` : ""}
      ${button("Back", "btn-ghost", "sessions")}
    </div>
  `);
}

function profileView() {
  const message = state.authMessage ? `<div class="member-toast">${state.authMessage}</div>` : "";
  return withTabs("profile", `
    <div class="more-menu-screen">
      <div>
        <h1>More</h1>
        <p>Manage your account and support options.</p>
      </div>
      ${message}
      <div class="more-menu-list">
        ${moreMenuRow("◉", "View Profile", "view-profile")}
        ${state.profile.isAdmin ? moreMenuRow("⚑", "Admin Dashboard", "open-admin") : ""}
        ${moreMenuRow("◇", "Find Partners", "find-partners")}
        ${moreMenuRow("✦", "Chat with AI", "chat-ai")}
        ${moreMenuRow("◐", "Appearance", "toggle-theme", currentTheme() === "light" ? "Light" : "Dark", false)}
        ${moreMenuRow("◎", "Language", "toggle-language", currentLanguage() === "ar" ? "العربية" : "English", false)}
        ${moreMenuRow("?", "Help", "help", "intaliqsupport@gmail.com", false)}
        ${moreMenuRow("↩", "Log out", "signout")}
      </div>
    </div>
  `);
}

function moreMenuRow(icon, label, action, meta = "", showArrow = true) {
  return `
    <button class="more-menu-row" data-action="${action}">
      <span class="more-row-icon">${icon}</span>
      <span>${label}</span>
      ${meta ? `<em>${meta}</em>` : ""}
      ${showArrow ? "<strong>›</strong>" : "<strong></strong>"}
    </button>
  `;
}

function profileDetailView() {
  const name = state.profile.name || "New user";
  const message = state.authMessage ? `<div class="member-toast">${state.authMessage}</div>` : "";
  const handle = state.profile.username ? `<bdi>@${state.profile.username}</bdi>` : "";
  const city = state.profile.city || "Not set";
  const age = profileAge();
  const ageVisible = state.profile.showAge !== "false" && age;
  const nationality = nationalityOptions().find((item) => item.value === state.profile.nationality);
  const interestIcons = selectedInterests(state.profile.primaryGoal).map((item) => interestIcon(item)).join("");
  const isCoach = state.profile.role === "coach";
  return withTabs("profile", `
    <div class="profile-sketch-screen">
      <button class="member-view-all back-button" data-action="profile-menu">Back</button>
      ${message}
      <div class="profile-sketch-head">
        ${profileAvatar()}
        <h1>${name}</h1>
        <p>${[handle, state.profile.city].filter(Boolean).join(" <span>|</span> ")}</p>
      </div>
      <div class="profile-info-grid">
        <div><strong>${ageVisible ? age : age ? "Hidden" : "Not set"}</strong><span>Age</span></div>
        <div><strong class="profile-interest-icons">${interestIcons || "—"}</strong><span>Interest</span></div>
        <div><strong>${city}</strong><span>City</span></div>
        <div><strong>${nationality ? nationality.flag : "🌐"}</strong><span>${nationality ? nationality.label : "Nationality"}</span></div>
      </div>
      <div class="profile-sketch-list">
        ${profileSketchRow("◉", "Profile", "view-profile-edit")}
        ${profileSketchRow("◇", "Friends", "find-partners")}
        ${profileSketchRow("✦", "Requests", "requests")}
        ${isCoach ? "" : profileSketchRow("↗", "My stats", "stats")}
        ${isCoach ? "" : profileSketchRow("◷", "History", "history")}
      </div>
    </div>
  `);
}

function profileSketchRow(icon, label, action, meta = "", showArrow = true) {
  return `
    <button class="profile-sketch-row" data-action="${action}">
      <span>${icon}</span>
      <strong>${label}</strong>
      ${meta ? `<em>${meta}</em>` : ""}
      ${showArrow ? "<b>›</b>" : "<b></b>"}
    </button>
  `;
}

function cityOptions() {
  return ["Riyadh", "Jeddah", "Tabuk", "Mecca", "Madina"];
}

function nationalityOptions() {
  return [
    { value: "", label: "Not set", flag: "🌐" },
    { value: "Saudi Arabia", label: "Saudi Arabia", flag: "🇸🇦" },
    { value: "Egypt", label: "Egypt", flag: "🇪🇬" },
    { value: "United Arab Emirates", label: "United Arab Emirates", flag: "🇦🇪" },
    { value: "Kuwait", label: "Kuwait", flag: "🇰🇼" },
    { value: "Bahrain", label: "Bahrain", flag: "🇧🇭" },
    { value: "Qatar", label: "Qatar", flag: "🇶🇦" },
    { value: "Oman", label: "Oman", flag: "🇴🇲" },
    { value: "Jordan", label: "Jordan", flag: "🇯🇴" },
    { value: "Lebanon", label: "Lebanon", flag: "🇱🇧" },
    { value: "Palestine", label: "Palestine", flag: "🇵🇸" },
    { value: "Yemen", label: "Yemen", flag: "🇾🇪" },
    { value: "Pakistan", label: "Pakistan", flag: "🇵🇰" },
    { value: "India", label: "India", flag: "🇮🇳" },
    { value: "Philippines", label: "Philippines", flag: "🇵🇭" },
    { value: "United States", label: "United States", flag: "🇺🇸" },
    { value: "United Kingdom", label: "United Kingdom", flag: "🇬🇧" },
  ];
}

function profileEditView() {
  const values = profileFormValues();
  const message = state.authMessage ? `<div class="member-toast">${state.authMessage}</div>` : "";
  const error = state.authError ? `<div class="notice danger-box">${state.authError}</div>` : "";
  return withTabs("profile", `
    <div class="profile-edit-screen">
      <button class="member-view-all back-button" data-action="view-profile">Back</button>
      <div>
        <h1>Edit Profile</h1>
        <p>Update your account details and public profile.</p>
      </div>
      ${message}
      ${error}
      <form class="activity-log-form" data-form="profile">
        <label class="profile-photo-picker">
          ${profileAvatar()}
          <span>Profile picture</span>
          <input name="avatarFile" type="file" accept="image/*" />
        </label>
        <label class="field"><span>Full name</span><input class="input" name="name" value="${values.name}" maxlength="60" required /></label>
        ${usernameField(values.username, "input")}
        <label class="field"><span>Email</span><input class="input" name="email" type="email" value="${values.email}" required /></label>
        <label class="field"><span>Birthdate</span><input class="input" name="birthdate" type="date" value="${values.birthdate}" min="${birthdateLimits().min}" max="${birthdateLimits().max}" /></label>
        <label class="toggle-row">
          <input type="hidden" name="showAge" value="false" />
          <input type="checkbox" name="showAge" value="true" ${values.showAge !== "false" ? "checked" : ""} />
          <span>Display age on profile</span>
        </label>
        ${interestPicker(values.primaryGoal)}
        <label class="field">
          <span>Location</span>
          ${citySelect("select")}
        </label>
        <label class="field">
          <span>Nationality</span>
          ${nationalitySelect("select")}
        </label>
        <input type="hidden" name="role" value="${values.role}" />
        <input type="hidden" name="fitnessLevel" value="${values.fitnessLevel}" />
        <input type="hidden" name="specialty" value="${values.specialty}" />
        <fieldset class="password-change">
          <legend>Change password</legend>
          <p>Leave these blank to keep your current password.</p>
          <label class="field"><span>Current password</span><input class="input" name="currentPassword" type="password" autocomplete="current-password" /></label>
          <label class="field"><span>New password</span><input class="input" name="newPassword" type="password" minlength="8" maxlength="72" autocomplete="new-password" /></label>
          <label class="field"><span>Confirm new password</span><input class="input" name="confirmPassword" type="password" minlength="8" maxlength="72" autocomplete="new-password" /></label>
        </fieldset>
        <button class="btn btn-primary activity-submit" type="submit" ${state.authLoading ? "disabled" : ""}>${state.authLoading ? "Saving..." : "Update Profile"}</button>
      </form>
    </div>
  `);
}

function profileSetupView() {
  const values = profileFormValues();
  const isCoach = values.role === "coach";
  const error = state.authError ? `<div class="notice danger-box">${state.authError}</div>` : "";
  return `
    <div class="auth-screen profile-setup-screen">
      <button type="button" class="auth-home-link" data-action="signout">Log out</button>
      <header class="auth-hero">
        <h1>Complete your profile</h1>
        <p>Tell people a bit about you. You can change this later.</p>
      </header>
      <form class="auth-panel stack" data-form="profile-setup">
        ${error}
        <label class="profile-photo-picker">
          ${profileAvatar()}
          <span>Add a profile picture (optional)</span>
          <input name="avatarFile" type="file" accept="image/*" />
        </label>
        <label class="field"><span>Full name</span><input class="input auth-input" name="name" value="${escapeHtml(values.name)}" autocomplete="name" maxlength="60" required /></label>
        ${usernameField(values.username, "input auth-input")}
        <label class="field"><span>Birthdate</span><input class="input auth-input" name="birthdate" type="date" value="${values.birthdate}" min="${birthdateLimits().min}" max="${birthdateLimits().max}" required /></label>
        <label class="toggle-row">
          <input type="hidden" name="showAge" value="false" />
          <input type="checkbox" name="showAge" value="true" ${values.showAge !== "false" ? "checked" : ""} />
          <span>Display age on profile</span>
        </label>
        <label class="field"><span>City</span>${citySelect("select auth-input")}</label>
        <label class="field"><span>Nationality</span>${nationalitySelect("select auth-input")}</label>
        ${isCoach ? specialtyPicker(values.specialty) : `
          ${interestPicker(values.primaryGoal)}
          <label class="field">
            <span>Fitness level</span>
            <select class="select auth-input" name="fitnessLevel">
              ${["Beginner", "Intermediate", "Advanced"].map((level) => `<option ${level === values.fitnessLevel ? "selected" : ""}>${level}</option>`).join("")}
            </select>
          </label>
        `}
        <button class="btn btn-primary auth-submit" type="submit" ${state.authLoading ? "disabled" : ""}>${state.authLoading ? "Saving..." : "Save and continue"}</button>
      </form>
    </div>
  `;
}

// What the profile forms show: the saved profile, plus whatever the user typed
// before a validation error, so a failed save doesn't wipe their input.
function profileFormValues() {
  return { ...state.profile, ...(state.profileDraft || {}) };
}

function keepProfileDraft(data) {
  const { currentPassword, newPassword, confirmPassword, password, avatarFile, avatarInvalid, ...draft } = data;
  return { ...draft, showAge: draft.showAge === "true" ? "true" : "false" };
}

function citySelect(className, values = profileFormValues()) {
  return `
    <select class="${className}" name="city">
      <option value="">Choose your city</option>
      ${cityOptions().map((city) => `<option value="${city}" ${city === values.city ? "selected" : ""}>${city}</option>`).join("")}
    </select>
  `;
}

function nationalitySelect(className, values = profileFormValues()) {
  return `
    <select class="${className}" name="nationality">
      ${nationalityOptions().map((item) => `<option value="${item.value}" ${item.value === values.nationality ? "selected" : ""}>${item.flag} ${item.label}</option>`).join("")}
    </select>
  `;
}

const USERNAME_HINT = "3-20 characters: letters, numbers, dots and underscores.";
const USERNAME_SETUP_ERROR = "Usernames aren't set up yet. Run supabase/profile-username.sql in Supabase, then try again.";
let usernameCheckTimer = null;

function usernameField(value, className) {
  return `
    <label class="field username-field">
      <span>Username</span>
      <input class="${className}" name="username" value="${value}" placeholder="e.g. sara.runs" data-username-input dir="ltr" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="21" required />
      <small class="username-status" data-username-status aria-live="polite">${USERNAME_HINT}</small>
    </label>
  `;
}

function normalizeUsername(value) {
  return String(value || "").trim().replace(/^@+/, "").toLowerCase();
}

function usernameFormatError(username) {
  if (!username) return "Choose a username.";
  if (username.length < 3) return "Usernames need at least 3 characters.";
  if (username.length > 20) return "Usernames can be up to 20 characters.";
  if (!/^[a-z0-9][a-z0-9._]*$/.test(username)) return "Use only letters, numbers, dots and underscores, starting with a letter or number.";
  return "";
}

async function checkUsernameAvailability(username) {
  if (!supabase) return { error: "Add Supabase environment variables before choosing a username." };
  const { data, error } = await supabase.rpc("username_available", { candidate: username });
  // Without supabase/profile-username.sql there's no RPC, so look the name up directly.
  if (error?.code === "PGRST202") return checkUsernameInProfiles(username);
  if (error) {
    console.warn("Unable to check username:", error.message);
    return { error: "Could not check that username. Please try again." };
  }
  return { available: data === true };
}

async function checkUsernameInProfiles(username) {
  let query = supabase.from("profiles").select("id").eq("username", username).limit(1);
  if (state.user) query = query.neq("id", state.user.id);
  const { data, error } = await query;
  if (error) {
    console.warn("Unable to check username:", error.message);
    return { error: error.code === "42703" ? USERNAME_SETUP_ERROR : "Could not check that username. Please try again." };
  }
  return { available: !data.length };
}

// Returns an error message, or "" when the username can be saved.
async function usernameProblem(username) {
  const formatError = usernameFormatError(username);
  if (formatError) return formatError;
  if (username === state.profile.username) return "";
  const result = await checkUsernameAvailability(username);
  if (result.error) return result.error;
  return result.available ? "" : "That username is taken.";
}

function usernameSaveError(error) {
  if (error.code === "23505") return "That username is taken.";
  if (error.code === "42703" || error.code === "PGRST204") return USERNAME_SETUP_ERROR;
  return error.message;
}

// Live feedback while typing. Updates the hint in place so the input keeps focus.
function watchUsernameField() {
  const input = app.querySelector("[data-username-input]");
  const status = app.querySelector("[data-username-status]");
  if (!input || !status) return;
  const show = (message, tone = "") => {
    status.textContent = currentLanguage() === "ar" ? translate(message) : message;
    status.dataset.tone = tone;
  };
  input.addEventListener("input", () => {
    clearTimeout(usernameCheckTimer);
    const username = normalizeUsername(input.value);
    const formatError = usernameFormatError(username);
    if (formatError) {
      show(formatError, "bad");
      return;
    }
    if (username === state.profile.username) {
      show("This is your current username.", "ok");
      return;
    }
    show("Checking...");
    usernameCheckTimer = setTimeout(async () => {
      const result = await checkUsernameAvailability(username);
      if (normalizeUsername(input.value) !== username) return;
      if (result.error) show(result.error, "bad");
      else show(result.available ? "Username is available." : "That username is taken.", result.available ? "ok" : "bad");
    }, 400);
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}

function aiChatView() {
  const messages = state.aiMessages || [];
  return withTabs("profile", `
    <div class="ai-chat-screen">
      <button class="member-view-all back-button" data-action="profile-menu">Back</button>
      <div>
        <h1>AI Coach</h1>
        <p>Ask for workout ideas, goal pacing, or session suggestions.</p>
      </div>
      <form class="ai-chat-card" data-form="ai-chat">
        <div class="ai-bubble">Hi, I can help you plan your next Intaliq activity. What are you training for?</div>
        ${messages.map((message) => `<div class="${message.role === "user" ? "ai-bubble user-bubble" : "ai-bubble"}">${escapeHtml(message.content)}</div>`).join("")}
        ${state.aiLoading ? `<div class="ai-bubble ai-typing">Thinking...</div>` : ""}
        ${state.aiError ? `<div class="notice danger-box">${escapeHtml(state.aiError)}</div>` : ""}
        <label class="field">
          <span>Message</span>
          <textarea class="textarea" name="message" placeholder="Ask Intaliq AI..." required ${state.aiLoading ? "disabled" : ""}></textarea>
        </label>
        <button class="btn btn-primary activity-submit" type="submit" ${state.aiLoading ? "disabled" : ""}>${state.aiLoading ? "Sending..." : "Send"}</button>
        ${messages.length ? `<button class="member-view-all" type="button" data-action="clear-ai-chat">Clear chat</button>` : ""}
      </form>
    </div>
  `);
}

async function sendAiMessage(text) {
  const message = text.trim();
  if (!message || state.aiLoading) return;
  const aiMessages = [...(state.aiMessages || []), { role: "user", content: message }];
  setState({ aiMessages, aiLoading: true, aiError: "" });

  try {
    const response = await fetch(aiWorkerUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: aiMessages,
        profile: {
          name: state.profile.name,
          fitnessLevel: state.profile.fitnessLevel,
          goals: (state.goals || []).map((goal) => `${goal.title} (${goal.progress}% done)`),
        },
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.reply) throw new Error(result.error || "The AI coach did not respond.");
    setState({ aiMessages: [...aiMessages, { role: "assistant", content: result.reply }], aiLoading: false });
  } catch (error) {
    setState({ aiLoading: false, aiError: error.message || "Could not reach the AI coach." });
  }
}

function partnersView() {
  if (state.profile.role === "coach") {
    const sessionOptions = state.sessions.filter((session) => isOwnSession(session)).map((session) => `
      <option value="${session.id}">${session.title} · ${session.date} at ${session.time}</option>
    `).join("");

    return withTabs("partners", `
      <div class="coach-session-form-screen">
        <div class="coach-form-topbar">
          <button class="member-view-all back-button" type="button" data-action="back">← Back</button>
          <button class="coach-logout" type="button" data-action="signout">Logout</button>
        </div>
        ${state.authMessage ? `<div class="member-toast">${state.authMessage}</div>` : ""}
        <form class="coach-announcement-form-card" data-form="announcement">
          <div>
            <h1>Make Announcement</h1>
            <p>Send Updates to session participants</p>
          </div>
          <label class="field">
            <span>Select Session</span>
            <select class="select" name="sessionId" required>
              <option value="" disabled selected>Choose a session...</option>
              <option value="general">General</option>
              ${sessionOptions}
            </select>
          </label>
          <label class="field">
            <span>Subject</span>
            <input class="input" name="subject" placeholder="e.g., Location Change, Time Update, Important Notice" maxlength="80" required />
          </label>
          <label class="field">
            <span>Message</span>
            <textarea class="textarea" name="announcement" placeholder="Write your announcement message..." maxlength="500" required></textarea>
          </label>
          <div class="announcement-note"><strong>Note:</strong> This announcement will be sent to all participants in the selected session.</div>
          <div class="coach-form-actions">
            <button class="btn btn-primary" type="submit">Send Announcement</button>
            <button class="btn btn-ghost" type="button" data-action="back">Cancel</button>
          </div>
        </form>
      </div>
    `);
  }

  return findPartnersView();
}

function findPartnersView() {
  const query = state.partnerSearch.trim().toLowerCase();
  const partners = state.partnerDirectory.filter((partner) => {
    const searchable = [partner.name, partner.city, partner.primaryGoal, partner.role].join(" ").toLowerCase();
    return !query || searchable.includes(query);
  });
  const directoryMessage = state.partnerDirectoryLoading
    ? `<div class="member-empty friend-empty"><strong>Loading partner accounts...</strong><span>Checking public Intaliq profiles.</span></div>`
    : state.partnerDirectoryError
      ? `<div class="member-empty friend-empty"><strong>Could not load partner accounts.</strong><span>${state.partnerDirectoryError}</span></div>`
      : `
        <div class="member-empty friend-empty">
          <strong>No partner accounts found.</strong>
          <span>
            ${state.partnerDirectory.length ? "Try a different search." : "When users create public profiles in Supabase, they will appear here."}
          </span>
        </div>
      `;

  return withTabs("profile", `
    <div class="topbar">
      <h1>Find Partners</h1>
    </div>
    <div class="stack">
      <label class="field partner-search">
        <span>Search users</span>
        <input class="input" data-partner-search value="${state.partnerSearch}" placeholder="Search by name, city, or interest" />
      </label>
      ${partners.length ? partners.map((partner) => {
        const connected = state.partners.includes(partner.name);
        return `
        <article class="partner-card">
          <div class="friend-row-static">
            <span class="friend-avatar">${initials(partner.name)}</span>
            <span>
              <strong>${partner.name}</strong>
              <small>${partner.city || "City not set"}</small>
            </span>
            <span class="pill">${partner.role === "coach" ? "Coach" : "User"}</span>
          </div>
          <div class="partner-interest-line">
            ${selectedInterests(partner.primaryGoal || partner.specialty).length ? selectedInterests(partner.primaryGoal || partner.specialty).map((item) => interestIcon(item)).join("") : "<span>No interests yet</span>"}
          </div>
          <button class="btn btn-primary" data-action="${connected ? "open-friend-chat" : "connect-partner"}" data-name="${partner.name}">${connected ? "Message" : "Connect"}</button>
        </article>
      `}).join("") : directoryMessage}
    </div>
  `);
}

function friendChatView() {
  const name = state.activeFriendName || "Friend";
  return withTabs("partners", `
    <div class="ai-chat-screen">
      <button class="member-view-all back-button" data-action="find-partners">Back</button>
      <div>
        <h1>${name}</h1>
        <p>Chat with your Intaliq friend.</p>
      </div>
      <div class="ai-chat-card">
        <div class="ai-bubble">Start the conversation with ${name}.</div>
        <label class="field">
          <span>Message</span>
          <textarea class="textarea" placeholder="Write a message..."></textarea>
        </label>
        <button class="btn btn-primary activity-submit" type="button">Send</button>
      </div>
    </div>
  `);
}

const SUSPENDED_MESSAGE = "This account has been suspended. Contact intaliqsupport@gmail.com if you think this is a mistake.";
const ADMIN_SETUP_ERROR = "Admin tools aren't set up yet. Run supabase/admin.sql in Supabase, then try again.";
const ADMIN_TABS = [
  ["overview", "Overview"],
  ["coaches", "Coach applications"],
  ["users", "Users"],
  ["sessions", "Sessions"],
  ["announcements", "Announcements"],
  ["log", "Activity log"],
];
const ADMIN_LOG_LABELS = {
  set_role: "Changed account type",
  approve_coach: "Approved coach",
  reject_coach: "Turned down coach",
  suspend: "Suspended account",
  unsuspend: "Restored account",
  grant_admin: "Made admin",
  revoke_admin: "Removed admin",
  delete_session: "Deleted session",
  post_announcement: "Posted announcement",
  delete_announcement: "Deleted announcement",
};
let suspendedSignOutPending = false;

// Deferred because calling supabase.auth from inside onAuthStateChange can deadlock supabase-js.
function signOutSuspendedUser() {
  suspendedSignOutPending = true;
  setTimeout(() => supabase.auth.signOut(), 0);
}

function adminDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(dateLocale(), { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function adminDateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(dateLocale(), { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function adminEmpty(title, detail) {
  return `<div class="member-empty"><strong>${title}</strong><span>${detail}</span></div>`;
}

function adminView() {
  const activeTab = state.adminTab || "overview";
  const message = state.authMessage ? `<div class="member-toast">${state.authMessage}</div>` : "";
  const error = state.adminError ? `<div class="notice danger-box">${escapeHtml(state.adminError)}</div>` : "";
  const panels = {
    overview: adminOverviewPanel,
    coaches: adminCoachesPanel,
    users: adminUsersPanel,
    sessions: adminSessionsPanel,
    announcements: adminAnnouncementsPanel,
    log: adminLogPanel,
  };
  return withTabs("profile", `
    <div class="admin-screen">
      <div class="admin-head">
        <button class="member-view-all back-button" data-action="profile-menu">Back</button>
        <button class="member-view-all" data-action="admin-refresh" ${state.adminLoading ? "disabled" : ""}>Refresh</button>
      </div>
      <div>
        <h1>Admin Dashboard</h1>
        <p>Manage accounts, sessions and announcements across Intaliq.</p>
      </div>
      <div class="admin-tabs" role="tablist" aria-label="Admin sections">
        ${ADMIN_TABS.map(([id, label]) => `
          <button type="button" role="tab" aria-selected="${activeTab === id}" class="${activeTab === id ? "active" : ""}" data-action="admin-tab" data-tab="${id}">${label}</button>
        `).join("")}
      </div>
      ${message}
      ${error}
      ${state.adminLoading ? `<p class="admin-loading">Loading...</p>` : (panels[activeTab] || adminOverviewPanel)()}
    </div>
  `);
}

function adminOverviewPanel() {
  const overview = state.adminOverview;
  if (!overview) return state.adminError ? "" : adminEmpty("No numbers yet.", "Tap Refresh to load them.");
  return `
    <section class="coach-stat-grid admin-stat-grid" aria-label="Platform stats">
      ${coachStat("Users", overview.total_users, `+${overview.new_users_7d} this week`)}
      ${coachStat("Coach applications", overview.coach_applications ?? 0, "")}
      ${coachStat("Active this week", overview.active_users_7d, "")}
      ${coachStat("Coaches", overview.coaches, "")}
      ${coachStat("Members", overview.members, "")}
      ${coachStat("Sessions", overview.sessions, "")}
      ${coachStat("Pending requests", overview.pending_requests, "")}
      ${coachStat("Suspended", overview.suspended, "")}
    </section>
    <div class="coach-actions">
      <button class="coach-action primary" data-action="admin-tab" data-tab="coaches">Review coaches</button>
      <button class="coach-action primary" data-action="admin-tab" data-tab="users">Manage users</button>
      <button class="coach-action primary" data-action="admin-tab" data-tab="announcements">Post announcement</button>
      <button class="coach-action secondary" data-action="admin-tab" data-tab="sessions">Review sessions</button>
    </div>
  `;
}

function adminCoachesPanel() {
  const applications = state.adminCoachApplications || [];
  const pending = applications.filter((application) => application.status === "pending");
  const reviewed = applications.filter((application) => application.status !== "pending");
  return `
    <p class="admin-count">${pending.length} waiting for review</p>
    <div class="admin-list">
      ${pending.length ? pending.map(adminCoachApplicationCard).join("") : adminEmpty("No applications waiting.", "New coach sign-ups will appear here for review.")}
    </div>
    ${reviewed.length ? `
      <h2 class="admin-subhead">Reviewed in the last 30 days</h2>
      <div class="admin-list">${reviewed.map(adminCoachApplicationCard).join("")}</div>
    ` : ""}
  `;
}

function adminCoachApplicationCard(application) {
  const name = escapeHtml(application.full_name || application.email?.split("@")[0] || "Unnamed account");
  const label = escapeHtml(application.username ? `@${application.username}` : application.email || "this applicant");
  const specialties = (application.specialty || "").split(",").map((item) => item.trim()).filter(Boolean);
  const statusPill = {
    pending: `<span class="pill warn">Pending</span>`,
    approved: `<span class="pill">Approved</span>`,
    rejected: `<span class="pill gray">Not approved</span>`,
    revoked: `<span class="pill gray">Revoked</span>`,
  }[application.status] || "";
  return `
    <article class="coach-request-card admin-card">
      <div class="admin-card-head">
        <div>
          <strong>${name}</strong>
          <span><bdi dir="ltr">${[application.username ? `@${escapeHtml(application.username)}` : "", escapeHtml(application.email || "")].filter(Boolean).join(" · ")}</bdi></span>
        </div>
        <div class="admin-pills">${statusPill}</div>
      </div>
      ${specialties.length ? `<div class="admin-pills admin-specialties">${specialties.map((item) => `<span class="pill gray">${escapeHtml(item)}</span>`).join("")}</div>` : `<p class="admin-meta">No specialty given</p>`}
      ${application.bio ? `<p class="admin-body">${escapeHtml(application.bio)}</p>` : ""}
      <p class="admin-meta">${[application.city ? escapeHtml(application.city) : "", `Applied ${adminDate(application.created_at)}`].filter(Boolean).join(" · ")}</p>
      ${application.status === "pending" ? `
        <div class="admin-card-actions">
          <button class="coach-mini-action" data-action="admin-confirm" data-kind="approve-coach" data-id="${application.user_id}" data-label="${label}">Approve</button>
          <button class="coach-mini-action secondary" data-action="admin-confirm" data-kind="reject-coach" data-id="${application.user_id}" data-label="${label}">Turn down</button>
        </div>
      ` : `
        <p class="admin-meta">${adminDate(application.reviewed_at)} · By <bdi>${escapeHtml(application.reviewer_label || "Unknown")}</bdi></p>
        ${application.review_note ? `<p class="admin-meta">Note: ${escapeHtml(application.review_note)}</p>` : ""}
      `}
    </article>
  `;
}

const DIRECTORY_LATIN_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const directoryCollator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

function adminUserName(user) {
  return user.full_name || user.email?.split("@")[0] || "Unnamed account";
}

// Phone-book letter for a name: A-Z ignoring accents, the Arabic letter it
// starts with (all alef forms filed under ا), or # for anything else.
function directoryLetter(name) {
  const first = String(name).trim().charAt(0);
  const latin = first.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  if (/^[A-Z]$/.test(latin)) return latin;
  if (/^[ء-ي]$/.test(first)) return first.replace(/[أإآٱ]/, "ا");
  return "#";
}

function adminUsersPanel() {
  const users = state.adminUsers || [];
  const sort = state.adminUserSort || "az";
  const empty = adminEmpty("No accounts found.", state.adminSearch ? "Try a different search." : "New sign-ups will appear here.");
  return `
    <form class="admin-search" data-form="admin-user-search" role="search">
      <input class="input" name="search" type="search" value="${escapeHtml(state.adminSearch || "")}" placeholder="Search name, username or email" aria-label="Search accounts" />
      <button class="coach-mini-action" type="submit">Search</button>
    </form>
    <div class="admin-results-bar">
      <p class="admin-count">${users.length} account${users.length === 1 ? "" : "s"}</p>
      <div class="admin-chips" role="group" aria-label="Sort accounts">
        ${[["az", "A–Z"], ["newest", "Newest"]].map(([id, label]) => `
          <button type="button" class="${sort === id ? "active" : ""}" aria-pressed="${sort === id}" data-action="admin-user-sort" data-sort="${id}">${label}</button>
        `).join("")}
      </div>
    </div>
    ${!users.length ? empty : sort === "newest"
      ? `<div class="admin-list">${users.map(adminUserCard).join("")}</div>`
      : adminUserDirectory(users)}
  `;
}

function adminUserDirectory(users) {
  const groups = new Map();
  [...users]
    .sort((a, b) => directoryCollator.compare(adminUserName(a), adminUserName(b)))
    .forEach((user) => {
      const letter = directoryLetter(adminUserName(user));
      groups.set(letter, [...(groups.get(letter) || []), user]);
    });
  const arabicLetters = [...groups.keys()].filter((letter) => !DIRECTORY_LATIN_LETTERS.includes(letter) && letter !== "#").sort(directoryCollator.compare);
  const order = [...DIRECTORY_LATIN_LETTERS.filter((letter) => groups.has(letter)), ...arabicLetters, ...(groups.has("#") ? ["#"] : [])];
  const groupId = (letter) => `admin-letter-${order.indexOf(letter)}`;
  // Like a phone book, the rail always shows A-Z, with letters nobody's name starts with dimmed.
  const railLetters = [...DIRECTORY_LATIN_LETTERS, ...arabicLetters, ...(groups.has("#") ? ["#"] : [])];
  return `
    <div class="admin-directory">
      <div class="admin-list">
        ${order.map((letter) => `
          <section class="admin-letter-group" id="${groupId(letter)}" aria-label="${letter}">
            <h3 class="admin-letter-heading">${letter}</h3>
            ${groups.get(letter).map(adminUserCard).join("")}
          </section>
        `).join("")}
      </div>
      <nav class="admin-letter-rail" aria-label="Jump to letter" data-letter-rail>
        ${railLetters.map((letter) => groups.has(letter)
          ? `<button type="button" data-letter-target="${groupId(letter)}" aria-label="${letter}">${letter}</button>`
          : `<span aria-hidden="true">${letter}</span>`).join("")}
        <div class="admin-letter-bubble" aria-hidden="true"></div>
      </nav>
    </div>
  `;
}

function adminUserCard(user) {
  const isSelf = user.id === state.user?.id;
  const name = escapeHtml(adminUserName(user));
  const label = escapeHtml(user.username ? `@${user.username}` : user.email || "this account");
  const isCoach = user.role === "coach";
  const pills = [
    `<span class="pill">${isCoach ? "Coach" : "User"}</span>`,
    user.is_admin ? `<span class="pill admin-pill">Admin</span>` : "",
    user.is_suspended ? `<span class="pill warn">Suspended</span>` : "",
    user.email_confirmed ? "" : `<span class="pill gray">Unverified</span>`,
    user.has_profile ? "" : `<span class="pill gray">No profile yet</span>`,
    user.coach_status === "pending" ? `<span class="pill warn">Coach applicant</span>` : "",
  ].join("");
  const actions = user.has_profile ? `
    <div class="admin-card-actions">
      <button class="coach-mini-action secondary" data-action="admin-set-role" data-id="${user.id}" data-role="${isCoach ? "member" : "coach"}">${isCoach ? "Make user" : "Make coach"}</button>
      ${isSelf ? "" : user.is_suspended
        ? `<button class="coach-mini-action" data-action="admin-confirm" data-kind="unsuspend" data-id="${user.id}" data-label="${label}">Restore</button>`
        : `<button class="coach-mini-action danger" data-action="admin-confirm" data-kind="suspend" data-id="${user.id}" data-label="${label}">Suspend</button>`}
      ${isSelf || user.is_suspended ? "" : user.is_admin
        ? `<button class="coach-mini-action secondary" data-action="admin-confirm" data-kind="revoke-admin" data-id="${user.id}" data-label="${label}">Remove admin</button>`
        : `<button class="coach-mini-action secondary" data-action="admin-confirm" data-kind="grant-admin" data-id="${user.id}" data-label="${label}">Make admin</button>`}
    </div>
  ` : "";
  return `
    <article class="coach-request-card admin-card">
      <div class="admin-card-head">
        <div>
          <strong>${name}${isSelf ? ` <small>(you)</small>` : ""}</strong>
          <span><bdi dir="ltr">${[user.username ? `@${escapeHtml(user.username)}` : "", escapeHtml(user.email || "")].filter(Boolean).join(" · ")}</bdi></span>
        </div>
        <div class="admin-pills">${pills}</div>
      </div>
      <p class="admin-meta">Joined ${adminDate(user.created_at)} · ${user.last_sign_in_at ? `Last active ${adminDate(user.last_sign_in_at)}` : "Never signed in"}</p>
      ${user.is_suspended && user.suspended_reason ? `<p class="admin-meta">Reason: ${escapeHtml(user.suspended_reason)}</p>` : ""}
      ${actions}
    </article>
  `;
}

const ADMIN_SESSION_PAGE_SIZE = 30;
const ADMIN_SESSION_DEFAULT_FILTERS = { query: "", status: "all", type: "all", level: "all", sort: "soonest" };
const ADMIN_SESSION_STATUSES = [
  ["all", "All"],
  ["upcoming", "Upcoming"],
  ["today", "Today"],
  ["review", "Needs review"],
  ["full", "Full"],
  ["past", "Past"],
];
const ADMIN_SESSION_SORTS = [
  ["soonest", "Soonest first"],
  ["latest", "Latest date first"],
  ["newest", "Newest created"],
  ["pending", "Most pending requests"],
  ["admitted", "Most admitted"],
];

function localDateValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// Flattens an admin_list_sessions row into what the filters, sorts and cards need.
function adminSessionInfo(row) {
  const session = row.data || {};
  const members = Array.isArray(session.members) ? session.members.length : 0;
  // Admitting someone both adds them to members and approves their request, so the larger count is the real one.
  const admitted = Math.max(members, Number(row.approved_requests || 0));
  const capacity = Number(session.capacity) || 0;
  const startsAt = session.date ? new Date(`${session.date}T${session.time || "23:59"}`).getTime() : NaN;
  return {
    row,
    session,
    admitted,
    capacity,
    pending: Number(row.pending_requests || 0),
    startsAt: Number.isNaN(startsAt) ? null : startsAt,
    isPast: !Number.isNaN(startsAt) && startsAt < Date.now(),
    isToday: session.date === localDateValue(),
    isFull: capacity > 0 && admitted >= capacity,
  };
}

function adminSessionMatchesStatus(info, status) {
  if (status === "upcoming") return !info.isPast;
  if (status === "today") return info.isToday;
  if (status === "review") return info.pending > 0;
  if (status === "full") return info.isFull && !info.isPast;
  if (status === "past") return info.isPast;
  return true;
}

function adminSessionSortValue(info, sort) {
  // Sessions without a date go last whichever way the dates are sorted.
  if (sort === "soonest") return [info.isPast ? 1 : 0, info.isPast ? -(info.startsAt ?? 0) : info.startsAt ?? Infinity];
  if (sort === "latest") return [0, -(info.startsAt ?? -Infinity)];
  if (sort === "newest") return [0, -new Date(info.row.created_at).getTime()];
  if (sort === "pending") return [-info.pending, info.startsAt ?? Infinity];
  if (sort === "admitted") return [-info.admitted, info.startsAt ?? Infinity];
  return [0, 0];
}

function filteredAdminSessions() {
  const filters = { ...ADMIN_SESSION_DEFAULT_FILTERS, ...state.adminSessionFilters };
  const query = filters.query.trim().toLowerCase();
  const all = (state.adminSessions || []).map(adminSessionInfo);
  const searched = all.filter((info) => {
    if (filters.type !== "all" && info.session.type !== filters.type) return false;
    if (filters.level !== "all" && info.session.level !== filters.level) return false;
    if (!query) return true;
    return [info.session.title, info.row.host_label, info.session.hostName, info.session.location]
      .some((value) => String(value || "").toLowerCase().includes(query));
  });
  const statusCounts = Object.fromEntries(ADMIN_SESSION_STATUSES.map(([id]) => [id, searched.filter((info) => adminSessionMatchesStatus(info, id)).length]));
  const shown = searched
    .filter((info) => adminSessionMatchesStatus(info, filters.status))
    .sort((a, b) => {
      const [a1, a2] = adminSessionSortValue(a, filters.sort);
      const [b1, b2] = adminSessionSortValue(b, filters.sort);
      return a1 - b1 || a2 - b2;
    });
  return { filters, all, shown, statusCounts };
}

function adminSessionsPanel() {
  const { filters, all, shown, statusCounts } = filteredAdminSessions();
  if (!all.length) return adminEmpty("No sessions yet.", "Sessions coaches create will appear here.");
  const limit = state.adminSessionLimit || ADMIN_SESSION_PAGE_SIZE;
  const selected = new Set(state.adminSelectedSessions || []);
  const shownIds = shown.map((info) => info.row.id);
  const allShownSelected = shownIds.length > 0 && shownIds.every((id) => selected.has(id));
  const filtersActive = JSON.stringify(filters) !== JSON.stringify(ADMIN_SESSION_DEFAULT_FILTERS);
  const option = (value, label, current) => `<option value="${value}" ${value === current ? "selected" : ""}>${label}</option>`;
  return `
    <div class="admin-session-toolbar">
      <input class="input" type="search" data-admin-session-search value="${escapeHtml(filters.query)}" placeholder="Search title, host or location" aria-label="Search sessions" />
      <div class="admin-chips" role="group" aria-label="Session status">
        ${ADMIN_SESSION_STATUSES.map(([id, label]) => `
          <button type="button" class="${filters.status === id ? "active" : ""}" aria-pressed="${filters.status === id}" data-action="admin-session-filter" data-key="status" data-value="${id}">
            ${label} <span>${statusCounts[id]}</span>
          </button>
        `).join("")}
      </div>
      <div class="admin-selects">
        <select class="select" data-admin-session-filter="type" aria-label="Activity type">
          ${option("all", "All activities", filters.type)}
          ${["Running", "Hiking", "Cycling"].map((type) => option(type, type, filters.type)).join("")}
        </select>
        <select class="select" data-admin-session-filter="level" aria-label="Level">
          ${option("all", "All levels", filters.level)}
          ${["Beginner", "Intermediate", "Advanced"].map((level) => option(level, level, filters.level)).join("")}
        </select>
        <select class="select" data-admin-session-filter="sort" aria-label="Sort sessions">
          ${ADMIN_SESSION_SORTS.map(([id, label]) => option(id, label, filters.sort)).join("")}
        </select>
      </div>
    </div>
    <div class="admin-results-bar">
      <p class="admin-count">Showing ${shown.length} of ${all.length} sessions</p>
      <div>
        ${filtersActive ? `<button type="button" class="member-view-all" data-action="admin-session-clear-filters">Clear filters</button>` : ""}
        ${shown.length ? `<button type="button" class="member-view-all" data-action="admin-session-select-all">${allShownSelected ? "Unselect all" : "Select all"}</button>` : ""}
      </div>
    </div>
    ${selected.size ? `
      <div class="admin-bulk-bar" role="region" aria-label="Selected sessions">
        <strong>${selected.size} selected</strong>
        <button type="button" class="coach-mini-action secondary" data-action="admin-session-clear-selection">Clear</button>
        <button type="button" class="coach-mini-action danger" data-action="admin-confirm" data-kind="delete-sessions" data-id="selected" data-label="${selected.size} sessions">Delete selected</button>
      </div>
    ` : ""}
    <div class="admin-list admin-session-grid">
      ${shown.length
        ? shown.slice(0, limit).map((info) => adminSessionCard(info, selected.has(info.row.id))).join("")
        : adminEmpty("No sessions match.", "Try a different search or clear the filters.")}
    </div>
    ${shown.length > limit ? `<button type="button" class="btn btn-ghost admin-show-more" data-action="admin-session-more">Show more (${shown.length - limit} left)</button>` : ""}
  `;
}

function adminSessionCard(info, isSelected) {
  const { row, session } = info;
  const title = escapeHtml(session.title || row.id);
  const when = info.startsAt ? adminDateTime(info.startsAt) : [session.date, session.time].filter(Boolean).join(" ") || "No date set";
  const details = [session.type, session.level, when].filter(Boolean).map(escapeHtml).join(" · ");
  const host = row.host_label || session.hostName || "Unknown";
  const pills = [
    info.isPast ? `<span class="pill gray">Past</span>` : "",
    info.isToday && !info.isPast ? `<span class="pill">Today</span>` : "",
    info.isFull && !info.isPast ? `<span class="pill gray">Full</span>` : "",
    info.pending ? `<span class="pill warn">${info.pending} pending</span>` : "",
  ].join("");
  return `
    <article class="coach-request-card admin-card ${isSelected ? "selected" : ""} ${info.isPast ? "is-past" : ""}">
      <div class="admin-card-head">
        <label class="admin-select-session">
          <input type="checkbox" data-admin-session-select value="${escapeHtml(row.id)}" ${isSelected ? "checked" : ""} aria-label="Select ${title}" />
          <div>
            <strong><bdi>${title}</bdi></strong>
            <span>${details}</span>
          </div>
        </label>
        ${pills ? `<div class="admin-pills">${pills}</div>` : ""}
      </div>
      ${session.location ? `<p class="admin-meta">📍 <bdi>${escapeHtml(session.location)}</bdi></p>` : ""}
      <p class="admin-meta">${info.capacity ? `${info.admitted}/${info.capacity} admitted` : `${info.admitted} admitted`} · Created ${adminDate(row.created_at)} · Host: <button type="button" class="admin-host-link" data-action="admin-session-filter" data-key="query" data-value="${escapeHtml(host)}" title="Show this host's sessions"><bdi>${escapeHtml(host)}</bdi></button></p>
      <div class="admin-card-actions">
        <button class="coach-mini-action danger" data-action="admin-confirm" data-kind="delete-session" data-id="${escapeHtml(row.id)}" data-label="${title}">Delete session</button>
      </div>
    </article>
  `;
}

function adminAnnouncementsPanel() {
  const announcements = state.adminAnnouncements || [];
  return `
    <form class="coach-request-card admin-announcement-form" data-form="admin-announcement">
      <h2>New announcement</h2>
      <p class="admin-meta">Shown to every signed-in user under Events and on their home screen.</p>
      <label class="field"><span>Title</span><input class="input" name="title" maxlength="80" required /></label>
      <label class="field"><span>Message</span><textarea class="textarea" name="body" maxlength="1000" required></textarea></label>
      <button class="btn btn-primary" type="submit">Post to everyone</button>
    </form>
    <div class="admin-list">
      ${announcements.length ? announcements.map((announcement) => `
        <article class="coach-request-card admin-card">
          <div class="admin-card-head">
            <div>
              <strong>${escapeHtml(announcement.title)}</strong>
              <span>${adminDateTime(announcement.created_at)}</span>
            </div>
          </div>
          <p class="admin-body">${escapeHtml(announcement.body)}</p>
          <div class="admin-card-actions">
            <button class="coach-mini-action danger" data-action="admin-confirm" data-kind="delete-announcement" data-id="${announcement.id}" data-label="${escapeHtml(announcement.title)}">Delete</button>
          </div>
        </article>
      `).join("") : adminEmpty("No announcements yet.", "Posted announcements will appear here.")}
    </div>
  `;
}

function adminLogPanel() {
  const entries = state.adminLog || [];
  return `
    <div class="admin-list">
      ${entries.length ? entries.map((entry) => {
        const details = entry.details || {};
        const extra = [
          details.from && details.to ? `${details.from} → ${details.to}` : "",
          details.reason ? `Reason: ${details.reason}` : "",
        ].filter(Boolean).map(escapeHtml).join(" · ");
        return `
          <article class="coach-request-card admin-card admin-log-entry">
            <strong>${ADMIN_LOG_LABELS[entry.action] || escapeHtml(entry.action)}</strong>
            <span><bdi>${escapeHtml(entry.target_label || "")}</bdi></span>
            ${extra ? `<p class="admin-meta">${extra}</p>` : ""}
            <p class="admin-meta">${adminDateTime(entry.created_at)} · By <bdi>${escapeHtml(entry.admin_label || "Unknown")}</bdi></p>
          </article>
        `;
      }).join("") : adminEmpty("No admin activity yet.", "Every admin action is recorded here.")}
    </div>
  `;
}

function adminConfirmModal() {
  const confirm = state.adminConfirm;
  if (!confirm) return "";
  // dataset un-escapes attribute values, and labels can be other users' session or account names.
  const label = escapeHtml(confirm.label || "this item");
  const copy = {
    suspend: ["Suspend account?", `${label} will be signed out and blocked from signing in until an admin restores the account.`, "Suspend", true],
    unsuspend: ["Restore account?", `${label} will be able to sign in and use Intaliq again.`, "Restore", false],
    "grant-admin": ["Make admin?", `${label} will be able to manage every account, session and announcement.`, "Make admin", false],
    "revoke-admin": ["Remove admin access?", `${label} will go back to a regular account.`, "Remove admin", true],
    "delete-session": ["Delete session?", `${label} and all of its join requests will be removed for everyone.`, "Delete", true],
    "delete-sessions": ["Delete sessions?", `${label} and all of their join requests will be removed for everyone.`, "Delete all", true],
    "delete-announcement": ["Delete announcement?", `${label} will be removed for every user.`, "Delete", true],
    "approve-coach": ["Approve coach?", `${label} will be able to create sessions and admit members.`, "Approve", false],
    "reject-coach": ["Turn down application?", `${label} will stay a member and can apply again later.`, "Turn down", true],
  }[confirm.kind];
  if (!copy) return "";
  const [title, body, confirmLabel, destructive] = copy;
  const reasonLabel = {
    suspend: "Reason (optional, saved in the activity log)",
    "delete-session": "Reason (optional, saved in the activity log)",
    "delete-sessions": "Reason (optional, saved in the activity log)",
    "reject-coach": "Note to the applicant (optional, they'll see it)",
  }[confirm.kind];
  return `
    <div class="confirm-overlay" role="dialog" aria-modal="true" aria-labelledby="admin-confirm-title">
      <form class="confirm-dialog" data-form="admin-confirm">
        <h2 id="admin-confirm-title">${title}</h2>
        <p>${body}</p>
        ${reasonLabel ? `<label class="field"><span>${reasonLabel}</span><textarea class="textarea" name="reason" maxlength="300"></textarea></label>` : ""}
        <input type="hidden" name="kind" value="${escapeHtml(confirm.kind)}" />
        <input type="hidden" name="id" value="${escapeHtml(confirm.id)}" />
        <div class="confirm-actions">
          <button class="btn btn-ghost" type="button" data-action="cancel-admin-confirm">Cancel</button>
          <button class="btn ${destructive ? "btn-danger" : "btn-primary"}" type="submit">${confirmLabel}</button>
        </div>
      </form>
    </div>
  `;
}

function adminErrorMessage(error) {
  // Missing function or table: admin.sql hasn't been run yet.
  if (["PGRST202", "PGRST205", "42883", "42P01"].includes(error?.code)) return ADMIN_SETUP_ERROR;
  return error?.message || "Something went wrong. Please try again.";
}

const ADMIN_LOADERS = {
  overview: async () => {
    const { data, error } = await supabase.rpc("admin_overview");
    return { error, patch: { adminOverview: data } };
  },
  users: async () => {
    const { data, error } = await supabase.rpc("admin_list_users", { p_search: state.adminSearch || null });
    return { error, patch: { adminUsers: data || [] } };
  },
  sessions: async () => {
    const { data, error } = await supabase.rpc("admin_list_sessions");
    const ids = new Set((data || []).map((row) => row.id));
    return { error, patch: { adminSessions: data || [], adminSelectedSessions: state.adminSelectedSessions.filter((id) => ids.has(id)) } };
  },
  announcements: async () => {
    const { data, error } = await supabase
      .from("app_announcements")
      .select("id, title, body, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    // Keep the admin's own Events and home screens in step with what they just posted.
    return { error, patch: { adminAnnouncements: data || [], platformAnnouncements: (data || []).slice(0, 20) } };
  },
  coaches: async () => {
    const { data, error } = await supabase.rpc("admin_list_coach_applications");
    return { error, patch: { adminCoachApplications: data || [] } };
  },
  log: async () => {
    const { data, error } = await supabase.rpc("admin_list_audit_log", { p_limit: 100 });
    return { error, patch: { adminLog: data || [] } };
  },
};

async function openAdmin(tab = "overview") {
  const adminTab = ADMIN_LOADERS[tab] ? tab : "overview";
  setState({ route: "admin", adminTab, adminLoading: true, adminError: "", adminConfirm: null, authError: "", authMessage: "" });
  await loadAdminTab(adminTab);
}

async function loadAdminTab(tab) {
  if (!supabase || !state.user) {
    setState({ adminLoading: false, adminError: "Sign in first so Intaliq can load admin tools." });
    return;
  }
  const { error, patch } = await ADMIN_LOADERS[tab]();
  // Ignore results for a tab the admin has already left.
  if (state.route !== "admin" || state.adminTab !== tab) return;
  setState({ ...(error ? {} : patch), adminLoading: false, adminError: error ? adminErrorMessage(error) : "" });
}

async function runAdminAction(rpcName, params, successMessage) {
  if (!supabase || !state.user) return false;
  setState({ adminLoading: true, adminConfirm: null, adminError: "", authMessage: "" });
  const { error } = await supabase.rpc(rpcName, params);
  if (error) {
    setState({ adminLoading: false, adminError: adminErrorMessage(error) });
    return false;
  }
  state.authMessage = successMessage;
  await loadAdminTab(state.adminTab);
  return true;
}

function forgetDeletedSessions(ids) {
  const deleted = new Set(ids);
  state.sessions = state.sessions.filter((session) => !deleted.has(session.id));
  state.joinedSessions = state.joinedSessions.filter((sessionId) => !deleted.has(sessionId));
  state.adminSelectedSessions = state.adminSelectedSessions.filter((sessionId) => !deleted.has(sessionId));
  saveState();
}

// One call per session, so each deletion gets its own activity log entry and
// one failure doesn't stop the rest.
async function deleteSelectedSessions(note) {
  const ids = [...state.adminSelectedSessions];
  if (!supabase || !ids.length) return;
  setState({ adminLoading: true, adminConfirm: null, adminError: "", authMessage: "" });
  const failures = [];
  const deleted = [];
  for (const id of ids) {
    const { error } = await supabase.rpc("admin_delete_session", { p_session: id, p_reason: note });
    if (error) failures.push(adminErrorMessage(error));
    else deleted.push(id);
  }
  forgetDeletedSessions(deleted);
  state.authMessage = deleted.length ? `Deleted ${deleted.length} session${deleted.length === 1 ? "" : "s"}.` : "";
  state.adminError = failures.length ? `${failures.length} couldn't be deleted: ${failures[0]}` : "";
  const { error, patch } = await ADMIN_LOADERS.sessions();
  setState({ ...(error ? {} : patch), adminLoading: false, adminError: state.adminError || (error ? adminErrorMessage(error) : "") });
}

async function confirmAdminAction({ kind, id, reason = "" }) {
  const note = reason.trim() || null;
  const actions = {
    suspend: () => runAdminAction("admin_set_suspended", { p_user: id, p_suspended: true, p_reason: note }, "Account suspended."),
    unsuspend: () => runAdminAction("admin_set_suspended", { p_user: id, p_suspended: false, p_reason: null }, "Account restored."),
    "grant-admin": () => runAdminAction("admin_set_admin", { p_user: id, p_is_admin: true }, "Admin access granted."),
    "revoke-admin": () => runAdminAction("admin_set_admin", { p_user: id, p_is_admin: false }, "Admin access removed."),
    "delete-session": async () => {
      const deleted = await runAdminAction("admin_delete_session", { p_session: id, p_reason: note }, "Session deleted.");
      if (deleted) forgetDeletedSessions([id]);
    },
    "delete-sessions": () => deleteSelectedSessions(note),
    "delete-announcement": () => runAdminAction("admin_delete_announcement", { p_announcement: id }, "Announcement deleted."),
    "approve-coach": () => runAdminAction("admin_review_coach", { p_user: id, p_approve: true, p_note: null }, "Coach approved."),
    "reject-coach": () => runAdminAction("admin_review_coach", { p_user: id, p_approve: false, p_note: note }, "Application turned down."),
  };
  await actions[kind]?.();
}

function page(title, subtitle, body) {
  return `
    <div class="page-screen">
      <div class="page-card">
        <div class="topbar">
          <button class="btn-link" data-action="back">Back</button>
        </div>
        <div class="stack">
          <div>
            <h1 class="page-title">${title}</h1>
            <p class="subtle">${subtitle}</p>
          </div>
          ${body}
        </div>
      </div>
    </div>
  `;
}

function withTabs(active, body) {
  const isCoach = state.profile.role === "coach";
  return `
    <div class="view-with-tabs ${isCoach ? "coach-tabs-shell" : "member-tabs-shell"}">
      <div class="tab-content">${body}</div>
      <nav class="tabs" aria-label="Primary">
        ${isCoach
          ? `
            ${tab("home", navIcon("home"), "Home", active)}
            ${tab("events", "!", "Events", active)}
            ${tab("sessions", navIcon("sessions"), "Sessions", active)}
            ${tab("goals", navIcon("activities"), "Admissions", active)}
            ${tab("partners", navIcon("announce"), "Announce", active)}
            ${tab("profile", navIcon("more"), "More", active)}
          `
          : `
            ${tab("home", navIcon("home"), "Home", active)}
            ${tab("events", "!", "Events", active)}
            ${tab("activities", navIcon("activities"), "Activities", active)}
            ${tab("sessions", navIcon("sessions"), "Sessions", active)}
            ${tab("goals", navIcon("goals"), "Goals", active)}
            ${tab("profile", navIcon("more"), "More", active)}
          `}
      </nav>
    </div>
  `;
}

function navIcon(name) {
  const icons = {
    home: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 23.5 24 7l18 16.5c1.3 1.2.5 3.5-1.3 3.5H37v12a3 3 0 0 1-3 3h-7.5V29h-5v13H14a3 3 0 0 1-3-3V27H7.3c-1.8 0-2.6-2.3-1.3-3.5z" fill="currentColor"/></svg>`,
    activities: `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="28" cy="7" r="4" fill="currentColor"/><path d="M24 14l-7 6 5 4 5-4 4 8 7 3 2-4-6-3-5-10zM21 27l-4 9-8 5 3 4 9-6 5-10zM29 31l7 5 2 8 5-1-3-10-9-7z" fill="currentColor"/><path d="M15 35l8 8 18-21" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    sessions: `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="12" r="6" fill="currentColor"/><circle cx="10" cy="16" r="5" fill="currentColor"/><circle cx="38" cy="16" r="5" fill="currentColor"/><path d="M13 34c0-8 5-13 11-13s11 5 11 13v3H13zM2 35c0-7 4-12 9-12 3 0 5 1 7 3-3 3-5 7-5 12H2zM35 38c0-5-2-9-5-12 2-2 4-3 7-3 5 0 9 5 9 12v3z" fill="currentColor"/></svg>`,
    goals: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M39 23a15 15 0 1 1-10-13M33 7A20 20 0 1 0 44 18" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><circle cx="24" cy="24" r="9" fill="none" stroke="currentColor" stroke-width="4"/><circle cx="24" cy="24" r="3" fill="currentColor"/><path d="M24 24 41 7M36 6h6v6" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    announce: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M7 29h8l19 10V9L15 19H7z" fill="currentColor"/><path d="M37 18c3 2 3 10 0 12M42 14c5 5 5 15 0 20" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/><path d="M15 29l3 12h7l-5-13z" fill="currentColor"/></svg>`,
    more: `<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="12" cy="24" r="6" fill="currentColor"/><circle cx="24" cy="24" r="6" fill="currentColor"/><circle cx="36" cy="24" r="6" fill="currentColor"/></svg>`,
  };
  return icons[name] || "";
}

function tab(route, icon, label, active) {
  return `<button class="tab ${active === route ? "active" : ""}" data-route="${route}"><strong>${icon}</strong><span>${label}</span></button>`;
}

function goalFields(goal) {
  return `
    <label class="field"><span>${state.profile.role === "coach" ? "Plan title" : "Goal title"}</span><input class="input" name="title" value="${goal.title}" maxlength="60" required /></label>
    <div class="grid-2">
      <label class="field"><span>Category</span><select class="select" name="category">${["Strength", "Cardio", "Mobility", "Weight loss", "Nutrition", "Recovery"].map((category) => `<option ${category === goal.category ? "selected" : ""}>${category}</option>`).join("")}</select></label>
      <label class="field"><span>Due</span><input class="input" name="due" value="${goal.due}" maxlength="40" required /></label>
    </div>
    <label class="field"><span>Progress</span><input class="input" name="progress" type="number" min="0" max="100" step="1" value="${goal.progress}" /></label>
    ${[0, 1, 2, 3].map((index) => `<label class="field"><span>Checkpoint ${index + 1}</span><input class="input" name="checkpoint${index}" value="${goal.checkpoints[index] || ""}" maxlength="40" /></label>`).join("")}
  `;
}

function goalTypeCard(goal) {
  const type = goal.type || goal.category || "Running";
  return `
    <div class="session-mark">${interestIcon(type)}</div>
  `;
}

function sessionFields() {
  return `
    ${activityTypePicker("Running")}
    <label class="field"><span>Session Title</span><input class="input" name="title" placeholder="e.g., Morning Run Crew" maxlength="60" required /></label>
    <label class="field"><span>Date</span><input class="input" name="date" type="date" min="${todayDateValue()}" max="${dateYearsAhead(1)}" required /></label>
    <label class="field"><span>Time</span><input class="input" name="time" type="time" required /></label>
    <label class="field"><span>Capacity</span><input class="input" name="capacity" type="number" min="2" max="50" placeholder="Maximum participants" required /></label>
    <label class="field"><span>Location</span><input class="input" name="location" placeholder="e.g., King Abdullah Park, Riyadh" maxlength="100" required /></label>
    <label class="field"><span>Intensity Level</span><select class="select" name="level"><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label>
    <label class="field"><span>Description</span><input class="input" name="notes" placeholder="e.g., any requirements, or expectations" maxlength="300" /></label>
    <label class="field accessibility-field">
      <span>Accessibility</span>
      <select class="select accessibility-select" name="accessibility">
        <option value="None">None</option>
        <option value="Wheelchair-Friendly">♿ Wheelchair-Friendly</option>
        <option value="Elderly-Friendly">Elderly-Friendly</option>
      </select>
    </label>
    <input type="hidden" name="admission" value="Approval required" />
  `;
}

function dateYearsAhead(years) {
  const now = new Date();
  const later = new Date(now.getFullYear() + years, now.getMonth(), now.getDate());
  return `${later.getFullYear()}-${String(later.getMonth() + 1).padStart(2, "0")}-${String(later.getDate()).padStart(2, "0")}`;
}

// Now, in the yyyy-mm-ddThh:mm form a datetime-local input expects.
function localDateTimeValue() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

function todayDateValue() {
  const now = new Date();
  const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 10);
}

function validateSessionSchedule(data) {
  const today = todayDateValue();
  if (!data.date || data.date < today) {
    return "Choose today or a future date for the session.";
  }

  if (data.date === today && data.time) {
    const selectedTime = new Date(`${data.date}T${data.time}`);
    if (selectedTime < new Date()) {
      return "Choose a future time for today's session.";
    }
  }

  return "";
}

function goalCard(goal, compact = false) {
  if (state.profile.role !== "coach") {
    const progress = goalProgress(goal);
    return `
      <article class="member-goal-card goal-list-card" data-action="goal-detail" data-id="${goal.id}">
        <div class="member-goal-head">
          ${goalTypeCard(goal)}
          <div>
            <h3>${goal.title}</h3>
            <p>${activityLabel(goal.type || goal.category)} · Due: ${goal.due}</p>
          </div>
          <span>${progress}%</span>
        </div>
        <p>${formatDistance(goal.coveredDistance || 0)} of ${formatDistance(goal.targetDistance || 0)} km covered</p>
        <div class="member-progress" style="--value: ${progress}%"><span></span></div>
      </article>
    `;
  }

  return `
    <article class="goal-card">
      <div class="goal-head">
        <div>
          <h3>${goal.title}</h3>
          <div class="subtle">${goal.category} · ${goal.due}</div>
        </div>
        <span class="pill">${goal.progress}%</span>
      </div>
      <div class="progress" style="--value: ${goal.progress}%"><span></span></div>
      <div class="checkpoints">
        ${goal.checkpoints.map((checkpoint, index) => `<div class="checkpoint ${index < goal.completed ? "done" : ""}" title="${checkpoint}">F</div>`).join("")}
      </div>
      ${compact ? "" : `<button class="btn btn-ghost" data-action="advance-goal" data-id="${goal.id}">Update checkpoint</button>`}
    </article>
  `;
}

function sessionCard(session) {
  const joined = sessionConfirmedForUser(session);
  const requestPending = sessionRequestPending(session);
  const pending = session.pendingApplicants?.length || 0;
  const accessibility = session.accessibility && session.accessibility !== "None" ? session.accessibility : "";
  const members = enrolledMembers(session);
  return `
    <article class="session-card">
      <div class="session-head">
        <div>
          <h3>${session.title}</h3>
          <div class="subtle">${session.date} · ${session.time}</div>
        </div>
        <span class="pill ${joined ? "" : "warn"}">${joined ? "Joined" : session.type}</span>
      </div>
      <div class="subtle">${members.length}/${session.capacity} people · ${session.level || "All levels"} · ${session.admission || "Open"}</div>
      ${state.profile.role === "coach"
        ? accessibility ? `<div class="accessibility-badge">${accessibility === "Wheelchair-Friendly" ? "♿ " : ""}${accessibility}</div>` : ""
        : `<div class="accessibility-row"><span>Accessibility</span><strong>${accessibility ? `${accessibility === "Wheelchair-Friendly" ? "♿ " : ""}${accessibility}` : "None"}</strong></div>`}
      ${state.profile.role === "coach" && pending ? `<div class="notice">${pending} admission request${pending === 1 ? "" : "s"} waiting</div>` : ""}
      <div class="grid-2">
        <button class="btn btn-ghost" data-action="session-detail" data-id="${session.id}">Details</button>
        ${state.profile.role === "coach" && isOwnSession(session)
          ? `<button class="btn btn-primary" data-action="session-detail" data-id="${session.id}">Manage</button>`
          : joined
          ? `<button class="btn btn-dark" data-action="session-detail" data-id="${session.id}">Open</button>`
          : requestPending
            ? `<button class="btn btn-dark" data-action="session-detail" data-id="${session.id}">Pending</button>`
            : `<button class="btn btn-primary" data-action="request-join-session" data-id="${session.id}">Request Join</button>`}
      </div>
    </article>
  `;
}

function averageProgress() {
  if (!state.goals.length) return 0;
  return Math.round(state.goals.reduce((total, goal) => total + goal.progress, 0) / state.goals.length);
}

function makeGoal(data) {
  if (state.profile.role !== "coach") {
    return {
      id: crypto.randomUUID(),
      title: data.title,
      type: data.type,
      due: data.due,
      targetDistance: Number(data.targetDistance),
      coveredDistance: 0,
      progress: 0,
      checkpoints: [],
      completed: 0,
    };
  }

  return {
    id: crypto.randomUUID(),
    title: data.title,
    category: data.category,
    due: data.due,
    progress: clamp(data.progress),
    checkpoints: [data.checkpoint0, data.checkpoint1, data.checkpoint2, data.checkpoint3].filter(Boolean),
    completed: 0,
  };
}

function makeActivity(data) {
  return {
    id: crypto.randomUUID(),
    type: data.type,
    time: data.time,
    distance: Number(data.distance),
    duration: Number(data.duration),
  };
}

function makeSession(data) {
  // Short code from the title plus random characters, so similar titles don't collide.
  const prefix = data.title.replace(/[^a-z0-9]/gi, "").slice(0, 4).toUpperCase().padEnd(4, "X");
  let id;
  do {
    id = `${prefix}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  } while (state.sessions.some((session) => session.id === id));

  return {
    id,
    title: data.title,
    type: data.type,
    level: data.level || "Beginner",
    admission: data.admission || "Open",
    date: data.date,
    time: data.time,
    capacity: Number(data.capacity),
    location: data.location || "",
    hostId: state.user?.id || "",
    hostName: state.profile.name || "Coach",
    members: [],
    pendingApplicants: [],
    announcements: [],
    notes: data.notes || "Focused workout session.",
    accessibility: data.accessibility || "None",
  };
}

function validationContext() {
  return {
    role: state.profile.role,
    authMode: state.authMode,
    cities: cityOptions(),
    nationalities: nationalityOptions().map((item) => item.value).filter(Boolean),
    ownSessionIds: state.sessions.filter((session) => isOwnSession(session)).map((session) => session.id),
  };
}

// Shows a validation problem at the top of the form without re-rendering,
// so everything the user typed stays put.
function showFormError(form, issue) {
  form.querySelector("[data-form-error]")?.remove();
  form.querySelectorAll("[aria-invalid]").forEach((field) => field.removeAttribute("aria-invalid"));
  if (!issue) return;
  const notice = document.createElement("div");
  notice.className = "notice danger-box";
  notice.dataset.formError = "";
  notice.setAttribute("role", "alert");
  notice.textContent = currentLanguage() === "ar" ? translate(issue.message) : issue.message;
  form.prepend(notice);
  const field = issue.field && form.querySelector(`[name="${issue.field}"]`);
  if (field) {
    field.setAttribute("aria-invalid", "true");
    field.focus({ preventScroll: true });
  }
  notice.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function bindEvents() {
  app.querySelectorAll("[data-route]").forEach((element) => {
    element.addEventListener("click", () => navigate(element.dataset.route));
  });

  watchUsernameField();

  app.querySelectorAll("[data-action]").forEach((element) => {
    element.addEventListener("click", () => handleAction(element.dataset.action, element.dataset));
  });

  app.querySelectorAll("[data-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const type = form.dataset.form;
      const values = await formData(form);
      const issue = validateForm(type, values, validationContext());
      showFormError(form, issue);
      if (!issue) await handleForm(type, values);
    });
  });

  app.querySelectorAll("[data-language-select]").forEach((select) => {
    select.addEventListener("change", () => {
      setLanguage(select.value);
      render();
    });
  });

  app.querySelector("[data-partner-search]")?.addEventListener("input", (event) => {
    setState({ partnerSearch: event.target.value });
  });

  app.querySelector("[data-admin-session-search]")?.addEventListener("input", (event) => {
    if (event.isComposing) return;
    const { value, selectionStart } = event.target;
    updateAdminSessionFilters({ query: value });
    // Rendering replaces the input, so put the cursor back where it was.
    const input = app.querySelector("[data-admin-session-search]");
    input?.focus();
    input?.setSelectionRange(selectionStart, selectionStart);
  });

  app.querySelector("[data-letter-rail]") && bindLetterRail(app.querySelector("[data-letter-rail]"));

  app.querySelectorAll("[data-admin-session-filter]").forEach((select) => {
    select.addEventListener("change", () => updateAdminSessionFilters({ [select.dataset.adminSessionFilter]: select.value }));
  });

  app.querySelectorAll("[data-admin-session-select]").forEach((checkbox) => {
    checkbox.addEventListener("change", () => {
      const selected = new Set(state.adminSelectedSessions);
      if (checkbox.checked) selected.add(checkbox.value);
      else selected.delete(checkbox.value);
      setState({ adminSelectedSessions: [...selected] });
    });
  });
}

// Phone-book index: tap a letter to jump, or drag along the rail to scrub
// through letters with a bubble showing where you are. Touches scroll the
// list directly instead of re-rendering.
function bindLetterRail(rail) {
  const bubble = rail.querySelector(".admin-letter-bubble");
  let scrubbing = false;

  const jumpTo = (button) => {
    if (!button) return;
    document.getElementById(button.dataset.letterTarget)?.scrollIntoView({ block: "start" });
    rail.querySelectorAll(".active").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    bubble.textContent = button.textContent;
  };
  const buttonAt = (event) => document.elementFromPoint(event.clientX, event.clientY)?.closest("[data-letter-target]");

  rail.addEventListener("pointerdown", (event) => {
    scrubbing = true;
    rail.setPointerCapture(event.pointerId);
    rail.classList.add("scrubbing");
    jumpTo(buttonAt(event));
    event.preventDefault();
  });
  rail.addEventListener("pointermove", (event) => {
    if (scrubbing) jumpTo(buttonAt(event));
  });
  const stop = () => {
    scrubbing = false;
    rail.classList.remove("scrubbing");
  };
  rail.addEventListener("pointerup", stop);
  rail.addEventListener("pointercancel", stop);
  // Keyboard users tab to a letter and press Enter.
  rail.addEventListener("click", (event) => {
    if (event.detail === 0) jumpTo(event.target.closest("[data-letter-target]"));
  });
}

// Changing what's shown starts paging over and drops the selection, so bulk
// actions only ever apply to sessions the admin can see.
function updateAdminSessionFilters(patch) {
  setState({
    adminSessionFilters: { ...ADMIN_SESSION_DEFAULT_FILTERS, ...state.adminSessionFilters, ...patch },
    adminSessionLimit: ADMIN_SESSION_PAGE_SIZE,
    adminSelectedSessions: [],
  });
}

function handleAction(action, data = {}) {
  const actions = {
    "auth-signin": () => setState({ authMode: "signin", authLoading: false, authError: "", authMessage: "" }),
    "auth-signup": () => setState({ authMode: "signup", authLoading: false, authError: "", authMessage: "" }),
    "role-member": () => setState({ profile: { ...state.profile, role: "member" }, authLoading: false, authError: "", authMessage: "" }),
    "role-coach": () => setState({ profile: { ...state.profile, role: "coach" }, authLoading: false, authError: "", authMessage: "" }),
    "back-to-login": () => setState({ route: "signin", authMode: "signin", authLoading: false, authError: "", authMessage: "" }),
    "toggle-theme": () => toggleTheme(),
    "go-landing": () => setState({ route: "landing", authLoading: false, authError: "", authMessage: "" }),
    "landing-signin": () => setState({ route: "signin", authMode: "signin", authLoading: false, authError: "", authMessage: "" }),
    "landing-signup": () => setState({ route: "signin", authMode: "signup", profile: { ...state.profile, role: "member" }, authLoading: false, authError: "", authMessage: "" }),
    "landing-coach": () => setState({ route: "signin", authMode: "signup", profile: { ...state.profile, role: "coach" }, authLoading: false, authError: "", authMessage: "" }),
    "resend-email-code": () => resendEmailCode(),
    "skip-onboarding": () => navigate("home"),
    back: () => navigate(state.user ? "home" : "signin"),
    goals: () => navigate("goals"),
    stats: () => navigate("stats"),
    history: () => navigate("history"),
    requests: () => navigate("requests"),
    sessions: () => navigate("sessions"),
    "new-goal": () => navigate("goal-form"),
    "new-session": () => state.profile.role === "coach" ? setState({ route: "session-form", authError: "", authMessage: "" }) : navigate("sessions"),
    "mode-join": () => setState({ sessionMode: "join" }),
    "mode-mine": () => setState({ sessionMode: "mine" }),
    "set-stats-period": () => setState({ statsPeriod: data.period || "Day" }),
    "set-history-tab": () => setState({ historyTab: data.tab || "sessions" }),
    "set-event-filter": () => setState({ eventFilter: data.filter || "All" }),
    "session-detail": () => setState({ activeSessionId: data.id, route: "session-detail" }),
    "goal-detail": () => setState({ activeGoalId: data.id, route: "goal-detail" }),
    "log-activity": () => navigate("activity-form"),
    "set-goal": () => navigate("goal-form"),
    "find-session": () => navigate("sessions"),
    "booked-sessions": () => setState({ route: "history", historyTab: "sessions", authError: "", authMessage: "" }),
    "ai-coach": () => navigate("ai-chat"),
    "clear-ai-chat": () => setState({ aiMessages: [], aiError: "" }),
    "profile-menu": () => navigate("profile"),
    "view-profile": () => navigate("profile-detail"),
    "view-profile-edit": () => navigate("profile-edit"),
    "find-partners": () => openFindPartners(),
    "open-friend-chat": () => setState({ activeFriendName: data.name, route: "friend-chat" }),
    "chat-ai": () => navigate("ai-chat"),
    "toggle-language": () => toggleLanguage(),
    "close-future-feature": () => setState({ futureFeatureMessage: "" }),
    "future-feature": () => setState({ futureFeatureMessage: `${data.feature || "This page"} will be available in a future version.` }),
    "scroll-to": () => document.getElementById(data.target)?.scrollIntoView({ behavior: "smooth", block: "start" }),
    help: () => setState({ route: "profile-detail", authMessage: "Help: intaliqsupport@gmail.com" }),
    "review-requests": () => navigate("goals"),
    "make-announcement": () => navigate("partners"),
    "request-join-session": () => setState({ confirmJoinSessionId: data.id, authError: "", authMessage: "" }),
    "cancel-join-session": () => setState({ confirmJoinSessionId: "" }),
    "confirm-join-session": () => joinSession(data.id),
    "join-session": () => joinSession(data.id),
    "delete-session": () => setState({ confirmDeleteSessionId: data.id, authError: "", authMessage: "" }),
    "cancel-delete-session": () => setState({ confirmDeleteSessionId: "" }),
    "confirm-delete-session": () => deleteSession(data.id),
    "leave-session": () => leaveSession(data.id),
    "admit-user": () => admitUser(data.id, data.name),
    "connect-partner": () => connectPartner(data.name),
    "accept-partner-request": () => acceptPartnerRequest(data.id, data.name),
    "reject-partner-request": () => rejectPartnerRequest(data.id),
    "advance-goal": () => advanceGoal(data.id),
    signout: () => setState({ confirmSignOut: true }),
    "cancel-signout": () => setState({ confirmSignOut: false }),
    "confirm-signout": () => signOut(),
    "open-admin": () => openAdmin("overview"),
    "admin-tab": () => openAdmin(data.tab),
    "admin-refresh": () => openAdmin(state.adminTab),
    "admin-set-role": () => runAdminAction("admin_set_role", { p_user: data.id, p_role: data.role }, data.role === "coach" ? "Account changed to coach." : "Account changed to user."),
    "admin-confirm": () => setState({ adminConfirm: { kind: data.kind, id: data.id, label: data.label }, authMessage: "" }),
    "cancel-admin-confirm": () => setState({ adminConfirm: null }),
    "reapply-coach": () => reapplyAsCoach(),
    "admin-user-sort": () => setState({ adminUserSort: data.sort }),
    "admin-session-filter": () => updateAdminSessionFilters({ [data.key]: data.value }),
    "admin-session-clear-filters": () => updateAdminSessionFilters(ADMIN_SESSION_DEFAULT_FILTERS),
    "admin-session-more": () => setState({ adminSessionLimit: (state.adminSessionLimit || ADMIN_SESSION_PAGE_SIZE) + ADMIN_SESSION_PAGE_SIZE }),
    "admin-session-clear-selection": () => setState({ adminSelectedSessions: [] }),
    "admin-session-select-all": () => {
      const shownIds = filteredAdminSessions().shown.map((info) => info.row.id);
      const allSelected = shownIds.every((id) => state.adminSelectedSessions.includes(id));
      setState({ adminSelectedSessions: allSelected ? [] : shownIds });
    },
  };

  actions[action]?.();
}

async function handleForm(type, data) {
  if (type === "ai-chat") {
    await sendAiMessage(data.message || "");
    return;
  }

  if (type === "auth") {
    await handleAuth(data);
    return;
  }

  if (type === "verify-email") {
    await verifyEmailCode(data);
    return;
  }

  if (type === "admin-user-search") {
    state.adminSearch = (data.search || "").trim();
    await openAdmin("users");
    return;
  }

  if (type === "admin-announcement") {
    await runAdminAction("admin_post_announcement", { p_title: data.title.trim(), p_body: data.body.trim() }, "Announcement posted.");
    return;
  }

  if (type === "admin-confirm") {
    await confirmAdminAction(data);
    return;
  }

  if (type === "onboarding" || type === "goal") {
    if (type === "onboarding" && state.profile.role === "coach") {
      const scheduleError = validateSessionSchedule(data);
      if (scheduleError) {
        setState({ authError: scheduleError, authMessage: "" });
        return;
      }

      const session = makeSession(data);
      await saveRemoteSession(session);
      setState({
        sessions: [session, ...state.sessions.filter((item) => item.id !== session.id)],
        joinedSessions: state.joinedSessions,
        activeSessionId: session.id,
        route: "home",
        authError: "",
        authMessage: "",
      });
      return;
    }

    const goal = makeGoal(data);
    setState({ goals: [goal, ...state.goals], route: type === "onboarding" ? "home" : "goals", authMessage: type === "goal" ? "Goal created." : "" });
  }

  if (type === "activity") {
    const activity = makeActivity(data);
    setState({ activities: [activity, ...state.activities], route: "home", authMessage: "Activity logged successfully." });
  }

  if (type === "goal-progress") {
    updateGoalProgress(data.id, data.coveredDistance);
  }

  if (type === "session") {
    const scheduleError = validateSessionSchedule(data);
    if (scheduleError) {
      setState({ route: "session-form", authError: scheduleError, authMessage: "" });
      return;
    }

    const session = makeSession(data);
    await saveRemoteSession(session);
    setState({
      sessions: [session, ...state.sessions.filter((item) => item.id !== session.id)],
      joinedSessions: state.joinedSessions,
      activeSessionId: session.id,
      route: "session-detail",
      authError: "",
      authMessage: "",
    });
  }

  if (type === "profile") {
    await updateProfile(data);
  }

  if (type === "profile-setup") {
    await saveProfileSetup(data);
  }

  if (type === "announcement") {
    addAnnouncement(data.sessionId, data.announcement, data.subject);
  }
}

async function handleAuth(data) {
  if (state.authLoading) return;

  if (!supabase) {
    setState({ authError: "Add Supabase environment variables before signing in.", authMessage: "" });
    return;
  }

  setState({ authLoading: true, authError: "", authMessage: "" });

  const emailResult = validateEmail(data.email);
  const password = data.password;
  const isSignup = state.authMode === "signup";

  if (emailResult.error) {
    setState({ authLoading: false, authError: emailResult.error, authMessage: "" });
    return;
  }

  if (isSignup && password !== data.confirmPassword) {
    setState({ authLoading: false, authError: "Passwords do not match.", authMessage: "" });
    return;
  }

  if (isSignup && data.role !== "coach" && !data.primaryGoal?.trim()) {
    setState({ authLoading: false, authError: "Choose at least one fitness interest.", authMessage: "" });
    return;
  }

  if (isSignup && data.role === "coach" && !data.specialty.trim()) {
    setState({ authLoading: false, authError: "Tell us your coaching specialty.", authMessage: "" });
    return;
  }

  const credentials = { email: emailResult.email, password };

  const response = isSignup
    ? await supabase.auth.signUp({
        ...credentials,
        options: {
          emailRedirectTo: authRedirectUrl,
          data: {
            name: data.name || emailResult.email.split("@")[0],
            role: data.role === "coach" ? "coach" : "member",
            fitnessLevel: data.fitnessLevel || "Beginner",
            primaryGoal: data.primaryGoal || "",
            specialty: data.specialty || "",
          },
        },
      })
    : await supabase.auth.signInWithPassword(credentials);

  if (response.error) {
    setState({ authLoading: false, authError: authErrorMessage(response.error), authMessage: "" });
    return;
  }

  if (isSignup) {
    if (response.data.session) {
      await supabase.auth.signOut({ scope: "local" });
    }
    setState({
      authLoading: false,
      route: "verify",
      pendingEmail: emailResult.email,
      pendingVerificationRole: data.role === "coach" ? "coach" : "member",
      pendingVerificationName: data.name || emailResult.email.split("@")[0],
      pendingFitnessLevel: data.fitnessLevel || "Beginner",
      pendingPrimaryGoal: data.primaryGoal || "",
      pendingSpecialty: data.specialty || "",
      authError: "",
      authMessage: "Enter the 6-digit code sent to your email.",
    });
    return;
  }

  if (!isSignup) {
    const verifiedUser = response.data.user;
    const verifiedProfile = await profileWithDatabaseRole(verifiedUser);
    if (verifiedProfile?.isSuspended) {
      await supabase.auth.signOut({ scope: "local" });
      setState({ authLoading: false, authError: SUSPENDED_MESSAGE, authMessage: "" });
      return;
    }
    const signedInUser = response.data.session?.user || verifiedUser;
    const profile = { ...loadState(signedInUser).profile, ...verifiedProfile };
    recordActivity(true);
    state = loadState(signedInUser);
    setState({
      user: publicUser(signedInUser),
      profile,
      route: routeForProfile(profile),
      confirmSignOut: false,
      authLoading: false,
      authError: "",
      authMessage: "",
    });
    await hydrateSharedSessions();
    return;
  }

  setState({ authLoading: false, authError: "Unable to continue. Please try again.", authMessage: "" });
}

const EMAIL_RATE_LIMIT_MESSAGE = "Too many emails were sent recently. Please wait a few minutes and try again.";
const RESEND_COOLDOWN_MESSAGE = "Please wait a minute before requesting another code.";

// Supabase returns raw rate-limit errors ("email rate limit exceeded",
// "For security purposes, you can only request this after 42 seconds.").
function authErrorMessage(error) {
  const message = error?.message || "";
  if (error?.status === 429 || /rate limit/i.test(message)) return EMAIL_RATE_LIMIT_MESSAGE;
  if (/only request this after/i.test(message)) return RESEND_COOLDOWN_MESSAGE;
  return message || "Unable to continue. Please try again.";
}

async function sendEmailOtp(email, details = {}) {
  if (!supabase) return;
  const role = details.role === "coach" ? "coach" : "member";
  const name = details.name || email.split("@")[0];
  const fitnessLevel = details.fitnessLevel || "Beginner";
  const primaryGoal = details.primaryGoal || "";
  const specialty = details.specialty || "";

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: authRedirectUrl,
      data: {
        name,
        role,
        fitnessLevel,
        primaryGoal,
        specialty,
      },
    },
  });

  if (error) {
    if (/confirm|verified|not found|signup/i.test(error.message)) {
      setState({
        authLoading: false,
        route: "verify",
        pendingEmail: email,
        pendingVerificationRole: role,
        pendingVerificationName: name,
        pendingFitnessLevel: fitnessLevel,
        pendingPrimaryGoal: primaryGoal,
        pendingSpecialty: specialty,
        authError: "",
        authMessage: "Check your email for the verification code or confirmation link.",
      });
      return;
    }
    setState({ authLoading: false, authError: authErrorMessage(error), authMessage: "" });
    return;
  }

  setState({
    authLoading: false,
    route: "verify",
    pendingEmail: email,
    pendingVerificationRole: role,
    pendingVerificationName: name,
    pendingFitnessLevel: fitnessLevel,
    pendingPrimaryGoal: primaryGoal,
    pendingSpecialty: specialty,
    authError: "",
    authMessage: "Enter the 6-digit code sent to your email.",
  });
}

async function resendEmailCode() {
  if (!state.pendingEmail) {
    setState({ route: "signin", authError: "Enter your email again to request a code.", authMessage: "" });
    return;
  }

  setState({ authLoading: true, authError: "", authMessage: "" });
  await sendEmailOtp(state.pendingEmail, {
    role: state.pendingVerificationRole,
    name: state.pendingVerificationName,
    fitnessLevel: state.pendingFitnessLevel,
    primaryGoal: state.pendingPrimaryGoal,
    specialty: state.pendingSpecialty,
  });
}

async function verifyEmailCode(data) {
  if (!supabase) {
    setState({ authError: "Add Supabase environment variables before verifying.", authMessage: "" });
    return;
  }

  const token = data.token.trim();
  if (!/^\d{6}$/.test(token)) {
    setState({ authError: "Enter the 6-digit verification code.", authMessage: "" });
    return;
  }

  setState({ authLoading: true, authError: "", authMessage: "" });

  let response = await supabase.auth.verifyOtp({
    email: state.pendingEmail,
    token,
    type: "email",
  });

  if (response.error) {
    response = await supabase.auth.verifyOtp({
      email: state.pendingEmail,
      token,
      type: "signup",
    });
  }

  if (response.error) {
    setState({ authLoading: false, authError: response.error.message, authMessage: "" });
    return;
  }

  const user = response.data.user;
  let finalUser = user;
  if (user && state.pendingVerificationRole) {
    const { data: updatedUserData } = await supabase.auth.updateUser({
      data: {
        name: state.pendingVerificationName,
        role: state.pendingVerificationRole,
        fitnessLevel: state.pendingFitnessLevel,
        primaryGoal: state.pendingPrimaryGoal,
        specialty: state.pendingSpecialty,
      },
    });
    finalUser = updatedUserData.user || user;
  }

  const finalProfile = profileFromUser(finalUser);
  state = loadState(finalUser);
  await syncPublicProfile(finalProfile);
  setState({
    user: publicUser(finalUser),
    profile: finalProfile,
    route: routeForProfile(finalProfile),
    confirmSignOut: false,
    pendingEmail: "",
    pendingVerificationRole: "member",
    pendingVerificationName: "",
    pendingFitnessLevel: "Beginner",
    pendingPrimaryGoal: "",
    pendingSpecialty: "",
    authLoading: false,
    authError: "",
    authMessage: "",
  });
}

async function signOut() {
  if (supabase) await supabase.auth.signOut({ scope: "local" });
  clearTimeout(inactivityTimer);
  try {
    localStorage.removeItem(LAST_ACTIVITY_KEY);
  } catch {
    // Ignore unavailable storage.
  }
  setState({ user: null, route: "signin", authMode: "signin", confirmSignOut: false, authError: "", authMessage: "Signed out." });
}

function profileMetadata(profile) {
  return {
    name: profile.name,
    username: profile.username,
    role: profile.role,
    fitnessLevel: profile.fitnessLevel,
    primaryGoal: profile.primaryGoal,
    specialty: profile.specialty,
    age: profile.age,
    showAge: profile.showAge,
    birthdate: profile.birthdate,
    city: profile.city,
    nationality: profile.nationality,
    bio: profile.bio,
    // The photo stays in the app's saved state. Auth metadata is copied into every
    // login token, and an image there makes the token too big to store and send.
    avatarUrl: "",
  };
}

// Claims the username in the profiles table first (its unique index is the
// final word on availability), then saves everything to the auth account.
const SESSION_EXPIRED_MESSAGE = "Your sign-in has expired. Log in again, then save your changes.";

async function saveAccount(profile, extraUpdate = {}) {
  if (!supabase || !state.user) return "";
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) return sessionError.message;
  let session = sessionData.session;
  if (!session || session.user?.id !== state.user.id) return SESSION_EXPIRED_MESSAGE;
  if (session.expires_at && session.expires_at * 1000 <= Date.now() + 60_000) {
    const { data: refreshed, error } = await supabase.auth.refreshSession();
    if (error || !refreshed.session) return SESSION_EXPIRED_MESSAGE;
    session = refreshed.session;
  }
  const profileError = await syncPublicProfile(profile);
  if (profileError) return usernameSaveError(profileError);
  const { error } = await supabase.auth.updateUser({ ...extraUpdate, data: profileMetadata(profile) });
  if (error?.name === "AuthSessionMissingError" || error?.status === 401) return SESSION_EXPIRED_MESSAGE;
  return error ? error.message : "";
}

function passwordChangeProblem(currentPassword, newPassword, confirmPassword) {
  if (!currentPassword && !newPassword && !confirmPassword) return "";
  if (!currentPassword) return "Enter your current password to change it.";
  const strengthError = passwordProblem(newPassword);
  if (strengthError) return strengthError;
  if (newPassword !== confirmPassword) return "New passwords do not match.";
  if (newPassword === currentPassword) return "Choose a new password that's different from your current one.";
  return "";
}

// Checks the current password on a throwaway client so the signed-in session
// (and its auth listeners) are left alone.
async function currentPasswordMatches(password) {
  const checker = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, storageKey: "intaliq-password-check" },
  });
  const { error } = await checker.auth.signInWithPassword({ email: state.profile.email, password });
  if (!error) await checker.auth.signOut({ scope: "local" });
  return !error;
}

async function updateProfile(data) {
  const draft = keepProfileDraft(data);
  if (state.authLoading) return;
  const { currentPassword = "", newPassword = "", confirmPassword = "", ...profileData } = data;
  const username = normalizeUsername(profileData.username ?? state.profile.username);
  const nextProfile = {
    ...state.profile,
    ...profileData,
    username,
    showAge: profileData.showAge === "true" ? "true" : "false",
    birthdate: profileData.birthdate || "",
    city: profileData.city || "",
    nationality: profileData.nationality || "",
    avatarUrl: profileData.avatarUrl || state.profile.avatarUrl || "",
  };
  nextProfile.age = profileAge(nextProfile);
  const emailChanged = nextProfile.email !== state.profile.email;

  const birthdateError = birthdateProblem(nextProfile.birthdate);
  if (birthdateError) {
    setState({ profileDraft: draft, authError: birthdateError, authMessage: "" });
    return;
  }

  const passwordError = passwordChangeProblem(currentPassword, newPassword, confirmPassword);
  if (passwordError) {
    setState({ profileDraft: draft, authError: passwordError, authMessage: "" });
    return;
  }

  setState({ authLoading: true, authError: "", authMessage: "" });
  const usernameError = await usernameProblem(username);
  if (usernameError) {
    setState({ profileDraft: draft, authLoading: false, authError: usernameError });
    return;
  }

  if (supabase && state.user) {
    if (newPassword && !(await currentPasswordMatches(currentPassword))) {
      setState({ profileDraft: draft, authLoading: false, authError: "Your current password is incorrect." });
      return;
    }
    const extraUpdate = {};
    if (emailChanged) extraUpdate.email = nextProfile.email;
    if (newPassword) extraUpdate.password = newPassword;
    const saveError = await saveAccount(nextProfile, extraUpdate);
    if (saveError) {
      setState({ profileDraft: draft, authLoading: false, authError: saveError });
      return;
    }
  }

  setState({
    profile: nextProfile,
    profileDraft: null,
    route: nextProfile.role === "coach" ? "profile" : "profile-detail",
    authLoading: false,
    authError: "",
    authMessage: emailChanged
      ? "Profile saved. Check your inbox to confirm the new email address."
      : newPassword ? "Profile saved and password changed." : "Profile saved.",
  });
}

async function saveProfileSetup(data) {
  const draft = keepProfileDraft(data);
  if (state.authLoading) return;
  const isCoach = state.profile.role === "coach";
  const name = (data.name || "").trim();
  const username = normalizeUsername(data.username);

  if (!name) {
    setState({ profileDraft: draft, authError: "Enter your full name." });
    return;
  }
  const birthdateError = birthdateProblem(data.birthdate, { required: true });
  if (birthdateError) {
    setState({ profileDraft: draft, authError: birthdateError });
    return;
  }
  if (isCoach && !data.specialty) {
    setState({ profileDraft: draft, authError: "Tell us your coaching specialty." });
    return;
  }
  if (!isCoach && !data.primaryGoal) {
    setState({ profileDraft: draft, authError: "Choose at least one fitness interest." });
    return;
  }

  setState({ authLoading: true, authError: "" });
  const usernameError = await usernameProblem(username);
  if (usernameError) {
    setState({ profileDraft: draft, authLoading: false, authError: usernameError });
    return;
  }

  const nextProfile = {
    ...state.profile,
    name,
    username,
    birthdate: data.birthdate || "",
    showAge: data.showAge === "true" ? "true" : "false",
    city: data.city || "",
    nationality: data.nationality || "",
    avatarUrl: data.avatarUrl || state.profile.avatarUrl || "",
    primaryGoal: isCoach ? state.profile.primaryGoal : data.primaryGoal,
    specialty: isCoach ? data.specialty : state.profile.specialty,
    fitnessLevel: isCoach ? state.profile.fitnessLevel : data.fitnessLevel || state.profile.fitnessLevel,
  };
  nextProfile.age = profileAge(nextProfile);

  const saveError = await saveAccount(nextProfile);
  if (saveError) {
    setState({ profileDraft: draft, authLoading: false, authError: saveError });
    return;
  }

  // A coach sign-up is saved as a member with a pending application, so take the role from the database.
  const savedProfile = { ...nextProfile, ...(await savedRoleAndReview()) };
  setState({ profile: savedProfile, profileDraft: null, route: routeForProfile(savedProfile), authLoading: false, authError: "", authMessage: "" });
}

async function savedRoleAndReview() {
  if (!supabase || !state.user) return {};
  const [{ data }, coachReview] = await Promise.all([
    supabase.from("profiles").select("role").eq("id", state.user.id).maybeSingle(),
    loadCoachReview(state.user.id),
  ]);
  return data?.role ? { role: accountRole({ role: data.role }), ...coachReview } : coachReview;
}

async function reapplyAsCoach() {
  if (!supabase || !state.user) return;
  const { error } = await supabase.rpc("apply_as_coach");
  if (error) {
    setState({ authError: error.message, authMessage: "" });
    return;
  }
  setState({ profile: { ...state.profile, ...(await loadCoachReview(state.user.id)) }, authError: "", authMessage: "Application sent. We'll review it soon." });
}

async function joinSession(id) {
  const selected = state.sessions.find((session) => session.id === id);
  if (state.profile.role === "coach" && isOwnSession(selected)) {
    showTemporaryMessage("Coaches cannot enroll in their own sessions.", { activeSessionId: id, route: "session-detail", confirmJoinSessionId: "" });
    return;
  }

  if (selected?.admission === "Approval required" && state.profile.role !== "coach") {
    if (!selected.hostId) {
      setState({ activeSessionId: id, route: "session-detail", confirmJoinSessionId: "", authError: "This session needs to be synced by its coach before requests can be sent.", authMessage: "" });
      return;
    }
    const { error } = await saveAdmissionRequest(selected);
    if (error) {
      setState({ activeSessionId: id, route: "session-detail", confirmJoinSessionId: "", authError: "Could not send the request yet. Please run the admission requests SQL in Supabase.", authMessage: "" });
      return;
    }
    const sessions = state.sessions.map((session) => {
      if (session.id !== id) return session;
      const name = state.profile.name || "New user";
      return { ...session, pendingApplicants: [...new Set([...(session.pendingApplicants || []), name])] };
    });
    setState({ sessions, activeSessionId: id, route: "session-detail", confirmJoinSessionId: "", authError: "", authMessage: "" });
    return;
  }

  const sessions = state.sessions.map((session) => {
    const members = enrolledMembers(session);
    if (session.id !== id || members.includes(state.profile.name)) return session;
    return { ...session, members: [...members, state.profile.name] };
  });
  await saveRemoteSession(sessions.find((session) => session.id === id));
  setState({ sessions, joinedSessions: [...new Set([...state.joinedSessions, id])], activeSessionId: id, route: "session-detail", confirmJoinSessionId: "" });
}

function leaveSession(id) {
  const sessions = state.sessions.map((session) => {
    if (session.id !== id) return session;
    return { ...session, members: session.members.filter((member) => member !== state.profile.name) };
  });
  setState({ sessions, joinedSessions: state.joinedSessions.filter((sessionId) => sessionId !== id), route: "sessions" });
}

async function admitUser(id, name) {
  const sessions = state.sessions.map((session) => {
    if (session.id !== id) return session;
    const members = enrolledMembers(session);
    return {
      ...session,
      pendingApplicants: (session.pendingApplicants || []).filter((candidate) => candidate !== name),
      members: [...new Set([...members, name])],
    };
  });
  await updateAdmissionRequestStatus(id, name, "approved");
  await saveRemoteSession(sessions.find((session) => session.id === id));
  setState({ sessions, activeSessionId: id, route: "session-detail" });
}

async function deleteSession(id) {
  const session = state.sessions.find((item) => item.id === id);
  if (!session || state.profile.role !== "coach" || !isOwnSession(session)) {
    setState({ confirmDeleteSessionId: "", authError: "Only the coach who created this session can delete it.", authMessage: "" });
    return;
  }

  const { error } = await deleteRemoteSession(session);
  if (error) {
    setState({
      confirmDeleteSessionId: "",
      authError: "Could not delete this session yet. Add the Supabase delete policy, then try again.",
      authMessage: "",
    });
    return;
  }

  const sessions = state.sessions.filter((item) => item.id !== id);
  setState({
    sessions,
    joinedSessions: state.joinedSessions.filter((sessionId) => sessionId !== id),
    activeSessionId: "",
    confirmDeleteSessionId: "",
    route: "sessions",
    authError: "",
    authMessage: "Session deleted.",
  });
}

function addAnnouncement(id, announcement, subject = "") {
  if (!id) {
    setState({ route: "partners", authMessage: "Choose a session first." });
    return;
  }
  const text = announcement.trim();
  if (!text) return;
  const title = subject.trim();
  const announcementText = title ? `${title}: ${text}` : text;
  if (id === "general") {
    setState({
      generalAnnouncements: [announcementText, ...(state.generalAnnouncements || [])],
      route: "partners",
      authMessage: "General announcement sent.",
    });
    return;
  }
  const sessions = state.sessions.map((session) => {
    if (session.id !== id) return session;
    return { ...session, announcements: [announcementText, ...(session.announcements || [])] };
  });
  setState({ sessions, activeSessionId: id, route: "partners", authMessage: "Announcement sent." });
}

async function openFindPartners() {
  setState({ route: "find-partners", authMessage: "", partnerDirectoryLoading: true, partnerDirectoryError: "" });
  await loadPartnerDirectory();
}

function normalizePartnerProfile(profile) {
  const name = profile.name || profile.full_name || profile.username || profile.email?.split("@")[0] || "Intaliq user";
  return {
    id: profile.id || name,
    name,
    city: profile.city || profile.location || "",
    role: profile.role || "member",
    primaryGoal: profile.primary_goal || profile.primaryGoal || profile.interests || "",
    specialty: profile.specialty || profile.coaching_specialty || "",
  };
}

async function loadPartnerDirectory() {
  if (!supabase || !state.user) {
    setState({ partnerDirectoryLoading: false, partnerDirectoryError: "Sign in first so Intaliq can load partner profiles." });
    return;
  }
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .neq("id", state.user.id)
    .order("full_name", { ascending: true });

  if (error) {
    setState({
      partnerDirectory: [],
      partnerDirectoryLoading: false,
      partnerDirectoryError: `${error.message}. Check the profiles SELECT policy in Supabase.`,
    });
    return;
  }

  const visibleProfiles = (data || []).filter((profile) => !profile.is_suspended);
  setState({ partnerDirectory: visibleProfiles.map(normalizePartnerProfile), partnerDirectoryLoading: false, partnerDirectoryError: "" });
}

async function syncPublicProfile(profile = state.profile) {
  if (!supabase || !state.user) return null;
  const payload = {
    id: state.user.id,
    full_name: profile.name,
    email: profile.email,
    role: profile.role,
    specialty: profile.specialty,
    updated_at: new Date().toISOString(),
  };
  // Only sent once chosen, so profiles without the username column keep syncing.
  if (profile.username) payload.username = profile.username;

  const { error } = await supabase.from("profiles").upsert(payload);
  if (error) console.warn("Unable to save public profile:", error.message);
  return error;
}

function connectPartner(name) {
  setState({ partners: [...new Set([name, ...state.partners])] });
}

function removePartnerRequest(id) {
  return (state.partnerRequests || []).filter((request) => normalizePartnerRequest(request).id !== id);
}

function acceptPartnerRequest(id, name) {
  setState({
    partnerRequests: removePartnerRequest(id),
    partners: [...new Set([name, ...state.partners])],
    authMessage: `${name} is now your friend.`,
  });
}

function rejectPartnerRequest(id) {
  setState({
    partnerRequests: removePartnerRequest(id),
    authMessage: "Partner request rejected.",
  });
}

function advanceGoal(id) {
  const goals = state.goals.map((goal) => {
    if (goal.id !== id) return goal;
    if (goal.targetDistance) {
      const coveredDistance = Math.min(Number(goal.targetDistance), Number(goal.coveredDistance || 0) + 1);
      return { ...goal, coveredDistance, progress: goalProgress({ ...goal, coveredDistance }) };
    }
    const completed = Math.min(goal.checkpoints.length, goal.completed + 1);
    const progress = Math.max(goal.progress, Math.round((completed / goal.checkpoints.length) * 100));
    return { ...goal, completed, progress };
  });
  setState({ goals });
}

function updateGoalProgress(id, coveredDistance) {
  const goals = state.goals.map((goal) => {
    if (goal.id !== id) return goal;
    const distance = Math.max(0, Math.min(Number(goal.targetDistance || 0), Number(coveredDistance) || 0));
    return { ...goal, coveredDistance: distance, progress: goalProgress({ ...goal, coveredDistance: distance }) };
  });
  setState({ goals, route: "goals", activeGoalId: id, authMessage: "Goal progress updated." });
}

async function initAuth() {
  if (!supabase) {
    authReady = true;
    state.route = "landing";
    state.authMode = "signin";
    render();
    return;
  }

  const { data, error } = await supabase.auth.getSession();
  const sessionUser = data.session?.user || null;
  if (sessionUser && sessionExpiredByInactivity()) {
    inactivitySignOutPending = true;
    await supabase.auth.signOut({ scope: "local" });
  }
  const validSessionUser = sessionExpiredByInactivity() ? null : sessionUser;
  if (!validSessionUser && inactivitySignOutPending) {
    try { localStorage.removeItem(LAST_ACTIVITY_KEY); } catch { /* Ignore unavailable storage. */ }
  }
  const hydratedProfile = await profileWithDatabaseRole(validSessionUser);
  const suspended = Boolean(validSessionUser && hydratedProfile?.isSuspended);
  const user = suspended ? null : validSessionUser;
  state = loadState(user);
  state.confirmSignOut = false;
  state.futureFeatureMessage = "";
  if (suspended) {
    signOutSuspendedUser();
    state.route = "signin";
    state.authMode = "signin";
    state.authError = SUSPENDED_MESSAGE;
  } else if (!user) {
    state.route = "landing";
    state.authMode = "signin";
    if (inactivitySignOutPending) {
      inactivitySignOutPending = false;
      state.authError = "You were signed out after 45 minutes of inactivity. Please log in again.";
    }
  } else {
    recordActivity(false);
    state.profile = { ...state.profile, ...hydratedProfile };
    await hydrateSharedSessions();
    if (state.route === "signin" || !routeAllowedForRole(state.route, state.profile.role)) {
      state.route = routeForProfile(state.profile);
    }
  }
  if (error) {
    state.authError = error.message;
  }
  authReady = true;
  render();

  // supabase-js holds its auth lock while it runs this callback, so awaiting other
  // Supabase calls in it deadlocks. After 5s the lock is stolen and two token
  // refreshes can race, which deletes the session ("Auth session missing!").
  supabase.auth.onAuthStateChange((event, session) => {
    setTimeout(() => handleAuthChange(event, session), 0);
  });
  startInactivityTracking();
}

async function handleAuthChange(event, session) {
  const userFromSession = session?.user || null;
  // Profile saves and token refreshes are already reflected in state; reloading
  // here would race the save and drop its confirmation message.
  if ((event === "USER_UPDATED" || event === "TOKEN_REFRESHED") && userFromSession?.id === state.user?.id) {
    scheduleInactivityCheck();
    return;
  }
  if (userFromSession && sessionExpiredByInactivity()) {
    inactivitySignOutPending = true;
    setTimeout(() => supabase.auth.signOut({ scope: "local" }), 0);
    return;
  }
  const nextProfile = await profileWithDatabaseRole(userFromSession);
  if (userFromSession && nextProfile?.isSuspended) {
    signOutSuspendedUser();
    return;
  }
  const previousRoute = state.route;
  state = loadState(userFromSession);
  state.confirmSignOut = false;
  state.futureFeatureMessage = "";
  if (userFromSession) {
    recordActivity(event === "SIGNED_IN" || event === "INITIAL_SESSION");
    state.profile = { ...state.profile, ...nextProfile };
    await hydrateSharedSessions();
    state.route = state.route === "signin" || !routeAllowedForRole(state.route, state.profile.role) ? routeForProfile(state.profile) : state.route;
  } else {
    clearTimeout(inactivityTimer);
    // Keep visitors where they are in the sign-in flow instead of forcing the login page.
    state.route = ["landing", "signin", "verify"].includes(previousRoute) ? previousRoute : "landing";
    if (suspendedSignOutPending) {
      suspendedSignOutPending = false;
      state.route = "signin";
      state.authMode = "signin";
      state.authError = SUSPENDED_MESSAGE;
    }
    if (inactivitySignOutPending) {
      inactivitySignOutPending = false;
      state.route = "signin";
      state.authMode = "signin";
      state.authError = "You were signed out after 45 minutes of inactivity. Please log in again.";
    }
  }
  render();
}

updateStatusTime();
setInterval(updateStatusTime, 30000);
initAuth();
