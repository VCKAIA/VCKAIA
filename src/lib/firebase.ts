import { FirebaseError, getApp, getApps, initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  getRedirectResult,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type QueryConstraint,
  type DocumentData,
} from "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim(),
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim(),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim(),
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.trim(),
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim(),
  appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim(),
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID?.trim(),
};

export const isFirebaseConfigured = Boolean(
  config.apiKey && config.authDomain && config.projectId && config.appId,
);

const app = isFirebaseConfigured
  ? getApps().length ? getApp() : initializeApp(config)
  : null;

export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
export const functions = app ? getFunctions(app) : null;
export const firebaseProjectId = config.projectId ?? "";

export type MemberRole = "member" | "editor" | "admin" | "owner";
export type Profile = { id: string; display_name: string; role: MemberRole };
export type EventItem = {
  id: string; title: string; summary: string; starts_at: string; location: string;
  status: "draft" | "published" | "archived";
};
export type Competition = {
  id: string; title: string; description: string; registration_open: boolean;
  starts_at: string | null; status: "draft" | "published" | "archived";
  series_id?: string | null;
};
export type PublicContent = {
  id: string; type: "news" | "project"; title: string; summary: string;
  body: string; created_at: string; image_url?: string;
};
export type LeaderboardEntry = { display_name: string; total_score: number; attempts: number };
export type TeamRegistration = {
  id: string; team_name: string; school: string; captain_name: string;
  captain_email: string; captain_phone: string; teammate_names: string[];
  competition_id: string; created_at: string;
};
export type Submission = {
  id: string; kind: "project" | "news"; title: string; summary: string;
  body: string; status: "pending" | "approved" | "rejected"; created_at: string; image_url?: string;
};
export type AdminContentItem = PublicContent & { status: "draft" | "published" | "archived" };
export type CompetitionResult = {
  id: string; competition_id: string; registration_id: string; score: number;
  competition: { title: string; series_id: string | null } | null;
  team: { team_name: string; school: string } | null;
};
export type PublicCompetitionResult = {
  competition_id: string; competition_title: string; series_id: string;
  series_title: string; team_name: string; school: string; score: number;
};
export type Question = { id: string; question: string; options: string[]; sequence: number };
export type ManagedQuestion = {
  id: string; prompt: string; choices: string[]; correct_choice: number;
  sequence: number; status: "draft" | "published" | "archived";
};
export type CompetitionSeries = { id: string; title: string; status: string };
export type MemberProfile = Profile;

function requireFirestore() {
  if (!db) throw new Error("Firebase is not configured. Copy .env.example to .env.local and set the Firebase project values.");
  return db;
}

export async function getMemberProfile(userId: string): Promise<Profile | null> {
  const database = requireFirestore();
  const reference = doc(database, "profiles", userId);
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const snapshot = await getDoc(reference);
    if (snapshot.exists()) return { id: snapshot.id, ...snapshot.data() } as Profile;
    if (attempt < 7) await new Promise((resolve) => window.setTimeout(resolve, 250));
  }
  return null;
}

export async function ensureMemberProfile(user: User) {
  const database = requireFirestore();
  const reference = doc(database, "profiles", user.uid);
  const candidateName = user.displayName?.trim() || user.email?.split("@")[0] || "";
  const displayName = candidateName.length >= 2 ? candidateName.slice(0, 60) : "VCKAIA Member";
  await runTransaction(database, async (transaction) => {
    const snapshot = await transaction.get(reference);
    if (!snapshot.exists()) {
      transaction.set(reference, {
        id: user.uid,
        display_name: displayName,
        role: "member",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  });
}

export function watchAuth(callback: (user: User | null) => void, onError: (error: Error) => void) {
  if (!auth) return () => undefined;
  return onAuthStateChanged(auth, callback, onError);
}

export async function registerWithEmail(email: string, password: string, displayName: string) {
  if (!auth) throw new Error("Firebase Authentication is not configured.");
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  await updateProfile(credential.user, { displayName: displayName.trim() });
  if (db) {
    await setDoc(doc(db, "profiles", credential.user.uid), {
      id: credential.user.uid,
      display_name: displayName.trim(),
      role: "member",
      created_at: new Date().toISOString(),
    }, { merge: true });
  }
  return credential.user;
}

export async function signInWithEmail(email: string, password: string) {
  if (!auth) throw new Error("Firebase Authentication is not configured.");
  return signInWithEmailAndPassword(auth, email, password);
}

export async function signInWithGoogle(): Promise<"popup" | "redirect"> {
  if (!auth) throw new Error("Firebase Authentication is not configured.");
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    const credential = await signInWithPopup(auth, provider);
    await ensureMemberProfile(credential.user);
    return "popup";
  } catch (error) {
    if (!(error instanceof FirebaseError) || error.code !== "auth/popup-blocked") throw error;
    await signInWithRedirect(auth, provider);
    return "redirect";
  }
}

export async function completeGoogleRedirect() {
  if (!auth) return false;
  const credential = await getRedirectResult(auth);
  if (!credential) return false;
  await ensureMemberProfile(credential.user);
  return true;
}

export async function signOutMember() {
  if (!auth) throw new Error("Firebase Authentication is not configured.");
  return signOut(auth);
}

export async function addRecord<T extends DocumentData>(path: string, data: T, id?: string) {
  const database = requireFirestore();
  const reference = id ? doc(database, path, id) : doc(collection(database, path));
  await setDoc(reference, { ...data, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  return reference.id;
}

export async function updateRecord(path: string, id: string, data: DocumentData) {
  const database = requireFirestore();
  await updateDoc(doc(database, path, id), { ...data, updated_at: new Date().toISOString() });
}

export async function listRecords<T>(path: string, ...constraints: QueryConstraint[]): Promise<T[]> {
  const database = requireFirestore();
  const result = await getDocs(query(collection(database, path), ...constraints));
  return result.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }) as T);
}

export async function callFunction<T, R>(name: string, data: T): Promise<R> {
  if (!functions) throw new Error("Firebase Cloud Functions are not configured.");
  const callable = httpsCallable<T, R>(functions, name);
  const result = await callable(data);
  return result.data;
}

export async function getPublicSiteData() {
  const database = requireFirestore();
  const now = new Date().toISOString();
  const [eventDocs, competitionDocs, contentDocs] = await Promise.all([
    getDocs(query(collection(database, "events"), where("status", "==", "published"), where("starts_at", ">=", now), orderBy("starts_at"),)),
    getDocs(query(collection(database, "competitions"), where("status", "==", "published"), orderBy("created_at", "desc"))),
    getDocs(query(collection(database, "contentItems"), where("status", "==", "published"), orderBy("created_at", "desc"))),
  ]);
  const [board, results, questions] = await Promise.all([
    callFunction<Record<string, never>, LeaderboardEntry[]>("getQuizLeaderboard", {}),
    callFunction<Record<string, never>, PublicCompetitionResult[]>("getCompetitionResults", {}),
    callFunction<Record<string, never>, Question[]>("getQuickQuizQuestions", {}),
  ]);
  return {
    events: eventDocs.docs.slice(0, 4).map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }) as EventItem),
    competitions: competitionDocs.docs.slice(0, 6).map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }) as Competition),
    content: contentDocs.docs.slice(0, 6).map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }) as PublicContent),
    leaderboard: board,
    competitionResults: results,
    questions,
  };
}

export async function getAdminDashboardData(canManageCompetitions: boolean) {
  const [events, competitions, series, submissions, members, questions, contentItems, registrations, results] = await Promise.all([
    listRecords<EventItem>("events", orderBy("starts_at", "asc")),
    canManageCompetitions ? listRecords<Competition>("competitions", orderBy("created_at", "desc")) : Promise.resolve([]),
    canManageCompetitions ? listRecords<CompetitionSeries>("competitionSeries", orderBy("created_at", "desc")) : Promise.resolve([]),
    listRecords<Submission>("contentSubmissions", orderBy("created_at", "desc")),
    listRecords<Profile>("profiles", orderBy("display_name", "asc")),
    listRecords<ManagedQuestion>("quickQuizQuestions", orderBy("sequence", "asc")),
    listRecords<AdminContentItem>("contentItems", orderBy("created_at", "desc")),
    canManageCompetitions ? listRecords<TeamRegistration>("teamRegistrations", orderBy("created_at", "desc")) : Promise.resolve([]),
    canManageCompetitions ? callFunction<{ admin: boolean }, CompetitionResult[]>("getCompetitionResults", { admin: true }) : Promise.resolve([]),
  ]);
  return { events, competitions, series, submissions, members, questions, contentItems, registrations, results };
}

export function firebaseTimestamp() {
  return serverTimestamp();
}

export async function saveQuizAttempt(questionIds: string[], selectedChoices: number[]) {
  return callFunction<{ questionIds: string[]; selectedChoices: number[] }, number>(
    "submitQuizAttempt",
    { questionIds, selectedChoices },
  );
}

export async function getGuestQuizScore(questionIds: string[], selectedChoices: number[]) {
  return callFunction<{ questionIds: string[]; selectedChoices: number[] }, number>(
    "getQuizScore",
    { questionIds, selectedChoices },
  );
}

export async function createTeamRegistration(data: Omit<TeamRegistration, "id" | "created_at">) {
  return addRecord("teamRegistrations", data);
}

export async function createMemberSubmission(data: Omit<Submission, "id" | "created_at" | "status"> & { user_id: string }) {
  return addRecord("contentSubmissions", { ...data, status: "pending" });
}

export async function reviewMemberSubmission(submissionId: string, decision: "approved" | "rejected") {
  return callFunction<{ submissionId: string; decision: "approved" | "rejected" }, void>(
    "reviewContentSubmission",
    { submissionId, decision },
  );
}

export async function recordCompetitionResult(registrationId: string, score: number) {
  return callFunction<{ registrationId: string; score: number }, void>(
    "saveCompetitionResult",
    { registrationId, score },
  );
}

export async function assignMemberRole(userId: string, role: MemberRole) {
  return callFunction<{ userId: string; role: MemberRole }, void>(
    "assignMemberRole",
    { userId, role },
  );
}

export async function askVckaiaAssistant(question: string) {
  return callFunction<{ question: string }, { answer: string }>("vckaiaAssistant", { question });
}
