import { useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import SectionHeading from '../components/SectionHeading.jsx';

// The terms of use and the privacy policy, in plain words. Each is a list of
// sections; the layout gives them a contents list (beside the text on wide
// screens) that links to each one.

const UPDATED = '6 November 2026';
const REPO_ISSUES = 'https://github.com/swarnadeep31/RiderAI/issues';

const List = ({ children }) => <ul className="list-disc space-y-2 pl-5 marker:text-ink-soft">{children}</ul>;
const Out = ({ href, children }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="link">
    {children}
  </a>
);

// How to reach us, for both pages.
function Contact() {
  return (
    <p>
      Write to us from the <Link to="/feedback" className="link">feedback page</Link> (log in first). If you can&apos;t log in, open an
      issue on <Out href={REPO_ISSUES}>GitHub</Out> saying you&apos;d like us to get in touch, without any personal details in it, and
      we&apos;ll reply there.
    </p>
  );
}

function LegalLayout({ title, intro, sections }) {
  // A link to one section (/privacy#ai) opens at it.
  const { hash } = useLocation();
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
  }, [hash]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 lg:py-16">
      <header className="max-w-3xl motion-safe:animate-rise">
        <h1 className="text-display uppercase">{title}</h1>
        <p className="mt-4 text-lead text-ink-soft">{intro}</p>
        <p className="margin-text mt-6">Last updated {UPDATED}</p>
      </header>
      <div className="mt-12 grid gap-10 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-14">
        <nav aria-label="On this page" className="lg:sticky lg:top-20 lg:self-start">
          <p className="margin-text">On this page</p>
          <ol className="mt-3 space-y-1.5 border-l-2 border-ink/15 pl-4">
            {sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className="text-ink-soft hover:text-ink">
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="max-w-[68ch] space-y-12">
          {sections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-20">
              <SectionHeading>{section.title}</SectionHeading>
              <div className="mt-4 space-y-4 leading-relaxed">{section.body}</div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}

const TERMS = [
  {
    id: 'using',
    title: 'Using TrailCast',
    body: (
      <>
        <p>
          TrailCast puts ride and trek videos from YouTube beside a map of their route. It&apos;s free. By using it, or by making an
          account, you agree to these terms and to our <Link to="/privacy" className="link">privacy policy</Link>.
        </p>
        <p>You need to be 18 or older to make an account, or have a parent&apos;s or guardian&apos;s permission.</p>
      </>
    ),
  },
  {
    id: 'account',
    title: 'Your account',
    body: (
      <List>
        <li>Give your real details, and keep your password to yourself.</li>
        <li>You&apos;re responsible for what is done with your account. If you think someone else got in, use “Log out on all devices” on your account page, and tell us.</li>
        <li>One person per account.</li>
      </List>
    ),
  },
  {
    id: 'sharing',
    title: 'What you share',
    body: (
      <>
        <p>
          The rides you add (titles, descriptions, routes, places and notes) stay yours. You let TrailCast show them to everyone, draw
          maps and stats from them, and let viewers save them as GPS files, map files and printed trip sheets.
        </p>
        <p>When you add a ride, you confirm that:</p>
        <List>
          <li>the video is yours, or it&apos;s a public video that you&apos;re crediting to its creator (TrailCast shows their channel and links to YouTube);</li>
          <li>you have the right to share the route and GPS file;</li>
          <li>nothing in it shows where someone lives, or other private details about a person.</li>
        </List>
        <p>Videos stay on YouTube. TrailCast never copies or hosts them.</p>
      </>
    ),
  },
  {
    id: 'not-allowed',
    title: 'Not allowed',
    body: (
      <List>
        <li>Anything illegal, hateful, harassing or sexual.</li>
        <li>Other people&apos;s personal details.</li>
        <li>Spam, adverts posing as rides, or routes made misleading on purpose.</li>
        <li>Pretending to be someone else.</li>
        <li>Breaking into or overloading TrailCast, copying it in bulk with programs, or getting round its limits.</li>
      </List>
    ),
  },
  {
    id: 'ai',
    title: 'Routes the AI builds',
    body: (
      <>
        <p>
          When you ask the AI to find the places in a video, TrailCast sends Google&apos;s Gemini the video&apos;s link, the video file
          you upload, or the transcript you paste, with the title and the start and end you gave.
        </p>
        <p>
          The AI makes mistakes: it can pick the wrong village with the same name, or the wrong moment. That&apos;s why you check its
          places before they&apos;re added. What you publish is your responsibility.
        </p>
      </>
    ),
  },
  {
    id: 'safety',
    title: 'Ride safe: a guide, not navigation',
    body: (
      <>
        <p>TrailCast helps you plan. Don&apos;t use it to navigate, and don&apos;t watch it while you ride.</p>
        <List>
          <li>Routes drawn between places are estimates: the real road can differ, and so can distances and heights.</li>
          <li>Fuel stations, mechanics, medical help and ATMs come from OpenStreetMap. Some are missing, closed or out of fuel.</li>
          <li>Mountain roads change with weather, snow and landslides. Some areas (in Sikkim, Ladakh and Arunachal, for example) need permits.</li>
        </List>
        <p>Check the road, the weather and the rules before you go, and follow traffic laws. TrailCast isn&apos;t responsible for what happens on your trip.</p>
      </>
    ),
  },
  {
    id: 'others',
    title: 'Other services',
    body: (
      <>
        <p>Parts of TrailCast come from other services, which have their own terms:</p>
        <List>
          <li>
            Videos play in YouTube&apos;s player, under <Out href="https://www.youtube.com/t/terms">YouTube&apos;s terms</Out>.
          </li>
          <li>“Continue with Google” is Google&apos;s sign-in.</li>
          <li>
            Map data is © <Out href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</Out>, under the Open Database
            Licence. Road routes and heights come from OpenRouteService.
          </li>
        </List>
      </>
    ),
  },
  {
    id: 'removing',
    title: 'Removing rides and accounts',
    body: (
      <>
        <p>You can delete your rides at any time. To close your account, write to us and we&apos;ll delete it.</p>
        <p>
          We may remove a ride, or close an account, that breaks these terms. We&apos;ll usually tell you why, unless the law or
          someone&apos;s safety stops us.
        </p>
      </>
    ),
  },
  {
    id: 'as-is',
    title: 'The service as it is',
    body: (
      <>
        <p>
          TrailCast is free and runs on free servers, which sleep when nobody is using them and can be slow to wake. We may change,
          pause or stop any part of it. We can&apos;t promise it will always be there or free of mistakes.
        </p>
        <p>As far as the law allows, TrailCast isn&apos;t liable for losses that come from using it, or from not being able to.</p>
      </>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to these terms',
    body: (
      <p>
        When these terms change, the date at the top changes too, and we&apos;ll mention big changes on the site. If you keep using
        TrailCast after that, you accept the new terms.
      </p>
    ),
  },
  {
    id: 'contact',
    title: 'Law and contact',
    body: (
      <>
        <p>These terms are governed by the laws of India.</p>
        <Contact />
      </>
    ),
  },
];

const PRIVACY = [
  {
    id: 'short',
    title: 'The short version',
    body: (
      <List>
        <li>We keep what your account needs, and the rides you share. Rides are public; your email and phone number are not.</li>
        <li>No adverts, no tracking across other sites, no analytics. We never sell your data.</li>
        <li>Your password is never stored, only a scrambled form of it.</li>
        <li>Some services we use see some of your data, like YouTube for the videos and Google&apos;s Gemini for the AI.</li>
        <li>You can ask us to show you, correct or delete what we have about you.</li>
      </List>
    ),
  },
  {
    id: 'what',
    title: 'What we keep about you',
    body: (
      <List>
        <li>
          <strong className="font-semibold">Your account:</strong> your name, username, and email or phone number. Your password is
          kept only as a bcrypt hash, which can&apos;t be turned back into it. With “Continue with Google”, Google tells us your name,
          email and account ID.
        </li>
        <li>
          <strong className="font-semibold">Your answers</strong> when you join: what you&apos;ll use TrailCast for, how you heard of
          it, and the rides you&apos;d like to see.
        </li>
        <li>
          <strong className="font-semibold">Your logins:</strong> an ID for each device you&apos;re logged in on, and when that
          login started, so you can log out of all of them.
        </li>
        <li>
          <strong className="font-semibold">What you send us:</strong> the rides you add, and your feedback messages.
        </li>
      </List>
    ),
  },
  {
    id: 'public',
    title: "What's public",
    body: (
      <p>
        A ride you add can be seen by anyone: its title, description, video, route, places, the creator&apos;s name shown with it, and
        any support link. Your username, email and phone number are never shown with your rides.
      </p>
    ),
  },
  {
    id: 'browser',
    title: 'Cookies and your browser',
    body: (
      <>
        <p>
          TrailCast sets one cookie, <code className="font-mono text-small">trailcast_session</code>, which keeps you logged in for up to
          30 days. Scripts on the page can&apos;t read it.
        </p>
        <p>
          It also remembers a few things in your browser&apos;s storage, which never leave your device: day or night mode, whether
          you&apos;ve seen the tour, the rides from your last visit (so they show at once), and which services you switched on on the
          map.
        </p>
        <p>There are no advertising or analytics cookies.</p>
      </>
    ),
  },
  {
    id: 'others',
    title: 'Services that see some of your data',
    body: (
      <List>
        <li>
          <strong className="font-semibold">YouTube</strong> (Google): videos play in YouTube&apos;s player, which may set its own
          cookies. See <Out href="https://policies.google.com/privacy">Google&apos;s privacy policy</Out>.
        </li>
        <li>
          <strong className="font-semibold">Google sign-in</strong>, if you use it.
        </li>
        <li>
          <strong className="font-semibold">OpenStreetMap</strong>: the map pictures load from its servers, which see your network
          address, as any website you load pictures from does.
        </li>
        <li>
          <strong className="font-semibold">Place search and routes</strong>: when you search for a place or a route is drawn, the place
          names and positions go to OpenStreetMap&apos;s search (Nominatim), OpenRouteService and Overpass, from our server. They
          don&apos;t learn who you are.
        </li>
        <li>
          <strong className="font-semibold">Google&apos;s Gemini</strong>, when you use the AI (see below).
        </li>
        <li>
          <strong className="font-semibold">Hosting</strong>: the website runs on Vercel, the server on Render, and the data is kept
          in a cloud database. They store and process it only to run TrailCast.
        </li>
      </List>
    ),
  },
  {
    id: 'ai',
    title: 'When you use the AI',
    body: (
      <>
        <p>
          TrailCast sends Gemini the video&apos;s YouTube link, or the video file you upload, or the transcript you paste, with the title
          and the start and end you gave. TrailCast uses Gemini&apos;s free tier, and on it Google may use what it&apos;s sent to
          improve its products (see{' '}
          <Out href="https://ai.google.dev/gemini-api/terms">Google&apos;s Gemini API terms</Out>). So only ask the AI about videos
          you&apos;re happy to share.
        </p>
        <p>
          An uploaded video file is deleted from TrailCast and from Gemini when the analysis ends (within two days if it stops halfway).
          What the AI found, and any transcript you pasted, is kept with the analysis, so the same video isn&apos;t paid for twice.
        </p>
      </>
    ),
  },
  {
    id: 'how-long',
    title: 'How long we keep it',
    body: (
      <List>
        <li>Your account details: until you close your account.</li>
        <li>Your rides: until you delete them, or close your account.</li>
        <li>The login cookie: 30 days, or until you log out.</li>
        <li>Your network address is used for a short time to stop too many tries at once, and isn&apos;t kept with your account.</li>
      </List>
    ),
  },
  {
    id: 'choices',
    title: 'Your choices',
    body: (
      <>
        <List>
          <li>Your account page shows your details, lets you change your answers, and logs you out on one device or all of them.</li>
          <li>You can delete any of your rides.</li>
          <li>You can ask us for a copy of what we have about you, to correct it, or to delete it with your account.</li>
        </List>
        <p>To ask, see “Contact” below. We&apos;ll check it&apos;s you, then do it as soon as we can.</p>
      </>
    ),
  },
  {
    id: 'safe',
    title: 'Keeping it safe',
    body: (
      <p>
        The site and server only talk over HTTPS. Passwords are hashed, the login cookie can&apos;t be read by scripts, and logging out
        ends the login on the server too. No system is perfectly safe, so if you find a problem, please tell us.
      </p>
    ),
  },
  {
    id: 'children',
    title: 'Children',
    body: (
      <p>
        TrailCast isn&apos;t meant for anyone under 18 without a parent&apos;s or guardian&apos;s permission. If you think a child gave
        us their details without it, tell us and we&apos;ll delete them.
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    body: <p>When this policy changes, the date at the top changes too, and we&apos;ll mention big changes on the site.</p>,
  },
  {
    id: 'contact',
    title: 'Contact',
    body: <Contact />,
  },
];

export function TermsPage() {
  return (
    <LegalLayout
      title="Terms of use"
      intro="The rules for using TrailCast and sharing rides on it, in plain words."
      sections={TERMS}
    />
  );
}

export function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy policy"
      intro="What TrailCast keeps about you, who else sees it, and what you can do about it."
      sections={PRIVACY}
    />
  );
}
