import React, {type ReactNode} from 'react';
import clsx from 'clsx';
import {useWindowSize} from '@docusaurus/theme-common';
import {useDocsSidebar} from '@docusaurus/plugin-content-docs/client';
import {useDoc} from '@docusaurus/plugin-content-docs/client';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import DocItemPaginator from '@theme/DocItem/Paginator';
import DocVersionBanner from '@theme/DocVersionBanner';
import DocVersionBadge from '@theme/DocVersionBadge';
import DocItemFooter from '@theme/DocItem/Footer';
import DocItemTOCMobile from '@theme/DocItem/TOC/Mobile';
import DocItemTOCDesktop from '@theme/DocItem/TOC/Desktop';
import DocItemContent from '@theme/DocItem/Content';
import DocBreadcrumbs from '@theme/DocBreadcrumbs';
import ContentVisibility from '@theme/ContentVisibility';
import type {Props} from '@theme/DocItem/Layout';
import type {PropSidebarItem} from '@docusaurus/plugin-content-docs';

import styles from './styles.module.css';

const normalizeHref = (href: string, siteUrl: string): string => {
  if (href.startsWith('pathname:///')) {
    return `${siteUrl}${href.replace('pathname://', '')}`;
  }
  return href;
};

const normalizeSidebarItems = (
  items: PropSidebarItem[],
  siteUrl: string,
): PropSidebarItem[] =>
  items.map((item) => {
    if (item.type === 'link' && item.href) {
      return {...item, href: normalizeHref(item.href, siteUrl)};
    }
    if (item.type === 'category' && item.items) {
      return {...item, items: normalizeSidebarItems(item.items, siteUrl)};
    }
    return item;
  });

/**
 * Decide if the toc should be rendered, on mobile or desktop viewports
 */
function useDocTOC() {
  const {frontMatter, toc} = useDoc();
  const windowSize = useWindowSize();

  const hidden = frontMatter.hide_table_of_contents;
  const canRender = !hidden && toc.length > 0;

  const mobile = canRender ? <DocItemTOCMobile /> : undefined;

  const desktop =
    canRender && (windowSize === 'desktop' || windowSize === 'ssr') ? (
      <DocItemTOCDesktop />
    ) : undefined;

  return {
    hidden,
    mobile,
    desktop,
  };
}

export default function DocItemLayout({children}: Props): ReactNode {
  const docTOC = useDocTOC();
  const {metadata} = useDoc();
  const sidebar = useDocsSidebar();
  const {siteConfig} = useDocusaurusContext();
  const siteUrl = siteConfig.url;
  const normalizedItems = sidebar?.items
    ? normalizeSidebarItems(sidebar.items, siteUrl)
    : [];
  return (
    <div className="row">
      <script
        id="zelt-docs-nav"
        type="application/json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(normalizedItems),
        }}
      />
      <div className={clsx('col', !docTOC.hidden && styles.docItemCol)}>
        <ContentVisibility metadata={metadata} />
        <DocVersionBanner />
        <div className={styles.docItemContainer}>
          <article>
            <DocBreadcrumbs />
            <DocVersionBadge />
            {docTOC.mobile}
            <DocItemContent>{children}</DocItemContent>
            <DocItemFooter />
          </article>
          <DocItemPaginator />
        </div>
      </div>
      {docTOC.desktop && <div className="col col--3">{docTOC.desktop}</div>}
    </div>
  );
}
