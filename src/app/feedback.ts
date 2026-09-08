import { RULES_VERSION } from "@/persistence/archives";

export const BUILD_VERSION = typeof __BUILD_VERSION__ === "string" ? __BUILD_VERSION__ : "local";
export function feedbackText(seed: number | null): string {
  return `游戏版本：${BUILD_VERSION}\n规则版本：${RULES_VERSION}\n种子：${seed ?? "尚未开局"}\n\n发生了什么？\n\n我原本预期：\n\n复现步骤：\n\n浏览器 / 手机型号：\n\n（如需附日志，请先检查内容，再手动添加导出文件。）`;
}
export function feedbackIssueUrl(seed: number | null): string {
  const url = new URL("https://github.com/amatate/midnight-lucky-hotel/issues/new");
  url.searchParams.set("title", "[试玩反馈] ");
  url.searchParams.set("body", feedbackText(seed));
  return url.href;
}
