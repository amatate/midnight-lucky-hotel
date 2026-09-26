import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Reading help is presentation-only: pause automatic commands, never mutate the run. */
export const HelpPauseContext = createContext<(open: boolean) => void>(() => {});

export function HelpWindow({ title, children, onClose, interactive = false }: {
  readonly title: string; readonly children: ReactNode; readonly onClose: () => void;
  readonly interactive?: boolean;
}): React.JSX.Element {
  const id = useId();
  const panel = useRef<HTMLElement>(null);
  const onOpenChange = useContext(HelpPauseContext);
  useEffect(() => {
    const previousFocus = document.activeElement;
    const root = document.getElementById("root");
    const previousInert = root?.inert ?? false;
    const previousOverflow = document.body.style.overflow;
    const previousDialogs = [...document.querySelectorAll<HTMLElement>(".help-window")]
      .filter((dialog) => dialog !== panel.current).map((dialog) => ({ dialog, inert: dialog.inert }));
    previousDialogs.forEach(({ dialog }) => { dialog.inert = true; });
    if (root) root.inert = true;
    document.body.style.overflow = "hidden";
    onOpenChange(true);
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    return () => {
      if (root) root.inert = previousInert;
      document.body.style.overflow = previousOverflow;
      previousDialogs.forEach(({ dialog, inert }) => { dialog.inert = inert; });
      onOpenChange(false);
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [onOpenChange]);
  return createPortal(
    <div className="help-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="help-window" role="dialog" aria-modal="true" aria-labelledby={id} ref={panel}
        onKeyDown={(event) => {
          if (event.key === "Escape") { event.stopPropagation(); onClose(); }
          if (event.key !== "Tab") return;
          const controls = [...(panel.current?.querySelectorAll<HTMLElement>("button, input, select, summary, a[href], [tabindex='0']") ?? [])]
            .filter((node) => !node.hasAttribute("disabled") && !node.closest("details:not([open]) > :not(summary)"));
          const first = controls[0]; const last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }}>
        <header className="help-heading"><div><p className="eyebrow">{interactive ? "酒店控制台" : "酒店便笺 · 只读说明"}</p><h2 id={id}>{title}</h2></div>
          <button type="button" className="help-close" onClick={onClose} aria-label="关闭说明">×</button></header>
        <div className="help-content">{children}</div>
        <p className="help-footnote">{interactive ? "打开不收费；操作的费用以按钮和说明为准。" : "查看不消耗资源。"}自动停轮与结算暂停，关闭后继续。</p>
      </section>
    </div>, document.body
  );
}

export function HelpButton({ title, children, trigger, className, label, interactive = false }: {
  readonly title: string; readonly children: ReactNode; readonly trigger?: ReactNode; readonly className?: string; readonly label?: string;
  readonly interactive?: boolean;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return <>
    <button type="button" className={className ?? "help-trigger"} aria-label={label ?? (trigger === undefined ? "了解" + title : undefined)}
      aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)}>{trigger ?? "?"}</button>
    {open && <HelpWindow title={title} onClose={close} interactive={interactive}>{children}</HelpWindow>}
  </>;
}

export function HelpFacts({ cost, effect, limit, current }: {
  readonly cost: string; readonly effect: string; readonly limit: string; readonly current?: string;
}): React.JSX.Element {
  return <dl className="help-facts"><div><dt>消耗</dt><dd>{cost}</dd></div><div><dt>效果</dt><dd>{effect}</dd></div>
    <div><dt>限制与代价</dt><dd>{limit}</dd></div>{current && <div><dt>此刻</dt><dd>{current}</dd></div>}</dl>;
}
