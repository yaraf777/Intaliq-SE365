import { createClient } from "@supabase/supabase-js";

const STORAGE_PREFIX = "intaliq-app-state-v2";
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const productionAppUrl = "https://intaliq-se-365.vercel.app";
const authRedirectUrl = import.meta.env.VITE_AUTH_REDIRECT_URL || productionAppUrl;
const hasSupabaseConfig = Boolean(supabaseUrl && supabaseAnonKey);
const supabase = hasSupabaseConfig ? createClient(supabaseUrl, supabaseAnonKey) : null;

const seedState = {
  route: "signin",
  authMode: "signin",
  authMessage: "",
  authError: "",
  authLoading: false,
  confirmSignOut: false,
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
    email: "",
    role: "member",
    fitnessLevel: "Beginner",
    primaryGoal: "",
    specialty: "",
    age: "",
    showAge: "true",
    birthdate: "",
    city: "Jeddah",
    nationality: "",
    avatarUrl: "",
    bio: "",
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
};

let state = loadState();

const app = document.querySelector("#app");
const phone = document.querySelector(".phone");
const statusTime = document.querySelector("#status-time");
let authReady = false;

function updateStatusTime() {
  if (!statusTime) return;
  statusTime.textContent = new Intl.DateTimeFormat([], {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date());
}

function userStorageKey(userId = "guest") {
  return `${STORAGE_PREFIX}:${userId}`;
}

function loadState(user = null) {
  const saved = localStorage.getItem(userStorageKey(user?.id));
  const profile = profileFromUser(user);
  if (!saved) {
    return { ...structuredClone(seedState), user: user ? publicUser(user) : null, profile: profile || structuredClone(seedState).profile };
  }
  const parsed = JSON.parse(saved);
  const mergedProfile = profile
    ? { ...parsed.profile, ...profile, role: accountRole({ ...parsed.profile, ...profile }) }
    : { ...structuredClone(seedState).profile, ...parsed.profile };
  return {
    ...structuredClone(seedState),
    ...parsed,
    user: user ? publicUser(user) : null,
    profile: mergedProfile,
    authLoading: false,
    confirmSignOut: false,
    futureFeatureMessage: "",
  };
}

function saveState() {
  const persistedState = {
    ...state,
    authLoading: false,
    confirmSignOut: false,
    futureFeatureMessage: "",
  };
  localStorage.setItem(userStorageKey(state.user?.id), JSON.stringify(persistedState));
}

function setState(patch) {
  state = { ...state, ...patch };
  saveState();
  render();
}

function navigate(route) {
  setState({ route });
}

async function formData(form) {
  const values = Object.fromEntries(new FormData(form).entries());
  const avatarFile = new FormData(form).get("avatarFile");
  if (avatarFile instanceof File && avatarFile.size) {
    values.avatarUrl = await fileToDataUrl(avatarFile);
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
  if (source.specialty || source.coaching_specialty) return "coach";
  return "member";
}

function profileFromUser(user) {
  if (!user) return null;
  const meta = user.user_metadata || {};
  return {
    name: meta.name || meta.full_name || user.email?.split("@")[0] || "User",
    email: user.email || meta.email || "",
    role: accountRole(meta),
    fitnessLevel: meta.fitnessLevel || "Beginner",
    primaryGoal: meta.primaryGoal || "",
    specialty: meta.specialty || "",
    age: meta.age || "",
    showAge: meta.showAge ?? "true",
    birthdate: meta.birthdate || "",
    city: meta.city || "Jeddah",
    nationality: meta.nationality || "",
    avatarUrl: meta.avatarUrl || "",
    bio: meta.bio || "",
  };
}

function profileFromPublicProfile(row, user = state.user) {
  if (!row) return null;
  const baseProfile = profileFromUser(user) || structuredClone(seedState).profile;
  return {
    ...baseProfile,
    name: row.name || row.full_name || row.username || baseProfile.name,
    email: row.email || baseProfile.email,
    role: accountRole(row),
    primaryGoal: row.primary_goal || row.primaryGoal || baseProfile.primaryGoal,
    specialty: row.specialty || baseProfile.specialty,
    city: row.city || baseProfile.city,
    nationality: row.nationality || baseProfile.nationality,
  };
}

function routeForProfile(profile = state.profile) {
  const isCoach = profile.role === "coach";
  if (isCoach) return state.sessions.length ? "home" : "onboarding";
  return state.goals.length ? "home" : "onboarding";
}

function routeAllowedForRole(route, role = state.profile.role) {
  const coachOnly = new Set(["activities", "stats", "history", "goal-form", "goal-detail", "activity-form"]);
  const memberOnly = new Set([]);
  if (role === "coach") return !coachOnly.has(route);
  return !memberOnly.has(route);
}

async function profileWithDatabaseRole(user) {
  const authProfile = profileFromUser(user);
  if (!supabase || !user) return authProfile;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return profileFromPublicProfile(data, user) || authProfile;
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
    return;
  }

  const protectedRoutes = ["home", "events", "activities", "stats", "history", "requests", "goals", "sessions", "partners", "find-partners", "friend-chat", "profile", "profile-detail", "profile-edit", "ai-chat", "goal-form", "goal-detail", "activity-form", "session-form", "session-detail"];
  if (protectedRoutes.includes(state.route) && !state.user) {
    state.route = "signin";
  }

  if (state.user && !routeAllowedForRole(state.route, state.profile.role)) {
    state.route = "home";
  }

  const views = {
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
    "ai-chat": aiChatView,
    "goal-form": goalFormView,
    "goal-detail": goalDetailView,
    "activity-form": activityFormView,
    "session-form": sessionFormView,
    "session-detail": sessionDetailView,
  };

  app.innerHTML = (views[state.route] || signInView)() + signOutConfirmModal() + futureFeatureModal();
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
            <input class="input auth-input" name="name" type="text" value="${state.profile.name}" required />
          </label>
          ${selectedRole === "coach" ? `
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
          <input class="input auth-input" name="password" type="password" minlength="6" placeholder="Enter your password" autocomplete="${isSignup ? "new-password" : "current-password"}" required />
        </label>
        ${isSignup ? `
          <label class="field">
            <span>Confirm password</span>
            <input class="input auth-input" name="confirmPassword" type="password" minlength="6" placeholder="Re-enter your password" autocomplete="new-password" required />
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
  const totalDistance = state.activities.reduce((total, activity) => total + Number(activity.distance || 0), 0);
  const calories = state.activities.reduce((total, activity) => total + activityCalories(activity), 0).toLocaleString();
  const activeDays = `${Math.min(7, new Set(state.activities.map((activity) => activity.time?.slice(0, 10))).size)}/7`;
  const announcements = relevantAnnouncements();
  const message = state.authMessage ? `<div class="member-toast">${state.authMessage}</div>` : "";
  return withTabs("home", `
    <div class="member-dashboard">
      ${message}
      <header class="member-dashboard-head">
        <h1>Welcome back, ${displayName}!</h1>
        <p>Take your first step - Intaliq</p>
      </header>

      <section class="member-stat-grid" aria-label="User stats">
        ${memberStat("This Week", `${formatDistance(totalDistance)} km`, "")}
        ${memberStat("Calories", calories, "flame")}
        ${memberStat("Active Days", activeDays, "calendar")}
        ${memberStat("Sessions", state.joinedSessions.length, "group")}
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

function relevantAnnouncements() {
  return state.sessions
    .filter((session) => state.joinedSessions.includes(session.id))
    .flatMap((session) => (session.announcements || []).map((announcement) => {
      const [title, ...messageParts] = announcement.split(": ");
      return {
        sessionTitle: session.title,
        title: messageParts.length ? title : "Session update",
        message: messageParts.length ? messageParts.join(": ") : announcement,
      };
    }));
}

function eventNotificationsByType() {
  const groups = {
    All: [],
    Running: [],
    Hiking: [],
    Cycling: [],
  };
  groups.All = (state.generalAnnouncements || []).map((announcement) => {
    const [title, ...messageParts] = announcement.split(": ");
    return {
      title: messageParts.length ? title : "General announcement",
      message: messageParts.length ? messageParts.join(": ") : announcement,
      meta: "General",
    };
  });

  const relevantSessions = state.profile.role === "coach"
    ? state.sessions
    : state.sessions.filter((session) => state.joinedSessions.includes(session.id));

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
  return new Intl.DateTimeFormat([], {
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
  const distanceHeight = Math.min(100, Math.max(8, distance * 10));
  const calorieHeight = Math.min(100, Math.max(8, calories / 20));

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
  const upcoming = state.sessions[0];
  const pendingCount = state.sessions.reduce((total, session) => total + (session.pendingApplicants?.length || 0), 0);
  const totalMembers = state.sessions.reduce((total, session) => total + session.members.length, 0);
  const activeSessions = state.sessions.filter((session) => session.date !== "Completed").length;
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
        ${coachStat("Total Sessions", state.sessions.length, "")}
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
  const remaining = Math.max(0, session.capacity - session.members.length);
  const actionAttrs = session.isDemo ? "" : `data-action="session-detail" data-id="${session.id}"`;
  return `
    <article class="coach-session-card" ${actionAttrs}>
      <div class="session-mark">${interestIcon(session.type === "Cardio" ? "Running" : "Cycling")}</div>
      <div class="coach-session-main">
        <div class="coach-session-title">
          <h3>${session.title}</h3>
          <span>${session.level || "All levels"}</span>
        </div>
        <p>Coach ${state.profile.name || "Intaliq"}</p>
        <p>${session.date} at ${session.time}</p>
        <p>${session.location || session.notes || "Focused workout session."}</p>
        ${session.accessibility && session.accessibility !== "None" ? `<p>${session.accessibility === "Wheelchair-Friendly" ? "♿ " : ""}${session.accessibility}</p>` : ""}
        <p>${session.members.length}/${session.capacity} enrolled - ${remaining} spot${remaining === 1 ? "" : "s"} left</p>
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
            <input class="input" name="title" placeholder="Running goal" required />
          </label>
          <label class="field">
            <span>Due date</span>
            <input class="input" name="due" type="date" required />
          </label>
          <label class="field">
            <span>Desired distance (km)</span>
            <input class="input" name="targetDistance" type="number" min="0.1" step="0.1" placeholder="20" required />
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
          <input class="input" name="coveredDistance" type="number" min="0" step="0.1" value="${goal.coveredDistance || 0}" required />
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
  const bookedSessions = state.sessions.filter((session) => state.joinedSessions.includes(session.id));
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
          <input class="input" name="time" type="datetime-local" required />
        </label>
        <label class="field">
          <span>Distance covered (km)</span>
          <input class="input" name="distance" type="number" min="0" step="0.1" placeholder="5.0" required />
        </label>
        <label class="field">
          <span>Activity duration (minutes)</span>
          <input class="input" name="duration" type="number" min="1" step="1" placeholder="30" required />
        </label>
        <button class="btn btn-primary activity-submit" type="submit">Save Activity</button>
      </form>
    </div>
  `);
}

function sessionsView() {
  if (state.profile.role === "coach") {
    return withTabs("sessions", `
      <div class="topbar">
        <h1>My Sessions</h1>
        ${button("+ Session", "btn-primary", "new-session")}
      </div>
      <div class="stack">
        ${state.sessions.length ? state.sessions.map((session) => sessionCard(session)).join("") : `<div class="empty">No sessions yet. Create your first coaching session.</div>`}
      </div>
    `);
  }

  const offeredSessions = state.sessions.filter((session) => !state.joinedSessions.includes(session.id));
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
  const joined = state.joinedSessions.includes(session.id);
  const pendingApplicants = session.pendingApplicants || [];
  const announcements = session.announcements || [];
  return page(session.title, `${session.date} · ${session.time}`, `
    <div class="stack">
      <div class="card stack">
        <div class="session-head">
          <h3>${session.type}</h3>
          <span class="pill ${joined || isCoach ? "" : "warn"}">${isCoach ? session.level : joined ? "Joined" : session.admission}</span>
        </div>
        <p class="subtle">${session.notes}</p>
        ${session.accessibility && session.accessibility !== "None" ? `<div class="accessibility-badge">${session.accessibility === "Wheelchair-Friendly" ? "♿ " : ""}${session.accessibility}</div>` : ""}
        <div class="metric-row">
          <div class="metric"><b>${session.members.length}</b><span>Joined</span></div>
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
          <label class="field"><span>Announcement</span><textarea class="textarea" name="announcement" placeholder="Share an update with this session"></textarea></label>
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
        ${session.members.map((member) => `<div class="list-row"><span>${member}</span><span class="pill gray">member</span></div>`).join("")}
      </div>
      ${isCoach ? "" : joined ? button("Leave session", "btn-ghost", "leave-session", `data-id="${session.id}"`) : button(session.admission === "Approval required" ? "Request to join" : "Join session", "btn-primary", "join-session", `data-id="${session.id}"`)}
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
        ${moreMenuRow("◇", "Find Partners", "find-partners")}
        ${moreMenuRow("✦", "Chat with AI", "chat-ai")}
        ${moreMenuRow("◎", "Language", "future-language", "English")}
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
  const handle = `@${(state.profile.email || "user@intaliq.app").split("@")[0]}`;
  const city = state.profile.city || "Jeddah";
  const age = profileAge();
  const ageVisible = state.profile.showAge !== "false" && age;
  const nationality = nationalityOptions().find((item) => item.value === state.profile.nationality);
  const interests = selectedInterests(state.profile.primaryGoal);
  return withTabs("profile", `
    <div class="profile-sketch-screen">
      <button class="member-view-all back-button" data-action="profile-menu">Back</button>
      ${message}
      <div class="profile-sketch-head">
        ${profileAvatar()}
        <h1>${name}</h1>
        <p>${handle} <span>|</span> ${city}</p>
      </div>
      <div class="profile-info-grid">
        <div><strong>${ageVisible ? age : "Hidden"}</strong><span>Age</span></div>
        <div><strong class="profile-interest-icons">${interests.length ? interests.map((item) => interestIcon(item)).join("") : "—"}</strong><span>Interest</span></div>
        <div><strong>${city}</strong><span>City</span></div>
        <div><strong>${nationality ? nationality.flag : "🌐"}</strong><span>${nationality ? nationality.label : "Nationality"}</span></div>
      </div>
      <div class="profile-sketch-list">
        ${profileSketchRow("◉", "Profile", "view-profile-edit")}
        ${profileSketchRow("◇", "Friends", "find-partners")}
        ${profileSketchRow("✦", "Requests", "requests")}
        ${profileSketchRow("↗", "My stats", "stats")}
        ${profileSketchRow("◷", "History", "history")}
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
        <label class="field"><span>Full name</span><input class="input" name="name" value="${state.profile.name}" required /></label>
        <label class="field"><span>Email</span><input class="input" name="email" type="email" value="${state.profile.email}" required /></label>
        <label class="field"><span>Birthdate</span><input class="input" name="birthdate" type="date" value="${state.profile.birthdate}" /></label>
        <label class="toggle-row">
          <input type="hidden" name="showAge" value="false" />
          <input type="checkbox" name="showAge" value="true" ${state.profile.showAge !== "false" ? "checked" : ""} />
          <span>Display age on profile</span>
        </label>
        ${interestPicker(state.profile.primaryGoal)}
        <label class="field">
          <span>Location</span>
          <select class="select" name="city">
            ${cityOptions().map((city) => `<option value="${city}" ${city === state.profile.city ? "selected" : ""}>${city}</option>`).join("")}
          </select>
        </label>
        <label class="field">
          <span>Nationality</span>
          <select class="select" name="nationality">
            ${nationalityOptions().map((item) => `<option value="${item.value}" ${item.value === state.profile.nationality ? "selected" : ""}>${item.flag} ${item.label}</option>`).join("")}
          </select>
        </label>
        <input type="hidden" name="role" value="${state.profile.role}" />
        <input type="hidden" name="fitnessLevel" value="${state.profile.fitnessLevel}" />
        <input type="hidden" name="specialty" value="${state.profile.specialty}" />
        <label class="field"><span>New password</span><input class="input" name="password" type="password" minlength="6" placeholder="Leave blank to keep current password" autocomplete="new-password" /></label>
        <button class="btn btn-primary activity-submit" type="submit">Update Profile</button>
      </form>
    </div>
  `);
}

function aiChatView() {
  return withTabs("profile", `
    <div class="ai-chat-screen">
      <button class="member-view-all back-button" data-action="profile-menu">Back</button>
      <div>
        <h1>AI Coach</h1>
        <p>Ask for workout ideas, goal pacing, or session suggestions.</p>
      </div>
      <div class="ai-chat-card">
        <div class="ai-bubble">Hi, I can help you plan your next Intaliq activity. What are you training for?</div>
        <label class="field">
          <span>Message</span>
          <textarea class="textarea" placeholder="Ask Intaliq AI..."></textarea>
        </label>
        <button class="btn btn-primary activity-submit" type="button">Send</button>
      </div>
    </div>
  `);
}

function partnersView() {
  if (state.profile.role === "coach") {
    const sessionOptions = state.sessions.map((session) => `
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
            <input class="input" name="subject" placeholder="e.g., Location Change, Time Update, Important Notice" required />
          </label>
          <label class="field">
            <span>Message</span>
            <textarea class="textarea" name="announcement" placeholder="Write your announcement message..." required></textarea>
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

function page(title, subtitle, body) {
  return `
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
    <label class="field"><span>${state.profile.role === "coach" ? "Plan title" : "Goal title"}</span><input class="input" name="title" value="${goal.title}" required /></label>
    <div class="grid-2">
      <label class="field"><span>Category</span><select class="select" name="category">${["Strength", "Cardio", "Mobility", "Weight loss", "Nutrition", "Recovery"].map((category) => `<option ${category === goal.category ? "selected" : ""}>${category}</option>`).join("")}</select></label>
      <label class="field"><span>Due</span><input class="input" name="due" value="${goal.due}" required /></label>
    </div>
    <label class="field"><span>Progress</span><input class="input" name="progress" type="number" min="0" max="100" value="${goal.progress}" /></label>
    ${[0, 1, 2, 3].map((index) => `<label class="field"><span>Checkpoint ${index + 1}</span><input class="input" name="checkpoint${index}" value="${goal.checkpoints[index] || ""}" /></label>`).join("")}
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
    <label class="field"><span>Session Title</span><input class="input" name="title" placeholder="e.g., Morning Run Crew" required /></label>
    <label class="field"><span>Date</span><input class="input" name="date" type="date" min="${todayDateValue()}" required /></label>
    <label class="field"><span>Time</span><input class="input" name="time" type="time" required /></label>
    <label class="field"><span>Capacity</span><input class="input" name="capacity" type="number" min="2" max="50" placeholder="Maximum participants" required /></label>
    <label class="field"><span>Location</span><input class="input" name="location" placeholder="e.g., King Abdullah Park, Riyadh" required /></label>
    <label class="field"><span>Intensity Level</span><select class="select" name="level"><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label>
    <label class="field"><span>Description</span><input class="input" name="notes" placeholder="e.g., any requirements, or expectations" /></label>
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
  const joined = state.joinedSessions.includes(session.id);
  const pending = session.pendingApplicants?.length || 0;
  const accessibility = session.accessibility && session.accessibility !== "None" ? session.accessibility : "";
  return `
    <article class="session-card">
      <div class="session-head">
        <div>
          <h3>${session.title}</h3>
          <div class="subtle">${session.date} · ${session.time}</div>
        </div>
        <span class="pill ${joined ? "" : "warn"}">${joined ? "Joined" : session.type}</span>
      </div>
      <div class="subtle">${session.members.length}/${session.capacity} people · ${session.level || "All levels"} · ${session.admission || "Open"}</div>
      ${state.profile.role === "coach"
        ? accessibility ? `<div class="accessibility-badge">${accessibility === "Wheelchair-Friendly" ? "♿ " : ""}${accessibility}</div>` : ""
        : `<div class="accessibility-row"><span>Accessibility</span><strong>${accessibility ? `${accessibility === "Wheelchair-Friendly" ? "♿ " : ""}${accessibility}` : ""}</strong></div>`}
      ${state.profile.role === "coach" && pending ? `<div class="notice">${pending} admission request${pending === 1 ? "" : "s"} waiting</div>` : ""}
      <div class="grid-2">
        <button class="btn btn-ghost" data-action="session-detail" data-id="${session.id}">Details</button>
        ${joined ? `<button class="btn btn-dark" data-action="session-detail" data-id="${session.id}">Open</button>` : `<button class="btn btn-primary" data-action="join-session" data-id="${session.id}">Join</button>`}
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
  const id = data.title
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 4)
    .toUpperCase()
    .padEnd(4, "X");

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
    members: [state.profile.name || "Host"],
    pendingApplicants: [],
    announcements: [],
    notes: data.notes || "Focused workout session.",
    accessibility: data.accessibility || "None",
  };
}

function bindEvents() {
  app.querySelectorAll("[data-route]").forEach((element) => {
    element.addEventListener("click", () => navigate(element.dataset.route));
  });

  app.querySelectorAll("[data-action]").forEach((element) => {
    element.addEventListener("click", () => handleAction(element.dataset.action, element.dataset));
  });

  app.querySelectorAll("[data-form]").forEach((form) => {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      await handleForm(form.dataset.form, await formData(form));
    });
  });

  app.querySelector("[data-partner-search]")?.addEventListener("input", (event) => {
    setState({ partnerSearch: event.target.value });
  });
}

function handleAction(action, data = {}) {
  const actions = {
    "auth-signin": () => setState({ authMode: "signin", authLoading: false, authError: "", authMessage: "" }),
    "auth-signup": () => setState({ authMode: "signup", authLoading: false, authError: "", authMessage: "" }),
    "role-member": () => setState({ profile: { ...state.profile, role: "member" }, authLoading: false, authError: "", authMessage: "" }),
    "role-coach": () => setState({ profile: { ...state.profile, role: "coach" }, authLoading: false, authError: "", authMessage: "" }),
    "back-to-login": () => setState({ route: "signin", authMode: "signin", authLoading: false, authError: "", authMessage: "" }),
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
    "ai-coach": () => navigate("ai-chat"),
    "profile-menu": () => navigate("profile"),
    "view-profile": () => navigate("profile-detail"),
    "view-profile-edit": () => navigate("profile-edit"),
    "find-partners": () => openFindPartners(),
    "open-friend-chat": () => setState({ activeFriendName: data.name, route: "friend-chat" }),
    "chat-ai": () => navigate("ai-chat"),
    "future-language": () => setState({ futureFeatureMessage: "This feature will be implemented in future versions." }),
    "close-future-feature": () => setState({ futureFeatureMessage: "" }),
    help: () => setState({ route: "profile-detail", authMessage: "Help: intaliqsupport@gmail.com" }),
    "review-requests": () => navigate("goals"),
    "make-announcement": () => navigate("partners"),
    "join-session": () => joinSession(data.id),
    "leave-session": () => leaveSession(data.id),
    "admit-user": () => admitUser(data.id, data.name),
    "connect-partner": () => connectPartner(data.name),
    "accept-partner-request": () => acceptPartnerRequest(data.id, data.name),
    "reject-partner-request": () => rejectPartnerRequest(data.id),
    "advance-goal": () => advanceGoal(data.id),
    signout: () => setState({ confirmSignOut: true }),
    "cancel-signout": () => setState({ confirmSignOut: false }),
    "confirm-signout": () => signOut(),
  };

  actions[action]?.();
}

async function handleForm(type, data) {
  if (type === "auth") {
    await handleAuth(data);
    return;
  }

  if (type === "verify-email") {
    await verifyEmailCode(data);
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
      setState({
        sessions: [session, ...state.sessions.filter((item) => item.id !== session.id)],
        joinedSessions: [...new Set([session.id, ...state.joinedSessions])],
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
    setState({
      sessions: [session, ...state.sessions.filter((item) => item.id !== session.id)],
      joinedSessions: [...new Set([session.id, ...state.joinedSessions])],
      activeSessionId: session.id,
      route: "session-detail",
      authError: "",
      authMessage: "",
    });
  }

  if (type === "profile") {
    await updateProfile(data);
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
    setState({ authLoading: false, authError: response.error.message, authMessage: "" });
    return;
  }

  if (isSignup) {
    if (response.data.session) {
      await supabase.auth.signOut();
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
    await supabase.auth.signOut();
    await sendEmailOtp(
      emailResult.email,
      {
        role: verifiedProfile?.role || "member",
        name: verifiedProfile?.name || emailResult.email.split("@")[0],
        fitnessLevel: verifiedProfile?.fitnessLevel || "Beginner",
        primaryGoal: verifiedProfile?.primaryGoal || "",
        specialty: verifiedProfile?.specialty || "",
      },
    );
    return;
  }

  setState({ authLoading: false, authError: "Unable to continue. Please try again.", authMessage: "" });
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
    setState({ authLoading: false, authError: error.message, authMessage: "" });
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
  if (supabase) await supabase.auth.signOut();
  setState({ user: null, route: "signin", authMode: "signin", confirmSignOut: false, authError: "", authMessage: "Signed out." });
}

async function updateProfile(data) {
  const password = data.password?.trim();
  const profileData = { ...data };
  delete profileData.password;
  const nextProfile = {
    ...state.profile,
    ...profileData,
    age: profileAge({ ...state.profile, ...profileData }),
    showAge: profileData.showAge === "true" ? "true" : "false",
    birthdate: profileData.birthdate || "",
    city: profileData.city || "Jeddah",
    nationality: profileData.nationality || "",
    avatarUrl: profileData.avatarUrl || state.profile.avatarUrl || "",
  };
  if (supabase && state.user) {
    const update = {
      data: {
        name: nextProfile.name,
        role: nextProfile.role,
        fitnessLevel: nextProfile.fitnessLevel,
        primaryGoal: nextProfile.primaryGoal,
        specialty: nextProfile.specialty,
        age: nextProfile.age,
        showAge: nextProfile.showAge,
        birthdate: nextProfile.birthdate,
        city: nextProfile.city,
        nationality: nextProfile.nationality,
        avatarUrl: nextProfile.avatarUrl,
        bio: nextProfile.bio,
      },
    };

    if (nextProfile.email !== state.profile.email) {
      update.email = nextProfile.email;
    }

    if (password) {
      update.password = password;
    }

    const { error } = await supabase.auth.updateUser(update);
    if (error) {
      setState({ authError: error.message });
      return;
    }
  }

  await syncPublicProfile(nextProfile);

  setState({
    profile: nextProfile,
    route: nextProfile.role === "coach" ? "profile" : "profile-detail",
    authError: "",
    authMessage: nextProfile.email !== state.profile.email ? "Profile saved. Check your inbox to confirm the new email address." : "Profile saved.",
  });
}

function joinSession(id) {
  const selected = state.sessions.find((session) => session.id === id);
  if (selected?.admission === "Approval required" && state.profile.role !== "coach") {
    const sessions = state.sessions.map((session) => {
      if (session.id !== id) return session;
      const name = state.profile.name || "New user";
      return { ...session, pendingApplicants: [...new Set([...(session.pendingApplicants || []), name])] };
    });
    setState({ sessions, activeSessionId: id, route: "session-detail", authMessage: "Request sent to the coach." });
    return;
  }

  const sessions = state.sessions.map((session) => {
    if (session.id !== id || session.members.includes(state.profile.name)) return session;
    return { ...session, members: [...session.members, state.profile.name] };
  });
  setState({ sessions, joinedSessions: [...new Set([...state.joinedSessions, id])], activeSessionId: id, route: "session-detail" });
}

function leaveSession(id) {
  const sessions = state.sessions.map((session) => {
    if (session.id !== id) return session;
    return { ...session, members: session.members.filter((member) => member !== state.profile.name) };
  });
  setState({ sessions, joinedSessions: state.joinedSessions.filter((sessionId) => sessionId !== id), route: "sessions" });
}

function admitUser(id, name) {
  const sessions = state.sessions.map((session) => {
    if (session.id !== id) return session;
    return {
      ...session,
      pendingApplicants: (session.pendingApplicants || []).filter((candidate) => candidate !== name),
      members: [...new Set([...session.members, name])],
    };
  });
  setState({ sessions, activeSessionId: id, route: "session-detail" });
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

  setState({ partnerDirectory: (data || []).map(normalizePartnerProfile), partnerDirectoryLoading: false, partnerDirectoryError: "" });
}

async function syncPublicProfile(profile = state.profile) {
  if (!supabase || !state.user) return;
  const payload = {
    id: state.user.id,
    full_name: profile.name,
    email: profile.email,
    role: profile.role,
    specialty: profile.specialty,
    updated_at: new Date().toISOString(),
  };

  await supabase.from("profiles").upsert(payload);
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
    state.authMode = "signin";
    render();
    return;
  }

  const { data, error } = await supabase.auth.getSession();
  const user = data.session?.user || null;
  const hydratedProfile = await profileWithDatabaseRole(user);
  state = loadState(user);
  state.confirmSignOut = false;
  state.futureFeatureMessage = "";
  if (!user) {
    state.route = "signin";
    state.authMode = "signin";
  } else {
    state.profile = hydratedProfile || state.profile;
    if (state.route === "signin" || !routeAllowedForRole(state.route, state.profile.role)) {
      state.route = routeForProfile(state.profile);
    }
  }
  if (error) {
    state.authError = error.message;
  }
  authReady = true;
  render();

  supabase.auth.onAuthStateChange(async (_event, session) => {
    const userFromSession = session?.user || null;
    const nextProfile = await profileWithDatabaseRole(userFromSession);
    state = loadState(userFromSession);
    state.confirmSignOut = false;
    state.futureFeatureMessage = "";
    if (userFromSession) {
      state.profile = nextProfile || state.profile;
      state.route = state.route === "signin" || !routeAllowedForRole(state.route, state.profile.role) ? routeForProfile(state.profile) : state.route;
    } else {
      state.route = "signin";
    }
    render();
  });
}

updateStatusTime();
setInterval(updateStatusTime, 30000);
initAuth();
