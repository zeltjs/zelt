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
import Layout from '@theme/Layout';
import type { ComponentType, SVGProps } from 'react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import HeroCode from './_hero-code.mdx';

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
        <HeroCode />
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
});

function BenchmarkSection() {
  return (
    <section className="benchmark">
      <script id="zelt-benchmark-data" type="application/json">
        {benchmarkJson}
      </script>
      <div className="benchmark__container">
        <h2 className="benchmark__title">Benchmark</h2>
        <p className="benchmark__subtitle">
          Performance comparison with popular TypeScript frameworks
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
          <Link to="https://github.com/zeltjs/benchmarks">View full benchmark details →</Link>
        </p>
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
