import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent, type MouseEvent, type ReactNode } from "react";
import {
  ArrowDown, ArrowRight, ArrowUpRight, Bot, Check, ChevronDown, CircleUserRound,
  Command, Cpu, GraduationCap, Menu, Plus, Shield, Sparkles,
  Trophy, X, Zap,
} from "lucide-react";
import {
  addRecord, askVckaiaAssistant, assignMemberRole,
  createMemberSubmission, createTeamRegistration, getAdminDashboardData,
  ensureMemberProfile, getGuestQuizScore, getMemberProfile, getPublicSiteData,
  isFirebaseConfigured, recordCompetitionResult, registerWithEmail,
  reviewMemberSubmission, saveQuizAttempt, signInWithEmail, signInWithGoogle as firebaseSignInWithGoogle,
  signOutMember, updateRecord, watchAuth, type AdminContentItem, type Competition,
  type CompetitionResult, type EventItem,
  type LeaderboardEntry, type ManagedQuestion, type Profile,
  type PublicCompetitionResult, type PublicContent, type Submission,
  type TeamRegistration,
} from "./lib/firebase";
import { isCloudinaryConfigured, uploadImage } from "./lib/cloudinary";

type Modal = "auth" | "team" | "submit" | "assistant" | null;
type Toast = { message: string; tone: "success" | "error" };
type AdminTab = "overview" | "events" | "competitions" | "registrations" | "quizzes" | "submissions" | "content" | "members";
type Question = { id: string; question: string; options: string[]; sequence: number };

const quizQuestions: Question[] = [];

const navItems = [
  ["Events", "#events"], ["Competitions", "#competitions"], ["Quick quiz", "#quiz"],
  ["Showcase", "#showcase"], ["About", "#about"],
];

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "Date to be announced" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function App() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authLoading, setAuthLoading] = useState(isFirebaseConfigured);
  const [modal, setModal] = useState<Modal>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [competitions, setCompetitions] = useState<Competition[]>([]);
  const [content, setContent] = useState<PublicContent[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [competitionResults, setCompetitionResults] = useState<PublicCompetitionResult[]>([]);
  const [questions, setQuestions] = useState<Question[]>(quizQuestions);
  const [dataLoading, setDataLoading] = useState(isFirebaseConfigured);
  const [quizIndex, setQuizIndex] = useState(0);
  const [quizChoice, setQuizChoice] = useState<number | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<number[]>([]);
  const [quizScore, setQuizScore] = useState<number | null>(null);
  const [quizDone, setQuizDone] = useState(false);
  const [quizSaving, setQuizSaving] = useState(false);
  const [menuSelection, setMenuSelection] = useState<AdminTab>("overview");
  const basePath = import.meta.env.BASE_URL.endsWith("/")
    ? import.meta.env.BASE_URL
    : `${import.meta.env.BASE_URL}/`;
  const adminPath = `${basePath}admin`;
  const isAdminPath = window.location.pathname === adminPath || window.location.hash === "#admin";
  const canManage = Boolean(profile && ["owner", "admin", "editor"].includes(profile.role));
  const canManageUsers = profile?.role === "owner";
  const canManageCompetitions = Boolean(profile && ["owner", "admin"].includes(profile.role));

  const notify = useCallback((message: string, tone: Toast["tone"] = "success") => {
    setToast({ message, tone });
    window.setTimeout(() => setToast(null), 4200);
  }, []);

  const loadPublicData = useCallback(async () => {
    if (!isFirebaseConfigured) return;
    setDataLoading(true);
    try {
      const data = await getPublicSiteData();
      setEvents(data.events);
      setCompetitions(data.competitions);
      setContent(data.content);
      setLeaderboard(data.leaderboard);
      setCompetitionResults(data.competitionResults);
      setQuestions(data.questions);
    } catch (error) {
      notify(`VCKAIA content could not be loaded: ${error instanceof Error ? error.message : "Unknown Firebase error"}`, "error");
    } finally {
      setDataLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    let active = true;
    const unsubscribe = watchAuth((user) => {
      if (!user) {
        setProfile(null);
        setAuthLoading(false);
        return;
      }
      setAuthLoading(true);
      void ensureMemberProfile().then(() => getMemberProfile(user.uid)).then((memberProfile) => {
        if (!active) return;
        if (!memberProfile) {
          notify("Your member profile is not ready yet. Try signing in again.", "error");
          setProfile(null);
        } else {
          setProfile(memberProfile);
        }
      }).catch((error: unknown) => {
        if (active) notify(`Your member profile could not be loaded: ${error instanceof Error ? error.message : "Unknown Firebase error"}`, "error");
      }).finally(() => { if (active) setAuthLoading(false); });
    }, (error) => {
      if (active) {
        notify(`Authentication could not be restored: ${error.message}`, "error");
        setAuthLoading(false);
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [notify]);

  useEffect(() => { void loadPublicData(); }, [loadPublicData]);

  const answerQuestion = () => {
    if (quizChoice === null) return;
    const answers = [...quizAnswers, quizChoice];
    setQuizAnswers(answers);
    if (quizIndex === questions.length - 1) {
      setQuizDone(true);
      if (isFirebaseConfigured) {
        setQuizSaving(true);
        const request = profile
          ? saveQuizAttempt(questions.map((question) => question.id), answers)
          : getGuestQuizScore(questions.map((question) => question.id), answers);
        void request.then((score) => {
          setQuizSaving(false);
          setQuizScore(score);
          if (profile) { notify("Score saved to the member leaderboard."); void loadPublicData(); }
        }).catch((error: unknown) => {
          setQuizSaving(false);
          notify(profile ? `Your result was not saved: ${error instanceof Error ? error.message : "Unknown Firebase error"}` : `Your score could not be checked: ${error instanceof Error ? error.message : "Unknown Firebase error"}`, "error");
        });
      } else {
        setQuizScore(null);
        notify("Quiz scoring needs Firebase Functions. The preview does not expose correct answers.", "error");
      }
    } else {
      setQuizIndex(quizIndex + 1);
      setQuizChoice(null);
    }
  };

  const resetQuiz = () => {
    setQuizIndex(0);
    setQuizChoice(null);
    setQuizAnswers([]);
    setQuizScore(null);
    setQuizDone(false);
  };

  if (isAdminPath) {
    return (
      <>
        <AdminPortal
          profile={profile}
          authLoading={authLoading}
          canManage={canManage}
          canManageCompetitions={canManageCompetitions}
          canManageUsers={canManageUsers}
          basePath={basePath}
          tab={menuSelection}
          setTab={setMenuSelection}
          onAuth={() => setModal("auth")}
          onBack={() => { window.location.href = basePath; }}
          notify={notify}
        />
        {modal === "auth" && <AuthModal onClose={() => setModal(null)} notify={notify} />}
        <ToastMessage toast={toast} />
      </>
    );
  }

  return (
    <div className="site-shell">
      <header className="topbar">
        <a className="brand" href="#" aria-label="VCKAIA home">
          <span className="brand-mark"><Command size={19} strokeWidth={2.2} /></span>
          <span className="brand-word">VCK<span>AI</span>A</span>
          <span className="brand-divider" />
          <span className="brand-sub">VIDYARTHA COLLEGE<br />AI ASSOCIATION</span>
        </a>
        <nav className={`main-nav ${menuOpen ? "is-open" : ""}`} aria-label="Main navigation">
          {navItems.map(([label, href]) => <a key={href} href={href} onClick={() => setMenuOpen(false)}>{label}</a>)}
          <a className="nav-ai" href="#assistant" onClick={(event) => { event.preventDefault(); setMenuOpen(false); setModal("assistant"); }}><Sparkles size={14} /> AI desk</a>
        </nav>
        <div className="top-actions">
          {profile ? (
            <button className="account-chip" onClick={() => void handleSignOut(notify, setProfile)} title="Sign out">
              <span className="avatar">{profile.display_name.slice(0, 1).toUpperCase()}</span><span>{profile.display_name.split(" ")[0]}</span><ChevronDown size={14} />
            </button>
          ) : (
            <button className="button button-outline button-small" onClick={() => setModal("auth")} disabled={authLoading}>Member login <ArrowUpRight size={14} /></button>
          )}
          {profile && canManage && <a className="admin-shortcut" href={adminPath}>Admin</a>}
          <button className="mobile-menu" aria-label="Toggle navigation" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}>{menuOpen ? <X /> : <Menu />}</button>
        </div>
      </header>

      {!isFirebaseConfigured && (
        <div className="setup-notice"><span><span className="pulse-dot" /> PREVIEW MODE</span> Live data, accounts, registrations, submissions and scores need Firebase setup. <a href="#setup">Setup guide <ArrowUpRight size={13} /></a></div>
      )}

      <main>
        <section className="hero">
          <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
          <div className="hero-copy">
            <div className="eyebrow"><span className="live-dot" /> VIDYARTHA COLLEGE · EST. FOR THE CURIOUS</div>
            <h1>Make intelligence<br />a <span className="headline-accent">team sport.</span></h1>
            <p className="hero-intro">We’re the student community exploring what AI can do—and what <em>we</em> can do with it. Learn a little. Build something real. Bring your school to the challenge.</p>
            <div className="hero-actions">
              <a className="button button-lime" href="#competitions">Explore competitions <ArrowRight size={16} /></a>
              <a className="text-link" href="#about">Meet the association <ArrowDown size={15} /></a>
            </div>
            <div className="hero-proof"><span className="proof-icon"><GraduationCap size={17} /></span><span>Open to curious minds.<br /><strong>Built by students, for students.</strong></span></div>
          </div>
          <div className="hero-visual">
            <div className="visual-topline"><span>VCKAIA / FIELD NOTES</span><span>01 — 04</span></div>
            <div className="visual-art" aria-label="Abstract glowing neural network illustration">
              <div className="art-grid" />
              <div className="art-ring ring-a" /><div className="art-ring ring-b" /><div className="art-ring ring-c" />
              <div className="node node-center"><Cpu size={38} strokeWidth={1.4} /></div>
              <span className="node node-small node-north" /><span className="node node-small node-east" />
              <span className="node node-small node-south" /><span className="node node-small node-west" />
              <span className="art-label label-one">HUMAN IDEAS</span><span className="art-label label-two">MACHINE LEARNING</span>
            </div>
            <div className="visual-caption"><span>FIG. 01</span><span>Better questions make better futures.</span><span>↗</span></div>
            <div className="hero-sticker"><span className="sticker-star">✳</span><span>LEARN<br />BUILD<br />COMPETE</span></div>
          </div>
          <div className="hero-index"><span>01</span><span className="index-line" /><span>THE ASSOCIATION</span></div>
        </section>

        <div className="ticker" aria-label="Association motto">
          <div className="ticker-track">{Array.from({ length: 4 }, (_, i) => <span key={i}>THINK CURIOUSLY <b>✳</b> BUILD TOGETHER <b>✳</b> COMPETE KINDLY <b>✳</b> QUESTION EVERYTHING <b>✳</b></span>)}</div>
        </div>

        <section className="section events-section" id="events">
          <SectionHeading index="01 / WHAT’S HAPPENING" title={<>Good things are<br /><span>on the calendar.</span></>} action="All events" href="#events" />
          {events.length ? (
            <div className="event-grid">{events.map((event, index) => <article className={`event-card event-card-${index % 3}`} key={event.id}>
              <div className="card-overline"><span>VCKAIA EVENT</span><span>{String(index + 1).padStart(2, "0")}</span></div>
              <div className="event-icon"><Cpu size={23} /></div>
              <h3>{event.title}</h3><p>{event.summary}</p>
              <div className="event-meta"><span>{formatDate(event.starts_at)}</span><span>{event.location}</span></div>
            </article>)}</div>
          ) : <EmptyState loading={dataLoading} icon={<Sparkles />} title="The next chapter is being planned." text="Workshops, meetups and hands-on sessions will show up here as soon as they're announced." />}
        </section>

        <section className="section competition-section" id="competitions">
          <div className="competition-intro">
            <div className="eyebrow"><span className="live-dot" /> OPEN INVITATION</div>
            <h2>Bring your<br /><span>whole school.</span></h2>
            <p>Think fast, solve together, make your school proud. Our inter-school challenges are built for teams that learn as they go—not just the ones with all the answers.</p>
            <div className="competition-stat-row"><div><strong>01</strong><span>FORM A TEAM</span></div><div><strong>∞</strong><span>WAYS TO THINK</span></div><div><strong>ALL</strong><span>SCHOOLS WELCOME</span></div></div>
            <button className="button button-lime" onClick={() => setModal("team")}>Register your team <ArrowRight size={16} /></button>
          </div>
          <div className="competition-list">
            <div className="list-heading"><span>THE CHALLENGE BOARD</span><span>SEASON / 01</span></div>
            {competitions.length ? competitions.map((comp, i) => <article className="challenge-row" key={comp.id}>
              <span className="challenge-number">0{i + 1}</span><div className="challenge-copy"><h3>{comp.title}</h3><p>{comp.description}</p></div>
              <div className="challenge-status">{comp.registration_open ? <><span className="live-dot" /> REGISTERING</> : comp.status === "archived" ? "COMPLETED" : "ENTRIES CLOSED"}</div>
              {comp.starts_at && <span className="challenge-date">{formatDate(comp.starts_at)}</span>}
            </article>) : <div className="challenge-empty">{dataLoading ? "Loading challenges…" : "The next challenge is taking shape."}<br /><span>Team registration opens when a competition is announced.</span></div>}
            <div className="season-note"><Trophy size={17} /><span>More than one competition. One season-long<br />race for the top of the standings.</span><span className="note-arrow">↗</span></div>
            <PublicCompetitionScoreboard results={competitionResults} loading={dataLoading} />
          </div>
        </section>

        <section className="section quiz-section" id="quiz">
          <div className="section-heading quiz-heading">
            <div><div className="eyebrow">02 / THINK ON YOUR FEET</div><h2>A little <span>brain fuel.</span></h2><p>Three questions. No pressure. Just a quick spark of AI know-how.</p></div>
            <div className="quiz-badge"><Zap size={16} /> QUICK QUIZ / 03</div>
          </div>
          <div className="quiz-layout">
            <div className="quiz-card">
              {questions.length === 0 ? <EmptyState loading={dataLoading} icon={<Zap />} title="A new quick quiz is on the way." text="The association team is preparing the next questions." /> : !quizDone ? <>
                  <div className="quiz-progress"><span>QUESTION {String(quizIndex + 1).padStart(2, "0")} <i>/ {String(questions.length).padStart(2, "0")}</i></span><div><span style={{ width: `${((quizIndex + 1) / questions.length) * 100}%` }} /></div><span>{questions.length} Qs</span></div>
                  <h3>{questions[quizIndex].question}</h3>
                  <div className="quiz-options">{questions[quizIndex].options.map((option, i) => <button key={option} className={`quiz-option ${quizChoice === i ? "selected" : ""}`} onClick={() => setQuizChoice(i)}><span className="option-letter">{String.fromCharCode(65 + i)}</span>{option}<span className="option-check">{quizChoice === i && <Check size={16} />}</span></button>)}</div>
                  <button className="button button-lime quiz-next" disabled={quizChoice === null || quizSaving} onClick={answerQuestion}>{quizIndex === questions.length - 1 ? "See my score" : "Lock it in"} <ArrowRight size={16} /></button>
                </> : <div className="quiz-result"><div className="result-mark">{quizScore === null ? "—" : `${quizScore}/${questions.length}`}</div><div><div className="eyebrow">THAT’S A WRAP</div><h3>{quizScore === null ? "Answers checked." : quizScore === questions.length ? "Brilliantly done." : quizScore > 0 ? "Good thinking." : "Curiosity counts."}</h3><p>{quizSaving ? "Checking your answers…" : quizScore === null ? "Your score could not be checked. Try again once the quiz service is available." : profile ? "Your score is on the member leaderboard." : "Nice try! Sign in as a member to save your score to the leaderboard."}</p>{!profile && quizScore !== null && <button className="text-link" onClick={() => setModal("auth")}>Member sign in <ArrowUpRight size={14} /></button>}</div><button className="button button-outline button-small" onClick={resetQuiz}>Try again</button></div>}
            </div>
            <aside className="leaderboard-card">
              <div className="leaderboard-title"><div><Trophy size={17} /><span>MEMBER LEADERBOARD</span></div><span className="live-pill">LIVE</span></div>
              <p>Good questions deserve a little recognition.</p>
              {leaderboard.length ? <ol className="leaderboard-list">{leaderboard.slice(0, 5).map((entry, i) => <li key={`${entry.display_name}-${i}`}><span className={`rank rank-${i + 1}`}>{String(i + 1).padStart(2, "0")}</span><span className="leader-name">{entry.display_name}</span><span className="leader-points">{entry.total_score} <small>PTS</small></span></li>)}</ol> : <div className="leaderboard-empty">{dataLoading ? "Loading member scores…" : "Your name could be first here."}<br /><span>Members can save scores after a quick quiz.</span></div>}
              <div className="leaderboard-foot">MEMBER SCORES · UPDATED LIVE</div>
            </aside>
          </div>
        </section>

        <section className="feature-band">
          <div className="feature-index">WHAT ELSE?</div>
          <div className="feature-cards">
            <a className="feature-card" href="#showcase"><span className="feature-icon"><Cpu size={20} /></span><span className="feature-title">Made by members</span><span className="feature-description">Small experiments, big ideas. This is where student projects get their moment.</span><span className="feature-arrow"><ArrowUpRight size={16} /></span></a>
            <a className="feature-card" href="#showcase"><span className="feature-icon"><Sparkles size={20} /></span><span className="feature-title">AI, minus the noise</span><span className="feature-description">One thoughtful AI and tech story a week. Curated for curious minds.</span><span className="feature-arrow"><ArrowUpRight size={16} /></span></a>
            <button className="feature-card" onClick={() => setModal("assistant")}><span className="feature-icon"><Bot size={20} /></span><span className="feature-title">Ask the AI desk</span><span className="feature-description">Questions about VCKAIA, learning AI, or what to make next? Start here.</span><span className="feature-arrow"><ArrowUpRight size={16} /></span></button>
          </div>
        </section>

        <section className="section showcase-section" id="showcase">
          <SectionHeading index="03 / IDEAS IN THE WILD" title={<>Curiosity, <span>on display.</span></>} action="Submit an idea" href="#submit" onAction={(event) => { event.preventDefault(); setModal("submit"); }} />
          <div className="showcase-columns">
            <div className="showcase-column"><div className="column-heading"><span>BUILT BY MEMBERS</span><span>PROJECTS / {content.filter((x) => x.type === "project").length.toString().padStart(2, "0")}</span></div>
              {content.filter((x) => x.type === "project").length ? content.filter((x) => x.type === "project").map((item) => <article className="showcase-item" key={item.id}>{item.image_url && <img className="content-cover" src={item.image_url} alt={`${item.title} cover`} loading="lazy" />}<div className="showcase-date">{formatDate(item.created_at)}</div><h3>{item.title}</h3><p>{item.summary}</p><a href="#about" className="read-more">READ MORE <ArrowUpRight size={14} /></a></article>) : <EmptyState loading={dataLoading} icon={<Cpu />} title="The project wall is waiting." text="Members can submit a project for the team to review and publish." />}
            </div>
            <div className="showcase-column news-column"><div className="column-heading"><span>THE WEEKLY SIGNAL</span><span>AI & TECH / {content.filter((x) => x.type === "news").length.toString().padStart(2, "0")}</span></div>
              {content.filter((x) => x.type === "news").length ? content.filter((x) => x.type === "news").map((item) => <article className="showcase-item news-item" key={item.id}>{item.image_url && <img className="content-cover" src={item.image_url} alt={`${item.title} cover`} loading="lazy" />}<div className="showcase-date">{formatDate(item.created_at)} <span className="news-label">VCKAIA NOTE</span></div><h3>{item.title}</h3><p>{item.summary}</p><a href="#about" className="read-more">READ MORE <ArrowUpRight size={14} /></a></article>) : <EmptyState loading={dataLoading} icon={<Sparkles />} title="A signal worth sharing." text="Look out for a fresh AI and tech read from the association each week." />}
            </div>
          </div>
          <div className="submit-callout"><span className="callout-spark">✳</span><p>Have an idea or a story worth sharing?<br /><strong>Members can pitch it to the association.</strong></p><button className="button button-outline button-small" onClick={() => setModal("submit")}>Send a submission <ArrowRight size={14} /></button></div>
        </section>

        <section className="about-section" id="about">
          <div className="about-top"><div className="eyebrow"><span className="live-dot" /> VIDYARTHA COLLEGE · STUDENT ASSOCIATION</div><span className="about-issue">ABOUT / 04</span></div>
          <div className="about-grid"><h2>Not here to<br />watch the future.<br /><span>Here to make it.</span></h2><div className="about-copy"><p>VCKAIA is the Vidyartha College Artificial Intelligence Association: a student-led space to ask better questions, understand emerging technology, and turn ideas into things you can share.</p><p>No gatekeeping. No need to be an expert. Just bring your curiosity—and maybe a teammate.</p><a className="about-link" href="#events">Find us at the next event <ArrowUpRight size={15} /></a></div></div>
          <div className="about-values"><div><span>01</span><strong>LEARN OUT LOUD</strong><p>We share what we discover.</p></div><div><span>02</span><strong>BUILD WITH INTENT</strong><p>Good ideas deserve a real try.</p></div><div><span>03</span><strong>WIN TOGETHER</strong><p>Every school has a seat at the table.</p></div><div><span>04</span><strong>STAY HUMAN</strong><p>Technology is only part of the story.</p></div></div>
        </section>

        <section className="setup-section" id="setup">
          <span className="setup-mark"><Shield size={18} /></span><div><span className="eyebrow">FOR THE SITE TEAM</span><h2>Ready when you are.</h2><p>Connect Firebase to enable secure member sign-in, live event publishing, inter-school registration, submissions and scoreboards. Secrets stay server-side.</p></div><a href="https://github.com/VCKAIA/VCKAIA#readme" className="text-link">Setup notes <ArrowUpRight size={14} /></a>
        </section>

        <footer className="footer"><a className="brand footer-brand" href="#"><span className="brand-mark"><Command size={17} /></span><span className="brand-word">VCK<span>AI</span>A</span></a><span>MADE WITH QUESTIONS AT VIDYARTHA COLLEGE.</span><span>© {new Date().getFullYear()} VCKAIA</span></footer>
      </main>

      {modal === "auth" && <AuthModal onClose={() => setModal(null)} notify={notify} />}
      {modal === "team" && <TeamModal competitions={competitions} onClose={() => setModal(null)} notify={notify} />}
      {modal === "submit" && <SubmissionModal profile={profile} onAuth={() => setModal("auth")} onClose={() => setModal(null)} notify={notify} />}
      {modal === "assistant" && <AssistantModal profile={profile} onAuth={() => setModal("auth")} onClose={() => setModal(null)} notify={notify} />}
      <ToastMessage toast={toast} />
    </div>
  );
}

async function handleSignOut(notify: (message: string, tone?: Toast["tone"]) => void, setProfile: (value: Profile | null) => void) {
  try {
    await signOutMember();
    setProfile(null);
    notify("You’re signed out.");
  } catch (error) {
    notify(`Sign out failed: ${error instanceof Error ? error.message : "Unknown Firebase error"}`, "error");
  }
}

function SectionHeading({ index, title, action, href, onAction }: { index: string; title: ReactNode; action?: string; href?: string; onAction?: (event: MouseEvent<HTMLAnchorElement>) => void }) {
  return <div className="section-heading"><div><div className="eyebrow">{index}</div><h2>{title}</h2></div>{action && <a className="text-link" href={href} onClick={onAction}>{action} <ArrowUpRight size={15} /></a>}</div>;
}

function EmptyState({ loading, icon, title, text }: { loading: boolean; icon: ReactNode; title: string; text: string }) {
  return <div className="empty-state"><span className="empty-icon">{icon}</span><div><h3>{loading ? "Gathering the latest…" : title}</h3><p>{loading ? "One moment while the VCKAIA board loads." : text}</p></div></div>;
}

function PublicCompetitionScoreboard({ results, loading }: { results: PublicCompetitionResult[]; loading: boolean }) {
  const series = new Map<string, { title: string; teams: Map<string, { team: string; school: string; score: number }>; schools: Map<string, { school: string; score: number }> }>();
  const competitionsById = new Map<string, { title: string; entries: PublicCompetitionResult[] }>();
  for (const result of results) {
    let season = series.get(result.series_id);
    if (!season) {
      season = { title: result.series_title, teams: new Map(), schools: new Map() };
      series.set(result.series_id, season);
    }
    const teamKey = `${result.school.trim().toLocaleLowerCase()}/${result.team_name.trim().toLocaleLowerCase()}`;
    const team = season.teams.get(teamKey) ?? { team: result.team_name, school: result.school, score: 0 };
    team.score += Number(result.score);
    season.teams.set(teamKey, team);
    const schoolKey = result.school.trim().toLocaleLowerCase();
    const school = season.schools.get(schoolKey) ?? { school: result.school, score: 0 };
    school.score += Number(result.score);
    season.schools.set(schoolKey, school);
    const competition = competitionsById.get(result.competition_id) ?? { title: result.competition_title, entries: [] };
    competition.entries.push(result);
    competitionsById.set(result.competition_id, competition);
  }
  if (!results.length) return <div className="public-scoreboard-empty">{loading ? "Loading season standings…" : "Season standings and round results will appear here after scores are published."}</div>;
  return <div className="public-scoreboard">
    <section className="public-score-block">
      <div className="public-score-title"><span>SEASON STANDINGS</span><Trophy size={15} /></div>
      {[...series.entries()].map(([seriesId, season]) => <div className="public-season" key={seriesId}><h4>{season.title}</h4><div className="public-standing-label">TEAMS</div>{[...season.teams.values()].sort((a, b) => b.score - a.score).slice(0, 3).map((team, index) => <div className="public-score-row" key={`${team.school}-${team.team}`}><span className="score-rank">{String(index + 1).padStart(2, "0")}</span><span className="score-team"><strong>{team.team}</strong><small>{team.school}</small></span><b>{team.score}<small>PTS</small></b></div>)}<div className="public-standing-label school-standing-label">SCHOOLS</div>{[...season.schools.values()].sort((a, b) => b.score - a.score).slice(0, 3).map((school, index) => <div className="public-score-row" key={school.school}><span className="score-rank">{String(index + 1).padStart(2, "0")}</span><span className="score-team"><strong>{school.school}</strong><small>Across registered teams</small></span><b>{school.score}<small>PTS</small></b></div>)}</div>)}
    </section>
    <section className="public-score-block">
      <div className="public-score-title"><span>ROUND RESULTS</span><span className="result-update">PUBLISHED</span></div>
      {[...competitionsById.entries()].slice(0, 3).map(([competitionId, competition]) => <div className="public-season" key={competitionId}><h4>{competition.title}</h4>{[...competition.entries].sort((a, b) => b.score - a.score).slice(0, 3).map((entry, index) => <div className="public-score-row" key={`${entry.team_name}-${entry.school}`}><span className="score-rank">{String(index + 1).padStart(2, "0")}</span><span className="score-team"><strong>{entry.team_name}</strong><small>{entry.school}</small></span><b>{entry.score}<small>PTS</small></b></div>)}</div>)}
    </section>
  </div>;
}

function AuthModal({ onClose, notify }: { onClose: () => void; notify: (message: string, tone?: Toast["tone"]) => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") await registerWithEmail(email, password, name);
      else await signInWithEmail(email, password);
      notify(mode === "signup" ? "Welcome to VCKAIA!" : "Welcome back.");
      onClose();
    } catch (error) {
      notify(`Sign-in failed: ${error instanceof Error ? error.message : "Unknown Firebase error"}`, "error");
    } finally { setBusy(false); }
  };

  const signInWithGoogle = async () => {
    setBusy(true);
    try {
      await firebaseSignInWithGoogle();
      notify("Welcome to VCKAIA.");
      onClose();
    } catch (error) {
      notify(`Google sign-in failed: ${error instanceof Error ? error.message : "Unknown Firebase error"}`, "error");
    } finally { setBusy(false); }
  };

  return <ModalFrame onClose={onClose} label="Member sign in">
    <div className="modal-eyebrow"><CircleUserRound size={15} /> VCKAIA MEMBER ACCESS</div><h2>{mode === "signin" ? "Good to have you back." : "Curiosity starts here."}</h2><p className="modal-intro">{mode === "signin" ? "Sign in to save your quiz scores and share what you're making." : "Join the association to share projects, save scores, and learn together."}</p>
    {!isFirebaseConfigured && <ConfigHint text="Member accounts are unavailable until the site team configures Firebase. You can still try the guest quiz." />}
    <button className="google-button" disabled={busy || !isFirebaseConfigured} onClick={() => void signInWithGoogle()}><GoogleMark /> Continue with Google</button>
    <div className="auth-divider"><span /> OR WITH EMAIL <span /></div>
    <form className="form-stack" onSubmit={(event) => void handleSubmit(event)}>
      {mode === "signup" && <label>Display name<input value={name} onChange={(event) => setName(event.target.value)} minLength={2} maxLength={60} required placeholder="What should we call you?" autoComplete="name" disabled={!isFirebaseConfigured} /></label>}
      <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="you@school.edu" autoComplete="email" disabled={!isFirebaseConfigured} /></label>
      <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required placeholder="At least 8 characters" autoComplete={mode === "signup" ? "new-password" : "current-password"} disabled={!isFirebaseConfigured} /></label>
      <button className="button button-lime full-width" type="submit" disabled={busy || !isFirebaseConfigured}>{busy ? "One moment…" : mode === "signin" ? "Sign in" : "Create member account"} <ArrowRight size={15} /></button>
    </form>
    <div className="auth-switch">{mode === "signin" ? "New around here?" : "Already a member?"}<button onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>{mode === "signin" ? "Join VCKAIA" : "Sign in"}</button></div>
    <p className="form-footnote">All new accounts join as members. Admin and editor access is managed by an existing owner.</p>
  </ModalFrame>;
}

function GoogleMark() {
  return <svg aria-hidden="true" width="17" height="17" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" /><path fill="#4285F4" d="M46.98 24.55c0-1.57-.14-3.08-.4-4.55H24v9.02h12.88c-.58 2.96-2.25 5.48-4.76 7.18l7.72 5.99c4.5-4.16 7.14-10.29 7.14-17.64Z" /><path fill="#FBBC05" d="M10.53 28.59a14.5 14.5 0 0 1 0-9.18l-7.98-6.19a24 24 0 0 0 0 21.56l7.98-6.19Z" /><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.9-5.81l-7.73-5.99c-2.15 1.45-4.92 2.3-8.17 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" /></svg>;
}

function ModalFrame({ children, onClose, label }: { children: ReactNode; onClose: () => void; label: string }) {
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleKey);
    document.body.classList.add("modal-open");
    return () => { document.removeEventListener("keydown", handleKey); document.body.classList.remove("modal-open"); };
  }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="modal-card" role="dialog" aria-modal="true" aria-label={label}><button className="modal-close" aria-label="Close" onClick={onClose}><X size={18} /></button>{children}</section></div>;
}

function ConfigHint({ text }: { text: string }) {
  return <div className="config-hint"><Shield size={15} /><span>{text}</span></div>;
}

function CloudinaryImageField({ imageUrl, onChange, disabled = false }: { imageUrl: string; onChange: (value: string) => void; disabled?: boolean }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      onChange(await uploadImage(file));
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "The image upload failed.");
    } finally {
      setUploading(false);
    }
  };
  return <div className="image-upload-field">
    <label>Cover image <span className="optional-label">OPTIONAL · JPEG, PNG OR WEBP · UP TO 5 MB</span>
      <input type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled || uploading || !isCloudinaryConfigured} onChange={(event) => void handleFile(event)} />
    </label>
    {!isCloudinaryConfigured && <small>Configure a Cloudinary cloud name and restricted unsigned preset to enable image uploads.</small>}
    {uploading && <small>Uploading image…</small>}
    {error && <small className="upload-error" role="alert">{error}</small>}
    {imageUrl && <div className="image-upload-preview"><img src={imageUrl} alt="Selected cover preview" /><button className="tiny-action subdued" type="button" disabled={uploading} onClick={() => onChange("")}>Remove image</button></div>}
  </div>;
}

function TeamModal({ competitions, onClose, notify }: { competitions: Competition[]; onClose: () => void; notify: (message: string, tone?: Toast["tone"]) => void }) {
  const [teamName, setTeamName] = useState("");
  const [school, setSchool] = useState("");
  const [captain, setCaptain] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [teammates, setTeammates] = useState("");
  const [competitionId, setCompetitionId] = useState(competitions.find((item) => item.registration_open)?.id ?? "");
  const [busy, setBusy] = useState(false);
  const openCompetitions = competitions.filter((item) => item.registration_open);
  const unavailable = !isFirebaseConfigured;
  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isFirebaseConfigured) { notify("Team registration is unavailable until the site team configures Firebase.", "error"); return; }
    if (!openCompetitions.some((item) => item.id === competitionId)) { notify("There isn't an open competition to register for yet.", "error"); return; }
    setBusy(true);
    try {
      await createTeamRegistration({
        team_name: teamName.trim(), school: school.trim(), captain_name: captain.trim(),
        captain_email: email.trim(), captain_phone: phone.trim() || "",
        teammate_names: teammates.split(/\r?\n/).map((person) => person.trim()).filter(Boolean),
        competition_id: competitionId,
      });
      notify("Your team registration has been received.");
      onClose();
    } catch (error) {
      notify(`Registration was not submitted: ${error instanceof Error ? error.message : "Unknown Firebase error"}`, "error");
    } finally { setBusy(false); }
  };
  return <ModalFrame onClose={onClose} label="Register an inter-school team">
    <div className="modal-eyebrow"><Trophy size={15} /> INTER-SCHOOL CHALLENGE</div><h2>One team. One big idea.</h2><p className="modal-intro">No VCKAIA account needed. Sign up your school team and we’ll be in touch with the captain.</p>
    {unavailable && <ConfigHint text="The form will accept registrations once the team connects Firebase. Your details won't be stored in this preview." />}
    {openCompetitions.length === 0 && !unavailable && <ConfigHint text="No competition is currently accepting registrations. Check back when the next challenge opens." />}
    <form className="form-stack" onSubmit={(event) => void handleSubmit(event)}>
      {openCompetitions.length > 1 && <label>Competition<select value={competitionId} onChange={(event) => setCompetitionId(event.target.value)} required><option value="">Choose a challenge</option>{openCompetitions.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>}
      <label>Team name<input value={teamName} onChange={(event) => setTeamName(event.target.value)} maxLength={80} required placeholder="Something your team will answer to" disabled={unavailable || !openCompetitions.length} /></label>
      <label>School<input value={school} onChange={(event) => setSchool(event.target.value)} maxLength={120} required placeholder="Your school’s name" disabled={unavailable || !openCompetitions.length} /></label>
      <div className="form-row"><label>Captain’s name<input value={captain} onChange={(event) => setCaptain(event.target.value)} maxLength={80} required placeholder="Full name" disabled={unavailable || !openCompetitions.length} /></label><label>Captain’s email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="captain@school.edu" disabled={unavailable || !openCompetitions.length} /></label></div>
      <label>Captain’s phone <span className="optional-label">OPTIONAL</span><input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} maxLength={30} placeholder="Include country code if possible" disabled={unavailable || !openCompetitions.length} /></label>
      <label>Teammates <span className="optional-label">ONE NAME PER LINE</span><textarea rows={3} value={teammates} onChange={(event) => setTeammates(event.target.value)} maxLength={1000} placeholder={"Add your teammates’ names"} disabled={unavailable || !openCompetitions.length} /></label>
      <button className="button button-lime full-width" type="submit" disabled={busy || unavailable || !openCompetitions.length}>{busy ? "Sending registration…" : "Register our team"} <ArrowRight size={15} /></button>
    </form>
    <p className="form-footnote">A VCKAIA organizer will follow up with the captain. A member account isn't required.</p>
  </ModalFrame>;
}

function SubmissionModal({ profile, onAuth, onClose, notify }: { profile: Profile | null; onAuth: () => void; onClose: () => void; notify: (message: string, tone?: Toast["tone"]) => void }) {
  const [kind, setKind] = useState<"project" | "news">("project");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile) { notify("Sign in as a member to send a submission.", "error"); onClose(); onAuth(); return; }
    if (!isFirebaseConfigured) { notify("Submissions are unavailable until Firebase is configured.", "error"); return; }
    setBusy(true);
    try {
      await createMemberSubmission({ user_id: profile.id, kind, title: title.trim(), summary: summary.trim(), body: body.trim(), ...(imageUrl ? { image_url: imageUrl } : {}) });
      notify("Submission sent to the VCKAIA team for review.");
      onClose();
    } catch (error) {
      notify(`Submission was not sent: ${error instanceof Error ? error.message : "Unknown Firebase error"}`, "error");
    } finally { setBusy(false); }
  };
  return <ModalFrame onClose={onClose} label="Submit a project or story">
    <div className="modal-eyebrow"><Sparkles size={15} /> MEMBER SUBMISSION</div><h2>Put the idea out there.</h2><p className="modal-intro">Pitch a project or a useful AI/tech story. The VCKAIA team reviews submissions before anything goes public.</p>
    {!profile && <ConfigHint text="Member sign-in is required before you can submit an idea." />}
    {!isFirebaseConfigured && <ConfigHint text="Submission review is not available until the site team connects Firebase." />}
    <form className="form-stack" onSubmit={(event) => void submit(event)}>
      <label>What are you sharing?<select value={kind} onChange={(event) => setKind(event.target.value as "project" | "news")}><option value="project">A project I’m building</option><option value="news">A story or resource worth sharing</option></select></label>
      <label>Title<input required value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} placeholder="A short, clear headline" disabled={!profile || !isFirebaseConfigured} /></label>
      <label>Quick summary<textarea rows={2} required value={summary} onChange={(event) => setSummary(event.target.value)} maxLength={300} placeholder="What should someone know first?" disabled={!profile || !isFirebaseConfigured} /></label>
      <label>More detail<textarea rows={4} required value={body} onChange={(event) => setBody(event.target.value)} maxLength={5000} placeholder="Tell us what makes it useful or interesting…" disabled={!profile || !isFirebaseConfigured} /></label>
      <CloudinaryImageField imageUrl={imageUrl} onChange={setImageUrl} disabled={!profile || !isFirebaseConfigured} />
      <button className="button button-lime full-width" type="submit" disabled={busy || !profile || !isFirebaseConfigured}>{busy ? "Sending for review…" : "Send for review"} <ArrowRight size={15} /></button>
    </form>
  </ModalFrame>;
}

function AssistantModal({ profile, onAuth, onClose, notify }: { profile: Profile | null; onAuth: () => void; onClose: () => void; notify: (message: string, tone?: Toast["tone"]) => void }) {
  const [question, setQuestion] = useState("");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const ask = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile || !isFirebaseConfigured) { notify("Sign in as a member to use the AI desk.", "error"); onClose(); onAuth(); return; }
    setBusy(true);
    setReply("");
    try {
      const data = await askVckaiaAssistant(question.trim());
      setReply(data.answer);
    } catch (error) {
      notify(`The AI desk is unavailable: ${error instanceof Error ? error.message : "Unknown Firebase error"}`, "error");
    } finally { setBusy(false); }
  };
  return <ModalFrame onClose={onClose} label="VCKAIA AI desk">
    <div className="modal-eyebrow"><Bot size={15} /> VCKAIA AI DESK</div><h2>A helpful place to start.</h2><p className="modal-intro">Ask about VCKAIA, AI and tech learning, or ideas for a project. The assistant is grounded in published association content and redirects unrelated questions.</p>
    {!profile && <ConfigHint text="Sign in to use the AI desk. The Gemini key is held server-side and never sent to your browser." />}
    {!isFirebaseConfigured && <ConfigHint text="The AI assistant needs Firebase Cloud Functions and a server-side GEMINI_API_KEY before it can reply." />}
    {reply && <div className="assistant-reply"><Bot size={17} /><p>{reply}</p></div>}
    <form className="assistant-form" onSubmit={(event) => void ask(event)}><label className="visually-hidden" htmlFor="assistant-question">Your question</label><textarea id="assistant-question" rows={3} maxLength={1200} required value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="How can I get started with a small AI project?" disabled={!profile || !isFirebaseConfigured} /><button className="button button-lime full-width" disabled={busy || !profile || !isFirebaseConfigured}>{busy ? "Thinking…" : "Ask the VCKAIA desk"} <ArrowRight size={15} /></button></form>
  </ModalFrame>;
}

function ToastMessage({ toast }: { toast: Toast | null }) {
  if (!toast) return null;
  return <div className={`toast toast-${toast.tone}`} role="status"><span>{toast.tone === "success" ? <Check size={17} /> : <X size={17} />}</span>{toast.message}</div>;
}

function AdminPortal({ profile, authLoading, canManage, canManageCompetitions, canManageUsers, basePath, tab, setTab, onAuth, onBack, notify }: {
  profile: Profile | null;
  authLoading: boolean;
  canManage: boolean;
  canManageCompetitions: boolean;
  canManageUsers: boolean;
  basePath: string;
  tab: AdminTab;
  setTab: (tab: AdminTab) => void;
  onAuth: () => void;
  onBack: () => void;
  notify: (message: string, tone?: Toast["tone"]) => void;
}) {
  const [adminEvents, setAdminEvents] = useState<EventItem[]>([]);
  const [adminCompetitions, setAdminCompetitions] = useState<Competition[]>([]);
  const [series, setSeries] = useState<{ id: string; title: string; status: string }[]>([]);
  const [registrations, setRegistrations] = useState<TeamRegistration[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [contentItems, setContentItems] = useState<AdminContentItem[]>([]);
  const [managedQuestions, setManagedQuestions] = useState<ManagedQuestion[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [results, setResults] = useState<CompetitionResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [eventTitle, setEventTitle] = useState("");
  const [eventSummary, setEventSummary] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [compTitle, setCompTitle] = useState("");
  const [compDescription, setCompDescription] = useState("");
  const [compSeriesId, setCompSeriesId] = useState("");
  const [seriesTitle, setSeriesTitle] = useState("");
  const [registrationFilter, setRegistrationFilter] = useState("");
  const [scoreEntry, setScoreEntry] = useState<{ registrationId: string; score: string }>({ registrationId: "", score: "" });
  const [questionPrompt, setQuestionPrompt] = useState("");
  const [questionChoices, setQuestionChoices] = useState("");
  const [questionCorrect, setQuestionCorrect] = useState("0");
  const [questionSequence, setQuestionSequence] = useState("1");
  const [questionStatus, setQuestionStatus] = useState<"draft" | "published">("draft");
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [contentType, setContentType] = useState<"news" | "project">("news");
  const [contentTitle, setContentTitle] = useState("");
  const [contentSummary, setContentSummary] = useState("");
  const [contentBody, setContentBody] = useState("");
  const [contentImageUrl, setContentImageUrl] = useState("");
  const [contentStatus, setContentStatus] = useState<"draft" | "published">("draft");
  const [editingContentId, setEditingContentId] = useState<string | null>(null);
  const parsedQuestionChoices = questionChoices.split(/\r?\n/).map((choice) => choice.trim()).filter(Boolean);

  const refresh = useCallback(async () => {
    if (!isFirebaseConfigured || !canManage) return;
    setLoading(true);
    try {
      const data = await getAdminDashboardData(canManageCompetitions);
      setAdminEvents(data.events);
      setAdminCompetitions(data.competitions);
      setSeries(data.series);
      setRegistrations(data.registrations);
      setSubmissions(data.submissions);
      setResults(data.results);
      setMembers(data.members);
      setManagedQuestions(data.questions);
      setContentItems(data.contentItems);
    } catch (error) {
      notify(`Dashboard data could not be loaded: ${error instanceof Error ? error.message : "Unknown Firebase error"}`, "error");
    } finally { setLoading(false); }
  }, [canManage, canManageCompetitions, notify]);

  useEffect(() => { void refresh(); }, [refresh]);

  if (!isFirebaseConfigured) return <div className="portal-shell"><header className="portal-topbar"><a className="brand" href={basePath}><span className="brand-mark"><Command size={19} /></span><span className="brand-word">VCK<span>AI</span>A</span></a><button className="text-link" onClick={onBack}>Back to website <ArrowUpRight size={14} /></button></header><main className="portal-gate"><Shield size={29} /><div className="eyebrow">VCKAIA / ADMIN PORTAL</div><h1>Dashboard setup needed.</h1><p>Connect Firebase and deploy the included Firestore rules and Cloud Functions before member accounts or the admin dashboard can be used. No admin access is enabled in preview mode.</p><a className="button button-lime" href={basePath}>Back to the public site <ArrowRight size={15} /></a></main></div>;

  if (authLoading) return <div className="portal-gate"><div className="loading-spinner" /><p>Checking your access…</p></div>;
  if (!profile) return <div className="portal-shell"><header className="portal-topbar"><a className="brand" href={basePath}><span className="brand-mark"><Command size={19} /></span><span className="brand-word">VCK<span>AI</span>A</span></a><button className="text-link" onClick={onBack}>Back to website <ArrowUpRight size={14} /></button></header><main className="portal-gate"><Shield size={29} /><div className="eyebrow">VCKAIA / ADMIN PORTAL</div><h1>For the association team.</h1><p>Sign in with an account that an existing VCKAIA owner has granted access to. New member accounts don’t get admin access automatically.</p><button className="button button-lime" onClick={onAuth}>Member sign in <ArrowRight size={15} /></button></main></div>;
  if (!canManage) return <div className="portal-shell"><header className="portal-topbar"><a className="brand" href={basePath}><span className="brand-mark"><Command size={19} /></span><span className="brand-word">VCK<span>AI</span>A</span></a><button className="text-link" onClick={onBack}>Back to website <ArrowUpRight size={14} /></button></header><main className="portal-gate"><Shield size={29} /><div className="eyebrow">MEMBER ACCESS ONLY</div><h1>This door is for the team.</h1><p>Your VCKAIA member account doesn’t have a dashboard role. An existing owner can grant editor, admin or owner access.</p><button className="button button-outline" onClick={() => void handleSignOut(notify, () => undefined)}>Sign out <ArrowRight size={15} /></button></main></div>;

  const createEvent = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await addRecord("events", { title: eventTitle.trim(), summary: eventSummary.trim(), location: eventLocation.trim() || "Location to be announced", starts_at: eventDate || new Date().toISOString(), status: "draft" });
      setEventTitle(""); setEventSummary(""); setEventLocation(""); setEventDate(""); notify("Draft event created."); void refresh();
    } catch (error) { notify(`Event was not created: ${error instanceof Error ? error.message : "Unknown Firebase error"}`, "error"); }
  };
  const setEventStatus = async (id: string, status: EventItem["status"]) => {
    try { await updateRecord("events", id, { status }); notify(`Event ${status === "published" ? "published" : status === "archived" ? "archived" : "saved as draft"}.`); void refresh(); }
    catch (error) { notify(`Event update failed: ${error instanceof Error ? error.message : "Unknown Firebase error"}`, "error"); }
  };
  const createSeries = async (event: FormEvent) => {
    event.preventDefault();
    try { await addRecord("competitionSeries", { title: seriesTitle.trim(), status: "active" }); setSeriesTitle(""); notify("Competition series created."); void refresh(); }
    catch (error) { notify(`Competition series was not created: ${error instanceof Error ? error.message : "Unknown Firebase error"}`, "error"); }
  };
  const updateSeriesStatus = async (id: string, status: "active" | "archived") => {
    try { await updateRecord("competitionSeries", id, { status }); notify(`Competition series ${status === "active" ? "reactivated" : "archived"}.`); void refresh(); }
    catch (error) { notify(`Competition series update failed: ${error instanceof Error ? error.message : "Unknown Firebase error"}`, "error"); }
  };
  const createCompetition = async (event: FormEvent) => {
    event.preventDefault();
    if (!compSeriesId) { notify("Create or choose a competition series first.", "error"); return; }
    try { await addRecord("competitions", { title: compTitle.trim(), description: compDescription.trim(), series_id: compSeriesId, status: "draft", registration_open: false }); setCompTitle(""); setCompDescription(""); notify("Draft competition created."); void refresh(); }
    catch (error) { notify(`Competition was not created: ${error instanceof Error ? error.message : "Unknown Firebase error"}`, "error"); }
  };
  const updateCompetition = async (id: string, updates: Record<string, boolean | string>) => {
    const safeUpdates = updates.status && updates.status !== "published" ? { ...updates, registration_open: false } : updates;
    try { await updateRecord("competitions", id, safeUpdates); notify("Competition updated."); void refresh(); }
    catch (error) { notify(`Competition update failed: ${error instanceof Error ? error.message : "Unknown Firebase error"}`, "error"); }
  };
  const updateSubmission = async (submission: Submission, status: "approved" | "rejected") => {
    try { await reviewMemberSubmission(submission.id, status); notify(status === "approved" ? "Submission approved and published." : "Submission declined."); void refresh(); }
    catch (error) { notify(`Submission review was not completed: ${error instanceof Error ? error.message : "Unknown Firebase error"}`, "error"); }
  };
  const saveResult = async (event: FormEvent) => {
    event.preventDefault();
    const registration = registrations.find((item) => item.id === scoreEntry.registrationId);
    if (!registration || !scoreEntry.score || Number(scoreEntry.score) < 0) { notify("Choose a team and enter a non-negative score.", "error"); return; }
    try { await recordCompetitionResult(registration.id, Number(scoreEntry.score)); setScoreEntry({ registrationId: "", score: "" }); notify("Competition result saved."); void refresh(); }
    catch (error) { notify(`Competition result was not saved: ${error instanceof Error ? error.message : "Unknown Firebase error"}`, "error"); }
  };
  const resetQuestionForm = () => {
    setEditingQuestionId(null);
    setQuestionPrompt("");
    setQuestionChoices("");
    setQuestionCorrect("0");
    setQuestionSequence(String(managedQuestions.length + 1));
    setQuestionStatus("draft");
  };
  const saveQuestion = async (event: FormEvent) => {
    event.preventDefault();
    const choices = parsedQuestionChoices;
    const correctChoice = Number(questionCorrect);
    if (!isFirebaseConfigured || choices.length < 2 || choices.length > 5 || correctChoice < 0 || correctChoice >= choices.length) {
      notify("Add 2–5 answer choices and select the correct one.", "error");
      return;
    }
    const question = { prompt: questionPrompt.trim(), choices, correct_choice: correctChoice, sequence: Number(questionSequence), status: questionStatus };
    try {
      if (editingQuestionId) await updateRecord("quickQuizQuestions", editingQuestionId, question);
      else await addRecord("quickQuizQuestions", question);
      notify(editingQuestionId ? "Quiz question updated." : "Quiz question added."); resetQuestionForm(); void refresh();
    } catch (error) { notify(`Quiz question was not saved: ${error instanceof Error ? error.message : "Unknown Firebase error"}`, "error"); }
  };
  const editQuestion = (question: ManagedQuestion) => {
    setEditingQuestionId(question.id);
    setQuestionPrompt(question.prompt);
    setQuestionChoices(question.choices.join("\n"));
    setQuestionCorrect(String(question.correct_choice));
    setQuestionSequence(String(question.sequence));
    setQuestionStatus(question.status === "published" ? "published" : "draft");
  };
  const updateQuestionStatus = async (question: ManagedQuestion, status: "draft" | "published" | "archived") => {
    try { await updateRecord("quickQuizQuestions", question.id, { status }); notify(`Question ${status === "published" ? "published" : status === "archived" ? "archived" : "unpublished"}.`); void refresh(); }
    catch (error) { notify(`Quiz question status was not updated: ${error instanceof Error ? error.message : "Unknown Firebase error"}`, "error"); }
  };
  const resetContentForm = () => {
    setEditingContentId(null);
    setContentType("news");
    setContentTitle("");
    setContentSummary("");
    setContentBody("");
    setContentImageUrl("");
    setContentStatus("draft");
  };
  const saveContentItem = async (event: FormEvent) => {
    event.preventDefault();
    const item = { type: contentType, title: contentTitle.trim(), summary: contentSummary.trim(), body: contentBody.trim(), status: contentStatus, ...(contentImageUrl ? { image_url: contentImageUrl } : {}) };
    try {
      if (editingContentId) await updateRecord("contentItems", editingContentId, item);
      else await addRecord("contentItems", item);
      notify(editingContentId ? "Content updated." : "Content added."); resetContentForm(); void refresh();
    } catch (error) { notify(`Content could not be saved: ${error instanceof Error ? error.message : "Unknown Firebase error"}`, "error"); }
  };
  const editContentItem = (item: AdminContentItem) => {
    setEditingContentId(item.id);
    setContentType(item.type);
    setContentTitle(item.title);
    setContentSummary(item.summary);
    setContentBody(item.body);
    setContentImageUrl(item.image_url ?? "");
    setContentStatus(item.status === "published" ? "published" : "draft");
  };
  const updateContentStatus = async (item: AdminContentItem, status: "draft" | "published" | "archived") => {
    try { await updateRecord("contentItems", item.id, { status }); notify(`Content ${status === "published" ? "published" : status === "archived" ? "archived" : "unpublished"}.`); void refresh(); }
    catch (error) { notify(`Content status was not updated: ${error instanceof Error ? error.message : "Unknown Firebase error"}`, "error"); }
  };
  const changeRole = async (memberId: string, role: Profile["role"]) => {
    if (!canManageUsers) return;
    try { await assignMemberRole(memberId, role); notify("Member role updated."); void refresh(); }
    catch (error) { notify(`Role could not be changed: ${error instanceof Error ? error.message : "Unknown Firebase error"}`, "error"); }
  };

  const tabs: { id: AdminTab; label: string; count?: number }[] = [
    { id: "overview", label: "Overview" }, { id: "events", label: "Events", count: adminEvents.length },
    ...(canManageCompetitions ? [{ id: "competitions" as const, label: "Competitions", count: adminCompetitions.length }] : []),
    ...(canManageCompetitions ? [{ id: "registrations" as const, label: "Team registrations", count: registrations.length }] : []),
    { id: "quizzes", label: "Quick quizzes", count: managedQuestions.length },
    { id: "submissions", label: "Submissions", count: submissions.filter((item) => item.status === "pending").length },
    { id: "content", label: "News & projects", count: contentItems.length },
    { id: "members", label: "Members", count: members.length },
  ];
  const pending = submissions.filter((item) => item.status === "pending");
  const standings = new Map<string, { name: string; school: string; score: number }>();
  for (const result of results) {
    const seriesId = result.competition?.series_id;
    if (!seriesId || !result.team) continue;
    const key = `${seriesId}/${result.team.school.trim().toLocaleLowerCase()}/${result.team.team_name.trim().toLocaleLowerCase()}`;
    const existing = standings.get(key) ?? { name: result.team?.team_name ?? "Team", school: result.team?.school ?? "", score: 0 };
    existing.score += Number(result.score);
    standings.set(key, existing);
  }
  const displayedSeriesId = series.find((item) => item.status === "active")?.id;
  const seriesStandings = [...standings.entries()].filter(([key]) => key.startsWith(`${displayedSeriesId}/`)).map(([, row]) => row).sort((a, b) => b.score - a.score).slice(0, 5);
  const filteredRegistrations = registrationFilter ? registrations.filter((item) => item.competition_id === registrationFilter) : registrations;

  return <div className="portal-shell">
    <header className="portal-topbar"><a className="brand" href={basePath}><span className="brand-mark"><Command size={19} /></span><span className="brand-word">VCK<span>AI</span>A</span><span className="brand-divider" /><span className="brand-sub">ASSOCIATION<br />DASHBOARD</span></a><div className="portal-user"><span>{profile.display_name}</span><span className="role-pill">{profile.role.toUpperCase()}</span><button className="text-link" onClick={() => void handleSignOut(notify, () => undefined)}>Sign out</button></div></header>
    <div className="portal-layout">
      <aside className="portal-sidebar"><a className="back-site" href={basePath}>← Public website</a><div className="sidebar-label">WORKSPACE</div>{tabs.map((item) => <button key={item.id} className={`sidebar-link ${tab === item.id ? "active" : ""}`} onClick={() => setTab(item.id)}>{item.label}{item.count !== undefined && <span>{item.count}</span>}</button>)}<div className="sidebar-tip"><Shield size={16} /><p><strong>Keep it reviewed.</strong><br />Member submissions stay private until an editor publishes them.</p></div></aside>
      <main className="portal-main">
        <div className="portal-heading"><div><div className="eyebrow">VCKAIA / {tab.toUpperCase()}</div><h1>{tab === "overview" ? `Welcome, ${profile.display_name.split(" ")[0]}.` : tabs.find((item) => item.id === tab)?.label}</h1></div><div className="portal-heading-actions"><span className="sync-state"><span className="live-dot" /> LIVE WORKSPACE</span><button className="button button-outline button-small" onClick={() => void refresh()}>Refresh <ArrowUpRight size={14} /></button></div></div>
        {loading && <div className="portal-loading"><div className="loading-spinner" /> Syncing your workspace…</div>}
        {!loading && tab === "overview" && <div className="dashboard-overview">
          <div className="dashboard-stats"><StatCard value={adminEvents.length} label="EVENTS" detail="All event drafts and announcements" /><StatCard value={adminCompetitions.length} label="COMPETITIONS" detail={`${series.length} active competition series`} /><StatCard value={canManageCompetitions ? registrations.length : 0} label="TEAM REGISTRATIONS" detail={canManageCompetitions ? "Across all inter-school challenges" : "Available to admins and owners"} /><StatCard value={pending.length} label="NEEDS REVIEW" detail="Member ideas awaiting a decision" /></div>
          <div className="dashboard-grid"><section className="dashboard-panel"><div className="panel-title"><div><span className="eyebrow">YOUR NEXT ACTIONS</span><h2>Keep things moving.</h2></div></div><div className="action-list"><button onClick={() => setTab("submissions")}><span className="action-icon"><Sparkles size={17} /></span><span><strong>Review member submissions</strong><small>{pending.length ? `${pending.length} waiting for a decision` : "Nothing in the inbox right now"}</small></span><ArrowRight size={15} /></button>{canManageCompetitions && <button onClick={() => setTab("registrations")}><span className="action-icon"><Trophy size={17} /></span><span><strong>Check team registrations</strong><small>{registrations.length} team{registrations.length === 1 ? "" : "s"} across open challenges</small></span><ArrowRight size={15} /></button>}<button onClick={() => setTab("events")}><span className="action-icon"><Cpu size={17} /></span><span><strong>Publish an association event</strong><small>{adminEvents.filter((item) => item.status === "draft").length} event drafts</small></span><ArrowRight size={15} /></button></div></section>
          <section className="dashboard-panel"><div className="panel-title"><div><span className="eyebrow">SEASON STANDINGS</span><h2>Teams, across the series.</h2></div><Trophy size={19} /></div>{seriesStandings.length ? <ol className="standings-list">{seriesStandings.map((row, i) => <li key={`${row.name}-${i}`}><span className="rank">{String(i + 1).padStart(2, "0")}</span><span><strong>{row.name}</strong><small>{row.school}</small></span><b>{row.score} <small>PTS</small></b></li>)}</ol> : <div className="admin-empty">{canManageCompetitions ? "Results entered after each competition contribute to the season standings." : "Admins and owners manage private inter-school registrations and scoring."}</div>}</section></div>
        </div>}
        {!loading && tab === "events" && <div className="admin-content-grid"><section className="dashboard-panel"><div className="panel-title"><div><span className="eyebrow">CREATE ANNOUNCEMENT</span><h2>Put it on the calendar.</h2></div></div><form className="form-stack admin-form" onSubmit={(event) => void createEvent(event)}><label>Event title<input value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} maxLength={120} required placeholder="e.g. Build your first chatbot" /></label><label>Short description<textarea rows={3} value={eventSummary} onChange={(event) => setEventSummary(event.target.value)} maxLength={500} required placeholder="What will students learn or do?" /></label><div className="form-row"><label>When<input type="datetime-local" value={eventDate} onChange={(event) => setEventDate(event.target.value)} required /></label><label>Where<input value={eventLocation} onChange={(event) => setEventLocation(event.target.value)} maxLength={120} placeholder="Room or meeting link" /></label></div><button className="button button-lime" type="submit">Create event draft <Plus size={15} /></button></form></section><section className="dashboard-panel"><div className="panel-title"><div><span className="eyebrow">EVENT BOARD</span><h2>Drafts and published.</h2></div><span className="count-pill">{adminEvents.length}</span></div><div className="admin-record-list">{adminEvents.length ? adminEvents.map((item) => <div className="admin-record" key={item.id}><div><strong>{item.title}</strong><small>{formatDate(item.starts_at)} · {item.location}</small></div><div className="record-actions"><span className={`status-pill status-${item.status}`}>{item.status}</span>{item.status !== "published" && <button className="tiny-action" onClick={() => void setEventStatus(item.id, "published")}>Publish</button>}{item.status !== "archived" && <button className="tiny-action subdued" onClick={() => void setEventStatus(item.id, "archived")}>Archive</button>}</div></div>) : <div className="admin-empty">No events yet. Create a draft to get started.</div>}</div></section></div>}
        {!loading && tab === "competitions" && <div className="admin-content-grid"><section className="dashboard-panel"><div className="panel-title"><div><span className="eyebrow">SEASON STRUCTURE</span><h2>Group competitions.</h2></div></div><form className="inline-create" onSubmit={(event) => void createSeries(event)}><label htmlFor="series-title">New series</label><div><input id="series-title" value={seriesTitle} onChange={(event) => setSeriesTitle(event.target.value)} maxLength={120} required placeholder="e.g. VCKAIA Challenge Season 01" /><button className="button button-lime button-small"><Plus size={15} /> Create</button></div></form><div className="series-list">{series.length ? series.map((item) => <div className="series-record" key={item.id}><span className="series-badge"><Trophy size={16} /></span><span><strong>{item.title}</strong><small>{adminCompetitions.filter((comp) => comp.series_id === item.id).length} competitions · {item.status}</small></span><button className="tiny-action" onClick={() => void updateSeriesStatus(item.id, item.status === "active" ? "archived" : "active")}>{item.status === "active" ? "Archive" : "Reactivate"}</button></div>) : <div className="admin-empty">Create a series to group challenges and calculate season standings.</div>}</div></section><section className="dashboard-panel"><div className="panel-title"><div><span className="eyebrow">NEW CHALLENGE</span><h2>Open the challenge board.</h2></div></div><form className="form-stack admin-form" onSubmit={(event) => void createCompetition(event)}><label>Competition title<input value={compTitle} onChange={(event) => setCompTitle(event.target.value)} required maxLength={120} placeholder="Name this challenge" /></label><label>Description<textarea value={compDescription} onChange={(event) => setCompDescription(event.target.value)} required maxLength={500} rows={3} placeholder="What will teams do?" /></label><label>Competition series<select value={compSeriesId} onChange={(event) => setCompSeriesId(event.target.value)} required><option value="">Choose a series</option>{series.filter((item) => item.status === "active").map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label><button className="button button-lime" type="submit">Create draft competition <Plus size={15} /></button></form></section><section className="dashboard-panel panel-full"><div className="panel-title"><div><span className="eyebrow">CHALLENGE BOARD</span><h2>Publish and open registration.</h2></div></div><div className="admin-record-list">{adminCompetitions.length ? adminCompetitions.map((item) => <div className="admin-record" key={item.id}><div><strong>{item.title}</strong><small>{item.description}</small><small>{series.find((row) => row.id === item.series_id)?.title ?? "No series"}</small></div><div className="record-actions"><span className={`status-pill status-${item.status}`}>{item.status}</span><button className="tiny-action" onClick={() => void updateCompetition(item.id, { status: item.status === "published" ? "draft" : "published" })}>{item.status === "published" ? "Unpublish" : "Publish"}</button><button className={`tiny-action ${item.registration_open ? "subdued" : ""}`} disabled={item.status !== "published"} onClick={() => void updateCompetition(item.id, { registration_open: !item.registration_open })}>{item.registration_open ? "Close entries" : "Open entries"}</button></div></div>) : <div className="admin-empty">Create a series, then add a challenge.</div>}</div></section></div>}
        {!loading && tab === "registrations" && <div className="dashboard-grid"><section className="dashboard-panel"><div className="panel-title"><div><span className="eyebrow">INTER-SCHOOL ENTRIES</span><h2>Teams from every school.</h2></div><span className="count-pill">{registrations.length}</span></div><label className="filter-label">Filter by challenge<select value={registrationFilter} onChange={(event) => setRegistrationFilter(event.target.value)}><option value="">All competitions</option>{adminCompetitions.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label><div className="registration-list">{filteredRegistrations.length ? filteredRegistrations.map((item) => <article className="registration-record" key={item.id}><div className="record-number">{item.team_name.slice(0, 1).toUpperCase()}</div><div><strong>{item.team_name}</strong><span>{item.school} · {adminCompetitions.find((comp) => comp.id === item.competition_id)?.title ?? "Competition"}</span><small>Captain: {item.captain_name} · <a href={`mailto:${item.captain_email}`}>{item.captain_email}</a>{item.captain_phone ? ` · ${item.captain_phone}` : ""}</small>{item.teammate_names.length > 0 && <small>Team: {item.teammate_names.join(", ")}</small>}</div></article>) : <div className="admin-empty">No team registrations yet.</div>}</div></section><section className="dashboard-panel"><div className="panel-title"><div><span className="eyebrow">COMPETITION RESULTS</span><h2>Enter the points.</h2></div></div><form className="form-stack admin-form" onSubmit={(event) => void saveResult(event)}><label>Registered team<select value={scoreEntry.registrationId} onChange={(event) => setScoreEntry({ ...scoreEntry, registrationId: event.target.value })} required><option value="">Choose a team</option>{registrations.map((item) => <option value={item.id} key={item.id}>{item.team_name} — {adminCompetitions.find((comp) => comp.id === item.competition_id)?.title ?? "Competition"}</option>)}</select></label><label>Score<input type="number" min="0" max="1000000" step="1" value={scoreEntry.score} onChange={(event) => setScoreEntry({ ...scoreEntry, score: event.target.value })} required placeholder="Points earned" /></label><button className="button button-lime">Save competition result <Check size={15} /></button></form><div className="admin-empty">Scores are grouped by competition series to show cumulative team standings.</div></section><section className="dashboard-panel panel-full"><div className="panel-title"><div><span className="eyebrow">RESULTS LEDGER</span><h2>Scores entered so far.</h2></div></div><div className="admin-record-list">{results.length ? results.map((item) => <div className="admin-record" key={item.id}><div><strong>{item.team?.team_name ?? "Team"} · {item.team?.school ?? "School"}</strong><small>{item.competition?.title ?? "Competition"} · {series.find((row) => row.id === item.competition?.series_id)?.title ?? "Series"}</small></div><b className="result-points">{item.score} PTS</b></div>) : <div className="admin-empty">Competition results will appear here after scoring.</div>}</div></section></div>}
        {!loading && tab === "quizzes" && <div className="admin-content-grid"><section className="dashboard-panel"><div className="panel-title"><div><span className="eyebrow">{editingQuestionId ? "EDIT QUESTION" : "QUIZ EDITOR"}</span><h2>{editingQuestionId ? "Tune the question." : "Write a quick quiz."}</h2><p className="panel-description">Publish up to ten questions. Correct answers stay private on the server and scores are checked before saving.</p></div></div><form className="form-stack admin-form" onSubmit={(event) => void saveQuestion(event)}><label>Question<input value={questionPrompt} onChange={(event) => setQuestionPrompt(event.target.value)} minLength={5} maxLength={300} required placeholder="Write a clear AI or tech question" /></label><label>Answer choices <span className="optional-label">ONE PER LINE · 2–5</span><textarea rows={5} value={questionChoices} onChange={(event) => setQuestionChoices(event.target.value)} required placeholder={"First answer\nSecond answer\nThird answer"} /></label><label>Correct answer<select value={questionCorrect} onChange={(event) => setQuestionCorrect(event.target.value)}>{parsedQuestionChoices.map((choice, index) => <option key={index} value={index}>{String.fromCharCode(65 + index)} · {choice}</option>)}</select></label><div className="form-row"><label>Question order<input type="number" min="0" max="1000" value={questionSequence} onChange={(event) => setQuestionSequence(event.target.value)} required /></label><label>Visibility<select value={questionStatus} onChange={(event) => setQuestionStatus(event.target.value as "draft" | "published")}><option value="draft">Draft</option><option value="published">Published</option></select></label></div><div className="review-actions"><button className="button button-lime" type="submit">{editingQuestionId ? "Save question" : "Add question"} <Plus size={14} /></button>{editingQuestionId && <button className="button button-outline" type="button" onClick={resetQuestionForm}>Cancel edit</button>}</div></form></section><section className="dashboard-panel"><div className="panel-title"><div><span className="eyebrow">QUESTION BANK</span><h2>{managedQuestions.length} questions.</h2></div></div><div className="admin-record-list">{managedQuestions.length ? managedQuestions.map((question) => <article className="question-record" key={question.id}><div className="review-meta"><span className={`status-pill status-${question.status}`}>{question.status}</span><span className="question-order">#{question.sequence}</span></div><h3>{question.prompt}</h3><p>Correct: {question.choices[question.correct_choice] ?? "Not set"}</p><div className="review-actions"><button className="tiny-action" onClick={() => editQuestion(question)}>Edit</button><button className="tiny-action" onClick={() => void updateQuestionStatus(question, question.status === "published" ? "draft" : "published")}>{question.status === "published" ? "Unpublish" : "Publish"}</button>{question.status !== "archived" && <button className="tiny-action subdued" onClick={() => void updateQuestionStatus(question, "archived")}>Archive</button>}</div></article>) : <div className="admin-empty">Add questions for students to answer. Draft questions won’t appear in the public quiz.</div>}</div></section></div>}
        {!loading && tab === "content" && <div className="admin-content-grid">
          <section className="dashboard-panel">
            <div className="panel-title"><div><span className="eyebrow">{editingContentId ? "EDIT CONTENT" : "PUBLISHING DESK"}</span><h2>{editingContentId ? "Update the story." : "Share a useful signal."}</h2></div></div>
            <form className="form-stack admin-form" onSubmit={(event) => void saveContentItem(event)}>
              <label>Content type<select value={contentType} onChange={(event) => setContentType(event.target.value as "news" | "project")}><option value="news">Weekly AI / tech news</option><option value="project">Member project</option></select></label>
              <label>Title<input value={contentTitle} onChange={(event) => setContentTitle(event.target.value)} maxLength={120} minLength={3} required placeholder="A clear, useful headline" /></label>
              <label>Summary<textarea rows={2} value={contentSummary} onChange={(event) => setContentSummary(event.target.value)} maxLength={300} minLength={3} required placeholder="Short preview for the public site" /></label>
              <label>Full story<textarea rows={5} value={contentBody} onChange={(event) => setContentBody(event.target.value)} maxLength={5000} minLength={3} required placeholder="The full story, project description, or learning resource" /></label>
              <CloudinaryImageField imageUrl={contentImageUrl} onChange={setContentImageUrl} />
              <label>Visibility<select value={contentStatus} onChange={(event) => setContentStatus(event.target.value as "draft" | "published")}><option value="draft">Draft</option><option value="published">Publish now</option></select></label>
              <div className="review-actions"><button className="button button-lime" type="submit">{editingContentId ? "Save changes" : "Create content"} <Plus size={14} /></button>{editingContentId && <button className="button button-outline" type="button" onClick={resetContentForm}>Cancel edit</button>}</div>
            </form>
          </section>
          <section className="dashboard-panel">
            <div className="panel-title"><div><span className="eyebrow">NEWS & PROJECTS</span><h2>{contentItems.length} content items.</h2><p className="panel-description">Approved submissions appear here too. Only published items show on the public site and AI desk.</p></div></div>
            <div className="admin-record-list">{contentItems.length ? contentItems.map((item) => <article className="question-record" key={item.id}><div className="review-meta"><span className="eyebrow">{item.type.toUpperCase()}</span><span className={`status-pill status-${item.status}`}>{item.status}</span></div>{item.image_url && <img className="admin-content-cover" src={item.image_url} alt="" loading="lazy" />}<h3>{item.title}</h3><p>{item.summary}</p><div className="review-actions"><button className="tiny-action" onClick={() => editContentItem(item)}>Edit</button><button className="tiny-action" onClick={() => void updateContentStatus(item, item.status === "published" ? "draft" : "published")}>{item.status === "published" ? "Unpublish" : "Publish"}</button>{item.status !== "archived" && <button className="tiny-action subdued" onClick={() => void updateContentStatus(item, "archived")}>Archive</button>}</div></article>) : <div className="admin-empty">No content has been published yet.</div>}</div>
          </section>
        </div>}
        {!loading && tab === "submissions" && <section className="dashboard-panel"><div className="panel-title"><div><span className="eyebrow">MEMBER REVIEW QUEUE</span><h2>Good ideas get a second look.</h2></div><span className="count-pill">{pending.length} pending</span></div><div className="submission-review-list">{submissions.length ? submissions.map((item) => <article className="review-card" key={item.id}><div className="review-meta"><span className="eyebrow">{item.kind.toUpperCase()} / {formatDate(item.created_at)}</span><span className={`status-pill status-${item.status}`}>{item.status}</span></div><h3>{item.title}</h3><p className="review-summary">{item.summary}</p>{item.image_url && <img className="admin-content-cover" src={item.image_url} alt="" loading="lazy" />}<p>{item.body}</p>{item.status === "pending" && <div className="review-actions"><button className="button button-lime button-small" onClick={() => void updateSubmission(item, "approved")}><Check size={14} /> Approve & publish</button><button className="button button-outline button-small" onClick={() => void updateSubmission(item, "rejected")}>Decline</button></div>}</article>) : <div className="admin-empty">No submissions yet. New member pitches will appear here for review.</div>}</div></section>}
        {!loading && tab === "members" && <section className="dashboard-panel"><div className="panel-title"><div><span className="eyebrow">MEMBER DIRECTORY</span><h2>People who make this happen.</h2><p className="panel-description">{canManageUsers ? "Owners can grant editor, admin or owner access to existing members." : "Member roles are visible to the association team. Only an owner can grant or change roles."}</p></div><span className="count-pill">{members.length}</span></div><div className="members-table"><div className="members-head"><span>MEMBER</span><span>ACCESS ROLE</span>{canManageUsers && <span>CHANGE ROLE</span>}</div>{members.length ? members.map((member) => <div className="member-row" key={member.id}><span className="member-name"><span className="avatar">{member.display_name.slice(0, 1).toUpperCase()}</span>{member.display_name}{member.id === profile.id && <small>YOU</small>}</span><span className={`status-pill role-${member.role}`}>{member.role}</span>{canManageUsers && <select aria-label={`Set ${member.display_name}'s role`} value={member.role} disabled={member.id === profile.id} onChange={(event) => void changeRole(member.id, event.target.value as Profile["role"])}><option value="member">Member</option><option value="editor">Editor</option><option value="admin">Admin</option><option value="owner">Owner</option></select>}</div>) : <div className="admin-empty">New accounts will appear here as members.</div>}</div>{!canManageUsers && <div className="config-hint"><Shield size={15} /><span>Owner permission is required for changing user roles. Admins and editors cannot grant themselves more access.</span></div>}</section>}
      </main>
    </div>
  </div>;
}

function StatCard({ value, label, detail }: { value: number; label: string; detail: string }) {
  return <div className="dashboard-stat"><strong>{value.toString().padStart(2, "0")}</strong><span>{label}</span><small>{detail}</small></div>;
}

export default App;
