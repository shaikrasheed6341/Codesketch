import { useState } from "react";
import { FiArrowUpRight, FiEdit2, FiLogOut, FiPlay, FiUser, FiUsers } from "react-icons/fi";
import { HiOutlineCursorArrowRays, HiOutlineSparkles } from "react-icons/hi2";
import { LuPenLine, LuShieldCheck, LuVideo } from "react-icons/lu";
import "./LandingPage.css";

type LandingPageProps = {
  onStart: () => void;
  user: { name: string; email: string } | null;
  onProfileUpdate: (name: string) => Promise<string | null>;
  onSignout: () => Promise<void>;
};

const features = [
  {
    icon: LuPenLine,
    number: "01",
    title: "Think in public",
    text: "Turn rough ideas into clear diagrams, flows, and decisions on one shared canvas.",
  },
  {
    icon: FiUsers,
    number: "02",
    title: "Move as one",
    text: "See collaborators draw, point, and shape the work together in real time.",
  },
  {
    icon: LuVideo,
    number: "03",
    title: "Talk it through",
    text: "Keep the room close with built-in video while the board stays at the center.",
  },
];

export default function LandingPage({ user, onStart, onProfileUpdate, onSignout }: LandingPageProps) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name ?? "");
  const [message, setMessage] = useState("");

  async function saveProfile() {
    const error = await onProfileUpdate(name);
    setMessage(error ?? "Profile updated");
    if (!error) setEditing(false);
  }

  return (
    <main className="landing-page">
      <nav className="landing-nav" aria-label="Main navigation">
        <a className="landing-brand" href="#top" aria-label="CodeSketch home">
          <span className="brand-mark"><span /></span>
          <span>codesketch</span>
        </a>
        <div className="landing-nav-links">
          <a href="#features">Why CodeSketch</a>
          <a href="#workflow">How it works</a>
        </div>
        <div className="landing-nav-actions">
          <button className="landing-nav-cta" type="button" onClick={onStart}>
            Open a room <FiArrowUpRight aria-hidden="true" />
          </button>
          {user && (
            <div className="profile-menu">
              <button
                className="profile-trigger"
                type="button"
                aria-expanded={profileOpen}
                aria-label={`Open profile for ${user.name}`}
                onClick={() => { setName(user.name); setProfileOpen((open) => !open); setMessage(""); }}
              >
                <FiUser aria-hidden="true" />
                <span>{user.name}</span>
              </button>
              {profileOpen && (
                <div className="profile-popover">
                  <strong>{user.email}</strong>
                  {editing ? (
                    <div className="profile-edit">
                      <label htmlFor="profile-name">Username</label>
                      <input id="profile-name" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
                      <button type="button" onClick={saveProfile}>Save</button>
                    </div>
                  ) : (
                    <button type="button" className="profile-menu-item" onClick={() => { setEditing(true); setMessage(""); }}>
                      <FiEdit2 aria-hidden="true" /> Edit profile
                    </button>
                  )}
                  {message && <small className="profile-message">{message}</small>}
                  <button type="button" className="profile-menu-item profile-menu-item--signout" onClick={onSignout}>
                    <FiLogOut aria-hidden="true" /> Sign out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </nav>

      <section className="landing-hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><span className="eyebrow-dot" /> Collaborative canvas for sharp minds</p>
          <h1>Make the<br /><em>invisible</em> visible.</h1>
          <p className="hero-lede">The fast, friendly whiteboard for teams who think better together. Sketch ideas, find the shape, and leave the room with momentum.</p>
          <div className="hero-actions">
            <button className="primary-action" type="button" onClick={onStart}>Start sketching <FiArrowUpRight aria-hidden="true" /></button>
            <a className="secondary-action" href="#workflow"><span className="play-icon"><FiPlay aria-hidden="true" /></span> See the flow</a>
          </div>
          <div className="hero-note"><span className="avatar-stack"><i>R</i><i>M</i><i>J</i></span> Built for the room, wherever the room is.</div>
        </div>

        <div className="hero-visual" aria-label="Illustration of a collaborative sketching board">
          <div className="visual-shadow" />
          <div className="sketch-board">
            <div className="board-topline"><span className="board-brand"><span className="mini-mark" /> live room</span><span className="board-status"><i /> 4 collaborators</span></div>
            <div className="board-content">
              <div className="board-label">the big idea</div>
              <div className="scribble-title">start<br />somewhere.</div>
              <div className="arrow-path"><span /><span /><span /></div>
              <div className="board-card card-a"><b>listen</b><small>What matters now?</small></div>
              <div className="board-card card-b"><b>make</b><small>Give it a shape.</small></div>
              <div className="board-card card-c"><b>move</b><small>Take the next step.</small></div>
              <div className="cursor cursor-one"><span /> Maya</div>
              <div className="cursor cursor-two"><span /> Ravi</div>
            </div>
            <div className="board-toolbar"><span /><span /><span /><span /><strong>+</strong></div>
          </div>
          <div className="floating-sticker sticker-yellow"><HiOutlineSparkles aria-hidden="true" /><span>ideas welcome</span></div>
          <div className="floating-sticker sticker-coral"><HiOutlineCursorArrowRays aria-hidden="true" /></div>
        </div>
      </section>

      <section className="trust-strip" aria-label="CodeSketch highlights">
        <span>One canvas</span><b>•</b><span>Infinite directions</span><b>•</b><span>Zero ceremony</span>
      </section>

      <section className="features-section" id="features">
        <div className="section-heading"><p className="eyebrow">Why teams stay in the flow</p><h2>Less presenting.<br /><em>More making.</em></h2></div>
        <div className="feature-grid">{features.map(({ icon: Icon, number, title, text }) => <article className="feature-card" key={number}><div className="feature-top"><Icon aria-hidden="true" /><span>{number}</span></div><h3>{title}</h3><p>{text}</p><FiArrowUpRight className="feature-arrow" aria-hidden="true" /></article>)}</div>
      </section>

      <section className="workflow-section" id="workflow">
        <div className="workflow-mark"><LuShieldCheck aria-hidden="true" /></div>
        <div><p className="eyebrow">From blank page to next move</p><h2>Bring the messy<br /><em>middle.</em></h2></div>
        <div className="workflow-copy"><p>Good work rarely arrives polished. CodeSketch gives every half-formed thought a place to land, then makes it easy for the whole team to build on it.</p><button className="text-action" type="button" onClick={onStart}>Find your next idea <FiArrowUpRight aria-hidden="true" /></button></div>
      </section>

      <footer className="landing-footer"><a className="landing-brand" href="#top"><span className="brand-mark"><span /></span><span>codesketch</span></a><span>Make room for better thinking.</span><button type="button" onClick={onStart}>Open a room <FiArrowUpRight aria-hidden="true" /></button></footer>
    </main>
  );
}
