// Checks for everything users type before it's saved. Each check returns
// { field, message } for the first problem it finds, or null when the form is fine.
// Messages are plain English; i18n.js translates them, including the patterned ones.

export const ACTIVITY_TYPES = ["Running", "Cycling", "Hiking"];
export const FITNESS_LEVELS = ["Beginner", "Intermediate", "Advanced"];
export const GOAL_CATEGORIES = ["Strength", "Cardio", "Mobility", "Weight loss", "Nutrition", "Recovery"];
export const ACCESSIBILITY_OPTIONS = ["None", "Wheelchair-Friendly", "Elderly-Friendly"];
export const MIN_AGE = 13;
export const MAX_AGE = 120;

// Fastest believable average speed per activity, in km/h.
const MAX_SPEED_KMH = { Running: 30, Hiking: 15, Cycling: 80 };
const NAME_PATTERN = /^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u;

const problem = (field, message) => ({ field, message });

export function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addYears(date, years) {
  return new Date(date.getFullYear() + years, date.getMonth(), date.getDate());
}

// A real calendar date in yyyy-mm-dd form (rejects 2026-02-31 and 5-digit years).
function parseDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return isoDate(date) === value ? date : null;
}

export function birthdateLimits(today = new Date()) {
  return { min: isoDate(addYears(today, -MAX_AGE)), max: isoDate(addYears(today, -MIN_AGE)) };
}

export function birthdateProblem(value, { required = false } = {}) {
  if (!value) return required ? "Enter your date of birth." : "";
  if (!parseDate(value)) return "Enter a real date of birth.";
  const { min, max } = birthdateLimits();
  if (value > isoDate(new Date())) return "Your date of birth can't be in the future.";
  if (value > max) return `You need to be at least ${MIN_AGE} to use Intaliq.`;
  if (value < min) return "Enter a real date of birth.";
  return "";
}

export function emailProblem(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!email) return "Email is required.";
  if (email.length > 254 || email.includes("..") || !/^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(email)) {
    return "Enter a valid email address.";
  }
  return "";
}

export function passwordProblem(value) {
  if (!value || value.length < 8 || !/\p{L}/u.test(value) || !/\d/.test(value)) {
    return "Use at least 8 characters, with at least one letter and one number.";
  }
  if (value.length > 72) return "Passwords can be up to 72 characters.";
  return "";
}

// Free text: trimmed length, no HTML-breaking characters, and not just symbols.
export function textProblem(value, label, { min = 1, max = 100, required = true } = {}) {
  const text = String(value || "").trim();
  if (!text) return required ? `${label} is required.` : "";
  if (text.length < min || text.length > max) return `${label} must be ${min}-${max} characters.`;
  if (/[<>"]/.test(text)) return `${label} can't include <, > or ".`;
  if (!/[\p{L}\p{N}]/u.test(text)) return `${label} needs letters or numbers, not just symbols.`;
  return "";
}

function nameProblem(value) {
  const text = String(value || "").trim();
  return textProblem(text, "Full name", { min: 2, max: 60 })
    || (NAME_PATTERN.test(text) ? "" : "Enter your name using letters only.");
}

function numberProblem(value, label, { min, max, whole = false }) {
  const text = String(value ?? "").trim();
  if (!text) return `${label} is required.`;
  const number = Number(text);
  if (!Number.isFinite(number) || number < min || number > max || (whole && !Number.isInteger(number))) {
    return whole ? `${label} must be a whole number from ${min} to ${max}.` : `${label} must be a number from ${min} to ${max}.`;
  }
  return "";
}

function choiceProblem(value, options, label, { required = true } = {}) {
  if (!value) return required ? `Choose ${label}.` : "";
  return options.includes(value) ? "" : `Choose ${label}.`;
}

// Runs checks in order and returns the first failure.
function first(...checks) {
  for (const [field, message] of checks) {
    if (message) return problem(field, message);
  }
  return null;
}

function scheduleProblem(date, time) {
  const day = parseDate(date);
  const today = isoDate(new Date());
  if (!day) return ["date", "Choose a date for the session."];
  if (date < today) return ["date", "Choose today or a future date for the session."];
  if (date > isoDate(addYears(new Date(), 1))) return ["date", "Sessions can be scheduled up to a year ahead."];
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time || "")) return ["time", "Choose a time for the session."];
  if (new Date(`${date}T${time}`) < new Date()) return ["time", "Choose a future time for today's session."];
  return ["", ""];
}

export function validateForm(type, values, context = {}) {
  const { cities = [], nationalities = [], role = "member", authMode = "signin", ownSessionIds = [] } = context;

  if (type === "auth") {
    if (authMode !== "signup") {
      return first(["email", emailProblem(values.email)], ["password", values.password ? "" : "Password is required."]);
    }
    return first(
      ["name", nameProblem(values.name)],
      ["email", emailProblem(values.email)],
      ["password", passwordProblem(values.password)],
      ["confirmPassword", values.password === values.confirmPassword ? "" : "Passwords do not match."],
      values.role === "coach"
        ? ["coachSpecialty", values.specialty ? "" : "Tell us your coaching specialty."]
        : ["interests", values.primaryGoal ? "" : "Choose at least one fitness interest."],
      values.role === "coach" ? ["", ""] : ["fitnessLevel", choiceProblem(values.fitnessLevel, FITNESS_LEVELS, "a fitness level")],
    );
  }

  if (type === "verify-email") {
    return first(["token", /^\d{6}$/.test(String(values.token || "").trim()) ? "" : "Enter the 6-digit verification code."]);
  }

  if (type === "profile" || type === "profile-setup") {
    const setup = type === "profile-setup";
    const changingPassword = values.currentPassword || values.newPassword || values.confirmPassword;
    return first(
      ["avatarFile", values.avatarInvalid ? "Choose an image file (like JPG or PNG) under 10 MB." : ""],
      ["name", nameProblem(values.name)],
      ["email", setup ? "" : emailProblem(values.email)],
      ["birthdate", birthdateProblem(values.birthdate, { required: setup })],
      ["city", choiceProblem(values.city, cities, "a city from the list", { required: false })],
      ["nationality", choiceProblem(values.nationality, nationalities, "a nationality from the list", { required: false })],
      setup && role === "coach" ? ["coachSpecialty", values.specialty ? "" : "Tell us your coaching specialty."] : ["", ""],
      setup && role !== "coach" ? ["interests", values.primaryGoal ? "" : "Choose at least one fitness interest."] : ["", ""],
      setup && role !== "coach" ? ["fitnessLevel", choiceProblem(values.fitnessLevel, FITNESS_LEVELS, "a fitness level")] : ["", ""],
      ["currentPassword", changingPassword && !values.currentPassword ? "Enter your current password to change it." : ""],
      ["newPassword", changingPassword ? passwordProblem(values.newPassword) : ""],
      ["confirmPassword", changingPassword && values.newPassword !== values.confirmPassword ? "New passwords do not match." : ""],
      ["newPassword", changingPassword && values.newPassword === values.currentPassword ? "Choose a new password that's different from your current one." : ""],
    );
  }

  if ((type === "goal" || type === "onboarding") && role !== "coach") {
    const due = parseDate(values.due);
    const today = isoDate(new Date());
    return first(
      ["type", choiceProblem(values.type, ACTIVITY_TYPES, "an activity type")],
      ["title", textProblem(values.title, "Goal name", { min: 2, max: 60 })],
      ["due", !due ? "Choose a due date." : values.due < today ? "Choose a due date from today onwards." : values.due > isoDate(addYears(new Date(), 5)) ? "Due dates can be up to 5 years ahead." : ""],
      ["targetDistance", numberProblem(values.targetDistance, "Desired distance (km)", { min: 0.1, max: 5000 })],
    );
  }

  if (type === "goal") {
    return first(
      ["title", textProblem(values.title, "Plan title", { min: 2, max: 60 })],
      ["category", choiceProblem(values.category, GOAL_CATEGORIES, "a category")],
      ["due", textProblem(values.due, "Due", { min: 2, max: 40 })],
      ["progress", values.progress === "" ? "" : numberProblem(values.progress, "Progress", { min: 0, max: 100, whole: true })],
      ...[0, 1, 2, 3].map((index) => [`checkpoint${index}`, textProblem(values[`checkpoint${index}`], `Checkpoint ${index + 1}`, { max: 40, required: false })]),
    );
  }

  if (type === "goal-progress") {
    return first(["coveredDistance", numberProblem(values.coveredDistance, "Distance covered now (km)", { min: 0, max: 5000 })]);
  }

  if (type === "activity") {
    const time = new Date(values.time);
    const distance = Number(values.distance);
    const minutes = Number(values.duration);
    const tooFast = distance > 0 && minutes > 0 && distance / (minutes / 60) > (MAX_SPEED_KMH[values.type] || 80);
    return first(
      ["type", choiceProblem(values.type, ACTIVITY_TYPES, "an activity type")],
      ["time", !values.time || Number.isNaN(time.getTime()) ? "Choose when you did the activity." : ""],
      ["time", time > new Date(Date.now() + 5 * 60000) ? "The activity time can't be in the future." : ""],
      ["time", time < addYears(new Date(), -1) ? "You can only log activities from the past year." : ""],
      ["distance", numberProblem(values.distance, "Distance covered (km)", { min: 0.1, max: 500 })],
      ["duration", numberProblem(values.duration, "Activity duration (minutes)", { min: 1, max: 1440, whole: true })],
      ["distance", tooFast ? "That distance and duration don't add up. Check both and try again." : ""],
    );
  }

  if (type === "session" || type === "onboarding") {
    const [scheduleField, scheduleMessage] = scheduleProblem(values.date, values.time);
    return first(
      ["type", choiceProblem(values.type, ACTIVITY_TYPES, "an activity type")],
      ["title", textProblem(values.title, "Session Title", { min: 3, max: 60 })],
      [scheduleField, scheduleMessage],
      ["capacity", numberProblem(values.capacity, "Capacity", { min: 2, max: 50, whole: true })],
      ["location", textProblem(values.location, "Location", { min: 3, max: 100 })],
      ["level", choiceProblem(values.level, FITNESS_LEVELS, "an intensity level")],
      ["notes", textProblem(values.notes, "Description", { max: 300, required: false })],
      ["accessibility", choiceProblem(values.accessibility, ACCESSIBILITY_OPTIONS, "an accessibility option")],
    );
  }

  if (type === "announcement") {
    const sessionOk = values.sessionId === "general" || ownSessionIds.includes(values.sessionId);
    return first(
      ["sessionId", sessionOk ? "" : "Choose a session first."],
      ["subject", "subject" in values ? textProblem(values.subject, "Subject", { min: 3, max: 80 }) : ""],
      ["announcement", textProblem(values.announcement, "Message", { min: 5, max: 500 })],
    );
  }

  if (type === "ai-chat") {
    return first(["message", textProblem(values.message, "Message", { max: 1000 })]);
  }

  return null;
}
