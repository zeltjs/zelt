import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useFloating,
} from '@floating-ui/react';
import { useEffect, useState, type ReactNode } from 'react';

type PopupData = {
  id: string;
  trigger: HTMLElement;
  content: HTMLElement;
};

const TwoslashPopup = ({ trigger, content }: { trigger: HTMLElement; content: HTMLElement }) => {
  const [isOpen, setIsOpen] = useState(false);

  const { refs, floatingStyles } = useFloating({
    open: isOpen,
    placement: 'top-start',
    middleware: [offset(4), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  });

  useEffect(() => {
    refs.setReference(trigger);

    const handleMouseEnter = () => setIsOpen(true);
    const handleMouseLeave = () => setIsOpen(false);

    trigger.addEventListener('mouseenter', handleMouseEnter);
    trigger.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      trigger.removeEventListener('mouseenter', handleMouseEnter);
      trigger.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [trigger, refs]);

  if (!isOpen) return null;

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={{
          ...floatingStyles,
          zIndex: 9999,
        }}
        dangerouslySetInnerHTML={{ __html: content.innerHTML }}
        className="twoslash-floating-popup"
      />
    </FloatingPortal>
  );
};

export const TwoslashPortalManager = (): ReactNode => {
  const [popups, setPopups] = useState<PopupData[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const processPopups = () => {
      const hovers = document.querySelectorAll('.twoslash-hover');
      const newPopups: PopupData[] = [];

      hovers.forEach((hover, index) => {
        const container = hover.querySelector('.twoslash-popup-container');
        if (container && container instanceof HTMLElement) {
          const id = `twoslash-popup-${index}`;
          container.style.display = 'none';
          newPopups.push({
            id,
            trigger: hover as HTMLElement,
            content: container,
          });
        }
      });

      setPopups(newPopups);
    };

    const observer = new MutationObserver(() => {
      processPopups();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    processPopups();

    return () => observer.disconnect();
  }, []);

  return (
    <>
      {popups.map((popup) => (
        <TwoslashPopup key={popup.id} trigger={popup.trigger} content={popup.content} />
      ))}
    </>
  );
};

export default TwoslashPortalManager;
