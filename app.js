import { createClient } from "@supabase/supabase-js";

const STORAGE_PREFIX = "intaliq-app-state-v2";
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
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
  sessions: [],
  joinedSessions: [],
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
  return {
    ...structuredClone(seedState),
    ...JSON.parse(saved),
    user: user ? publicUser(user) : null,
    profile: profile || { ...structuredClone(seedState).profile, ...JSON.parse(saved).profile },
  };
}

function saveState() {
  localStorage.setItem(userStorageKey(state.user?.id), JSON.stringify(state));
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
  return Object.fromEntries(new FormData(form).entries());
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

function render() {
  phone?.classList.toggle("auth-phone", (state.route === "signin" || state.route === "verify") && !state.user);

  if (!authReady) {
    app.innerHTML = `<div class="brand-screen"><img class="brand-logo" src="/favicon.svg" alt="Intaliq" /><p class="tagline">Loading Intaliq...</p></div>`;
    return;
  }

  const protectedRoutes = ["home", "goals", "sessions", "profile", "goal-form", "session-form", "session-detail"];
  if (protectedRoutes.includes(state.route) && !state.user) {
    state.route = "signin";
  }

  const views = {
    signin: signInView,
    verify: verifyView,
    onboarding: onboardingView,
    home: homeView,
    goals: goalsView,
    sessions: sessionsView,
    profile: profileView,
    "goal-form": goalFormView,
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
        <div class="auth-role-toggle" role="group" aria-label="Account type">
          <button type="button" class="${selectedRole === "member" ? "active" : ""}" data-action="role-member">User</button>
          <button type="button" class="${selectedRole === "coach" ? "active" : ""}" data-action="role-coach">Coach</button>
        </div>
        ${setupNotice}
        ${message}
        ${error}
        ${isSignup ? `
          <label class="field">
            <span>Name</span>
            <input class="input auth-input" name="name" type="text" value="${state.profile.name}" required />
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
  return page(isCoach ? "Create your first session" : "Set your first goal", isCoach ? "Start by opening a workout session for clients." : "Tell Intaliq what you want to move forward.", `
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
  const nextSession = state.sessions.find((session) => state.joinedSessions.includes(session.id));
  const activeGoal = state.goals[0];
  const firstName = state.profile.name.split(" ")[0] || "there";
  const profileLine = [state.profile.primaryGoal, state.profile.fitnessLevel].filter(Boolean).join(" · ") || "Complete your fitness profile";
  return withTabs("home", `
    <div class="stack">
      <div class="home-header">
        <div class="profile-row">
          <div class="avatar">${initials(state.profile.name || "User")}</div>
          <div>
            <h1 class="page-title">Hi, ${firstName}</h1>
            <div class="subtle">${profileLine}</div>
          </div>
        </div>
        <button class="icon-btn" data-action="signout" title="Log out">Log out</button>
      </div>
      <div class="metric-row">
        <div class="metric"><b>${state.goals.length}</b><span>Goals</span></div>
        <div class="metric"><b>${state.joinedSessions.length}</b><span>Sessions</span></div>
        <div class="metric"><b>${averageProgress()}%</b><span>Progress</span></div>
      </div>
      <section class="card stack">
        <div class="goal-head">
          <h2 class="page-title">Current goal</h2>
          ${button("Add", "btn-link", "new-goal")}
        </div>
        ${activeGoal ? goalCard(activeGoal, true) : `<div class="empty">Add a goal to start tracking checkpoints.</div>`}
      </section>
      <section class="card stack">
        <div class="goal-head">
          <h2 class="page-title">Next session</h2>
          ${button("Browse", "btn-link", "sessions")}
        </div>
        ${nextSession ? sessionCard(nextSession) : `<div class="empty">Join a workout session or create your own training group.</div>`}
      </section>
    </div>
  `);
}

function coachHomeView() {
  const firstName = state.profile.name.split(" ")[0] || "coach";
  const upcoming = state.sessions[0];
  return withTabs("home", `
    <div class="stack">
      <div class="home-header">
        <div class="profile-row">
          <div class="avatar">${initials(state.profile.name || "Coach")}</div>
          <div>
            <h1 class="page-title">Hi, ${firstName}</h1>
            <div class="subtle">${state.profile.specialty || "Coach profile"}</div>
          </div>
        </div>
        <button class="icon-btn" data-action="signout" title="Log out">Log out</button>
      </div>
      <div class="metric-row">
        <div class="metric"><b>${state.sessions.length}</b><span>Sessions</span></div>
        <div class="metric"><b>${state.joinedSessions.length}</b><span>Clients</span></div>
        <div class="metric"><b>${state.goals.length}</b><span>Plans</span></div>
      </div>
      <section class="card stack">
        <div class="goal-head">
          <h2 class="page-title">Upcoming class</h2>
          ${button("Create", "btn-link", "new-session")}
        </div>
        ${upcoming ? sessionCard(upcoming) : `<div class="empty">Create your first coaching session for users to join.</div>`}
      </section>
      <section class="card stack">
        <div class="goal-head">
          <h2 class="page-title">Training plan</h2>
          ${button("Add", "btn-link", "new-goal")}
        </div>
        ${state.goals[0] ? goalCard(state.goals[0], true) : `<div class="empty">Add a plan template or milestone for your clients.</div>`}
      </section>
    </div>
  `);
}

function goalsView() {
  const isCoach = state.profile.role === "coach";
  return withTabs("goals", `
    <div class="topbar">
      <h1>${isCoach ? "Plans" : "Goals"}</h1>
      ${button(isCoach ? "+ Plan" : "+ Goal", "btn-primary", "new-goal")}
    </div>
    <div class="stack">
      ${state.goals.length ? state.goals.map((goal) => goalCard(goal)).join("") : `<div class="empty">${isCoach ? "No training plans yet." : "No goals yet."}</div>`}
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

function sessionsView() {
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
  const joined = state.joinedSessions.includes(session.id);
  return page(session.title, `${session.date} · ${session.time}`, `
    <div class="stack">
      <div class="card stack">
        <div class="session-head">
          <h3>${session.type}</h3>
          <span class="pill ${joined ? "" : "warn"}">${joined ? "Joined" : "Open"}</span>
        </div>
        <p class="subtle">${session.notes}</p>
        <div class="metric-row">
          <div class="metric"><b>${session.members.length}</b><span>Joined</span></div>
          <div class="metric"><b>${session.capacity}</b><span>Seats</span></div>
          <div class="metric"><b>${session.id}</b><span>Code</span></div>
        </div>
      </div>
      <div class="card">
        ${session.members.map((member) => `<div class="list-row"><span>${member}</span><span class="pill gray">member</span></div>`).join("")}
      </div>
      ${joined ? button("Leave session", "btn-ghost", "leave-session", `data-id="${session.id}"`) : button("Join session", "btn-primary", "join-session", `data-id="${session.id}"`)}
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
    <div class="view-with-tabs">
      <div class="tab-content">${body}</div>
      <nav class="tabs" aria-label="Primary">
        ${tab("home", "H", "Home", active)}
        ${tab("goals", "G", isCoach ? "Plans" : "Goals", active)}
        ${tab("sessions", "S", "Sessions", active)}
        ${tab("profile", "P", "Profile", active)}
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
  return `
    <article class="session-card">
      <div class="session-head">
        <div>
          <h3>${session.title}</h3>
          <div class="subtle">${session.date} · ${session.time}</div>
        </div>
        <span class="pill ${joined ? "" : "warn"}">${joined ? "Joined" : session.type}</span>
      </div>
      <div class="subtle">${session.members.length}/${session.capacity} people · Code ${session.id}</div>
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
    date: data.date,
    time: data.time,
    capacity: Number(data.capacity),
    members: [state.profile.name || "Host"],
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
    "auth-signin": () => setState({ authMode: "signin", authError: "", authMessage: "" }),
    "auth-signup": () => setState({ authMode: "signup", authError: "", authMessage: "" }),
    "role-member": () => setState({ profile: { ...state.profile, role: "member" }, authError: "", authMessage: "" }),
    "role-coach": () => setState({ profile: { ...state.profile, role: "coach" }, authError: "", authMessage: "" }),
    "back-to-login": () => setState({ route: "signin", authMode: "signin", authError: "", authMessage: "" }),
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
    "join-session": () => joinSession(data.id),
    "leave-session": () => leaveSession(data.id),
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
}

async function handleAuth(data) {
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

  const credentials = { email: emailResult.email, password };

  const response = isSignup
    ? await supabase.auth.signUp({
        ...credentials,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            name: data.name || emailResult.email.split("@")[0],
            role: data.role === "coach" ? "coach" : "member",
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
    await sendEmailOtp(emailResult.email, data.role, data.name || emailResult.email.split("@")[0]);
    return;
  }

  if (!isSignup) {
    const verifiedUser = response.data.user;
    await supabase.auth.signOut();
    await sendEmailOtp(
      emailResult.email,
      verifiedUser?.user_metadata?.role || data.role,
      verifiedUser?.user_metadata?.name || data.name || emailResult.email.split("@")[0],
    );
    return;
  }

  setState({ authLoading: false, authError: "Unable to continue. Please try again.", authMessage: "" });
}

async function sendEmailOtp(email, role = state.profile.role, name = state.profile.name) {
  if (!supabase) return;

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      data: {
        name: name || email.split("@")[0],
        role: role === "coach" ? "coach" : "member",
      },
    },
  });

  if (error) {
    if (/confirm|verified|not found|signup/i.test(error.message)) {
      setState({
        authLoading: false,
        route: "verify",
        pendingEmail: email,
        pendingVerificationRole: role === "coach" ? "coach" : "member",
        pendingVerificationName: name || email.split("@")[0],
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
    pendingVerificationRole: role === "coach" ? "coach" : "member",
    pendingVerificationName: name || email.split("@")[0],
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
  await sendEmailOtp(state.pendingEmail, state.pendingVerificationRole, state.pendingVerificationName);
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

  const response = await supabase.auth.verifyOtp({
    email: state.pendingEmail,
    token,
    type: "email",
  });

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
