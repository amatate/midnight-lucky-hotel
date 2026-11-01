import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ClassicScreen from "@/classic/ClassicScreen";
import { TUTORIAL_KEY } from "@/classic/TutorialBubble";
import { beginSpin, changeBet, createClassic, settleSpin, type ClassicState } from "@/classic/engine";
import { CLASSIC_KEY } from "@/classic/storage";
import { setLanguage } from "@/i18n/language";
import { readGuestbook } from "@/meta/guestbook";

vi.mock("@/classic/Reels", () => ({ Reels: () => <div aria-hidden="true">reels</div> }));
vi.mock("@/classic/PayoutTray", () => ({ PayoutTray: () => <div /> }));
vi.mock("@/presentation/audio", () => ({ playSfx: vi.fn(), unlockAudio: () => true, playMechanicalBed: () => () => {} }));
const saved = (): ClassicState => JSON.parse(localStorage.getItem(CLASSIC_KEY)!);
const advance = async (ms: number) => { await act(async () => { vi.advanceTimersByTime(ms); }); };
async function ready() {
  render(<ClassicScreen onHome={() => {}} />);
  await waitFor(() => expect(screen.getByRole("button", { name: /转一转/ })).toBeEnabled());
}
function startAutomatic() {
  fireEvent.click(screen.getByRole("button", { name: /选择转数/ }));
  fireEvent.click(screen.getByRole("button", { name: /开始自动/ }));
}
beforeEach(() => {
  localStorage.clear(); setLanguage("zh", false); history.replaceState({}, "", "/?mode=classic");
  localStorage.setItem(CLASSIC_KEY, JSON.stringify(createClassic(8)));
  localStorage.setItem("midnight-lucky-hotel.reduce-flash", "1");
  localStorage.setItem("hotel-sentinel", "untouched");
  HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  HTMLDialogElement.prototype.close = function () { this.open = false; };
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); setLanguage("zh", false); history.replaceState({}, "", "/"); });

it.each(["loss", "break-even", "profit"])("teaches a genuine %s without forcing a win or automatically spending credits", async kind => {
  const seed = Array.from({ length: 100 }, (_, i) => i).find(value => {
    const payout = beginSpin(createClassic(value), 0).pending!.payout;
    return kind === "loss" ? payout === 0 : kind === "break-even" ? payout === 10 : payout > 10;
  })!;
  const initial = createClassic(seed); localStorage.setItem(CLASSIC_KEY, JSON.stringify(initial));
  await ready();
  fireEvent.click(screen.getByRole("button", { name: /带我转一轮/ }));
  expect(saved()).toEqual(initial);
  expect(screen.getByRole("button", { name: /转一转/ })).toBeDisabled();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: "10" })); });
  expect(saved()).toEqual(changeBet(initial, 10));
  vi.useFakeTimers();
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /转一转/ })); });
  const reserved = saved();
  expect(reserved).toEqual(beginSpin(changeBet(initial, 10), reserved.pending!.at));
  expect(screen.queryByRole("complementary")).not.toBeInTheDocument();
  await advance(600); await advance(250);
  expect(saved()).toEqual(settleSpin(reserved));
  const award = reserved.pending!;
  expect(screen.getByRole("complementary")).toHaveTextContent(`刚才下注 10，赔付 ${award.payout}`);
  fireEvent.click(screen.getByRole("button", { name: /明白了/ }));
  fireEvent.click(screen.getByRole("button", { name: /选择自动转数/ }));
  await advance(10000);
  expect(saved().spins).toBe(1); // Tutorial opens settings, never starts automatic play.
  expect(screen.getByRole("dialog", { name: "自动游玩" })).toBeVisible();
  expect(localStorage.getItem("hotel-sentinel")).toBe("untouched");
});

it("skip and replay preserve the machine, and English guidance is available", async () => {
  await ready(); const initial = saved();
  fireEvent.click(screen.getByRole("button", { name: "跳过" }));
  expect(localStorage.getItem(TUTORIAL_KEY)).toBe("seen");
  fireEvent.click(screen.getByRole("button", { name: "设置" }));
  fireEvent.click(screen.getByRole("button", { name: /跟澪学一轮/ }));
  expect(screen.getByRole("complementary")).toHaveTextContent("教学 1/4");
  act(() => setLanguage("en", false));
  expect(screen.getByRole("complementary")).toHaveTextContent("Choose what to spend on one spin.");
  fireEvent.click(screen.getByRole("button", { name: "Skip" }));
  expect(saved()).toEqual(initial);
});

it("honors the reception lesson link without spending or falsely completing it", async () => {
  localStorage.setItem(TUTORIAL_KEY, "seen");
  history.replaceState({}, "", "/?mode=classic&welcome=lesson");
  const initial = saved(); render(<ClassicScreen onHome={() => {}} />);
  await screen.findByRole("complementary", { name: "澪的新手教学" });
  expect(screen.getByRole("complementary")).toHaveTextContent("教学 1/4");
  expect(saved()).toEqual(initial); expect(location.search).not.toContain("welcome");
  fireEvent.click(screen.getByRole("button", { name: "跳过" }));
  expect(readGuestbook().lesson).toBe(false);
});

it("opens the ledger from reception without spending credits", async () => {
  history.replaceState({}, "", "/?mode=classic&welcome=ledger");
  const initial = saved(); render(<ClassicScreen onHome={() => {}} />);
  await screen.findByRole("dialog");
  expect(readGuestbook().ledger).toBe(true);
  expect(saved()).toEqual(initial); expect(location.search).not.toContain("welcome");
});

it("stops while spinning, settles exactly once and freezes the automatic summary", async () => {
  await ready(); vi.useFakeTimers(); startAutomatic();
  await advance(500); const reserved = saved();
  expect(reserved.pending).not.toBeNull();
  expect(screen.getByRole("button", { name: "25" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "停止" }));
  expect(screen.getByRole("button", { name: "本转结清后停止" })).toBeDisabled();
  await advance(600); await advance(250); await advance(10000);
  expect(saved()).toEqual(settleSpin(reserved));
  const summary = screen.getByTestId("auto-report").textContent;
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /转一转/ })); });
  await advance(600); await advance(250);
  expect(saved().spins).toBe(2);
  expect(screen.getByTestId("auto-report").textContent).toBe(summary);
});

it("cancels a queued reservation if Stop is pressed before its lock is acquired", async () => {
  await ready(); vi.useFakeTimers();
  let release: (() => void) | undefined;
  const priorLocks = Object.getOwnPropertyDescriptor(navigator, "locks");
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request: (_name: string, action: () => unknown) => new Promise(resolve => { release = () => resolve(action()); }) } });
  startAutomatic(); await advance(500);
  fireEvent.click(screen.getByRole("button", { name: "停止" }));
  await act(async () => { release!(); });
  expect(saved()).toEqual(createClassic(8));
  expect(screen.getByTestId("auto-report")).toHaveTextContent("已结清 0 转");
  if (priorLocks) Object.defineProperty(navigator, "locks", priorLocks); else Reflect.deleteProperty(navigator, "locks");
});

it("backgrounding stops before the first wager and never resumes on return", async () => {
  await ready(); vi.useFakeTimers(); startAutomatic();
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  act(() => { document.dispatchEvent(new Event("visibilitychange")); });
  await advance(2000);
  hidden.mockReturnValue(false);
  act(() => { document.dispatchEvent(new Event("visibilitychange")); });
  await advance(2000);
  expect(saved()).toEqual(createClassic(8));
  expect(screen.getByTestId("auto-report")).toHaveTextContent("离开页面");
});

it("reload recovers a reserved spin but never resumes automatic play", async () => {
  await ready(); vi.useFakeTimers(); startAutomatic(); await advance(500);
  const reserved = saved(); cleanup(); vi.useRealTimers();
  await ready();
  expect(saved()).toEqual(settleSpin(reserved));
  expect(screen.queryByTestId("auto-report")).not.toBeInTheDocument();
  vi.useFakeTimers(); await advance(10000);
  expect(saved().spins).toBe(1);
});

it("a save failure stops automation without consuming the next wager", async () => {
  await ready(); vi.useFakeTimers(); startAutomatic();
  const write = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
  await advance(500); await advance(5000); write.mockRestore();
  expect(saved()).toEqual(createClassic(8));
  expect(screen.getByRole("alert")).toHaveTextContent("保存失败");
  expect(screen.getByTestId("auto-report")).toHaveTextContent("保存异常");
});

it("automatically completes the chosen number with the same seeded results", async () => {
  await ready(); vi.useFakeTimers();
  fireEvent.click(screen.getByRole("button", { name: /选择转数/ }));
  const dialog = screen.getByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "10" }));
  fireEvent.click(within(dialog).getByRole("checkbox"));
  fireEvent.click(within(dialog).getByRole("button", { name: /开始自动/ }));
  for (let i = 0; i < 10; i++) { await advance(3100); await advance(600); await advance(250); }
  const result = saved(); expect(result.spins).toBe(10); expect(result.pending).toBeNull();
  expect(screen.getByTestId("auto-report")).toHaveTextContent("本次转数已完成");
  let manual = createClassic(8);
  for (const entry of [...result.history].reverse()) manual = settleSpin(beginSpin(manual, entry.at));
  expect(result).toEqual(manual);
});
