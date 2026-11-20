import type { QortalBridge } from '../qortal/adapter';
import { escapeHtml } from './html';

export function qdnAttributes(service: string, name: string, identifier: string): string {
  return `data-qdn-service="${escapeHtml(service)}" data-qdn-name="${escapeHtml(name)}" data-qdn-identifier="${escapeHtml(identifier)}"`;
}

/** The host knows the active node and raw resource URL; never guess a device filename. */
export function mountQdnMedia(root: HTMLElement, bridge: QortalBridge | null): () => void {
  let stopped = false;
  const seen = new WeakSet<Element>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const cleanups: (() => void)[] = [];
  const scan = (): void => {
    for (const media of root.querySelectorAll<HTMLImageElement | HTMLVideoElement>('img[data-qdn-identifier], video[data-qdn-identifier]')) {
      if (seen.has(media)) continue;
      seen.add(media);
      let attempts = 0;
      let retryPending = false;
      const ref = { service: media.dataset.qdnService, name: media.dataset.qdnName, identifier: media.dataset.qdnIdentifier };
      const resolve = async (): Promise<void> => {
        if (stopped || !media.isConnected) return;
        attempts += 1;
        try {
          if (bridge) {
            if (attempts > 1) await bridge.request({ action: 'GET_QDN_RESOURCE_STATUS', ...ref, build: true });
            const url = await bridge.request({ action: 'GET_QDN_RESOURCE_URL', ...ref });
            if (stopped || !media.isConnected) return;
            if (typeof url === 'string' && /^(?:https?:\/\/|\/arbitrary\/)/i.test(url)) {
              media.src = url;
              if (media instanceof HTMLVideoElement) {
                const download = media.querySelector<HTMLAnchorElement>('a');
                if (download) download.href = url;
                media.load();
              }
            } else retry();
          } else if (attempts > 1) {
            media.setAttribute('src', media.src);
          }
        } catch {
          // Retain the absolute raw URL fallback when the host cannot resolve yet.
          retry();
        }
      };
      const retry = (): void => {
        if (attempts >= 10 || stopped || retryPending) return;
        retryPending = true;
        const timer = setTimeout(() => { retryPending = false; timers.delete(timer); void resolve(); }, 3000);
        timers.add(timer);
      };
      media.addEventListener('error', retry);
      cleanups.push(() => media.removeEventListener('error', retry));
      void resolve();
    }
  };
  const observer = new MutationObserver(scan);
  observer.observe(root, { childList: true, subtree: true });
  scan();
  return () => { stopped = true; observer.disconnect(); timers.forEach(clearTimeout); cleanups.forEach((fn) => fn()); };
}
