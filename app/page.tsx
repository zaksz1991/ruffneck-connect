import Link from "next/link";

const features = [
  {
    number: "01",
    title: "Communities",
    description:
      "Find people connected by shared interests, local needs, professional goals, and practical challenges.",
  },
  {
    number: "02",
    title: "Needs & Offers",
    description:
      "Describe what you need or what you can contribute. Make opportunities easier for the right people to discover.",
  },
  {
    number: "03",
    title: "Build Together",
    description:
      "Find collaborators, combine complementary skills, and turn promising ideas into practical projects.",
  },
  {
    number: "04",
    title: "Purposeful Conversations",
    description:
      "Connect through private conversations that help people clarify needs, explore opportunities, and agree on next steps.",
  },
  {
    number: "05",
    title: "Outcomes & Proof",
    description:
      "Record completed work, document contributions, and make progress more visible to the people involved.",
  },
  {
    number: "06",
    title: "Discover Opportunities",
    description:
      "Explore relevant people, communities, and opportunities instead of relying entirely on chance encounters.",
  },
];

const steps = [
  {
    number: "01",
    title: "Join a community",
    description:
      "Find a community aligned with your location, interests, work, or goals.",
  },
  {
    number: "02",
    title: "State your intention",
    description:
      "Post a need, offer something useful, or invite others to build with you.",
  },
  {
    number: "03",
    title: "Connect and act",
    description:
      "Explore relevant opportunities, start conversations, and work towards a concrete outcome.",
  },
];

export default function LandingPage() {
  return (
    <>
      <main>
        {/* HERO */}
        <section className="hero">
          <div className="container">
            <p className="eyebrow">
              COMMUNITY · COLLABORATION · ACTION
            </p>

            <h1>
              Good connections should lead to{" "}
              <span style={{ color: "#00b4d8" }}>
                real outcomes.
              </span>
            </h1>

            <p>
              RuffNeck Connect helps people discover communities,
              express what they need, offer what they can contribute,
              and find collaborators to turn ideas into action.
            </p>

            <div className="hero-actions">
              <Link href="/login" className="button">
                Join RuffNeck Connect
              </Link>

              <a
                href="#how-it-works"
                className="button button-secondary"
              >
                See how it works
              </a>
            </div>

            <div
              className="row"
              style={{ marginTop: 36, gap: 10 }}
              aria-label="Platform principles"
            >
              <span className="badge">Purpose-driven</span>
              <span className="badge">
                Community-powered
              </span>
              <span className="badge">
                Outcome-focused
              </span>
            </div>
          </div>
        </section>

        {/* NEED · OFFER · BUILD */}
        <section className="page-section">
          <div className="container">
            <div className="grid grid-3">
              <article className="feature-card">
                <div className="feature-icon">N</div>

                <h3>What do you need?</h3>

                <p>
                  Make a clear request so people with relevant
                  knowledge, resources, or experience can find you.
                </p>
              </article>

              <article className="feature-card">
                <div className="feature-icon">O</div>

                <h3>What can you offer?</h3>

                <p>
                  Share your skills, resources, knowledge, or time
                  where they can make a practical difference.
                </p>
              </article>

              <article className="feature-card">
                <div className="feature-icon">B</div>

                <h3>What can you build?</h3>

                <p>
                  Bring people together around a shared idea, a
                  specific challenge, or a project worth pursuing.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section id="features" className="page-section">
          <div className="container">
            <div className="page-heading">
              <p className="eyebrow">
                ONE NETWORK, PRACTICAL POSSIBILITIES
              </p>

              <h2>More than another social feed.</h2>

              <p>
                Connect around intentions, meaningful conversations,
                and progress you can demonstrate.
              </p>
            </div>

            <div className="grid grid-3">
              {features.map((feature) => (
                <article
                  className="feature-card"
                  key={feature.number}
                >
                  <div className="feature-icon">
                    {feature.number}
                  </div>

                  <h3>{feature.title}</h3>

                  <p>{feature.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section
          id="how-it-works"
          className="page-section"
          style={{ background: "#ffffff" }}
        >
          <div className="container">
            <div className="page-heading">
              <p className="eyebrow">
                FROM INTENTION TO ACTION
              </p>

              <h2>
                A clearer way to make connections count.
              </h2>

              <p>
                The aim is not simply to meet more people. It is to
                make useful connections and move towards something
                concrete.
              </p>
            </div>

            <div className="grid grid-3">
              {steps.map((step) => (
                <article className="card" key={step.number}>
                  <p className="eyebrow">
                    STEP {step.number}
                  </p>

                  <h3>{step.title}</h3>

                  <p className="muted">
                    {step.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* FINAL CALL TO ACTION */}
        <section className="page-section">
          <div className="container">
            <div
              className="card landing-cta"
              style={{
                padding: "clamp(28px, 6vw, 64px)",
                background: "#0b1e3a",
                color: "#ffffff",
                textAlign: "center",
              }}
            >
              <p className="eyebrow">
                YOUR NEXT CONNECTION CAN MATTER
              </p>

              <h2
                style={{
                  color: "#ffffff",
                  fontSize: "clamp(28px, 4vw, 42px)",
                }}
              >
                Bring a need. Share an offer. Build something useful.
              </h2>

              <p
                style={{
                  maxWidth: 650,
                  margin: "0 auto 24px",
                  color: "#d5e4f4",
                }}
              >
                Start with what you want to accomplish and find
                people who may be able to help you move forward.
              </p>

              <Link href="/login" className="button">
                Get started
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="site-footer">
        <div
          className="container row"
          style={{ justifyContent: "space-between" }}
        >
          <span>
            © {new Date().getFullYear()} RuffNeck Connect
          </span>

          <span>
            Built for meaningful connections and practical action.
          </span>
        </div>
      </footer>
    </>
  );
}