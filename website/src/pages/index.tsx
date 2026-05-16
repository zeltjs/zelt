import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import {
  ArrowsPointingInIcon,
  BeakerIcon,
  BoltIcon,
  CubeTransparentIcon,
  GlobeAltIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import CodeBlock from '@theme/CodeBlock';
import Layout from '@theme/Layout';
import type { ComponentType, SVGProps } from 'react';

type FeatureItem = {
  title: string;
  description: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
};

const features: FeatureItem[] = [
  {
    title: 'Run Anywhere',
    description: 'Node, Bun, Workers, Lambda — portable across runtimes.',
    Icon: GlobeAltIcon,
  },
  {
    title: 'DI Built-in',
    description: 'First-class dependency injection, type-safe.',
    Icon: CubeTransparentIcon,
  },
  {
    title: 'Fast Startup',
    description: 'Minimal wake-up time, serverless-ready.',
    Icon: BoltIcon,
  },
  {
    title: 'Future-proof Decorators',
    description: 'TC39 & reflect-metadata dual support.',
    Icon: SparklesIcon,
  },
  {
    title: 'Test-friendly',
    description: 'DI-based testing, easy mock injection, Testcontainers integration.',
    Icon: BeakerIcon,
  },
  {
    title: 'Minimal Size',
    description: 'Tree-shakable, loads only what you need — no unused dependencies.',
    Icon: ArrowsPointingInIcon,
  },
];

const codeExample = `import { Controller, Get, Post, validated, pathParam, createApp } from '@zeltjs/core';
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
  create(data = validated(UserSchema)) {
    return { user: db.users.create(data) };
  }
}

const app = createApp({
  http: { controllers: [UserController] },
});

// Node.js
const node = await onNode(app);
node.listen(3000);

// Cloudflare Workers
const workers = await onCloudflareWorkers(app);
export default { fetch: workers.fetch };

// Lambda
const lambda = await onLambda(app);
export const handler = lambda.handler;`;

function HeroSection() {
  const { siteConfig } = useDocusaurusContext();

  return (
    <section className="hero">
      <div className="hero__container">
        <h1 className="hero__title">{siteConfig.title}</h1>
        <p className="hero__tagline">{siteConfig.tagline}</p>
        <div className="hero__buttons">
          <Link className="hero__button hero__button--primary" to="/docs">
            Documentation
          </Link>
          <Link
            className="hero__button hero__button--secondary"
            to="https://github.com/zeltjs/zelt"
          >
            Star on GitHub
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
              <feature.Icon className="feature-card__icon" />
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
