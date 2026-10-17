import Image from "next/image";
import Link from "next/link";

const features = [
  { number: "01", title: "Communities", description: "Find people connected by shared interests, local needs, professional goals, and practical challenges.", image: "/flyers/02-communities-find-your-people.png", alt: "Find your people through communities" },
  { number: "02", title: "Needs & Offers", description: "Describe what you need or what you can contribute. Make opportunities easier for the right people to discover.", image: "/flyers/03-needs-and-offers.png", alt: "Share needs and offers" },
  { number: "03", title: "Build Together", description: "Find collaborators, combine complementary skills, and turn promising ideas into practical projects.", image: "/flyers/04-build-together.png", alt: "People building together" },
  { number: "04", title: "Purposeful Conversations", description: "Connect through private conversations that help people clarify needs, explore opportunities, and agree on next steps.", image: "/flyers/05-purposeful-conversations.png", alt: "Purposeful conversations" },
  { number: "05", title: "Outcomes & Proof", description: "Record completed work, document contributions, and make progress more visible to the people involved.", image: "/flyers/06-outcomes-and-proof.png", alt: "Outcomes and proof of progress" },
  { number: "06", title: "Discover Opportunities", description: "Explore relevant people, communities, and opportunities instead of relying entirely on chance encounters.", image: "/flyers/02-communities-find-your-people.png", alt: "Discover relevant communities and opportunities" },
];

const steps = [
  { number: "01", title: "Join a community", description: "Find a community aligned with your location, interests, work, or goals." },
  { number: "02", title: "State your intention", description: "Post a need, offer something useful, or invite others to build with you." },
  { number: "03", title: "Connect and act", description: "Explore relevant opportunities, start conversations, and work towards a concrete outcome." },
];

const flyerStyle = { width: "100%", height: "auto", display: "block" as const, borderRadius: 18 };

export default function LandingPage() {
  return (
    <>
      <main>
        <section className="hero" style={{ overflow: "hidden" }}>
          <div className="container" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 36, alignItems: "center", paddingTop: 36, paddingBottom: 36 }}>
            <div>
              <p className="eyebrow">COMMUNITY · COLLABORATION · ACTION</p>
              <h1>Good connections should lead to <span style={{ color: "#00b4d8" }}>real outcomes.</span></h1>
              <p>RuffNeck Connect helps people discover communities, express what they need, offer what they can contribute, and find collaborators to turn ideas into action.</p>
              <div className="hero-actions">
                <Link href="/login" className="button">Join RuffNeck Connect</Link>
                <a href="#how-it-works" className="button button-secondary">See how it works</a>
              </div>
              <div className="row" style={{ marginTop: 28, gap: 10 }} aria-label="Platform principles">
                <span className="badge">Purpose-driven</span><span className="badge">Community-powered</span><span className="badge">Outcome-focused</span>
              </div>
            </div>
            <div style={{ maxWidth: 520, width: "100%", justifySelf: "center" }}>
              <Image src="/flyers/01-main-hero-good-connections.png" alt="RuffNeck Connect: good connections, real outcomes" width={1024} height={1024} priority sizes="(max-width: 700px) 100vw, 45vw" style={flyerStyle} />
            </div>
          </div>
        </section>

        <section className="page-section">
          <div className="container">
            <div className="grid grid-3">
              {[
                { letter: "N", title: "What do you need?", text: "Make a clear request so people with relevant knowledge, resources, or experience can find you.", image: "/flyers/03-needs-and-offers.png" },
                { letter: "O", title: "What can you offer?", text: "Share your skills, resources, knowledge, or time where they can make a practical difference.", image: "/flyers/03-needs-and-offers.png" },
                { letter: "B", title: "What can you build?", text: "Bring people together around a shared idea, a specific challenge, or a project worth pursuing.", image: "/flyers/04-build-together.png" },
              ].map((item) => (
                <article className="feature-card" key={item.letter} style={{ overflow: "hidden", padding: 0 }}>
                  <Image src={item.image} alt="" width={1024} height={1024} sizes="(max-width: 700px) 100vw, 33vw" style={{ width: "100%", height: "auto", display: "block" }} />
                  <div style={{ padding: 22 }}><div className="feature-icon">{item.letter}</div><h3>{item.title}</h3><p>{item.text}</p></div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="features" className="page-section">
          <div className="container">
            <div className="page-heading">
              <p className="eyebrow">ONE NETWORK, PRACTICAL POSSIBILITIES</p>
              <h2>More than another social feed.</h2>
              <p>Connect around intentions, meaningful conversations, and progress you can demonstrate.</p>
            </div>
            <div className="grid grid-3">
              {features.map((feature) => (
                <article className="feature-card" key={feature.number} style={{ overflow: "hidden", padding: 0 }}>
                  <Image src={feature.image} alt={feature.alt} width={1024} height={1024} sizes="(max-width: 700px) 100vw, 33vw" style={{ width: "100%", height: "auto", display: "block" }} />
                  <div style={{ padding: 22 }}><div className="feature-icon">{feature.number}</div><h3>{feature.title}</h3><p>{feature.description}</p></div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="page-section" style={{ background: "#ffffff" }}>
          <div className="container">
            <div className="page-heading"><p className="eyebrow">FROM INTENTION TO ACTION</p><h2>A clearer way to make connections count.</h2><p>The aim is not simply to meet more people. It is to make useful connections and move towards something concrete.</p></div>
            <div style={{ maxWidth: 920, margin: "0 auto 28px" }}>
              <Image src="/flyers/07-how-it-works.png" alt="How RuffNeck Connect works" width={1024} height={1024} sizes="(max-width: 700px) 100vw, 80vw" style={flyerStyle} />
            </div>
            <div className="grid grid-3">
              {steps.map((step) => <article className="card" key={step.number}><p className="eyebrow">STEP {step.number}</p><h3>{step.title}</h3><p className="muted">{step.description}</p></article>)}
            </div>
          </div>
        </section>

        <section className="page-section">
          <div className="container">
            <div className="card landing-cta" style={{ padding: "clamp(22px, 4vw, 44px)", background: "#0b1e3a", color: "#ffffff", textAlign: "center", overflow: "hidden" }}>
              <div style={{ maxWidth: 460, margin: "0 auto 24px" }}><Image src="/flyers/08-final-call-to-action.png" alt="Bring a need. Share an offer. Build something useful." width={1024} height={1024} sizes="(max-width: 700px) 90vw, 420px" style={flyerStyle} /></div>
              <p className="eyebrow">YOUR NEXT CONNECTION CAN MATTER</p>
              <h2 style={{ color: "#ffffff", fontSize: "clamp(28px, 4vw, 42px)" }}>Bring a need. Share an offer. Build something useful.</h2>
              <p style={{ maxWidth: 650, margin: "0 auto 24px", color: "#d5e4f4" }}>Start with what you want to accomplish and find people who may be able to help you move forward.</p>
              <Link href="/login" className="button">Get started</Link>
            </div>
          </div>
        </section>
      </main>
      <footer className="site-footer"><div className="container row" style={{ justifyContent: "space-between" }}><span>© {new Date().getFullYear()} RuffNeck Connect</span><span>Built for meaningful connections and practical action.</span></div></footer>
    </>
  );
}
