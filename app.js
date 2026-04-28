import { createClient } from "@supabase/supabase-js";

const STORAGE_PREFIX = "intaliq-prototype-state";
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
  sessionMode: "join",
  user: null,
  profile: {
    name: "Yara",
    email: "yara@example.com",
    major: "Software Engineering",
    year: "Junior",
    bio: "Focused on building better study routines.",
  },
  goals: [
    {
      id: crypto.randomUUID(),
      title: "Finish SE365 prototype",
      category: "Project",
      due: "This week",
      progress: 65,
      checkpoints: ["Sketch flow", "Build screens", "Test session", "Connect data"],
      completed: 2,
    },
    {
      id: crypto.randomUUID(),
      title: "Practice data structures",
      category: "Study",
      due: "April",
      progress: 40,
      checkpoints: ["Arrays", "Trees", "Graphs", "Mock quiz"],
      completed: 1,
    },
  ],
  sessions: [
    {
      id: "S365",
      title: "SE365 Sprint Room",
      type: "Project",
      date: "Today",
      time: "7:30 PM",
      capacity: 6,
      members: ["Yara", "Lama", "Noura"],
      notes: "Prototype walkthrough, issues list, and goal check-in.",
    },
    {
      id: "DS20",
      title: "Algorithms Review",
      type: "Study",
      date: "Tomorrow",
      time: "5:00 PM",
      capacity: 5,
      members: ["Faisal", "Yara"],
      notes: "Graph traversal and practice questions.",
    },
  ],
  joinedSessions: ["S365"],
};

let state = loadState();

const app = document.querySelector("#app");
let authReady = false;

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

function publicUser(user) {
  if (!user) return null;
  return { id: user.id, email: user.email };
}

function profileFromUser(user) {
  if (!user) return null;
  const meta = user.user_metadata || {};
  return {
    name: meta.name || meta.full_name || user.email?.split("@")[0] || "Student",
    email: user.email || "",
    major: meta.major || "Software Engineering",
    year: meta.year || "Junior",
    bio: meta.bio || "Focused on building better study routines.",
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
  if (!authReady) {
    app.innerHTML = `<div class="brand-screen"><div class="mark">I</div><p class="tagline">Loading Intaliq...</p></div>`;
    return;
  }

  const protectedRoutes = ["home", "goals", "sessions", "profile", "goal-form", "session-form", "session-detail"];
  if (protectedRoutes.includes(state.route) && !state.user) {
    state.route = "signin";
  }

  const views = {
    signin: signInView,
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

function signInView() {
  const isSignup = state.authMode === "signup";
  const setupNotice = hasSupabaseConfig
    ? ""
    : `<div class="notice danger-box">Supabase is not configured yet. Add your project URL and anon key to <strong>.env.local</strong>, then restart the local server.</div>`;
  const message = state.authMessage ? `<div class="notice">${state.authMessage}</div>` : "";
  const error = state.authError ? `<div class="notice danger-box">${state.authError}</div>` : "";

  return `
    <div class="brand-screen">
      <div>
        <div class="mark">I</div>
        <h1 class="brand-title">Intaliq</h1>
        <p class="tagline">Launch your goals with focused peer sessions.</p>
      </div>
      <form class="card stack" data-form="auth">
        <div class="segmented">
          <button type="button" class="${!isSignup ? "active" : ""}" data-action="auth-signin">Sign in</button>
          <button type="button" class="${isSignup ? "active" : ""}" data-action="auth-signup">Create account</button>
        </div>
        ${setupNotice}
        ${message}
        ${error}
        ${isSignup ? `
          <label class="field">
            <span>Name</span>
            <input class="input" name="name" type="text" value="${state.profile.name}" required />
          </label>
        ` : ""}
        <label class="field">
          <span>Email</span>
          <input class="input" name="email" type="email" value="${state.profile.email}" required />
        </label>
        <label class="field">
          <span>Password</span>
          <input class="input" name="password" type="password" minlength="6" autocomplete="${isSignup ? "new-password" : "current-password"}" required />
        </label>
        <button class="btn btn-primary" type="submit" ${!hasSupabaseConfig || state.authLoading ? "disabled" : ""}>
          ${state.authLoading ? "Please wait..." : isSignup ? "Create account" : "Sign in"}
        </button>
      </form>
    </div>
  `;
}

function onboardingView() {
  return page("Set your first goal", "Tell Intaliq what you want to move forward.", `
    <form class="stack" data-form="onboarding">
      ${goalFields({ title: "", category: "Study", due: "This week", progress: 0, checkpoints: ["", "", "", ""] })}
      <button class="btn btn-primary" type="submit">Save goal</button>
      ${button("Skip for now", "btn-ghost", "skip-onboarding")}
    </form>
  `);
}

function homeView() {
  const nextSession = state.sessions.find((session) => state.joinedSessions.includes(session.id));
  const activeGoal = state.goals[0];
  return withTabs("home", `
    <div class="stack">
      <div class="profile-row">
        <div class="avatar">${initials(state.profile.name)}</div>
        <div>
          <h1 class="page-title">Hi, ${state.profile.name.split(" ")[0]}</h1>
          <div class="subtle">${state.profile.major} · ${state.profile.year}</div>
        </div>
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
        ${nextSession ? sessionCard(nextSession) : `<div class="empty">Join or create a session to study with peers.</div>`}
      </section>
    </div>
  `);
}

function goalsView() {
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
  return page("New goal", "Set a measurable goal and checkpoint flags.", `
    <form class="stack" data-form="goal">
      ${goalFields({ title: "", category: "Study", due: "This week", progress: 0, checkpoints: ["", "", "", ""] })}
      <button class="btn btn-primary" type="submit">Create goal</button>
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
      ${(state.sessionMode === "join" ? open : joined).map((session) => sessionCard(session)).join("") || `<div class="empty">No sessions in this list.</div>`}
    </div>
  `);
}

function sessionFormView() {
  return page("Create session", "Open a focused room around one goal or topic.", `
    <form class="stack" data-form="session">
      <label class="field"><span>Title</span><input class="input" name="title" placeholder="Capstone planning" required /></label>
      <label class="field"><span>Type</span><select class="select" name="type"><option>Study</option><option>Project</option><option>Career</option><option>Wellbeing</option></select></label>
      <div class="grid-2">
        <label class="field"><span>Date</span><input class="input" name="date" value="Today" required /></label>
        <label class="field"><span>Time</span><input class="input" name="time" value="6:00 PM" required /></label>
      </div>
      <label class="field"><span>Capacity</span><input class="input" name="capacity" type="number" min="2" max="20" value="6" required /></label>
      <label class="field"><span>Notes</span><textarea class="textarea" name="notes" placeholder="What will the session focus on?"></textarea></label>
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
  return withTabs("profile", `
    <div class="topbar">
      <h1>Profile</h1>
      <button class="btn-link danger" data-action="signout">Sign out</button>
    </div>
    <form class="stack" data-form="profile">
      ${message}
      ${error}
      <div class="profile-row card">
        <div class="avatar">${initials(state.profile.name)}</div>
        <div>
          <strong>${state.profile.name}</strong>
          <div class="subtle">${state.profile.email}</div>
        </div>
      </div>
      <label class="field"><span>Name</span><input class="input" name="name" value="${state.profile.name}" required /></label>
      <label class="field"><span>Email</span><input class="input" name="email" type="email" value="${state.profile.email}" required /></label>
      <label class="field"><span>Major</span><input class="input" name="major" value="${state.profile.major}" /></label>
      <label class="field"><span>Year</span><select class="select" name="year">${["Freshman", "Sophomore", "Junior", "Senior", "Graduate"].map((year) => `<option ${year === state.profile.year ? "selected" : ""}>${year}</option>`).join("")}</select></label>
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
  return `
    ${body}
    <nav class="tabs" aria-label="Primary">
      ${tab("home", "H", "Home", active)}
      ${tab("goals", "G", "Goals", active)}
      ${tab("sessions", "S", "Sessions", active)}
      ${tab("profile", "P", "Profile", active)}
    </nav>
  `;
}

function tab(route, icon, label, active) {
  return `<button class="tab ${active === route ? "active" : ""}" data-route="${route}"><strong>${icon}</strong><span>${label}</span></button>`;
}

function goalFields(goal) {
  return `
    <label class="field"><span>Goal title</span><input class="input" name="title" value="${goal.title}" required /></label>
    <div class="grid-2">
      <label class="field"><span>Category</span><select class="select" name="category">${["Study", "Project", "Career", "Wellbeing"].map((category) => `<option ${category === goal.category ? "selected" : ""}>${category}</option>`).join("")}</select></label>
      <label class="field"><span>Due</span><input class="input" name="due" value="${goal.due}" required /></label>
    </div>
    <label class="field"><span>Progress</span><input class="input" name="progress" type="number" min="0" max="100" value="${goal.progress}" /></label>
    ${[0, 1, 2, 3].map((index) => `<label class="field"><span>Checkpoint ${index + 1}</span><input class="input" name="checkpoint${index}" value="${goal.checkpoints[index] || ""}" /></label>`).join("")}
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
      <div class="subtle">${session.members.length}/${session.capacity} students · Code ${session.id}</div>
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

  if (type === "onboarding" || type === "goal") {
    const goal = makeGoal(data);
    setState({ goals: [goal, ...state.goals], route: type === "onboarding" ? "home" : "goals" });
  }

  if (type === "session") {
    const id = data.title
      .replace(/[^a-z0-9]/gi, "")
      .slice(0, 4)
      .toUpperCase()
      .padEnd(4, "X");
    const session = {
      id,
      title: data.title,
      type: data.type,
      date: data.date,
      time: data.time,
      capacity: Number(data.capacity),
      members: [state.profile.name],
      notes: data.notes || "Focused work session.",
    };
    setState({
      sessions: [session, ...state.sessions.filter((item) => item.id !== id)],
      joinedSessions: [...new Set([id, ...state.joinedSessions])],
      activeSessionId: id,
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

  const email = data.email.trim();
  const password = data.password;
  const isSignup = state.authMode === "signup";

  const response = isSignup
    ? await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: { name: data.name || email.split("@")[0] },
        },
      })
    : await supabase.auth.signInWithPassword({ email, password });

  if (response.error) {
    setState({ authLoading: false, authError: response.error.message, authMessage: "" });
    return;
  }

  if (isSignup && !response.data.session) {
    setState({
      authLoading: false,
      authMode: "signin",
      authError: "",
      authMessage: "Account created. Check your email to confirm it, then sign in.",
    });
    return;
  }

  const user = response.data.user;
  state = loadState(user);
  setState({
    user: publicUser(user),
    profile: profileFromUser(user),
    route: state.goals.length ? "home" : "onboarding",
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
        major: nextProfile.major,
        year: nextProfile.year,
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
    render();
    return;
  }

  const { data, error } = await supabase.auth.getSession();
  const user = data.session?.user || null;
  state = loadState(user);
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

initAuth();
