import Link from '@docusaurus/Link';
import Translate from '@docusaurus/Translate';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import {
  ArrowsPointingInIcon,
  BeakerIcon,
  BoltIcon,
  CubeTransparentIcon,
  GlobeAltIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import Layout from '@theme/Layout';
import MDXContent from '@theme/MDXContent';
import type { ReactNode } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import HeroCode from './_hero-code.mdx';

type FeatureItem = {
  id: string;
  title: ReactNode;
  description: ReactNode;
  Icon: typeof GlobeAltIcon;
};

const stackblitzUrl =
  'https://stackblitz.com/fork/github/zeltjs/zelt/tree/main/examples/stackblitz-node?startScript=dev&title=ZeltJS%20Quickstart';

const features: FeatureItem[] = [
  {
    id: 'application-structure',
    title: (
      <Translate id="homepage.features.applicationStructure.title">
        Application structure included
      </Translate>
    ),
    description: (
      <Translate id="homepage.features.applicationStructure.description">
        DI, configuration, lifecycle, validation, and testing fit into one application model.
      </Translate>
    ),
    Icon: CubeTransparentIcon,
  },
  {
    id: 'runtime-portability',
    title: (
      <Translate id="homepage.features.runtimePortability.title">One core, many runtimes</Translate>
    ),
    description: (
      <Translate id="homepage.features.runtimePortability.description">
        Keep application behavior stable while small entries select Node, Bun, Workers, or Lambda.
      </Translate>
    ),
    Icon: GlobeAltIcon,
  },
  {
    id: 'production-like-tests',
    title: (
      <Translate id="homepage.features.productionLikeTests.title">
        Tests are another runtime
      </Translate>
    ),
    description: (
      <Translate id="homepage.features.productionLikeTests.description">
        Run the same app composition and DI lifecycle in-process with the test adapter.
      </Translate>
    ),
    Icon: BeakerIcon,
  },
  {
    id: 'cold-start',
    title: <Translate id="homepage.features.coldStart.title">Cold-start conscious</Translate>,
    description: (
      <Translate id="homepage.features.coldStart.description">
        Startup is designed for serverless and edge workloads, with public benchmarks.
      </Translate>
    ),
    Icon: BoltIcon,
  },
  {
    id: 'web-standard',
    title: <Translate id="homepage.features.webStandard.title">Web-standard HTTP</Translate>,
    description: (
      <Translate id="homepage.features.webStandard.description">
        Use Request, Response, and Fetch APIs instead of a custom HTTP object model.
      </Translate>
    ),
    Icon: SparklesIcon,
  },
  {
    id: 'derived-contracts',
    title: <Translate id="homepage.features.derivedContracts.title">Derived contracts</Translate>,
    description: (
      <Translate id="homepage.features.derivedContracts.description">
        Optional plugins derive OpenAPI, GraphQL runtime data, and typed clients from the app.
      </Translate>
    ),
    Icon: ArrowsPointingInIcon,
  },
];

function HeroSection() {
  const { siteConfig } = useDocusaurusContext();

  return (
    <section className="hero">
      <div className="hero__container">
        <p className="hero__eyebrow">
          <Translate id="homepage.hero.eyebrow">For TypeScript backend teams</Translate>
        </p>
        <h1 className="hero__title">{siteConfig.title}</h1>
        <p className="hero__tagline">
          <Translate id="homepage.hero.tagline">
            Build your application core once. Run it where it belongs.
          </Translate>
        </p>
        <p className="hero__description">
          <Translate id="homepage.hero.description">
            ZeltJS brings dependency injection, lifecycle, and a consistent application structure to
            Web Standard APIs. Keep the same core across Node.js, Bun, Cloudflare Workers, AWS
            Lambda, and in-process tests.
          </Translate>
        </p>
        <div className="hero__buttons">
          <Link className="hero__button hero__button--primary" to={stackblitzUrl}>
            <Translate id="homepage.hero.tryStackblitz">Try in StackBlitz</Translate>
          </Link>
          <Link className="hero__button hero__button--secondary" to="/docs/getting-started/node">
            <Translate id="homepage.hero.startLocally">Start locally</Translate>
          </Link>
          <Link
            className="hero__button hero__button--secondary"
            to="https://github.com/zeltjs/zelt"
          >
            <Translate id="homepage.hero.github">Star on GitHub</Translate>
          </Link>
        </div>
        <p className="hero__status">
          <Translate id="homepage.hero.status">
            Pre-alpha · Explore the design, try the APIs, and tell us what should change.
          </Translate>
        </p>
      </div>
    </section>
  );
}

function CodeShowcase() {
  return (
    <section className="code-showcase">
      <div className="code-showcase__container">
        <h2 className="code-showcase__title">
          <Translate id="homepage.code.title">Application code stays application code</Translate>
        </h2>
        <p className="code-showcase__description">
          <Translate id="homepage.code.description">
            Define behavior without startup logic. Choose a runtime in a small entry file.
          </Translate>
        </p>
        {/* MDXContent supplies the MDXComponents mapping (twoslashblock → TwoslashBlock);
            rendering the MDX partial bare leaves an unrendered <twoslashblock> element */}
        <MDXContent>
          <HeroCode />
        </MDXContent>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section className="features">
      <div className="features__container">
        <h2 className="features__title">
          <Translate id="homepage.features.title">A framework beyond routing</Translate>
        </h2>
        <div className="features__grid">
          {features.map((feature) => (
            <div key={feature.id} className="feature-card">
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

const benchmarkData = [
  { name: 'Fastify', value: 44033, color: '#6b7280' },
  { name: 'Zelt', value: 37331, color: '#ea580c' },
  { name: 'Hono', value: 37262, color: '#6b7280' },
  { name: 'AdonisJS', value: 33548, color: '#6b7280' },
  { name: 'NestJS', value: 23597, color: '#6b7280' },
];

const coldStartData = [
  { name: 'Hono', value: 37, color: '#6b7280' },
  { name: 'Zelt', value: 68, color: '#ea580c' },
  { name: 'Fastify', value: 101, color: '#6b7280' },
  { name: 'AdonisJS', value: 149, color: '#6b7280' },
  { name: 'NestJS', value: 268, color: '#6b7280' },
];

const benchmarkJson = JSON.stringify({
  requestsPerSecond: {
    description: 'Higher is better',
    unit: 'req/s',
    data: benchmarkData.map(({ name, value }) => ({ name, value })),
  },
  coldStart: {
    description: 'Lower is better',
    unit: 'ms',
    data: coldStartData.map(({ name, value }) => ({ name, value })),
  },
}).replaceAll('<', '\\u003c');

function BenchmarkSection() {
  return (
    <section className="benchmark">
      <script
        id="zelt-benchmark-data"
        type="application/json"
        dangerouslySetInnerHTML={{ __html: benchmarkJson }}
      />
      <div className="benchmark__container">
        <h2 className="benchmark__title">
          <Translate id="homepage.benchmark.title">Performance without ignoring startup</Translate>
        </h2>
        <p className="benchmark__subtitle">
          <Translate id="homepage.benchmark.description">
            A benchmark snapshot. See the linked repository for hardware, versions, and methodology.
          </Translate>
        </p>
        <div className="benchmark__grid">
          <div className="benchmark__card">
            <h3 className="benchmark__card-title">Requests/sec</h3>
            <p className="benchmark__card-description">Higher is better</p>
            <div className="benchmark__chart">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={benchmarkData} layout="vertical" margin={{ left: 0, right: 20 }}>
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={70}
                    tick={{ fontSize: 12, fill: 'var(--ifm-font-color-base)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value: number) => [value.toLocaleString(), 'req/s']}
                    contentStyle={{
                      backgroundColor: 'var(--ifm-background-surface-color)',
                      border: '1px solid var(--ifm-color-emphasis-200)',
                      borderRadius: '0.375rem',
                    }}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {benchmarkData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="benchmark__card">
            <h3 className="benchmark__card-title">Cold Start (ms)</h3>
            <p className="benchmark__card-description">Lower is better</p>
            <div className="benchmark__chart">
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={coldStartData} layout="vertical" margin={{ left: 0, right: 20 }}>
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={70}
                    tick={{ fontSize: 12, fill: 'var(--ifm-font-color-base)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    formatter={(value: number) => [`${value} ms`, 'listen']}
                    contentStyle={{
                      backgroundColor: 'var(--ifm-background-surface-color)',
                      border: '1px solid var(--ifm-color-emphasis-200)',
                      borderRadius: '0.375rem',
                    }}
                  />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                    {coldStartData.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
        <p className="benchmark__footer">
          <Link to="https://github.com/zeltjs/benchmarks">
            <Translate id="homepage.benchmark.details">
              View methodology and full results →
            </Translate>
          </Link>
        </p>
      </div>
    </section>
  );
}

function InstallSection() {
  return (
    <section className="install">
      <div className="install__container">
        <h2 className="install__title">
          <Translate id="homepage.install.title">Try it before you choose it</Translate>
        </h2>
        <p className="install__description">
          <Translate id="homepage.install.description">
            Open a working app in your browser, or install the core and one runtime adapter locally.
          </Translate>
        </p>
        <div className="install__commands">
          <code className="install__command">npm install @zeltjs/core @zeltjs/adapter-node</code>
        </div>
        <div className="install__links">
          <Link className="install__link" to={stackblitzUrl}>
            <Translate id="homepage.install.stackblitz">Run in StackBlitz →</Translate>
          </Link>
          <Link className="install__link" to="/docs">
            <Translate id="homepage.install.docs">Understand ZeltJS →</Translate>
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function Home(): React.ReactNode {
  const { siteConfig } = useDocusaurusContext();

  return (
    <Layout title={siteConfig.title} description={siteConfig.tagline}>
      <main className="landing">
        <HeroSection />
        <CodeShowcase />
        <FeaturesSection />
        <BenchmarkSection />
        <InstallSection />
      </main>
    </Layout>
  );
}
