import Head from '@docusaurus/Head';
import { useLocation } from '@docusaurus/router';
import type { ReactNode } from 'react';

type RootProps = {
  children: ReactNode;
};

const Root = ({ children }: RootProps): ReactNode => {
  const location = useLocation();
  const mdUrl = `${location.pathname}.md`;

  return (
    <>
      <Head>
        <link rel="alternate" type="text/markdown" href={mdUrl} title="Markdown version" />
      </Head>
      {children}
    </>
  );
};

export default Root;
