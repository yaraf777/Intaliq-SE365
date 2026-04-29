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
  pendingEmail: "",
  pendingVerificationRole: "member",
  pendingVerificationName: "",
  pendingFitnessLevel: "Beginner",
  pendingPrimaryGoal: "",
  pendingSpecialty: "",
  sessionMode: "join",
  user: null,
  profile: {
    name: "",
    email: "",
    role: "member",
    fitnessLevel: "Beginner",
    primaryGoal: "",
    specialty: "",
    bio: "",
  },
  goals: [],
  activities: [],
  sessions: [],
  joinedSessions: [],
  partners: [],
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
  return {
    ...structuredClone(seedState),
    ...parsed,
    user: user ? publicUser(user) : null,
    profile: profile || { ...structuredClone(seedState).profile, ...parsed.profile },
    authLoading: false,
  };
}

function saveState() {
  const persistedState = { ...state, authLoading: false };
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

function formData(form) {
  const values = Object.fromEntries(new FormData(form).entries());
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

function profileFromUser(user) {
  if (!user) return null;
  const meta = user.user_metadata || {};
  return {
    name: meta.name || meta.full_name || user.email?.split("@")[0] || "User",
    email: user.email || meta.email || "",
    role: meta.role === "coach" ? "coach" : "member",
    fitnessLevel: meta.fitnessLevel || "Beginner",
    primaryGoal: meta.primaryGoal || "",
    specialty: meta.specialty || "",
    bio: meta.bio || "",
  };
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

  const protectedRoutes = ["home", "activities", "goals", "sessions", "partners", "profile", "goal-form", "activity-form", "session-form", "session-detail"];
  if (protectedRoutes.includes(state.route) && !state.user) {
    state.route = "signin";
  }

  const views = {
    signin: signInView,
    verify: verifyView,
    onboarding: onboardingView,
    home: homeView,
    activities: activitiesView,
    goals: goalsView,
    sessions: sessionsView,
    partners: partnersView,
    profile: profileView,
    "goal-form": goalFormView,
    "activity-form": activityFormView,
    "session-form": sessionFormView,
    "session-detail": sessionDetailView,
  };

  app.innerHTML = (views[state.route] || signInView)();
  bindEvents();
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
          `}
          <label class="field">
            <span>Fitness level</span>
            <select class="select auth-input" name="fitnessLevel">
              ${["Beginner", "Intermediate", "Advanced"].map((level) => `<option ${level === state.profile.fitnessLevel ? "selected" : ""}>${level}</option>`).join("")}
            </select>
          </label>
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
  return page(isCoach ? "Create your first session" : "Set your first goal", isCoach ? "Start by opening a workout session for users." : "Tell Intaliq what you want to move forward.", `
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
  return `
    <article class="member-goal-card">
      <div class="member-goal-head">
        <div class="session-mark">${interestIcon(goal.category === "Cardio" ? "Running" : "Cycling")}</div>
        <div>
          <h3>${goal.title}</h3>
          <p>Due: ${goal.due}</p>
        </div>
        <span>${goal.progress}%</span>
      </div>
      <p>Progress</p>
      <div class="member-progress" style="--value: ${goal.progress}%"><span></span></div>
    </article>
  `;
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
        ${coachStat("Active Sessions", activeSessions || state.sessions.length, "")}
        ${coachStat("Total Members", Math.max(totalMembers, state.partners.length), "↑ 12%")}
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
            <span>Create a new session to start admitting users and sharing announcements.</span>
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
  return `
    <article class="coach-session-card" data-action="session-detail" data-id="${session.id}">
      <div class="session-mark">${interestIcon(session.type === "Cardio" ? "Running" : "Cycling")}</div>
      <div class="coach-session-main">
        <div class="coach-session-title">
          <h3>${session.title}</h3>
          <span>${session.level || "All levels"}</span>
        </div>
        <p>Coach ${state.profile.name || "Intaliq"}</p>
        <p>${session.date} at ${session.time}</p>
        <p>${session.notes || "Focused workout session."}</p>
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

  return withTabs("goals", `
    <div class="topbar">
      <h1>Goals</h1>
      ${button("+ Goal", "btn-primary", "new-goal")}
    </div>
    <div class="stack">
      ${state.goals.length ? state.goals.map((goal) => goalCard(goal)).join("") : `<div class="empty">No goals yet.</div>`}
    </div>
  `);
}

function goalFormView() {
  const isCoach = state.profile.role === "coach";
  return page(isCoach ? "New training plan" : "New goal", isCoach ? "Create a plan template with client checkpoints." : "Set a measurable goal and checkpoint flags.", `
    <form class="stack" data-form="goal">
      ${goalFields({ title: "", category: "Strength", due: "This week", progress: 0, checkpoints: ["", "", "", ""] })}
      <button class="btn btn-primary" type="submit">${isCoach ? "Create plan" : "Create goal"}</button>
      ${button("Back", "btn-ghost", "goals")}
    </form>
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

  const joined = state.sessions.filter((session) => state.joinedSessions.includes(session.id));
  const open = state.sessions.filter((session) => !state.joinedSessions.includes(session.id));
  return withTabs("sessions", `
    <div class="topbar">
      <h1>Sessions</h1>
      ${button("+ Session", "btn-primary", "new-session")}
    </div>
    <div class="segmented">
      <button class="${state.sessionMode === "join" ? "active" : ""}" data-action="mode-join">Join</button>
      <button class="${state.sessionMode === "mine" ? "active" : ""}" data-action="mode-mine">Mine</button>
    </div>
    <div class="stack" style="margin-top: 12px;">
      ${(state.sessionMode === "join" ? open : joined).map((session) => sessionCard(session)).join("") || `<div class="empty">${state.sessionMode === "join" ? "No open sessions yet. Create the first one." : "You have not joined any sessions yet."}</div>`}
    </div>
  `);
}

function sessionFormView() {
  return page("Create session", state.profile.role === "coach" ? "Schedule a coaching session for users to join." : "Open a focused workout around one goal or topic.", `
    <form class="stack" data-form="session">
      ${sessionFields()}
      <button class="btn btn-primary" type="submit">Create session</button>
      ${button("Back", "btn-ghost", "sessions")}
    </form>
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
  const message = state.authMessage ? `<div class="notice">${state.authMessage}</div>` : "";
  const error = state.authError ? `<div class="notice danger-box">${state.authError}</div>` : "";
  const isCoach = state.profile.role === "coach";
  return withTabs("profile", `
    <div class="topbar">
      <h1>Profile</h1>
      <button class="btn-link danger" data-action="signout">Sign out</button>
    </div>
    <form class="stack" data-form="profile">
      ${message}
      ${error}
      <div class="profile-row card">
        <div class="avatar">${initials(state.profile.name || (isCoach ? "Coach" : "User"))}</div>
        <div>
          <strong>${state.profile.name || (isCoach ? "New coach" : "New user")}</strong>
          <div class="subtle">${isCoach ? "Coach" : "User"} · ${state.profile.email}</div>
        </div>
      </div>
      <label class="field"><span>Name</span><input class="input" name="name" value="${state.profile.name}" required /></label>
      <label class="field"><span>Email</span><input class="input" name="email" type="email" value="${state.profile.email}" required /></label>
      <label class="field"><span>Account type</span><select class="select" name="role">${["member", "coach"].map((role) => `<option value="${role}" ${role === state.profile.role ? "selected" : ""}>${role === "coach" ? "Coach" : "User"}</option>`).join("")}</select></label>
      ${isCoach
        ? `<label class="field"><span>Specialty</span><input class="input" name="specialty" value="${state.profile.specialty}" placeholder="Strength, mobility, nutrition" /></label>`
        : `<label class="field"><span>Primary goal</span><input class="input" name="primaryGoal" value="${state.profile.primaryGoal}" placeholder="Build strength, lose weight, run 5K" /></label>`}
      <label class="field"><span>Fitness level</span><select class="select" name="fitnessLevel">${["Beginner", "Intermediate", "Advanced"].map((level) => `<option ${level === state.profile.fitnessLevel ? "selected" : ""}>${level}</option>`).join("")}</select></label>
      <label class="field"><span>Bio</span><textarea class="textarea" name="bio">${state.profile.bio}</textarea></label>
      <button class="btn btn-primary" type="submit">Update profile</button>
    </form>
  `);
}

function partnersView() {
  if (state.profile.role === "coach") {
    return withTabs("partners", `
      <div class="topbar coach-page-topbar">
        <h1>Announce</h1>
        ${button("+ Session", "btn-primary", "new-session")}
      </div>
      <div class="stack">
        ${state.sessions.length ? state.sessions.map((session) => `
          <form class="coach-announcement-card" data-form="announcement">
            <div>
              <h3>${session.title}</h3>
              <p>${session.date} at ${session.time} · ${session.members.length}/${session.capacity} enrolled</p>
            </div>
            <label class="field">
              <span>Message</span>
              <textarea class="textarea" name="announcement" placeholder="Share an update with this session"></textarea>
            </label>
            <input type="hidden" name="sessionId" value="${session.id}" />
            <button class="coach-action primary" type="submit">Post Announcement</button>
            ${(session.announcements || []).length ? `
              <div class="coach-posted-list">
                ${(session.announcements || []).map((item) => `<span>${item}</span>`).join("")}
              </div>
            ` : ""}
          </form>
        `).join("") : `<div class="coach-empty"><strong>No sessions yet.</strong><span>Create a session before posting announcements.</span></div>`}
      </div>
    `);
  }

  const suggested = state.profile.role === "coach"
    ? [
        { name: "Maha", role: "User", detail: "Intermediate · Strength goals" },
        { name: "Omar", role: "Coach", detail: "Mobility coach · Open to co-hosting" },
        { name: "Noura", role: "User", detail: "Beginner · Needs accountability" },
      ]
    : [
        { name: "Lina", role: "User", detail: "Beginner · Morning workouts" },
        { name: "Fahad", role: "Coach", detail: "Strength coach · Small groups" },
        { name: "Sara", role: "User", detail: "Intermediate · Running partner" },
      ];

  return withTabs("partners", `
    <div class="topbar">
      <h1>Partners</h1>
    </div>
    <div class="stack">
      ${suggested.map((partner) => `
        <article class="session-card">
          <div class="session-head">
            <div>
              <h3>${partner.name}</h3>
              <div class="subtle">${partner.detail}</div>
            </div>
            <span class="pill">${partner.role}</span>
          </div>
          <button class="btn btn-primary" data-action="connect-partner" data-name="${partner.name}">Connect</button>
        </article>
      `).join("")}
      ${state.partners.length ? `<div class="card stack"><h3>Connected</h3>${state.partners.map((name) => `<div class="list-row"><span>${name}</span><span class="pill gray">connected</span></div>`).join("")}</div>` : ""}
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
            ${tab("home", "⌂", "Home", active)}
            ${tab("sessions", "●●●", "Sessions", active)}
            ${tab("goals", "↟", "Admissions", active)}
            ${tab("partners", "◔", "Announce", active)}
            ${tab("profile", "•••", "More", active)}
          `
          : `
            ${tab("home", "⌂", "Home", active)}
            ${tab("activities", "↟", "Activities", active)}
            ${tab("sessions", "●●●", "Sessions", active)}
            ${tab("goals", "◎", "Goals", active)}
            ${tab("profile", "•••", "More", active)}
          `}
      </nav>
    </div>
  `;
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

function sessionFields() {
  return `
    <label class="field"><span>Title</span><input class="input" name="title" placeholder="${state.profile.role === "coach" ? "Strength fundamentals" : "Saturday run group"}" required /></label>
    <label class="field"><span>Type</span><select class="select" name="type"><option>Strength</option><option>Cardio</option><option>Mobility</option><option>HIIT</option><option>Yoga</option><option>Nutrition</option></select></label>
    <div class="grid-2">
      <label class="field"><span>Level</span><select class="select" name="level"><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label>
      <label class="field"><span>Admission</span><select class="select" name="admission"><option>Open</option><option>Approval required</option></select></label>
    </div>
    <div class="grid-2">
      <label class="field"><span>Date</span><input class="input" name="date" value="Today" required /></label>
      <label class="field"><span>Time</span><input class="input" name="time" value="6:00 PM" required /></label>
    </div>
    <label class="field"><span>Capacity</span><input class="input" name="capacity" type="number" min="2" max="20" value="6" required /></label>
    <label class="field"><span>Notes</span><textarea class="textarea" name="notes" placeholder="What will the session focus on?"></textarea></label>
  `;
}

function goalCard(goal, compact = false) {
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
    members: [state.profile.name || "Host"],
    pendingApplicants: data.admission === "Approval required" ? ["A new user"] : [],
    announcements: [],
    notes: data.notes || "Focused workout session.",
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
      await handleForm(form.dataset.form, formData(form));
    });
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
    sessions: () => navigate("sessions"),
    "new-goal": () => navigate("goal-form"),
    "new-session": () => navigate("session-form"),
    "mode-join": () => setState({ sessionMode: "join" }),
    "mode-mine": () => setState({ sessionMode: "mine" }),
    "session-detail": () => setState({ activeSessionId: data.id, route: "session-detail" }),
    "log-activity": () => navigate("activity-form"),
    "set-goal": () => navigate("goal-form"),
    "find-session": () => navigate("sessions"),
    "ai-coach": () => navigate("partners"),
    "review-requests": () => {
      const target = state.sessions.find((session) => session.pendingApplicants?.length) || state.sessions[0];
      setState(target ? { activeSessionId: target.id, route: "session-detail" } : { route: "sessions" });
    },
    "make-announcement": () => {
      const target = state.sessions[0];
      setState(target ? { activeSessionId: target.id, route: "session-detail" } : { route: "session-form" });
    },
    "join-session": () => joinSession(data.id),
    "leave-session": () => leaveSession(data.id),
    "admit-user": () => admitUser(data.id, data.name),
    "connect-partner": () => connectPartner(data.name),
    "advance-goal": () => advanceGoal(data.id),
    signout: () => signOut(),
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
      const session = makeSession(data);
      setState({
        sessions: [session, ...state.sessions.filter((item) => item.id !== session.id)],
        joinedSessions: [...new Set([session.id, ...state.joinedSessions])],
        activeSessionId: session.id,
        route: "home",
      });
      return;
    }

    const goal = makeGoal(data);
    setState({ goals: [goal, ...state.goals], route: type === "onboarding" ? "home" : "goals" });
  }

  if (type === "activity") {
    const activity = makeActivity(data);
    setState({ activities: [activity, ...state.activities], route: "home", authMessage: "Activity logged successfully." });
  }

  if (type === "session") {
    const session = makeSession(data);
    setState({
      sessions: [session, ...state.sessions.filter((item) => item.id !== session.id)],
      joinedSessions: [...new Set([session.id, ...state.joinedSessions])],
      activeSessionId: session.id,
      route: "session-detail",
    });
  }

  if (type === "profile") {
    await updateProfile(data);
  }

  if (type === "announcement") {
    addAnnouncement(data.sessionId, data.announcement);
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
    await supabase.auth.signOut();
    await sendEmailOtp(
      emailResult.email,
      {
        role: verifiedUser?.user_metadata?.role || "member",
        name: verifiedUser?.user_metadata?.name || emailResult.email.split("@")[0],
        fitnessLevel: verifiedUser?.user_metadata?.fitnessLevel || "Beginner",
        primaryGoal: verifiedUser?.user_metadata?.primaryGoal || "",
        specialty: verifiedUser?.user_metadata?.specialty || "",
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

  state = loadState(finalUser);
  setState({
    user: publicUser(finalUser),
    profile: profileFromUser(finalUser),
    route: state.profile.role === "coach" ? (state.sessions.length ? "home" : "onboarding") : (state.goals.length ? "home" : "onboarding"),
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
  setState({ user: null, route: "signin", authMode: "signin", authError: "", authMessage: "Signed out." });
}

async function updateProfile(data) {
  const nextProfile = { ...state.profile, ...data };
  if (supabase && state.user) {
    const update = {
      data: {
        name: nextProfile.name,
        role: nextProfile.role,
        fitnessLevel: nextProfile.fitnessLevel,
        primaryGoal: nextProfile.primaryGoal,
        specialty: nextProfile.specialty,
        bio: nextProfile.bio,
      },
    };

    if (nextProfile.email !== state.profile.email) {
      update.email = nextProfile.email;
    }

    const { error } = await supabase.auth.updateUser(update);
    if (error) {
      setState({ authError: error.message });
      return;
    }
  }

  setState({
    profile: nextProfile,
    route: "profile",
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

function addAnnouncement(id, announcement) {
  const text = announcement.trim();
  if (!text) return;
  const sessions = state.sessions.map((session) => {
    if (session.id !== id) return session;
    return { ...session, announcements: [text, ...(session.announcements || [])] };
  });
  setState({ sessions, activeSessionId: id, route: "session-detail" });
}

function connectPartner(name) {
  setState({ partners: [...new Set([name, ...state.partners])] });
}

function advanceGoal(id) {
  const goals = state.goals.map((goal) => {
    if (goal.id !== id) return goal;
    const completed = Math.min(goal.checkpoints.length, goal.completed + 1);
    const progress = Math.max(goal.progress, Math.round((completed / goal.checkpoints.length) * 100));
    return { ...goal, completed, progress };
  });
  setState({ goals });
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
  state = loadState(user);
  if (!user) {
    state.route = "signin";
    state.authMode = "signin";
  } else if (state.route === "signin") {
    state.route = state.profile.role === "coach" ? (state.sessions.length ? "home" : "onboarding") : (state.goals.length ? "home" : "onboarding");
  }
  if (error) {
    state.authError = error.message;
  }
  authReady = true;
  render();

  supabase.auth.onAuthStateChange((_event, session) => {
    const userFromSession = session?.user || null;
    state = loadState(userFromSession);
    state.route = userFromSession ? state.route === "signin" ? "home" : state.route : "signin";
    render();
  });
}

updateStatusTime();
setInterval(updateStatusTime, 30000);
initAuth();
