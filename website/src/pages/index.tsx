import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import CodeBlock from '@theme/CodeBlock';
import Layout from '@theme/Layout';

const features = [
  {
    title: 'Type-Safe by Default',
    description:
      'End-to-end type safety from routes to handlers. Catch errors at compile time, not runtime.',
    icon: '🔒',
  },
  {
    title: 'Zero Config',
    description: 'Start building immediately. Sensible defaults that work out of the box.',
    icon: '⚡',
  },
  {
    title: 'Lightweight',
    description: 'Minimal footprint with no heavy dependencies. Fast startup and low memory usage.',
    icon: '🪶',
  },
  {
    title: 'Hono Compatible',
    description: 'Built on top of Hono. Use the familiar API and ecosystem you already know.',
    icon: '🔥',
  },
];

const codeExample = `import { Controller, Get, Post, body, pathParam, createApp } from '@zeltjs/core';
import * as v from 'valibot';

const UserSchema = v.object({
  name: v.string(),
  email: v.pipe(v.string(), v.email()),
});

@Controller('/users')
class UserController {
  @Get('/')
  list() {
    return { users: db.users.findMany() };
  }

  @Get('/:id')
  findOne(id = pathParam('id')) {
    return { user: db.users.find(id) };
  }

  @Post('/')
  create(data = body(UserSchema)) {
    return { user: db.users.create(data) };
  }
}

export const app = createApp({
  http: { controllers: [UserController] },
});`;

function HeroSection() {
  const { siteConfig } = useDocusaurusContext();

  return (
    <section className="hero">
      <div className="hero__container">
        <h1 className="hero__title">{siteConfig.title}</h1>
        <p className="hero__tagline">{siteConfig.tagline}</p>
        <div className="hero__buttons">
          <Link className="hero__button hero__button--primary" to="/docs">
            Get Started
          </Link>
          <Link
            className="hero__button hero__button--secondary"
            to="https://github.com/zeltjs/zelt"
          >
            GitHub
          </Link>
        </div>
      </div>
    </section>
  );
}

function CodeShowcase() {
  return (
    <section className="code-showcase">
      <div className="code-showcase__container">
        <h2 className="code-showcase__title">Simple, Intuitive API</h2>
        <CodeBlock language="typescript">{codeExample}</CodeBlock>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section className="features">
      <div className="features__container">
        <h2 className="features__title">Why Zelt?</h2>
        <div className="features__grid">
          {features.map((feature) => (
            <div key={feature.title} className="feature-card">
              <span className="feature-card__icon">{feature.icon}</span>
              <h3 className="feature-card__title">{feature.title}</h3>
              <p className="feature-card__description">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function InstallSection() {
  return (
    <section className="install">
      <div className="install__container">
        <h2 className="install__title">Get Started in Seconds</h2>
        <div className="install__commands">
          <code className="install__command">npm install @zeltjs/core</code>
        </div>
        <Link className="install__link" to="/docs">
          Read the Documentation →
        </Link>
      </div>
    </section>
  );
}

export default function Home(): JSX.Element {
  const { siteConfig } = useDocusaurusContext();

  return (
    <Layout title={siteConfig.title} description={siteConfig.tagline}>
      <main className="landing">
        <HeroSection />
        <CodeShowcase />
        <FeaturesSection />
        <InstallSection />
      </main>
    </Layout>
  );
}
