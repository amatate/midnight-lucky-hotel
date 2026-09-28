import type { RoomProgress } from "@/content/hotel";
import type { RoomObjective } from "@/core/types";

const amount = (value: number): string => `¥${value}`;

export function roomObjectiveLabel(objective: RoomObjective): string {
  return objective.kind === "best-spin" ? "单转最高" : objective.kind === "scoring-spins" ? "达标转数" : "本段奖金";
}

export function roomGoalCopy(objective: RoomObjective, target: number, format = amount): string {
  if (objective.kind === "best-spin") return `单转奖金达到 ${format(target)}`;
  if (objective.kind === "scoring-spins") return `至少 ${objective.count} 转各得 ${format(target)}`;
  return `本段奖金合计 ${format(target)}`;
}

export function roomProgressCopy(progress: RoomProgress, format = amount): string {
  if (progress.rounds !== undefined) return `本房累计奖金 ${format(progress.value)} / ${format(progress.target)}`;
  if (progress.objective.kind === "scoring-spins") return `达标转数 ${progress.value} / ${progress.required}（每转 ≥ ${format(progress.target)}）`;
  return `${roomObjectiveLabel(progress.objective)} ${format(progress.value)} / ${format(progress.target)}`;
}
